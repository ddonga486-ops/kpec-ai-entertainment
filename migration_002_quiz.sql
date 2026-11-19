-- KPEC AI ENTERTAINMENT: apply once in Cloudflare D1 Console
-- Each participant may submit each question once; never duplicate points.
CREATE TABLE IF NOT EXISTS quiz_answers (
  participant_id TEXT NOT NULL REFERENCES participants(id),
  question_index INTEGER NOT NULL CHECK(question_index BETWEEN 0 AND 2),
  answer_index INTEGER NOT NULL CHECK(answer_index BETWEEN 0 AND 3),
  points INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (participant_id, question_index)
);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_participant ON quiz_answers(participant_id);
