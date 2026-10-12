import { API_BASE, USER_AGENT } from '../config.js';

export function sanitize(raw) {
  return raw.trim()
    .replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '')
    .replace(/^`+|`+$/g, '')
    .replace(/^Bot\s+/i, '')
    .trim();
}

export function validFormat(token) {
  return token.length >= 50 && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(token);
}

export async function verify(token) {
  try {
    const res = await fetch(`${API_BASE}/users/@me`, {
      headers: { Authorization: token, 'User-Agent': USER_AGENT }
    });
    if (!res.ok) return null;
    const u = await res.json();
    return {
      id: u.id,
      username: u.global_name || u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null
    };
  } catch { return null; }
}
