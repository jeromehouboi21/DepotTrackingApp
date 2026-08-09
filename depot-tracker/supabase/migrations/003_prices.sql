-- =====================================================================
-- 003_prices.sql  -  Depot-Tracker
-- Kurs-Schicht: Symbol-Mapping (securities), Kurs-Cache, manuelle Kurse,
-- FX-Cache. Alles RLS-geschuetzt (auth.uid() = user_id).
-- Voraussetzung: 001_initial.sql hat securities/transactions/... angelegt.
-- Idempotent geschrieben (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) securities: Symbol-Mapping-Spalten fuer marketstack (§9.2)
--    Einmalig via resolve-symbols aufgeloest & gecacht.
-- ---------------------------------------------------------------------
alter table public.securities add column if not exists price_symbol      text;
alter table public.securities add column if not exists price_mic         text;
alter table public.securities add column if not exists price_currency    text;
alter table public.securities add column if not exists figi              text;
alter table public.securities add column if not exists mapping_source    text;
alter table public.securities add column if not exists mapping_status    text not null default 'unresolved';
alter table public.securities add column if not exists mapping_confidence integer;
alter table public.securities add column if not exists mapping_checked_at timestamptz;

comment on column public.securities.price_symbol   is 'marketstack-Ticker des gewaehlten Listings (von marketstack selbst zurueckgemeldet)';
comment on column public.securities.price_mic      is 'MIC des gewaehlten Listings (XETR/XFRA/... bevorzugt EUR)';
comment on column public.securities.price_currency is 'Waehrung des Listings; EUR bevorzugt, sonst FX in fetch-prices';
comment on column public.securities.figi           is 'FIGI aus OpenFIGI (stabiler Instrument-Anker)';
comment on column public.securities.mapping_source is 'openfigi | marketstack | manual';
comment on column public.securities.mapping_status is 'verified | needs_review | manual | unresolved';

-- Wertebereich absichern
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'securities_mapping_status_chk'
  ) then
    alter table public.securities
      add constraint securities_mapping_status_chk
      check (mapping_status in ('verified','needs_review','manual','unresolved'));
  end if;
end$$;

-- schnelle Filterung "was ist noch offen?"
create index if not exists securities_mapping_status_idx
  on public.securities (user_id, mapping_status);

-- ---------------------------------------------------------------------
-- 2) price_quotes: Kurs-Cache (in EUR, inkl. FX-Herkunft)  (§9.3)
-- ---------------------------------------------------------------------
create table if not exists public.price_quotes (
  user_id      uuid not null references auth.users(id) on delete cascade,
  isin         text not null,
  price        numeric,             -- Kurs in EUR (nach evtl. FX-Umrechnung)
  raw_price    numeric,             -- Originalkurs des Listings vor FX
  raw_currency text,                -- Originalwaehrung (z. B. 'AUD')
  fx_rate      numeric,             -- angewandter Kurs raw_currency->EUR (null wenn EUR)
  as_of        timestamptz,
  source       text,                -- 'marketstack' | 'marketstack+fx'
  updated_at   timestamptz not null default now(),
  primary key (user_id, isin)
);

-- ---------------------------------------------------------------------
-- 3) price_overrides: manueller Kurs (Fallback fuer unaufloesbare Exoten)
-- ---------------------------------------------------------------------
create table if not exists public.price_overrides (
  user_id  uuid not null references auth.users(id) on delete cascade,
  isin     text not null,
  price    numeric not null,        -- in EUR
  as_of    timestamptz not null default now(),
  note     text,
  primary key (user_id, isin)
);

-- ---------------------------------------------------------------------
-- 4) fx_rates: EZB-Wechselkurs-Cache (exchangerate.host)  (§9.2 Fallback)
-- ---------------------------------------------------------------------
create table if not exists public.fx_rates (
  user_id  uuid not null references auth.users(id) on delete cascade,
  pair     text not null,           -- z. B. 'AUD/EUR'
  rate     numeric not null,
  as_of    date not null,
  source   text not null default 'exchangerate.host',
  primary key (user_id, pair)
);

-- ---------------------------------------------------------------------
-- 5) RLS: nur eigene Zeilen (auth.uid() = user_id)
-- ---------------------------------------------------------------------
alter table public.price_quotes    enable row level security;
alter table public.price_overrides enable row level security;
alter table public.fx_rates        enable row level security;

-- price_quotes
drop policy if exists price_quotes_owner on public.price_quotes;
create policy price_quotes_owner on public.price_quotes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- price_overrides
drop policy if exists price_overrides_owner on public.price_overrides;
create policy price_overrides_owner on public.price_overrides
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- fx_rates
drop policy if exists fx_rates_owner on public.fx_rates;
create policy fx_rates_owner on public.fx_rates
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- Ende 003_prices.sql
-- =====================================================================
