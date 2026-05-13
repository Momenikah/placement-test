CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(50) NOT NULL,
  education_level VARCHAR(10) NOT NULL CHECK (education_level IN ('SD', 'SMP_SMA')),
  question TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  transcript TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  fluency_score SMALLINT CHECK (fluency_score BETWEEN 0 AND 100),
  pronunciation_score SMALLINT CHECK (pronunciation_score BETWEEN 0 AND 100),
  grammar_score SMALLINT CHECK (grammar_score BETWEEN 0 AND 100),
  vocabulary_score SMALLINT CHECK (vocabulary_score BETWEEN 0 AND 100),
  overall_score SMALLINT CHECK (overall_score BETWEEN 0 AND 100),
  fluency_feedback TEXT,
  pronunciation_feedback TEXT,
  grammar_feedback TEXT,
  vocabulary_feedback TEXT,
  general_feedback TEXT,
  level_result VARCHAR(50),
  cefr_level   VARCHAR(5),
  raw_analysis JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'too_short')
  ),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_results_registration_id
  ON test_results(registration_id);
