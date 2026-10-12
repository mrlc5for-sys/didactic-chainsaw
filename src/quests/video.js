const SPEED = 7;
const INTERVAL = 1000;
const MAX_FUTURE = 10;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function readProgress(quest, eventName, taskName) {
  const p = quest.user_status?.progress;
  if (!p) return 0;
  return Number(p[eventName]?.value ?? p[taskName]?.value ?? 0) || 0;
}

export async function runVideo(client, quest, task, taskName, onTick, shouldStop) {
  const target = task.target;
  const eventName = task.event_name ?? task.type ?? taskName;
  const enrolledAt = quest.user_status?.enrolled_at ? new Date(quest.user_status.enrolled_at).getTime() : Date.now();
  let done = readProgress(quest, eventName, taskName);

  while (true) {
    if (shouldStop?.()) throw new Error('__STOPPED__');
    const elapsed = Math.floor((Date.now() - enrolledAt) / 1000);
    const maxAllowed = elapsed + MAX_FUTURE;
    const diff = maxAllowed - done;
    const ts = done + SPEED;

    if (diff >= SPEED) {
      let res;
      try {
        res = await client.post(`/quests/${quest.id}/video-progress`, {
          timestamp: Math.min(target, ts + Math.random())
        });
      } catch (err) {
        if (shouldStop?.()) throw new Error('__STOPPED__');
        await sleep(INTERVAL);
        continue;
      }
      if (shouldStop?.()) throw new Error('__STOPPED__');
      done = Math.min(target, ts);
      onTick?.(done, target);
      if (res?.completed_at || res?.user_status?.completed_at) return true;
    }

    if (done >= target) return true;
    await sleep(INTERVAL);
  }
}
