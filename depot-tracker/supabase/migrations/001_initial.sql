-- =====================================================================
-- 001_initial.sql - Depot-Tracker
-- Import-Tabellen (roh, nicht-destruktiv): securities, transactions,
-- portfolio_seed, warnings. Alles RLS (auth.uid() = user_id).
-- =====================================================================

create table if not exists public.securities (
  user_id        uuid not null references auth.users(id) on delete cascade,
  isin           text not null,
  wkn            text,
  name           text,
  verwahrart     text,
  currency       text default 'EUR',
  -- App-Erweiterungen (nicht aus Parser):
  display_name    text,
  is_savings_plan boolean,          -- null = Heuristik entscheidet (E4)
  asset_class     text,             -- 'equity' | 'fund_etf' | 'bond' | 'other'
  primary key (user_id, isin)
);

create table if not exists public.transactions (
  user_id              uuid not null references auth.users(id) on delete cascade,
  id                   text not null,          -- Parser-ID (doc_hash/reference)
  source               text not null,
  date                 date not null,
  type                 text not null,          -- BUY | SELL | TRANSFER_IN | TRANSFER_OUT | CASH
  isin                 text,
  wkn                  text,
  name                 text,
  shares               numeric,
  price                numeric,
  gross                numeric,
  fees                 numeric,
  tax                  numeric,
  net                  numeric,
  currency             text,
  raw_ref              text,
  reported_realized_pl numeric,
  cost_lots            jsonb default '[]'::jsonb,
  flags                text[] default '{}',
  primary key (user_id, id)
);

create index if not exists transactions_isin_idx on public.transactions (user_id, isin);
create index if not exists transactions_type_idx on public.transactions (user_id, type);
create index if not exists transactions_date_idx on public.transactions (user_id, date);

create table if not exists public.portfolio_seed (
  user_id      uuid not null references auth.users(id) on delete cascade,
  isin         text not null,
  data         jsonb not null,
  generated_at timestamptz,
  primary key (user_id, isin)
);

create table if not exists public.warnings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  code            text not null,
  level           text not null default 'warn',
  isin            text,
  ref             text,
  message         text,
  status          text not null default 'open',   -- open | resolved | ignored
  resolution_note text,
  resolved_at     timestamptz,
  import_run_id   uuid,
  unique (user_id, code, isin, ref)
);

alter table public.securities     enable row level security;
alter table public.transactions   enable row level security;
alter table public.portfolio_seed enable row level security;
alter table public.warnings       enable row level security;

drop policy if exists securities_owner on public.securities;
create policy securities_owner on public.securities
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists transactions_owner on public.transactions;
create policy transactions_owner on public.transactions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists portfolio_seed_owner on public.portfolio_seed;
create policy portfolio_seed_owner on public.portfolio_seed
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists warnings_owner on public.warnings;
create policy warnings_owner on public.warnings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
