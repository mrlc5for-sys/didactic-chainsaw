import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } from 'discord.js';
import { e } from './emoji.js';
import { PREFIX, PLANS, OWNER_IDS, BOT_STATUS } from '../config.js';
import * as engine from '../engine.js';
import { ensureUser, getUser, list as listAccounts, checkCooldown, bumpUsage, usageInfo } from '../account/manager.js';
import { sanitize, validFormat } from '../account/validator.js';

function txt(c) { return new TextDisplayBuilder().setContent(c); }

function card(content, accent) {
  const c = new ContainerBuilder();
  if (accent) c.setAccentColor(accent);
  c.addTextDisplayComponents(txt(content));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function isDev(userId) {
  if (OWNER_IDS.includes(userId)) return true;
  const u = getUser(userId);
  return u?.role === 'owner' || u?.role === 'admin';
}

function devBadge(userId) {
  return isDev(userId) ? ' `[DEV]`' : '';
}

function statusGate(userId) {
  if (isDev(userId)) return null;
  const maint = (globalThis.__soulzyMaint ?? '0') === '1';
  if (BOT_STATUS === 'online' && !maint) return null;
  return card(`${e('maintenance')} **SOULZY UNDER MAINTENANCE**\n\nBot is temporarily unavailable.\nJoin the support server for updates.`, 0xfee75c);
}

function cooldownGate(userId) {
  if (isDev(userId)) return null;
  const c = checkCooldown(userId);
  if (c.ok) return null;
  const ts = Math.floor(c.resetAt / 1000);
  const info = usageInfo(userId);
  return card(`${e('warning')} **FREE COOLDOWN**\n\nYou've used all **${info.limit}** free quests.\n\n⏳ resets <t:${ts}:R>\n\n${e('buy')} upgrade with \`/plans\` to remove cooldown`, 0xfee75c);
}

async function gate(interaction, opts = {}) {
  const status = statusGate(interaction.user.id);
  if (status) { await interaction.reply({ ...status, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }); return false; }
  if (opts.cooldown) {
    const cd = cooldownGate(interaction.user.id);
    if (cd) { await interaction.reply({ ...cd, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }); return false; }
  }
  return true;
}

async function gatePrefix(message, opts = {}) {
  const status = statusGate(message.author.id);
  if (status) { await message.channel.send(status); return false; }
  if (opts.cooldown) {
    const cd = cooldownGate(message.author.id);
    if (cd) { await message.channel.send(cd); return false; }
  }
  return true;
}

function buildHelpBody(user, dev) {
  const lines = [];
  lines.push(`# ${e('info')} SOULZY`);
  lines.push(`Autonomous Discord quest engine`);
  lines.push(`prefix: \`${PREFIX}\` · slash: \`/\``);
  lines.push('');
  lines.push(`## ${e('discord')} ACCOUNT`);
  lines.push(`\`/link <token>\` · \`${PREFIX}link <token>\` — link an account`);
  lines.push(`\`/unlink <id>\` · \`${PREFIX}unlink <id>\` — remove account`);
  lines.push(`\`/profile\` · \`${PREFIX}profile\` — your accounts & plan`);
  lines.push('');
  lines.push(`## ${e('currentquest')} QUESTS`);
  lines.push(`\`/quest <id>\` · \`${PREFIX}quest <id>\` — run one quest`);
  lines.push(`\`/questall <id>\` · \`${PREFIX}questall <id>\` — run all quests`);
  lines.push(`\`/questlist <id>\` · \`${PREFIX}questlist <id>\` — list quests`);
  lines.push(`\`/claim <id>\` · \`${PREFIX}claim <id>\` — claim rewards`);
  lines.push('');
  lines.push(`## ${e('buy')} PLANS`);
  lines.push(`\`/plans\` · \`${PREFIX}plans\` — view plans & pricing`);
  lines.push(`\`/buy <plan>\` · \`${PREFIX}buy <plan>\` — purchase`);
  lines.push('');
  lines.push(`## ${e('info')} UTILITY`);
  lines.push(`\`/ping\` · \`${PREFIX}ping\` — latency`);
  lines.push(`\`/help\` · \`${PREFIX}help\` — this menu`);

  if (dev) {
    lines.push('');
    lines.push(`## ${e('ownerinfo')} DEV`);
    lines.push(`\`/dev\` · \`${PREFIX}dev\` — dev info & ids`);
    lines.push(`\`/users\` · \`${PREFIX}users\` — all users`);
    lines.push(`\`/setplan <user> <plan>\` · \`${PREFIX}setplan\` — set plan`);
    lines.push(`\`/setrole <user> <role>\` · \`${PREFIX}setrole\` — set role`);
    lines.push(`\`/stats\` · \`${PREFIX}stats\` — engine stats`);
  }

  lines.push('');
  lines.push(`-# signed in as **${user.username}**${devBadge(user.id)}`);
  return lines.join('\n');
}


const __linkRateLimit = new Map();
function checkLinkRate(userId) {
  const now = Date.now();
  const last = __linkRateLimit.get(userId) ?? 0;
  if (now - last < 60000) return Math.ceil((60000 - (now - last)) / 1000);
  __linkRateLimit.set(userId, now);
  return 0;
}

async function sendWelcomeDM(user, client) {
  try {
    const dm = await user.createDM();
    const lines = [
      `# ${e('online')} WELCOME TO SOULZY`,
      ``,
      `Your account is now linked and ready.`,
      ``,
      `**Next steps:**`,
      '/' + PREFIX + 'quest <id> — run quests',
      '/' + PREFIX + 'profile — check status',
      '/' + PREFIX + 'plans — see paid tiers',
      ``,
      `**Free plan:** 1 account · 5 quests / 4h cooldown`,
      `**Pro:** 10 accounts · no cooldown · ₹499`,
      `**Elite:** 50 accounts · auto-joiner · ₹999`,
      ``,
      `-# support: discord.gg/soulzy`
    ].join('\n');
    await dm.send(card(lines, 0x22d3ee));
  } catch {}
}

export const help = {
  data: new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
  prefix: 'help',
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const dev = isDev(interaction.user.id);
    const body = buildHelpBody(interaction.user, dev);
    await interaction.editReply(card(body, 0x22d3ee));
  },
  async prefixExecute(message) {
    const dev = isDev(message.author.id);
    const body = buildHelpBody(message.author, dev);
    await message.channel.send(card(body, 0x22d3ee));
  }
};

export const ping = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Latency'),
  prefix: 'ping',
  async execute(interaction) {
    const ws = interaction.client.ws.ping;
    const t = Date.now();
    await interaction.deferReply();
    const rest = Date.now() - t;
    const dev = isDev(interaction.user.id);
    let body = `${e('online')} ws \`${ws}ms\` · rest \`${rest}ms\``;
    if (dev) body += `\n${e('ownerinfo')} uptime \`${Math.floor(process.uptime())}s\` · status \`${BOT_STATUS}\``;
    await interaction.editReply(card(body, 0x34d399));
  },
  async prefixExecute(message, _a, client) {
    const ws = client.ws.ping;
    const t = Date.now();
    const sent = await message.reply('...');
    const rest = Date.now() - t;
    const dev = isDev(message.author.id);
    let body = `${e('online')} ws \`${ws}ms\` · rest \`${rest}ms\``;
    if (dev) body += `\n${e('ownerinfo')} uptime \`${Math.floor(process.uptime())}s\` · status \`${BOT_STATUS}\``;
    await sent.edit({ content: '', ...card(body, 0x34d399) });
  }
};

export const link = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link a Discord account')
    .addStringOption(o => o.setName('token').setDescription('user token').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('optional label').setRequired(false))
    .addStringOption(o => o.setName('proxy').setDescription('optional proxy url').setRequired(false)),
  prefix: 'link',
  async execute(interaction) {
    if (!await gate(interaction)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const userId = interaction.user.id;
    ensureUser(userId, interaction.user.username);
    const raw = interaction.options.getString('token');
    const label = interaction.options.getString('label');
    const proxy = interaction.options.getString('proxy');
    const token = sanitize(raw);
    if (!validFormat(token)) {
      return interaction.editReply(card(`${e('error')} invalid token format`, 0xed4245));
    }
    const wait = checkLinkRate(userId);
    if (wait > 0) {
      return interaction.editReply(card(`${e('warning')} slow down · try again in ${wait}s`, 0xfee75c));
    }
    const res = await engine.add(userId, token, label, proxy);
    if (!res.ok) {
      if (res.reason === 'plan_limit') {
        return interaction.editReply(card(`${e('warning')} plan limit reached (${res.used}/${res.limit})\n${e('buy')} upgrade with \`/plans\``, 0xfee75c));
      }
      if (res.reason === 'already_linked') {
        return interaction.editReply(card(`${e('warning')} this account is already linked\n${e('info')} id \`${res.id}\``, 0xfee75c));
      }
      return interaction.editReply(card(`${e('error')} ${res.reason}`, 0xed4245));
    }
    await interaction.editReply(card(`${e('online')} linked **${res.username}**\n${e('info')} id \`${res.id}\``, 0x34d399));
    sendWelcomeDM(interaction.user, interaction.client).catch(() => {});
  },
  async prefixExecute(message, args, client) {
    if (!await gatePrefix(message)) return;
    const token = sanitize(args[0] ?? '');
    if (!token) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}link <token>\``, 0xed4245));
    ensureUser(message.author.id, message.author.username);
    if (!validFormat(token)) return message.channel.send(card(`${e('error')} invalid token format`, 0xed4245));
    try { await message.delete(); } catch {}
    const res = await engine.add(message.author.id, token, null, null);
    const dm = await message.author.createDM().catch(() => null);
    const payload = res.ok
      ? card(`${e('online')} linked **${res.username}**`, 0x34d399)
      : card(`${e('error')} ${res.reason}`, 0xed4245);
    if (dm) await dm.send(payload).catch(() => {});
  }
};

export const unlink = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Remove a linked account')
    .addStringOption(o => o.setName('id').setDescription('account id').setRequired(true)),
  prefix: 'unlink',
  async execute(interaction) {
    const id = interaction.options.getString('id');
    const ok = engine.remove(interaction.user.id, id);
    await interaction.reply({
      ...card(ok ? `${e('online')} account removed` : `${e('error')} not found`, ok ? 0x34d399 : 0xed4245),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  },
  async prefixExecute(message, args) {
    const id = args[0];
    if (!id) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}unlink <id>\``, 0xed4245));
    const ok = engine.remove(message.author.id, id);
    await message.channel.send(card(ok ? `${e('online')} account removed` : `${e('error')} not found`, ok ? 0x34d399 : 0xed4245));
  }
};

export const profile = {
  data: new SlashCommandBuilder().setName('profile').setDescription('Your accounts and plan'),
  prefix: 'profile',
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    ensureUser(interaction.user.id, interaction.user.username);
    const dev = isDev(interaction.user.id);
    await interaction.editReply(card(buildProfile(interaction.user, dev), 0x22d3ee));
  },
  async prefixExecute(message) {
    ensureUser(message.author.id, message.author.username);
    const dev = isDev(message.author.id);
    await message.channel.send(card(buildProfile(message.author, dev), 0x22d3ee));
  }
};

function buildProfile(user, dev) {
  const u = getUser(user.id);
  const accounts = listAccounts(user.id);
  const plan = PLANS[u?.plan ?? 'free'];
  const usage = usageInfo(user.id);
  const lines = [];
  lines.push(`# ${e('devinfo')} ${user.username}`);
  lines.push(`**Discord ID:** \`${user.id}\``);
  lines.push(`**Plan:** ${plan.name} · ${accounts.length}/${plan.accounts}`);
  if (u?.plan === 'free') {
    if (usage.resetAt && usage.resetAt > Date.now()) {
      const ts = Math.floor(usage.resetAt / 1000);
      lines.push(`**Cooldown:** ⏳ resets <t:${ts}:R>`);
    } else {
      lines.push(`**Free quests:** ${usage.used}/${usage.limit}`);
    }
  }
  if (dev) {
    lines.push(`**Role:** \`${u?.role ?? 'user'}\``);
    lines.push(`**Bot status:** \`${BOT_STATUS}\``);
  }
  lines.push('');
  if (accounts.length === 0) {
    lines.push(`${e('idle')} no accounts linked`);
  } else {
    for (const a of accounts) {
      lines.push(`${e(a.enabled ? 'online' : 'idle')} **${a.username}** · \`${a.id.slice(0, 8)}\` · ${a.status}`);
    }
  }
  return lines.join('\n');
}

function progressBar(cur, tar, len = 18) {
  const pct = tar > 0 ? Math.min(100, Math.round((cur / tar) * 100)) : 0;
  const filled = Math.round((pct / 100) * len);
  return '\`' + '█'.repeat(filled) + '░'.repeat(len - filled) + '\` **' + pct + '%**';
}

function renderProgress(state) {
  const lines = [];
  const title = state.status === 'done' ? 'COMPLETED' : state.status === 'failed' ? 'FAILED' : 'RUNNING';
  const icon = state.status === 'done' ? e('online') : state.status === 'failed' ? e('error') : e('currentquest');
  lines.push(`# ${icon} ${title}`);
  lines.push('');
  lines.push(`**${state.name}**`);
  if (state.taskType) lines.push(`-# ${state.taskType}`);
  lines.push('');
  if (state.status === 'running') {
    lines.push(progressBar(state.cur, state.tar));
    const left = state.tar > state.cur ? Math.ceil((state.tar - state.cur) / 60) : 0;
    lines.push(`-# ${state.cur}s / ${state.tar}s` + (left ? `  ·  ~${left} min left` : ''));
  } else if (state.status === 'done') {
    lines.push(progressBar(state.tar || 1, state.tar || 1));
  } else if (state.status === 'failed') {
    lines.push(`-# ${state.reason ?? 'unknown error'}`);
  }
  return lines.join('\n');
}

export const quest = {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Run one quest')
    .addStringOption(o => o.setName('id').setDescription('account id').setRequired(true)),
  prefix: 'quest',
  async execute(interaction) {
    if (!await gate(interaction, { cooldown: true })) return;
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const acc = engine.getById(id);
    const dev = isDev(interaction.user.id);
    if (!acc || (acc.user_id !== interaction.user.id && !dev)) {
      return interaction.editReply(card(`${e('error')} account not found`, 0xed4245));
    }

    const { QuestClient, getQuests, filterValid } = await import('../quests/index.js');
    const { getToken } = await import('../account/manager.js');
    const client = new QuestClient(getToken(id), acc.proxy ?? null);

    await interaction.editReply(card(`${e('currentquest')} **scanning quests...**`, 0x22d3ee));

    let valid = [];
    try {
      const raw = await getQuests(client);
      valid = filterValid(raw);
    } catch (err) {
      return interaction.editReply(card(`${e('error')} ${err.message}`, 0xed4245));
    }

    if (valid.length === 0) {
      return interaction.editReply(card(`${e('idle')} no quests available on this account`, 0x94a3b8));
    }

    const list = valid.slice(0, 8).map((q, i) => {
      const n = q.config?.messages?.quest_name ?? q.id;
      const tc = q.config?.task_config ?? q.config?.task_config_v2;
      const task = Object.keys(tc?.tasks ?? {})[0] ?? '?';
      return `**${i + 1}.** ${n}\n-# ${task}`;
    }).join('\n');
    await interaction.editReply(card(
      `${e('currentquests')} **found ${valid.length} quest${valid.length > 1 ? 's' : ''}**\n\n${list}\n\n-# starting first...`,
      0x22d3ee
    ));

    const first = valid[0];
    const state = {
      name: first.config?.messages?.quest_name ?? first.id,
      taskType: null,
      cur: 0,
      tar: 0,
      status: 'running',
      reason: null
    };

    let lastEdit = 0;
    const update = async (force) => {
      const now = Date.now();
      if (!force && now - lastEdit < 2500) return;
      lastEdit = now;
      const accent = state.status === 'done' ? 0x34d399 : state.status === 'failed' ? 0xed4245 : 0x22d3ee;
      await interaction.editReply(card(renderProgress(state), accent)).catch(() => {});
    };

    const onProgress = async (ev) => {
      if (ev.type === 'start') {
        state.name = ev.name;
        state.taskType = ev.taskName;
        state.tar = ev.target;
        state.cur = 0;
        state.status = 'running';
      } else if (ev.type === 'progress') {
        state.cur = ev.cur;
        state.tar = ev.tar;
      } else if (ev.type === 'done') {
        state.status = 'done';
        state.cur = state.tar || state.cur;
        await update(true);
        return;
      } else if (ev.type === 'fail') {
        state.status = 'failed';
        state.reason = ev.reason;
        await update(true);
        return;
      }
      await update(false);
    };

    const res = await engine.runSingle(id, first.id, onProgress);
    if (!dev) bumpUsage(interaction.user.id);

    if (res.ok) {
      state.status = 'done';
      state.cur = state.tar || state.cur;
    } else if (state.status !== 'failed') {
      state.status = 'failed';
      state.reason = res.reason;
    }
    await update(true);
  },
  async prefixExecute(message, args) {
    if (!await gatePrefix(message, { cooldown: true })) return;
    const id = args[0];
    if (!id) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}quest <id>\``, 0xed4245));
    const acc = engine.getById(id);
    const dev = isDev(message.author.id);
    if (!acc || (acc.user_id !== message.author.id && !dev)) {
      return message.channel.send(card(`${e('error')} account not found`, 0xed4245));
    }

    const { QuestClient, getQuests, filterValid } = await import('../quests/index.js');
    const { getToken } = await import('../account/manager.js');
    const client = new QuestClient(getToken(id), acc.proxy ?? null);

    const sent = await message.channel.send(card(`${e('currentquest')} **scanning quests...**`, 0x22d3ee));

    let valid = [];
    try {
      const raw = await getQuests(client);
      valid = filterValid(raw);
    } catch (err) {
      return sent.edit({ content: '', ...card(`${e('error')} ${err.message}`, 0xed4245) });
    }

    if (valid.length === 0) {
      return sent.edit({ content: '', ...card(`${e('idle')} no quests available on this account`, 0x94a3b8) });
    }

    const list = valid.slice(0, 8).map((q, i) => {
      const n = q.config?.messages?.quest_name ?? q.id;
      const tc = q.config?.task_config ?? q.config?.task_config_v2;
      const task = Object.keys(tc?.tasks ?? {})[0] ?? '?';
      return `**${i + 1}.** ${n}\n-# ${task}`;
    }).join('\n');
    await sent.edit({ content: '', ...card(
      `${e('currentquests')} **found ${valid.length} quest${valid.length > 1 ? 's' : ''}**\n\n${list}\n\n-# starting first...`,
      0x22d3ee
    ) });

    const first = valid[0];
    const state = {
      name: first.config?.messages?.quest_name ?? first.id,
      taskType: null,
      cur: 0,
      tar: 0,
      status: 'running',
      reason: null
    };

    let lastEdit = 0;
    const update = async (force) => {
      const now = Date.now();
      if (!force && now - lastEdit < 2500) return;
      lastEdit = now;
      const accent = state.status === 'done' ? 0x34d399 : state.status === 'failed' ? 0xed4245 : 0x22d3ee;
      await sent.edit({ content: '', ...card(renderProgress(state), accent) }).catch(() => {});
    };

    const onProgress = async (ev) => {
      if (ev.type === 'start') {
        state.name = ev.name;
        state.taskType = ev.taskName;
        state.tar = ev.target;
        state.cur = 0;
        state.status = 'running';
      } else if (ev.type === 'progress') {
        state.cur = ev.cur;
        state.tar = ev.tar;
      } else if (ev.type === 'done') {
        state.status = 'done';
        state.cur = state.tar || state.cur;
        await update(true);
        return;
      } else if (ev.type === 'fail') {
        state.status = 'failed';
        state.reason = ev.reason;
        await update(true);
        return;
      }
      await update(false);
    };

    const res = await engine.runSingle(id, first.id, onProgress);
    if (!dev) bumpUsage(message.author.id);

    if (res.ok) {
      state.status = 'done';
      state.cur = state.tar || state.cur;
    } else if (state.status !== 'failed') {
      state.status = 'failed';
      state.reason = res.reason;
    }
    await update(true);
  }
};

export const questall = {
  data: new SlashCommandBuilder()
    .setName('questall')
    .setDescription('Run all quests')
    .addStringOption(o => o.setName('id').setDescription('account id').setRequired(true)),
  prefix: 'questall',
  async execute(interaction) {
    if (!await gate(interaction, { cooldown: true })) return;
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const acc = engine.getById(id);
    const dev = isDev(interaction.user.id);
    if (!acc || (acc.user_id !== interaction.user.id && !dev)) {
      return interaction.editReply(card(`${e('error')} account not found`, 0xed4245));
    }
    const res = await engine.runSingle(id);
    if (!dev) bumpUsage(interaction.user.id);
    let body = res.ok
      ? `${e('currentquests')} done · **${res.completed}** ok · **${res.failed}** failed`
      : `${e('error')} ${res.reason}`;
    if (dev) body += `\n${e('ownerinfo')} account \`${id}\``;
    await interaction.editReply(card(body, res.ok ? 0x34d399 : 0xed4245));
  },
  async prefixExecute(message, args) {
    if (!await gatePrefix(message, { cooldown: true })) return;
    const id = args[0];
    if (!id) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}questall <id>\``, 0xed4245));
    const dev = isDev(message.author.id);
    const res = await engine.runSingle(id);
    if (!dev) bumpUsage(message.author.id);
    let body = res.ok
      ? `${e('currentquests')} done · **${res.completed}** ok · **${res.failed}** failed`
      : `${e('error')} ${res.reason}`;
    if (dev) body += `\n${e('ownerinfo')} account \`${id}\``;
    await message.channel.send(card(body, res.ok ? 0x34d399 : 0xed4245));
  }
};

export const questlist = {
  data: new SlashCommandBuilder()
    .setName('questlist')
    .setDescription('List quests on an account')
    .addStringOption(o => o.setName('id').setDescription('account id').setRequired(true)),
  prefix: 'questlist',
  async execute(interaction) {
    if (!await gate(interaction)) return;
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const acc = engine.getById(id);
    const dev = isDev(interaction.user.id);
    if (!acc || (acc.user_id !== interaction.user.id && !dev)) {
      return interaction.editReply(card(`${e('error')} account not found`, 0xed4245));
    }
    const { QuestClient, getQuests, filterValid } = await import('../quests/index.js');
    const { getToken } = await import('../account/manager.js');
    const client = new QuestClient(getToken(id), acc.proxy ?? null);
    const raw = await getQuests(client);
    const valid = filterValid(raw);
    if (valid.length === 0) return interaction.editReply(card(`${e('idle')} no quests available`, 0x94a3b8));
    const lines = valid.map((q, i) => `**${i + 1}.** ${q.config?.messages?.quest_name ?? q.id}`);
    let body = `${e('general')} **${valid.length} quests**\n\n${lines.join('\n')}`;
    if (dev) body += `\n\n${e('ownerinfo')} account \`${id}\``;
    await interaction.editReply(card(body, 0x22d3ee));
  },
  async prefixExecute(message, args) {
    if (!await gatePrefix(message)) return;
    const id = args[0];
    if (!id) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}questlist <id>\``, 0xed4245));
    const acc = engine.getById(id);
    const dev = isDev(message.author.id);
    if (!acc || (acc.user_id !== message.author.id && !dev)) {
      return message.channel.send(card(`${e('error')} account not found`, 0xed4245));
    }
    const { QuestClient, getQuests, filterValid } = await import('../quests/index.js');
    const { getToken } = await import('../account/manager.js');
    const client = new QuestClient(getToken(id), acc.proxy ?? null);
    const raw = await getQuests(client);
    const valid = filterValid(raw);
    if (valid.length === 0) return message.channel.send(card(`${e('idle')} no quests available`, 0x94a3b8));
    const lines = valid.map((q, i) => `**${i + 1}.** ${q.config?.messages?.quest_name ?? q.id}`);
    let body = `${e('general')} **${valid.length} quests**\n\n${lines.join('\n')}`;
    if (dev) body += `\n\n${e('ownerinfo')} account \`${id}\``;
    await message.channel.send(card(body, 0x22d3ee));
  }
};

export const claim = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim rewards for an account')
    .addStringOption(o => o.setName('id').setDescription('account id').setRequired(true)),
  prefix: 'claim',
  async execute(interaction) {
    if (!await gate(interaction)) return;
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const acc = engine.getById(id);
    const dev = isDev(interaction.user.id);
    if (!acc || (acc.user_id !== interaction.user.id && !dev)) {
      return interaction.editReply(card(`${e('error')} account not found`, 0xed4245));
    }
    const n = await engine.claimFor(id);
    await interaction.editReply(card(`${e('online')} claimed **${n}** rewards`, 0x34d399));
  },
  async prefixExecute(message, args) {
    if (!await gatePrefix(message)) return;
    const id = args[0];
    if (!id) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}claim <id>\``, 0xed4245));
    const n = await engine.claimFor(id);
    await message.channel.send(card(`${e('online')} claimed **${n}** rewards`, 0x34d399));
  }
};

export const plans = {
  data: new SlashCommandBuilder().setName('plans').setDescription('Show plans'),
  prefix: 'plans',
  async execute(interaction) {
    const dev = isDev(interaction.user.id);
    let body = buildPlans();
    if (dev) body += `\n\n${e('ownerinfo')} dev: \`/setplan <user> <plan>\``;
    await interaction.reply({ ...card(body, 0xe879f9), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message) {
    const dev = isDev(message.author.id);
    let body = buildPlans();
    if (dev) body += `\n\n${e('ownerinfo')} dev: \`${PREFIX}setplan <user> <plan>\``;
    await message.channel.send(card(body, 0xe879f9));
  }
};

function buildPlans() {
  return [
    `${e('buy')} **Free** — 1 account · 5 free quests / 4h cooldown`,
    `${e('buy2')} **Pro** — 10 accounts · RPC · ₹499 / $5`,
    `${e('ownerinfo')} **Elite** — 50 accounts · RPC · auto-joiner · ₹999 / $10`,
    ``,
    `purchase in Discord`
  ].join('\n');
}

export const buy = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase a plan')
    .addStringOption(o => o.setName('plan').setDescription('pro or elite').setRequired(true)
      .addChoices({ name: 'Pro', value: 'pro' }, { name: 'Elite', value: 'elite' }))
    .addStringOption(o => o.setName('method').setDescription('payment method').setRequired(false)
      .addChoices({ name: 'UPI / Card', value: 'upi' }, { name: 'Crypto', value: 'crypto' })),
  prefix: 'buy',
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const plan = interaction.options.getString('plan');
    const method = interaction.options.getString('method') ?? 'upi';
    const info = PLANS[plan];
    const userId = interaction.user.id;
    try {
      const { createRampexCheckout } = await import('../api/rampex.js');
      const { createCryptoInvoice } = await import('../api/payments.js');
      let r;
      if (method === 'crypto') {
        r = await createCryptoInvoice(userId, plan);
      } else {
        try {
          r = await createRampexCheckout(userId, plan);
        } catch (err) {
          if (err.message.includes('rampex_disabled')) throw new Error('UPI not configured yet — contact admin. Or try /buy with method:crypto');
          throw err;
        }
      }
      await interaction.editReply(card(`${e('buy2')} **${info.name}** · ₹${info.price}\n${e('link')} pay: ${r.url}`, 0xe879f9));
    } catch (err) {
      await interaction.editReply(card(`${e('error')} ${err.message}`, 0xed4245));
    }
  },
  async prefixExecute(message, args) {
    const plan = (args[0] ?? '').toLowerCase();
    const method = (args[1] ?? 'upi').toLowerCase();
    const info = PLANS[plan];
    if (!info || plan === 'free') return message.channel.send(card(`${e('error')} choose \`pro\` or \`elite\``, 0xed4245));
    const userId = message.author.id;
    const sent = await message.channel.send(card(`${e('currentquest')} creating payment...`, 0x22d3ee));
    try {
      const { createRampexCheckout } = await import('../api/rampex.js');
      const { createCryptoInvoice } = await import('../api/payments.js');
      let r;
      if (method === 'crypto') {
        r = await createCryptoInvoice(userId, plan);
      } else {
        try {
          r = await createRampexCheckout(userId, plan);
        } catch (err) {
          if (err.message.includes('rampex_disabled')) throw new Error('UPI not configured yet — contact admin. Or try ' + PREFIX + 'buy ' + plan + ' crypto');
          throw err;
        }
      }
      await sent.edit({ content: '', ...card(`${e('buy2')} **${info.name}** · ₹${info.price}\n${e('link')} pay: ${r.url}`, 0xe879f9) });
    } catch (err) {
      await sent.edit({ content: '', ...card(`${e('error')} ${err.message}`, 0xed4245) });
    }
  }
};

export const dev = {
  data: new SlashCommandBuilder().setName('dev').setDescription('Developer info'),
  prefix: 'dev',
  async execute(interaction) {
    if (!isDev(interaction.user.id)) {
      return interaction.reply({ ...card(`${e('error')} forbidden`, 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const userId = interaction.user.id;
    const u = getUser(userId);
    const accounts = listAccounts(userId);
    const lines = [
      `# ${e('ownerinfo')} DEV PANEL`,
      ``,
      `**Discord ID:** \`${userId}\``,
      `**Username:** ${interaction.user.username}`,
      `**Role:** \`${u?.role ?? 'owner'}\``,
      `**Plan:** \`${u?.plan ?? 'elite'}\``,
      `**Accounts:** ${accounts.length}`,
      `**Guilds:** ${interaction.client.guilds.cache.size}`,
      `**Uptime:** \`${Math.floor(process.uptime())}s\``,
      `**Memory:** \`${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\``,
      `**Bot status:** \`${BOT_STATUS}\``,
      ``,
      `**Quick access:**`,
      `\`/users\` — list all users`,
      `\`/setplan <user> <plan>\` — change plan`,
      `\`/setrole <user> <role>\` — change role`,
      `\`/stats\` — engine stats`
    ].join('\n');
    await interaction.reply({ ...card(lines, 0xf0abfc), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message) {
    if (!isDev(message.author.id)) return message.channel.send(card(`${e('error')} forbidden`, 0xed4245));
    const userId = message.author.id;
    const u = getUser(userId);
    const accounts = listAccounts(userId);
    const lines = [
      `# ${e('ownerinfo')} DEV PANEL`,
      ``,
      `**Discord ID:** \`${userId}\``,
      `**Username:** ${message.author.username}`,
      `**Role:** \`${u?.role ?? 'owner'}\``,
      `**Plan:** \`${u?.plan ?? 'elite'}\``,
      `**Accounts:** ${accounts.length}`,
      `**Uptime:** \`${Math.floor(process.uptime())}s\``,
      `**Memory:** \`${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\``,
      `**Bot status:** \`${BOT_STATUS}\``
    ].join('\n');
    await message.channel.send(card(lines, 0xf0abfc));
  }
};

export const users = {
  data: new SlashCommandBuilder().setName('users').setDescription('List all users (dev)'),
  prefix: 'users',
  async execute(interaction) {
    if (!isDev(interaction.user.id)) return interaction.reply({ ...card(`${e('error')} forbidden`, 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    const { db } = await import('../db/db.js');
    const rows = db.prepare('SELECT id, username, role, plan FROM users ORDER BY created_at DESC LIMIT 50').all();
    if (rows.length === 0) return interaction.reply({ ...card(`${e('idle')} no users`, 0x94a3b8), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    const lines = [`# ${e('devinfo')} USERS · ${rows.length}`, ``];
    for (const r of rows) lines.push(`${e('online')} **${r.username ?? 'unknown'}** · \`${r.id}\` · ${r.role} · ${r.plan}`);
    await interaction.reply({ ...card(lines.join('\n'), 0xf0abfc), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message) {
    if (!isDev(message.author.id)) return message.channel.send(card(`${e('error')} forbidden`, 0xed4245));
    const { db } = await import('../db/db.js');
    const rows = db.prepare('SELECT id, username, role, plan FROM users ORDER BY created_at DESC LIMIT 50').all();
    if (rows.length === 0) return message.channel.send(card(`${e('idle')} no users`, 0x94a3b8));
    const lines = [`# ${e('devinfo')} USERS · ${rows.length}`, ``];
    for (const r of rows) lines.push(`${e('online')} **${r.username ?? 'unknown'}** · \`${r.id}\` · ${r.role} · ${r.plan}`);
    await message.channel.send(card(lines.join('\n'), 0xf0abfc));
  }
};

export const setplan = {
  data: new SlashCommandBuilder()
    .setName('setplan')
    .setDescription('Set a user plan (dev)')
    .addStringOption(o => o.setName('user').setDescription('user id').setRequired(true))
    .addStringOption(o => o.setName('plan').setDescription('plan').setRequired(true)
      .addChoices({ name: 'Free', value: 'free' }, { name: 'Pro', value: 'pro' }, { name: 'Elite', value: 'elite' })),
  prefix: 'setplan',
  async execute(interaction) {
    if (!isDev(interaction.user.id)) return interaction.reply({ ...card(`${e('error')} forbidden`, 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    const userId = interaction.options.getString('user');
    const plan = interaction.options.getString('plan');
    const { setPlan } = await import('../account/manager.js');
    const res = await setPlan(userId, plan);
    if (!res.ok) return interaction.reply({ ...card(`${e('error')} ${res.reason} · id \`${res.id}\``, 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    await interaction.reply({ ...card(`${e('online')} \`${res.id}\` → **${res.plan}**`, 0x34d399), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message, args) {
    if (!isDev(message.author.id)) return message.channel.send(card(`${e('error')} forbidden`, 0xed4245));
    const [userId, plan] = args;
    if (!userId || !plan || !PLANS[plan]) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}setplan <user_id> <free|pro|elite>\``, 0xed4245));
    const { setPlan } = await import('../account/manager.js');
    const res = await setPlan(userId, plan);
    if (!res.ok) return message.channel.send(card(`${e('error')} ${res.reason} · id \`${res.id}\``, 0xed4245));
    await message.channel.send(card(`${e('online')} \`${res.id}\` → **${res.plan}**`, 0x34d399));
  }
};

export const setrole = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Set a user role (dev)')
    .addStringOption(o => o.setName('user').setDescription('user id').setRequired(true))
    .addStringOption(o => o.setName('role').setDescription('role').setRequired(true)
      .addChoices({ name: 'User', value: 'user' }, { name: 'Admin', value: 'admin' }, { name: 'Owner', value: 'owner' })),
  prefix: 'setrole',
  async execute(interaction) {
    if (!isDev(interaction.user.id)) return interaction.reply({ ...card(`${e('error')} forbidden`, 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    const userId = interaction.options.getString('user');
    const role = interaction.options.getString('role');
    const { setRole } = await import('../account/manager.js');
    const res = await setRole(userId, role);
    if (!res.ok) return interaction.reply({ ...card(`${e('error')} ${res.reason} · id \`${res.id}\``, 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    await interaction.reply({ ...card(`${e('online')} \`${res.id}\` → **${res.role}**`, 0x34d399), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message, args) {
    if (!isDev(message.author.id)) return message.channel.send(card(`${e('error')} forbidden`, 0xed4245));
    const [userId, role] = args;
    if (!userId || !role) return message.channel.send(card(`${e('error')} usage: \`${PREFIX}setrole <user_id> <user|admin|owner>\``, 0xed4245));
    const { setRole } = await import('../account/manager.js');
    const res = await setRole(userId, role);
    if (!res.ok) return message.channel.send(card(`${e('error')} ${res.reason} · id \`${res.id}\``, 0xed4245));
    await message.channel.send(card(`${e('online')} \`${res.id}\` → **${res.role}**`, 0x34d399));
  }
};

export const stats = {
  data: new SlashCommandBuilder().setName('stats').setDescription('Soulzy network statistics'),
  prefix: 'stats',
  async execute(interaction) {
    await interaction.deferReply();
    const { db } = await import('../db/db.js');
    const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const accounts = db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
    const quests = db.prepare('SELECT COUNT(*) AS n FROM quest_logs').get().n;
    const ok = db.prepare("SELECT COUNT(*) AS n FROM quest_logs WHERE status = 'ok'").get().n;
    const guilds = interaction.client.guilds.cache.size;
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const lines = [
      `# ${e('info')} SOULZY STATS`,
      ``,
      `**Users:** \`${users}\``,
      `**Accounts:** \`${accounts}\``,
      `**Quests run:** \`${quests}\``,
      `**Successes:** \`${ok}\``,
      `**Servers:** \`${guilds}\``,
      `**Uptime:** \`${h}h ${m}m\``,
      ``,
      `-# soulzy · autonomous quest engine`
    ].join('\n');
    await interaction.editReply(card(lines, 0x22d3ee));
  },
  async prefixExecute(message) {
    const { db } = await import('../db/db.js');
    const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const accounts = db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
    const quests = db.prepare('SELECT COUNT(*) AS n FROM quest_logs').get().n;
    const ok = db.prepare("SELECT COUNT(*) AS n FROM quest_logs WHERE status = 'ok'").get().n;
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const lines = [
      `# ${e('info')} SOULZY STATS`,
      ``,
      `**Users:** \`${users}\``,
      `**Accounts:** \`${accounts}\``,
      `**Quests run:** \`${quests}\``,
      `**Successes:** \`${ok}\``,
      `**Uptime:** \`${h}h ${m}m\``
    ].join('\n');
    await message.channel.send(card(lines, 0x22d3ee));
  }
};

export const stop = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop a running quest')
    .addStringOption(o => o.setName('id').setDescription('account id').setRequired(true)),
  prefix: 'stop',
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('id');
    const acc = engine.getById(id);
    const dev = isDev(interaction.user.id);
    if (!acc || (acc.user_id !== interaction.user.id && !dev)) {
      return interaction.editReply(card(e('error') + ' account not found', 0xed4245));
    }
    engine.abortAccount(id);
    await interaction.editReply(card(e('warning') + ' stop signal sent to `' + id.slice(0,8) + '`', 0xfee75c));
  },
  async prefixExecute(message, args) {
    const id = args[0];
    if (!id) return message.channel.send(card(e('error') + ' usage: `' + PREFIX + 'stop <id>`', 0xed4245));
    const acc = engine.getById(id);
    const dev = isDev(message.author.id);
    if (!acc || (acc.user_id !== message.author.id && !dev)) {
      return message.channel.send(card(e('error') + ' account not found', 0xed4245));
    }
    engine.abortAccount(id);
    await message.channel.send(card(e('warning') + ' stop signal sent to `' + id.slice(0,8) + '`', 0xfee75c));
  }
};

export const stopall = {
  data: new SlashCommandBuilder().setName('stopall').setDescription('Stop all running quests (dev)'),
  prefix: 'stopall',
  async execute(interaction) {
    if (!isDev(interaction.user.id)) {
      return interaction.reply({ ...card(e('error') + ' forbidden', 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const n = engine.abortAll();
    await interaction.reply({ ...card(e('warning') + ' stop sent to **' + n + '** account(s)', 0xfee75c), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message) {
    if (!isDev(message.author.id)) return message.channel.send(card(e('error') + ' forbidden', 0xed4245));
    const n = engine.abortAll();
    await message.channel.send(card(e('warning') + ' stop sent to **' + n + '** account(s)', 0xfee75c));
  }
};

export const maintenance = {
  data: new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Toggle maintenance mode (dev)')
    .addStringOption(o => o.setName('state').setDescription('on or off').setRequired(true)
      .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })),
  prefix: 'maintenance',
  async execute(interaction) {
    if (!isDev(interaction.user.id)) {
      return interaction.reply({ ...card(e('error') + ' forbidden', 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const { setSetting } = await import('../db/db.js');
    const state = interaction.options.getString('state');
    setSetting('maintenance', state === 'on' ? '1' : '0');
    globalThis.__soulzyMaint = state === 'on' ? '1' : '0';
    const msg = state === 'on'
      ? e('maintenance') + ' **MAINTENANCE MODE ON**\n-# regular users blocked, devs unaffected'
      : e('online') + ' **MAINTENANCE MODE OFF**\n-# all users can use commands';
    await interaction.reply({ ...card(msg, state === 'on' ? 0xfee75c : 0x34d399), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message, args) {
    if (!isDev(message.author.id)) return message.channel.send(card(e('error') + ' forbidden', 0xed4245));
    const { setSetting } = await import('../db/db.js');
    const state = (args[0] ?? '').toLowerCase();
    if (state !== 'on' && state !== 'off') {
      return message.channel.send(card(e('error') + ' usage: `' + PREFIX + 'maintenance <on|off>`', 0xed4245));
    }
    setSetting('maintenance', state === 'on' ? '1' : '0');
    globalThis.__soulzyMaint = state === 'on' ? '1' : '0';
    const msg = state === 'on'
      ? e('maintenance') + ' **MAINTENANCE MODE ON**'
      : e('online') + ' **MAINTENANCE MODE OFF**';
    await message.channel.send(card(msg, state === 'on' ? 0xfee75c : 0x34d399));
  }
};

export const deluser = {
  data: new SlashCommandBuilder()
    .setName('deluser')
    .setDescription('Delete a user and all their accounts (dev)')
    .addStringOption(o => o.setName('id').setDescription('user id').setRequired(true)),
  prefix: 'deluser',
  async execute(interaction) {
    if (!isDev(interaction.user.id)) {
      return interaction.reply({ ...card(e('error') + ' forbidden', 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const userId = interaction.options.getString('id').trim().replace(/[<@!>]/g, '');
    const { db } = await import('../db/db.js');
    const vault = await import('../account/vault.js');
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!user) return interaction.reply({ ...card(e('error') + ' user not found', 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    if (user.role === 'owner') return interaction.reply({ ...card(e('error') + ' cannot delete owner', 0xed4245), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    const accounts = db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(userId);
    for (const a of accounts) vault.drop(a.id);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    await interaction.reply({ ...card(e('online') + ' deleted **' + userId + '**\n-# ' + accounts.length + ' account(s) removed', 0x34d399), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
  async prefixExecute(message, args) {
    if (!isDev(message.author.id)) return message.channel.send(card(e('error') + ' forbidden', 0xed4245));
    const userId = (args[0] ?? '').trim().replace(/[<@!>]/g, '');
    if (!userId) return message.channel.send(card(e('error') + ' usage: \`' + PREFIX + 'deluser <user_id>\`', 0xed4245));
    const { db } = await import('../db/db.js');
    const vault = await import('../account/vault.js');
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!user) return message.channel.send(card(e('error') + ' user not found', 0xed4245));
    if (user.role === 'owner') return message.channel.send(card(e('error') + ' cannot delete owner', 0xed4245));
    const accounts = db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(userId);
    for (const a of accounts) vault.drop(a.id);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    await message.channel.send(card(e('online') + ' deleted **' + userId + '**\n-# ' + accounts.length + ' account(s) removed', 0x34d399));
  }
};

export const COMMANDS = [help, ping, link, unlink, profile, quest, questall, questlist, claim, stop, stopall, maintenance, plans, buy, dev, users, setplan, setrole, deluser, stats];

export function register(client) {
  for (const cmd of COMMANDS) {
    if (cmd?.data) client.commands.set(cmd.data.name, cmd);
    if (cmd?.prefix) client.prefixCommands.set(cmd.prefix, cmd);
  }
}

export function toJSON() {
  return COMMANDS.filter(c => c.data).map(c => c.data.toJSON());
}
