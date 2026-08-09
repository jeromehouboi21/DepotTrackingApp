-- =====================================================================
-- 005_brokers_custody.sql - Broker-Stammdaten + Depotstandort (E7, §13)
-- Standort ist ein editierbares Etikett OHNE Einfluss auf die G/V-Rechnung.
-- =====================================================================

create table if not exists public.brokers (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,          -- Slug, z. B. 'comdirect'
  name       text not null,
  color      text,
  active     boolean not null default true,
  sort_order integer,
  primary key (user_id, id)
);

create table if not exists public.holding_custody (
  user_id          uuid not null references auth.users(id) on delete cascade,
  isin             text not null,
  broker_id        text not null,
  shares           numeric,          -- null = gesamter Restbestand
  status           text not null default 'settled',  -- settled | pending_transfer | in_transit
  target_broker_id text,
  note             text,
  updated_at       timestamptz not null default now(),
  primary key (user_id, isin, broker_id)
);

alter table public.brokers         enable row level security;
alter table public.holding_custody enable row level security;

drop policy if exists brokers_owner on public.brokers;
create policy brokers_owner on public.brokers
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists holding_custody_owner on public.holding_custody;
create policy holding_custody_owner on public.holding_custody
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
