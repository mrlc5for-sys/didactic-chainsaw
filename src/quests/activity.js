const INTERVAL = 20000;
const MAX_STALL = 10;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractStatus(res) {
  if (res && typeof res === 'object' && res.user_status) return res.user_status;
  return res;
}

export async function runActivity(client, quest, task, taskName, onTick, shouldStop) {
  const target = task.target;
  const streamKey = 'call:0:1';
  const maxMs = (target + 900) * 1000;
  const started = Date.now();
  let last = -1;
  let stall = 0;

  while (true) {
    if (shouldStop?.()) throw new Error('__STOPPED__');
    if (Date.now() - started > maxMs) return false;

    let res;
    try {
      res = await client.post(`/quests/${quest.id}/heartbeat`, { stream_key: streamKey, terminal: false });
    } catch {
      if (shouldStop?.()) throw new Error('__STOPPED__');
      await sleep(5000);
      continue;
    }

    if (shouldStop?.()) throw new Error('__STOPPED__');
    const status = extractStatus(res);
    if (status) quest.user_status = status;

    const done = Number(quest.user_status?.progress?.['PLAY_ACTIVITY']?.value ?? 0) || 0;
    onTick?.(done, target);
    if (done >= target || quest.user_status?.completed_at) break;

    stall = done > last ? 0 : stall + 1;
    last = done;
    if (stall >= MAX_STALL) return false;

    const step = 500;
    const wait = Math.ceil(INTERVAL / step);
    for (let i = 0; i < wait; i++) {
      if (shouldStop?.()) throw new Error('__STOPPED__');
      await sleep(step);
    }
  }

  try { await client.post(`/quests/${quest.id}/heartbeat`, { stream_key: streamKey, terminal: true }); } catch {}
  return true;
}
