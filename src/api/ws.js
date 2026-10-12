import { logBus } from '../log.js';

const clients = new Set();

export function attachWs(app) {
  app.get('/ws/logs', { websocket: true }, (socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
    socket.send(JSON.stringify({ type: 'hello', t: Date.now() }));
  });

  logBus.on('log', entry => {
    const msg = JSON.stringify({ type: 'log', ...entry });
    for (const c of clients) {
      try { c.send(msg); } catch { clients.delete(c); }
    }
  });
}

export function broadcast(type, payload) {
  const msg = JSON.stringify({ type, ...payload });
  for (const c of clients) {
    try { c.send(msg); } catch { clients.delete(c); }
  }
}
