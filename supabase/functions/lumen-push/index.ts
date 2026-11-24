// Lumen · envía los avisos push. Una sola función con varias rutas:
//   ?run=1      (con cabecera x-cron-secret) → la llama el cron cada minuto
//   ?a=key      → devuelve la llave pública VAPID (la app la necesita para suscribirse)
//   ?a=test     → manda un aviso de prueba (con la sesión del usuario)
//   ?a=done|snooze&id=..&t=..  → botones del aviso (Android/escritorio)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const SB_URL = env("SUPABASE_URL");
const db = createClient(SB_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const FN_URL = `${SB_URL}/functions/v1/lumen-push`;
let vapidReady = false;
function vapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:avisos@example.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  vapidReady = true;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------- fechas (misma lógica que app.js) ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (s: string, n: number) => { const d = fromYmd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
export const addMonths = (s: string, n: number) => {
  const d = fromYmd(s), y = d.getUTCFullYear(), mo = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return ymd(new Date(Date.UTC(y, mo, Math.min(d.getUTCDate(), last))));
};
export const nextDate = (s: string, rep: string) =>
  rep === "weekly" ? addDays(s, 7) : rep === "monthly" ? addMonths(s, 1) : rep === "yearly" ? addMonths(s, 12) : s;
export function nextFuture(d: string, rep: string, today: string) {
  let n = nextDate(d, rep), k = 0;
  while (n < today && k++ < 400) n = nextDate(n, rep);
  return n;
}
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/* ---------- datos del usuario (life_data) ---------- */
async function loadData(user: string) {
  const { data } = await db.from("life_data").select("data").eq("user_id", user).maybeSingle();
  return (data?.data ?? {}) as Record<string, any>;
}
const MIND = ["notes", "lists", "goals", "habits"];
const findMind = (d: Record<string, any>, id: string) => {
  for (const k of MIND) { const o = (d[k] ?? []).find((x: any) => x.id === id); if (o) return { k, o }; }
  return null;
};
const itemOpen = (d: Record<string, any>, id: string) => {
  const it = (d.items ?? []).find((x: any) => x.id === id);
  if (it) return !it.done && !it.deleted;
  const m = findMind(d, id);
  return !!m && !m.o.deleted; // avisos de Mente: notas, listas, metas y rituales
};

/* ---------- envío ---------- */
async function pushTo(user: string, payload: Record<string, unknown>) {
  vapid();
  const { data: subs } = await db.from("push_subs").select("endpoint,sub").eq("user_id", user);
  let ok = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      ok++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push error", e?.statusCode, e?.body ?? e?.message);
    }
  }
  return ok;
}

async function runDue() {
  const now = new Date();
  const { data: rows, error } = await db.from("reminders").select("*").is("sent_at", null)
    .lte("remind_at", now.toISOString()).order("remind_at").limit(200);
  if (error) throw error;
  const cache = new Map<string, Record<string, any>>();
  let sent = 0, skipped = 0;
  for (const r of rows ?? []) {
    const stale = now.getTime() - new Date(r.remind_at).getTime() > 24 * 3600e3;
    let send = !stale;
    if (send) {
      if (!cache.has(r.user_id)) cache.set(r.user_id, await loadData(r.user_id));
      send = itemOpen(cache.get(r.user_id)!, r.item_id);
    }
    // se marca primero para no repetir el aviso si algo falla a medias
    await db.from("reminders").update({ sent_at: now.toISOString() }).eq("id", r.id);
    if (!send) { skipped++; continue; }
    const q = (a: string) => `${FN_URL}?a=${a}&id=${encodeURIComponent(r.id)}&t=${r.token}`;
    const n = await pushTo(r.user_id, {
      title: r.title, body: r.body, tag: r.id,
      doneUrl: q("done"), snoozeUrl: q("snooze"),
    });
    if (n) sent++;
  }
  return { due: rows?.length ?? 0, sent, skipped };
}

async function userFromAuth(req: Request) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const { data } = await db.auth.getUser(tok);
  return data?.user?.id ?? null;
}

async function action(a: string, id: string, t: string) {
  const { data: r } = await db.from("reminders").select("*").eq("id", id).eq("token", t).maybeSingle();
  if (!r) return json({ error: "aviso no encontrado" }, 404);
  if (a === "snooze") {
    await db.from("reminders").insert({
      id: `${r.item_id}_z_${Date.now()}`, user_id: r.user_id, item_id: r.item_id,
      title: r.title, body: r.body, kind: "snooze", remind_at: new Date(Date.now() + 3600e3).toISOString(),
    });
    return json({ ok: true, snoozed: true });
  }
  // done: marca la tarea como hecha y, si se repite, crea la siguiente
  const { data: row } = await db.from("life_data").select("data").eq("user_id", r.user_id).maybeSingle();
  const d = (row?.data ?? {}) as Record<string, any>;
  const items: any[] = d.items ?? [];
  const it = items.find((x) => x.id === r.item_id);
  if (it && !it.done) {
    const ts = Date.now();
    it.done = true; it.doneAt = ts; it.updated = ts;
    if (it.repeat && it.date) {
      // Las fechas guardadas son locales del usuario y el servidor corre en UTC: como "hoy"
      // usamos la fecha del propio aviso, para no saltarnos una repetición vigente en zonas UTC-.
      items.push({
        ...it, id: uid(), date: nextFuture(it.date, it.repeat, ymd(new Date(r.remind_at))), done: false, doneAt: null,
        demo: false, created: ts, updated: ts,
        subs: it.subs ? it.subs.map((x: any) => ({ ...x, d: false })) : it.subs,
      });
    }
    d.items = items;
    await db.from("life_data").update({ data: d, updated_at: new Date().toISOString() }).eq("user_id", r.user_id);
  }
  // Mente: "Hecho" apaga el aviso de una sola vez; los que se repiten (y los rituales) siguen
  let keep = false;
  if (!it) {
    const m = findMind(d, r.item_id);
    if (m) {
      if (m.k === "habits" || m.o.remind?.rep) keep = true;
      else if (m.o.remind) { m.o.remind = null; m.o.updated = Date.now(); await db.from("life_data").update({ data: d, updated_at: new Date().toISOString() }).eq("user_id", r.user_id); }
    }
  }
  if (!keep) await db.from("reminders").delete().eq("item_id", r.item_id).is("sent_at", null);
  return json({ ok: true, done: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const u = new URL(req.url), a = u.searchParams.get("a");
  try {
    if (u.searchParams.get("run")) {
      const secret = env("CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "no autorizado" }, 401);
      return json(await runDue());
    }
    if (a === "key") return json({ key: env("VAPID_PUBLIC_KEY") });
    if (a === "test") {
      const user = await userFromAuth(req);
      if (!user) return json({ error: "sin sesión" }, 401);
      const n = await pushTo(user, { title: "Lumen funciona ✦", body: "Así te van a llegar tus recordatorios." });
      return json({ ok: n > 0, sent: n });
    }
    if ((a === "done" || a === "snooze") && u.searchParams.get("id") && u.searchParams.get("t"))
      return await action(a, u.searchParams.get("id")!, u.searchParams.get("t")!);
    return json({ error: "ruta desconocida" }, 404);
  } catch (e: any) {
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
