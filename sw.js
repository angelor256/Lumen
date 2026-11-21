/* Lumen · service worker: la app abre aunque no tengas internet */
const V = 'lumen-v3';
const SHELL = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  // Fuentes: guardar para después
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(V).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { c.put(r, res.clone()); return res; }).catch(() => hit))));
    return;
  }
  if (u.origin !== location.origin) return; // Supabase y demás: directo a la red
  // Archivos propios: primero la red (para que veas actualizaciones), si falla, la copia guardada
  e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r).then(hit => hit || caches.match('index.html'))));
});
// Avisos push desde Supabase (llegan aunque la app esté cerrada)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'Lumen', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Lumen', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined,
    data: { doneUrl: d.doneUrl || null, snoozeUrl: d.snoozeUrl || null },
    actions: d.doneUrl ? [{ action: 'done', title: 'Hecho ✓' }, { action: 'snooze', title: 'En 1 hora' }] : []
  }));
});
self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {};
  e.notification.close();
  const url = e.action === 'done' ? d.doneUrl : e.action === 'snooze' ? d.snoozeUrl : null;
  if (url) { e.waitUntil(fetch(url, { mode: 'no-cors' }).catch(() => {})); return; }
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
