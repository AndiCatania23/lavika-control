-- Comics is independent of pills/video publishing. Only Control writes.
create table public.comics_assets (
 id uuid primary key default gen_random_uuid(),
 series integer not null check (series between 1 and 999),
 episode_number integer not null check (episode_number between 0 and 99999),
 original_key text not null unique check (original_key like 'comics/%'),
 preview_key text not null unique check (preview_key like 'comics/%'),
 image_url text not null check (image_url like 'https://%'),
 preview_url text not null check (preview_url like 'https://%'),
 width integer not null check (width between 1 and 25000),
 height integer not null check (height between 1 and 25000),
 byte_size integer not null check (byte_size > 0),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
create table public.comics_episodes (
 id uuid primary key default gen_random_uuid(),
 series integer not null default 1 check (series between 1 and 999),
 episode_number integer not null check (episode_number between 0 and 99999),
 episode_date date not null,
 title text not null default '' check (length(title) <= 160),
 caption text not null default '' check (length(caption) <= 5000),
 match_reference text not null default '' check (length(match_reference) <= 200),
 status text not null default 'draft' check (status in ('draft','beta','published')),
 asset_id uuid not null references public.comics_assets(id),
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(series,episode_number)
);
create index comics_episodes_feed on public.comics_episodes(status,series desc,episode_number desc);
create index comics_episodes_asset on public.comics_episodes(asset_id);
create function public.comics_check_episode() returns trigger
language plpgsql set search_path = '' as $$
begin
 if not exists (select 1 from public.comics_assets a where a.id=new.asset_id and a.series=new.series and a.episode_number=new.episode_number) then
  raise exception 'Asset does not belong to this episode';
 end if;
 if TG_OP='UPDATE' then
  if new.series<>old.series or new.episode_number<>old.episode_number then
   raise exception 'Series and episode number are immutable';
  end if;
  new.revision := old.revision+1;
  new.updated_at := now();
 end if;
 return new;
end;
$$;
revoke all on function public.comics_check_episode() from public,anon,authenticated;
create trigger comics_episode_validate before insert or update on public.comics_episodes for each row execute function public.comics_check_episode();
alter table public.comics_assets enable row level security;
alter table public.comics_episodes enable row level security;
revoke all on public.comics_assets,public.comics_episodes from anon,authenticated;
grant select on public.comics_assets,public.comics_episodes to anon,authenticated;
grant all on public.comics_assets,public.comics_episodes to service_role;
create policy comics_published_episodes on public.comics_episodes for select to anon,authenticated using (status='published');
create policy comics_published_assets on public.comics_assets for select to anon,authenticated using (exists(select 1 from public.comics_episodes e where e.asset_id=comics_assets.id and e.status='published'));
