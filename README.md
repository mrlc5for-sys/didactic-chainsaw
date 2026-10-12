# Soulzy

Autonomous Discord quest engine.

## Features

- Completes Discord quests across multiple accounts
- 5 quest types: video, mobile video, desktop, stream, activity
- Auto-enroll + auto-claim
- Live progress in Discord
- Web dashboard
- Crypto payments

## Commands

Prefix: `,`

- `/link <token>` — link account
- `/unlink <id>` — remove account
- `/profile` — your accounts & plan
- `/quest <id>` — run one quest
- `/questall <id>` — run all quests
- `/questlist <id>` — list quests
- `/claim <id>` — claim rewards
- `/stop <id>` — stop running quest
- `/stopall` — stop everything (dev)
- `/plans` — view tiers
- `/buy <plan>` — purchase
- `/help` — full list

## Plans

| Tier | Price | Accounts |
|---|---|---|
| Free | ₹0 | 1 |
| Pro | ₹499 / $5 | 10+ |
| Elite | ₹999 / $10 | 50+ |

Free: 5 quests per 4 hours. Pro/Elite: no cooldown.

## Setup

Requires Node.js >= 22.5.

git clone <repo>
cd soulzy
npm install
cp .env.example .env
nano .env
node src/index.js

Dashboard: http://localhost:3000
Password `loco` = owner.

## Environment

DISCORD_TOKEN=
DISCORD_CLIENT_ID=
VAULT_SECRET=
SESSION_SECRET=
RAMPEX_API_KEY=
RAMPEX_WEBHOOK_SECRET=
RAMPEX_WALLET=
DISCORD_BUY_CHANNEL=

## Notes

Automating Discord quests violates Discord ToS. Use alts.
