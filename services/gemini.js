const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// ── Model fallback chain (primary → fallbacks if overloaded) ──
const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const MAX_RETRIES_PER_MODEL = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// True if the error is transient (overload / network) and worth retrying
function isRetryable(err) {
  const msg = String(err?.message || '');
  const status = err?.status || err?.statusCode;
  if (status === 503 || status === 429 || status === 500) return true;
  return /503|429|overload|unavailable|high demand|temporarily|try again|fetch failed|ECONN|ETIMEDOUT/i.test(msg);
}

async function callModel(genAI, modelName, audioBase64, mimeType, prompt) {
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: audioBase64 } },
    { text: prompt },
  ]);
  return result.response.text().trim();
}

// Try each model in the chain with exponential backoff on retryable errors
async function generateWithFallback(genAI, audioBase64, mimeType, prompt) {
  let lastErr;
  for (const modelName of MODEL_CHAIN) {
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        const text = await callModel(genAI, modelName, audioBase64, mimeType, prompt);
        if (attempt > 1 || modelName !== MODEL_CHAIN[0]) {
          console.log(`✓ Gemini OK with ${modelName} (attempt ${attempt})`);
        }
        return text;
      } catch (err) {
        lastErr = err;
        const retryable = isRetryable(err);
        console.warn(`Gemini ${modelName} attempt ${attempt} failed: ${err.message?.substring(0, 120)}`);

        if (!retryable) throw err; // non-transient → bail immediately
        if (attempt < MAX_RETRIES_PER_MODEL) {
          await sleep(attempt * 2000); // 2s, 4s, 6s backoff
        }
      }
    }
    // exhausted retries on this model → try next
  }

  // All models exhausted
  const err = new Error(
    'Layanan AI sedang sibuk (semua model fallback overload). ' +
    'Mohon coba lagi dalam 2–5 menit.'
  );
  err.cause = lastErr;
  throw err;
}

async function analyzeAudio(audioBase64, mimeType, question, educationLevel, apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key tidak ditemukan.');

  const genAI = new GoogleGenerativeAI(key);

  const isSD = educationLevel === 'SD';
  const levelDesc = isSD
    ? 'Elementary school student (SD), age 6–12. Be gentle, encouraging, and age-appropriate.'
    : 'Junior/Senior high school student (SMP/SMA), age 12–18. Apply standard academic English expectations.';

  const cefrGuide = isSD
    ? 'Expected CEFR range for this age: A1–B1. Do not penalize harshly.'
    : 'Expected CEFR range for this level: A2–B2.';

  const prompt = `You are a senior English language examiner certified in CEFR (Common European Framework of Reference). Conduct a thorough speaking assessment of this audio recording.

Question asked: "${question}"
Student profile: ${levelDesc}
${cefrGuide}

Listen carefully and extract SPECIFIC evidence from what the student actually said.

Return ONLY a valid JSON object — no markdown, no text outside the JSON:

{
  "transcript": "Verbatim word-for-word transcript of everything the student said",

  "cefr_level": "A1|A2|B1|B2|C1|C2",
  "cefr_description": "One sentence describing this CEFR level",

  "fluency": {
    "score": <integer 0-100>,
    "feedback": "2-3 sentences summarising fluency quality",
    "strengths": ["specific strength 1", "specific strength 2"],
    "improvements": ["specific actionable improvement 1", "specific actionable improvement 2"],
    "filler_words": ["list", "of", "detected", "filler", "words"],
    "pace": "Natural | Too fast | Too slow | Inconsistent"
  },

  "pronunciation": {
    "score": <integer 0-100>,
    "feedback": "2-3 sentences summarising pronunciation quality",
    "strengths": ["specific strength 1"],
    "improvements": ["specific improvement 1"],
    "corrections": [
      {
        "word": "exact word the student mispronounced",
        "phonetic_correct": "IPA or simple phonetic e.g. /ˈkʌmftəbəl/",
        "tip": "short practical tip on how to say it correctly"
      }
    ]
  },

  "grammar": {
    "score": <integer 0-100>,
    "feedback": "2-3 sentences summarising grammar quality",
    "strengths": ["specific strength 1", "specific strength 2"],
    "improvements": ["specific improvement 1", "specific improvement 2"],
    "errors": [
      {
        "original": "exact phrase the student said (quote from transcript)",
        "corrected": "the grammatically correct version",
        "rule": "grammar rule name e.g. Subject-verb agreement, Past tense, Article usage"
      }
    ]
  },

  "vocabulary": {
    "score": <integer 0-100>,
    "feedback": "2-3 sentences summarising vocabulary quality",
    "strengths": ["specific strength 1"],
    "improvements": ["specific improvement 1"],
    "impressive_words": ["words they used well that show good vocabulary"],
    "upgrades": [
      {
        "basic_word": "simple word they over-used or that could be upgraded",
        "alternatives": ["stronger word 1", "stronger word 2", "stronger word 3"]
      }
    ]
  },

  "overall_feedback": "3-4 encouraging sentences: highlight their best quality, most impactful area to improve, and close with motivation",
  "strengths_summary": ["Top strength 1", "Top strength 2", "Top strength 3"],
  "improvement_plan": [
    "Specific actionable step 1 (e.g. 'Practise the /θ/ sound in words like think, three, through daily')",
    "Specific actionable step 2",
    "Specific actionable step 3"
  ],
  "encouragement": "One warm, personalised motivational sentence"
}

SCORING RUBRIC (adjust expectations to student age/level):
- 85-100: Excellent — near-native, very few errors
- 70-84: Good — clear communication, minor errors
- 55-69: Intermediate — understandable, noticeable errors
- 40-54: Elementary — basic communication, frequent errors
- 0-39: Beginner — very limited, major errors

IMPORTANT:
- Quote exact phrases from the transcript for grammar errors and vocabulary
- If no pronunciation errors detected, return "corrections": []
- If no grammar errors detected, return "errors": []
- If no vocabulary upgrades needed, return "upgrades": []
- Strengths and improvement_plan must be specific to THIS student's speech
- Be constructive and encouraging throughout`;

  const raw = await generateWithFallback(genAI, audioBase64, mimeType, prompt);
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Gagal parse respons Gemini: ' + raw.substring(0, 300));
  }

  // Ensure arrays exist even if Gemini omits them
  parsed.fluency.filler_words        = parsed.fluency.filler_words        || [];
  parsed.fluency.strengths           = parsed.fluency.strengths           || [];
  parsed.fluency.improvements        = parsed.fluency.improvements        || [];
  parsed.pronunciation.corrections   = parsed.pronunciation.corrections   || [];
  parsed.pronunciation.strengths     = parsed.pronunciation.strengths     || [];
  parsed.pronunciation.improvements  = parsed.pronunciation.improvements  || [];
  parsed.grammar.errors              = parsed.grammar.errors              || [];
  parsed.grammar.strengths           = parsed.grammar.strengths           || [];
  parsed.grammar.improvements        = parsed.grammar.improvements        || [];
  parsed.vocabulary.upgrades         = parsed.vocabulary.upgrades         || [];
  parsed.vocabulary.impressive_words = parsed.vocabulary.impressive_words || [];
  parsed.vocabulary.strengths        = parsed.vocabulary.strengths        || [];
  parsed.vocabulary.improvements     = parsed.vocabulary.improvements     || [];
  parsed.strengths_summary           = parsed.strengths_summary           || [];
  parsed.improvement_plan            = parsed.improvement_plan            || [];

  return parsed;
}

module.exports = { analyzeAudio };
