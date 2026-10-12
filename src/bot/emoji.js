import { readdirSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { REST, Routes } from 'discord.js';
import { CLIENT_ID, TOKEN } from '../config.js';

const DIR = join(process.cwd(), 'assets', 'emoji');
const CACHE = join(process.cwd(), 'data', 'emoji-cache.json');

let EMOJI = {};

function load() {
  if (existsSync(CACHE)) {
    try { EMOJI = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { EMOJI = {}; }
  }
  return EMOJI;
}

function save() {
  writeFileSync(CACHE, JSON.stringify(EMOJI, null, 2));
}

export async function uploadEmojis() {
  load();
  if (!existsSync(DIR)) return EMOJI;

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const files = readdirSync(DIR).filter(f => f.endsWith('.png'));

  let existing = {};
  try {
    const list = await rest.get(Routes.applicationEmojis(CLIENT_ID));
    for (const e of list.items ?? []) existing[e.name] = e.id;
  } catch {}

  for (const file of files) {
    const name = file.replace('.png', '').toLowerCase();
    if (existing[name]) { EMOJI[name] = existing[name]; continue; }
    try {
      const buf = readFileSync(join(DIR, file));
      const dataUri = `data:image/png;base64,${buf.toString('base64')}`;
      const res = await rest.post(Routes.applicationEmojis(CLIENT_ID), {
        body: { name, image: dataUri }
      });
      EMOJI[name] = res.id;
    } catch {}
  }
  save();
  return EMOJI;
}

export function e(name) {
  const id = EMOJI[name];
  return id ? `<:${name}:${id}>` : '';
}

export function list() { return { ...EMOJI }; }
