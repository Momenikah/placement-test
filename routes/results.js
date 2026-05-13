const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { generatePDF } = require('../services/pdf');

const RESULT_QUERY = `
  SELECT tr.*, r.name, r.email, r.whatsapp, r.education_level, r.question
  FROM test_results tr
  JOIN registrations r ON tr.registration_id = r.id
  WHERE tr.id = $1
`;

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(RESULT_QUERY, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Hasil tidak ditemukan.' });

    const d = rows[0];
    // Merge raw_analysis fields for rich display (safe fallback if null)
    const raw = d.raw_analysis || {};
    res.json({
      id: d.id,
      name: d.name,
      email: d.email,
      whatsapp: d.whatsapp,
      educationLevel: d.education_level,
      question: d.question,
      transcript: d.transcript,
      durationSeconds: d.duration_seconds,
      scores: {
        fluency:       d.fluency_score,
        pronunciation: d.pronunciation_score,
        grammar:       d.grammar_score,
        vocabulary:    d.vocabulary_score,
        overall:       d.overall_score,
      },
      feedback: {
        fluency:       d.fluency_feedback,
        pronunciation: d.pronunciation_feedback,
        grammar:       d.grammar_feedback,
        vocabulary:    d.vocabulary_feedback,
        general:       d.general_feedback,
      },
      // Rich analysis fields from JSONB
      cefrLevel:        d.cefr_level || raw.cefr_level || null,
      cefrDescription:  raw.cefr_description || null,
      strengthsSummary: raw.strengths_summary || [],
      improvementPlan:  raw.improvement_plan  || [],
      encouragement:    raw.encouragement     || null,
      fluencyDetail: {
        pace:         raw.fluency?.pace         || null,
        fillerWords:  raw.fluency?.filler_words || [],
        strengths:    raw.fluency?.strengths    || [],
        improvements: raw.fluency?.improvements || [],
      },
      pronunciationDetail: {
        corrections:  raw.pronunciation?.corrections  || [],
        strengths:    raw.pronunciation?.strengths    || [],
        improvements: raw.pronunciation?.improvements || [],
      },
      grammarDetail: {
        errors:       raw.grammar?.errors       || [],
        strengths:    raw.grammar?.strengths    || [],
        improvements: raw.grammar?.improvements || [],
      },
      vocabularyDetail: {
        impressiveWords: raw.vocabulary?.impressive_words || [],
        upgrades:        raw.vocabulary?.upgrades         || [],
        strengths:       raw.vocabulary?.strengths        || [],
        improvements:    raw.vocabulary?.improvements     || [],
      },
      levelResult:  d.level_result,
      status:       d.status,
      errorMessage: d.error_message,
      createdAt:    d.created_at,
    });
  } catch (err) {
    console.error('Get result error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil hasil.' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const { rows } = await pool.query(RESULT_QUERY, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Hasil tidak ditemukan.' });

    const d = rows[0];
    if (d.status !== 'completed') {
      return res.status(400).json({ error: 'Hasil belum selesai diproses.' });
    }

    const pdfBuffer = await generatePDF(d);
    const filename = `PlacementTest-${d.name.replace(/\s+/g, '-')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error('PDF route error:', err.message);
    res.status(500).json({ error: 'Gagal membuat PDF.' });
  }
});

module.exports = router;
