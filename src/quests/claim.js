import { CLAIM_SKIP_IDS } from '../config.js';
import { log } from '../log.js';

export async function claimAll(client, accountId) {
  let claimed = 0;
  let data;
  try { data = await client.fetchQuests(); } catch { return 0; }

  for (const q of data.quests ?? []) {
    if (CLAIM_SKIP_IDS.has(q.id)) continue;
    const st = q.user_status;
    if (!st?.completed_at || st?.claimed_at) continue;
    try {
      await client.post(`/quests/${q.id}/claim-reward`, {});
      claimed++;
      log('ok', `claimed: ${q.config?.messages?.quest_name ?? q.id}`);
    } catch (err) {
      log('warn', `claim failed: ${q.id} — ${err.message}`);
    }
  }
  return claimed;
}
