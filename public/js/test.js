// ── Session guard ──
const session = JSON.parse(localStorage.getItem('pt_session') || 'null');
if (!session?.registrationId || !session?.tncAgreed) {
  window.location.href = '/';
}

// ── Constants ──
const MAX_SECONDS  = 120; // 2 minutes
const MIN_SECONDS  = 60;  // 1 minute minimum
const CIRCUMF      = 389.6; // 2 * π * 62

// ── DOM ──
const stateIdle      = document.getElementById('state-idle');
const stateRec       = document.getElementById('state-recording');
const stateReview    = document.getElementById('state-review');
const stateUploading = document.getElementById('state-uploading');
const alertBox       = document.getElementById('alert-box');
const countdownNum   = document.getElementById('countdown-num');
const countdownLabel = document.getElementById('countdown-label');
const ringArc        = document.getElementById('ring-arc');
const durationText   = document.getElementById('duration-text');
const submitBtn      = document.getElementById('submit-btn');
const submitText     = document.getElementById('submit-text');
const submitSpinner  = document.getElementById('submit-spinner');
const preCountdown   = document.getElementById('pre-countdown');
const preNum         = document.getElementById('pre-num');

// ── Init ──
document.getElementById('student-name').textContent = `Halo, ${session.name}!`;
document.getElementById('question-text').textContent = session.question;

if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
  document.getElementById('unsupported-warn').style.display = 'flex';
  stateIdle.style.display = 'none';
}

// ── State ──
let mediaRecorder    = null;
let audioChunks      = [];
let audioBlob        = null;
let recordedMimeType = '';
let timerInterval    = null;
let remainingSeconds = MAX_SECONDS;
let elapsedSeconds   = 0;

// ── Helpers ──
function showState(name) {
  [stateIdle, stateRec, stateReview, stateUploading].forEach(el => el.style.display = 'none');
  document.getElementById(`state-${name}`).style.display = 'block';
}

function showAlert(msg, type = 'error') {
  const icon = type === 'error' ? '⚠️' : '✅';
  alertBox.innerHTML = `<div class="alert alert-${type}"><span class="alert-icon">${icon}</span><span>${msg}</span></div>`;
  alertBox.style.display = 'block';
}

function hideAlert() { alertBox.style.display = 'none'; }

function fmt(secs) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// ── Ring animation ──
function updateRing(remaining) {
  // Arc shrinks as time runs out (offset increases from 0 → CIRCUMF)
  const progress  = (MAX_SECONDS - remaining) / MAX_SECONDS; // 0 → 1
  const offset    = progress * CIRCUMF;
  ringArc.style.strokeDashoffset = offset;

  // Color transitions
  if (remaining > MIN_SECONDS) {
    // In "too short" zone — orange
    ringArc.style.stroke     = 'var(--warning)';
    countdownNum.style.color = 'var(--warning)';
    countdownLabel.style.color = 'var(--warning)';
    countdownLabel.textContent = `Terus berbicara! (${remaining - MIN_SECONDS}s lagi mencapai syarat)`;
  } else if (remaining > 10) {
    // Valid zone — green
    ringArc.style.stroke     = 'var(--success)';
    countdownNum.style.color = 'var(--success)';
    countdownLabel.style.color = 'var(--success)';
    countdownLabel.textContent = 'Bagus! Kamu bisa berhenti kapan saja';
  } else {
    // Last 10 seconds — red
    ringArc.style.stroke     = 'var(--danger)';
    countdownNum.style.color = 'var(--danger)';
    countdownLabel.style.color = 'var(--danger)';
    countdownLabel.textContent = remaining > 0
      ? `Hampir selesai — ${remaining}s tersisa`
      : 'Waktu habis — rekaman dihentikan';
  }

  countdownNum.textContent = fmt(remaining);
}

// ── Pre-recording 3-2-1 countdown ──
function showPreCountdown(from) {
  return new Promise((resolve) => {
    preCountdown.style.display = 'flex';
    let n = from;
    preNum.textContent = n;

    const tick = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(tick);
        preCountdown.style.display = 'none';
        resolve();
      } else {
        preNum.textContent = n;
      }
    }, 800);
  });
}

// ── Start ──
async function startRecording() {
  hideAlert();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    await showPreCountdown(3);
    beginRecording(stream);
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showAlert('Akses mikrofon ditolak. Izinkan akses mikrofon di pengaturan browser kamu.');
    } else {
      showAlert('Gagal mengakses mikrofon: ' + err.message);
    }
  }
}

function beginRecording(stream) {
  audioChunks      = [];
  remainingSeconds = MAX_SECONDS;
  elapsedSeconds   = 0;

  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  const mime       = candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
  recordedMimeType = mime.split(';')[0] || 'audio/webm';

  mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = finalizeRecording;
  mediaRecorder.start(500);

  showState('recording');
  updateRing(MAX_SECONDS); // init ring at full

  timerInterval = setInterval(() => {
    remainingSeconds--;
    elapsedSeconds = MAX_SECONDS - remainingSeconds;
    updateRing(remainingSeconds);
    if (remainingSeconds <= 0) stopRecording();
  }, 1000);
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  clearInterval(timerInterval);
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach(t => t.stop());
}

function finalizeRecording() {
  audioBlob      = new Blob(audioChunks, { type: recordedMimeType });
  elapsedSeconds = MAX_SECONDS - remainingSeconds;

  const reviewOk    = document.getElementById('review-ok');
  const reviewShort = document.getElementById('review-short');

  if (elapsedSeconds < MIN_SECONDS) {
    reviewOk.style.display    = 'none';
    reviewShort.style.display = 'flex';
    document.getElementById('short-text').textContent =
      `Kamu hanya berbicara ${elapsedSeconds} detik. Minimal 60 detik untuk mendapat nilai.`;
    submitBtn.disabled = true;
  } else {
    reviewOk.style.display    = 'flex';
    reviewShort.style.display = 'none';
    document.getElementById('duration-text').textContent =
      `Durasi: ${fmt(elapsedSeconds)} ✓`;
    submitBtn.disabled = false;
    hideAlert();
  }

  showState('review');
}

function resetRecording() {
  audioBlob        = null;
  audioChunks      = [];
  remainingSeconds = MAX_SECONDS;
  elapsedSeconds   = 0;
  hideAlert();
  showState('idle');
  updateRing(MAX_SECONDS);
}

async function submitRecording() {
  if (!audioBlob || elapsedSeconds < MIN_SECONDS) return;

  submitText.style.display   = 'none';
  submitSpinner.style.display = 'inline-block';
  submitBtn.disabled = true;
  showState('uploading');

  try {
    const ext = recordedMimeType.split('/')[1] || 'webm';
    const formData = new FormData();
    formData.append('audio', audioBlob, `recording.${ext}`);
    formData.append('registrationId', session.registrationId);
    formData.append('duration', String(elapsedSeconds));
    formData.append('mimeType', recordedMimeType);
    const res  = await fetch('/api/test/submit', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Upload gagal.');

    localStorage.setItem('pt_session', JSON.stringify({
      name:           session.name,
      email:          session.email,
      whatsapp:       session.whatsapp,
      educationLevel: session.educationLevel,
      tncAgreed:      session.tncAgreed,
    }));
    window.location.href = `/results?id=${data.resultId}`;
  } catch (err) {
    showState('review');
    showAlert(err.message);
    submitText.style.display   = 'inline';
    submitSpinner.style.display = 'none';
    submitBtn.disabled = false;
  }
}

// Expose to onclick
window.startRecording  = startRecording;
window.stopRecording   = stopRecording;
window.resetRecording  = resetRecording;
window.submitRecording = submitRecording;
