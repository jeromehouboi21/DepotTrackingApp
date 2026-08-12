-- =====================================================================
-- 007_owners.sql - E9: mehrere Depotinhaber unter einem User
--
-- owner_id partitioniert alle rechnungsrelevanten Tabellen (FIFO läuft je
-- Inhaber strikt getrennt, E9 §2). securities/brokers/price_quotes/
-- price_overrides/fx_rates bleiben GLOBAL (kein owner_id) - ein Kurs je ISIN
-- gilt für alle Inhaber, keine redundanten Kursabrufe.
--
-- Additiv & rückwärtskompatibel: neue Tabelle + neue Spalten, Backfill auf den
-- Default-Inhaber 'primary' (= die bisherige Ist-Zuordnung, kein Datenverlust).
-- RLS bleibt exakt wie bisher (auth.uid() = user_id) - der Inhaber liegt
-- innerhalb des Auth-Users, keine Policy-Änderung nötig.
--
-- Reihenfolge zwingend: erst depot_owners + Seed, DANN Spalten/Backfill/FKs
-- auf den partitionierten Tabellen - sonst liefe der FK ins Leere.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) depot_owners (analog zu brokers, TEXT-Slug als ID)
-- ---------------------------------------------------------------------
create table if not exists public.depot_owners (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  name       text not null,
  color      text,
  active     boolean not null default true,
  sort_order integer,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.depot_owners enable row level security;
drop policy if exists depot_owners_owner on public.depot_owners;
create policy depot_owners_owner on public.depot_owners
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Default-Inhaber 'primary' je Nutzer mit bestehenden Daten ableiten (Ist-Zuordnung:
-- der gesamte bisherige Ein-Depot-Bestand war das Hauptdepot). Über alle bereits
-- vorhandenen Tabellen vereinigt, nicht nur transactions - falls ein Nutzer z.B.
-- schon manual_cost_lots aber (theoretisch) noch keine transactions hat.
insert into public.depot_owners (user_id, id, name, sort_order)
select distinct user_id, 'primary', 'Hauptdepot', 0 from (
  select user_id from public.transactions
  union select user_id from public.transaction_overrides
  union select user_id from public.manual_cost_lots
  union select user_id from public.transfer_links
  union select user_id from public.warnings
  union select user_id from public.holding_custody
  union select user_id from public.portfolio_seed
  union select user_id from public.import_runs
  union select user_id from public.manual_transactions
) u
on conflict (user_id, id) do nothing;

-- ---------------------------------------------------------------------
-- 2) transactions: PK (user_id, id) -> (user_id, owner_id, id)
-- ---------------------------------------------------------------------
alter table public.transactions add column if not exists owner_id text;
update public.transactions set owner_id = 'primary' where owner_id is null;
alter table public.transactions alter column owner_id set not null;

do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.transactions'::regclass and contype = 'p';
  if c is not null then execute format('alter table public.transactions drop constraint %I', c); end if;
end $$;
alter table public.transactions add primary key (user_id, owner_id, id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_owner_fk') then
    alter table public.transactions
      add constraint transactions_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;

drop index if exists public.transactions_isin_idx;
drop index if exists public.transactions_type_idx;
drop index if exists public.transactions_date_idx;
create index if not exists transactions_owner_isin_idx on public.transactions (user_id, owner_id, isin);
create index if not exists transactions_owner_type_idx on public.transactions (user_id, owner_id, type);
create index if not exists transactions_owner_date_idx on public.transactions (user_id, owner_id, date);

-- ---------------------------------------------------------------------
-- 3) portfolio_seed: PK (user_id, isin) -> (user_id, owner_id, isin)
-- ---------------------------------------------------------------------
alter table public.portfolio_seed add column if not exists owner_id text;
update public.portfolio_seed set owner_id = 'primary' where owner_id is null;
alter table public.portfolio_seed alter column owner_id set not null;

do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.portfolio_seed'::regclass and contype = 'p';
  if c is not null then execute format('alter table public.portfolio_seed drop constraint %I', c); end if;
end $$;
alter table public.portfolio_seed add primary key (user_id, owner_id, isin);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'portfolio_seed_owner_fk') then
    alter table public.portfolio_seed
      add constraint portfolio_seed_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) holding_custody: PK (user_id, isin, broker_id) -> (user_id, owner_id, isin, broker_id)
-- ---------------------------------------------------------------------
alter table public.holding_custody add column if not exists owner_id text;
update public.holding_custody set owner_id = 'primary' where owner_id is null;
alter table public.holding_custody alter column owner_id set not null;

do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.holding_custody'::regclass and contype = 'p';
  if c is not null then execute format('alter table public.holding_custody drop constraint %I', c); end if;
end $$;
alter table public.holding_custody add primary key (user_id, owner_id, isin, broker_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'holding_custody_owner_fk') then
    alter table public.holding_custody
      add constraint holding_custody_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) warnings: UNIQUE (user_id, code, isin, ref) -> + owner_id
-- ---------------------------------------------------------------------
alter table public.warnings add column if not exists owner_id text;
update public.warnings set owner_id = 'primary' where owner_id is null;
alter table public.warnings alter column owner_id set not null;

do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.warnings'::regclass and contype = 'u';
  if c is not null then execute format('alter table public.warnings drop constraint %I', c); end if;
end $$;
alter table public.warnings add constraint warnings_owner_unique unique (user_id, owner_id, code, isin, ref);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'warnings_owner_fk') then
    alter table public.warnings
      add constraint warnings_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6) transaction_overrides: UNIQUE (user_id, transaction_id) -> + owner_id,
--    plus FK auf den neuen transactions-PK (§4.2-Tabelle)
-- ---------------------------------------------------------------------
alter table public.transaction_overrides add column if not exists owner_id text;
update public.transaction_overrides set owner_id = 'primary' where owner_id is null;
alter table public.transaction_overrides alter column owner_id set not null;

do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.transaction_overrides'::regclass and contype = 'u';
  if c is not null then execute format('alter table public.transaction_overrides drop constraint %I', c); end if;
end $$;
alter table public.transaction_overrides
  add constraint transaction_overrides_owner_unique unique (user_id, owner_id, transaction_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transaction_overrides_tx_fk') then
    alter table public.transaction_overrides
      add constraint transaction_overrides_tx_fk
      foreign key (user_id, owner_id, transaction_id)
      references public.transactions (user_id, owner_id, id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7) manual_cost_lots / transfer_links / import_runs / manual_transactions:
--    nur + owner_id-Spalte + FK + Index, kein PK-/UNIQUE-Wechsel (id UUID PK
--    bleibt). manual_transactions ist nicht Teil der urspruenglichen E9-Tabelle
--    (existierte beim Schreiben der Spec noch nicht), gehoert aber in dieselbe
--    Kategorie "rechnungsrelevant" wie manual_cost_lots und wird identisch partitioniert.
-- ---------------------------------------------------------------------
alter table public.manual_cost_lots add column if not exists owner_id text;
update public.manual_cost_lots set owner_id = 'primary' where owner_id is null;
alter table public.manual_cost_lots alter column owner_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'manual_cost_lots_owner_fk') then
    alter table public.manual_cost_lots
      add constraint manual_cost_lots_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;
drop index if exists public.manual_cost_lots_isin_idx;
create index if not exists manual_cost_lots_owner_isin_idx on public.manual_cost_lots (user_id, owner_id, isin);

alter table public.transfer_links add column if not exists owner_id text;
update public.transfer_links set owner_id = 'primary' where owner_id is null;
alter table public.transfer_links alter column owner_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transfer_links_owner_fk') then
    alter table public.transfer_links
      add constraint transfer_links_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;

alter table public.import_runs add column if not exists owner_id text;
update public.import_runs set owner_id = 'primary' where owner_id is null;
alter table public.import_runs alter column owner_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'import_runs_owner_fk') then
    alter table public.import_runs
      add constraint import_runs_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;

alter table public.manual_transactions add column if not exists owner_id text;
update public.manual_transactions set owner_id = 'primary' where owner_id is null;
alter table public.manual_transactions alter column owner_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'manual_transactions_owner_fk') then
    alter table public.manual_transactions
      add constraint manual_transactions_owner_fk
      foreign key (user_id, owner_id) references public.depot_owners (user_id, id);
  end if;
end $$;
drop index if exists public.manual_transactions_isin_idx;
create index if not exists manual_transactions_owner_isin_idx on public.manual_transactions (user_id, owner_id, isin);

-- ---------------------------------------------------------------------
-- securities, brokers, price_quotes, price_overrides, fx_rates bleiben
-- UNVERÄNDERT (global, kein owner_id) - E9 §4.1/§5.
-- ---------------------------------------------------------------------

-- =====================================================================
-- Ende 007_owners.sql
-- =====================================================================
