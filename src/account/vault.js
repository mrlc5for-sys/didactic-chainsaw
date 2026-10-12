import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { VAULT_SECRET } from '../config.js';

const FILE = join(process.cwd(), 'data', 'vault.json');
const ALGO = 'aes-256-gcm';
const KEY = crypto.createHash('sha256').update(VAULT_SECRET).digest();

function load() {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(d) { writeFileSync(FILE, JSON.stringify(d, null, 2)); }

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: enc.toString('hex') };
}

export function decrypt(blob) {
  try {
    const d = crypto.createDecipheriv(ALGO, KEY, Buffer.from(blob.iv, 'hex'));
    d.setAuthTag(Buffer.from(blob.tag, 'hex'));
    return d.update(Buffer.from(blob.data, 'hex')) + d.final('utf8');
  } catch { return null; }
}

export function put(accountId, token) { const v = load(); v[accountId] = encrypt(token); save(v); }
export function get(accountId) { const v = load(); return v[accountId] ? decrypt(v[accountId]) : null; }
export function drop(accountId) { const v = load(); delete v[accountId]; save(v); }
