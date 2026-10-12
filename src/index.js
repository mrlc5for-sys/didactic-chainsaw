import './db/db.js';
import { login as discordLogin } from './bot/client.js';
import { makeClient } from './bot/client.js';
import { bind } from './bot/events.js';
import { register, toJSON } from './bot/commands.js';
import { uploadEmojis, list as emojiList } from './bot/emoji.js';
import { REST, Routes } from 'discord.js';
import { TOKEN, CLIENT_ID } from './config.js';
import { start as startEngine, bindBotClient } from './engine.js';
import { startApi } from './api/server.js';
import { log, error } from './log.js';
import { getSetting } from './db/db.js';

async function deployCommands() {
  if (!TOKEN || !CLIENT_ID) {
    log('warn', 'no DISCORD_CLIENT_ID — skipping slash deploy');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: toJSON() });
    log('ok', `deployed ${toJSON().length} slash commands`);
  } catch (err) {
    log('error', `slash deploy: ${err.message}`);
  }
}

async function main() {
  log('info', 'soulzy booting…');
  globalThis.__soulzyMaint = getSetting('maintenance', '0');

  await startApi();

  if (!TOKEN) {
    log('warn', 'no DISCORD_TOKEN — bot offline, api only');
    return;
  }

  await uploadEmojis();
  await deployCommands();

  const client = makeClient();
  register(client);
  bind(client);
  await discordLogin(client);

  bindBotClient(client);
  startEngine();
  log('ok', 'soulzy ready');
}

main().catch(err => {
  error(`fatal: ${err.message}`);
  process.exit(1);
});
