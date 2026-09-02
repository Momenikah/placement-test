// Session guard
const session = JSON.parse(localStorage.getItem('pt_session') || 'null');
if (!session?.registrationId) window.location.href = '/';

const agreeBtn = document.getElementById('agree-btn');
const hint     = document.getElementById('progress-hint');

window.onCheck = function () {
  const checked = ['chk-1', 'chk-2', 'chk-3'].filter(id => document.getElementById(id).checked).length;

  ['1', '2', '3'].forEach(n => {
    document.getElementById(`tnc-${n}`).classList.toggle(
      'checked', document.getElementById(`chk-${n}`).checked
    );
  });

  if (checked === 3) {
    agreeBtn.disabled = false;
    hint.style.display = 'none';
  } else {
    agreeBtn.disabled = true;
    hint.style.display = 'block';
    hint.textContent = `${3 - checked} ketentuan lagi perlu dicentang`;
  }
};

window.agreeAndGo = function () {
  session.tncAgreed = true;
  localStorage.setItem('pt_session', JSON.stringify(session));
  window.location.href = '/test';
};
