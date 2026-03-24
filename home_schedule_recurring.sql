-- Home schedule recurring support (DEV)
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.home_schedule_series (
  id uuid primary key default gen_random_uuid(),
  format_id text not null references public.content_formats(id),
  label text null,
  access text not null default 'bronze' check (access in ('bronze', 'silver', 'gold')),
  cover_override_url text null,
  timezone text not null default 'Europe/Rome',
  dtstart_local timestamp without time zone not null,
  rrule text not null,
  until_local timestamp without time zone null,
  max_occurrences integer null check (max_occurrences > 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_schedule_series_exceptions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.home_schedule_series(id) on delete cascade,
  occurrence_local timestamp without time zone not null,
  action text not null check (action in ('skip', 'override')),
  override_start_local timestamp without time zone null,
  override_label text null,
  override_access text null check (override_access in ('bronze', 'silver', 'gold')),
  override_cover_override_url text null,
  created_at timestamptz not null default now(),
  unique(series_id, occurrence_local)
);

alter table public.home_schedule_cards
  add column if not exists source_type text not null default 'manual' check (source_type in ('manual', 'series'));

alter table public.home_schedule_cards
  add column if not exists series_id uuid null references public.home_schedule_series(id) on delete set null;

alter table public.home_schedule_cards
  add column if not exists occurrence_key text null;

create unique index if not exists home_schedule_cards_occurrence_key_uidx
  on public.home_schedule_cards (occurrence_key)
  where occurrence_key is not null;

create index if not exists home_schedule_cards_start_idx
  on public.home_schedule_cards (start_at, status, is_active);

create index if not exists home_schedule_cards_format_start_idx
  on public.home_schedule_cards (format_id, start_at);

create index if not exists home_schedule_series_active_idx
  on public.home_schedule_series (status, is_active);

create index if not exists home_schedule_series_dtstart_idx
  on public.home_schedule_series (dtstart_local);

create index if not exists home_schedule_series_exceptions_series_occ_idx
  on public.home_schedule_series_exceptions (series_id, occurrence_local);
