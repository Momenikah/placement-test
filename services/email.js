const nodemailer = require('nodemailer');
const { generatePDF } = require('./pdf');
require('dotenv').config();

const ADMIN_EMAIL = 'kelasonline.mrbob@gmail.com';

const CEFR_BG = { A1:'#FEE2E2',A2:'#FEF3C7',B1:'#D1FAE5',B2:'#DBEAFE',C1:'#EDE9FE',C2:'#F3F4F6' };
const CEFR_FG = { A1:'#991B1B',A2:'#92400E',B1:'#065F46',B2:'#1E40AF',C1:'#5B21B6',C2:'#1F2937' };

function pill(score) {
  const bg = score >= 70 ? '#D1FAE5' : score >= 50 ? '#FEF3C7' : '#FEE2E2';
  const fg = score >= 70 ? '#065F46' : score >= 50 ? '#92400E' : '#991B1B';
  return `<span style="background:${bg};color:${fg};padding:2px 10px;border-radius:12px;font-weight:700;font-size:12px;">${score}/100</span>`;
}

function buildHtml(registration, results) {
  const { name, email, education_level, question } = registration;
  const { fluency, pronunciation, grammar, vocabulary, overall_feedback,
          cefr_level, cefr_description, strengths_summary, improvement_plan,
          encouragement, overallScore, levelResult, durationSeconds } = results;

  const raw   = results.raw_analysis || {};
  const grammarErrors    = raw.grammar?.errors            || [];
  const pronCorrections  = raw.pronunciation?.corrections || [];
  const vocabUpgrades    = raw.vocabulary?.upgrades       || [];
  const fillerWords      = raw.fluency?.filler_words      || [];

  const cefrBg = (cefr_level && CEFR_BG[cefr_level]) || '#EEF2FF';
  const cefrFg = (cefr_level && CEFR_FG[cefr_level]) || '#3730A3';
  const levelLabel = education_level === 'SD' ? 'Elementary School (SD)' : 'SMP/SMA';
  const dur = `${Math.floor(durationSeconds/60)}m ${durationSeconds%60}s`;

  const grammarSection = grammarErrors.length ? `
    <div style="margin:0 30px 20px;">
      <h3 style="font-size:13px;font-weight:700;color:#1F2937;margin:0 0 10px;">✏️ Grammar Corrections</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-size:12px;">
        <tr style="background:#4F46E5;">
          <th style="padding:8px 10px;color:#fff;text-align:left;width:38%;">What was said</th>
          <th style="padding:8px 10px;color:#fff;text-align:left;width:38%;">Corrected version</th>
          <th style="padding:8px 10px;color:#fff;text-align:left;">Rule</th>
        </tr>
        ${grammarErrors.map((e,i) => `
        <tr style="background:${i%2===0?'#fff':'#F9FAFB'};">
          <td style="padding:8px 10px;color:#DC2626;">"${e.original}"</td>
          <td style="padding:8px 10px;color:#059669;font-weight:600;">${e.corrected}</td>
          <td style="padding:8px 10px;color:#6B7280;font-size:11px;">${e.rule}</td>
        </tr>`).join('')}
      </table>
    </div>` : '';

  const pronSection = pronCorrections.length ? `
    <div style="margin:0 30px 20px;">
      <h3 style="font-size:13px;font-weight:700;color:#1F2937;margin:0 0 10px;">🔊 Pronunciation Guide</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-size:12px;">
        <tr style="background:#4F46E5;">
          <th style="padding:8px 10px;color:#fff;text-align:left;width:28%;">Word</th>
          <th style="padding:8px 10px;color:#fff;text-align:left;width:36%;">Correct Phonetic</th>
          <th style="padding:8px 10px;color:#fff;text-align:left;">Tip</th>
        </tr>
        ${pronCorrections.map((p,i) => `
        <tr style="background:${i%2===0?'#fff':'#F9FAFB'};">
          <td style="padding:8px 10px;font-weight:700;color:#4F46E5;">${p.word}</td>
          <td style="padding:8px 10px;color:#374151;font-family:monospace;">${p.phonetic_correct}</td>
          <td style="padding:8px 10px;color:#6B7280;">${p.tip}</td>
        </tr>`).join('')}
      </table>
    </div>` : '';

  const vocabSection = vocabUpgrades.length ? `
    <div style="margin:0 30px 20px;">
      <h3 style="font-size:13px;font-weight:700;color:#1F2937;margin:0 0 10px;">📚 Vocabulary Upgrades</h3>
      <div style="background:#F9FAFB;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">
        ${vocabUpgrades.slice(0,5).map(u => `
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;">
          <span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap;">${u.basic_word}</span>
          <span style="color:#9CA3AF;">→</span>
          <span style="color:#059669;font-weight:600;">${(u.alternatives||[]).join(' · ')}</span>
        </div>`).join('')}
      </div>
    </div>` : '';

  const planSection = (improvement_plan||[]).length ? `
    <div style="margin:0 30px 20px;">
      <h3 style="font-size:13px;font-weight:700;color:#1F2937;margin:0 0 10px;">🎯 Improvement Plan</h3>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${(improvement_plan||[]).map((step,i) => `
        <div style="display:flex;gap:10px;align-items:flex-start;background:#EEF2FF;border-radius:8px;padding:10px 12px;">
          <span style="background:#4F46E5;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${i+1}</span>
          <span style="font-size:12px;color:#3730A3;line-height:1.5;">${step}</span>
        </div>`).join('')}
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:30px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:32px 30px;text-align:center;">
    <div style="font-size:36px;margin-bottom:8px;">🎙️</div>
    <h1 style="color:#fff;margin:0 0 4px;font-size:20px;font-weight:700;">English Speaking Test Result</h1>
    <p style="color:rgba(255,255,255,0.78);margin:0;font-size:12px;">Placement Test Assessment Report</p>
    ${cefr_level ? `<div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;padding:4px 16px;border-radius:20px;font-size:13px;font-weight:700;margin-top:10px;">${cefr_level} — ${cefr_description||''}</div>` : ''}
  </div>

  <!-- Greeting -->
  <div style="padding:24px 30px 0;">
    <h2 style="color:#1F2937;font-size:16px;margin:0 0 6px;font-weight:700;">Hello, ${name}! 👋</h2>
    <p style="color:#6B7280;margin:0;font-size:13px;line-height:1.6;">Berikut laporan lengkap hasil speaking test kamu:</p>
  </div>

  <!-- Overall Score -->
  <div style="margin:20px 30px;background:linear-gradient(135deg,#4F46E5,#7C3AED);border-radius:12px;padding:22px;text-align:center;">
    <p style="color:rgba(255,255,255,0.75);margin:0 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;">Overall Score</p>
    <div style="font-size:52px;font-weight:800;color:#fff;line-height:1.1;">${overallScore}</div>
    <div style="color:rgba(255,255,255,0.7);font-size:14px;margin:2px 0 10px;">/100</div>
    <span style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;padding:5px 18px;border-radius:20px;font-size:13px;font-weight:700;">${levelResult}</span>
  </div>

  <!-- Test info -->
  <div style="margin:0 30px 18px;background:#F9FAFB;border-radius:10px;padding:12px 14px;font-size:12px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:2px 0;color:#9CA3AF;width:110px;">Jenjang</td><td style="color:#374151;font-weight:600;">${levelLabel}</td></tr>
      <tr><td style="padding:2px 0;color:#9CA3AF;">Durasi</td><td style="color:#374151;font-weight:600;">${dur}</td></tr>
      <tr><td style="padding:2px 0;color:#9CA3AF;">Pertanyaan</td><td style="color:#374151;font-style:italic;">"${question}"</td></tr>
    </table>
  </div>

  <!-- Scores -->
  <div style="margin:0 30px 20px;">
    <h3 style="color:#1F2937;font-size:13px;margin:0 0 10px;font-weight:700;">Score Breakdown</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;color:#374151;font-weight:600;font-size:12px;">Fluency</td><td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;text-align:right;">${pill(fluency.score)}</td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;color:#374151;font-weight:600;font-size:12px;">Pronunciation</td><td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;text-align:right;">${pill(pronunciation.score)}</td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;color:#374151;font-weight:600;font-size:12px;">Grammar</td><td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;text-align:right;">${pill(grammar.score)}</td></tr>
      <tr><td style="padding:10px 14px;color:#374151;font-weight:600;font-size:12px;">Vocabulary</td><td style="padding:10px 14px;text-align:right;">${pill(vocabulary.score)}</td></tr>
    </table>
  </div>

  <!-- Strengths -->
  ${(strengths_summary||[]).length ? `
  <div style="margin:0 30px 20px;">
    <h3 style="font-size:13px;font-weight:700;color:#1F2937;margin:0 0 8px;">⭐ Key Strengths</h3>
    ${(strengths_summary||[]).map(s => `<div style="background:#D1FAE5;color:#065F46;padding:6px 12px;border-radius:6px;font-size:12px;margin-bottom:6px;">✓ ${s}</div>`).join('')}
  </div>` : ''}

  ${grammarSection}
  ${pronSection}
  ${vocabSection}
  ${planSection}

  <!-- Overall Assessment -->
  <div style="margin:0 30px 20px;background:#EEF2FF;border-left:4px solid #4F46E5;border-radius:4px;padding:14px 16px;">
    <p style="color:#4F46E5;font-size:12px;font-weight:700;margin:0 0 6px;">Overall Assessment</p>
    <p style="color:#3730A3;font-size:12px;margin:0;line-height:1.65;">${overall_feedback}</p>
  </div>

  ${encouragement ? `
  <div style="margin:0 30px 22px;text-align:center;background:#F0FDF4;border-radius:8px;padding:12px 16px;">
    <p style="color:#059669;font-size:13px;font-weight:600;margin:0;">💪 ${encouragement}</p>
  </div>` : ''}

  <!-- PDF note -->
  <div style="margin:0 30px 26px;background:#F9FAFB;border-radius:8px;padding:12px;text-align:center;">
    <p style="color:#6B7280;font-size:12px;margin:0;">📄 Laporan lengkap dalam format <strong>PDF</strong> telah dilampirkan pada email ini.</p>
  </div>

  <div style="background:#F9FAFB;padding:16px 30px;text-align:center;border-top:1px solid #E5E7EB;">
    <p style="color:#9CA3AF;font-size:11px;margin:0;line-height:1.6;">English Speaking Placement Test System<br>Hasil dievaluasi secara otomatis oleh Gemini AI.</p>
  </div>
</div>
</body>
</html>`;
}

async function sendResultEmail(registration, results) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const fullData = {
    id: 'email-gen', name: registration.name, email: registration.email,
    whatsapp: registration.whatsapp, education_level: registration.education_level,
    question: registration.question, transcript: results.transcript,
    fluency_score: results.fluency.score, pronunciation_score: results.pronunciation.score,
    grammar_score: results.grammar.score, vocabulary_score: results.vocabulary.score,
    overall_score: results.overallScore, fluency_feedback: results.fluency.feedback,
    pronunciation_feedback: results.pronunciation.feedback, grammar_feedback: results.grammar.feedback,
    vocabulary_feedback: results.vocabulary.feedback, general_feedback: results.overall_feedback,
    level_result: results.levelResult, cefr_level: results.cefr_level || null,
    duration_seconds: results.durationSeconds, created_at: new Date(),
    raw_analysis: results,
  };

  const pdfBuffer = await generatePDF(fullData);
  const pdfName   = `PlacementTest-${registration.name.replace(/\s+/g, '-')}.pdf`;

  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'English Speaking Test'}" <${process.env.SMTP_USER}>`,
    to: registration.email,
    bcc: ADMIN_EMAIL,
    subject: `Hasil Speaking Test – ${results.cefrLevel || results.levelResult} (${results.overallScore}/100) | ${registration.name}`,
    html: buildHtml(registration, results),
    attachments: [{ filename: pdfName, content: pdfBuffer, contentType: 'application/pdf' }],
  });

  console.log(`✉️  Email sent → ${registration.email} (BCC: ${ADMIN_EMAIL})`);
}

module.exports = { sendResultEmail };
