import { ActivityType } from 'discord.js';
import { PREFIX } from '../config.js';
import { log } from '../log.js';

export function bind(client) {
  client.once('clientReady', () => {
    log('ok', `logged in as ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: `${PREFIX}help · soulzy.xyz`, type: ActivityType.Watching }],
      status: 'online'
    });
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try { await cmd.execute(interaction, client); }
    catch (err) {
      log('error', `cmd ${interaction.commandName}: ${err.message}`);
      const payload = { content: 'error', flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  });

  client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const name = args.shift().toLowerCase();
    const cmd = client.prefixCommands.get(name);
    if (!cmd) return;
    try { await cmd.prefixExecute(message, args, client); }
    catch (err) { log('error', `prefix ${name}: ${err.message}`); }
  });

  client.on('error', err => log('error', `client: ${err.message}`));

  client.on('guildCreate', guild => {
    log('ok', `joined guild: ${guild.name} (${guild.id})`);
  });
}
