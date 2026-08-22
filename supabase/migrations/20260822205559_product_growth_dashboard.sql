-- Product & Growth aggregates based only on the complete telemetry era.
-- App deploy 203f1bb became active at 2026-08-22 20:41:06 UTC.

create or replace view public.v_insights_core_usage_windows
with (security_invoker = true)
as
  with settings as (
    select '2026-08-22 20:41:06+00'::timestamptz as tracking_started_at
  ), windows(window_key, window_label, span, sort_order) as (
    values
      ('24h'::text, '24 ore'::text, interval '24 hours', 1),
      ('7d'::text, '7 giorni'::text, interval '7 days', 2),
      ('30d'::text, '30 giorni'::text, interval '30 days', 3)
  ), features(feature, sort_order) as (
    values
      ('pill'::text, 1),
      ('match'::text, 2),
      ('video'::text, 3),
      ('prediction'::text, 4)
  )
  select w.window_key,
         w.window_label,
         w.sort_order as window_order,
         f.feature,
         f.sort_order as feature_order,
         count(distinct a.user_id)::integer as unique_users,
         count(a.user_id)::integer as actions,
         greatest(now() - w.span, s.tracking_started_at) as effective_from
  from settings s
  cross join windows w
  cross join features f
  left join public.v_insights_core_actions a
    on a.feature = f.feature
   and a.occurred_at >= greatest(now() - w.span, s.tracking_started_at)
   and a.occurred_at <= now()
  group by w.window_key, w.window_label, w.sort_order,
           f.feature, f.sort_order, w.span, s.tracking_started_at;

create or replace view public.v_insights_core_usage_daily
with (security_invoker = true)
as
  with settings as (
    select '2026-08-22 20:41:06+00'::timestamptz as tracking_started_at
  ), days(day) as (
    select generate_series(
      ('2026-08-22 20:41:06+00'::timestamptz at time zone 'Europe/Rome')::date,
      (now() at time zone 'Europe/Rome')::date,
      interval '1 day'
    )::date
  ), features(feature, sort_order) as (
    values
      ('pill'::text, 1),
      ('match'::text, 2),
      ('video'::text, 3),
      ('prediction'::text, 4)
  )
  select d.day,
         f.feature,
         f.sort_order as feature_order,
         count(distinct a.user_id)::integer as unique_users,
         count(a.user_id)::integer as actions
  from settings s
  cross join days d
  cross join features f
  left join public.v_insights_core_actions a
    on a.feature = f.feature
   and a.occurred_at >= s.tracking_started_at
   and (a.occurred_at at time zone 'Europe/Rome')::date = d.day
  group by d.day, f.feature, f.sort_order;

create or replace view public.v_insights_complete_signup_funnel
with (security_invoker = true)
as
  with settings as (
    select '2026-08-22 20:41:06+00'::timestamptz as tracking_started_at
  )
  select (p.created_at at time zone 'Europe/Rome')::date as day,
         count(*)::integer as signups,
         count(*) filter (where p.onboarding_completed_at is not null)::integer as onboarded,
         count(fv.user_id)::integer as first_value,
         count(*) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (p.created_at at time zone 'Europe/Rome')::date + 7
         )::integer as d7_eligible,
         count(*) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (p.created_at at time zone 'Europe/Rome')::date + 7
             and exists (
               select 1 from public.v_insights_core_actions a
               where a.user_id = p.id
                 and a.occurred_at >= p.created_at
                 and (a.occurred_at at time zone 'Europe/Rome')::date =
                     (p.created_at at time zone 'Europe/Rome')::date + 7
             )
         )::integer as returned_d7
  from settings s
  join public.user_profiles p on p.created_at >= s.tracking_started_at
  left join public.v_insights_first_value fv on fv.user_id = p.id
  group by (p.created_at at time zone 'Europe/Rome')::date;

create or replace view public.v_insights_complete_activation_by_feature
with (security_invoker = true)
as
  with settings as (
    select '2026-08-22 20:41:06+00'::timestamptz as tracking_started_at
  ), features(feature, sort_order) as (
    values
      ('pill'::text, 1),
      ('match'::text, 2),
      ('video'::text, 3),
      ('prediction'::text, 4)
  ), eligible_profiles as (
    select p.id, p.created_at
    from settings s
    join public.user_profiles p on p.created_at >= s.tracking_started_at
  ), activation as (
    select p.id as user_id,
           p.created_at as signup_at,
           a.feature,
           min(a.occurred_at) as activated_at
    from eligible_profiles p
    join public.v_insights_core_actions a
      on a.user_id = p.id
     and a.occurred_at >= p.created_at
     and (a.occurred_at at time zone 'Europe/Rome')::date =
         (p.created_at at time zone 'Europe/Rome')::date
    group by p.id, p.created_at, a.feature
  ), signup_total as (
    select count(*)::integer as total from eligible_profiles
  )
  select f.feature,
         f.sort_order as feature_order,
         st.total as signup_users,
         count(a.user_id)::integer as activated_users,
         count(a.user_id) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (a.signup_at at time zone 'Europe/Rome')::date + 1
         )::integer as d1_eligible,
         count(a.user_id) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (a.signup_at at time zone 'Europe/Rome')::date + 1
             and exists (
               select 1 from public.v_insights_core_actions r
               where r.user_id = a.user_id
                 and (r.occurred_at at time zone 'Europe/Rome')::date =
                     (a.signup_at at time zone 'Europe/Rome')::date + 1
             )
         )::integer as d1_returned,
         count(a.user_id) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (a.signup_at at time zone 'Europe/Rome')::date + 7
         )::integer as d7_eligible,
         count(a.user_id) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (a.signup_at at time zone 'Europe/Rome')::date + 7
             and exists (
               select 1 from public.v_insights_core_actions r
               where r.user_id = a.user_id
                 and (r.occurred_at at time zone 'Europe/Rome')::date =
                     (a.signup_at at time zone 'Europe/Rome')::date + 7
             )
         )::integer as d7_returned
  from features f
  cross join signup_total st
  left join activation a on a.feature = f.feature
  group by f.feature, f.sort_order, st.total;

create or replace view public.v_insights_complete_retention_cohorts
with (security_invoker = true)
as
  with settings as (
    select '2026-08-22 20:41:06+00'::timestamptz as tracking_started_at
  ), cohorts as (
    select p.id as user_id,
           p.created_at,
           date_trunc('week', p.created_at at time zone 'Europe/Rome')::date as cohort_week
    from settings s
    join public.user_profiles p on p.created_at >= s.tracking_started_at
  ), flags as (
    select c.*,
           exists (
             select 1 from public.v_insights_core_actions a
             where a.user_id = c.user_id
               and (a.occurred_at at time zone 'Europe/Rome')::date =
                   (c.created_at at time zone 'Europe/Rome')::date + 1
           ) as returned_d1,
           exists (
             select 1 from public.v_insights_core_actions a
             where a.user_id = c.user_id
               and (a.occurred_at at time zone 'Europe/Rome')::date =
                   (c.created_at at time zone 'Europe/Rome')::date + 7
           ) as returned_d7,
           exists (
             select 1 from public.v_insights_core_actions a
             where a.user_id = c.user_id
               and (a.occurred_at at time zone 'Europe/Rome')::date =
                   (c.created_at at time zone 'Europe/Rome')::date + 30
           ) as returned_d30
    from cohorts c
  )
  select cohort_week,
         count(*)::integer as cohort_size,
         count(*) filter (where (now() at time zone 'Europe/Rome')::date > (created_at at time zone 'Europe/Rome')::date + 1)::integer as d1_eligible,
         count(*) filter (where (now() at time zone 'Europe/Rome')::date > (created_at at time zone 'Europe/Rome')::date + 1 and returned_d1)::integer as d1_returned,
         count(*) filter (where (now() at time zone 'Europe/Rome')::date > (created_at at time zone 'Europe/Rome')::date + 7)::integer as d7_eligible,
         count(*) filter (where (now() at time zone 'Europe/Rome')::date > (created_at at time zone 'Europe/Rome')::date + 7 and returned_d7)::integer as d7_returned,
         count(*) filter (where (now() at time zone 'Europe/Rome')::date > (created_at at time zone 'Europe/Rome')::date + 30)::integer as d30_eligible,
         count(*) filter (where (now() at time zone 'Europe/Rome')::date > (created_at at time zone 'Europe/Rome')::date + 30 and returned_d30)::integer as d30_returned
  from flags
  group by cohort_week;

revoke all on public.v_insights_core_usage_windows from anon, authenticated;
revoke all on public.v_insights_core_usage_daily from anon, authenticated;
revoke all on public.v_insights_complete_signup_funnel from anon, authenticated;
revoke all on public.v_insights_complete_activation_by_feature from anon, authenticated;
revoke all on public.v_insights_complete_retention_cohorts from anon, authenticated;

grant select on public.v_insights_core_usage_windows to service_role;
grant select on public.v_insights_core_usage_daily to service_role;
grant select on public.v_insights_complete_signup_funnel to service_role;
grant select on public.v_insights_complete_activation_by_feature to service_role;
grant select on public.v_insights_complete_retention_cohorts to service_role;
