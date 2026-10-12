import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { TOKEN } from '../config.js';

export function makeClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel]
  });
  client.commands = new Collection();
  client.prefixCommands = new Collection();
  return client;
}

export async function login(client) {
  if (!TOKEN) throw new Error('DISCORD_TOKEN missing');
  await client.login(TOKEN);
  return client;
}
