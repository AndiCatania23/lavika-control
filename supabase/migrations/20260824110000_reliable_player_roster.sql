-- Reliable, provenance-first player roster.
-- Additive by design: existing players and content_episodes.speaker_id remain untouched.

alter table public.players
  add column if not exists birth_date date,
  add column if not exists weight_kg smallint check (weight_kg is null or weight_kg between 40 and 150);

create table if not exists public.roster_sync_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  competition_season_id uuid references public.competition_seasons(id) on delete restrict,
  provider text not null,
  status text not null default 'running'
    check (status in ('running', 'validated', 'published', 'rejected', 'failed')),
  observed_players integer not null default 0 check (observed_players >= 0),
  published_players integer not null default 0 check (published_players >= 0),
  anomaly_count integer not null default 0 check (anomaly_count >= 0),
  source_reference text,
  response_hash text,
  diagnostics jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_roster_sync_runs_team_started
  on public.roster_sync_runs (team_id, started_at desc);

create table if not exists public.player_external_ids (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  provider text not null,
  external_id text not null,
  confidence numeric(4,3) not null default 0.700
    check (confidence between 0 and 1),
  is_verified boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  unique (player_id, provider)
);

create index if not exists idx_player_external_ids_player
  on public.player_external_ids (player_id);

create table if not exists public.player_team_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  competition_season_id uuid not null references public.competition_seasons(id) on delete restrict,
  membership_status text not null default 'provisional'
    check (membership_status in ('provisional', 'confirmed', 'loan', 'departed', 'unknown')),
  is_current boolean not null default true,
  is_published boolean not null default false,
  joined_at date,
  left_at date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  consecutive_misses integer not null default 0 check (consecutive_misses >= 0),
  verified_source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, team_id, competition_season_id)
);

create index if not exists idx_player_memberships_current_team
  on public.player_team_memberships (team_id, competition_season_id, player_id)
  where is_current = true and is_published = true;

create table if not exists public.player_data_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_type text not null,
  source_reference text not null,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  payload_hash text,
  raw_payload jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, source_reference, payload_hash)
);

alter table public.player_team_memberships
  add constraint player_team_memberships_verified_source_fkey
  foreign key (verified_source_id) references public.player_data_sources(id) on delete set null;

create table if not exists public.player_source_assertions (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete restrict,
  competition_season_id uuid references public.competition_seasons(id) on delete restrict,
  source_id uuid not null references public.player_data_sources(id) on delete restrict,
  sync_run_id uuid references public.roster_sync_runs(id) on delete set null,
  field_name text not null,
  proposed_value jsonb not null,
  authority_rank smallint not null default 50 check (authority_rank between 0 and 100),
  confidence numeric(4,3) not null default 0.500 check (confidence between 0 and 1),
  assertion_status text not null default 'observed'
    check (assertion_status in ('observed', 'accepted', 'conflict', 'rejected', 'superseded')),
  observed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, source_id, field_name)
);

create index if not exists idx_player_assertions_resolution
  on public.player_source_assertions
    (player_id, field_name, assertion_status, authority_rank desc, confidence desc, observed_at desc);

create table if not exists public.player_editorial_overrides (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete restrict,
  competition_season_id uuid references public.competition_seasons(id) on delete restrict,
  field_name text not null,
  override_value jsonb not null,
  reason text not null,
  source_reference text,
  is_active boolean not null default true,
  locked_against_sync boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_player_active_override_scope
  on public.player_editorial_overrides
    (player_id, coalesce(team_id::text, ''), coalesce(competition_season_id::text, ''), field_name)
  where is_active = true;

alter table public.player_editorial_overrides
  add constraint player_editorial_overrides_player_team_season_field_key
  unique (player_id, team_id, competition_season_id, field_name);

create index if not exists idx_player_overrides_active
  on public.player_editorial_overrides (player_id, field_name)
  where is_active = true;

create table if not exists public.player_squad_numbers (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  competition_season_id uuid not null references public.competition_seasons(id) on delete restrict,
  shirt_number smallint not null check (shirt_number between 1 and 999),
  verification_status text not null default 'observed'
    check (verification_status in ('observed', 'verified', 'conflict', 'rejected')),
  authority_rank smallint not null default 50 check (authority_rank between 0 and 100),
  source_id uuid references public.player_data_sources(id) on delete set null,
  valid_from date,
  valid_until date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_player_current_squad_number_source
  on public.player_squad_numbers
    (player_id, team_id, competition_season_id, coalesce(source_id::text, ''))
  where is_current = true;

alter table public.player_squad_numbers
  add constraint player_squad_numbers_player_team_season_source_key
  unique (player_id, team_id, competition_season_id, source_id);

create index if not exists idx_player_squad_numbers_resolve
  on public.player_squad_numbers
    (player_id, team_id, competition_season_id, verification_status, authority_rank desc, updated_at desc)
  where is_current = true;

create table if not exists public.player_match_statistics (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  competition_season_id uuid not null references public.competition_seasons(id) on delete restrict,
  source_id uuid references public.player_data_sources(id) on delete set null,
  started boolean,
  entered_minute smallint,
  exited_minute smallint,
  minutes_played smallint check (minutes_played between 0 and 180),
  goals smallint check (goals is null or goals >= 0),
  assists smallint check (assists is null or assists >= 0),
  yellow_cards smallint check (yellow_cards is null or yellow_cards >= 0),
  red_cards smallint check (red_cards is null or red_cards >= 0),
  goals_conceded smallint check (goals_conceded is null or goals_conceded >= 0),
  clean_sheet boolean,
  basic_stats jsonb not null default '{}'::jsonb,
  advanced_stats jsonb,
  completeness text not null default 'partial'
    check (completeness in ('partial', 'basic_complete', 'complete')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, match_id, team_id)
);

create index if not exists idx_player_match_stats_season_rollup
  on public.player_match_statistics (competition_season_id, team_id, player_id, match_id);

create or replace view public.player_season_basic_statistics
with (security_invoker = true)
as
select
  player_id,
  team_id,
  competition_season_id,
  count(*) filter (where completeness in ('basic_complete', 'complete'))::integer as appearances,
  count(*) filter (where started = true and completeness in ('basic_complete', 'complete'))::integer as starts,
  sum(minutes_played) filter (where completeness in ('basic_complete', 'complete'))::integer as minutes_played,
  sum(goals) filter (where completeness in ('basic_complete', 'complete'))::integer as goals,
  sum(assists) filter (where completeness in ('basic_complete', 'complete'))::integer as assists,
  sum(yellow_cards) filter (where completeness in ('basic_complete', 'complete'))::integer as yellow_cards,
  sum(red_cards) filter (where completeness in ('basic_complete', 'complete'))::integer as red_cards,
  sum(goals_conceded) filter (where completeness in ('basic_complete', 'complete'))::integer as goals_conceded,
  count(*) filter (where clean_sheet = true and completeness in ('basic_complete', 'complete'))::integer as clean_sheets,
  count(*) filter (where completeness = 'complete')::integer as advanced_complete_matches,
  max(updated_at) as updated_at
from public.player_match_statistics
group by player_id, team_id, competition_season_id;

create or replace view public.published_player_roster
with (security_invoker = true)
as
select
  p.*,
  m.competition_season_id,
  m.membership_status,
  m.is_current as roster_is_current,
  m.last_seen_at as roster_last_seen_at,
  resolved_number.shirt_number as resolved_shirt_number,
  resolved_number.verification_status as shirt_number_verification_status,
  m.team_id as roster_team_id
from public.players p
join public.player_team_memberships m
  on m.player_id = p.id
 and m.is_current = true
 and m.is_published = true
left join lateral (
  select n.shirt_number, n.verification_status
  from public.player_squad_numbers n
  where n.player_id = p.id
    and n.team_id = m.team_id
    and n.competition_season_id = m.competition_season_id
    and n.is_current = true
    and n.verification_status in ('verified', 'observed')
  order by
    case n.verification_status when 'verified' then 0 else 1 end,
    n.authority_rank desc,
    n.updated_at desc
  limit 1
) resolved_number on true;

alter table public.roster_sync_runs enable row level security;
alter table public.player_external_ids enable row level security;
alter table public.player_team_memberships enable row level security;
alter table public.player_data_sources enable row level security;
alter table public.player_source_assertions enable row level security;
alter table public.player_editorial_overrides enable row level security;
alter table public.player_squad_numbers enable row level security;
alter table public.player_match_statistics enable row level security;

comment on view public.published_player_roster is
  'Only roster memberships explicitly approved for publication. Provider observations never become public merely by being fetched.';
