import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
if (!existsSync(DATA_DIR)) {
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.error('mkdir data failed:', e.message); }
}

const DB_PATH = join(DATA_DIR, 'soulzy.db');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

const schemaPath = join(process.cwd(), 'src', 'db', 'schema.sql');
const schema = readFileSync(schemaPath, 'utf8');
db.exec(schema);

const migrations = [
  "ALTER TABLE users ADD COLUMN quest_count INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN quest_reset_at INTEGER",
  "ALTER TABLE users ADD COLUMN plan_expires_at INTEGER",
  "ALTER TABLE orders ADD COLUMN provider TEXT",
  "ALTER TABLE orders ADD COLUMN provider_ref TEXT",
  "ALTER TABLE orders ADD COLUMN currency TEXT DEFAULT 'usd'",
  "ALTER TABLE orders ADD COLUMN updated_at INTEGER",
  "ALTER TABLE users ADD COLUMN password_hash TEXT",
  "ALTER TABLE accounts ADD COLUMN failure_count INTEGER DEFAULT 0"
];
for (const m of migrations) { try { db.exec(m); } catch {} }

db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
db.exec('CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, key_hash TEXT NOT NULL, preview TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), last_used INTEGER)');

export function getSetting(key, fallback = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r?.value ?? fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
