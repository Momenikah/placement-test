const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB || 'Sheet1';
const KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
  path.join(__dirname, '..', 'credentials', 'service-account.json');

const HEADER = [
  'Timestamp', 'Nama', 'Email', 'WhatsApp', 'Jenjang', 'Question', 'Durasi',
  'Fluency', 'Pronunciation', 'Grammar', 'Vocabulary', 'Overall',
  'Level', 'CEFR', 'PDF Link',
];

let cachedClient = null;
async function getSheets() {
  if (cachedClient) return cachedClient;
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  cachedClient = google.sheets({ version: 'v4', auth: await auth.getClient() });
  return cachedClient;
}

async function ensureHeader(sheets) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1:O1`,
  });
  if (data.values && data.values.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER] },
  });
}

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtTimestamp() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

async function appendResult({ registration, analysis, overallScore, levelResult, durationSeconds, resultId }) {
  if (!SHEET_ID) {
    console.warn('⚠️  GOOGLE_SHEETS_ID not set — skipping sheet append');
    return;
  }

  const sheets = await getSheets();
  await ensureHeader(sheets);

  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
  const pdfLink = baseUrl ? `${baseUrl}/api/results/${resultId}/pdf` : '';

  const row = [
    fmtTimestamp(),
    registration.name,
    registration.email,
    registration.whatsapp,
    registration.education_level === 'SD' ? 'SD' : 'SMP/SMA',
    registration.question,
    fmtDuration(durationSeconds),
    analysis.fluency.score,
    analysis.pronunciation.score,
    analysis.grammar.score,
    analysis.vocabulary.score,
    overallScore,
    levelResult,
    analysis.cefr_level || '',
    pdfLink,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:O`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  console.log(`📊 Sheet updated → ${registration.name} (${SHEET_TAB})`);
}

module.exports = { appendResult };
