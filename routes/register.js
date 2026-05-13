const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

const SD_QUESTIONS = [
  'Please tell about your daily activity.',
  'What do you like to do in your free time?',
];

const SMP_SMA_QUESTIONS = [
  'What is your favorite city and why do you like it?',
];

router.post('/', async (req, res) => {
  const { name, email, whatsapp, education_level } = req.body;

  if (!name?.trim() || !email?.trim() || !whatsapp?.trim() || !education_level) {
    return res.status(400).json({ error: 'Semua field wajib diisi.' });
  }

  if (!['SD', 'SMP_SMA'].includes(education_level)) {
    return res.status(400).json({ error: 'Jenjang pendidikan tidak valid.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'Format email tidak valid.' });
  }

  const questions = education_level === 'SD' ? SD_QUESTIONS : SMP_SMA_QUESTIONS;
  const question = questions[Math.floor(Math.random() * questions.length)];

  try {
    const { rows } = await pool.query(
      `INSERT INTO registrations (name, email, whatsapp, education_level, question)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, education_level, question`,
      [name.trim(), email.trim().toLowerCase(), whatsapp.trim(), education_level, question]
    );

    const reg = rows[0];
    res.json({
      success: true,
      registrationId: reg.id,
      name: reg.name,
      educationLevel: reg.education_level,
      question: reg.question,
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Registrasi gagal. Coba lagi.' });
  }
});

module.exports = router;
