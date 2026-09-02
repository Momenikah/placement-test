const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const router = express.Router();
const pool = require('../db/connection');
const { analyzeAudio } = require('../services/gemini');
const { sendResultEmail } = require('../services/email');
const { appendResult } = require('../services/sheets');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB max
});

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// kie.ai's Gemini wrapper rejects webm; transcode to mp3 with ffmpeg first.
function transcodeToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-vn', '-acodec', 'libmp3lame', '-b:a', '64k', '-ac', '1',
      outputPath,
    ]);
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('error', (e) => reject(new Error('ffmpeg spawn failed: ' + e.message)));
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

function getLevel(score) {
  if (score >= 85) return 'Advanced';
  if (score >= 70) return 'Upper Intermediate';
  if (score >= 55) return 'Intermediate';
  if (score >= 40) return 'Elementary';
  return 'Beginner';
}

router.post('/submit', upload.single('audio'), async (req, res) => {
  const { registrationId, duration, mimeType } = req.body;

  if (!registrationId) {
    return res.status(400).json({ error: 'Registration ID diperlukan.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'File audio diperlukan.' });
  }

  const durationSeconds = parseInt(duration) || 0;

  try {
    const { rows: regRows } = await pool.query(
      'SELECT * FROM registrations WHERE id = $1',
      [registrationId]
    );

    if (!regRows.length) {
      return res.status(404).json({ error: 'Registrasi tidak ditemukan.' });
    }

    const registration = regRows[0];

    // Create result record immediately
    const { rows: resultRows } = await pool.query(
      `INSERT INTO test_results (registration_id, duration_seconds, status)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [registrationId, durationSeconds, 'processing']
    );

    const resultId = resultRows[0].id;

    // Reject too-short recordings before AI cost
    if (durationSeconds < 60) {
      await pool.query(
        `UPDATE test_results
         SET status = 'too_short',
             fluency_score = 0, pronunciation_score = 0,
             grammar_score = 0, vocabulary_score = 0, overall_score = 0,
             general_feedback = 'Durasi berbicara kurang dari 1 menit. Skor tidak dapat diberikan.',
             level_result = 'No Score'
         WHERE id = $1`,
        [resultId]
      );
      return res.json({ success: true, resultId, tooShort: true });
    }

    // Respond immediately so client can start polling
    res.json({ success: true, resultId, processing: true });

    // Async AI analysis (after response is sent)
    let rawFilePath = null;
    let mp3FilePath = null;
    let mp3Filename = null;
    try {
      const cleanMime = (mimeType || req.file.mimetype || 'audio/webm').split(';')[0];
      const ext = (cleanMime.split('/')[1] || 'webm').replace(/[^a-z0-9]/gi, '');
      const uuid = crypto.randomUUID();
      const rawFilename = `${uuid}.${ext}`;
      mp3Filename = `${uuid}.mp3`;
      rawFilePath = path.join(UPLOADS_DIR, rawFilename);
      mp3FilePath = path.join(UPLOADS_DIR, mp3Filename);

      fs.writeFileSync(rawFilePath, req.file.buffer);
      await transcodeToMp3(rawFilePath, mp3FilePath);
      // raw no longer needed once mp3 is produced
      fs.unlink(rawFilePath, () => {});
      rawFilePath = null;

      const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
      const audioUrl = `${baseUrl}/uploads/${mp3Filename}`;

      const analysis = await analyzeAudio(
        audioUrl,
        'audio/mpeg',
        registration.question,
        registration.education_level
      );

      const overallScore = Math.round(
        (analysis.fluency.score + analysis.pronunciation.score +
          analysis.grammar.score + analysis.vocabulary.score) / 4
      );
      const levelResult = getLevel(overallScore);

      await pool.query(
        `UPDATE test_results SET
           transcript          = $1,
           fluency_score       = $2,  pronunciation_score = $3,
           grammar_score       = $4,  vocabulary_score    = $5,
           overall_score       = $6,
           fluency_feedback    = $7,  pronunciation_feedback = $8,
           grammar_feedback    = $9,  vocabulary_feedback    = $10,
           general_feedback    = $11, level_result        = $12,
           cefr_level          = $13, raw_analysis        = $14,
           status = 'completed'
         WHERE id = $15`,
        [
          analysis.transcript,
          analysis.fluency.score,       analysis.pronunciation.score,
          analysis.grammar.score,       analysis.vocabulary.score,
          overallScore,
          analysis.fluency.feedback,    analysis.pronunciation.feedback,
          analysis.grammar.feedback,    analysis.vocabulary.feedback,
          analysis.overall_feedback,    levelResult,
          analysis.cefr_level || null,  JSON.stringify(analysis),
          resultId,
        ]
      );

      // Send email in background (don't fail the flow)
      sendResultEmail(registration, { ...analysis, overallScore, levelResult, durationSeconds })
        .catch(err => console.error('Email send error:', err.message));

      // Append to Google Sheet in background
      appendResult({ registration, analysis, overallScore, levelResult, durationSeconds, resultId })
        .catch(err => console.error('Sheet append error:', err.message));

    } catch (analysisErr) {
      console.error('AI analysis error:', analysisErr.message);
      await pool.query(
        `UPDATE test_results SET status = 'failed', error_message = $1 WHERE id = $2`,
        [analysisErr.message, resultId]
      );
    } finally {
      if (rawFilePath) fs.unlink(rawFilePath, () => {});
      if (mp3FilePath) {
        // Delete mp3 after a delay so kie.ai's fetch has time to complete
        setTimeout(() => {
          fs.unlink(mp3FilePath, (err) => {
            if (err) console.warn('Audio cleanup failed:', err.message);
          });
        }, 60_000);
      }
    }
  } catch (err) {
    console.error('Submit route error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Pengiriman gagal. Coba lagi.' });
    }
  }
});

module.exports = router;
