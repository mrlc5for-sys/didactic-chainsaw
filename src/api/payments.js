import crypto from 'crypto';
import { db } from '../db/db.js';
import { log } from '../log.js';
import { BASE_URL, NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, PLANS } from '../config.js';
import { setPlan } from '../account/manager.js';

function orderId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function saveOrder(id, userId, plan, amount, currency, provider) {
  db.prepare(`INSERT INTO orders (id, user_id, plan, amount, currency, provider, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')`)
    .run(id, userId, plan, amount, currency, provider);
}

function markPaid(providerRef, plan, userId) {
  db.prepare(`UPDATE orders SET status = 'paid', updated_at = unixepoch() WHERE provider_ref = ?`)
    .run(providerRef);
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  setPlan(userId, plan);
  db.prepare('UPDATE users SET plan_expires_at = ? WHERE id = ?').run(expires, userId);
  log('ok', `payment fulfilled: ${userId} → ${plan}`);
}

export async function createCryptoInvoice(userId, plan) {
  if (!NOWPAYMENTS_API_KEY) throw new Error('crypto_disabled');
  const usd = plan === 'pro' ? 5 : 10;

  const res = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: {
      'x-api-key': NOWPAYMENTS_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      price_amount: usd,
      price_currency: 'usd',
      order_id: `${userId}_${plan}_${Date.now()}`,
      order_description: `Soulzy ${plan} plan`,
      ipn_callback_url: `${BASE_URL}/api/webhooks/crypto`,
      success_url: `${BASE_URL}/?paid=1`,
      cancel_url: `${BASE_URL}/?canceled=1`
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`crypto_api: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const id = orderId('crypto');
  saveOrder(id, userId, plan, usd * 100, 'usd', 'crypto');
  db.prepare('UPDATE orders SET provider_ref = ? WHERE id = ?').run(String(data.id), id);

  return { url: data.invoice_url, id: data.id };
}

export async function handleCryptoWebhook(body, signature) {
  if (!NOWPAYMENTS_IPN_SECRET) return { ok: false, reason: 'crypto_disabled' };
  const sorted = JSON.stringify(body, Object.keys(body).sort());
  const hmac = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET).update(sorted).digest('hex');
  if (hmac !== signature) return { ok: false, reason: 'bad_sig' };

  if (body.payment_status === 'finished' || body.payment_status === 'confirmed') {
    const ref = String(body.invoice_id ?? body.payment_id ?? '');
    const row = db.prepare('SELECT * FROM orders WHERE provider_ref = ?').get(ref);
    if (row) markPaid(ref, row.plan, row.user_id);
  }
  return { ok: true };
}

export function listOrders(userId) {
  return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId);
}
