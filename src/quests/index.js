import { log } from '../log.js';
import { MAX_TASK_ATTEMPTS } from '../config.js';
import { enroll } from './enroll.js';
import { runVideo } from './video.js';
import { runDesktop } from './desktop.js';
import { runStream } from './stream.js';
import { runActivity } from './activity.js';
import { claimAll } from './claim.js';

export { QuestClient } from './client.js';
export { claimAll };

const RUNNERS = {
  WATCH_VIDEO: runVideo,
  WATCH_VIDEO_ON_MOBILE: runVideo,
  PLAY_ON_DESKTOP: runDesktop,
  STREAM_ON_DESKTOP: runStream,
  PLAY_ACTIVITY: runActivity
};

const attempts = new Map();
const stopFlags = new Set();

export function requestStop(accountId) { stopFlags.add(accountId); }
export function clearStop(accountId) { stopFlags.delete(accountId); }
export function isStopped(accountId) { return stopFlags.has(accountId); }
export function stoppedAccounts() { return [...stopFlags]; }
export function checkStop(accountId) {
  if (stopFlags.has(accountId)) throw new Error('__STOPPED__');
}

export function isSupported(taskName) {
  return taskName in RUNNERS;
}

export async function runQuest(client, quest, accountId, onProgress) {
  const name = quest.config?.messages?.quest_name ?? quest.id;
  const tc = quest.config?.task_config ?? quest.config?.task_config_v2;
  const tasks = tc?.tasks ?? {};
  const taskName = Object.keys(tasks).find(k => k in RUNNERS);

  if (!taskName) {
    log('warn', `unsupported: ${name}`);
    return { ok: false, reason: 'unsupported' };
  }

  const fails = attempts.get(`${accountId}:${quest.id}`) ?? 0;
  if (fails >= MAX_TASK_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  if (stopFlags.has(accountId)) return { ok: false, reason: 'stopped' };

  if (!quest.user_status?.enrolled_at) {
    const enrolled = await enroll(client, quest, accountId);
    if (!enrolled) return { ok: false, reason: 'enroll_failed' };
    try {
      const fresh = await client.fetchQuests();
      const up = fresh.quests?.find(q => q.id === quest.id);
      if (up) quest = up;
    } catch {}
  }

  const target = Number(tasks[taskName]?.target ?? 0);
  log('info', `start: ${name} [${taskName}]`);
  onProgress?.({ type: 'start', questId: quest.id, name, taskName, target });

  const shouldStop = () => stopFlags.has(accountId);
  let last = 0;
  const onTick = (cur, tar) => {
    if (shouldStop()) throw new Error('__STOPPED__');
    const now = Date.now();
    if (now - last > 1500) {
      last = now;
      log('info', `${name}: ${cur}/${tar}`);
      onProgress?.({ type: 'progress', questId: quest.id, name, cur, tar });
    }
  };

  const runner = RUNNERS[taskName];
  try {
    const ok = await runner(client, quest, tasks[taskName], taskName, onTick, shouldStop);
    if (ok) {
      attempts.delete(`${accountId}:${quest.id}`);
      onProgress?.({ type: 'done', questId: quest.id, name });
      await claimAll(client, accountId);
      log('ok', `done: ${name}`);
      return { ok: true, taskType: taskName };
    }
    attempts.set(`${accountId}:${quest.id}`, fails + 1);
    onProgress?.({ type: 'fail', questId: quest.id, name, reason: 'task_failed' });
    return { ok: false, reason: 'task_failed' };
  } catch (err) {
    if (err.message === '__STOPPED__') {
      onProgress?.({ type: 'stopped', questId: quest.id, name });
      log('warn', `stopped: ${name}`);
      return { ok: false, reason: 'stopped' };
    }
    attempts.set(`${accountId}:${quest.id}`, fails + 1);
    log('error', `${name}: ${err.message}`);
    onProgress?.({ type: 'fail', questId: quest.id, name, reason: err.message });
    return { ok: false, reason: err.message };
  } finally {
    stopFlags.delete(accountId);
  }
}

export async function getQuests(client) {
  const data = await client.fetchQuests();
  return data.quests ?? [];
}

export function filterValid(quests) {
  const now = Date.now();
  return quests.filter(q => {
    const exp = new Date(q.config?.expires_at ?? 0).getTime();
    if (exp <= now) return false;
    if (q.user_status?.completed_at) return false;
    const tc = q.config?.task_config ?? q.config?.task_config_v2;
    const tasks = tc?.tasks ?? {};
    return Object.keys(tasks).some(k => k in RUNNERS);
  });
}
