CREATE TABLE IF NOT EXISTS refresh_pending_sources (
  url TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL,
  baseline_sha256 TEXT,
  observed_at TEXT NOT NULL
);
