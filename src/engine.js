import { startScheduler, stopScheduler, setEventHandler, pauseAccount, resumeAccount, accountState } from './scheduler.js';
import { runSingle, claimFor } from './worker.js';
import { list, listEnabled, add, remove, setEnabled, getById } from './account/manager.js';
import { requestStop, clearStop, isStopped, stoppedAccounts } from './quests/index.js';
import { log } from './log.js';

let handlers = [];
let discordClient = null;

export function bindBotClient(client) { discordClient = client; }

async function notifyQuestDone(accountId, questName) {
  if (!discordClient) return;
  try {
    const { getById } = await import('./account/manager.js');
    const acc = getById(accountId);
    if (!acc) return;
    const user = await discordClient.users.fetch(acc.user_id).catch(() => null);
    if (!user) return;
    const dm = await user.createDM().catch(() => null);
    if (!dm) return;
    const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = await import('discord.js');
    const { e } = await import('./bot/emoji.js');
    const c = new ContainerBuilder().setAccentColor(0x34d399);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${e('online')} **Quest completed**\n\n**${questName}**\n-# account \`${accountId}\``
    ));
    await dm.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  } catch {}
}

export function start() {
  setEventHandler((type, payload) => {
    for (const h of handlers) { try { h(type, payload); } catch {} }
    if (type === 'quest' && payload && payload.ok) {
      notifyQuestDone(payload.accountId, payload.name).catch(() => {});
    }
  });
  startScheduler();
  log('ok', 'engine online');
}

export function stop() {
  stopScheduler();
  log('warn', 'engine stopped');
}

export function on(fn) {
  handlers.push(fn);
  return () => { handlers = handlers.filter(h => h !== fn); };
}

export function abortAccount(accountId) {
  requestStop(accountId);
  return true;
}

export function abortAll() {
  const all = listEnabled();
  for (const a of all) requestStop(a.id);
  return all.length;
}

export { list, listEnabled, add, remove, setEnabled, getById, pauseAccount, resumeAccount, accountState, runSingle, claimFor, clearStop, isStopped, stoppedAccounts };
