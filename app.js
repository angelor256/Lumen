'use strict';
/* ==========================================================================
   LUMEN · organizador de vida
   Un solo archivo JS, sin dependencias. Guarda en el celular (localStorage)
   y, si lo configuras, sincroniza con Supabase (ver README.md).
   ========================================================================== */

// <PURE>  ← lógica pura, probada con node
const CATS = {
  pagos:    { n: 'Pagos',    c: 'var(--sol)' },
  citas:    { n: 'Citas',    c: 'var(--rosa)' },
  personal: { n: 'Personal', c: 'var(--menta)' },
  trabajo:  { n: 'Trabajo',  c: 'var(--azul)' },
  ideas:    { n: 'Ideas',    c: 'var(--naranja)' }
};
const DAYS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const DAYS_FULL = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DAYS_S = ['dom','lun','mar','mié','jue','vie','sáb'];
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTHS_S = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const REP = { weekly: 'cada semana', monthly: 'cada mes', yearly: 'cada año' };

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const mkDate = (y, mo, d) => { const last = new Date(y, mo + 1, 0).getDate(); return ymd(new Date(y, mo, Math.min(d, last))); };
const addMonths = (s, n) => { const d = fromYmd(s); return mkDate(d.getFullYear(), d.getMonth() + n, d.getDate()); };
const nextDate = (s, rep) => rep === 'weekly' ? addDays(s, 7) : rep === 'monthly' ? addMonths(s, 1) : rep === 'yearly' ? addMonths(s, 12) : s;
const strip = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function num(s) {
  s = String(s).replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    const dec = lc > ld ? ',' : '.', th = dec === ',' ? '.' : ',';
    s = s.split(th).join('').replace(dec, '.');
  } else if (lc > -1 || ld > -1) {
    const sep = lc > -1 ? ',' : '.', parts = s.split(sep);
    s = (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) ? parts.join('') : parts.join('.');
  }
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

/* Entiende frases como "pagar luz 45 el 25 cada mes" o "cita dentista mañana 3pm" */
function parseQuick(text, now = new Date()) {
  let o = String(text || '').normalize('NFC');
  let n = strip(o).toLowerCase();
  const out = { title: '', type: 'task', cat: 'personal', date: null, time: null, amount: null, repeat: null, star: false };
  const today = ymd(now);
  const cut = (re, fn) => {
    const m = re.exec(n);
    if (!m) return false;
    const sp = ' '.repeat(m[0].length);
    n = n.slice(0, m.index) + sp + n.slice(m.index + m[0].length);
    o = o.slice(0, m.index) + sp + o.slice(m.index + m[0].length);
    if (fn) fn(m);
    return true;
  };
  const dow = (name, incl) => {
    const idx = DAYS.indexOf(name);
    let diff = (idx - now.getDay() + 7) % 7;
    if (!diff && !incl) diff = 7;
    return addDays(today, diff);
  };
  const monthRe = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';

  // importante
  cut(/(?:^|\s)!+(?=\s|$)/, () => out.star = true) || cut(/\b(?:urgente|importante)\b/, () => out.star = true);

  // repetición
  cut(/\bcada (lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/, m => { out.repeat = 'weekly'; out.date = dow(m[1], true); })
    || cut(/\b(?:cada mes|mensual(?:mente)?|todos los meses)\b/, () => out.repeat = 'monthly')
    || cut(/\b(?:cada semana|semanal(?:mente)?|todas las semanas)\b/, () => out.repeat = 'weekly')
    || cut(/\b(?:cada ano|anual(?:mente)?|todos los anos)\b/, () => out.repeat = 'yearly');

  // hora
  const setT = (h, mi, ap, dp) => {
    h = +h; mi = mi ? +mi : 0;
    if (ap) { ap = ap[0]; if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0; }
    else if (dp) { if ((dp === 'tarde' || dp === 'noche') && h < 12) h += 12; if (dp === 'manana' && h === 12) h = 0; }
    else if (h >= 1 && h <= 7) h += 12;
    if (h > 23 || mi > 59) return;
    out.time = `${pad(h)}:${pad(mi)}`;
  };
  const clean = x => x && x.replace(/\./g, '');
  cut(/(?:^|\s)(?:a las?|@)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?:\s*(?:de la|por la|en la)\s+(manana|tarde|noche))?(?!\d)/, m => setT(m[1], m[2], clean(m[3]), m[4]))
    || cut(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/, m => setT(m[1], m[2], clean(m[3])))
    || cut(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/, m => setT(m[1], 0, clean(m[2])))
    || cut(/\b(\d{1,2})\s*(?:de la|por la|en la)\s+(manana|tarde|noche)\b/, m => setT(m[1], 0, null, m[2]));

  // fecha
  cut(/\bpasado manana\b/, () => out.date = addDays(today, 2))
    || cut(/\bmanana\b/, () => out.date = addDays(today, 1))
    || cut(/\b(?:hoy|esta noche|esta tarde)\b/, () => out.date = today)
    || cut(/\ben (\d{1,3}) dias?\b/, m => out.date = addDays(today, +m[1]))
    || cut(/\ben (\d{1,2}) semanas?\b/, m => out.date = addDays(today, 7 * m[1]))
    || cut(/\b(?:el proximo |proximo |este |el )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/, m => out.date = dow(m[1]))
    || cut(new RegExp('\\b(?:el |dia )?(\\d{1,2}) de ' + monthRe + '\\b'), m => {
      const mo = MONTHS.indexOf(m[2] === 'setiembre' ? 'septiembre' : m[2]);
      let d = mkDate(now.getFullYear(), mo, +m[1]);
      if (d < today) d = mkDate(now.getFullYear() + 1, mo, +m[1]);
      out.date = d;
    })
    || cut(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/, m => {
      const mo = +m[2] - 1; if (mo < 0 || mo > 11) return;
      let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
      let d = mkDate(y, mo, +m[1]);
      if (!m[3] && d < today) d = mkDate(y + 1, mo, +m[1]);
      out.date = d;
    })
    || cut(/\b(?:el|dia|los dias?)\s+(\d{1,2})\b/, m => {
      const d = +m[1]; if (d < 1 || d > 31) return;
      let r = mkDate(now.getFullYear(), now.getMonth(), d);
      if (r < today) r = mkDate(now.getFullYear(), now.getMonth() + 1, d);
      out.date = r;
    });

  // monto
  cut(/(?:us\$|rd\$|\$|usd|eur|€)\s?(\d[\d.,]*)/, m => out.amount = num(m[1]))
    || cut(/(\d[\d.,]*)\s?(?:\$|dolares|dolar|pesos|usd|euros|colones|lempiras|soles|quetzales)(?![a-z])/, m => out.amount = num(m[1]));
  const isPay = /\b(pagar|pago|pagos|factura|recibo|renta|alquiler|hipoteca|luz|agua|internet|telefono|celular|tarjeta|cuota|suscripcion|netflix|spotify|seguro|prestamo|deuda|impuesto|impuestos|colegiatura|matricula)\b/.test(n);
  if (out.amount == null && isPay) cut(/(?:^|\s)(\d[\d.,]*)(?=\s|$)/, m => out.amount = num(m[1]));

  // tipo y categoría
  const isWork = /\b(trabajo|cliente|clientes|proyecto|entrega|informe|deploy|codigo|jefe|oficina|sprint|reporte|presentacion|standup|equipo)\b/.test(n);
  const isAppt = /\b(cita|doctor|doctora|dentista|medico|reunion|junta|entrevista|llamada|examen|clase|cumple|cumpleanos|vuelo|cena|almuerzo|turno|consulta|terapia|peluqueria|gym|gimnasio)\b/.test(n);
  const isIdea = /\bidea\b/.test(n);
  if (isPay || out.amount != null) { out.type = 'pay'; out.cat = 'pagos'; }
  else if (isWork) { out.cat = 'trabajo'; out.type = (out.time || isAppt) ? 'appt' : 'task'; }
  else if (isAppt || out.time) { out.type = 'appt'; out.cat = 'citas'; }
  else if (isIdea) { out.cat = 'ideas'; }
  if (out.time && !out.date) out.date = today;

  // título limpio
  let t = o.replace(/\s+/g, ' ').trim();
  t = t.replace(/^(?:recu[eé]rdame|recordarme|recordar)\s+(?:que\s+)?/i, '');
  for (let k = 0; k < 3; k++) {
    t = t.replace(/\s+(?:el|la|los|las|de|del|a|al|para|en|por|y|con)$/i, '').replace(/^(?:el|la|de|para|que)\s+(?=\S)/i, '');
  }
  t = t.replace(/[,;:\-–\s]+$/, '').trim();
  out.title = t ? t[0].toUpperCase() + t.slice(1) : '';
  return out;
}
// </PURE>

/* ============================ ESTADO ============================ */
const KEY = 'lumen.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function seed() {
  const t = ymd(new Date());
  const mk = o => ({ id: uid(), done: false, created: Date.now(), updated: Date.now(), demo: true, amount: null, time: null, date: null, repeat: null, ...o });
  return {
    items: [
      mk({ title: 'Pagar la luz', type: 'pay', cat: 'pagos', date: addDays(t, 2), amount: 45, repeat: 'monthly' }),
      mk({ title: 'Renta', type: 'pay', cat: 'pagos', date: addDays(t, 5), amount: 400, repeat: 'monthly' }),
      mk({ title: 'Netflix', type: 'pay', cat: 'pagos', date: addDays(t, -1), amount: 12.99, repeat: 'monthly' }),
      mk({ title: 'Cita con el dentista', type: 'appt', cat: 'citas', date: addDays(t, 1), time: '15:30' }),
      mk({ title: 'Enviar informe semanal', type: 'task', cat: 'trabajo', date: t }),
      mk({ title: 'Llamar a mamá', type: 'task', cat: 'personal', date: t, time: '19:00' })
    ],
    habits: [
      { id: uid(), name: 'Tomar agua', emoji: '💧', log: {}, updated: Date.now(), demo: true },
      { id: uid(), name: 'Leer 10 minutos', emoji: '📖', log: {}, updated: Date.now(), demo: true },
      { id: uid(), name: 'Moverme', emoji: '🏃', log: {}, updated: Date.now(), demo: true }
    ],
    notes: [
      { id: uid(), text: 'Bienvenido a Lumen ✦ Toca + y escribe como hablas: «pagar internet 30 el 15 cada mes» o «cita médico viernes 4pm». Lo entiende solo.', pin: true, created: Date.now(), updated: Date.now(), demo: true }
    ],
    cfg: { cur: '$' }, sess: null, theme: 'papel'
  };
}
let S = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.items) return s; } catch (e) {} return seed(); })();
const COLS = ['items', 'habits', 'notes', 'moves', 'goals', 'people', 'checks', 'focus', 'lists'];
S.cfg = S.cfg || {}; COLS.forEach(k => { S[k] = S[k] || []; });
// Nube por defecto: la URL y la anon key son públicas por diseño (la seguridad la da RLS). Así, al reinstalar solo falta tu correo y contraseña.
const APP_VER = 'v6';
const CLOUD = { url: 'https://uramhnknnwrdnvzugbyy.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyYW1obmtubndyZG52enVnYnl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMTI2NjIsImV4cCI6MjExMDY4ODY2Mn0.mWFX49XtUCCvBK_pRi1a8Huy9nXyAtrhPVVgpmJOCsY' };
if (!S.cfg.url) S.cfg.url = CLOUD.url;
if (!S.cfg.key) S.cfg.key = CLOUD.key;
const colsData = () => Object.fromEntries(COLS.map(k => [k, S[k]]));
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
let pushTimer;
const save = () => { persist(); clearTimeout(pushTimer); pushTimer = setTimeout(sync, 1800); };
const live = a => a.filter(x => !x.deleted);
const touch = o => { o.updated = Date.now(); return o; };
const ui = { tab: 'hoy', month: ymd(new Date()).slice(0, 7), pm: ymd(new Date()).slice(0, 7), sel: null, q: '', anim: true };

const money = n => { const c = S.cfg.cur || '$', v = Number(n); return c + v.toLocaleString('es', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
const byDate = (a, b) => ((a.date || '9') + (a.time || '99:99')).localeCompare((b.date || '9') + (b.time || '99:99'));
const byTime = (a, b) => (a.done - b.done) || (a.time || '99').localeCompare(b.time || '99');
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

function rel(d) {
  if (!d) return 'sin fecha';
  const t = ymd(new Date()), diff = Math.round((fromYmd(d) - fromYmd(t)) / 864e5);
  if (diff === 0) return 'hoy'; if (diff === 1) return 'mañana'; if (diff === -1) return 'ayer';
  const dt = fromYmd(d), lbl = `${DAYS_S[dt.getDay()]} ${dt.getDate()} ${MONTHS_S[dt.getMonth()]}`;
  return diff < 0 ? `hace ${-diff} días, ${lbl}` : lbl;
}
const greet = () => { const h = new Date().getHours(); return h < 6 ? 'Madrugada' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };

/* ============================ ICONOS Y FORMAS ============================ */
const ic = (p, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const I = {
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  cal: ic('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  coin: ic('<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.6 2.2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2A2.7 2.2 0 0 1 9.5 15M12 5.8v1.7M12 16.5v1.7"/>'),
  mind: ic('<path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3z"/><path d="M9.5 20.5h5"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>', 26),
  check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
  gear: ic('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  left: ic('<path d="M15 6l-6 6 6 6"/>', 20),
  right: ic('<path d="M9 6l6 6-6 6"/>', 20),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>', 16),
  pin: ic('<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>', 18),
  loop: ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 14)
};
const SHAPES = {
  pagos: '<circle cx="12" cy="12" r="8.5"/>',
  citas: '<path d="M12 3.5 21 20H3z"/>',
  personal: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
  trabajo: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/>',
  ideas: '<path d="M12 2l2.6 6.4L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.6z"/>'
};
const shape = (cat, s = 18) => `<svg class="shp" width="${s}" height="${s}" viewBox="0 0 24 24" style="--c:${(CATS[cat] || CATS.personal).c}" aria-hidden="true">${SHAPES[cat] || SHAPES.personal}</svg>`;

/* ============================ ACCIONES SOBRE DATOS ============================ */
function nextFuture(d, rep) { const t = ymd(new Date()); let n = nextDate(d, rep); let k = 0; while (n < t && k++ < 400) n = nextDate(n, rep); return n; }

function toggleItem(id, el) {
  const it = S.items.find(x => x.id === id); if (!it) return;
  let gen = null, celebrate = false;
  if (!it.done) {
    it.done = true; it.doneAt = Date.now(); touch(it); celebrate = true;
    if (it.repeat && it.date) {
      gen = { ...it, id: uid(), date: nextFuture(it.date, it.repeat), done: false, doneAt: null, demo: false, created: Date.now(), updated: Date.now() };
      if (gen.subs) gen.subs = gen.subs.map(x => ({ ...x, d: false }));
      S.items.push(gen);
    }
  } else { it.done = false; it.doneAt = null; touch(it); }
  save(); render();
  if (celebrate) {
    try { if (el) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); } if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    toast('Hecho', () => { it.done = false; it.doneAt = null; touch(it); if (gen) { gen.deleted = true; touch(gen); } save(); render(); });
  }
}
function toggleHabit(id, d) {
  const h = S.habits.find(x => x.id === id); if (!h) return;
  if (h.log[d]) delete h.log[d]; else h.log[d] = 1;
  touch(h); save(); render();
  if (navigator.vibrate) navigator.vibrate(8);
}
const streak = h => { let d = ymd(new Date()); if (!h.log[d]) d = addDays(d, -1); let n = 0; while (h.log[d]) { n++; d = addDays(d, -1); } return n; };

function todaySet() {
  const t = ymd(new Date()), L = live(S.items);
  const today = L.filter(i => i.date === t);
  const over = L.filter(i => !i.done && i.date && i.date < t).sort(byDate);
  return { today, over, done: today.filter(i => i.done).length, total: today.length };
}
function suggestRepeat() {
  const L = live(S.items), g = {};
  L.filter(i => i.done && !i.repeat && i.date).forEach(i => { const k = strip(i.title).toLowerCase(); (g[k] = g[k] || []).push(i); });
  for (const k in g) {
    if (g[k].length >= 2 && !L.some(i => !i.done && strip(i.title).toLowerCase() === k)) {
      return g[k].sort((a, b) => b.date.localeCompare(a.date))[0];
    }
  }
  return null;
}

/* ============================ VISTAS ============================ */
const sec = (t, n, cls = '') => `<h2 class="sec ${cls}">${t}${n != null ? `<span class="cnt">${n}</span>` : ''}</h2>`;
const empty = t => `<p class="empty">${t}</p>`;

function row(i) {
  const c = CATS[i.cat] || CATS.personal, t = ymd(new Date());
  const late = !i.done && i.date && i.date < t;
  return `<div class="row ${i.done ? 'done' : ''} ${late ? 'late' : ''}" style="--c:${c.c}">
    <button class="tick" data-act="toggle" data-id="${i.id}" aria-label="${i.done ? 'Marcar pendiente' : 'Completar'}">${I.check}</button>
    <div class="rmain" data-act="edit" data-id="${i.id}" tabindex="0">
      <b>${esc(i.title)}</b>
      <small class="meta"><span class="mc">${shape(i.cat, 14)}${c.n}</span>${i.date ? `<span class="md">${rel(i.date)}</span>` : ''}${i.time ? `<span class="pill">${i.time}</span>` : ''}${i.repeat ? `<span class="mr">${I.loop}${REP[i.repeat]}</span>` : ''}${i.subs && i.subs.length ? `<span class="pill">✓ ${i.subs.filter(x => x.d).length}/${i.subs.length}</span>` : ''}</small>
    </div>
    ${i.amount != null ? `<span class="amt">${money(i.amount)}</span>` : ''}
    <button class="star ${i.star ? 'on' : ''}" data-act="star" data-id="${i.id}" aria-label="${i.star ? 'Quitar de lo importante' : 'Marcar como importante'}" aria-pressed="${!!i.star}">${I.star}</button>
  </div>`;
}
function grouped(list) {
  let last = '', h = '';
  list.forEach(i => {
    if (i.date !== last) { last = i.date; h += `<p class="dl">${esc(rel(i.date))}</p>`; }
    h += row(i);
  });
  return h;
}

function vAgenda() {
  const t = ymd(new Date());
  const [y, m] = ui.month.split('-').map(Number);
  const off = (new Date(y, m - 1, 1).getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
  const L = live(S.items).filter(i => i.date);
  const by = {}; L.forEach(i => { if (i.date.startsWith(ui.month)) (by[i.date] = by[i.date] || []).push(i); });
  let cells = ''; for (let k = 0; k < off; k++) cells += '<span></span>';
  for (let d = 1; d <= dim; d++) {
    const ds = `${ui.month}-${pad(d)}`, its = by[ds] || [];
    const dots = its.slice(0, 3).map(i => `<i style="background:${CATS[i.cat].c}"></i>`).join('');
    cells += `<button class="day ${ds === t ? 'today' : ''} ${ds === ui.sel ? 'sel' : ''}" data-act="day" data-d="${ds}" aria-label="${d} de ${MONTHS[m - 1]}, ${its.length} pendientes"><b>${d}</b><span class="dots">${dots}</span></button>`;
  }
  let list;
  if (ui.sel) {
    const its = L.filter(i => i.date === ui.sel).sort(byTime);
    list = sec(rel(ui.sel), its.length) + (its.length ? its.map(row).join('') : empty('Día libre. Toca el + para agendar algo.'));
  } else {
    const up = L.filter(i => !i.done && i.date >= t && i.date <= addDays(t, 30)).sort(byDate);
    list = sec('Próximos 30 días', up.length) + (up.length ? grouped(up) : empty('Nada a la vista. Respira.'));
  }
  return `<h1 class="vt" data-t="Agenda">Agenda</h1>
  <div class="mnav"><button data-act="cal" data-n="-1" aria-label="Mes anterior">${I.left}</button><h2>${monthLabel(ui.month)}</h2><button data-act="cal" data-n="1" aria-label="Mes siguiente">${I.right}</button></div>
  <div class="cal"><div class="dow">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div><div class="grid">${cells}</div></div>
  ${list}`;
}

function notesHtml() {
  const q = strip(ui.q).toLowerCase();
  const N = live(S.notes).filter(n => !q || strip(n.text).toLowerCase().includes(q)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.updated - a.updated);
  if (!N.length) return empty(q ? 'Ninguna nota coincide.' : 'Tu mente está despejada. Suelta aquí lo que se te ocurra.');
  return N.map(n => `<article class="note ${n.pin ? 'pinned' : ''}"><p>${esc(n.text).replace(/(#[\wáéíóúñ]+)/gi, '<mark>$1</mark>')}${n.remind && n.remind.date ? `<small class="rml">🔔 ${esc(remLabel(n.remind))}</small>` : ''}</p><div class="na">${bell('notes', n)}<button data-act="npin" data-id="${n.id}" aria-label="Fijar">${I.pin}</button><button data-act="ndel" data-id="${n.id}" aria-label="Borrar nota">${I.x}</button></div></article>`).join('');
}
function render() {
  const v = { hoy: vHoy, agenda: vAgenda, dinero: vDinero, mente: vMente }[ui.tab];
  const el = $('#view');
  el.className = ui.anim ? 'fresh' : '';
  el.innerHTML = v();
  ui.anim = false;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  document.documentElement.dataset.theme = S.theme === 'noche' ? 'noche' : 'papel';
  const mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.content = S.theme === 'noche' ? '#100E2E' : '#F0ECF7';
  const dot = $('#syncDot'); if (dot) dot.className = 'sdot ' + (syncState());
}

/* ============================ HOJA (crear / editar) ============================ */
let edit = null, touched = {}, f = { type: 'task', cat: 'personal', star: false }, fSubs = [];
const PH = ['pagar internet 30 el 15 cada mes', 'cita dentista viernes 4pm', 'entregar informe al cliente mañana importante', 'cumple de Sofi el 3 de marzo', 'idea: app para mi mamá', 'llamar al banco hoy 10am'];

let lockY = 0;
function openSheet(html, after) {
  $('#sheetBody').innerHTML = html;
  if (!document.body.classList.contains('lock')) { lockY = window.scrollY; document.body.style.top = -lockY + 'px'; }
  $('#sheet').classList.add('open'); $('#scrim').classList.add('open'); $('#sheet').setAttribute('aria-hidden', 'false');
  document.body.classList.add('lock');
  if (after) after();
}
function closeSheet() {
  $('#sheet').classList.remove('open'); $('#scrim').classList.remove('open'); $('#sheet').setAttribute('aria-hidden', 'true');
  const was = document.body.classList.contains('lock');
  document.body.classList.remove('lock'); document.body.style.top = '';
  if (was) window.scrollTo(0, lockY);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
const hist = () => { const seen = new Set(), out = []; [...live(S.items)].reverse().forEach(i => { const k = i.title.toLowerCase(); if (!seen.has(k) && out.length < 50) { seen.add(k); out.push(i.title); } }); return out; };

function renderSubs() {
  const box = $('#fSubsBox'); if (!box) return;
  box.innerHTML = `<p class="sh-h" style="font-size:18px;margin:16px 0 6px">Pasos</p>` +
    fSubs.map((s, k) => `<div class="sub"><button type="button" class="sk ${s.d ? 'on' : ''}" data-sub="t" data-k="${k}" aria-label="Marcar paso">${I.check}</button><span class="${s.d ? 'sd' : ''}">${esc(s.t)}</span><button type="button" class="x" data-sub="x" data-k="${k}" aria-label="Quitar paso">${I.x}</button></div>`).join('') +
    `<div class="subadd"><input id="fSubIn" class="in" placeholder="Agregar un paso" maxlength="80" autocomplete="off"><button type="button" class="btn" data-sub="a">Añadir</button></div>`;
}
function addSub() {
  const i = $('#fSubIn'); if (!i) return;
  const t = i.value.trim(); if (!t) return;
  fSubs.push({ t, d: false }); renderSubs(); $('#fSubIn').focus();
}

function itemSheet(it, preset) {
  edit = it || null; touched = {};
  f = { type: it ? it.type : (preset?.type || 'task'), cat: it ? it.cat : (preset?.cat || 'personal'), star: it ? !!it.star : !!(preset && preset.star) };
  fSubs = it && it.subs ? it.subs.map(s => ({ ...s })) : [];
  const v = it || preset || {};
  const types = [['task', 'Tarea'], ['pay', 'Pago'], ['appt', 'Cita']];
  openSheet(`
    <h3 class="sh-t">${it ? 'Editar' : 'Nuevo'}</h3>
    <input id="fTitle" class="in big" autocomplete="off" enterkeyhint="done" list="hist" placeholder="${esc(PH[Math.floor(Math.random() * PH.length)])}" value="${esc(v.title || '')}">
    <datalist id="hist">${hist().map(h => `<option value="${esc(h)}">`).join('')}</datalist>
    <p id="fHint" class="hint">Escribe como hablas: fecha, hora, monto y repetición se llenan solos.</p>
    <div class="seg" id="fType" role="group" aria-label="Tipo">${types.map(([k, l]) => `<button type="button" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="fFields">
      <div class="g2"><label>Fecha<input id="fDate" type="date" class="in" value="${v.date || ''}"></label><label>Hora<input id="fTime" type="time" class="in" value="${v.time || ''}"></label></div>
      <div class="g2"><label>Monto<input id="fAmount" inputmode="decimal" class="in" placeholder="opcional" value="${v.amount ?? ''}"></label>
        <label>Repetir<select id="fRepeat" class="in"><option value="">No</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option><option value="yearly">Cada año</option></select></label></div>
      <div class="cats" id="fCats" role="group" aria-label="Categoría">${Object.entries(CATS).map(([k, c]) => `<button type="button" data-c="${k}">${shape(k, 16)}${c.n}</button>`).join('')}</div>
      <button type="button" id="fStar" class="starbtn" aria-pressed="false">${I.star}<span>Importante, ponla en tu foco</span></button>
      <div id="fSubsBox"></div>
    </div>
    <div class="acts">${it ? '<button class="btn" data-act="idel">Borrar</button>' : ''}<button class="btn pri" data-act="isave">Guardar</button></div>`,
    () => {
      $('#fRepeat').value = v.repeat || '';
      syncSeg(); renderSubs();
      const ti = $('#fTitle');
      if (!it) ti.addEventListener('input', applyParse);
      ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveItem(); } });
      $('#fType').onclick = e => { const b = e.target.closest('button'); if (!b) return; f.type = b.dataset.t; touched.type = 1; syncSeg(); };
      $('#fCats').onclick = e => { const b = e.target.closest('button'); if (!b) return; f.cat = b.dataset.c; touched.cat = 1; syncSeg(); };
      $('#fStar').onclick = () => { f.star = !f.star; touched.star = 1; syncSeg(); };
      ['fDate', 'fTime', 'fAmount', 'fRepeat'].forEach(id => $('#' + id).addEventListener('input', () => touched[id] = 1));
      const box = $('#fSubsBox');
      box.onclick = e => {
        const b = e.target.closest('[data-sub]'); if (!b) return;
        const a = b.dataset.sub, k = +b.dataset.k;
        if (a === 't') fSubs[k].d = !fSubs[k].d; else if (a === 'x') fSubs.splice(k, 1); else if (a === 'a') { addSub(); return; }
        renderSubs();
      };
      box.onkeydown = e => { if (e.target.id === 'fSubIn' && e.key === 'Enter') { e.preventDefault(); addSub(); } };
      setTimeout(() => ti.focus(), 260);
    });
}
function syncSeg() {
  document.querySelectorAll('#fType button').forEach(b => b.classList.toggle('on', b.dataset.t === f.type));
  document.querySelectorAll('#fCats button').forEach(b => b.classList.toggle('on', b.dataset.c === f.cat));
  const st = $('#fStar'); if (st) { st.classList.toggle('on', !!f.star); st.setAttribute('aria-pressed', !!f.star); }
  $('#fFields').hidden = f.type === 'note';
}
function applyParse() {
  const raw = $('#fTitle').value, p = parseQuick(raw);
  const set = (id, val) => { if (!touched[id]) $('#' + id).value = val ?? ''; };
  set('fDate', p.date); set('fTime', p.time); set('fAmount', p.amount); set('fRepeat', p.repeat || '');
  const key = strip(p.title).toLowerCase();
  const pr = key.length > 2 ? [...live(S.items)].reverse().find(i => strip(i.title).toLowerCase() === key) : null;
  if (!touched.type) { f.type = p.type; if (pr && p.type === 'task') f.type = pr.type; }
  if (!touched.cat) { f.cat = p.cat; if (pr && p.cat === 'personal') f.cat = pr.cat; }
  if (!touched.star) f.star = p.star;
  if (pr && p.amount == null && !touched.fAmount && pr.amount != null) $('#fAmount').value = pr.amount;
  if (pr && !p.repeat && !touched.fRepeat && pr.repeat) $('#fRepeat').value = pr.repeat;
  syncSeg();
  $('#fHint').textContent = p.title ? `Se guardará como «${p.title}»${pr ? ' (ya lo conozco, usé tus datos anteriores)' : ''}.` : 'Escribe como hablas: fecha, hora, monto y repetición se llenan solos.';
}
function saveItem() {
  const raw = $('#fTitle').value.trim();
  if (!raw) { shake($('#fTitle')); $('#fTitle').focus(); return; }
  if (f.type === 'note') { S.notes.push({ id: uid(), text: raw, pin: false, created: Date.now(), updated: Date.now() }); save(); closeSheet(); ui.tab = 'mente'; render(); toast('Nota guardada'); return; }
  const title = edit ? raw : (parseQuick(raw).title || raw);
  const data = { title, type: f.type, cat: f.cat, star: !!f.star, subs: fSubs.filter(s => s.t), date: $('#fDate').value || null, time: $('#fTime').value || null, amount: $('#fAmount').value ? num($('#fAmount').value) : null, repeat: $('#fRepeat').value || null };
  if (data.time && !data.date) data.date = ymd(new Date());
  if (edit) Object.assign(edit, data, { demo: false }), touch(edit);
  else S.items.push({ id: uid(), done: false, created: Date.now(), updated: Date.now(), ...data });
  save(); closeSheet(); render(); toast(edit ? 'Cambios guardados' : 'Guardado');
}

/* ============================ AJUSTES ============================ */
function settingsSheet() {
  const c = S.cfg, ss = S.sess;
  openSheet(`
    <h3 class="sh-t">Ajustes</h3>
    <div class="set"><label>Tu nombre<input id="sName" class="in" value="${esc(c.name || '')}" placeholder="opcional"></label>
    <label>Símbolo de moneda<input id="sCur" class="in" maxlength="4" value="${esc(c.cur || '$')}"></label></div>
    <label style="margin-bottom:14px">Presupuesto mensual para gastos (opcional)<input id="sBudget" inputmode="decimal" class="in" placeholder="0" value="${c.budget || ''}"></label>
    <div class="seg" id="sTheme"><button type="button" data-th="papel" class="${S.theme !== 'noche' ? 'on' : ''}">Papel</button><button type="button" data-th="noche" class="${S.theme === 'noche' ? 'on' : ''}">Noche</button></div>
    <h4 class="sh-h">Nube (Supabase)</h4>
    <p class="hint">${ss ? `Conectado como <b>${esc(ss.email)}</b>. Se sincroniza solo.` : 'Entra con tu correo y contraseña para tener tus datos en todos tus aparatos y no perderlos si reinstalas.'}</p>
    <details class="adv"><summary>Avanzado: otro proyecto de Supabase</summary>
    <label>URL del proyecto<input id="cUrl" class="in" inputmode="url" autocapitalize="off" placeholder="https://xxxx.supabase.co" value="${esc(c.url || '')}"></label>
    <label>Anon key<input id="cKey" class="in" autocapitalize="off" placeholder="eyJ..." value="${esc(c.key || '')}"></label></details>
    ${ss ? '' : `<div class="g2"><label>Correo<input id="cMail" type="email" class="in" autocapitalize="off"></label><label>Contraseña<input id="cPass" type="password" class="in"></label></div>`}
    <div class="acts wrap">${ss ? '<button class="btn" data-act="cl-sync">Sincronizar ahora</button><button class="btn" data-act="cl-out">Salir</button>' : '<button class="btn pri" data-act="cl-in">Entrar</button><button class="btn" data-act="cl-up">Crear cuenta</button>'}</div>
    <h4 class="sh-h">Avisos y datos</h4>
    <p class="hint">${pushErr ? 'Problema con los avisos: ' + esc(pushErr) : c.push ? 'Avisos activos en este celular. Llegan aunque la app esté cerrada.' : 'Activa los avisos para que Lumen te escriba a la hora exacta.'}</p>
    <div class="acts wrap"><button class="btn pri" data-act="notif">${c.push ? 'Reactivar avisos' : 'Activar avisos'}</button>${c.push ? '<button class="btn" data-act="ptest">Probar aviso</button><button class="btn" data-act="poff">Apagar</button>' : ''}<button class="btn" data-act="ics">Exportar al calendario</button><button class="btn" data-act="exp">Respaldo</button><button class="btn" data-act="imp">Importar</button><button class="btn" data-act="demo">Borrar ejemplos</button></div>
    <p class="hint" style="margin-top:14px">Lumen ${APP_VER} · <button class="btn" data-act="upd" style="padding:6px 12px">Buscar actualización</button></p>
    <input type="file" id="impFile" accept="application/json" hidden>
    <div class="acts"><button class="btn pri" data-act="ssave">Listo</button></div>`,
    () => {
      $('#sTheme').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.theme = b.dataset.th; document.querySelectorAll('#sTheme button').forEach(x => x.classList.toggle('on', x === b)); persist(); render(); };
      $('#impFile').onchange = ev => { const file = ev.target.files[0]; if (!file) return; file.text().then(t => { try { const d = JSON.parse(t); COLS.forEach(k => { S[k] = mergeCol(S[k], d[k] || []); }); save(); render(); toast('Respaldo importado'); } catch (e) { toast('Ese archivo no es un respaldo válido'); } }); };
    });
}
function readCfg() {
  const g = id => { const e = $('#' + id); return e ? e.value.trim() : undefined; };
  const nm = g('sName'), cur = g('sCur'), url = g('cUrl'), key = g('cKey'), bu = g('sBudget');
  if (nm !== undefined) S.cfg.name = nm;
  if (bu !== undefined) S.cfg.budget = bu ? (num(bu) || 0) : 0;
  if (cur !== undefined) S.cfg.cur = cur || '$';
  if (url !== undefined) S.cfg.url = url.replace(/\/+$/, '');
  if (key !== undefined) S.cfg.key = key;
}

/* ============================ NUBE (Supabase por REST) ============================ */
let syncing = false, lastErr = '', pushErr = '';
const syncState = () => syncing ? 'busy' : (S.cfg.url && S.sess ? (lastErr ? 'err' : 'ok') : 'off');
async function sb(path, { method = 'GET', body, token, headers = {} } = {}) {
  const { url, key } = S.cfg;
  if (!url || !key) throw new Error('Falta la URL o la anon key');
  const r = await fetch(url + path, { method, headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
  if (!r.ok) throw new Error((j && (j.msg || j.message || j.error_description || j.error)) || ('Error ' + r.status));
  return j;
}
const setSess = j => { S.sess = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + ((j.expires_in || 3600) - 60) * 1000, uid: j.user.id, email: j.user.email }; };
async function token() {
  if (!S.sess) throw new Error('Sin sesión');
  if (Date.now() > S.sess.exp) { const j = await sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: S.sess.refresh } }); setSess(j); persist(); }
  return S.sess.access;
}
async function login(signup) {
  readCfg();
  const email = ($('#cMail') || {}).value, password = ($('#cPass') || {}).value;
  if (!email || !password) return toast('Escribe tu correo y contraseña');
  try {
    const j = signup ? await sb('/auth/v1/signup', { method: 'POST', body: { email, password } }) : await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    if (!j.access_token) { persist(); return toast('Revisa tu correo para confirmar la cuenta y luego entra'); }
    setSess(j); lastErr = ''; persist(); toast('Conectado'); settingsSheet(); sync();
  } catch (e) { toast(e.message); }
}
function mergeCol(a, b) {
  const m = new Map();
  [...a, ...b].forEach(x => { const y = m.get(x.id); if (!y || (x.updated || 0) > (y.updated || 0)) m.set(x.id, x); });
  return [...m.values()];
}
const purge = a => a.filter(x => !(x.deleted && Date.now() - (x.updated || 0) > 60 * 864e5));
async function sync(manual) {
  if (!S.cfg.url || !S.sess || syncing) return;
  syncing = true; render();
  try {
    const t = await token();
    const rows = await sb(`/rest/v1/life_data?select=data&user_id=eq.${S.sess.uid}`, { token: t });
    let remote = {};
    if (rows && rows[0] && rows[0].data) {
      remote = rows[0].data;
      // Si la nube ya tiene tus cosas, los ejemplos de esta instalación nueva sobran
      if (COLS.some(k => (remote[k] || []).some(x => !x.demo && !x.deleted))) COLS.forEach(k => { const rid = new Set((remote[k] || []).map(x => x.id)); S[k] = S[k].filter(x => !x.demo || rid.has(x.id)); });
      COLS.forEach(k => { S[k] = mergeCol(S[k], remote[k] || []); });
    }
    COLS.forEach(k => { S[k] = purge(S[k]); });
    await sb('/rest/v1/life_data', { method: 'POST', token: t, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: S.sess.uid, data: { ...remote, ...colsData() }, updated_at: new Date().toISOString() } });
    lastErr = '';
    if (S.cfg.push) { try { await syncReminders(t); pushErr = ''; } catch (e) { pushErr = e.message; } }
    if (manual) toast(pushErr ? 'Sincronizado, pero los avisos fallaron: ' + pushErr : 'Sincronizado');
  } catch (e) { lastErr = e.message; if (manual) toast('No pude sincronizar: ' + e.message); }
  finally { syncing = false; persist(); render(); }
}

/* ============================ EXTRAS ============================ */
function burst(x, y) {
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return; } catch (e) { return; }
  const cols = ['#FF4FA3', '#FFD426', '#3A3AF2', '#19B79F', '#FF7A2F'];
  for (let k = 0; k < 14; k++) {
    const s = document.createElement('i'); s.className = 'bst';
    s.style.cssText = `left:${x}px;top:${y}px;background:${cols[k % 5]};border-radius:${k % 3 === 0 ? '50%' : k % 3 === 1 ? '2px' : '0'}`;
    document.body.appendChild(s);
    const a = Math.PI * 2 * k / 14 + Math.random() * .4, r = 40 + Math.random() * 50;
    s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px),calc(-50% + ${Math.sin(a) * r + 24}px)) rotate(${Math.random() * 360}deg) scale(.4)`, opacity: 0 }], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
  }
}
function download(name, type, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function exportICS() {
  const ev = live(S.items).filter(i => !i.done && i.date);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lumen//ES'];
  ev.forEach(i => {
    const d = i.date.replace(/-/g, '');
    L.push('BEGIN:VEVENT', 'UID:' + i.id + '@lumen', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', i.time ? `DTSTART:${d}T${i.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${d}`, 'SUMMARY:' + i.title.replace(/[,;\n]/g, ' ') + (i.amount != null ? ' (' + money(i.amount) + ')' : ''));
    if (i.repeat) L.push('RRULE:FREQ=' + { weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[i.repeat]);
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  download('lumen.ics', 'text/calendar', L.join('\r\n'));
}
async function notifyDue(force) {
  if (S.cfg.push || !('Notification' in window) || Notification.permission !== 'granted') return;
  const t = ymd(new Date());
  if (!force && localStorage.getItem('lumen.notified') === t) return;
  const due = live(S.items).filter(i => !i.done && i.date && i.date <= t);
  if (!due.length) return;
  localStorage.setItem('lumen.notified', t);
  const body = due.slice(0, 4).map(i => i.title).join(', ') + (due.length > 4 ? ` y ${due.length - 4} más` : '');
  const title = `Hoy tienes ${due.length} ${due.length === 1 ? 'cosa' : 'cosas'}`;
  try { const reg = await navigator.serviceWorker.ready; reg.showNotification(title, { body, icon: 'icon-192.png', tag: 'lumen-hoy' }); } catch (e) { new Notification(title, { body }); }
}

/* ============================ NUEVO · más herramientas ============================ */
I.star = ic('<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z"/>', 20);
const FACES = ['😞', '😕', '😐', '🙂', '😄'];
const ENERGY = ['Energía baja', 'Energía media', 'Energía alta'];
const GCATS = {
  comida: { n: 'Comida', e: '🍽️' }, transporte: { n: 'Transporte', e: '🚌' }, hogar: { n: 'Hogar', e: '🏠' },
  salud: { n: 'Salud', e: '💊' }, ocio: { n: 'Ocio', e: '🎬' }, otros: { n: 'Otros', e: '✦' }
};
const fmtN = n => Number(n).toLocaleString('es', { maximumFractionDigits: 2 });
const daysSince = d => Math.round((fromYmd(ymd(new Date())) - fromYmd(d)) / 864e5);
const sumBy = (a, k = 'amount') => a.reduce((s, x) => s + (+x[k] || 0), 0);
const shake = el => { if (!el) return; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); };

/* ---------- deshacer ---------- */
function toast(t, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(t)}</span>` + (undo ? '<button class="tundo" data-act="undo">Deshacer</button>' : '');
  toast.undo = undo || null;
  el.classList.add('on'); clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.classList.remove('on'); toast.undo = null; }, undo ? 6000 : 2400);
}
function softDel(col, id, msg, after) {
  const o = S[col].find(x => x.id === id); if (!o) return;
  const re = after || render;
  o.deleted = true; touch(o); save(); re();
  toast(msg || 'Borrado', () => { o.deleted = false; touch(o); save(); re(); });
}
async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker.ready; reg.showNotification(title, { body, icon: 'icon-192.png', tag: 'lumen-' + title }); }
  catch (e) { try { new Notification(title, { body }); } catch (e2) {} }
}

/* ---------- check-in de ánimo ---------- */
const checkToday = () => { const t = ymd(new Date()); return live(S.checks).find(c => c.date === t) || null; };
let CK = { m: 3, e: 2 };
function checkSheet(mood) {
  const c = checkToday();
  CK = { m: mood || (c && c.mood) || 3, e: (c && c.energy) || 2 };
  openSheet(`<h3 class="sh-t">¿Cómo vas hoy?</h3>
    <div class="faces big" id="ckF">${FACES.map((f, k) => `<button type="button" data-m="${k + 1}" aria-label="Ánimo ${k + 1} de 5">${f}</button>`).join('')}</div>
    <div class="seg" id="ckE">${ENERGY.map((l, k) => `<button type="button" data-e="${k + 1}">${l}</button>`).join('')}</div>
    <label>Algo bueno de hoy (opcional)<input id="ckN" class="in" maxlength="140" placeholder="Aunque sea pequeño" value="${esc((c && c.note) || '')}"></label>
    <div class="acts"><button class="btn pri" data-act="ck-save">Guardar</button></div>`, () => {
    const draw = () => {
      document.querySelectorAll('#ckF button').forEach(b => b.classList.toggle('on', +b.dataset.m === CK.m));
      document.querySelectorAll('#ckE button').forEach(b => b.classList.toggle('on', +b.dataset.e === CK.e));
    };
    $('#ckF').onclick = ev => { const b = ev.target.closest('button'); if (b) { CK.m = +b.dataset.m; draw(); } };
    $('#ckE').onclick = ev => { const b = ev.target.closest('button'); if (b) { CK.e = +b.dataset.e; draw(); } };
    draw();
  });
}
function moodInsight() {
  const cs = live(S.checks).filter(c => c.mood), H = live(S.habits);
  if (cs.length < 6 || !H.length) return null;
  const share = c => H.filter(h => h.log[c.date]).length / H.length;
  const hi = cs.filter(c => share(c) >= .5), lo = cs.filter(c => share(c) < .5);
  if (hi.length < 3 || lo.length < 3) return null;
  const avg = a => a.reduce((s, c) => s + c.mood, 0) / a.length, a = avg(hi), b = avg(lo);
  if (Math.abs(a - b) < .4) return 'Por ahora tu ánimo no cambia mucho según cumplas o no tus rituales. Sigue anotando para ver más claro.';
  return `Los días que cumples la mitad o más de tus rituales, tu ánimo promedia ${a.toFixed(1)}; los demás días, ${b.toFixed(1)}. Es un patrón de tus datos, no una prueba de causa.`;
}
function moodStrip() {
  const t = ymd(new Date()), days = [...Array(14)].map((_, k) => addDays(t, k - 13)), by = {};
  live(S.checks).forEach(c => by[c.date] = c);
  const vals = days.map(d => by[d]).filter(Boolean);
  const avg = vals.length ? vals.reduce((s, c) => s + c.mood, 0) / vals.length : null, ins = moodInsight();
  return `<div class="mood"><div class="ms">${days.map(d => { const c = by[d]; return `<span class="mcell ${c ? 'm' + c.mood : ''}" title="${rel(d)}">${c ? FACES[c.mood - 1] : ''}</span>`; }).join('')}</div>
    <p class="msub">${avg != null ? `Promedio de ${vals.length} ${vals.length === 1 ? 'día' : 'días'}: ${FACES[Math.round(avg) - 1]} ${avg.toFixed(1)} de 5` : 'Haz tu primer check-in desde la pantalla Hoy.'}</p>
    ${ins ? `<p class="insight">${esc(ins)}</p>` : ''}</div>`;
}
function checkCard() {
  const c = checkToday();
  if (c) return `<div class="check done" data-act="chk-edit" tabindex="0"><span class="face">${FACES[c.mood - 1]}</span><div><b>Check-in de hoy</b><small>${ENERGY[c.energy - 1] || ''}${c.note ? `, «${esc(c.note)}»` : ''}</small></div></div>`;
  return `<div class="check"><p>¿Cómo vas hoy?</p><div class="faces">${FACES.map((f, k) => `<button data-act="chk" data-m="${k + 1}" aria-label="Ánimo ${k + 1} de 5">${f}</button>`).join('')}</div></div>`;
}

/* ---------- enfoque (temporizador) ---------- */
const RUNKEY = 'lumen.run';
let RUN = null; try { RUN = JSON.parse(localStorage.getItem(RUNKEY)); } catch (e) {}
const setRun = r => { RUN = r; try { r ? localStorage.setItem(RUNKEY, JSON.stringify(r)) : localStorage.removeItem(RUNKEY); } catch (e) {} };
const fmtT = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
function logFocus(min) {
  const t = ymd(new Date()), id = 'fo' + t; let f = S.focus.find(x => x.id === id);
  if (f) { f.min = (+f.min || 0) + min; f.deleted = false; touch(f); } else S.focus.push({ id, date: t, min, updated: Date.now() });
  save();
}
function focusSheet(presetId) {
  if (RUN) return runSheet();
  const t = ymd(new Date());
  const L = live(S.items).filter(i => !i.done && ((i.date && i.date <= t) || i.star)).sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || byDate(a, b));
  openSheet(`<h3 class="sh-t">Enfoque</h3>
    <p class="hint">Una cosa a la vez. Elige en qué y por cuánto tiempo.</p>
    <label>¿En qué?<select id="fcTask" class="in"><option value="">Lo que sea</option>${L.map(i => `<option value="${i.id}" ${presetId === i.id ? 'selected' : ''}>${i.star ? '★ ' : ''}${esc(i.title)}</option>`).join('')}</select></label>
    <div class="seg" id="fcDur" style="margin-top:14px">${[15, 25, 45, 60].map(m => `<button type="button" data-m="${m}" class="${m === 25 ? 'on' : ''}">${m} min</button>`).join('')}</div>
    <div class="acts"><button class="btn pri" data-act="fc-start">Empezar</button></div>`, () => {
    $('#fcDur').onclick = e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#fcDur button').forEach(x => x.classList.toggle('on', x === b)); };
  });
}
function runSheet() {
  openSheet(`<h3 class="sh-t">${esc(RUN.title || 'Enfoque')}</h3>
    <div class="fdisc"><div class="disc" id="fcDisc" style="--p:0"></div><div class="ftime" id="fcTime">${fmtT(RUN.dur * 60)}</div></div>
    <p class="hint" style="text-align:center">Deja el celular boca abajo. Yo te aviso cuando termine.</p>
    <div class="acts wrap" style="justify-content:center"><button class="btn" data-act="fc-stop">Terminar ahora</button><button class="btn" data-act="close">Seguir en segundo plano</button></div>`, focusTick);
}
function focusTick() {
  const pill = $('#runPill');
  if (!RUN) { if (pill) pill.hidden = true; return; }
  const left = Math.max(0, Math.round((RUN.end - Date.now()) / 1000));
  if (pill) { pill.hidden = false; pill.textContent = '⏱ ' + fmtT(left); }
  const tm = $('#fcTime');
  if (tm) { tm.textContent = fmtT(left); const d = $('#fcDisc'); if (d) d.style.setProperty('--p', Math.min(1, 1 - left / (RUN.dur * 60))); }
  if (left <= 0) focusDone();
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
    <input id="mNote" class="in" style="margin-top:10px" autocomplete="off" placeholder="${out ? 'En qué (almuerzo, taxi, farmacia)' : 'De dónde (sueldo, venta, regalo)'}" value="${esc(v.note)}">
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
  return `<div class="idea">${shape('citas', 22)}<p>${esc(msg)}</p>${off ? '' : `<button class="btn" data-act="settings">${S.sess ? 'Ver' : 'Entrar'}</button>`}</div>`;
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
  const mpSum = sumBy(mp), H = live(S.habits), sg = suggestRepeat(), folks = dueFolks().slice(0, 2);
  return `
  <section class="hero">
    <div class="disc" style="--p:${p}" role="img" aria-label="Progreso de hoy ${Math.round(p * 100)}%"></div>
    <h1 class="bignum" data-t="${d.getDate()}">${d.getDate()}</h1>
    <p class="dateline">${DAYS_FULL[d.getDay()]} de ${MONTHS[d.getMonth()]}</p>
    <p class="say">${greet()}${S.cfg.name ? ', ' + esc(S.cfg.name) : ''}. ${say}</p>
  </section>
  ${cloudBanner()}${pushBanner()}
  ${pinnedHabits()}
  ${fav.length ? sec('Lo importante', fav.length) + fav.map(row).join('') : ''}
  ${overList.length ? sec('Atrasado', overList.length, 'late') + overList.map(row).join('') : ''}
  ${sec('Hoy', todayList.length)}
  ${todayList.length ? todayList.map(row).join('') : (fav.length ? '' : empty('Nada agendado. Toca el + y escribe como hablas.'))}
  ${up.length ? sec('Esta semana', up.length) + grouped(up) : ''}
  ${undated.length ? sec('Sin fecha', undated.length) + (ui.undAll ? undated : undated.slice(0, 5)).map(row).join('') + (undated.length > 5 ? `<button class="btn addbtn" data-act="und">${ui.undAll ? 'Ver menos' : 'Ver las ' + undated.length}</button>` : '') : ''}
  ${mp.length ? `<div class="sticker"><b>${money(mpSum)}</b><span>por pagar este mes en ${mp.length} ${mp.length === 1 ? 'pago' : 'pagos'}</span></div>` : ''}
  ${sg ? `<div class="idea">${shape('ideas', 22)}<p>Has pagado <b>${esc(sg.title)}</b> más de una vez. ¿Lo dejo repetirse solo cada mes?</p><button class="btn" data-act="mkrepeat" data-id="${sg.id}">Sí, repetir</button></div>` : ''}`;
}

function vDinero() {
  const ym = ui.pm, cur = ymd(new Date()).slice(0, 7);
  const L = live(S.items).filter(i => i.type === 'pay' && i.date && i.date.startsWith(ym)).sort(byDate);
  const MV = live(S.moves).filter(m => m.date && m.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated);
  const paid = sumBy(L.filter(i => i.done)), pend = sumBy(L.filter(i => !i.done)), tot = paid + pend;
  const pct = tot ? Math.round(paid / tot * 100) : 0;
  const inc = sumBy(MV.filter(m => m.kind === 'in')), spent = sumBy(MV.filter(m => m.kind === 'out')), libre = inc - spent - tot;
  const budget = +S.cfg.budget || 0;
  const byCat = {}; MV.filter(m => m.kind === 'out').forEach(m => byCat[m.cat] = (byCat[m.cat] || 0) + (+m.amount || 0));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), maxC = cats.length ? cats[0][1] : 1;
  let bud = '';
  if (budget > 0) {
    const bp = Math.min(100, Math.round(spent / budget * 100)), left = budget - spent;
    const dl = ym === cur ? new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate() - new Date().getDate() + 1 : 0;
    bud = `<div class="budget"><p class="mlabel">Presupuesto para gastos</p><div class="bar ${spent > budget ? 'over' : ''}"><i style="width:${bp}%"></i></div><p class="msub">${spent > budget ? `Te pasaste por ${money(spent - budget)}.` : `Te quedan ${money(left)}${dl > 0 ? `, unos ${money(Math.floor(left / dl))} al día` : ''}.`}</p></div>`;
  }
  const eq = i => (+i.amount || 0) * (i.repeat === 'weekly' ? 4.33 : i.repeat === 'yearly' ? 1 / 12 : 1);
  const seen = new Set(), rec = [];
  live(S.items).filter(i => i.type === 'pay' && i.repeat && !i.done).forEach(i => { const k = strip(i.title).toLowerCase(); if (!seen.has(k)) { seen.add(k); rec.push(i); } });
  const fixed = rec.reduce((s, i) => s + eq(i), 0);
  return `<h1 class="vt" data-t="Dinero">Dinero</h1>
  <div class="mnav"><button data-act="pm" data-n="-1" aria-label="Mes anterior">${I.left}</button><h2>${monthLabel(ym)}</h2><button data-act="pm" data-n="1" aria-label="Mes siguiente">${I.right}</button></div>
  <section class="money">
    <p class="mlabel">Por pagar</p>
    <p class="mbig" data-t="${money(pend)}">${money(pend)}</p>
    <div class="bar" role="img" aria-label="${pct}% pagado"><i style="width:${pct}%"></i></div>
    <p class="msub">${money(paid)} pagado de ${money(tot)}</p>
  </section>
  <div class="trio"><div><small>Entró</small><b>${money(inc)}</b></div><div><small>Gastado</small><b>${money(spent)}</b></div><div class="${inc && libre < 0 ? 'neg' : ''}"><small>Te queda</small><b>${inc ? money(libre) : '–'}</b></div></div>
  <p class="msub">${inc ? `Ya descuenta los ${money(tot)} de pagos del mes.` : 'Anota lo que te entra para ver cuánto te queda libre.'}</p>
  <div class="acts wrap" style="margin:12px 0 4px"><button class="btn pri" data-act="m-out">− Gasto</button><button class="btn" data-act="m-in">+ Ingreso</button></div>
  ${bud}
  ${cats.length ? sec('En qué se va', null) + `<div class="cbs">${cats.map(([k, v]) => { const g = GCATS[k] || GCATS.otros; return `<div class="cb"><span>${g.e} ${g.n}</span><div class="bar sm"><i style="width:${Math.max(4, Math.round(v / maxC * 100))}%"></i></div><b>${money(v)}</b></div>`; }).join('')}</div>` : ''}
  ${MV.length ? sec('Movimientos', MV.length) + MV.slice(0, 15).map(mvRow).join('') + (MV.length > 15 ? `<p class="msub">y ${MV.length - 15} más de este mes</p>` : '') : ''}
  ${sec('Pagos del mes', L.length)}
  ${L.length ? L.map(row).join('') : empty('Sin pagos este mes. Escribe «pagar luz 45 el 25» en el +.')}
  ${rec.length ? sec('Fijos que se repiten', rec.length) + `<div class="fixed">${rec.sort((a, b) => eq(b) - eq(a)).map(i => `<div class="fx" data-act="edit" data-id="${i.id}">${shape('pagos', 16)}<span>${esc(i.title)}</span><b>${money(i.amount || 0)}</b></div>`).join('')}<p class="msub">Cuestan alrededor de ${money(Math.round(fixed))} al mes.</p></div>` : ''}`;
}

function vMente() {
  const t = ymd(new Date()), days = [...Array(7)].map((_, k) => addDays(t, k - 6));
  const H = live(S.habits), G = live(S.goals), P = live(S.people).sort((a, b) => (b.last ? daysSince(b.last) / (b.every || 30) : 0) - (a.last ? daysSince(a.last) / (a.every || 30) : 0));
  return `<h1 class="vt" data-t="Mente">Mente</h1>
  <div class="jump">${[['lis', 'Listas'], ['rit', 'Rituales'], ['met', 'Metas'], ['gen', 'Gente'], ['ani', 'Ánimo'], ['not', 'Notas']].map(([k, l]) => `<button data-act="jump" data-to="s-${k}">${l}</button>`).join('')}</div>
  <div id="s-lis" class="anchor"></div>
  ${sec('Listas', live(S.lists).length)}
  ${listsHtml()}
  <div id="s-rit" class="anchor"></div>
  ${sec('Rituales', H.length)}
  ${H.map(h => { const s = streak(h); return `<div class="hab"><div class="he">${esc(h.emoji)}</div><div class="hb"><b>${esc(h.name)}${h.rtime ? ` <small class="rml">🔔 ${esc(h.rtime)}</small>` : ''}</b><div class="hd">${days.map(d => `<button class="hdot ${h.log[d] ? 'on' : ''} ${d === t ? 'now' : ''}" data-act="hday" data-id="${h.id}" data-d="${d}" aria-label="${rel(d)}" aria-pressed="${!!h.log[d]}">${DAYS_S[fromYmd(d).getDay()][0]}</button>`).join('')}</div></div><div class="stk">${s > 0 ? `${s}<small>${s === 1 ? 'día' : 'días'}</small>` : ''}</div><button class="x ${h.pin ? 'bon' : ''}" data-act="hpin" data-id="${h.id}" aria-label="${h.pin ? 'Quitar de Hoy' : 'Fijar en Hoy'}" aria-pressed="${!!h.pin}" style="font-size:17px;line-height:1">📌</button>${bell('habits', h)}<button class="x" data-act="hdel" data-id="${h.id}" aria-label="Borrar ritual">${I.x}</button></div>`; }).join('')}
  <form class="addh" data-form="habit"><input class="in" name="emoji" maxlength="2" value="✨" aria-label="Emoji" style="width:62px;text-align:center"><input class="in" name="name" placeholder="Nuevo ritual, por ejemplo: estirarme" required><button class="btn">Añadir</button></form>
  <div id="s-met" class="anchor"></div>
  ${sec('Metas', G.length)}
  ${G.length ? G.map(goalHtml).join('') : empty('Una meta clara pesa menos que una vaga. Crea la primera.')}
  <button class="btn addbtn" data-act="goal-new">Nueva meta</button>
  <div id="s-gen" class="anchor"></div>
  ${sec('Gente', P.length)}
  ${P.length ? P.map(personHtml).join('') : empty('Anota a quién no quieres perder de vista.')}
  <button class="btn addbtn" data-act="person-new">Agregar persona</button>
  <div id="s-ani" class="anchor"></div>
  ${sec('Ánimo', null)}
  ${moodStrip()}
  <button class="btn addbtn" style="margin-top:12px" data-act="review">Revisión de la semana</button>
  <div id="s-not" class="anchor"></div>
  ${sec('Notas sueltas', null)}
  <form class="addn" data-form="note"><textarea class="in" name="text" rows="2" placeholder="Suelta lo que tengas en la cabeza. Usa #etiquetas si quieres." required></textarea><button class="btn pri">Guardar nota</button></form>
  <input class="in search" data-act="nsearch" placeholder="Buscar en mis notas" value="${esc(ui.q)}" aria-label="Buscar notas">
  <div id="notesList">${notesHtml()}</div>`;
}

/* ============================ LISTAS ============================ */
const LIST_TPL = [
  { n: 'Compras', e: '🛒', i: ['Frutas y verduras', 'Pan', 'Leche', 'Huevos', 'Agua'] },
  { n: 'Viaje', e: '🧳', i: ['Documentos', 'Cargador del celular', 'Ropa', 'Medicinas', 'Artículos de aseo'] },
  { n: 'Mudanza', e: '📦', i: ['Cajas y cinta', 'Cambiar dirección', 'Avisar al banco', 'Luz e internet'] },
  { n: 'Casa', e: '🏠', i: [] },
  { n: 'Por ver o leer', e: '🎬', i: [] },
  { n: 'Regalos', e: '🎁', i: [] }
];
function listsHtml() {
  const L = live(S.lists);
  return (L.length ? L.map(l => { const n = l.items.length, d = l.items.filter(x => x.d).length; return `<button class="lcard" data-act="lopen" data-id="${l.id}"><div class="he">${esc(l.e)}</div><div style="flex:1"><b>${esc(l.n)}</b><small>${n ? `${d} de ${n} listas` : 'Vacía'}</small>${n ? `<div class="lbar"><i style="width:${Math.round(d / n * 100)}%"></i></div>` : ''}</div></button>`; }).join('') : empty('Compras, viaje, mudanza… cualquier lista con casillas.')) + '<button class="btn addbtn" data-act="lnew">Nueva lista</button>';
}
function listNewSheet() {
  openSheet(`<h3 class="sh-t">Nueva lista</h3>
    <p class="hint">Empieza con una plantilla o crea la tuya.</p>
    <div class="tpls">${LIST_TPL.map((t, i) => `<button data-act="ltpl" data-i="${i}"><span>${t.e}</span>${esc(t.n)}</button>`).join('')}</div>
    <form class="addh" data-form="lnew" style="margin:0"><input class="in" name="e" maxlength="2" value="📝" aria-label="Emoji" style="width:62px;text-align:center"><input class="in" name="n" placeholder="Nombre de tu lista" required><button class="btn pri">Crear</button></form>`);
}
function listSheet(id, keep) {
  const l = S.lists.find(x => x.id === id && !x.deleted); if (!l) { closeSheet(); return; }
  ui.list = id;
  const open = l.items.filter(x => !x.d), done = l.items.filter(x => x.d), top = keep ? $('#sheet').scrollTop : 0;
  const li = x => `<div class="li ${x.d ? 'd' : ''}"><button class="lk" data-act="ltog" data-id="${x.id}" aria-label="${x.d ? 'Desmarcar' : 'Marcar'}">${x.d ? '✓' : ''}</button><button class="lt" data-act="ltog" data-id="${x.id}">${esc(x.t)}</button><button class="lx" data-act="lrm" data-id="${x.id}" aria-label="Quitar">×</button></div>`;
  openSheet(`<h3 class="sh-t">${esc(l.e)} ${esc(l.n)}</h3>
    <form class="addh" data-form="litem" style="margin:0 0 6px"><input id="liIn" class="in" name="t" autocomplete="off" enterkeyhint="done" placeholder="Agregar a la lista"><button class="btn pri">Agregar</button></form>
    ${open.length || done.length ? open.map(li).join('') + done.map(li).join('') : empty('Vacía. Agrega lo primero arriba.')}
    <div class="acts" style="flex-wrap:wrap">${done.length ? '<button class="btn" data-act="lclear">Quitar tachadas</button><button class="btn" data-act="luncheck">Desmarcar todo</button>' : ''}<button class="btn" data-act="remind" data-col="lists" data-id="${l.id}">🔔 ${l.remind && l.remind.date ? esc(remLabel(l.remind)) : 'Recordarme'}</button><button class="btn" data-act="lshare">Compartir</button><button class="btn" data-act="ldel">Borrar lista</button></div>`);
  if (keep) $('#sheet').scrollTop = top;
}

/* ============================ RECORDARME (Mente) ============================ */
let RM = { col: '', id: '' };
const remLabel = r => {
  if (!r || !r.date) return '';
  const t = ymd(new Date()), tm = addDays(t, 1), d = r.date === t ? 'hoy' : r.date === tm ? 'mañana' : `${fromYmd(r.date).getDate()} ${MONTHS_S[fromYmd(r.date).getMonth()]}`;
  return `${d} ${r.time || ''}${r.rep ? ' · ' + ({ daily: 'cada día', weekly: 'cada semana', monthly: 'cada mes' }[r.rep] || '') : ''}`.trim();
};
const bell = (col, o) => { const on = col === 'habits' ? !!o.rtime : !!(o.remind && o.remind.date); return `<button class="x ${on ? 'bon' : ''}" data-act="remind" data-col="${col}" data-id="${o.id}" aria-label="${on ? 'Cambiar recordatorio' : 'Recordarme'}" style="font-size:17px;line-height:1">🔔</button>`; };
function remindSheet(col, id) {
  const o = S[col].find(x => x.id === id && !x.deleted); if (!o) return;
  RM = { col, id };
  const now = new Date(), t = ymd(now), hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (col === 'habits') {
    openSheet(`<h3 class="sh-t">Recordarme</h3><p class="hint">${esc(o.emoji)} ${esc(o.name)} — te aviso todos los días a esta hora (salvo si ya lo marcaste).</p>
      <label>Hora<input id="rmTime" type="time" class="in" value="${o.rtime || '08:00'}"></label>
      <div class="acts">${o.rtime ? '<button class="btn" data-act="rm-clear">Quitar</button>' : ''}<button class="btn pri" data-act="rm-save">Guardar</button></div>`);
    return;
  }
  const r = o.remind || {}, soon = new Date(now.getTime() + 3600e3);
  openSheet(`<h3 class="sh-t">Recordarme</h3>
    <p class="hint">${r.date ? 'Ahora: ' + esc(remLabel(r)) : 'Elige cuándo quieres que te avise al celular.'}</p>
    <div class="tpls"><button data-act="rm-quick" data-k="1h">En 1 hora</button><button data-act="rm-quick" data-k="night">Esta noche</button><button data-act="rm-quick" data-k="tom">Mañana</button><button data-act="rm-quick" data-k="sat">El sábado</button></div>
    <div class="g2"><label>Fecha<input id="rmDate" type="date" class="in" value="${r.date || t}"></label><label>Hora<input id="rmTime" type="time" class="in" value="${r.time || hm(soon)}"></label></div>
    <label style="margin-top:12px">Repetir<select id="rmRep" class="in">${[['', 'No repetir'], ['daily', 'Cada día'], ['weekly', 'Cada semana'], ['monthly', 'Cada mes']].map(([v, l]) => `<option value="${v}" ${(r.rep || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="acts">${r.date ? '<button class="btn" data-act="rm-clear">Quitar</button>' : ''}<button class="btn pri" data-act="rm-save">Guardar</button></div>`);
}
function remindDone(msg) {
  const o = S[RM.col].find(x => x.id === RM.id); if (o) touch(o);
  save(); render();
  if (RM.col === 'lists') listSheet(RM.id); else closeSheet();
  toast(msg + (S.cfg.push ? '' : ' · Activa los avisos en Hoy para recibirlo'));
}

/* ============================ BUSCAR ============================ */
function searchSheet() {
  openSheet(`<h3 class="sh-t">Buscar</h3><input id="sIn" class="in big" type="search" autocomplete="off" enterkeyhint="search" placeholder="Tareas, notas, listas, gente…"><div id="sOut" style="margin-top:12px"></div>`, () => { const i = $('#sIn'); i.focus(); i.oninput = () => { $('#sOut').innerHTML = searchHtml(i.value); }; });
}
function searchHtml(q) {
  const n = strip(q.trim().toLowerCase()); if (n.length < 2) return '<p class="hint">Escribe al menos 2 letras.</p>';
  const has = s => strip(String(s || '').toLowerCase()).includes(n), out = [];
  live(S.items).forEach(i => { if (has(i.title)) out.push(['item', i.id, shapeOf(i), i.title, (i.done ? 'Hecho' : 'Pendiente') + (i.date ? ' · ' + i.date : '')]); });
  live(S.lists).forEach(l => { const hit = l.items.find(x => has(x.t)); if (has(l.n) || hit) out.push(['list', l.id, l.e, l.n, hit && !has(l.n) ? 'Lista · ' + hit.t : 'Lista']); });
  live(S.notes).forEach(x => { if (has(x.text)) out.push(['note', x.id, '📝', x.text.slice(0, 80), 'Nota']); });
  live(S.people).forEach(x => { if (has(x.name)) out.push(['person', x.id, '👤', x.name, 'Gente']); });
  live(S.goals).forEach(x => { if (has(x.title)) out.push(['goal', x.id, x.emoji || '🎯', x.title, 'Meta']); });
  live(S.moves).forEach(x => { if (has(x.note) || has(x.cat)) out.push(['move', x.id, '💸', x.note || x.cat, 'Movimiento · ' + (x.date || '')]); });
  if (!out.length) return '<p class="hint">Nada coincide.</p>';
  return out.slice(0, 30).map(([k, id, ic, t, sub]) => `<button class="sres" data-act="sgo" data-k="${k}" data-id="${id}"><span style="font-size:20px">${typeof ic === 'string' && ic.startsWith('<') ? ic : esc(ic)}</span><div><b>${esc(t)}</b><small>${esc(sub)}</small></div></button>`).join('');
}
const shapeOf = i => shape(i.cat, 20);

/* ============================ EVENTOS ============================ */
const A = {
  hpin: el => { const h = S.habits.find(x => x.id === el.dataset.id); if (h) { h.pin = !h.pin; touch(h); save(); render(); toast(h.pin ? 'Fijado en Hoy' : 'Quitado de Hoy'); } },
  upd: async () => { toast('Buscando la versión más nueva…'); try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {} location.reload(); },
  remind: el => remindSheet(el.dataset.col, el.dataset.id),
  'rm-quick': el => {
    const o = S[RM.col].find(x => x.id === RM.id); if (!o) return;
    const now = new Date(), k = el.dataset.k, hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`, dh = S.cfg.dayHour || 9;
    let d;
    if (k === '1h') d = new Date(now.getTime() + 3600e3);
    else if (k === 'night') { d = new Date(now); d.setHours(20, 0, 0, 0); if (d <= now) d.setDate(d.getDate() + 1); }
    else if (k === 'tom') { d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(dh, 0, 0, 0); }
    else { d = new Date(now); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(10, 0, 0, 0); }
    o.remind = { date: ymd(d), time: hm(d), rep: null }; remindDone('Te aviso ' + remLabel(o.remind));
  },
  'rm-save': () => {
    const o = S[RM.col].find(x => x.id === RM.id); if (!o) return;
    if (RM.col === 'habits') { o.rtime = $('#rmTime').value || '08:00'; remindDone('Te aviso todos los días a las ' + o.rtime); return; }
    const date = $('#rmDate').value, time = $('#rmTime').value;
    if (!date || !time) { toast('Elige fecha y hora'); return; }
    o.remind = { date, time, rep: $('#rmRep').value || null }; remindDone('Te aviso ' + remLabel(o.remind));
  },
  'rm-clear': () => { const o = S[RM.col].find(x => x.id === RM.id); if (!o) return; if (RM.col === 'habits') o.rtime = null; else o.remind = null; remindDone('Recordatorio quitado'); },
  search: () => searchSheet(),
  lnew: () => listNewSheet(),
  lopen: el => listSheet(el.dataset.id),
  ltpl: el => { const t = LIST_TPL[+el.dataset.i]; const l = { id: uid(), n: t.n, e: t.e, items: t.i.map(x => ({ id: uid(), t: x, d: false })), created: Date.now(), updated: Date.now() }; S.lists.push(l); save(); render(); listSheet(l.id); },
  ltog: el => { const l = S.lists.find(x => x.id === ui.list); const it = l && l.items.find(x => x.id === el.dataset.id); if (it) { it.d = !it.d; touch(l); save(); listSheet(l.id, true); render(); } },
  lrm: el => { const l = S.lists.find(x => x.id === ui.list); if (l) { l.items = l.items.filter(x => x.id !== el.dataset.id); touch(l); save(); listSheet(l.id, true); render(); } },
  lclear: () => { const l = S.lists.find(x => x.id === ui.list); if (l) { l.items = l.items.filter(x => !x.d); touch(l); save(); listSheet(l.id, true); render(); toast('Listo, quité lo tachado'); } },
  luncheck: () => { const l = S.lists.find(x => x.id === ui.list); if (l) { l.items.forEach(x => { x.d = false; }); touch(l); save(); listSheet(l.id, true); render(); } },
  lshare: () => { const l = S.lists.find(x => x.id === ui.list); if (!l) return; const txt = `${l.e} ${l.n}\n` + l.items.map(x => `${x.d ? '☑' : '☐'} ${x.t}`).join('\n'); if (navigator.share) navigator.share({ title: l.n, text: txt }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Lista copiada')); },
  ldel: () => { const id = ui.list; closeSheet(); softDel('lists', id, 'Lista borrada'); },
  sgo: el => { const [k, id] = [el.dataset.k, el.dataset.id]; closeSheet(); if (k === 'item') { const it = S.items.find(x => x.id === id); if (it) itemSheet(it); } else if (k === 'list') listSheet(id); else { ui.tab = k === 'move' ? 'dinero' : 'mente'; ui.anim = true; render(); scrollTo(0, 0); } },
  tab: el => { ui.tab = el.dataset.tab; ui.anim = true; render(); scrollTo(0, 0); },
  new: () => itemSheet(null),
  toggle: el => toggleItem(el.dataset.id, el),
  edit: el => { const it = S.items.find(x => x.id === el.dataset.id); if (it) itemSheet(it); },
  isave: () => saveItem(),
  idel: () => { if (!edit) return; edit.deleted = true; touch(edit); save(); closeSheet(); render(); toast('Borrado'); },
  day: el => { ui.sel = ui.sel === el.dataset.d ? null : el.dataset.d; render(); },
  cal: el => { ui.month = shiftMonth(ui.month, +el.dataset.n); ui.sel = null; render(); },
  pm: el => { ui.pm = shiftMonth(ui.pm, +el.dataset.n); render(); },
  hday: el => toggleHabit(el.dataset.id, el.dataset.d),
  hdel: el => { const h = S.habits.find(x => x.id === el.dataset.id); if (h && confirm('¿Borrar este ritual y su historial?')) { h.deleted = true; touch(h); save(); render(); } },
  npin: el => { const n = S.notes.find(x => x.id === el.dataset.id); if (n) { n.pin = !n.pin; touch(n); save(); $('#notesList').innerHTML = notesHtml(); } },
  ndel: el => { const n = S.notes.find(x => x.id === el.dataset.id); if (n) { n.deleted = true; touch(n); save(); $('#notesList').innerHTML = notesHtml(); toast('Nota borrada'); } },
  mkrepeat: el => {
    const it = S.items.find(x => x.id === el.dataset.id); if (!it) return;
    S.items.push({ ...it, id: uid(), date: nextFuture(it.date, 'monthly'), repeat: 'monthly', done: false, doneAt: null, demo: false, created: Date.now(), updated: Date.now() });
    save(); render(); toast('Listo, se repetirá cada mes');
  },
  settings: () => settingsSheet(),
  ssave: () => { readCfg(); save(); closeSheet(); render(); },
  'cl-in': () => login(false), 'cl-up': () => login(true),
  'cl-out': () => { S.sess = null; persist(); settingsSheet(); render(); },
  'cl-sync': () => { readCfg(); persist(); sync(true); },
  notif: () => enablePush(),
  ptest: () => testPush(),
  poff: () => disablePush(),
  pushgo: () => (S.sess ? enablePush() : (toast('Primero conecta tu cuenta de la nube'), settingsSheet())),
  ics: () => exportICS(),
  exp: () => download('lumen-respaldo-' + ymd(new Date()) + '.json', 'application/json', JSON.stringify({ items: S.items, habits: S.habits, notes: S.notes }, null, 1)),
  imp: () => $('#impFile').click(),
  demo: () => { let n = 0;[S.items, S.habits, S.notes].forEach(a => a.forEach(x => { if (x.demo && !x.deleted) { x.deleted = true; touch(x); n++; } })); save(); render(); toast(n ? 'Ejemplos borrados' : 'No quedan ejemplos'); },
  close: () => closeSheet()
};
/* ---- acciones nuevas (y las que ahora tienen "Deshacer") ---- */
const refreshNotes = () => { const l = $('#notesList'); if (l) l.innerHTML = notesHtml(); };
Object.assign(A, {
  undo: () => { const u = toast.undo; toast.undo = null; $('#toast').classList.remove('on'); if (u) u(); },
  idel: () => { if (!edit) return; const id = edit.id; closeSheet(); softDel('items', id, 'Borrado'); },
  hdel: el => softDel('habits', el.dataset.id, 'Ritual borrado'),
  ndel: el => softDel('notes', el.dataset.id, 'Nota borrada', refreshNotes),
  star: el => { const it = S.items.find(x => x.id === el.dataset.id); if (!it) return; it.star = !it.star; touch(it); save(); render(); },
  und: () => { ui.undAll = !ui.undAll; render(); },
  jump: el => { const t = document.getElementById(el.dataset.to); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  exp: () => download('lumen-respaldo-' + ymd(new Date()) + '.json', 'application/json', JSON.stringify(colsData(), null, 1)),
  demo: () => { let n = 0; COLS.forEach(k => S[k].forEach(x => { if (x.demo && !x.deleted) { x.deleted = true; touch(x); n++; } })); save(); render(); toast(n ? 'Ejemplos borrados' : 'No quedan ejemplos'); },

  // check-in
  chk: el => checkSheet(+el.dataset.m),
  'chk-edit': () => checkSheet(),
  'ck-save': () => {
    const t = ymd(new Date()), id = 'ck' + t, note = $('#ckN').value.trim();
    const c = S.checks.find(x => x.id === id);
    if (c) { Object.assign(c, { mood: CK.m, energy: CK.e, note, deleted: false }); touch(c); }
    else S.checks.push({ id, date: t, mood: CK.m, energy: CK.e, note, updated: Date.now() });
    save(); closeSheet(); render(); toast('Check-in guardado');
  },

  // enfoque
  focus: () => focusSheet(),
  'fc-start': () => {
    const id = $('#fcTask').value || null, on = document.querySelector('#fcDur .on'), dur = on ? +on.dataset.m : 25;
    const it = id ? S.items.find(x => x.id === id) : null;
    setRun({ id, title: it ? it.title : '', start: Date.now(), end: Date.now() + dur * 60000, dur });
    closeSheet(); focusTick(); toast(`Enfoque iniciado: ${dur} min`);
  },
  'fc-stop': () => {
    const el = Math.floor((Date.now() - RUN.start) / 60000);
    if (el >= 5) logFocus(el);
    setRun(null); closeSheet(); focusTick(); render(); toast(el >= 5 ? `Sumaste ${el} min de enfoque` : 'Enfoque cancelado');
  },
  'fc-complete': el => { const it = S.items.find(x => x.id === el.dataset.id); closeSheet(); if (it && !it.done) toggleItem(it.id); },
  'fc-again': el => { closeSheet(); setTimeout(() => focusSheet(el.dataset.id || undefined), 120); },

  // dinero
  'm-out': () => moneySheet('out'),
  'm-in': () => moneySheet('in'),
  mv: el => { const m = S.moves.find(x => x.id === el.dataset.id); if (m) moneySheet(m.kind, m); },
  'm-save': () => {
    const amount = num($('#mAmt').value);
    if (!amount || amount <= 0) { shake($('#mAmt')); $('#mAmt').focus(); return; }
    const data = { kind: MS.kind, amount, cat: MS.kind === 'out' ? MS.cat : 'in', note: $('#mNote').value.trim(), date: $('#mDate').value || ymd(new Date()) };
    if (MS.mv) { Object.assign(MS.mv, data); touch(MS.mv); } else S.moves.push({ id: uid(), updated: Date.now(), ...data });
    ui.pm = data.date.slice(0, 7);
    save(); closeSheet(); render(); toast(MS.kind === 'out' ? 'Gasto anotado' : 'Ingreso anotado');
  },
  'm-del': () => { if (!MS.mv) return; const id = MS.mv.id; closeSheet(); softDel('moves', id, 'Movimiento borrado'); },

  // metas
  'goal-new': () => goalSheet(null),
  goal: el => { const g = S.goals.find(x => x.id === el.dataset.id); if (g) goalSheet(g); },
  'goal-save': () => {
    const title = $('#gTitle').value.trim(); if (!title) { shake($('#gTitle')); return; }
    const kind = GS.kind, target = kind === 'num' ? num($('#gTarget').value) : null;
    if (kind === 'num' && !target) { shake($('#gTarget')); return; }
    const progress = kind === 'num' ? (num($('#gProg').value) || 0) : +$('#gRange').value;
    const data = { title, emoji: $('#gEmoji').value.trim() || '🎯', kind, target, progress, unit: kind === 'num' ? $('#gUnit').value.trim() : '', due: $('#gDue').value || null };
    const was = GS.g ? goalPct(GS.g) : 0;
    if (GS.g) { Object.assign(GS.g, data); touch(GS.g); } else S.goals.push({ id: uid(), created: Date.now(), updated: Date.now(), ...data });
    const now = goalPct(data);
    save(); closeSheet(); render();
    if (now >= 100 && was < 100) { toast('¡Meta cumplida!'); burst(innerWidth / 2, innerHeight / 3); } else toast('Meta guardada');
  },
  'goal-del': () => { if (!GS.g) return; const id = GS.g.id; closeSheet(); softDel('goals', id, 'Meta borrada'); },

  // gente
  'person-new': () => personSheet(null),
  person: el => { const p = S.people.find(x => x.id === el.dataset.id); if (p) personSheet(p); },
  'p-save': () => {
    const name = $('#pName').value.trim(); if (!name) { shake($('#pName')); return; }
    const data = { name, every: +$('#pEvery').value || 30, last: $('#pLast').value || null, bday: $('#pBday').value || '' };
    let p = PS, old = null;
    if (p) { old = p.name; Object.assign(p, data, { deleted: false }); touch(p); } else { p = { id: uid(), updated: Date.now(), ...data }; S.people.push(p); }
    syncBday(p, old);
    save(); closeSheet(); render(); toast('Guardado');
  },
  'p-del': () => {
    if (!PS) return; const p = PS, it = activeBday(p), id = p.id;
    if (it) { it.deleted = true; touch(it); }
    closeSheet(); softDel('people', id, 'Persona borrada');
  },
  'p-done': el => {
    const p = S.people.find(x => x.id === el.dataset.id); if (!p) return;
    p.last = ymd(new Date()); touch(p); save(); render(); toast('Anotado');
  },

  // revisión semanal
  review: () => reviewSheet(),
  'rv-save': () => {
    const a = $('#rvA').value.trim(), b = $('#rvB').value.trim(), c = $('#rvC').value.trim();
    if (!a && !b && !c) { toast('Escribe al menos una respuesta'); return; }
    const t = ymd(new Date()), d = new Date();
    const lines = [`Revisión del ${d.getDate()} de ${MONTHS[d.getMonth()]}`];
    if (a) lines.push('Salió bien: ' + a); if (b) lines.push('Me frenó: ' + b); if (c) lines.push('Lo que importa: ' + c);
    lines.push('#revisión');
    S.notes.push({ id: uid(), text: lines.join('\n'), pin: false, review: true, created: Date.now(), updated: Date.now() });
    if (c) {
      const nextMon = addDays(t, ((8 - d.getDay()) % 7) || 7);
      S.items.push({ id: uid(), done: false, created: Date.now(), updated: Date.now(), title: c, type: 'task', cat: 'personal', star: true, date: nextMon, time: null, amount: null, repeat: null });
    }
    save(); closeSheet(); render(); toast(c ? 'Guardada. Tu prioridad quedó como tarea importante' : 'Revisión guardada');
  }
});

document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return; const fn = A[el.dataset.act]; if (fn) fn(el, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rmain')) { e.preventDefault(); A.edit(e.target); }
});
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.act === 'nsearch') { ui.q = e.target.value; $('#notesList').innerHTML = notesHtml(); } });
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]'); if (!form) return; e.preventDefault();
  const d = new FormData(form);
  if (form.dataset.form === 'litem') { const l = S.lists.find(x => x.id === ui.list), t = (d.get('t') || '').trim(); if (l && t) { l.items.push({ id: uid(), t, d: false }); touch(l); save(); listSheet(l.id, true); render(); const i = $('#liIn'); if (i) i.focus(); } return; }
  if (form.dataset.form === 'lnew') { const n = (d.get('n') || '').trim(); if (!n) return; const l = { id: uid(), n, e: (d.get('e') || '📝').trim() || '📝', items: [], created: Date.now(), updated: Date.now() }; S.lists.push(l); save(); render(); listSheet(l.id); return; }
  if (form.dataset.form === 'habit') { const name = (d.get('name') || '').trim(); if (!name) return; S.habits.push({ id: uid(), name, emoji: (d.get('emoji') || '✨').trim() || '✨', log: {}, updated: Date.now() }); }
  if (form.dataset.form === 'note') { const text = (d.get('text') || '').trim(); if (!text) return; S.notes.push({ id: uid(), text, pin: false, created: Date.now(), updated: Date.now() }); }
  save(); render();
});


/* ============================ AVISOS (push al celular) ============================ */
const FN = () => (S.cfg.url || '') + '/functions/v1/lumen-push';
const b64u = s => { const r = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
const atLocal = (date, h, m) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m, 0, 0); };
// Qué avisos necesita cada cosa. Pago: el día antes y el día. Cita con hora: 1 h antes y a la hora. Tarea: a su hora (o a las 9).
function reminderRows(items, uidv, now = new Date(), dayHour = 9, fmt = n => '$' + n) {
  const rows = [], lo = now.getTime() - 15 * 60e3, hi = now.getTime() + 60 * 864e5;
  const add = (it, kind, when, body) => {
    const t = when.getTime(); if (t < lo || t > hi) return;
    const id = `${it.id}_${kind}_${ymd(when)}_${pad(when.getHours())}${pad(when.getMinutes())}`;
    rows.push({ id, user_id: uidv, item_id: it.id, title: it.title, body, remind_at: when.toISOString(), kind: 'auto' });
  };
  items.forEach(it => {
    if (it.deleted || it.done || !it.date) return;
    const [h, m] = it.time ? it.time.split(':').map(Number) : [dayHour, 0];
    const at = atLocal(it.date, h, m), amt = it.amount != null ? ' · ' + fmt(it.amount) : '';
    if (it.type === 'pay') {
      add(it, 'pre', atLocal(addDays(it.date, -1), dayHour, 0), 'Mañana vence' + amt);
      add(it, 'at', at, 'Vence hoy' + amt);
    } else if (it.type === 'appt' && it.time) {
      add(it, 'pre', new Date(at.getTime() - 60 * 60e3), 'En 1 hora · ' + it.time);
      add(it, 'at', at, 'Ahora · ' + it.time);
    } else add(it, 'at', at, it.time ? 'Hoy · ' + it.time : 'Para hoy');
  });
  return rows;
}
// Avisos de Mente: notas, listas y metas con "recordarme" (una vez o repetido) y rituales con hora diaria.
function mindRows(St, uidv, now = new Date(), dayHour = 9) {
  const rows = [], lo = now.getTime() - 15 * 60e3, hi = now.getTime() + 60 * 864e5, today = ymd(now);
  const lv = a => (a || []).filter(x => !x.deleted);
  const add = (o, title, body, when) => {
    const t = when.getTime(); if (t < lo || t > hi) return;
    rows.push({ id: `${o.id}_m_${ymd(when)}_${pad(when.getHours())}${pad(when.getMinutes())}`, user_id: uidv, item_id: o.id, title: String(title).slice(0, 80), body, remind_at: when.toISOString(), kind: 'auto' });
  };
  const step = (d, rp) => rp === 'daily' ? addDays(d, 1) : nextDate(d, rp);
  const each = (col, f) => lv(St[col]).forEach(o => {
    const r = o.remind; if (!r || !r.date) return;
    const [h, m] = (r.time || `${pad(dayHour)}:00`).split(':').map(Number);
    let d = r.date, k = 0;
    if (r.rep) while (atLocal(d, h, m).getTime() < lo && k++ < 4000) d = step(d, r.rep);
    k = 0;
    while (k++ < 70) { const w = atLocal(d, h, m); if (w.getTime() > hi) break; const [ti, bo] = f(o); add(o, ti, bo, w); if (!r.rep) break; d = step(d, r.rep); }
  });
  each('notes', n => [n.text.split('\n')[0], 'Querías acordarte de esto']);
  each('lists', l => [`${l.e} ${l.n}`, (c => c ? `Te faltan ${c} por tachar` : 'Revisa tu lista')(l.items.filter(x => !x.d).length)]);
  each('goals', g => [`${g.emoji || '🎯'} ${g.title}`, 'Dale un paso a tu meta hoy']);
  lv(St.habits).forEach(h => {
    if (!h.rtime) return;
    const [hh, mm] = h.rtime.split(':').map(Number);
    for (let k = 0; k < 14; k++) { const d = addDays(today, k); if (k === 0 && h.log && h.log[today]) continue; add(h, `${h.emoji || '✨'} ${h.name}`, 'Es hora de tu ritual', atLocal(d, hh, mm)); }
  });
  return rows;
}
async function syncReminders(t) {
  const u = S.sess.uid, want = [...reminderRows(S.items, u, new Date(), S.cfg.dayHour || 9, money), ...mindRows(S, u, new Date(), S.cfg.dayHour || 9)];
  const have = await sb(`/rest/v1/reminders?select=id&user_id=eq.${u}&kind=eq.auto`, { token: t });
  const keep = new Set(want.map(r => r.id)), gone = (have || []).map(r => r.id).filter(id => !keep.has(id));
  if (want.length) await sb('/rest/v1/reminders', { method: 'POST', token: t, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: want });
  for (let k = 0; k < gone.length; k += 40) await sb(`/rest/v1/reminders?user_id=eq.${u}&id=in.(${gone.slice(k, k + 40).join(',')})`, { method: 'DELETE', token: t });
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => navigator.standalone || (matchMedia && matchMedia('(display-mode: standalone)').matches);
async function enablePush(silent) {
  try {
    if (!S.sess) throw new Error('Primero conecta la nube en Ajustes');
    if (isIOS() && !isStandalone()) throw new Error('En iPhone: abre Lumen desde el ícono de tu pantalla de inicio (Compartir → Añadir a pantalla de inicio)');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este navegador no permite avisos');
    if (silent === true && Notification.permission !== 'granted') return;
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('Los avisos están bloqueados; actívalos en los ajustes del celular');
    const reg = await navigator.serviceWorker.ready;
    const r = await fetch(FN() + '?a=key', { headers: { apikey: S.cfg.key } }).catch(() => null);
    const kj = r && r.ok ? await r.json().catch(() => null) : null;
    if (!kj || !kj.key) throw new Error('Falta crear la función lumen-push en Supabase (mira SETUP)');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(kj.key) });
    const t = await token();
    await sb('/rest/v1/push_subs', { method: 'POST', token: t, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { endpoint: sub.endpoint, user_id: S.sess.uid, sub: sub.toJSON() } });
    const first = !S.cfg.push; S.cfg.push = 1; pushErr = ''; persist();
    await syncReminders(t);
    if (silent !== true) { toast('Avisos activados'); if ($('#sheet').classList.contains('open')) settingsSheet(); if (first) testPush(); }
    render();
  } catch (e) { pushErr = e.message; if (silent !== true) toast(e.message); if ($('#sheet') && $('#sheet').classList.contains('open')) settingsSheet(); }
}
async function testPush() {
  try {
    const t = await token();
    const r = await fetch(FN() + '?a=test', { headers: { apikey: S.cfg.key, Authorization: 'Bearer ' + t } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    toast(j.ok ? 'Aviso de prueba enviado, debería llegar en segundos' : 'No hay ningún aparato registrado; toca Reactivar avisos');
  } catch (e) { toast('No se pudo enviar la prueba: ' + e.message); }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { const t = await token(); await sb(`/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', token: t }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) {}
  S.cfg.push = 0; persist(); toast('Avisos apagados'); settingsSheet(); render();
}
function pushBanner() {
  if (S.cfg.push && !pushErr) return '';
  const txt = pushErr ? `Los avisos tienen un problema: ${esc(pushErr)}` : 'Activa los avisos y Lumen te escribe al celular a la hora de cada cosa, aunque la app esté cerrada.';
  return `<div class="idea">${shape('ideas', 22)}<p>${txt}</p><button class="btn pri" data-act="pushgo">${pushErr ? 'Reintentar' : 'Activar'}</button></div>`;
}

/* ============================ ARRANQUE ============================ */
let swReg = null;
if (typeof document !== 'undefined' && $('#view')) {
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Se actualiza sola: busca versión nueva al abrir y al volver a la app, y recarga cuando llega
    const had = !!navigator.serviceWorker.controller; let rl = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had || rl) return; rl = true; const go = () => $('#sheet').classList.contains('open') ? setTimeout(go, 4000) : location.reload(); go(); });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { swReg = reg; reg.update().catch(() => {}); }).catch(() => {});
  }
  sync(); notifyDue(); focusTick(); if (S.cfg.push) enablePush(true);
  setInterval(focusTick, 1000);
  setInterval(() => { if (!document.hidden) sync(); }, 90000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (swReg) swReg.update().catch(() => {}); render(); sync(); notifyDue(); focusTick(); } });
}

/* ---- se siente como app: sin zoom por pellizco ni doble toque ---- */
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ---- la hoja se queda quieta: no se arrastra el fondo, ni salta con el teclado ---- */
(() => {
  const sh = $('#sheet'), sc = $('#scrim');
  sc.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  sh.addEventListener('touchmove', e => {
    if (e.target.closest('input[type=range],.cats,.jump,select')) return;
    if (sh.scrollHeight <= sh.clientHeight + 1) e.preventDefault();
  }, { passive: false });
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => {
      if (!sh.classList.contains('open')) return;
      sh.style.maxHeight = Math.floor(vv.height * 0.94) + 'px';
      sh.style.bottom = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px';
    };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    new MutationObserver(() => { if (!sh.classList.contains('open')) { sh.style.maxHeight = ''; sh.style.bottom = ''; } }).observe(sh, { attributes: true, attributeFilter: ['class'] });
  }
})();
