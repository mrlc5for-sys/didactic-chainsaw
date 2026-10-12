import { listEnabled, getToken, setStatus } from './account/manager.js';
import { QuestClient, getQuests, filterValid, runQuest } from './quests/index.js';
import { log } from './log.js';

const queues = new Map();
const running = new Set();
const idle = new Set();
let interval = null;
let onEvent = () => {};

export function setEventHandler(fn) { onEvent = fn; }

function emit(type, payload) { try { onEvent(type, payload); } catch {} }

async function processAccount(acc) {
  if (running.has(acc.id)) return;
  const token = getToken(acc.id);
  if (!token) return;

  running.add(acc.id);
  setStatus(acc.id, 'scanning');
  emit('account', { id: acc.id, status: 'scanning' });

  const client = new QuestClient(token, acc.proxy || null);
  let quests = [];
  try {
    const raw = await getQuests(client);
    quests = filterValid(raw);
  } catch (err) {
    setStatus(acc.id, 'error');
    emit('account', { id: acc.id, status: 'error', reason: err.message });
    running.delete(acc.id);
    return;
  }

  if (quests.length === 0) {
    setStatus(acc.id, 'idle');
    emit('account', { id: acc.id, status: 'idle' });
    idle.add(acc.id);
    running.delete(acc.id);
    return;
  }

  idle.delete(acc.id);
  for (const quest of quests) {
    if (!running.has(acc.id)) break;
    setStatus(acc.id, 'running');
    emit('account', { id: acc.id, status: 'running', quest: quest.config?.messages?.quest_name ?? quest.id });
    const res = await runQuest(client, quest, acc.id);
    emit('quest', {
      accountId: acc.id,
      questId: quest.id,
      name: quest.config?.messages?.quest_name ?? quest.id,
      ok: res.ok,
      reason: res.reason ?? null,
      taskType: res.taskType ?? null
    });
  }

  setStatus(acc.id, 'idle');
  emit('account', { id: acc.id, status: 'idle' });
  running.delete(acc.id);
  idle.add(acc.id);
}

async function tick() {
  const accounts = listEnabled();
  for (const acc of accounts) {
    if (running.has(acc.id)) continue;
    if (idle.has(acc.id) && queues.get(acc.id) === 'paused') continue;
    await processAccount(acc);
  }
}

export function startScheduler(ms = 60000) {
  if (interval) return;
  log('info', 'scheduler started');
  tick().catch(err => log('error', `scheduler tick: ${err.message}`));
  interval = setInterval(() => {
    tick().catch(err => log('error', `scheduler tick: ${err.message}`));
  }, ms);
}

export function stopScheduler() {
  if (interval) clearInterval(interval);
  interval = null;
}

export function pauseAccount(id) { queues.set(id, 'paused'); }
export function resumeAccount(id) { queues.delete(id); idle.delete(id); }
export function isRunning(id) { return running.has(id); }
export function accountState(id) {
  if (running.has(id)) return 'running';
  if (idle.has(id)) return 'idle';
  return 'queued';
}
