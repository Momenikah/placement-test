const express = require('express');
const multer = require('multer');
const router = express.Router();
const pool = require('../db/connection');
const { analyzeAudio } = require('../services/gemini');
const { sendResultEmail } = require('../services/email');
const { appendResult } = require('../services/sheets');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB max
});

function getLevel(score) {
  if (score >= 85) return 'Advanced';
  if (score >= 70) return 'Upper Intermediate';
  if (score >= 55) return 'Intermediate';
  if (score >= 40) return 'Elementary';
  return 'Beginner';
}

router.post('/submit', upload.single('audio'), async (req, res) => {
  const { registrationId, duration, mimeType, apiKey } = req.body;

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
    try {
      const audioBase64 = req.file.buffer.toString('base64');
      const cleanMime = (mimeType || req.file.mimetype || 'audio/webm').split(';')[0];

      const analysis = await analyzeAudio(
        audioBase64,
        cleanMime,
        registration.question,
        registration.education_level,
        apiKey || null
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
      console.error('Gemini analysis error:', analysisErr.message);
      await pool.query(
        `UPDATE test_results SET status = 'failed', error_message = $1 WHERE id = $2`,
        [analysisErr.message, resultId]
      );
    }
  } catch (err) {
    console.error('Submit route error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Pengiriman gagal. Coba lagi.' });
    }
  }
});

module.exports = router;
