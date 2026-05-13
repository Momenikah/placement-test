// Session guard
const session = JSON.parse(localStorage.getItem('pt_session') || 'null');
if (!session?.registrationId) window.location.href = '/';

const alertBox   = document.getElementById('alert-box');
const submitBtn  = document.getElementById('submit-btn');
const btnText    = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');

function showAlert(msg) {
  alertBox.innerHTML = `<div class="alert alert-error"><span class="alert-icon">⚠️</span><span>${msg}</span></div>`;
  alertBox.style.display = 'block';
}

window.toggleKey = function () {
  const input = document.getElementById('api-key');
  const icon  = document.getElementById('eye-icon');
  const hide  = input.type === 'password';
  input.type  = hide ? 'text' : 'password';
  icon.textContent = hide ? '🙈' : '👁️';
};

document.getElementById('apikey-form').addEventListener('submit', (e) => {
  e.preventDefault();
  alertBox.style.display = 'none';

  const apiKey = document.getElementById('api-key').value.trim();

  if (!apiKey) return showAlert('API key wajib diisi.');
  if (!apiKey.startsWith('AI')) {
    return showAlert('Format API key tidak valid. Gemini API key biasanya diawali dengan "AIza...".');
  }

  // Add apiKey to session and advance
  session.apiKey = apiKey;
  localStorage.setItem('pt_session', JSON.stringify(session));
  window.location.href = '/tnc';
});
