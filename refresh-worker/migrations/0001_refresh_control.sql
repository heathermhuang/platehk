CREATE TABLE IF NOT EXISTS refresh_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pending_id TEXT,
  pending_scope TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  cursor INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  last_outcome TEXT,
  last_error TEXT,
  last_published_at TEXT,
  last_run_id TEXT,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  no_change_count INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO refresh_control(id) VALUES(1);
