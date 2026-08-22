-- Stato verificabile delle pipeline Social. Additiva: nessuna tabella esistente
-- viene modificata e nessuna pubblicazione viene automatizzata.
create table if not exists public.social_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline text not null,
  task text not null,
  provider text not null,
  status text not null check (status in ('running', 'success', 'partial', 'error')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_written integer not null default 0 check (records_written >= 0),
  partial_errors jsonb not null default '[]'::jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists social_pipeline_runs_latest_idx
  on public.social_pipeline_runs (pipeline, task, started_at desc);

create index if not exists social_pipeline_runs_status_idx
  on public.social_pipeline_runs (status, started_at desc);

alter table public.social_pipeline_runs enable row level security;

revoke all on public.social_pipeline_runs from anon, authenticated;
grant select, insert, update on public.social_pipeline_runs to service_role;

comment on table public.social_pipeline_runs is
  'Audit append-only delle esecuzioni Social/Meta/AI usato per freshness e provider status.';
