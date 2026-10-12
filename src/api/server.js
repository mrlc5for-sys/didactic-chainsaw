import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { PORT, SESSION_SECRET } from '../config.js';
import { registerRoutes } from './routes.js';
import { attachWs } from './ws.js';
import { handleRampexWebhook } from './rampex.js';
import { registerV1 } from './v1.js';
import { validateSession, ensureOwner } from './auth.js';
import { log } from '../log.js';

export async function startApi() {
  ensureOwner();
  const app = Fastify({ logger: false });

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    if (req.url.startsWith('/api/webhooks/')) return done(null, body);
    try { done(null, JSON.parse(body.toString('utf8'))); }
    catch (err) { done(err, null); }
  });

  await app.register(cookie, { secret: SESSION_SECRET });
  await app.register(websocket);
  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'public'),
    prefix: '/'
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (req.url === '/api/login') return;
    if (req.url.startsWith('/api/webhooks/')) return;
    const token = req.cookies?.soulzy;
    if (!token) { req.userId = null; return; }
    req.userId = validateSession(token);
  });


  app.post('/api/webhooks/rampex', async (req, reply) => {
    const sig = req.headers['x-rampex-signature'] || req.headers['x-webhook-signature'];
    const r = await handleRampexWebhook(req.body, sig);
    return r.ok ? { received: true } : reply.code(400).send(r);
  });

  registerRoutes(app);
  registerV1(app);
  attachWs(app);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  log('ok', `api listening on :${PORT}`);
  return app;
}
