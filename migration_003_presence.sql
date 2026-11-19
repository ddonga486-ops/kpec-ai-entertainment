-- Run once in Cloudflare D1 Console after prior migrations.
ALTER TABLE participants ADD COLUMN last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_participants_last_seen ON participants(last_seen_at);
-- Existing historical registrations remain inactive until their browser checks in.
