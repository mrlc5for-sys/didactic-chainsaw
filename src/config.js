import 'dotenv/config';

export const TOKEN = process.env.DISCORD_TOKEN ?? '';
export const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? '';
export const PREFIX = process.env.BOT_PREFIX ?? ',';
export const VAULT_SECRET = process.env.VAULT_SECRET ?? 'change-me';
export const PORT = Number(process.env.PORT ?? 3000);
export const SESSION_SECRET = process.env.SESSION_SECRET ?? 'change-me';
export const OWNER_IDS = (process.env.OWNER_IDS ?? '').split(',').filter(Boolean);

export const BOT_STATUS = process.env.BOT_STATUS ?? 'online';
export const COOLDOWN_QUESTS = Number(process.env.COOLDOWN_QUESTS ?? 5);
export const COOLDOWN_HOURS = Number(process.env.COOLDOWN_HOURS ?? 4);

export const API_BASE = 'https://discord.com/api/v10';
export const API_BASE_V9 = 'https://discord.com/api/v9';

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9215 Chrome/138.0.7204.251 Electron/37.6.0 Safari/537.36';

export const ENROLL_LOCATIONS = [11, 7, 12, 4, 3, 1, 8, 10, 2, 6];
export const MAX_TASK_ATTEMPTS = 3;
export const CLAIM_SKIP_IDS = new Set(['1412491570820812933']);

export const PLANS = {
  free:  { name: 'Free',  accounts: 1,  rpc: false, joiner: false, price: 0 },
  pro:   { name: 'Pro',   accounts: 10, rpc: true,  joiner: false, price: 499 },
  elite: { name: 'Elite', accounts: 50, rpc: true,  joiner: true,  price: 999 }
};

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
export const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO ?? '';
export const STRIPE_PRICE_ELITE = process.env.STRIPE_PRICE_ELITE ?? '';
export const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY ?? '';
export const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET ?? '';
export const DISCORD_BUY_CHANNEL = process.env.DISCORD_BUY_CHANNEL ?? '';

export const PAY_WALLET = process.env.PAY_WALLET ?? '';
export const PAY_NETWORK = process.env.PAY_NETWORK ?? 'polygon';
export const PAY_TOKEN = process.env.PAY_TOKEN ?? 'USDT';

export const RAMPEX_API_KEY = process.env.RAMPEX_API_KEY ?? '';
export const RAMPEX_WEBHOOK_SECRET = process.env.RAMPEX_WEBHOOK_SECRET ?? '';
export const RAMPEX_WALLET = process.env.RAMPEX_WALLET ?? '';
export const RAMPEX_NETWORK = process.env.RAMPEX_NETWORK ?? 'polygon';
export const RAMPEX_TOKEN = process.env.RAMPEX_TOKEN ?? 'USDC';
