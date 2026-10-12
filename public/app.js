const $ = id => document.getElementById(id);
let me = null;
let current = 'overview';
let accounts = [];
let plans = {};

async function api(path, method, body) {
  const r = await fetch('/api' + path, {
    method: method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('unauth'); }
  return r.json();
}

function showLogin() { $('login').classList.remove('hidden'); $('app').classList.add('hidden'); }
function showApp() { $('login').classList.add('hidden'); $('app').classList.remove('hidden'); }

async function doLogin() {
  const r = await api('/login', 'POST', { username: $('u').value || 'operator', password: $('p').value || '' });
  if (!r.ok) return alert('login failed');
  me = r.user;
  await loadAll();
  showApp();
  render();
}

async function logout() {
  await api('/logout', 'POST');
  me = null;
  showLogin();
}

async function loadAll() {
  const meRes = await api('/me');
  me = meRes.user;
  accounts = (await api('/accounts')).data ?? [];
  plans = (await api('/plans')).data ?? {};
  $('role').textContent = me.role.toUpperCase();
  $('role').style.color = me.role === 'admin' ? '#e879f9' : me.plan === 'pro' ? '#fcd34d' : '#67e8f9';
}

const TABS = ['overview', 'accounts', 'plans', 'logs', 'admin'];
function renderTabs() {
  $('tabs').innerHTML = TABS.map(t =>
    `<div class="tab ${t === current ? 'on' : ''}" onclick="go('${t}')">${t}</div>`
  ).join('');
}

function go(t) { current = t; render(); }

function render() {
  renderTabs();
  const v = $('view');
  if (current === 'overview') v.innerHTML = viewOverview();
  if (current === 'accounts') v.innerHTML = viewAccounts();
  if (current === 'plans') v.innerHTML = viewPlans();
  if (current === 'logs') v.innerHTML = viewLogs();
  if (current === 'admin') v.innerHTML = viewAdmin();
  if (current === 'logs') loadLogs();
  if (current === 'admin') loadAdmin();
}

function stat(label, val) {
  return `<div class="stat"><b>${val}</b><span>${label}</span></div>`;
}

function viewOverview() {
  const online = accounts.filter(a => a.status === 'running').length;
  const total = accounts.length;
  const idle = accounts.filter(a => a.status === 'idle').length;
  const err = accounts.filter(a => a.status === 'error').length;
  return `
    <div class="stats">
      ${stat('ACCOUNTS', total)}
      ${stat('RUNNING', online)}
      ${stat('IDLE', idle)}
      ${stat('ERRORS', err)}
    </div>
    <div class="glass card">
      <div class="title">ACTIVE</div>
      ${accounts.length ? accounts.map(a => accRow(a)).join('') : '<div style="color:#22d3ee80;font-size:12px">no accounts linked</div>'}
    </div>
  `;
}

function accRow(a) {
  return `
    <div class="acc">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700">${a.username ?? a.label ?? a.id.slice(0,8)}</div>
          <div style="font-size:10px;color:#22d3ee80">${a.id.slice(0,8)}</div>
        </div>
        <span class="chip ${a.status}">${a.status}</span>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" style="padding:6px 10px;font-size:10px" onclick="runAcc('${a.id}')">RUN</button>
        <button class="btn btn-mg" style="padding:6px 10px;font-size:10px" onclick="claimAcc('${a.id}')">CLAIM</button>
        <button class="btn" style="padding:6px 10px;font-size:10px;border-color:#f87171;color:#f87171" onclick="delAcc('${a.id}')">DEL</button>
      </div>
    </div>
  `;
}

async function runAcc(id) {
  await api('/accounts/' + id + '/run', 'POST', {});
  await loadAll(); render();
}

async function claimAcc(id) {
  const r = await api('/accounts/' + id + '/claim', 'POST');
  alert('claimed: ' + (r.claimed ?? 0));
  await loadAll(); render();
}

async function delAcc(id) {
  if (!confirm('remove account?')) return;
  await api('/accounts/' + id, 'DELETE');
  await loadAll(); render();
}

function viewAccounts() {
  return `
    <div class="glass card">
      <div class="title">ADD ACCOUNT</div>
      <input id="tk" placeholder="discord user token" style="margin-bottom:8px"/>
      <input id="lb" placeholder="label (optional)" style="margin-bottom:8px"/>
      <input id="px" placeholder="proxy url (optional)" style="margin-bottom:12px"/>
      <button class="btn btn-solid" style="width:100%;padding:12px" onclick="addAcc()">REGISTER</button>
    </div>
    <div class="glass card">
      <div class="title">IDENTITY VAULT</div>
      ${accounts.length ? accounts.map(a => accRow(a)).join('') : '<div style="color:#22d3ee80;font-size:12px">no accounts</div>'}
    </div>
  `;
}

async function addAcc() {
  const token = $('tk').value.trim();
  if (!token) return;
  const r = await api('/accounts', 'POST', { token, label: $('lb').value.trim(), proxy: $('px').value.trim() });
  if (!r.ok) return alert(r.reason ?? 'error');
  $('tk').value = ''; $('lb').value = ''; $('px').value = '';
  await loadAll(); render();
}

function viewPlans() {
  const p = plans.pro ?? { name: 'Pro', price: 499, accounts: 10 };
  const e = plans.elite ?? { name: 'Elite', price: 999, accounts: 50 };
  return `
    <div class="glass card">
      <div class="title">FREE</div>
      <div class="price">₹0</div>
      <ul><li>1 account</li><li>all quest types</li><li>auto-enroll</li></ul>
    </div>
    <div class="glass card plan p">
      <div class="title" style="color:#f0abfc">PRO</div>
      <div class="price">₹${p.price} <span style="font-size:12px;color:#94a3b8">/ $5</span></div>
      <ul>
        <li>${p.accounts}+ accounts</li>
        <li>hosting included</li>
        <li>auto-enroll</li>
        <li>custom RPC</li>
      </ul>
      <button class="btn btn-mg" style="width:100%;margin-top:12px;padding:12px" onclick="buy('pro')">ACQUIRE</button>
    </div>
    <div class="glass card plan e">
      <div class="title" style="color:#6ee7b7">ELITE</div>
      <div class="price">₹${e.price} <span style="font-size:12px;color:#94a3b8">/ $10</span></div>
      <ul>
        <li>${e.accounts}+ accounts</li>
        <li>hosting included</li>
        <li>custom RPC</li>
        <li>auto server joiner (non-cap)</li>
      </ul>
      <button class="btn" style="width:100%;margin-top:12px;padding:12px;border-color:#34d399;color:#6ee7b7" onclick="buy('elite')">ACQUIRE</button>
    </div>
  `;
}

async function buy(plan) {
  const r = await api('/buy', 'POST', { plan });
  if (!r.ok) return alert(r.error ?? 'error');
  alert('queued: ' + plan + ' · ₹' + r.price);
}

function viewLogs() {
  return `<div class="glass card"><div class="title">EVENT STREAM</div><div id="logbox" style="max-height:60vh;overflow:auto"></div></div>`;
}

async function loadLogs() {
  const r = await api('/logs');
  const box = $('logbox');
  if (!box) return;
  const rows = r.data ?? [];
  box.innerHTML = rows.length
    ? rows.map(l => `<div class="log">[${new Date(l.created_at * 1000).toISOString().slice(11,19)}] <span style="color:${l.status === 'ok' ? '#34d399' : l.status === 'failed' ? '#f87171' : '#67e8f9'}">${l.quest_name ?? l.quest_id ?? '?'} · ${l.status}</span></div>`).join('')
    : '<div style="color:#22d3ee80;font-size:12px">no logs yet</div>';
}

function viewAdmin() {
  if (me.role !== 'admin') return '<div class="glass card"><div class="title">FORBIDDEN</div></div>';
  return `<div class="glass card"><div class="title">USER CONTROL</div><div id="adminbox">loading…</div></div>`;
}

async function loadAdmin() {
  if (me.role !== 'admin') return;
  const r = await api('/admin/users');
  const box = $('adminbox');
  if (!box) return;
  const rows = r.data ?? [];
  box.innerHTML = rows.map(u => `
    <div class="acc">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div><div style="font-weight:700">${u.username ?? u.id}</div><div style="font-size:10px;color:#22d3ee80">${u.role} · ${u.plan}</div></div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn" style="padding:6px 10px;font-size:10px" onclick="setPlan('${u.id}','free')">FREE</button>
        <button class="btn btn-mg" style="padding:6px 10px;font-size:10px" onclick="setPlan('${u.id}','pro')">PRO</button>
        <button class="btn" style="padding:6px 10px;font-size:10px;border-color:#34d399;color:#6ee7b7" onclick="setPlan('${u.id}','elite')">ELITE</button>
      </div>
    </div>
  `).join('');
}

async function setPlan(userId, plan) {
  await api('/admin/users/' + userId + '/plan', 'POST', { plan });
  await loadAdmin();
}

(function () {
  const c = $('fx'), x = c.getContext('2d');
  let W, H, t = 0, raf;
  function size() { W = c.width = innerWidth; H = c.height = innerHeight; }
  function draw() {
    t += 1;
    x.clearRect(0, 0, W, H);
    const hz = H * 0.60, vpx = W * 0.5;
    const sky = x.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, 'rgba(4,5,10,0)');
    sky.addColorStop(1, 'rgba(70,20,100,0.55)');
    x.fillStyle = sky; x.fillRect(0, 0, W, hz);
    const sun = x.createRadialGradient(vpx, hz - 6, 0, vpx, hz - 6, Math.min(W, H) * 0.22);
    sun.addColorStop(0, 'rgba(232,121,249,0.7)');
    sun.addColorStop(1, 'rgba(167,139,250,0)');
    x.fillStyle = sun; x.beginPath(); x.arc(vpx, hz - 6, Math.min(W, H) * 0.22, 0, 6.283); x.fill();
    x.save(); x.beginPath(); x.rect(0, hz, W, H - hz); x.clip();
    const depth = 22, speed = (t * 0.010) % 1;
    for (let i = 0; i < depth; i++) {
      const p = (i / depth + speed) % 1;
      const curve = Math.pow(p, 2.6);
      const y = hz + curve * (H - hz + 140);
      x.strokeStyle = `rgba(34,211,238,${curve * 0.9})`;
      x.lineWidth = curve * 2.4 + 0.4;
      x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
    }
    const cols = 26, spread = W * 2.6;
    for (let i = 0; i <= cols; i++) {
      const fx = (i / cols - 0.5) * spread;
      const topX = vpx + fx * 0.02, botX = vpx + fx;
      const g = x.createLinearGradient(0, hz, 0, H);
      g.addColorStop(0, 'rgba(232,121,249,0.85)');
      g.addColorStop(1, 'rgba(34,211,238,0)');
      x.strokeStyle = g; x.lineWidth = 1.1;
      x.beginPath(); x.moveTo(topX, hz); x.lineTo(botX, H); x.stroke();
    }
    x.restore();
    x.fillStyle = 'rgba(232,121,249,1)';
    x.fillRect(0, hz - 2, W, 3);
    raf = requestAnimationFrame(draw);
  }
  size(); draw();
  addEventListener('resize', size);
})();

(async function () {
  try {
    const r = await api('/me');
    if (r.user) { me = r.user; await loadAll(); showApp(); render(); }
    else showLogin();
  } catch { showLogin(); }
})();
