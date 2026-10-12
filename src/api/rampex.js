import crypto from 'crypto';
import { db } from '../db/db.js';
import { log } from '../log.js';
import { RAMPEX_API_KEY, RAMPEX_WEBHOOK_SECRET, RAMPEX_WALLET, BASE_URL } from '../config.js';
import { setPlan } from '../account/manager.js';

const API = 'https://api.rampex.io';

export async function createRampexCheckout(userId, plan) {
  if (!RAMPEX_API_KEY) throw new Error('rampex_disabled');
  const amount = plan === 'pro' ? 499 : 999;

  const orderId = 'rampex_' + crypto.randomBytes(12).toString('hex');
  const email = `user${userId}@soulzy.local`;

  const walletRes = await fetch(`${API}/control/wallet.php?address=${RAMPEX_WALLET}&callback=${encodeURIComponent(BASE_URL + '/api/webhooks/rampex')}`);
  if (!walletRes.ok) throw new Error('rampex: wallet encrypt failed');
  const wallet = await walletRes.json();
  if (!wallet.address_in) throw new Error('rampex: no encrypted address');

  const res = await fetch(`${API}/api-create-payment-link`, {
    method: 'POST',
    headers: {
      'X-API-Key': RAMPEX_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      amount,
      currency: 'INR',
      customer_email: email,
      description: `Soulzy ${plan} plan`,
      provider: 'hosted',
      ipn_token: wallet.ipn_token,
      payment_url: `${BASE_URL}/?paid=1`
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`rampex: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.success && !data.redirect_url && !data.payment_url) {
    throw new Error(`rampex: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const linkId = data.link_id ?? data.data?.link_id ?? orderId;
  const url = data.redirect_url ?? data.payment_url ?? data.data?.redirect_url;

  db.prepare('INSERT INTO orders (id, user_id, plan, amount, currency, provider, provider_ref, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(orderId, userId, plan, amount, 'inr', 'rampex', String(linkId), 'pending');

  return { url, id: linkId };
}

export async function handleRampexWebhook(rawBody, signature) {
  if (!RAMPEX_WEBHOOK_SECRET) return { ok: false, reason: 'rampex_disabled' };
  if (!signature) return { ok: false, reason: 'no_sig' };

  const expected = crypto.createHmac('sha256', RAMPEX_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_sig' };
  }

  const body = JSON.parse(rawBody.toString('utf8'));
  if (body.event === 'payment.completed') {
    const ref = String(body.link_id ?? body.payment_link_id ?? '');
    const row = db.prepare('SELECT * FROM orders WHERE provider_ref = ?').get(ref);
    if (!row) return { ok: true };
    db.prepare("UPDATE orders SET status = 'paid', updated_at = unixepoch() WHERE provider_ref = ?").run(ref);
    setPlan(row.user_id, row.plan);
    log('ok', `rampex paid: ${row.user_id} -> ${row.plan}`);
  }
  return { ok: true };
}
