-- KPEC v0.7: Run once in Cloudflare D1 Console
CREATE TABLE IF NOT EXISTS quiz_control (
 id INTEGER PRIMARY KEY CHECK(id=1),
 question_index INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'waiting',
 duration_seconds INTEGER NOT NULL DEFAULT 30,
 closes_at INTEGER,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO quiz_control(id,question_index,status,duration_seconds,closes_at)
VALUES(1,0,'waiting',30,NULL);
