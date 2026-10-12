import { sanitize, validFormat } from '../account/validator.js';
import * as engine from '../engine.js';
import { ensureUser, getUser, setPlan, list as listAccounts, getById as getAccount } from '../account/manager.js';
import { PLANS } from '../config.js';
import { db } from '../db/db.js';
import { createSession, destroySession } from './auth.js';

export function registerRoutes(app) {
  app.post('/api/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    const { login, createSession, ensureOwner } = await import('./auth.js');
    ensureOwner();
    const r = login(username, password);
    if (!r.ok) return reply.code(401).send({ error: 'invalid_credentials' });
    const token = createSession(r.userId);
    reply.setCookie('soulzy', token, { path: '/', httpOnly: true, sameSite: 'lax' });
    const u = getUser(r.userId) ?? { id: r.userId, role: 'user', plan: 'free' };
    return { ok: true, user: { name: r.userId, role: u.role, plan: u.plan } };
  });

  app.post('/api/signup', async (req, reply) => {
    const { username, password } = req.body ?? {};
    const { register, createSession } = await import('./auth.js');
    const r = register(username, password);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    const token = createSession(r.userId);
    reply.setCookie('soulzy', token, { path: '/', httpOnly: true, sameSite: 'lax' });
    return { ok: true, user: { name: r.userId, role: 'user', plan: 'free' } };
  });

  app.post('/api/logout', async (req, reply) => {
    const token = req.cookies?.soulzy;
    if (token) destroySession(token);
    reply.clearCookie('soulzy', { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const user = getUser(userId) ?? { id: userId, role: 'user', plan: 'free' };
    return { user };
  });

  app.get('/api/accounts', async req => {
    const userId = req.userId;
    if (!userId) return { data: [] };
    const rows = listAccounts(userId).map(a => ({
      id: a.id,
      label: a.label,
      username: a.username,
      avatar: a.avatar,
      proxy: a.proxy,
      enabled: !!a.enabled,
      status: a.status
    }));
    return { data: rows };
  });

  app.post('/api/accounts', async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const { token, label, proxy } = req.body ?? {};
    const clean = sanitize(token ?? '');
    if (!validFormat(clean)) return reply.code(400).send({ error: 'invalid_token' });
    const res = await engine.add(userId, clean, label ?? null, proxy ?? null);
    if (!res.ok) return reply.code(400).send(res);
    return res;
  });

  app.delete('/api/accounts/:id', async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const ok = engine.remove(userId, req.params.id);
    return { ok };
  });

  app.post('/api/accounts/:id/run', async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const acc = getAccount(req.params.id);
    if (!acc) return reply.code(404).send({ error: 'not_found' });
    const user = getUser(userId);
    if (acc.user_id !== userId && user?.role !== 'owner') return reply.code(403).send({ error: 'forbidden' });
    const res = await engine.runSingle(req.params.id, req.body?.questId ?? null);
    return res;
  });

  app.post('/api/accounts/:id/claim', async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const acc = getAccount(req.params.id);
    if (!acc) return reply.code(404).send({ error: 'not_found' });
    const user = getUser(userId);
    if (acc.user_id !== userId && user?.role !== 'owner') return reply.code(403).send({ error: 'forbidden' });
    const claimed = await engine.claimFor(req.params.id);
    return { ok: true, claimed };
  });

  app.get('/api/logs', async req => {
    const userId = req.userId;
    const user = getUser(userId);
    const rows = user?.role === 'owner'
      ? db.prepare('SELECT * FROM quest_logs ORDER BY created_at DESC LIMIT 200').all()
      : [];
    return { data: rows };
  });

  app.get('/api/plans', async () => ({ data: PLANS }));

  app.post('/api/buy', async (req, reply) => {
    const userId = req.userId;
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const plan = String(req.body?.plan ?? '').toLowerCase();
    const provider = String(req.body?.provider ?? 'stripe').toLowerCase();
    if (!PLANS[plan] || plan === 'free') return reply.code(400).send({ error: 'invalid_plan' });
    try {
      const { createCryptoInvoice } = await import('./payments.js');
      const { createRampexCheckout } = await import('./rampex.js');
      if (provider === 'rampex' || provider === 'upi') {
        const r = await createRampexCheckout(userId, plan);
        return { ok: true, url: r.url, provider: 'rampex' };
      }
      const r = await createCryptoInvoice(userId, plan);
      return { ok: true, url: r.url, provider: 'crypto' };
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.get('/api/orders', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'unauthorized' });
    const { listOrders } = await import('./payments.js');
    return { data: listOrders(req.userId) };
  });

  app.get('/api/admin/users', async (req, reply) => {
    const me = getUser(req.userId);
    if (me?.role !== 'owner') return reply.code(403).send({ error: 'forbidden' });
    const rows = db.prepare('SELECT id, username, role, plan, created_at FROM users ORDER BY created_at DESC').all();
    return { data: rows };
  });

  app.post('/api/admin/users/:id/plan', async (req, reply) => {
    const me = getUser(req.userId);
    if (me?.role !== 'owner') return reply.code(403).send({ error: 'forbidden' });
    const plan = String(req.body?.plan ?? '').toLowerCase();
    if (!PLANS[plan]) return reply.code(400).send({ error: 'invalid_plan' });
    setPlan(req.params.id, plan);
    return { ok: true };
  });

  app.get('/api/keys', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'unauthorized' });
    const { listKeys } = await import('./keys.js');
    return { data: listKeys(req.userId) };
  });

  app.post('/api/keys', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'unauthorized' });
    const { createKey } = await import('./keys.js');
    const k = createKey(req.userId);
    return { ok: true, id: k.id, key: k.key, preview: k.preview };
  });

  app.delete('/api/keys/:id', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'unauthorized' });
    const { revokeKey } = await import('./keys.js');
    const ok = revokeKey(req.userId, req.params.id);
    return { ok };
  });
}