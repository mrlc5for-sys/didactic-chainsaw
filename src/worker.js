import { getById, getToken, setStatus, bumpFailure, clearFailure } from './account/manager.js';
import { QuestClient, getQuests, filterValid, runQuest, claimAll } from './quests/index.js';
import { log } from './log.js';

export async function runSingle(accountId, questId, onProgress) {
  const acc = getById(accountId);
  if (!acc) return { ok: false, reason: 'account_not_found' };

  const token = getToken(accountId);
  if (!token) return { ok: false, reason: 'no_token' };

  const client = new QuestClient(token, acc.proxy || null);
  setStatus(accountId, 'running');

  let quests;
  try {
    const raw = await getQuests(client);
    quests = filterValid(raw);
    clearFailure(accountId);
  } catch (err) {
    const is401 = String(err.message).includes('401');
    if (is401) {
      const n = bumpFailure(accountId);
      setStatus(accountId, n >= 5 ? 'disabled' : 'error');
    } else {
      setStatus(accountId, 'error');
    }
    return { ok: false, reason: err.message };
  }

  if (questId) {
    const quest = quests.find(q => q.id === questId);
    if (!quest) {
      setStatus(accountId, 'idle');
      return { ok: false, reason: 'quest_not_found' };
    }
    const res = await runQuest(client, quest, accountId, onProgress);
    setStatus(accountId, 'idle');
    return res;
  }

  if (quests.length === 0) {
    setStatus(accountId, 'idle');
    return { ok: true, completed: 0, failed: 0 };
  }

  let ok = 0;
  let failed = 0;
  for (const quest of quests) {
    const res = await runQuest(client, quest, accountId, onProgress);
    if (res.ok) ok++;
    else failed++;
  }
  setStatus(accountId, 'idle');
  return { ok: true, completed: ok, failed };
}

export async function claimFor(accountId) {
  const acc = getById(accountId);
  if (!acc) return 0;
  const token = getToken(accountId);
  if (!token) return 0;
  const client = new QuestClient(token, acc.proxy || null);
  return claimAll(client, accountId);
}
