CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  role TEXT DEFAULT 'user',
  plan TEXT DEFAULT 'free',
  plan_expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT,
  username TEXT,
  discord_id TEXT,
  avatar TEXT,
  proxy TEXT,
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'idle',
  last_seen INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS quest_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT,
  quest_id TEXT,
  quest_name TEXT,
  task_type TEXT,
  status TEXT,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS blocks (
  user_id TEXT PRIMARY KEY,
  until INTEGER,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  provider TEXT NOT NULL,
  provider_ref TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_account ON quest_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(provider_ref);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  preview TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  last_used INTEGER
);

CREATE INDEX IF NOT EXISTS idx_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash);
