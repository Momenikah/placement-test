require('dotenv').config();

const KIE_ENDPOINT = 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions';
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryable(status, msg) {
  if (status === 503 || status === 429 || status === 500 || status === 502 || status === 504) return true;
  return /overload|unavailable|temporarily|try again|fetch failed|ECONN|ETIMEDOUT/i.test(msg || '');
}

async function callKie(apiKey, audioUrl, prompt) {
  const body = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: audioUrl } },
        ],
      },
    ],
    stream: false,
  };

  const resp = await fetch(KIE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`kie.ai error ${resp.status}: ${text.substring(0, 300)}`);
    err.status = resp.status;
    throw err;
  }

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('kie.ai returned non-JSON: ' + text.substring(0, 200)); }

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content) throw new Error('kie.ai response missing content: ' + text.substring(0, 200));
  return typeof content === 'string' ? content.trim() : String(content).trim();
}

async function generateWithRetry(apiKey, audioUrl, prompt) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const out = await callKie(apiKey, audioUrl, prompt);
      if (attempt > 1) console.log(`✓ kie.ai OK (attempt ${attempt})`);
      return out;
    } catch (err) {
      lastErr = err;
      console.warn(`kie.ai attempt ${attempt} failed: ${err.message?.substring(0, 160)}`);
      if (!isRetryable(err.status, err.message)) throw err;
      if (attempt < MAX_RETRIES) await sleep(attempt * 2000);
    }
  }
  const err = new Error('Layanan AI sedang sibuk. Mohon coba lagi dalam 2–5 menit.');
  err.cause = lastErr;
  throw err;
}

async function analyzeAudio(audioUrl, mimeType, question, educationLevel) {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error('KIE_API_KEY tidak ditemukan di .env.');
  if (!/^https?:\/\//i.test(audioUrl)) {
    throw new Error('audioUrl harus berupa URL publik (http/https), bukan: ' + audioUrl.substring(0, 60));
  }

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

  const raw = await generateWithRetry(key, audioUrl, prompt);
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Gagal parse respons kie.ai: ' + raw.substring(0, 300));
  }

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
