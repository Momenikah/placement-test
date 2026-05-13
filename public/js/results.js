const params   = new URLSearchParams(window.location.search);
const resultId = params.get('id');
if (!resultId) window.location.href = '/';

// ── Views ──
const views = ['loading','error','too-short','results'];
function showView(name) {
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = 'none';
  });
  document.getElementById(`view-${name}`).style.display = 'block';
}

// ── Helpers ──
function cls(s) { return s >= 70 ? 'success' : s >= 50 ? 'warning' : 'danger'; }

function setScore(valId, fillId, score) {
  const c = cls(score);
  document.getElementById(valId).textContent = score;
  document.getElementById(valId).className = `score-card-value ${c}`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.getElementById(fillId).className = `score-card-fill ${c}`;
    document.getElementById(fillId).style.width = score + '%';
  }));
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }

function fmt(secs) { return secs ? `${Math.floor(secs/60)}m ${secs%60}s` : 'N/A'; }

// ── Render ──
function renderResults(d) {
  document.getElementById('res-name').textContent = `Halo, ${d.name}! 👋`;
  document.getElementById('res-overall').textContent = d.scores.overall ?? 0;
  document.getElementById('res-level').textContent   = d.levelResult || '—';
  document.getElementById('res-question').textContent = d.question;
  document.getElementById('res-edu').textContent =
    d.educationLevel === 'SD' ? '🏫 SD' : '🎓 SMP/SMA';
  document.getElementById('res-dur').textContent = `⏱️ ${fmt(d.durationSeconds)}`;

  // CEFR badge
  if (d.cefrLevel) {
    const el = document.getElementById('res-cefr');
    el.innerHTML = `<span class="cefr-badge cefr-${d.cefrLevel}">CEFR ${d.cefrLevel}</span>`;
    show('res-cefr');
  }

  // Score cards
  setScore('sc-fluency', 'sf-fluency', d.scores.fluency ?? 0);
  setScore('sc-pronun',  'sf-pronun',  d.scores.pronunciation ?? 0);
  setScore('sc-grammar', 'sf-grammar', d.scores.grammar ?? 0);
  setScore('sc-vocab',   'sf-vocab',   d.scores.vocabulary ?? 0);

  // Strengths summary
  if (d.strengthsSummary?.length) {
    const list = document.getElementById('strengths-list');
    list.innerHTML = d.strengthsSummary.map(s =>
      `<div class="strength-tag"><span class="icon">✅</span><span>${s}</span></div>`
    ).join('');
    show('strengths-wrap');
  }

  // Feedback accordion (category summaries)
  const cats = [
    { label: 'Fluency',       score: d.scores.fluency,       fb: d.feedback.fluency,
      extras: [
        d.fluencyDetail?.pace ? `Pace: <strong>${d.fluencyDetail.pace}</strong>` : null,
      ].filter(Boolean)
    },
    { label: 'Pronunciation', score: d.scores.pronunciation, fb: d.feedback.pronunciation },
    { label: 'Grammar',       score: d.scores.grammar,       fb: d.feedback.grammar },
    { label: 'Vocabulary',    score: d.scores.vocabulary,    fb: d.feedback.vocabulary },
  ];

  const fbList = document.getElementById('feedback-list');
  fbList.innerHTML = '';
  cats.forEach((cat, i) => {
    const c = cls(cat.score ?? 0);
    const pillCss = c === 'success'
      ? 'background:var(--success-light);color:#065F46;'
      : c === 'warning'
      ? 'background:var(--warning-light);color:#92400E;'
      : 'background:var(--danger-light);color:#991B1B;';

    const extras = (cat.extras || []).map(e => `<p style="font-size:12px;color:var(--text-light);margin:6px 0 0;">${e}</p>`).join('');

    const item = document.createElement('div');
    item.className = 'feedback-item';
    item.innerHTML = `
      <div class="feedback-header" onclick="toggleFb(this)">
        <div class="feedback-header-left">
          <span class="feedback-header-title">${cat.label}</span>
          <span class="feedback-score-pill" style="${pillCss}padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;">${cat.score ?? 0}/100</span>
        </div>
        <span class="feedback-chevron">▼</span>
      </div>
      <div class="feedback-body ${i === 0 ? 'open' : ''}">
        <p>${cat.fb || 'Tidak ada feedback.'}</p>
        ${extras}
      </div>`;
    fbList.appendChild(item);
  });

  // Grammar corrections table
  const gErrors = d.grammarDetail?.errors || [];
  if (gErrors.length) {
    const tbody = document.getElementById('grammar-tbody');
    tbody.innerHTML = gErrors.map(e => `
      <tr>
        <td class="error-original">"${e.original}"</td>
        <td class="error-corrected">${e.corrected}</td>
        <td class="error-rule">${e.rule}</td>
      </tr>`).join('');
    show('grammar-corrections-wrap');
  }

  // Pronunciation corrections table
  const pCorr = d.pronunciationDetail?.corrections || [];
  if (pCorr.length) {
    const tbody = document.getElementById('pron-tbody');
    tbody.innerHTML = pCorr.map(p => `
      <tr>
        <td class="pron-word">${p.word}</td>
        <td class="pron-phonetic">${p.phonetic_correct}</td>
        <td class="pron-tip">${p.tip}</td>
      </tr>`).join('');
    show('pron-guide-wrap');
  }

  // Vocabulary upgrades
  const upgrades = d.vocabularyDetail?.upgrades || [];
  if (upgrades.length) {
    const tbody = document.getElementById('vocab-tbody');
    tbody.innerHTML = upgrades.map(u => `
      <tr>
        <td><span class="vocab-basic">${u.basic_word}</span></td>
        <td class="vocab-arrow" style="text-align:center;">→</td>
        <td class="vocab-better">${(u.alternatives || []).join(' · ')}</td>
      </tr>`).join('');
    show('vocab-wrap');
  }

  // Filler words
  const fillers = d.fluencyDetail?.fillerWords || [];
  if (fillers.length) {
    document.getElementById('filler-list').innerHTML = fillers
      .map(f => `<span class="chip">${f}</span>`).join('');
    show('filler-wrap');
  }

  // Impressive words
  const impressive = d.vocabularyDetail?.impressiveWords || [];
  if (impressive.length) {
    document.getElementById('impressive-list').innerHTML = impressive
      .map(w => `<span class="chip chip-success">⭐ ${w}</span>`).join('');
    show('impressive-wrap');
  }

  // Overall feedback
  if (d.feedback.general) {
    document.getElementById('overall-feedback-text').textContent = d.feedback.general;
    show('overall-feedback-wrap');
  }

  // Improvement plan
  if (d.improvementPlan?.length) {
    document.getElementById('plan-list').innerHTML = d.improvementPlan.map((step, i) => `
      <div class="plan-step">
        <span class="plan-step-num">${i + 1}</span>
        <span class="plan-step-text">${step}</span>
      </div>`).join('');
    show('plan-wrap');
  }

  // Encouragement
  if (d.encouragement) {
    document.getElementById('encourage-text').textContent = '💪 ' + d.encouragement;
    show('encourage-wrap');
  }

  // Transcript
  if (d.transcript) {
    document.getElementById('transcript-text').textContent = d.transcript;
    show('transcript-wrap');
  }

  document.getElementById('pdf-btn').href = `/api/results/${resultId}/pdf`;
  showView('results');
}

// ── Test Lagi: skip registration if user info still cached ──
window.tryAgain = async function (btn) {
  const session = JSON.parse(localStorage.getItem('pt_session') || 'null');

  // No usable cached profile → fall back to full registration flow
  if (!session?.name || !session?.email || !session?.whatsapp ||
      !session?.educationLevel || !session?.apiKey || !session?.tncAgreed) {
    window.location.href = '/';
    return;
  }

  const original = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;display:inline-block;"></span>&nbsp; Memuat soal baru...';
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:            session.name,
        email:           session.email,
        whatsapp:        session.whatsapp,
        education_level: session.educationLevel,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Gagal memulai test baru.');

    // Update session with NEW registration + question (keep apiKey + tncAgreed)
    session.registrationId = data.registrationId;
    session.name           = data.name;
    session.educationLevel = data.educationLevel;
    session.question       = data.question;
    localStorage.setItem('pt_session', JSON.stringify(session));

    window.location.href = '/test';
  } catch (err) {
    alert('Gagal memulai test baru: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
};

// ── Reset session and start fresh ──
window.resetSession = function (e) {
  e?.preventDefault();
  if (confirm('Ini akan menghapus data login dan API key kamu di browser ini. Lanjutkan?')) {
    localStorage.removeItem('pt_session');
    window.location.href = '/';
  }
};

window.toggleFb = function(header) {
  const body    = header.nextElementSibling;
  const chevron = header.querySelector('.feedback-chevron');
  const open    = body.classList.contains('open');
  body.classList.toggle('open', !open);
  chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
};

// ── Polling ──
let polls = 0;
async function poll() {
  try {
    const res  = await fetch(`/api/results/${resultId}`);
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    const data = await res.json();

    if (data.status === 'completed') { renderResults(data); return; }
    if (data.status === 'too_short') { showView('too-short'); return; }
    if (data.status === 'failed') {
      document.getElementById('error-msg').textContent =
        data.errorMessage || 'Analisis AI gagal. Pastikan API key valid dan coba lagi.';
      showView('error'); return;
    }

    if (++polls >= 40) {
      document.getElementById('error-msg').textContent = 'Analisis memakan waktu terlalu lama. Periksa koneksi internet.';
      showView('error'); return;
    }
    setTimeout(poll, 3000);
  } catch (err) {
    document.getElementById('error-msg').textContent = err.message;
    showView('error');
  }
}

poll();
