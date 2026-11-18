-- Cloudflare D1 Schema for clipboard.dulith.me

CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'text', -- text | markdown | code | image | file
  title TEXT DEFAULT '',
  language TEXT DEFAULT '',
  content TEXT DEFAULT '',
  r2_key TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  is_editable INTEGER NOT NULL DEFAULT 0,
  is_e2ee INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT DEFAULT '',
  password_salt TEXT DEFAULT '',
  max_views INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT DEFAULT NULL,
  client_name TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clips_expires_at ON clips(expires_at);
CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC);

CREATE TABLE IF NOT EXISTS short_urls (
  code TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  title TEXT DEFAULT '',
  expires_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS url_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  browser TEXT NOT NULL DEFAULT 'Unknown',
  os TEXT NOT NULL DEFAULT 'Unknown',
  device_type TEXT NOT NULL DEFAULT 'Desktop',
  country TEXT NOT NULL DEFAULT 'XX',
  referrer TEXT NOT NULL DEFAULT 'Direct',
  clicked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_url_clicks_code ON url_clicks(code);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('upload_policy', '{"textUpload":true,"fileUpload":true}', datetime('now'));
