import crypto from 'crypto';
import { db } from '../db/db.js';
import * as vault from './vault.js';
import { verify } from './validator.js';
import { PLANS, COOLDOWN_QUESTS, COOLDOWN_HOURS } from '../config.js';

function clean(id) { return String(id ?? '').trim().replace(/[<@!>]/g, ''); }

export function planLimit(userId) {
  const row = db.prepare('SELECT plan FROM users WHERE id = ?').get(clean(userId));
  const plan = row?.plan ?? 'free';
  return PLANS[plan]?.accounts ?? 1;
}

export function countFor(userId) {
  const r = db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?').get(clean(userId));
  return r?.n ?? 0;
}

export function list(userId) {
  return db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC').all(clean(userId));
}

export function getById(id) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(clean(id));
}

export function listEnabled() {
  return db.prepare('SELECT * FROM accounts WHERE enabled = 1').all();
}

export async function add(userId, token, label, proxy) {
  const uid = clean(userId);
  const limit = planLimit(uid);
  const used = countFor(uid);
  if (used >= limit) return { ok: false, reason: 'plan_limit', limit, used };
  const info = await verify(token);
  if (!info) return { ok: false, reason: 'invalid_token' };

  const existing = db.prepare('SELECT id FROM accounts WHERE id = ?').get(info.id);
  if (existing) return { ok: false, reason: 'already_linked', id: info.id };

  db.prepare(`INSERT INTO accounts (id, user_id, label, username, discord_id, avatar, proxy, enabled, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'idle')`)
    .run(info.id, uid, label ?? info.username, info.username, info.id, info.avatar, proxy ?? null);
  vault.put(info.id, token);
  return { ok: true, id: info.id, username: info.username, avatar: info.avatar };
}

export function remove(userId, id) {
  const row = getById(id);
  if (!row || row.user_id !== clean(userId)) return false;
  db.prepare('DELETE FROM accounts WHERE id = ?').run(row.id);
  vault.drop(row.id);
  return true;
}

export function setEnabled(id, enabled) {
  db.prepare('UPDATE accounts SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, clean(id));
}

export function setStatus(id, status) {
  db.prepare('UPDATE accounts SET status = ?, last_seen = ? WHERE id = ?').run(status, Date.now(), clean(id));
}

export function getToken(id) {
  return vault.get(clean(id));
}

export function ensureUser(id, username) {
  const uid = clean(id);
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (row) return row;
  db.prepare('INSERT INTO users (id, username, role, plan) VALUES (?, ?, ?, ?)').run(uid, username ?? null, 'user', 'free');
  return db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
}

export function setPlan(userId, plan) {
  const uid = clean(userId);
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!exists) {
    db.prepare('INSERT INTO users (id, username, role, plan) VALUES (?, ?, ?, ?)').run(uid, null, 'user', plan);
  } else {
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, uid);
  }
  const after = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  return { ok: true, id: uid, plan: after?.plan };
}

export function setRole(userId, role) {
  const uid = clean(userId);
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!exists) {
    db.prepare('INSERT INTO users (id, username, role, plan) VALUES (?, ?, ?, ?)').run(uid, null, role, 'free');
  } else {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, uid);
  }
  const after = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  return { ok: true, id: uid, role: after?.role };
}

export function getUser(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(clean(userId));
}

export function checkCooldown(userId) {
  const uid = clean(userId);
  const u = db.prepare('SELECT plan, quest_count, quest_reset_at FROM users WHERE id = ?').get(uid);
  if (!u || u.plan !== 'free') return { ok: true };
  const now = Date.now();
  if (u.quest_reset_at && u.quest_reset_at <= now) {
    db.prepare('UPDATE users SET quest_count = 0, quest_reset_at = NULL WHERE id = ?').run(uid);
    return { ok: true };
  }
  if (u.quest_reset_at && u.quest_reset_at > now) {
    return { ok: false, remaining: u.quest_reset_at - now, resetAt: u.quest_reset_at };
  }
  if ((u.quest_count ?? 0) >= COOLDOWN_QUESTS) {
    const resetAt = now + COOLDOWN_HOURS * 60 * 60 * 1000;
    db.prepare('UPDATE users SET quest_reset_at = ? WHERE id = ?').run(resetAt, uid);
    return { ok: false, remaining: COOLDOWN_HOURS * 60 * 60 * 1000, resetAt };
  }
  return { ok: true };
}

export function bumpUsage(userId) {
  const uid = clean(userId);
  const u = db.prepare('SELECT plan, quest_count FROM users WHERE id = ?').get(uid);
  if (!u || u.plan !== 'free') return;
  const n = (u.quest_count ?? 0) + 1;
  if (n >= COOLDOWN_QUESTS) {
    const resetAt = Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000;
    db.prepare('UPDATE users SET quest_count = ?, quest_reset_at = ? WHERE id = ?').run(n, resetAt, uid);
  } else {
    db.prepare('UPDATE users SET quest_count = ? WHERE id = ?').run(n, uid);
  }
}

export function bumpFailure(id) {
  const uid = clean(id);
  db.prepare('UPDATE accounts SET last_seen = ? WHERE id = ?').run(Date.now(), uid);
  const row = db.prepare('SELECT failure_count FROM accounts WHERE id = ?').get(uid);
  const n = (row?.failure_count ?? 0) + 1;
  db.prepare('UPDATE accounts SET failure_count = ? WHERE id = ?').run(n, uid);
  if (n >= 5) {
    db.prepare('UPDATE accounts SET enabled = 0, status = ? WHERE id = ?').run('disabled', uid);
  }
  return n;
}

export function clearFailure(id) {
  db.prepare('UPDATE accounts SET failure_count = 0 WHERE id = ?').run(clean(id));
}

export function usageInfo(userId) {
  const uid = clean(userId);
  const u = db.prepare('SELECT plan, quest_count, quest_reset_at FROM users WHERE id = ?').get(uid);
  if (!u) return { plan: 'free', used: 0, limit: COOLDOWN_QUESTS, resetAt: null };
  return { plan: u.plan, used: u.quest_count ?? 0, limit: COOLDOWN_QUESTS, resetAt: u.quest_reset_at ?? null };
}
