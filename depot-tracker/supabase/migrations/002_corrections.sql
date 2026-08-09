-- =====================================================================
-- 002_corrections.sql - nicht-destruktive Korrekturen (E2, §12)
-- =====================================================================

create table if not exists public.transaction_overrides (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null,
  patch          jsonb not null,      -- nur geaenderte Felder
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, transaction_id)
);

create table if not exists public.manual_cost_lots (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  isin     text not null,
  date     date not null,
  shares   numeric not null,
  cost     numeric not null,
  note     text,
  created_at timestamptz not null default now()
);

create index if not exists manual_cost_lots_isin_idx on public.manual_cost_lots (user_id, isin);

create table if not exists public.transfer_links (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  out_transaction_id text not null,
  in_transaction_id  text,            -- null = "extern uebertragen, kein Ziel"
  carried_cost_basis numeric,
  note               text,
  created_at         timestamptz not null default now()
);

alter table public.transaction_overrides enable row level security;
alter table public.manual_cost_lots      enable row level security;
alter table public.transfer_links        enable row level security;

drop policy if exists transaction_overrides_owner on public.transaction_overrides;
create policy transaction_overrides_owner on public.transaction_overrides
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists manual_cost_lots_owner on public.manual_cost_lots;
create policy manual_cost_lots_owner on public.manual_cost_lots
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists transfer_links_owner on public.transfer_links;
create policy transfer_links_owner on public.transfer_links
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
