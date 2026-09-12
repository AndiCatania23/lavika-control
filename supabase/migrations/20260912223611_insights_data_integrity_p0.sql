-- Integrity v1. Preserve raw duplicates and original corrected timestamps.
-- Business definitions: docs/INSIGHTS_INTEGRITY_V1.md.
set local lock_timeout = '5s';

alter table public.content_events add column analytics_duplicate_of uuid;

-- Device has priority: guest->registered promotion must not change playback identity.
-- Missing playback keys are not safely deduplicable and remain individual events.
with ranked as (
  select id, first_value(id) over (
    partition by coalesce('device:' || device_id, 'user:' || user_id::text, 'unattributed:' || id::text),
                 coalesce(episode_id::text, content_id, 'unknown'), metadata->>'playback_session_key'
    order by occurred_at, id
  ) as canonical_id
  from public.content_events
  where event_name = 'view_start' and nullif(metadata->>'playback_session_key', '') is not null
)
update public.content_events e set analytics_duplicate_of = r.canonical_id
from ranked r where e.id = r.id and r.id <> r.canonical_id;

create unique index content_events_video_start_unique on public.content_events (
  (coalesce('device:' || device_id, 'user:' || user_id::text, 'unattributed:' || id::text)),
  (coalesce(episode_id::text, content_id, 'unknown')),
  (metadata->>'playback_session_key')
) where event_name = 'view_start' and nullif(metadata->>'playback_session_key', '') is not null
  and analytics_duplicate_of is null;

create view public.v_insights_events with (security_invoker = true) as
select * from public.content_events where analytics_duplicate_of is null;
revoke all on public.v_insights_events from public, anon, authenticated;
grant select on public.v_insights_events to service_role;

-- Persist only observed days, never generate intermediate days from a span.
create table public.analytics_session_days (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  day date not null,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  primary key (user_id, day),
  check (last_observed_at >= first_observed_at)
);
alter table public.analytics_session_days enable row level security;
revoke all on public.analytics_session_days from public, anon, authenticated;
grant select, insert, update on public.analytics_session_days to service_role;

-- Historical first/last endpoints are evidence, not a full heartbeat history.
insert into public.analytics_session_days
select user_id, (ts at time zone 'Europe/Rome')::date, min(ts), max(ts)
from (
  select user_id, first_seen_at ts from public.user_sessions
  union all select user_id, last_seen_at from public.user_sessions
) s where user_id is not null and ts is not null
group by user_id, (ts at time zone 'Europe/Rome')::date;

update public.user_sessions
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'integrity_v1_original_last_seen_at', last_seen_at,
      'integrity_v1_repaired_at', now()),
    last_seen_at = first_seen_at
where last_seen_at < first_seen_at;

-- BEFORE trigger protects existing clients too. Keep chronological first and monotone last.
create function public.insights_normalize_session() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE' then
    new.first_seen_at := old.first_seen_at;
    if old.metadata ? 'integrity_v1_original_last_seen_at' then
      new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
        'integrity_v1_original_last_seen_at', old.metadata->'integrity_v1_original_last_seen_at',
        'integrity_v1_repaired_at', old.metadata->'integrity_v1_repaired_at');
    end if;
    new.last_seen_at := greatest(old.last_seen_at, new.last_seen_at, new.first_seen_at);
  else
    new.first_seen_at := coalesce(new.first_seen_at, now());
    new.last_seen_at := greatest(coalesce(new.last_seen_at, new.first_seen_at), new.first_seen_at);
  end if;
  return new;
end;
$$;
revoke all on function public.insights_normalize_session() from public, anon, authenticated;
create trigger insights_normalize_session before insert or update on public.user_sessions
for each row execute function public.insights_normalize_session();
alter table public.user_sessions add constraint user_sessions_nonnegative_duration
check (last_seen_at >= first_seen_at);

create function public.insights_observe_session_day() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.user_id is not null then
    insert into public.analytics_session_days (user_id, day, first_observed_at, last_observed_at)
    values (new.user_id, (new.last_seen_at at time zone 'Europe/Rome')::date, new.last_seen_at, new.last_seen_at)
    on conflict (user_id, day) do update set
      first_observed_at = least(analytics_session_days.first_observed_at, excluded.first_observed_at),
      last_observed_at = greatest(analytics_session_days.last_observed_at, excluded.last_observed_at);
  end if;
  return new;
end;
$$;
revoke all on function public.insights_observe_session_day() from public, anon, authenticated;
create trigger insights_observe_session_day after insert or update of last_seen_at, user_id on public.user_sessions
for each row execute function public.insights_observe_session_day();

create view public.v_insights_app_days with (security_invoker = true) as
select user_id, day from public.analytics_session_days
union
select user_id, (occurred_at at time zone 'Europe/Rome')::date
from public.v_insights_events where user_id is not null and occurred_at <= now();
revoke all on public.v_insights_app_days from public, anon, authenticated;
grant select on public.v_insights_app_days to service_role;

create or replace view public.v_insights_kpi_windows with (security_invoker = true) as
 WITH activity AS (
         SELECT content_events.occurred_at AS ts,
            COALESCE((content_events.user_id)::text, content_events.device_id) AS actor
           FROM public.v_insights_events content_events
          WHERE ((content_events.occurred_at >= (now() - '30 days'::interval)) AND ((content_events.user_id IS NOT NULL) OR (content_events.device_id IS NOT NULL)))
        UNION ALL
         SELECT user_sessions.last_seen_at AS ts,
            COALESCE((user_sessions.user_id)::text, user_sessions.device_id) AS actor
           FROM public.user_sessions
          WHERE ((user_sessions.last_seen_at >= (now() - '30 days'::interval)) AND ((user_sessions.user_id IS NOT NULL) OR (user_sessions.device_id IS NOT NULL)))
        ), w AS (
         SELECT count(DISTINCT activity.actor) FILTER (WHERE (((activity.ts AT TIME ZONE 'Europe/Rome'::text))::date = ((now() AT TIME ZONE 'Europe/Rome'::text))::date)) AS dau,
            count(DISTINCT activity.actor) FILTER (WHERE (activity.ts >= (now() - '7 days'::interval))) AS wau,
            count(DISTINCT activity.actor) AS mau
           FROM activity
        ), s AS (
         SELECT round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY (((EXTRACT(epoch FROM (user_sessions.last_seen_at - user_sessions.first_seen_at)) / 60.0))::double precision)))::numeric, 1) AS session_median_min,
            count(*) AS session_sample
           FROM public.user_sessions
          WHERE ((user_sessions.first_seen_at >= (now() - '30 days'::interval)) AND (user_sessions.last_seen_at >= user_sessions.first_seen_at))
        )
 SELECT w.dau,
    w.wau,
    w.mau,
    s.session_median_min,
    s.session_sample
   FROM w,
    s;

create or replace view public.v_insights_next_day_return with (security_invoker = true) as
 WITH daily AS (
         SELECT DISTINCT (date_trunc('day'::text, (content_events.occurred_at AT TIME ZONE 'Europe/Rome'::text)))::date AS day,
            COALESCE((content_events.user_id)::text, content_events.device_id) AS actor
           FROM public.v_insights_events content_events
          WHERE ((content_events.occurred_at >= (now() - '40 days'::interval)) AND ((content_events.user_id IS NOT NULL) OR (content_events.device_id IS NOT NULL)))
        UNION
         SELECT DISTINCT (date_trunc('day'::text, (user_sessions.last_seen_at AT TIME ZONE 'Europe/Rome'::text)))::date AS date_trunc,
            COALESCE((user_sessions.user_id)::text, user_sessions.device_id) AS "coalesce"
           FROM public.user_sessions
          WHERE ((user_sessions.last_seen_at >= (now() - '40 days'::interval)) AND ((user_sessions.user_id IS NOT NULL) OR (user_sessions.device_id IS NOT NULL)))
        )
 SELECT round((((count(*) FILTER (WHERE (d2.actor IS NOT NULL)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 1) AS next_day_return_pct,
    count(*) AS active_user_days
   FROM (daily d1
     LEFT JOIN daily d2 ON (((d2.actor = d1.actor) AND (d2.day = (d1.day + 1)))))
  WHERE ((d1.day >= (((now() AT TIME ZONE 'Europe/Rome'::text))::date - 30)) AND (d1.day < ((now() AT TIME ZONE 'Europe/Rome'::text))::date));

create or replace view public.v_insights_active_users_daily with (security_invoker = true) as
 WITH activity AS (
         SELECT (date_trunc('day'::text, (content_events.occurred_at AT TIME ZONE 'Europe/Rome'::text)))::date AS day,
            content_events.user_id,
            content_events.device_id
           FROM public.v_insights_events content_events
          WHERE ((content_events.occurred_at >= (now() - '60 days'::interval)) AND ((content_events.user_id IS NOT NULL) OR (content_events.device_id IS NOT NULL)))
        UNION ALL
         SELECT (date_trunc('day'::text, (user_sessions.last_seen_at AT TIME ZONE 'Europe/Rome'::text)))::date AS day,
            user_sessions.user_id,
            user_sessions.device_id
           FROM public.user_sessions
          WHERE ((user_sessions.last_seen_at >= (now() - '60 days'::interval)) AND ((user_sessions.user_id IS NOT NULL) OR (user_sessions.device_id IS NOT NULL)))
        )
 SELECT day,
    count(DISTINCT user_id) FILTER (WHERE (user_id IS NOT NULL)) AS dau_registered,
    count(DISTINCT device_id) FILTER (WHERE ((user_id IS NULL) AND (device_id IS NOT NULL))) AS dau_guest,
    count(DISTINCT COALESCE((user_id)::text, device_id)) AS dau_total
   FROM activity
  GROUP BY day
  ORDER BY day DESC;

create or replace view public.v_insights_guest_vs_registered with (security_invoker = true) as
 SELECT '24h'::text AS "window",
    count(DISTINCT content_events.user_id) FILTER (WHERE (content_events.user_id IS NOT NULL)) AS registered_users,
    count(DISTINCT content_events.device_id) FILTER (WHERE ((content_events.user_id IS NULL) AND (content_events.device_id IS NOT NULL))) AS guest_devices,
    count(*) FILTER (WHERE (content_events.event_name = 'view_start'::text)) AS view_starts
   FROM public.v_insights_events content_events
  WHERE (content_events.occurred_at >= (now() - '24:00:00'::interval))
UNION ALL
 SELECT '7d'::text AS "window",
    count(DISTINCT content_events.user_id) FILTER (WHERE (content_events.user_id IS NOT NULL)) AS registered_users,
    count(DISTINCT content_events.device_id) FILTER (WHERE ((content_events.user_id IS NULL) AND (content_events.device_id IS NOT NULL))) AS guest_devices,
    count(*) FILTER (WHERE (content_events.event_name = 'view_start'::text)) AS view_starts
   FROM public.v_insights_events content_events
  WHERE (content_events.occurred_at >= (now() - '7 days'::interval))
UNION ALL
 SELECT '30d'::text AS "window",
    count(DISTINCT content_events.user_id) FILTER (WHERE (content_events.user_id IS NOT NULL)) AS registered_users,
    count(DISTINCT content_events.device_id) FILTER (WHERE ((content_events.user_id IS NULL) AND (content_events.device_id IS NOT NULL))) AS guest_devices,
    count(*) FILTER (WHERE (content_events.event_name = 'view_start'::text)) AS view_starts
   FROM public.v_insights_events content_events
  WHERE (content_events.occurred_at >= (now() - '30 days'::interval));

create or replace view public.v_insights_core_actions with (security_invoker = true) as
 SELECT ce.user_id,
    ce.occurred_at,
    ce.content_type AS feature,
    ce.content_id,
    ce.session_key
   FROM public.v_insights_events ce
  WHERE ((ce.event_name = 'core_action'::text) AND (ce.user_id IS NOT NULL) AND (ce.content_type = ANY (ARRAY['pill'::text, 'match'::text, 'prediction'::text])))
UNION ALL
 SELECT ce.user_id,
    ce.occurred_at,
    'video'::text AS feature,
    COALESCE(ce.content_id, (ce.episode_id)::text) AS content_id,
    ce.session_key
   FROM public.v_insights_events ce
  WHERE ((ce.event_name = 'view_start'::text) AND (ce.user_id IS NOT NULL));

create or replace view public.v_insights_complete_activation_by_feature with (security_invoker = true) as
 WITH settings AS (
         SELECT '2026-08-22 20:41:06+00'::timestamp with time zone AS tracking_started_at
        ), features(feature, sort_order) AS (
         VALUES ('pill'::text,1), ('match'::text,2), ('video'::text,3), ('prediction'::text,4)
        ), eligible_profiles AS (
         SELECT p.id,
            p.created_at
           FROM (settings s
             JOIN user_profiles p ON ((p.created_at >= s.tracking_started_at)))
        ), activation AS (
         SELECT p.id AS user_id,
            p.created_at AS signup_at,
            a_1.feature,
            min(a_1.occurred_at) AS activated_at
           FROM (eligible_profiles p
             JOIN v_insights_core_actions a_1 ON (((a_1.user_id = p.id) AND (a_1.occurred_at >= p.created_at) AND (((a_1.occurred_at AT TIME ZONE 'Europe/Rome'::text))::date = ((p.created_at AT TIME ZONE 'Europe/Rome'::text))::date))))
          GROUP BY p.id, p.created_at, a_1.feature
        ), signup_total AS (
         SELECT (count(*))::integer AS total
           FROM eligible_profiles
        )
 SELECT f.feature,
    f.sort_order AS feature_order,
    st.total AS signup_users,
    (count(a.user_id))::integer AS activated_users,
    (count(a.user_id) FILTER (WHERE (((now() AT TIME ZONE 'Europe/Rome'::text))::date > (((a.signup_at AT TIME ZONE 'Europe/Rome'::text))::date + 1))))::integer AS d1_eligible,
    (count(a.user_id) FILTER (WHERE ((((now() AT TIME ZONE 'Europe/Rome'::text))::date > (((a.signup_at AT TIME ZONE 'Europe/Rome'::text))::date + 1)) AND (EXISTS ( SELECT 1
           FROM v_insights_core_actions r
          WHERE ((r.user_id = a.user_id) AND (r.feature = a.feature) AND (((r.occurred_at AT TIME ZONE 'Europe/Rome'::text))::date = (((a.signup_at AT TIME ZONE 'Europe/Rome'::text))::date + 1))))))))::integer AS d1_returned,
    (count(a.user_id) FILTER (WHERE (((now() AT TIME ZONE 'Europe/Rome'::text))::date > (((a.signup_at AT TIME ZONE 'Europe/Rome'::text))::date + 7))))::integer AS d7_eligible,
    (count(a.user_id) FILTER (WHERE ((((now() AT TIME ZONE 'Europe/Rome'::text))::date > (((a.signup_at AT TIME ZONE 'Europe/Rome'::text))::date + 7)) AND (EXISTS ( SELECT 1
           FROM v_insights_core_actions r
          WHERE ((r.user_id = a.user_id) AND (r.feature = a.feature) AND (((r.occurred_at AT TIME ZONE 'Europe/Rome'::text))::date = (((a.signup_at AT TIME ZONE 'Europe/Rome'::text))::date + 7))))))))::integer AS d7_returned
   FROM ((features f
     CROSS JOIN signup_total st)
     LEFT JOIN activation a ON ((a.feature = f.feature)))
  GROUP BY f.feature, f.sort_order, st.total;

-- Separate app, core and bounded cumulative return; per-user diagnostic is queryable.
create view public.v_insights_retention_users_v1 with (security_invoker = true) as
select p.id user_id, p.created_at,
       (p.created_at at time zone 'Europe/Rome')::date signup_day,
       date_trunc('week', p.created_at at time zone 'Europe/Rome')::date cohort_week,
       (now() at time zone 'Europe/Rome')::date > (p.created_at at time zone 'Europe/Rome')::date + 7 d7_eligible,
       exists (select 1 from public.v_insights_app_days a where a.user_id=p.id
         and a.day=(p.created_at at time zone 'Europe/Rome')::date+7) d7_app_return,
       exists (select 1 from public.v_insights_core_actions a where a.user_id=p.id
         and (a.occurred_at at time zone 'Europe/Rome')::date=(p.created_at at time zone 'Europe/Rome')::date+7) d7_core_action,
       exists (select 1 from public.v_insights_app_days a where a.user_id=p.id
         and a.day between (p.created_at at time zone 'Europe/Rome')::date+1
                       and (p.created_at at time zone 'Europe/Rome')::date+7) returned_d1_d7_app,
       exists (select 1 from public.v_insights_core_actions a where a.user_id=p.id
         and (a.occurred_at at time zone 'Europe/Rome')::date between (p.created_at at time zone 'Europe/Rome')::date+1
                       and (p.created_at at time zone 'Europe/Rome')::date+7) returned_d1_d7_core
from public.user_profiles p where p.created_at >= '2026-08-22 20:41:06+00'::timestamptz;

create view public.v_insights_retention_summary_v1 with (security_invoker = true) as
select count(*) filter (where d7_eligible)::integer d7_eligible,
       count(*) filter (where d7_eligible and d7_app_return)::integer d7_app_returned,
       count(*) filter (where d7_eligible and d7_core_action)::integer d7_core_returned,
       count(*) filter (where d7_eligible and returned_d1_d7_app)::integer returned_d1_d7_app,
       count(*) filter (where d7_eligible and returned_d1_d7_core)::integer returned_d1_d7_core
from public.v_insights_retention_users_v1;
revoke all on public.v_insights_retention_users_v1, public.v_insights_retention_summary_v1 from public, anon, authenticated;
grant select on public.v_insights_retention_users_v1, public.v_insights_retention_summary_v1 to service_role;

create table public.analytics_measurement_versions (
  version text primary key,
  installed_at timestamptz not null default now(),
  certified_at timestamptz,
  contract text not null,
  check (certified_at is null or certified_at >= installed_at)
);
alter table public.analytics_measurement_versions enable row level security;
revoke all on public.analytics_measurement_versions from public, anon, authenticated;
grant select on public.analytics_measurement_versions to service_role;
insert into public.analytics_measurement_versions (version,contract)
values ('insights_integrity_v1','docs/INSIGHTS_INTEGRITY_V1.md');

-- New baseline is disjoint from the historical signup cohorts; empty until certification.
create view public.v_insights_baseline_v1 with (security_invoker = true) as
with version as (
  select certified_at from public.analytics_measurement_versions where version='insights_integrity_v1'
), signups as (
  select r.* from public.v_insights_retention_users_v1 r cross join version v
  where r.created_at >= v.certified_at and r.created_at <= now()
), activity as (
  select e.user_id, e.occurred_at ts from public.v_insights_events e
  where e.user_id is not null
  union all
  select user_id, last_observed_at from public.analytics_session_days
), usage as (
  select count(distinct user_id) filter(where ts >= now()-interval '168 hours')::integer wau,
         count(distinct user_id)::integer mau
  from activity cross join version v
  where ts >= v.certified_at and ts >= now()-interval '720 hours' and ts <= now()
)
select v.certified_at,
       (select count(*)::integer from signups) acquired,
       (select count(*)::integer from signups s where s.signup_day < (now() at time zone 'Europe/Rome')::date) activation_eligible,
       (select count(*)::integer from signups s where s.signup_day < (now() at time zone 'Europe/Rome')::date and exists (
          select 1 from public.v_insights_core_actions a where a.user_id=s.user_id and a.occurred_at>=s.created_at
          and (a.occurred_at at time zone 'Europe/Rome')::date=s.signup_day)) activated_d0,
       (select count(*)::integer from signups where d7_eligible) w1_eligible,
       (select count(*)::integer from signups where d7_eligible and returned_d1_d7_app) w1_returned,
       u.wau, u.mau,
       v.certified_at is not null and now() >= v.certified_at+interval '720 hours' windows_complete
from version v cross join usage u;
revoke all on public.v_insights_baseline_v1 from public, anon, authenticated;
grant select on public.v_insights_baseline_v1 to service_role;
