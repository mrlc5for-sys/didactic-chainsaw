import { ENROLL_LOCATIONS } from '../config.js';
import { log } from '../log.js';

const cache = new Map();

export async function enroll(client, quest, accountId) {
  const name = quest.config?.messages?.quest_name ?? quest.id;
  const cached = cache.get(accountId);
  const order = cached
    ? [cached, ...ENROLL_LOCATIONS.filter(l => l !== cached)]
    : ENROLL_LOCATIONS.slice();

  for (const loc of order) {
    try {
      await client.post(`/quests/${quest.id}/enroll`, {
        location: loc,
        is_targeted: false,
        metadata_raw: null
      });
      cache.set(accountId, loc);
      log('ok', `enrolled: ${name} (loc ${loc})`);
      return true;
    } catch { /* try next */ }
  }
  log('warn', `enroll failed: ${name}`);
  return false;
}
