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
  const out = { title: '', type: 'task', cat: 'personal', date: null, time: null, amount: null, repeat: null };
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
S.cfg = S.cfg || {}; S.habits = S.habits || []; S.notes = S.notes || [];
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
  if (!it.done) {
    it.done = true; it.doneAt = Date.now(); touch(it);
    if (it.repeat && it.date) {
      S.items.push({ ...it, id: uid(), date: nextFuture(it.date, it.repeat), done: false, doneAt: null, demo: false, created: Date.now(), updated: Date.now() });
    }
    var celebrate = true;
  } else { it.done = false; it.doneAt = null; touch(it); }
  save(); render();
  if (celebrate) {
    try { if (el) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); } if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
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
      <small class="meta"><span class="mc">${shape(i.cat, 14)}${c.n}</span>${i.date ? `<span class="md">${rel(i.date)}</span>` : ''}${i.time ? `<span class="pill">${i.time}</span>` : ''}${i.repeat ? `<span class="mr">${I.loop}${REP[i.repeat]}</span>` : ''}</small>
    </div>
    ${i.amount != null ? `<span class="amt">${money(i.amount)}</span>` : ''}
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

function vHoy() {
  const d = new Date(), t = ymd(d);
  const { today, over, done, total } = todaySet();
  const p = total ? done / total : 0;
  const say = total ? (done === total ? 'Todo listo por hoy.' : `${done} de ${total} listas.`) : (over.length ? 'Hoy está libre, pero quedó algo atrás.' : 'Hoy está libre.');
  const L = live(S.items);
  const up = L.filter(i => !i.done && i.date > t && i.date <= addDays(t, 7)).sort(byDate);
  const mp = L.filter(i => i.type === 'pay' && !i.done && i.date && i.date.startsWith(t.slice(0, 7)));
  const mpSum = mp.reduce((s, i) => s + (+i.amount || 0), 0);
  const H = live(S.habits);
  const sg = suggestRepeat();
  return `
  <section class="hero">
    <div class="disc" style="--p:${p}" role="img" aria-label="Progreso de hoy ${Math.round(p * 100)}%"></div>
    <h1 class="bignum" data-t="${d.getDate()}">${d.getDate()}</h1>
    <p class="dateline">${DAYS_FULL[d.getDay()]} de ${MONTHS[d.getMonth()]}</p>
    <p class="say">${greet()}. ${say}</p>
  </section>
  ${H.length ? `<div class="habs">${H.map(h => `<button class="hchip ${h.log[t] ? 'on' : ''}" data-act="hday" data-id="${h.id}" data-d="${t}" aria-pressed="${!!h.log[t]}"><span>${esc(h.emoji)}</span>${esc(h.name)}</button>`).join('')}</div>` : ''}
  ${over.length ? sec('Atrasado', over.length, 'late') + over.map(row).join('') : ''}
  ${sec('Hoy', today.length)}
  ${today.length ? [...today].sort(byTime).map(row).join('') : empty('Nada agendado. Toca el + y escribe como hablas.')}
  ${up.length ? sec('Esta semana', up.length) + grouped(up) : ''}
  ${mp.length ? `<div class="sticker"><b>${money(mpSum)}</b><span>por pagar este mes en ${mp.length} ${mp.length === 1 ? 'pago' : 'pagos'}</span></div>` : ''}
  ${sg ? `<div class="idea">${shape('ideas', 22)}<p>Has pagado <b>${esc(sg.title)}</b> más de una vez. ¿Lo dejo repetirse solo cada mes?</p><button class="btn" data-act="mkrepeat" data-id="${sg.id}">Sí, repetir</button></div>` : ''}`;
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

function vDinero() {
  const ym = ui.pm;
  const L = live(S.items).filter(i => i.type === 'pay' && i.date && i.date.startsWith(ym)).sort(byDate);
  const sum = a => a.reduce((s, i) => s + (+i.amount || 0), 0);
  const paid = sum(L.filter(i => i.done)), pend = sum(L.filter(i => !i.done)), tot = paid + pend;
  const pct = tot ? Math.round(paid / tot * 100) : 0;
  const seen = new Set(), rec = [];
  live(S.items).filter(i => i.type === 'pay' && i.repeat && !i.done).forEach(i => { const k = strip(i.title).toLowerCase(); if (!seen.has(k)) { seen.add(k); rec.push(i); } });
  const eq = i => (+i.amount || 0) * (i.repeat === 'weekly' ? 4.33 : i.repeat === 'yearly' ? 1 / 12 : 1);
  const fixed = rec.reduce((s, i) => s + eq(i), 0);
  return `<h1 class="vt" data-t="Dinero">Dinero</h1>
  <div class="mnav"><button data-act="pm" data-n="-1" aria-label="Mes anterior">${I.left}</button><h2>${monthLabel(ym)}</h2><button data-act="pm" data-n="1" aria-label="Mes siguiente">${I.right}</button></div>
  <section class="money">
    <p class="mlabel">Por pagar</p>
    <p class="mbig" data-t="${money(pend)}">${money(pend)}</p>
    <div class="bar" role="img" aria-label="${pct}% pagado"><i style="width:${pct}%"></i></div>
    <p class="msub">${money(paid)} pagado de ${money(tot)}</p>
  </section>
  ${sec('Pagos del mes', L.length)}
  ${L.length ? L.map(row).join('') : empty('Sin pagos este mes. Escribe «pagar luz 45 el 25» en el +.')}
  ${rec.length ? sec('Fijos que se repiten', rec.length) + `<div class="fixed">${rec.sort((a, b) => eq(b) - eq(a)).map(i => `<div class="fx" data-act="edit" data-id="${i.id}">${shape('pagos', 16)}<span>${esc(i.title)}</span><b>${money(i.amount || 0)}</b></div>`).join('')}<p class="msub">Cuestan alrededor de ${money(Math.round(fixed))} al mes.</p></div>` : ''}`;
}

function notesHtml() {
  const q = strip(ui.q).toLowerCase();
  const N = live(S.notes).filter(n => !q || strip(n.text).toLowerCase().includes(q)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.updated - a.updated);
  if (!N.length) return empty(q ? 'Ninguna nota coincide.' : 'Tu mente está despejada. Suelta aquí lo que se te ocurra.');
  return N.map(n => `<article class="note ${n.pin ? 'pinned' : ''}"><p>${esc(n.text).replace(/(#[\wáéíóúñ]+)/gi, '<mark>$1</mark>')}</p><div class="na"><button data-act="npin" data-id="${n.id}" aria-label="Fijar">${I.pin}</button><button data-act="ndel" data-id="${n.id}" aria-label="Borrar nota">${I.x}</button></div></article>`).join('');
}
function vMente() {
  const t = ymd(new Date()), days = [...Array(7)].map((_, k) => addDays(t, k - 6));
  const H = live(S.habits);
  return `<h1 class="vt" data-t="Mente">Mente</h1>
  ${sec('Rituales', H.length)}
  ${H.map(h => { const s = streak(h); return `<div class="hab"><div class="he">${esc(h.emoji)}</div><div class="hb"><b>${esc(h.name)}</b><div class="hd">${days.map(d => `<button class="hdot ${h.log[d] ? 'on' : ''} ${d === t ? 'now' : ''}" data-act="hday" data-id="${h.id}" data-d="${d}" aria-label="${rel(d)}" aria-pressed="${!!h.log[d]}">${DAYS_S[fromYmd(d).getDay()][0]}</button>`).join('')}</div></div><div class="stk">${s > 0 ? `${s}<small>${s === 1 ? 'día' : 'días'}</small>` : ''}</div><button class="x" data-act="hdel" data-id="${h.id}" aria-label="Borrar ritual">${I.x}</button></div>`; }).join('')}
  <form class="addh" data-form="habit"><input class="in" name="emoji" maxlength="2" value="✨" aria-label="Emoji" style="width:62px;text-align:center"><input class="in" name="name" placeholder="Nuevo ritual, por ejemplo: estirarme" required><button class="btn">Añadir</button></form>
  ${sec('Notas sueltas', null)}
  <form class="addn" data-form="note"><textarea class="in" name="text" rows="2" placeholder="Suelta lo que tengas en la cabeza. Usa #etiquetas si quieres." required></textarea><button class="btn pri">Guardar nota</button></form>
  <input class="in search" data-act="nsearch" placeholder="Buscar en mis notas" value="${esc(ui.q)}" aria-label="Buscar notas">
  <div id="notesList">${notesHtml()}</div>`;
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
let edit = null, touched = {}, f = { type: 'task', cat: 'personal' };
const PH = ['pagar internet 30 el 15 cada mes', 'cita dentista viernes 4pm', 'entregar informe al cliente mañana', 'cumple de Sofi el 3 de marzo', 'idea: app para mi mamá', 'llamar al banco hoy 10am'];

function openSheet(html, after) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.add('open'); $('#scrim').classList.add('open'); $('#sheet').setAttribute('aria-hidden', 'false');
  document.body.classList.add('lock');
  if (after) after();
}
function closeSheet() {
  $('#sheet').classList.remove('open'); $('#scrim').classList.remove('open'); $('#sheet').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lock');
}
const hist = () => { const seen = new Set(), out = []; [...live(S.items)].reverse().forEach(i => { const k = i.title.toLowerCase(); if (!seen.has(k) && out.length < 50) { seen.add(k); out.push(i.title); } }); return out; };

function itemSheet(it, preset) {
  edit = it || null; touched = {};
  f = { type: it ? it.type : (preset?.type || 'task'), cat: it ? it.cat : (preset?.cat || 'personal') };
  const v = it || preset || {};
  const types = [['task', 'Tarea'], ['pay', 'Pago'], ['appt', 'Cita']].concat(it ? [] : [['note', 'Nota']]);
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
    </div>
    <div class="acts">${it ? '<button class="btn" data-act="idel">Borrar</button>' : ''}<button class="btn pri" data-act="isave">Guardar</button></div>`,
    () => {
      $('#fRepeat').value = v.repeat || '';
      syncSeg();
      const ti = $('#fTitle');
      if (!it) ti.addEventListener('input', applyParse);
      ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveItem(); } });
      $('#fType').onclick = e => { const b = e.target.closest('button'); if (!b) return; f.type = b.dataset.t; touched.type = 1; syncSeg(); };
      $('#fCats').onclick = e => { const b = e.target.closest('button'); if (!b) return; f.cat = b.dataset.c; touched.cat = 1; syncSeg(); };
      ['fDate', 'fTime', 'fAmount', 'fRepeat'].forEach(id => $('#' + id).addEventListener('input', () => touched[id] = 1));
      setTimeout(() => ti.focus(), 260);
    });
}
function syncSeg() {
  document.querySelectorAll('#fType button').forEach(b => b.classList.toggle('on', b.dataset.t === f.type));
  document.querySelectorAll('#fCats button').forEach(b => b.classList.toggle('on', b.dataset.c === f.cat));
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
  if (pr && p.amount == null && !touched.fAmount && pr.amount != null) $('#fAmount').value = pr.amount;
  if (pr && !p.repeat && !touched.fRepeat && pr.repeat) $('#fRepeat').value = pr.repeat;
  syncSeg();
  $('#fHint').textContent = p.title ? `Se guardará como «${p.title}»${pr ? ' (ya lo conozco, usé tus datos anteriores)' : ''}.` : 'Escribe como hablas: fecha, hora, monto y repetición se llenan solos.';
}
function saveItem() {
  const raw = $('#fTitle').value.trim();
  if (!raw) { $('#fTitle').focus(); $('#fTitle').classList.add('shake'); setTimeout(() => $('#fTitle').classList.remove('shake'), 400); return; }
  if (f.type === 'note') { S.notes.push({ id: uid(), text: raw, pin: false, created: Date.now(), updated: Date.now() }); save(); closeSheet(); ui.tab = 'mente'; render(); toast('Nota guardada'); return; }
  const title = edit ? raw : (parseQuick(raw).title || raw);
  const data = { title, type: f.type, cat: f.cat, date: $('#fDate').value || null, time: $('#fTime').value || null, amount: $('#fAmount').value ? num($('#fAmount').value) : null, repeat: $('#fRepeat').value || null };
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
    <div class="seg" id="sTheme"><button type="button" data-th="papel" class="${S.theme !== 'noche' ? 'on' : ''}">Papel</button><button type="button" data-th="noche" class="${S.theme === 'noche' ? 'on' : ''}">Noche</button></div>
    <h4 class="sh-h">Nube (Supabase)</h4>
    <p class="hint">${ss ? `Conectado como <b>${esc(ss.email)}</b>. Se sincroniza solo.` : 'Para tener tus datos en todos tus aparatos. Mira el README.md para crear tu proyecto gratis.'}</p>
    <label>URL del proyecto<input id="cUrl" class="in" inputmode="url" autocapitalize="off" placeholder="https://xxxx.supabase.co" value="${esc(c.url || '')}"></label>
    <label>Anon key<input id="cKey" class="in" autocapitalize="off" placeholder="eyJ..." value="${esc(c.key || '')}"></label>
    ${ss ? '' : `<div class="g2"><label>Correo<input id="cMail" type="email" class="in" autocapitalize="off"></label><label>Contraseña<input id="cPass" type="password" class="in"></label></div>`}
    <div class="acts wrap">${ss ? '<button class="btn" data-act="cl-sync">Sincronizar ahora</button><button class="btn" data-act="cl-out">Salir</button>' : '<button class="btn pri" data-act="cl-in">Entrar</button><button class="btn" data-act="cl-up">Crear cuenta</button>'}</div>
    <h4 class="sh-h">Avisos y datos</h4>
    <div class="acts wrap"><button class="btn" data-act="notif">Activar avisos</button><button class="btn" data-act="ics">Exportar al calendario</button><button class="btn" data-act="exp">Respaldo</button><button class="btn" data-act="imp">Importar</button><button class="btn" data-act="demo">Borrar ejemplos</button></div>
    <input type="file" id="impFile" accept="application/json" hidden>
    <div class="acts"><button class="btn pri" data-act="ssave">Listo</button></div>`,
    () => {
      $('#sTheme').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.theme = b.dataset.th; document.querySelectorAll('#sTheme button').forEach(x => x.classList.toggle('on', x === b)); persist(); render(); };
      $('#impFile').onchange = ev => { const file = ev.target.files[0]; if (!file) return; file.text().then(t => { try { const d = JSON.parse(t); S.items = mergeCol(S.items, d.items || []); S.habits = mergeCol(S.habits, d.habits || []); S.notes = mergeCol(S.notes, d.notes || []); save(); render(); toast('Respaldo importado'); } catch (e) { toast('Ese archivo no es un respaldo válido'); } }); };
    });
}
function readCfg() {
  const g = id => { const e = $('#' + id); return e ? e.value.trim() : undefined; };
  const nm = g('sName'), cur = g('sCur'), url = g('cUrl'), key = g('cKey');
  if (nm !== undefined) S.cfg.name = nm;
  if (cur !== undefined) S.cfg.cur = cur || '$';
  if (url !== undefined) S.cfg.url = url.replace(/\/+$/, '');
  if (key !== undefined) S.cfg.key = key;
}

/* ============================ NUBE (Supabase por REST) ============================ */
let syncing = false, lastErr = '';
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
    if (rows && rows[0] && rows[0].data) {
      const d = rows[0].data;
      S.items = mergeCol(S.items, d.items || []); S.habits = mergeCol(S.habits, d.habits || []); S.notes = mergeCol(S.notes, d.notes || []);
    }
    S.items = purge(S.items); S.habits = purge(S.habits); S.notes = purge(S.notes);
    await sb('/rest/v1/life_data', { method: 'POST', token: t, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: S.sess.uid, data: { items: S.items, habits: S.habits, notes: S.notes }, updated_at: new Date().toISOString() } });
    lastErr = ''; if (manual) toast('Sincronizado');
  } catch (e) { lastErr = e.message; if (manual) toast('No pude sincronizar: ' + e.message); }
  finally { syncing = false; persist(); render(); }
}

/* ============================ EXTRAS ============================ */
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400); }
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
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const t = ymd(new Date());
  if (!force && localStorage.getItem('lumen.notified') === t) return;
  const due = live(S.items).filter(i => !i.done && i.date && i.date <= t);
  if (!due.length) return;
  localStorage.setItem('lumen.notified', t);
  const body = due.slice(0, 4).map(i => i.title).join(', ') + (due.length > 4 ? ` y ${due.length - 4} más` : '');
  const title = `Hoy tienes ${due.length} ${due.length === 1 ? 'cosa' : 'cosas'}`;
  try { const reg = await navigator.serviceWorker.ready; reg.showNotification(title, { body, icon: 'icon-192.png', tag: 'lumen-hoy' }); } catch (e) { new Notification(title, { body }); }
}

/* ============================ EVENTOS ============================ */
const A = {
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
  notif: async () => { if (!('Notification' in window)) return toast('Este navegador no permite avisos'); const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Avisos activados' : 'Avisos bloqueados'); if (p === 'granted') notifyDue(true); },
  ics: () => exportICS(),
  exp: () => download('lumen-respaldo-' + ymd(new Date()) + '.json', 'application/json', JSON.stringify({ items: S.items, habits: S.habits, notes: S.notes }, null, 1)),
  imp: () => $('#impFile').click(),
  demo: () => { let n = 0;[S.items, S.habits, S.notes].forEach(a => a.forEach(x => { if (x.demo && !x.deleted) { x.deleted = true; touch(x); n++; } })); save(); render(); toast(n ? 'Ejemplos borrados' : 'No quedan ejemplos'); },
  close: () => closeSheet()
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return; const fn = A[el.dataset.act]; if (fn) fn(el, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rmain')) { e.preventDefault(); A.edit(e.target); }
});
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.act === 'nsearch') { ui.q = e.target.value; $('#notesList').innerHTML = notesHtml(); } });
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]'); if (!form) return; e.preventDefault();
  const d = new FormData(form);
  if (form.dataset.form === 'habit') { const name = (d.get('name') || '').trim(); if (!name) return; S.habits.push({ id: uid(), name, emoji: (d.get('emoji') || '✨').trim() || '✨', log: {}, updated: Date.now() }); }
  if (form.dataset.form === 'note') { const text = (d.get('text') || '').trim(); if (!text) return; S.notes.push({ id: uid(), text, pin: false, created: Date.now(), updated: Date.now() }); }
  save(); render();
});

/* ============================ ARRANQUE ============================ */
if (typeof document !== 'undefined' && $('#view')) {
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  sync(); notifyDue();
  setInterval(() => { if (!document.hidden) sync(); }, 90000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); sync(); notifyDue(); } });
}
