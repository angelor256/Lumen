'use strict';
/* =====================================================================
   LUMEN — tu segundo cerebro
   Una sola página. Sin dependencias. Vanilla JS.
   ===================================================================== */

/* ---------- estado y persistencia ---------- */
const APP_VER = 'v8';
const LS_KEY = 'lumen.v1';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = v => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };
const strip = s => String(s || '').trim();
const titleCase = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const today = () => ymd(new Date());
const daysSince = s => Math.floor((Date.now() - fromYmd(s).getTime()) / 864e5);
const rel = s => { const n = daysSince(s); return n === 0 ? 'hoy' : n === 1 ? 'ayer' : n === -1 ? 'mañana' : n < 0 ? `en ${-n} días` : `hace ${n} días`; };
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const sumBy = (arr, f) => arr.reduce((t, x) => t + (f ? +x[f] || 0 : +x || 0), 0);
const DEBOUNCE = 350;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const FACES = ['😞', '😕', '😐', '🙂', '😄'];
const moodTxt = m => (['muy mal', 'mal', 'regular', 'bien', 'muy bien'])[clamp(Math.round(m), 1, 5) - 1];

function blank() {
  return {
    v: 1, items: [], habits: [], moves: [], notes: [], lists: [], goals: [], people: [], checks: [], focus: [],
    cfg: { url: '', key: '', dayHour: 9, cur: '$', push: 0, pro: false, theme: 'auto' }, sess: null, meta: { lastSync: 0 }
  };
}
function migrate(s) {
  s.v = s.v || 1;
  ['items', 'habits', 'moves', 'notes', 'lists', 'goals', 'people', 'checks', 'focus'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  s.cfg = Object.assign({ url: '', key: '', dayHour: 9, cur: '$', push: 0, pro: false, theme: 'auto' }, s.cfg || {});
  s.meta = Object.assign({ lastSync: 0 }, s.meta || {});
  s.items.forEach(i => { i.id = i.id || uid(); i.type = i.type || 'task'; i.cat = i.cat || 'personal'; i.done = !!i.done; i.deleted = !!i.deleted; if (i.date && !i.time && i.time !== null && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(i.date)) { const [d, t] = i.date.split(' '); i.date = d; i.time = t; } });
  s.habits.forEach(h => { h.id = h.id || uid(); h.log = h.log || {}; h.deleted = !!h.deleted; h.pin = !!h.pin; });
  s.moves.forEach(m => { m.id = m.id || uid(); m.kind = m.kind || 'out'; m.cat = m.cat || 'otros'; m.deleted = !!m.deleted; });
  s.notes.forEach(n => { n.id = n.id || uid(); n.pin = !!n.pin; n.deleted = !!n.deleted; });
  s.lists.forEach(l => { l.id = l.id || uid(); l.items = l.items || []; l.e = l.e || '📝'; l.deleted = !!l.deleted; });
  s.goals.forEach(g => { g.id = g.id || uid(); g.kind = g.kind || 'pct'; g.deleted = !!g.deleted; });
  s.people.forEach(p => { p.id = p.id || uid(); p.deleted = !!p.deleted; });
  s.checks = s.checks.filter(c => c && c.date);
  return s;
}
let S = blank();
try { const raw = localStorage.getItem(LS_KEY); if (raw) S = migrate(JSON.parse(raw)); } catch (e) { console.warn('Lumen: estado ilegible, empiezo de cero', e); }
let lastErr = '', pushErr = '';
let saveT = null;
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }
function save() { persist(); clearTimeout(saveT); saveT = setTimeout(sync, DEBOUNCE); }
const live = arr => arr.filter(x => x && !x.deleted);
function touch(o) { o.updated = Date.now(); }
function softDel(col, id, msg) {
  const o = S[col].find(x => x.id === id);
  if (o) { o.deleted = true; touch(o); }
  save(); render(); if (msg) toast(msg);
}

/* ---------- formato ---------- */
function fmtN(n) { n = +n || 0; return (Math.round(n * 100) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function money(n) { return (S.cfg.cur || '$') + fmtN(n); }
function relTime(ts) {
  const d = Date.now() - ts;
  if (d < 60e3) return 'ahora';
  if (d < 3600e3) return `hace ${Math.floor(d / 60e3)} min`;
  if (d < 864e5) return `hace ${Math.floor(d / 3600e3)} h`;
  return `hace ${Math.floor(d / 864e5)} d`;
}

/* ---------- avisos dentro de la app ---------- */
let toastT = null;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}
function burst(x, y) {
  const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
  c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
  const x2 = c.getContext('2d'), P = [];
  for (let i = 0; i < 90; i++) P.push({ x, y, vx: (Math.random() - .5) * 14, vy: Math.random() * -11 - 3, s: Math.random() * 5 + 3, c: ['#a78bfa', '#f9a8d4', '#fde68a', '#6ee7b7'][i % 4], l: 1 });
  let t0 = performance.now();
  (function tick(t) {
    x2.clearRect(0, 0, c.width, c.height); let alive = false;
    for (const p of P) { p.l -= .016; if (p.l <= 0) continue; alive = true; p.x += p.vx; p.y += p.vy; p.vy += .35; x2.globalAlpha = Math.max(p.l, 0); x2.fillStyle = p.c; x2.fillRect(p.x, p.y, p.s, p.s); }
    if (alive) requestAnimationFrame(tick); else c.remove();
  })(t0);
}
function notify(title, body) {
  try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png' }); } catch (e) {}
}

/* ---------- sonido suave ---------- */
let AC = null;
function ping(f = 880, d = .09) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.value = f; g.gain.value = .06;
    o.connect(g); g.connect(AC.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + d);
    o.stop(AC.currentTime + d);
  } catch (e) {}
}

/* ---------- fecha de hoy / siguiente ocurrencia ---------- */
const REPS = { daily: 'cada día', weekly: 'cada semana', monthly: 'cada mes', yearly: 'cada año' };
const REPS_ADV = { daily: 1, weekly: 7, monthly: null, yearly: null };
function nextDate(d, rep) {
  let x = fromYmd(d);
  if (rep === 'daily' || rep === 'weekly') { x.setDate(x.getDate() + REPS_ADV[rep]); return ymd(x); }
  if (rep === 'monthly') { x = new Date(x.getFullYear(), x.getMonth() + 1, x.getDate()); return ymd(x); }
  if (rep === 'yearly') { x = new Date(x.getFullYear() + 1, x.getMonth(), x.getDate()); return ymd(x); }
  return null;
}
function nextFuture(d, rep, from) {
  let x = d, n = 0;
  while (x && x <= from && n++ < 600) x = nextDate(x, rep);
  return x;
}
function sameWeek(a, b) {
  const da = fromYmd(a), db = fromYmd(b);
  const wa = new Date(da.getFullYear(), da.getMonth(), da.getDate() - da.getDay());
  const wb = new Date(db.getFullYear(), db.getMonth(), db.getDate() - db.getDay());
  return wa.getTime() === wb.getTime();
}

/* ---------- íconos ---------- */
const ic = (inner, size = 22) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const I = {
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  task: ic('<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 5l1 1 2-2M4 11l1 1 2-2M4 17l1 1 2-2"/>'),
  money: ic('<circle cx="12" cy="12" r="9"/><path d="M9 9.5h6M9 12.5h6M12 7v10M15 7c-1-.8-2.2-1.2-3-1.2S9.5 6.5 9 7.5c-.6 1.2.3 2.2 1.5 2.7 1.2.6 2.8.8 3.7 1.7.9.8.4 2.3-.7 2.8-1.1.6-2.6.4-3.5-.4"/>'),
  mind: ic('<path d="M12 3a7 7 0 0 1 7 7c0 2.5-1.3 4.3-3 5.5V18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.5C6.3 14.3 5 12.5 5 10a7 7 0 0 1 7-7z"/><path d="M12 3v17"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  search: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>'),
  bell: ic('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  chart: ic('<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>'),
  cal: ic('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/>'),
  clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  chevR: ic('<path d="M9 6l6 6-6 6"/>'),
  chevL: ic('<path d="M15 6l-6 6 6 6"/>'),
  x: ic('<path d="M18 6L6 18M6 6l12 12"/>'),
  edit: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: ic('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
  check: ic('<path d="M20 6L9 17l-5-5"/>'),
  pin: ic('<path d="M12 17v5M9 3h6l-1 6 4 3H6l4-3z"/>'),
  idea: ic('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.7c-.9.7-1 1.3-1 2.3h-6c0-1-.1-1.6-1-2.3A7 7 0 0 1 12 2z"/>'),
  refresh: ic('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  zap: ic('<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>'),
  heart: ic('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>'),
  flame: ic('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.2-.2-4.2 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.5-2.4 1.5-3.5 0 1.5.5 2.5 2 3z"/>'),
  link: ic('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  moon: ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  cloud: ic('<path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>'),
  phone: ic('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  play: ic('<path d="M5 3l14 9-14 9z"/>'),
  pause: ic('<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'),
  loop: ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 14),
  star: ic('<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z"/>', 20)
};
const CATS = {
  personal: { e: '👤', n: 'Personal', c: '#a78bfa' },
  trabajo: { e: '💼', n: 'Trabajo', c: '#60a5fa' },
  estudios: { e: '📚', n: 'Estudios', c: '#f59e0b' },
  salud: { e: '💪', n: 'Salud', c: '#34d399' },
  citas: { e: '📅', n: 'Citas', c: '#f472b6' },
  ideas: { e: '💡', n: 'Ideas', c: '#fbbf24' }
};
const GCATS = {
  comida: { e: '🍜', n: 'Comida' }, transporte: { e: '🚌', n: 'Transporte' }, hogar: { e: '🏠', n: 'Hogar' },
  salud: { e: '💊', n: 'Salud' }, ocio: { e: '🎉', n: 'Ocio' }, otros: { e: '📦', n: 'Otros' }
};
const shape = (k, size = 20) => { const c = CATS[k] || CATS.personal; return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="7" fill="${c.c}" opacity=".85"/><circle cx="9" cy="13" r="7" fill="#f9a8d4" opacity=".7"/><circle cx="15" cy="14" r="6" fill="#fde68a" opacity=".8"/></svg>`; };

/* ---------- temas ---------- */
function applyTheme() {
  const t = S.cfg.theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : '';
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------- fechas y agenda ---------- */
function mkDate(y, mo, d) { return `${y}-${pad(mo + 1)}-${pad(d)}`; }
function daysInMonth(y, mo) { return new Date(y, mo + 1, 0).getDate(); }
function monthLabel(y, mo) { return `${MONTHS[mo]} ${y}`; }
function weekLabel(a, b) { return `${a.slice(8)} ${MONTHS[+a.slice(5, 7) - 1].slice(0, 3)} – ${b.slice(8)} ${MONTHS[+b.slice(5, 7) - 1].slice(0, 3)}`; }

/* ---------- nube (Supabase REST) ---------- */
async function sb(path, opt = {}) {
  if (!S.cfg.url || !S.cfg.key) return null;
  const base = S.cfg.url.replace(/\/$/, '');
  const tok = opt.token || (S.sess && S.sess.tok);
  const r = await fetch(base + path, {
    method: opt.method || 'GET',
    headers: Object.assign({ apikey: S.cfg.key, Authorization: 'Bearer ' + (tok || S.cfg.key), 'Content-Type': 'application/json' }, opt.headers || {}),
    body: opt.body != null ? JSON.stringify(opt.body) : undefined
  });
  const txt = await r.text(); let j; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
  const first = Array.isArray(j) ? j[0] : j;
  if (!r.ok) throw new Error((first && (first.msg || first.message || first.error_description || first.error)) || ('Error ' + r.status));
  return j;
}
async function token() {
  if (!S.sess) return null;
  if (Date.now() < S.sess.exp - 60000) return S.sess.tok;
  const r = await fetch(S.cfg.url.replace(/\/$/, '') + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: S.cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: S.sess.ref }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { S.sess = null; persist(); throw new Error(j.error_description || 'Sesión caducada'); }
  S.sess.tok = j.access_token; S.sess.ref = j.refresh_token; S.sess.exp = Date.now() + (j.expires_in || 3600) * 1000;
  persist(); return S.sess.tok;
}
function cloudOn() { return !!(S.cfg.url && S.cfg.key); }

/* ---------- sync ---------- */
async function sync() {
  if (!cloudOn()) { lastErr = ''; return; }
  if (!navigator.onLine) { lastErr = 'Sin internet'; return; }
  try {
    const t = await token();
    const uidv = S.sess.uid;
    const st = S.meta.lastSync || 0;
    const cols = ['items', 'habits', 'moves', 'notes', 'lists', 'goals', 'people', 'checks', 'focus'];
    const rem = {};
    await Promise.all(cols.map(async c => {
      try { rem[c] = await sb(`/rest/v1/${c}?select=*&user_id=eq.${uidv}&updated=gt.${st}`, { token: t }); }
      catch (e) { rem[c] = []; }
    }));
    cols.forEach(c => {
      (rem[c] || []).forEach(r => {
        const i = S[c].findIndex(x => x.id === r.id);
        if (i >= 0) { if ((r.updated || 0) > (S[c][i].updated || 0)) S[c][i] = r; }
        else S[c].push(r);
      });
    });
    S.items.forEach(i => { if (!i.deleted && (!i.date || i.date.length === 10)) return; });
    S.meta.lastSync = Date.now();
    const dirty = [];
    cols.forEach(c => S[c].forEach(o => { if (!o.deleted && (!o.updated || o.updated > st)) dirty.push([c, o]); }));
    for (const [c, o] of dirty) {
      try { await sb(`/rest/v1/${c}?on_conflict=id`, { method: 'POST', token: t, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: o }); }
      catch (e) { }
    }
    S.meta.lastSync = Date.now();
    persist(); lastErr = '';
    const b = $('#syncDot'); if (b) b.hidden = false;
  } catch (e) { lastErr = e.message; console.warn('sync', e); }
}

/* ---------- utilidades UI ---------- */
function sec(t, right) { return `<div class="sec"><span>${t}</span>${right ? `<span class="rt">${right}</span>` : ''}</div>`; }
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); }
function openSheet(html, after) {
  const sh = $('#sheet'), sc = $('#scrim');
  sh.innerHTML = html; sh.classList.add('open'); sc.hidden = false;
  if (after) after();
}
function closeSheet() { const sh = $('#sheet'); sh.classList.remove('open'); sh.innerHTML = ''; $('#scrim').hidden = true; }
function option(v, cur, l) { return `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`; }

/* ---------- tarjeta de ánimo ---------- */
function checkCard() {
  const t = today();
  if (live(S.checks).some(c => c.date === t)) return '';
  const btns = FACES.map((f, i) => `<button class="face" data-act="check" data-m="${i + 1}">${f}</button>`).join('');
  return `<div class="card"><div class="cc"><p>¿Cómo vas hoy?</p><div class="faces">${btns}</div></div></div>`;
}

/* ---------- tareas, agenda y parser ---------- */
function todaySet() {
  const t = today();
  const L = live(S.items);
  const due = i => i.date && i.date <= t;
  const today = L.filter(i => !i.done && due(i));
  const over = today.filter(i => i.date < t);
  const done = L.filter(i => i.done && i.doneAt && ymd(new Date(i.doneAt)) === t).length;
  return { t, today, over, done, total: today.length };
}
function notifyDue() {
  const { over } = todaySet();
  if (over.length && !sessionStorage.getItem('lumen.warned')) {
    sessionStorage.setItem('lumen.warned', '1');
    notify('Tienes pendientes atrasados', `${plural(over.length, 'tarea', 'tareas')} por cerrar.`);
  }
}

const byDate = (a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : 0;
const byTime = (a, b) => (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : byDate(a, b);
function streak(h) {
  const t = today(); let n = 0, d = t;
  if (!h.log[t]) d = addDays(t, -1);
  while (h.log[d]) { n++; d = addDays(d, -1); }
  return n;
}

function itemSheet(it) {
  const v = it || { title: '', cat: 'personal', type: 'task', date: '', time: '', repeat: null, star: false, amount: null, remind: null };
  openSheet(`<h3 class="sh-t">${it ? 'Editar' : 'Nuevo pendiente'}</h3>
    <input id="iTitle" class="in big" placeholder="Qué hay que hacer" value="${esc(v.title)}" autocomplete="off">
    <div class="g2" style="margin-top:12px">
      <label>Tipo<select id="iType" class="in">${option('task', v.type, 'Tarea')}${option('appt', v.type, 'Cita')}${option('pay', v.type, 'Pago')}</select></label>
      <label>Categoría<select id="iCat" class="in">${Object.entries(CATS).map(([k, c]) => option(k, v.cat, `${c.e} ${c.n}`)).join('')}</select></label>
    </div>
    <div class="g2" style="margin-top:12px">
      <label>Fecha<input id="iDate" type="date" class="in" value="${v.date || ''}"></label>
      <label>Hora<input id="iTime" type="time" class="in" value="${v.time || ''}"></label>
    </div>
    <div class="g2" style="margin-top:12px">
      <label>Repetir<select id="iRep" class="in"><option value="">No</option>${Object.entries(REPS).map(([k, l]) => option(k, v.repeat, l)).join('')}</select></label>
      <label>Monto (opcional)<input id="iAmt" inputmode="decimal" class="in" placeholder="45" value="${v.amount != null ? v.amount : ''}"></label>
    </div>
    <div class="acts wrap" style="margin-top:12px">
      ${it ? `<button class="btn ${v.star ? 'pri' : ''}" data-act="i-star">${v.star ? '★ Importante' : '☆ Marcar importante'}</button><button class="btn" data-act="i-del">Borrar</button>` : ''}
      <button class="btn pri" data-act="i-save">Guardar</button>
    </div>`, () => {
    setTimeout(() => { const e = $('#iTitle'); if (e) e.focus(); }, 260);
    $('#iTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); A['i-save'](); } });
  });
}

function guessType(s) {
  s = s.toLowerCase();
  if (/pagar|pago|cuenta|factura|renta|luz|agua|internet|teléfono|telefono|tarjeta|prestamo|préstamo|seguro/.test(s)) return 'pay';
  if (/cita|médico|medico|dentista|reunion|reunión|corte|examen|terapia|vuelo|viaje/.test(s)) return 'appt';
  return 'task';
}
function guessCat(s) {
  s = s.toLowerCase();
  if (/trabajo|oficina|jefe|reunion|reunión|correo|cliente|entrega|informe|reunión|junta/.test(s)) return 'trabajo';
  if (/estudiar|examen|clase|tarea|curso|aprender|leer|universidad|escuela/.test(s)) return 'estudios';
  if (/gym|ejercicio|correr|caminar|dormir|agua|comer|doctor|salud|medicina/.test(s)) return 'salud';
  if (/comprar|arreglar|llamar|enviar|limpiar|organizar|sacar|pagar|cancelar|sacar cita|reservar/.test(s)) return 'personal';
  return 'personal';
}

function parseQuick(text) {
  const raw = strip(text); if (!raw) return null;
  let s = raw.toLowerCase()
    .replace(/\bel\s+(\d{1,2})\b(?!\s*:\s*\d)/g, ' $1 ')
    .replace(/\b(?:de\s+)?(?:las?\s+)?(\d{1,2}):(\d{2})\b/g, ' $1:$2 ')
    .replace(/\b(?:a\s+)?las\s+(\d{1,2})(?!\s*[:\d])\b/g, ' $1:00 ')
    .replace(/\s+/g, ' ').trim();
  const t = new Date(), tk = today();
  const data = { title: raw, cat: guessCat(s), type: guessType(s), date: tk, time: null, repeat: null, amount: null };

  const rep = s.match(/\b(cada\s+(?:d[ií]a|semana|mes|a[nñ]o)|diariamente|todos\s+los\s+d[ií]as|semanalmente|mensualmente|anualmente)\b/);
  if (rep) {
    const w = rep[1];
    data.repeat = /d[ií]a|diariamente/.test(w) ? 'daily' : /semana|semanalmente/.test(w) ? 'weekly' : /mes|mensualmente/.test(w) ? 'monthly' : 'yearly';
    s = s.replace(rep[0], ' ');
  }

  const tm = s.match(/(^|\s)(\d{1,2}:\d{2})(\s|$)/);
  if (tm) {
    const [h, m] = tm[2].split(':').map(Number);
    if (h < 24 && m < 60) { data.time = pad(h) + ':' + pad(m); s = s.replace(tm[2], ' '); }
  }

  const am = s.match(/(\d+(?:\.\d+)?)/);
  if (am) {
    let val = parseFloat(am[1]);
    if (/k\b/.test(s.slice(am.index))) val *= 1000;
    data.amount = val;
    if (data.type === 'task') data.type = 'pay';
    s = s.replace(am[0], ' ');
  }

  const mon = s.match(/\b(?:proximo|próximo|siguiente)\s+(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/);
  const wd = s.match(/\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/);
  const monMap = {}; ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'].forEach((d, i) => { monMap[d] = i; monMap[d.replace('é', 'e').replace('á', 'a')] = i; });
  let dow = null;
  if (mon) dow = monMap[mon[1]];
  else if (wd && !/hoy/.test(s)) dow = monMap[wd[1]];
  if (dow != null) {
    const add = (dow - t.getDay() + 7) % 7 || 7;
    data.date = addDays(tk, mon ? add : ((dow - t.getDay() + 7) % 7));
    if (!data.repeat) data.repeat = 'weekly';
    s = s.replace(mon ? mon[0] : wd[0], ' ');
  }

  const day = s.match(/\b(\d{1,2})\b/);
  if (day) {
    const n = +day[1];
    if (n >= 1 && n <= 31) {
      let y = t.getFullYear(), m = t.getMonth(), d = n;
      const cand = mkDate(y, m, d);
      if (cand < tk && !data.repeat) { m += 1; if (m > 11) { m = 0; y += 1; } d = Math.min(n, daysInMonth(y, m)); }
      if (data.repeat === 'monthly' || data.repeat === 'yearly') {
        const mx = data.repeat === 'yearly' ? 11 : m;
        d = Math.min(n, daysInMonth(y, mx));
      }
      data.date = mkDate(y, m, d);
      s = s.replace(day[0], ' ');
    }
  }

  const monName = s.match(/\b(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/);
  if (monName) {
    const mn = MONTHS.indexOf(monName[2]);
    const y = t.getFullYear();
    let md = +(s.match(/\b(\d{1,2})\b/) || [0, fromYmd(data.date).getDate()])[1];
    md = Math.min(md, daysInMonth(y, mn));
    data.date = mkDate(y, mn, md);
    s = s.replace(monName[0], ' ');
  }

  if (/\bhoy\b/.test(s)) s = s.replace(/\bhoy\b/, ' ');
  if (/\bma[nñ]ana\b/.test(s)) { data.date = addDays(tk, 1); s = s.replace(/\bma[nñ]ana\b/, ' '); }
  if (/\bpasado\s+ma[nñ]ana\b/.test(s)) { data.date = addDays(tk, 2); s = s.replace(/\bpasado\s+ma[nñ]ana\b/, ' '); }

  data.title = strip(s).replace(/\s+/g, ' ').replace(/^\s*(el|la|de|a|para|en)\s+/i, '');
  if (!data.title) data.title = raw;
  return data;
}

function editSheet(ev, id) {
  const it = S.items.find(x => x.id === id);
  if (it) itemSheet(it);
}

/* ---------- estado de enfoque ---------- */
let RUN = null, runTimer = null;
function setRun(r) { RUN = r; persist(); }
function focusTick() {
  if (!RUN) { const p = $('#runPill'); if (p) p.hidden = true; return; }
  const left = RUN.until - Date.now();
  if (left <= 0) { focusDone(); return; }
  const p = $('#runPill');
  if (p) { p.hidden = false; const m = Math.floor(left / 60000), s2 = Math.floor((left % 60000) / 1000); $('#runTxt').textContent = `${pad(m)}:${pad(s2)} · ${RUN.title || 'Enfoque'}`; }
}
function logFocus(min) {
  const t = today();
  const f = live(S.focus).find(x => x.date === t);
  if (f) { f.min = (+f.min || 0) + min; touch(f); }
  else S.focus.push({ id: uid(), date: t, min, updated: Date.now() });
  save();
}
function focusSheet() {
  openSheet(`<h3 class="sh-t">Enfoque</h3>
    <p class="hint">Una ronda tranquila. Sin notificaciones de otras apps, solo esto.</p>
    <div class="seg" id="fSeg">${[15, 25, 45, 60].map(m => `<button type="button" data-m="${m}">${m} min</button>`).join('')}</div>
    <input id="fWhat" class="in" placeholder="¿En qué? (opcional)">
    <div class="acts"><button class="btn pri" data-act="f-go">Empezar</button></div>`);
}
function focusStart(min, title) {
  setRun({ id: null, dur: min, title: title || '', until: Date.now() + min * 60000 });
  ping(660, .12);
  focusTick(); render();
}
function focusDone() {
  const r = RUN; if (!r) return;
  setRun(null); logFocus(r.dur);
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  notify('Ronda lista', `Terminaste ${r.dur} min${r.title ? ' en «' + r.title + '»' : ''}`);
  focusTick(); render();
  openSheet(`<h3 class="sh-t">¡Ronda lista!</h3>
    <p class="hint" style="font-size:17px;color:var(--ink)">${r.dur} minutos de enfoque${r.title ? ` en <b>${esc(r.title)}</b>` : ''}. Levántate, estira y toma agua.</p>
    <div class="acts wrap">${r.id ? `<button class="btn pri" data-act="fc-complete" data-id="${r.id}">Ya la terminé</button>` : ''}<button class="btn" data-act="fc-again" data-id="${r.id || ''}">Otra ronda</button><button class="btn" data-act="close">Cerrar</button></div>`);
}

/* ---------- dinero: gastos, ingresos, presupuesto ---------- */
function guessGcat(s) {
  s = strip(s).toLowerCase();
  const M = [
    ['comida', /almuerzo|cena|desayuno|comida|super|mercado|cafe|restaurante|pizza|hamburguesa|snack|antojo|panaderia|verdura|fruta/],
    ['transporte', /uber|taxi|bus|gasolina|pasaje|parqueo|peaje|metro|didi|combustible/],
    ['hogar', /casa|limpieza|mueble|reparacion|ferreteria|cocina|detergente|jabon/],
    ['salud', /farmacia|medicina|doctor|dentista|gym|gimnasio|vitamina|consulta|terapia/],
    ['ocio', /cine|salida|bar|fiesta|juego|concierto|regalo|netflix|libro|cerveza|trago|paseo/]
  ];
  for (const [k, re] of M) if (re.test(s)) return k;
  return 'otros';
}
let MS = { kind: 'out', mv: null, cat: 'otros', touched: false };
function moneySheet(kind, mv) {
  const out = kind === 'out';
  MS = { kind, mv: mv || null, cat: mv ? (mv.cat || 'otros') : 'otros', touched: !!mv };
  const v = mv || { amount: '', note: '', date: ymd(new Date()) };
  openSheet(`<h3 class="sh-t">${mv ? 'Editar' : (out ? 'Nuevo gasto' : 'Nuevo ingreso')}</h3>
    <input id="mAmt" class="in big" inputmode="decimal" placeholder="${esc(S.cfg.cur || '$')} 0" value="${v.amount}" aria-label="Monto">
    <input id="mNote" class="in" style="margin-top:10px" autocomplete="off" placeholder="${out ? 'En qué (almuerzo, taxi, farmacia)' : 'De dónde (sueldo, venta, regalo)' }" value="${esc(v.note)}">
    ${out ? `<div class="cats" id="mCats" style="margin-top:12px">${Object.entries(GCATS).map(([k, c]) => `<button type="button" data-c="${k}">${c.e} ${c.n}</button>`).join('')}</div>` : ''}
    <label style="margin-top:12px">Fecha<input id="mDate" type="date" class="in" value="${v.date}"></label>
    <div class="acts">${mv ? '<button class="btn" data-act="m-del">Borrar</button>' : ''}<button class="btn pri" data-act="m-save">Guardar</button></div>`, () => {
    const drawC = () => document.querySelectorAll('#mCats button').forEach(b => b.classList.toggle('on', b.dataset.c === MS.cat));
    drawC();
    if (out) {
      $('#mCats').onclick = e => { const b = e.target.closest('button'); if (!b) return; MS.cat = b.dataset.c; MS.touched = true; drawC(); };
      $('#mNote').addEventListener('input', () => {
        const n = $('#mNote').value.trim(); if (n.length < 3) return;
        if (!MS.touched) { MS.cat = guessGcat(n); drawC(); }
        if (!MS.mv && !$('#mAmt').value) {
          const pr = [...live(S.moves)].reverse().find(m => m.kind === 'out' && m.note && strip(m.note).toLowerCase() === strip(n).toLowerCase());
          if (pr) { $('#mAmt').value = pr.amount; if (!MS.touched) { MS.cat = pr.cat; drawC(); } }
        }
      });
    }
    ['mAmt', 'mNote'].forEach(id => $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); A['m-save'](); } }));
    setTimeout(() => { const e = $('#mAmt'); if (e) e.focus(); }, 260);
  });
}
function mvRow(m) {
  const out = m.kind === 'out', g = out ? (GCATS[m.cat] || GCATS.otros) : { e: '💰', n: 'Ingreso' };
  return `<div class="mv" data-act="mv" data-id="${m.id}" tabindex="0"><span class="me">${g.e}</span><div><b>${esc(m.note || g.n)}</b><small>${g.n}, ${rel(m.date)}</small></div><span class="v ${out ? '' : 'pos'}">${out ? '−' : '+'}${money(m.amount)}</span></div>`;
}

/* ---------- metas ---------- */
const goalPct = g => g.kind === 'num' ? Math.min(100, Math.round((+g.progress || 0) / (+g.target || 1) * 100)) : Math.min(100, Math.round(+g.progress || 0));
function goalHtml(g) {
  const pct = goalPct(g), unit = g.unit ? ' ' + g.unit : '';
  const txt = g.kind === 'num' ? `${fmtN(g.progress || 0)} de ${fmtN(g.target || 0)}${unit}` : `${pct}%`;
  let extra = '';
  if (pct >= 100) extra = '¡Cumplida!';
  else if (g.due) {
    const left = -daysSince(g.due);
    extra = left < 0 ? 'La fecha ya pasó' : left === 0 ? 'Vence hoy' : `Faltan ${left} ${left === 1 ? 'día' : 'días'}`;
    if (g.kind === 'num' && left > 0) extra += `, necesitas ${fmtN(Math.ceil((g.target - g.progress) / Math.max(1, left / 7)))}${unit} por semana`;
  }
  return `<div class="goal ${pct >= 100 ? 'won' : ''}" data-act="goal" data-id="${g.id}" tabindex="0"><div class="ge">${esc(g.emoji || '🎯')}</div><div class="gb"><b>${esc(g.title)}</b><div class="bar"><i style="width:${pct}%"></i></div><small>${esc(txt)}${extra ? '<br>' + esc(extra) : ''}</small></div></div>`;
}
let GS = { g: null, kind: 'pct' };
function goalSheet(g) {
  GS = { g: g || null, kind: g ? g.kind : 'pct' };
  const v = g || { title: '', emoji: '🎯', target: '', progress: 0, unit: '', due: '' };
  openSheet(`<h3 class="sh-t">${g ? 'Meta' : 'Nueva meta'}</h3>
    <div class="addh" style="margin:0 0 12px"><input id="gEmoji" class="in" maxlength="2" value="${esc(v.emoji)}" style="width:62px;text-align:center" aria-label="Emoji"><input id="gTitle" class="in" placeholder="Por ejemplo: ahorrar para el viaje" value="${esc(v.title)}"></div>
    <div class="seg" id="gKind"><button type="button" data-k="pct">Porcentaje</button><button type="button" data-k="num">Número</button></div>
    <div id="gNum" class="g2"><label>Meta<input id="gTarget" inputmode="decimal" class="in" value="${v.target ?? ''}"></label><label>Unidad<input id="gUnit" class="in" placeholder="$, km, libros" value="${esc(v.unit || '')}"></label></div>
    <label id="gProgL">Avance actual<input id="gProg" inputmode="decimal" class="in" value="${v.kind === 'num' ? (v.progress ?? 0) : 0}"></label>
    <div id="gRangeBox"><p class="hint" id="gOut">Avance: ${v.kind === 'pct' || !g ? (+v.progress || 0) : 0}%</p><input id="gRange" type="range" min="0" max="100" value="${v.kind === 'pct' || !g ? (+v.progress || 0) : 0}" aria-label="Avance en porcentaje"></div>
    <label style="margin-top:12px">Fecha límite (opcional)<input id="gDue" type="date" class="in" value="${v.due || ''}"></label>
    <div class="acts" style="flex-wrap:wrap">${g ? `<button class="btn" data-act="remind" data-col="goals" data-id="${g.id}">🔔 ${g.remind && g.remind.date ? esc(remLabel(g.remind)) : 'Recordarme'}</button><button class="btn" data-act="goal-del">Borrar</button>` : ''}<button class="btn pri" data-act="goal-save">Guardar</button></div>`, () => {
    const draw = () => {
      document.querySelectorAll('#gKind button').forEach(b => b.classList.toggle('on', b.dataset.k === GS.kind));
      $('#gNum').hidden = GS.kind !== 'num'; $('#gProgL').hidden = GS.kind !== 'num'; $('#gRangeBox').hidden = GS.kind !== 'pct';
    };
    draw();
    $('#gKind').onclick = e => { const b = e.target.closest('button'); if (b) { GS.kind = b.dataset.k; draw(); } };
    $('#gRange').oninput = () => { $('#gOut').textContent = 'Avance: ' + $('#gRange').value + '%'; };
  });
}

/* ---------- gente ---------- */
const dueFolks = () => live(S.people).filter(p => p.last && daysSince(p.last) >= (p.every || 30)).sort((a, b) => daysSince(b.last) - daysSince(a.last));
function personHtml(p) {
  const n = p.last ? daysSince(p.last) : null, due = n != null && n >= (p.every || 30);
  const txt = n == null ? 'sin registro' : n === 0 ? 'hablaron hoy' : `hace ${n} ${n === 1 ? 'día' : 'días'}`;
  return `<div class="person ${due ? 'due' : ''}"><div class="pa" data-act="person" data-id="${p.id}" tabindex="0">${esc((p.name || '?')[0].toUpperCase())}</div><div class="pb" data-act="person" data-id="${p.id}"><b>${esc(p.name)}</b><small>${txt}${due ? ', toca escribirle' : ''}</small></div><button class="btn" data-act="p-done" data-id="${p.id}">Ya hablamos</button></div>`;
}
let PS = null;
function personSheet(p) {
  PS = p || null;
  const v = p || { name: '', every: 30, last: ymd(new Date()), bday: '' };
  openSheet(`<h3 class="sh-t">${p ? 'Persona' : 'Nueva persona'}</h3>
    <input id="pName" class="in big" placeholder="Nombre" autocomplete="off" value="${esc(v.name)}">
    <div class="g2" style="margin-top:12px"><label>Hablar cada<select id="pEvery" class="in">${[[7, 'semana'], [14, '2 semanas'], [30, 'mes'], [60, '2 meses'], [90, '3 meses']].map(([d, l]) => `<option value="${d}" ${+v.every === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Última vez<input id="pLast" type="date" class="in" value="${v.last || ''}"></label></div>
    <label>Cumpleaños (opcional)<input id="pBday" type="date" class="in" value="${v.bday || ''}"></label>
    <p class="hint">Si pones el cumpleaños, lo agrego a tu agenda cada año.</p>
    <div class="acts">${p ? '<button class="btn" data-act="p-del">Borrar</button>' : ''}<button class="btn pri" data-act="p-save">Guardar</button></div>`, () => setTimeout(() => { const e = $('#pName'); if (e && !p) e.focus(); }, 260));
}
function activeBday(p) { return S.items.find(x => !x.deleted && !x.done && x.repeat === 'yearly' && (x.id === p.bdayId || x.title === `Cumple de ${p.name}`)) || null; }
function syncBday(p, oldName) {
  const it = activeBday({ ...p, name: oldName || p.name }) || activeBday(p);
  if (!p.bday) { if (it) { it.deleted = true; touch(it); } p.bdayId = null; return; }
  const b = fromYmd(p.bday), now = new Date(), t = ymd(now);
  let d = mkDate(now.getFullYear(), b.getMonth(), b.getDate());
  if (d < t) d = mkDate(now.getFullYear() + 1, b.getMonth(), b.getDate());
  const data = { title: `Cumple de ${p.name}`, type: 'appt', cat: 'citas', date: d, repeat: 'yearly' };
  if (it) { Object.assign(it, data); touch(it); p.bdayId = it.id; }
  else { const n = { id: uid(), done: false, created: Date.now(), updated: Date.now(), time: null, amount: null, ...data }; S.items.push(n); p.bdayId = n.id; }
}

/* ---------- revisión semanal ---------- */
function weekStats() {
  const t = ymd(new Date()), from = addDays(t, -6), pf = addDays(t, -13), pt = addDays(t, -7), L = live(S.items);
  const done = L.filter(i => i.done && i.doneAt && ymd(new Date(i.doneAt)) >= from).length;
  const late = L.filter(i => !i.done && i.date && i.date < t).length;
  const H = live(S.habits); let hp = null;
  if (H.length) { let n = 0; H.forEach(h => { for (let k = 0; k < 7; k++) if (h.log[addDays(t, -k)]) n++; }); hp = Math.round(n / (H.length * 7) * 100); }
  const mc = live(S.checks).filter(c => c.date >= from && c.date <= t), mood = mc.length ? mc.reduce((s, c) => s + c.mood, 0) / mc.length : null;
  const focus = sumBy(live(S.focus).filter(f => f.date >= from && f.date <= t), 'min');
  const out = live(S.moves).filter(m => m.kind === 'out');
  return { done, late, habitPct: hp, mood, focus, spent: sumBy(out.filter(m => m.date >= from && m.date <= t)), prev: sumBy(out.filter(m => m.date >= pf && m.date <= pt)), hasMoves: out.length > 0 };
}
function reviewDue() {
  const dw = new Date().getDay(); if (dw !== 0 && dw !== 1) return false;
  const cut = Date.now() - 5 * 864e5;
  return !live(S.notes).some(n => n.review && n.created > cut);
}
function reviewSheet() {
  const s = weekStats(), lines = [];
  if (s.late) lines.push(`Te quedan ${s.late} ${s.late === 1 ? 'pendiente atrasado' : 'pendientes atrasados'}.`);
  if (s.mood != null) lines.push(`Tu ánimo promedió ${FACES[Math.round(s.mood) - 1]} ${s.mood.toFixed(1)} de 5.`);
  if (s.hasMoves) lines.push(`Gastaste ${money(s.spent)}${s.prev ? `, ${s.spent > s.prev ? 'más' : 'menos'} que la semana anterior (${money(s.prev)})` : ''}.`);
  openSheet(`<h3 class="sh-t">Tu semana</h3>
    <div class="trio"><div><small>Hechas</small><b>${s.done}</b></div><div><small>Rituales</small><b>${s.habitPct == null ? '–' : s.habitPct + '%'}</b></div><div><small>Enfoque</small><b>${s.focus}<i class="u">min</i></b></div></div>
    ${lines.length ? `<p class="msub">${esc(lines.join(' '))}</p>` : ''}
    <label style="margin-top:16px">¿Qué salió bien?<textarea id="rvA" class="in" rows="2"></textarea></label>
    <label>¿Qué te frenó?<textarea id="rvB" class="in" rows="2"></textarea></label>
    <label>¿Qué es lo único que importa la próxima semana?<input id="rvC" class="in" placeholder="Lo convierto en tarea importante"></label>
    <div class="acts"><button class="btn pri" data-act="rv-save">Guardar revisión</button></div>`);
}

/* ---------- vistas (Hoy, Dinero, Mente) ---------- */
function cloudBanner() {
  if (S.sess && !lastErr) return '';
  const off = /fetch|network|internet/i.test(lastErr);
  const msg = !S.sess ? 'Entra con tu correo para guardar todo en la nube. Si cambias de celular o reinstalas la app, no pierdes nada.' : off ? 'Sin internet: lo nuevo se guardará en la nube al volver la conexión.' : 'No se está guardando en la nube: ' + lastErr;
  return `<div class="idea">${shape('citas', 22)}<p>${esc(msg)}</p>${off ? '' : `<button class="btn" data-act="settings">${S.sess ? 'Ver' : 'Entrar'}</button></div>`;
}
function pinnedHabits() {
  const t = ymd(new Date()), H = live(S.habits), P = H.filter(h => h.pin);
  if (!H.length) return '';
  if (!P.length) return '<p class="hint" style="margin:14px 2px 0">Toca 📌 en un ritual (pestaña Mente) para fijarlo aquí y marcarlo con un toque.</p>';
  const dn = P.filter(h => h.log[t]).length;
  return sec('Rituales', `${dn}/${P.length}`) + `<div class="hrow">${P.map(h => { const st = streak(h); return `<button class="hchip ${h.log[t] ? 'on' : ''}" data-act="hday" data-id="${h.id}" data-d="${t}" aria-pressed="${!!h.log[t]}"><span>${esc(h.emoji)}</span>${esc(h.name)}${st > 1 ? ` <small>🔥${st}</small>` : ''}</button>`; }).join('')}</div>`;
}
function vHoy() {
  const d = new Date(), t = ymd(d);
  const { today, over, done, total } = todaySet();
  const p = total ? done / total : 0;
  const say = total ? (done === total ? 'Todo listo por hoy.' : `${done} de ${total} listas.`) : (over.length ? 'Hoy está libre, pero quedó algo atrás.' : 'Hoy está libre.');
  const L = live(S.items), isFav = i => i.star && !i.done;
  const fav = L.filter(isFav).sort(byDate);
  const todayList = today.filter(i => !isFav(i)).sort(byTime), overList = over.filter(i => !isFav(i));
  const up = L.filter(i => !i.done && !i.star && i.date > t && i.date <= addDays(t, 7)).sort(byDate);
  const undated = L.filter(i => !i.done && !i.star && !i.date).sort((a, b) => (b.created || 0) - (a.created || 0));
  const mp = L.filter(i => i.type === 'pay' && !i.done && i.date && i.date.startsWith(t.slice(0, 7)));
  const mpSum = sumBy(mp), H = live(S.habits), sg =…[LINES 882–1181 OMITTED — see local file]…
}

/* ---------- resto de la app ---------- */
