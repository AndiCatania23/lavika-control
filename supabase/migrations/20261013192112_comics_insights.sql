-- LOCAL DRAFT: never applied to production. Comics openings are isolated from all canonical analytics.
set local lock_timeout = '5s';
insert into public.analytics_measurement_versions(version,contract)
values ('comics_openings_v1','docs/COMICS_INSIGHTS.md') on conflict(version) do nothing;

create table if not exists public.comics_openings (
 opening_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 episode_id uuid not null references public.comics_episodes(id) on delete cascade,
 occurred_at timestamptz not null default now(),
 primary key(user_id,opening_id)
);
create index if not exists comics_openings_episode_time on public.comics_openings(episode_id,occurred_at);
create index if not exists comics_openings_time on public.comics_openings(occurred_at);
alter table public.comics_openings enable row level security;
revoke all on public.comics_openings from public,anon,authenticated,service_role;
do $$ begin
 if exists(select 1 from pg_roles where rolname='atlas_reader') then
  execute 'revoke all on public.comics_openings from atlas_reader';
 end if;
end $$;
grant select,insert on public.comics_openings to service_role;

create or replace function public.record_comics_opening(p_user uuid,p_opening uuid,p_episode uuid) returns void
language sql security invoker set search_path='' as $$
 insert into public.comics_openings(user_id,opening_id,episode_id)
 select p_user,p_opening,p_episode where exists(
  select 1 from public.comics_episodes where id=p_episode and status='published'
 ) on conflict(user_id,opening_id) do nothing;
$$;
revoke all on function public.record_comics_opening(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_comics_opening(uuid,uuid,uuid) to service_role;

create or replace function public.comics_insights() returns jsonb language sql stable security invoker set search_path='' as $$
 with baseline as (
  select installed_at started_at from public.analytics_measurement_versions where version='comics_openings_v1'
 ), catalog as (
  select id,series,episode_number,coalesce(nullif(title,''),nullif(match_reference,''),'Episodio '||episode_number) title
  from public.comics_episodes c where status='published' or exists(select 1 from public.comics_openings o where o.episode_id=c.id)
 ), dimensions as (
  select 'total'::text kind,null::uuid episode_id,null::integer series,null::integer episode_number,'LAVIKA Comics'::text title
  union all select distinct 'series'::text,null::uuid,series,null::integer,null::text from catalog
  union all select 'card',id,series,episode_number,title from catalog
 ), counts as (
  select c.id,c.series,count(*) opens,count(distinct o.user_id) unique_users,
    grouping(c.id) gid,grouping(c.series) gs
  from public.comics_openings o join catalog c on c.id=o.episode_id
  where o.occurred_at >= (select started_at from baseline) and o.occurred_at<=now()
  group by grouping sets ((),(c.series),(c.id,c.series))
 ), metrics as (
  select d.*,coalesce(n.opens,0) opens,coalesce(n.unique_users,0) unique_users
  from dimensions d left join counts n on
   (d.kind='total' and n.gid=1 and n.gs=1) or
   (d.kind='series' and n.gid=1 and n.gs=0 and n.series=d.series) or
   (d.kind='card' and n.gid=0 and n.id=d.episode_id)
 ), days as (
  select gs.ts::date as day from baseline,
  lateral generate_series(greatest((started_at at time zone 'Europe/Rome')::date,(now() at time zone 'Europe/Rome')::date-29)::timestamp,
    (now() at time zone 'Europe/Rome')::date::timestamp,interval '1 day') as gs(ts)
 ), daily_counts as (
  select (o.occurred_at at time zone 'Europe/Rome')::date as day,c.series,count(*) opens
  from public.comics_openings o join catalog c on c.id=o.episode_id
  where o.occurred_at >= greatest((select started_at from baseline),(((now() at time zone 'Europe/Rome')::date-29)::timestamp at time zone 'Europe/Rome')) and o.occurred_at<=now()
  group by 1,2
 ), daily as (
  select d.day,s.series,coalesce(n.opens,0) opens from days d cross join (select distinct series from catalog) s
  left join daily_counts n on n.day=d.day and n.series=s.series
 )
 select jsonb_build_object(
  'startedAt',(select started_at from baseline),'generatedAt',now(),
  'rows',coalesce((select jsonb_agg(to_jsonb(m) order by kind,series,episode_number desc) from metrics m),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day,series) from daily d),'[]'::jsonb)
 );
$$;
revoke all on function public.comics_insights() from public,anon,authenticated,service_role;
grant execute on function public.comics_insights() to service_role;
