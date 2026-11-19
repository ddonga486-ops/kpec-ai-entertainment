-- Run once against the D1 database (Cloudflare dashboard -> D1 -> Console)
CREATE TABLE IF NOT EXISTS event_state (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 stage TEXT NOT NULL DEFAULT 'lobby',
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO event_state(id,stage,revision) VALUES (1,'lobby',0);
CREATE TABLE IF NOT EXISTS teams (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 score INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO teams(id,name) VALUES ('star-lab','STAR LAB'),('dream-makers','DREAM MAKERS'),('neon-wave','NEON WAVE'),('next-idol','NEXT IDOL');
CREATE TABLE IF NOT EXISTS participants (
 id TEXT PRIMARY KEY,
 team_id TEXT NOT NULL REFERENCES teams(id),
 display_name TEXT NOT NULL,
 joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS idol_projects (
 team_id TEXT PRIMARY KEY REFERENCES teams(id),
 data_json TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS score_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 team_id TEXT NOT NULL REFERENCES teams(id),
 delta INTEGER NOT NULL,
 actor_role TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
