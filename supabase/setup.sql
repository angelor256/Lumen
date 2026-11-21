-- Lumen · avisos al celular. Pégalo completo en Supabase → SQL Editor → Run.
-- Es seguro correrlo más de una vez. No toca tu tabla life_data.

-- 1) Dónde se guardan los aparatos que quieren recibir avisos
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  sub        jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "mis aparatos" on public.push_subs;
create policy "mis aparatos" on public.push_subs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Los avisos programados (la app los llena sola al sincronizar)
create table if not exists public.reminders (
  id        text primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  item_id   text not null,
  title     text not null,
  body      text not null default '',
  remind_at timestamptz not null,
  kind      text not null default 'auto',   -- auto | snooze
  token     uuid not null default gen_random_uuid(),
  sent_at   timestamptz
);
create index if not exists reminders_due on public.reminders (remind_at) where sent_at is null;
create index if not exists reminders_user on public.reminders (user_id);
alter table public.reminders enable row level security;
drop policy if exists "mis avisos" on public.reminders;
create policy "mis avisos" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Extensiones para revisar cada minuto (también se pueden activar en Database → Extensions)
create extension if not exists pg_cron;
create extension if not exists pg_net;
