import { EventEmitter } from 'events';

export const logBus = new EventEmitter();
logBus.setMaxListeners(0);

const COLORS = {
  info:  '\x1b[96m',
  warn:  '\x1b[93m',
  error: '\x1b[91m',
  ok:    '\x1b[92m',
  dim:   '\x1b[90m',
  reset: '\x1b[0m'
};

export function log(level, msg, meta) {
  const ts = new Date().toISOString().slice(11, 19);
  const c = COLORS[level] ?? COLORS.info;
  console.log(`[${ts}] ${c}${level.toUpperCase().padEnd(5)}${COLORS.reset} ${msg}`);
  logBus.emit('log', { t: Date.now(), level, msg, meta: meta ?? null });
}

export const info = (m, x) => log('info', m, x);
export const warn = (m, x) => log('warn', m, x);
export const error = (m, x) => log('error', m, x);
export const ok = (m, x) => log('ok', m, x);
