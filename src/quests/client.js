import { API_BASE, USER_AGENT, ENROLL_LOCATIONS } from '../config.js';
import { ProxyAgent } from 'undici';

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fingerprint() {
  const p = {
    os: 'Windows', browser: 'Discord Client', release_channel: 'stable',
    client_version: '1.0.9215', os_version: '10.0.19045', os_arch: 'x64',
    app_arch: 'x64', system_locale: 'en-US', has_client_mods: false,
    client_launch_id: crypto.randomUUID(),
    browser_user_agent: USER_AGENT, browser_version: '37.6.0',
    os_sdk_version: '19045', client_build_number: 471091,
    native_build_number: 72186, client_event_source: null,
    launch_signature: crypto.randomUUID(),
    client_heartbeat_session_id: crypto.randomUUID(),
    client_app_state: 'focused'
  };
  return Buffer.from(JSON.stringify(p)).toString('base64');
}

export class QuestClient {
  #token;
  #proxy;
  #dispatch;

  constructor(token, proxy = null) {
    this.#token = token;
    this.#proxy = proxy;
    this.#dispatch = proxy ? new ProxyAgent(proxy) : undefined;
  }

  headers(hasBody) {
    const h = {
      'Authorization': this.#token,
      'User-Agent': USER_AGENT,
      'accept-language': 'en-US',
      'origin': 'https://discord.com',
      'referer': 'https://discord.com/channels/@me',
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-discord-locale': 'en-US',
      'x-discord-timezone': 'UTC',
      'x-super-properties': fingerprint()
    };
    if (hasBody) h['Content-Type'] = 'application/json';
    return h;
  }

  async request(method, path, body) {
    const url = API_BASE + path;
    for (let i = 0; i <= MAX_RETRIES; i++) {
      let res;
      try {
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        res = await fetch(url, {
          method,
          headers: this.headers(payload !== undefined),
          body: payload,
          dispatcher: this.#dispatch
        });
      } catch (err) {
        if (i < MAX_RETRIES) { await sleep(2 ** i * 1000); continue; }
        throw new Error(`net ${method} ${path}: ${err.message}`);
      }

      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after') ?? 1) * 1000;
        await sleep(ra);
        continue;
      }

      if (!res.ok) {
        if (RETRYABLE.has(res.status) && i < MAX_RETRIES) {
          await sleep(2 ** i * 1500);
          continue;
        }
        const text = await res.text();
        throw new Error(`${res.status}: ${text.slice(0, 300)}`);
      }
      return res.json();
    }
    throw new Error(`retries exhausted ${method} ${path}`);
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body ?? {}); }

  fetchQuests() { return this.get('/quests/@me'); }
  fetchMe() { return this.get('/users/@me'); }
}
