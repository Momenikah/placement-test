const PDFDocument = require('pdfkit');

// ── Palette ──
const C = {
  primary:  '#4F46E5', primaryDark: '#4338CA', primaryLight: '#EEF2FF',
  success:  '#059669', successLight: '#D1FAE5',
  warning:  '#D97706', warningLight: '#FEF3C7',
  danger:   '#DC2626', dangerLight:  '#FEE2E2',
  dark:     '#1F2937', medium:  '#374151',
  gray:     '#6B7280', xgray:   '#9CA3AF',
  border:   '#E5E7EB', bg:      '#F9FAFB',
  white:    '#FFFFFF',
};

const CEFR_COLOR = { A1:'#DC2626', A2:'#D97706', B1:'#059669', B2:'#2563EB', C1:'#7C3AED', C2:'#1F2937' };

function scoreColor(s) {
  if (s >= 70) return C.success;
  if (s >= 50) return C.warning;
  return C.danger;
}

function levelLabel(level) {
  return level === 'SD' ? 'Elementary School (SD)' : 'Junior/Senior High School (SMP/SMA)';
}

function fmt(secs) {
  return secs ? `${Math.floor(secs/60)}m ${secs%60}s` : 'N/A';
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('id-ID', { year:'numeric', month:'long', day:'numeric' });
}

// ── Low-level helpers ──
function sectionTitle(doc, text, y) {
  doc.rect(60, y, 3, 14).fill(C.primary);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.primary)
     .text(text, 70, y + 1, { characterSpacing: 0.4 });
  return y + 20;
}

function drawBar(doc, x, y, w, score, h = 7) {
  doc.roundedRect(x, y, w, h, 3).fill(C.border);
  const fill = Math.max(Math.round(w * score / 100), 4);
  doc.roundedRect(x, y, fill, h, 3).fill(scoreColor(score));
}

function checkPage(doc, y, need = 80) {
  if (y + need > doc.page.height - 60) { doc.addPage(); return 60; }
  return y;
}

// ── Main ──
async function generatePDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 55, left: 60, right: 60 },
      info: { Title: 'English Speaking Placement Test – Result Report', Author: 'Placement Test System' },
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W  = doc.page.width;
    const CW = W - 120; // content width

    const raw  = data.raw_analysis || {};
    const cefr = data.cefr_level || raw.cefr_level;
    const cefrColor = CEFR_COLOR[cefr] || C.primary;

    // ════════════════════════════════════════
    // HEADER
    // ════════════════════════════════════════
    doc.rect(0, 0, W, 135).fill(C.primary);

    doc.font('Helvetica-Bold').fontSize(18).fillColor(C.white)
       .text('ENGLISH SPEAKING PLACEMENT TEST', 60, 25, { align: 'center', width: CW });
    doc.font('Helvetica').fontSize(11).fillColor('rgba(255,255,255,0.82)')
       .text('Assessment Result Report', 60, 50, { align: 'center', width: CW });

    // CEFR badge in header
    if (cefr) {
      const badgeW = 90, badgeH = 28, badgeX = W - 60 - badgeW, badgeY = 72;
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 6).fill('rgba(255,255,255,0.18)');
      doc.font('Helvetica-Bold').fontSize(16).fillColor(C.white)
         .text(cefr, badgeX, badgeY + 4, { width: badgeW, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.72)')
         .text('CEFR Level', badgeX, badgeY + 20, { width: badgeW, align: 'center' });
    }

    doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.62)')
       .text(`${fmtDate(data.created_at)}  ·  ID: ${String(data.id).substring(0,8)}`, 60, 108, { align:'center', width: CW });

    // ════════════════════════════════════════
    // STUDENT INFO
    // ════════════════════════════════════════
    let y = 152;
    doc.roundedRect(60, y, CW, 82, 8).fill(C.bg);

    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.primary)
       .text('STUDENT INFORMATION', 76, y + 12, { characterSpacing: 0.5 });

    const rows2 = [
      [['Name', data.name], ['Email', data.email]],
      [['WhatsApp', data.whatsapp], ['Education', levelLabel(data.education_level)]],
      [['Duration', fmt(data.duration_seconds)], ['Test Date', fmtDate(data.created_at)]],
    ];
    const c1 = 76, c2 = 330;
    rows2.forEach(([left, right], i) => {
      const ry = y + 26 + i * 19;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.xgray).text(left[0] + ':', c1, ry);
      doc.font('Helvetica').fontSize(8).fillColor(C.dark).text(String(left[1]).substring(0,35), c1 + 55, ry);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.xgray).text(right[0] + ':', c2, ry);
      doc.font('Helvetica').fontSize(8).fillColor(C.dark).text(String(right[1]).substring(0,30), c2 + 58, ry);
    });

    // ════════════════════════════════════════
    // QUESTION
    // ════════════════════════════════════════
    y += 98;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.primary).text('SPEAKING QUESTION', 60, y, { characterSpacing: 0.5 });
    y += 12;
    doc.roundedRect(60, y, CW, 36, 5).stroke(C.border);
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(C.dark)
       .text(`"${data.question}"`, 70, y + 8, { width: CW - 20 });
    y += 50;

    // ════════════════════════════════════════
    // OVERALL SCORE
    // ════════════════════════════════════════
    doc.roundedRect(60, y, CW, 72, 8).fill(C.primary);

    doc.font('Helvetica-Bold').fontSize(9).fillColor('rgba(255,255,255,0.75)')
       .text('OVERALL SCORE', 60, y + 12, { align:'center', width: CW });
    doc.font('Helvetica-Bold').fontSize(40).fillColor(C.white)
       .text(`${data.overall_score ?? 0}`, 60, y + 20, { align:'center', width: CW - 140 });
    doc.font('Helvetica').fontSize(11).fillColor('rgba(255,255,255,0.65)')
       .text('/100', 60, y + 54, { align:'center', width: CW - 140 });

    // Level + CEFR on the right
    const lvlX = W - 190, lvlY = y + 14;
    if (data.level_result) {
      doc.roundedRect(lvlX, lvlY, 110, 20, 4).fill('rgba(255,255,255,0.18)');
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white)
         .text(data.level_result, lvlX, lvlY + 4, { width: 110, align:'center' });
    }
    if (cefr) {
      doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.72)')
         .text(`CEFR ${cefr}${raw.cefr_description ? ' — ' + raw.cefr_description.substring(0,30) : ''}`, lvlX, lvlY + 28, { width: 110, align:'center' });
    }
    y += 88;

    // ════════════════════════════════════════
    // SCORE BREAKDOWN
    // ════════════════════════════════════════
    y = checkPage(doc, y, 100);
    y = sectionTitle(doc, 'SCORE BREAKDOWN', y);

    const cats = [
      { name: 'Fluency',       score: data.fluency_score },
      { name: 'Pronunciation', score: data.pronunciation_score },
      { name: 'Grammar',       score: data.grammar_score },
      { name: 'Vocabulary',    score: data.vocabulary_score },
    ];

    cats.forEach(cat => {
      y = checkPage(doc, y, 44);
      const sc = cat.score ?? 0;
      doc.rect(60, y, CW, 38).fill(C.bg);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.dark).text(cat.name.toUpperCase(), 74, y + 9);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(scoreColor(sc))
         .text(`${sc}`, W - 105, y + 6, { width: 40, align:'right' });
      doc.font('Helvetica').fontSize(7).fillColor(C.xgray).text('/100', W - 62, y + 14);
      drawBar(doc, 74, y + 27, CW - 80, sc);
      y += 46;
    });
    y += 6;

    // ════════════════════════════════════════
    // STRENGTHS SUMMARY
    // ════════════════════════════════════════
    const strengths = raw.strengths_summary || [];
    if (strengths.length) {
      y = checkPage(doc, y, 60);
      y = sectionTitle(doc, 'KEY STRENGTHS', y);
      strengths.forEach(s => {
        y = checkPage(doc, y, 20);
        doc.roundedRect(60, y, CW, 18, 4).fill(C.successLight);
        doc.font('Helvetica').fontSize(9).fillColor(C.success)
           .text('✓  ' + s, 68, y + 4, { width: CW - 16 });
        y += 22;
      });
      y += 6;
    }

    // ════════════════════════════════════════
    // GRAMMAR CORRECTIONS
    // ════════════════════════════════════════
    const errors = raw.grammar?.errors || [];
    if (errors.length) {
      y = checkPage(doc, y, 70);
      y = sectionTitle(doc, `GRAMMAR CORRECTIONS (${errors.length} found)`, y);

      // Table header
      doc.rect(60, y, CW, 16).fill(C.primary);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.white);
      doc.text('What was said', 68, y + 4, { width: CW * 0.35 });
      doc.text('Corrected version', 68 + CW * 0.38, y + 4, { width: CW * 0.35 });
      doc.text('Rule', 68 + CW * 0.76, y + 4, { width: CW * 0.22 });
      y += 16;

      errors.forEach((err, i) => {
        y = checkPage(doc, y, 22);
        const rowBg = i % 2 === 0 ? C.white : C.bg;
        doc.rect(60, y, CW, 20).fill(rowBg);
        doc.font('Helvetica').fontSize(8).fillColor(C.danger)
           .text(`"${(err.original || '').substring(0, 40)}"`, 68, y + 6, { width: CW * 0.35 });
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.success)
           .text((err.corrected || '').substring(0, 40), 68 + CW * 0.38, y + 6, { width: CW * 0.35 });
        doc.font('Helvetica').fontSize(7).fillColor(C.gray)
           .text((err.rule || '').substring(0, 25), 68 + CW * 0.76, y + 6, { width: CW * 0.22 });
        y += 20;
      });
      y += 8;
    }

    // ════════════════════════════════════════
    // PRONUNCIATION CORRECTIONS
    // ════════════════════════════════════════
    const pron = raw.pronunciation?.corrections || [];
    if (pron.length) {
      y = checkPage(doc, y, 70);
      y = sectionTitle(doc, `PRONUNCIATION GUIDE (${pron.length} words)`, y);

      doc.rect(60, y, CW, 16).fill(C.primary);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.white);
      doc.text('Word', 68, y + 4, { width: CW * 0.22 });
      doc.text('Correct Phonetic', 68 + CW * 0.24, y + 4, { width: CW * 0.32 });
      doc.text('Tip', 68 + CW * 0.58, y + 4, { width: CW * 0.4 });
      y += 16;

      pron.forEach((p, i) => {
        y = checkPage(doc, y, 22);
        doc.rect(60, y, CW, 20).fill(i % 2 === 0 ? C.white : C.bg);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.primary)
           .text((p.word || '').substring(0, 20), 68, y + 5, { width: CW * 0.22 });
        doc.font('Helvetica').fontSize(8).fillColor(C.dark)
           .text((p.phonetic_correct || '').substring(0, 28), 68 + CW * 0.24, y + 6, { width: CW * 0.32 });
        doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
           .text((p.tip || '').substring(0, 45), 68 + CW * 0.58, y + 6, { width: CW * 0.4 });
        y += 20;
      });
      y += 8;
    }

    // ════════════════════════════════════════
    // VOCABULARY UPGRADES
    // ════════════════════════════════════════
    const upgrades = raw.vocabulary?.upgrades || [];
    if (upgrades.length) {
      y = checkPage(doc, y, 70);
      y = sectionTitle(doc, 'VOCABULARY UPGRADES', y);

      upgrades.slice(0, 6).forEach((u, i) => {
        y = checkPage(doc, y, 22);
        doc.rect(60, y, CW, 20).fill(i % 2 === 0 ? C.bg : C.white);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.warning)
           .text(`"${(u.basic_word || '').substring(0, 18)}"`, 68, y + 5, { width: CW * 0.25 });
        doc.font('Helvetica').fontSize(8).fillColor(C.xgray).text('→', 68 + CW * 0.27, y + 6);
        const alts = (u.alternatives || []).slice(0, 3).join('   /   ');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.success)
           .text(alts.substring(0, 55), 68 + CW * 0.32, y + 6, { width: CW * 0.64 });
        y += 20;
      });
      y += 8;
    }

    // ════════════════════════════════════════
    // IMPROVEMENT PLAN
    // ════════════════════════════════════════
    const plan = raw.improvement_plan || [];
    if (plan.length) {
      y = checkPage(doc, y, 80);
      y = sectionTitle(doc, 'IMPROVEMENT PLAN', y);

      plan.forEach((step, i) => {
        y = checkPage(doc, y, 28);
        doc.roundedRect(60, y, CW, 24, 4).fill(C.primaryLight);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.primary)
           .text(`${i + 1}`, 68, y + 6, { width: 14, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).fillColor('#3730A3')
           .text(step.substring(0, 95), 86, y + 7, { width: CW - 34 });
        y += 28;
      });
      y += 6;
    }

    // ════════════════════════════════════════
    // OVERALL FEEDBACK
    // ════════════════════════════════════════
    if (data.general_feedback) {
      y = checkPage(doc, y, 70);
      y = sectionTitle(doc, 'OVERALL ASSESSMENT', y);
      const lines = doc.heightOfString(data.general_feedback, { width: CW - 20, fontSize: 9 });
      doc.roundedRect(60, y, CW, lines + 18, 6).fill(C.primaryLight);
      doc.font('Helvetica').fontSize(9).fillColor('#1E1B4B')
         .text(data.general_feedback, 70, y + 9, { width: CW - 20, lineGap: 2 });
      y = doc.y + 16;
    }

    // ════════════════════════════════════════
    // TRANSCRIPT
    // ════════════════════════════════════════
    if (data.transcript) {
      y = checkPage(doc, y, 60);
      y = sectionTitle(doc, 'TRANSCRIPT', y);
      const lines = doc.heightOfString(data.transcript, { width: CW - 20, fontSize: 8.5 });
      doc.roundedRect(60, y, CW, Math.min(lines + 18, 200), 6).stroke(C.border);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(C.gray)
         .text(data.transcript.substring(0, 800), 70, y + 9, { width: CW - 20, lineGap: 2 });
      y = doc.y + 14;
    }

    // ════════════════════════════════════════
    // FOOTER (every page)
    // ════════════════════════════════════════
    const pageH = doc.page.height;
    doc.rect(0, pageH - 42, W, 42).fill(C.bg);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.xgray)
       .text(
         'This report was generated automatically by the English Speaking Placement Test System. Results may vary based on audio quality.',
         60, pageH - 32, { align:'center', width: CW }
       );

    doc.end();
  });
}

module.exports = { generatePDF };
