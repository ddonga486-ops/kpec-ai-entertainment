-- KPEC v0.9: dynamic question bank, maximum 20 questions.
-- Run once in Cloudflare D1 Console. Existing quiz questions and answers are preserved.
CREATE TABLE IF NOT EXISTS quiz_questions_dynamic (
 id INTEGER PRIMARY KEY CHECK(id BETWEEN 0 AND 19),
 question TEXT NOT NULL,
 choice_0 TEXT NOT NULL,
 choice_1 TEXT NOT NULL,
 choice_2 TEXT NOT NULL,
 choice_3 TEXT NOT NULL,
 correct_index INTEGER NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
 duration_seconds INTEGER NOT NULL DEFAULT 30 CHECK(duration_seconds BETWEEN 10 AND 180),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO quiz_questions_dynamic
 (id,question,choice_0,choice_1,choice_2,choice_3,correct_index,duration_seconds)
 SELECT id,question,choice_0,choice_1,choice_2,choice_3,correct_index,duration_seconds FROM quiz_questions;

CREATE TABLE IF NOT EXISTS quiz_answers_dynamic (
 participant_id TEXT NOT NULL REFERENCES participants(id),
 question_index INTEGER NOT NULL CHECK(question_index BETWEEN 0 AND 19),
 answer_index INTEGER NOT NULL CHECK(answer_index BETWEEN 0 AND 3),
 points INTEGER NOT NULL DEFAULT 0,
 submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(participant_id,question_index)
);
INSERT OR IGNORE INTO quiz_answers_dynamic
 (participant_id,question_index,answer_index,points,submitted_at)
 SELECT participant_id,question_index,answer_index,points,submitted_at FROM quiz_answers;
CREATE INDEX IF NOT EXISTS idx_quiz_answers_dynamic_participant ON quiz_answers_dynamic(participant_id);
