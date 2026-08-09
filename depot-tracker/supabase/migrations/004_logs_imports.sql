-- =====================================================================
-- 004_logs_imports.sql - Betrieb: app_logs, import_runs
-- =====================================================================

create table if not exists public.app_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  level      text not null default 'info',
  message    text not null,
  context    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_logs_created_idx on public.app_logs (user_id, created_at desc);

create table if not exists public.import_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  generated_at timestamptz,
  summary      jsonb,
  counts       jsonb,
  created_at   timestamptz not null default now()
);

alter table public.app_logs    enable row level security;
alter table public.import_runs enable row level security;

drop policy if exists app_logs_owner on public.app_logs;
create policy app_logs_owner on public.app_logs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists import_runs_owner on public.import_runs;
create policy import_runs_owner on public.import_runs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
