-- =====================================================================
-- 006_manual_transactions.sql - vom Nutzer nachgetragene Transaktionen
-- Additive Korrektur (E2). Rohdaten in public.transactions bleiben unberührt.
-- =====================================================================
create table if not exists public.manual_transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  isin                  text not null,
  date                  date not null,
  type                  text not null default 'SELL'
                        check (type in ('BUY','SELL','TRANSFER_OUT')),
  shares                numeric not null,
  price                 numeric,
  gross                 numeric,
  fees                  numeric not null default 0,
  tax                   numeric not null default 0,
  net                   numeric not null,     -- Erlös bei SELL (positiv), Aufwand bei BUY (negativ)
  currency              text not null default 'EUR',
  reported_realized_pl  numeric,              -- optional; wenn gesetzt, maßgeblich (E1)
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists manual_transactions_isin_idx
  on public.manual_transactions (user_id, isin);

alter table public.manual_transactions enable row level security;
drop policy if exists manual_transactions_owner on public.manual_transactions;
create policy manual_transactions_owner on public.manual_transactions
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
