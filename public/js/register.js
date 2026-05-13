const form = document.getElementById('reg-form');
const alertBox = document.getElementById('alert-box');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');

function showAlert(msg) {
  alertBox.innerHTML = `<div class="alert alert-error"><span class="alert-icon">⚠️</span><span>${msg}</span></div>`;
  alertBox.style.display = 'block';
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setLoading(on) {
  submitBtn.disabled = on;
  btnText.style.display = on ? 'none' : 'inline';
  btnSpinner.style.display = on ? 'inline-block' : 'none';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertBox.style.display = 'none';

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const whatsapp = document.getElementById('whatsapp').value.trim();
  const eduEl = document.querySelector('input[name="education_level"]:checked');

  if (!name)    return showAlert('Nama lengkap wajib diisi.');
  if (!email)   return showAlert('Email wajib diisi.');
  if (!whatsapp) return showAlert('Nomor WhatsApp wajib diisi.');
  if (!eduEl)   return showAlert('Pilih jenjang pendidikan terlebih dahulu.');

  setLoading(true);

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, whatsapp, education_level: eduEl.value }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Registrasi gagal. Coba lagi.');

    // Store session (API key added later on /apikey page)
    // Preserve previously saved apiKey/tncAgreed if user is re-registering
    const prev = JSON.parse(localStorage.getItem('pt_session') || '{}');
    localStorage.setItem('pt_session', JSON.stringify({
      ...prev,
      registrationId: data.registrationId,
      name: data.name,
      email,
      whatsapp,
      educationLevel: data.educationLevel,
      question: data.question,
    }));

    window.location.href = '/thankyou';
  } catch (err) {
    showAlert(err.message);
    setLoading(false);
  }
});
