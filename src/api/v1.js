import { validateKey } from './keys.js';
import * as engine from '../engine.js';
import { list as listAccounts, getById } from '../account/manager.js';
import { db } from '../db/db.js';

export function registerV1(app) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/v1/')) return;
    const auth = req.headers['authorization'] ?? '';
    const raw = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!raw) { req.apiUserId = null; return; }
    req.apiUserId = validateKey(raw);
  });

  app.get('/api/v1/me', async (req, reply) => {
    if (!req.apiUserId) return reply.code(401).send({ error: 'unauthorized' });
    const u = db.prepare('SELECT id, username, role, plan FROM users WHERE id = ?').get(req.apiUserId);
    return { user: u };
  });

  app.get('/api/v1/accounts', async (req, reply) => {
    if (!req.apiUserId) return reply.code(401).send({ error: 'unauthorized' });
    const rows = listAccounts(req.apiUserId).map(a => ({
      id: a.id, label: a.label, username: a.username, status: a.status, enabled: !!a.enabled
    }));
    return { data: rows };
  });

  app.post('/api/v1/accounts/:id/run', async (req, reply) => {
    if (!req.apiUserId) return reply.code(401).send({ error: 'unauthorized' });
    const acc = getById(req.params.id);
    if (!acc || acc.user_id !== req.apiUserId) return reply.code(404).send({ error: 'not_found' });
    const res = await engine.runSingle(req.params.id, req.body?.questId ?? null);
    return res;
  });

  app.post('/api/v1/accounts/:id/claim', async (req, reply) => {
    if (!req.apiUserId) return reply.code(401).send({ error: 'unauthorized' });
    const acc = getById(req.params.id);
    if (!acc || acc.user_id !== req.apiUserId) return reply.code(404).send({ error: 'not_found' });
    const claimed = await engine.claimFor(req.params.id);
    return { ok: true, claimed };
  });

  app.get('/api/v1/quests/:accountId', async (req, reply) => {
    if (!req.apiUserId) return reply.code(401).send({ error: 'unauthorized' });
    const acc = getById(req.params.accountId);
    if (!acc || acc.user_id !== req.apiUserId) return reply.code(404).send({ error: 'not_found' });
    const { QuestClient, getQuests, filterValid } = await import('../quests/index.js');
    const { getToken } = await import('../account/manager.js');
    const client = new QuestClient(getToken(acc.id), acc.proxy ?? null);
    const raw = await getQuests(client);
    const valid = filterValid(raw);
    return { data: valid.map(q => ({ id: q.id, name: q.config?.messages?.quest_name, type: Object.keys((q.config?.task_config ?? q.config?.task_config_v2)?.tasks ?? {})[0] })) };
  });

  app.get('/api/v1/logs', async (req, reply) => {
    if (!req.apiUserId) return reply.code(401).send({ error: 'unauthorized' });
    const rows = db.prepare('SELECT * FROM quest_logs WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ?) ORDER BY created_at DESC LIMIT 100').all(req.apiUserId);
    return { data: rows };
  });
}
