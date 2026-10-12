const INTERVAL = 30000;
const MAX_ERRORS = 5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractStatus(res) {
  if (res && typeof res === 'object' && res.user_status) return res.user_status;
  return res;
}

function readProgress(quest, eventName, taskName) {
  const p = quest.user_status?.progress;
  if (!p) return 0;
  return Number(p[eventName]?.value ?? p[taskName]?.value ?? 0) || 0;
}

export async function runDesktop(client, quest, task, taskName, onTick, shouldStop) {
  const target = task.target;
  const eventName = task.event_name ?? task.type ?? taskName;
  const maxMs = (target + 600) * 1000;
  const started = Date.now();
  let errors = 0;

  while (true) {
    if (shouldStop?.()) throw new Error('__STOPPED__');
    if (Date.now() - started > maxMs) {
      try { await client.post(`/quests/${quest.id}/heartbeat`, { stream_key: null, terminal: true }); } catch {}
      return false;
    }

    try {
      const res = await client.post(`/quests/${quest.id}/heartbeat`, { stream_key: null, terminal: false });
      const status = extractStatus(res);
      if (status) quest.user_status = status;
      errors = 0;
    } catch {
      if (shouldStop?.()) throw new Error('__STOPPED__');
      errors++;
      if (errors >= MAX_ERRORS) return false;
      await sleep(5000);
      continue;
    }

    if (shouldStop?.()) throw new Error('__STOPPED__');
    const done = readProgress(quest, eventName, taskName);
    onTick?.(done, target);
    if (done >= target || quest.user_status?.completed_at) break;

    const step = 500;
    const wait = Math.ceil(INTERVAL / step);
    for (let i = 0; i < wait; i++) {
      if (shouldStop?.()) throw new Error('__STOPPED__');
      await sleep(step);
    }
  }

  try { await client.post(`/quests/${quest.id}/heartbeat`, { stream_key: null, terminal: true }); } catch {}
  return true;
}
