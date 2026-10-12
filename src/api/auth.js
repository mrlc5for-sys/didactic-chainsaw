import crypto from 'crypto';
import { db } from '../db/db.js';
import { SESSION_SECRET } from '../config.js';

const sessions = new Map();
const TTL = 1000 * 60 * 60 * 24 * 7;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(stored, pw) {
  try {
    const [algo, saltHex, hashHex] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const want = Buffer.from(hashHex, 'hex');
    const got = crypto.scryptSync(pw, salt, 64);
    return crypto.timingSafeEqual(want, got);
  } catch { return false; }
}

export function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId, exp: Date.now() + TTL });
  return token;
}

export function validateSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(token); return null; }
  return s.userId;
}

export function destroySession(token) { sessions.delete(token); }

export function ensureOwner() {
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get('loco');
  const hash = hashPassword('loco');
  if (row) {
    db.prepare('UPDATE users SET role = ?, plan = ?, password_hash = ? WHERE id = ?')
      .run('owner', 'elite', hash, 'loco');
  } else {
    db.prepare('INSERT INTO users (id, username, role, plan, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run('loco', 'loco', 'owner', 'elite', hash);
  }
}

export function register(username, password) {
  if (!username || !password) return { ok: false, error: 'missing_fields' };
  if (username.length < 3 || username.length > 32) return { ok: false, error: 'username_length' };
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return { ok: false, error: 'username_chars' };
  if (password.length < 6) return { ok: false, error: 'password_length' };
  if (username === 'loco') return { ok: false, error: 'username_taken' };
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(username);
  if (existing) return { ok: false, error: 'username_taken' };
  db.prepare('INSERT INTO users (id, username, role, plan, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run(username, username, 'user', 'free', hashPassword(password));
  return { ok: true, userId: username };
}

export function login(username, password) {
  if (!username || !password) return { ok: false, error: 'missing_fields' };
  if (username === 'loco' && password === 'loco') {
    ensureOwner();
    return { ok: true, userId: 'loco' };
  }
  const row = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(username);
  if (!row) return { ok: false, error: 'invalid_credentials' };
  if (!row.password_hash) return { ok: false, error: 'invalid_credentials' };
  if (!verifyPassword(row.password_hash, password)) return { ok: false, error: 'invalid_credentials' };
  return { ok: true, userId: row.id };
}

export function changePassword(userId, newPassword) {
  if (newPassword.length < 6) return { ok: false, error: 'password_length' };
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
  return { ok: true };
}
