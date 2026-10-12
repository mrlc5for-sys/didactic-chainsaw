import crypto from 'crypto';
import { db } from '../db/db.js';

function hash(k) {
  return crypto.createHash('sha256').update(k).digest('hex');
}

export function createKey(userId) {
  const raw = 'sk_' + crypto.randomBytes(24).toString('hex');
  const id = crypto.randomUUID();
  const preview = raw.slice(0, 10) + '...' + raw.slice(-4);
  db.prepare('INSERT INTO api_keys (id, user_id, key_hash, preview) VALUES (?, ?, ?, ?)')
    .run(id, userId, hash(raw), preview);
  return { id, key: raw, preview };
}

export function listKeys(userId) {
  return db.prepare('SELECT id, preview, created_at, last_used FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function revokeKey(userId, id) {
  const r = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, userId);
  return r.changes > 0;
}

export function validateKey(raw) {
  const h = hash(raw);
  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(h);
  if (!row) return null;
  db.prepare('UPDATE api_keys SET last_used = unixepoch() WHERE id = ?').run(row.id);
  return row.user_id;
}
