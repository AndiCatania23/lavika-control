-- Low-volume product analytics for LAVIKA core actions.
-- This migration is additive/backward compatible with the existing view_start
-- pipeline. The app writes only authenticated pill/match opens; video starts
-- and predictions are read from their existing authoritative sources.

alter table public.content_events
  drop constraint if exists content_events_event_name_check;

alter table public.content_events
  add constraint content_events_event_name_check
  check (char_length(event_name) between 1 and 64);

comment on constraint content_events_event_name_check on public.content_events is
  'Event names are validated by authenticated server endpoints; length guard preserves backward compatibility for existing producers.';

create unique index if not exists content_events_core_action_session_unique
  on public.content_events (user_id, session_key, content_type, content_id)
  where event_name = 'core_action'
    and user_id is not null
    and session_key is not null
    and content_type is not null
    and content_id is not null;

create index if not exists content_events_user_occurred_idx
  on public.content_events (user_id, occurred_at desc)
  where user_id is not null;

create index if not exists content_events_core_feature_occurred_idx
  on public.content_events (content_type, occurred_at desc, user_id)
  where event_name = 'core_action' and user_id is not null;

create or replace view public.v_insights_core_actions
with (security_invoker = true)
as
  select ce.user_id,
         ce.occurred_at,
         ce.content_type as feature,
         ce.content_id,
         ce.session_key
  from public.content_events ce
  where ce.event_name = 'core_action'
    and ce.user_id is not null
    and ce.content_type in ('pill', 'match', 'prediction')

  union all

  select ce.user_id,
         ce.occurred_at,
         'video'::text as feature,
         coalesce(ce.content_id, ce.episode_id::text) as content_id,
         ce.session_key
  from public.content_events ce
  where ce.event_name = 'view_start'
    and ce.user_id is not null;

create or replace view public.v_insights_first_value
with (security_invoker = true)
as
  select distinct on (p.id)
         p.id as user_id,
         a.occurred_at as first_value_at,
         a.feature as first_value_feature,
         a.content_id as first_value_content_id,
         extract(epoch from (a.occurred_at - p.created_at)) / 60.0 as minutes_to_value
  from public.user_profiles p
  join public.v_insights_core_actions a
    on a.user_id = p.id
   and a.occurred_at >= p.created_at
  order by p.id, a.occurred_at, a.feature;

create or replace view public.v_insights_core_retention_cohorts
with (security_invoker = true)
as
  with cohorts as (
    select p.id as user_id,
           p.created_at,
           date_trunc('week', p.created_at at time zone 'Europe/Rome')::date as cohort_week
    from public.user_profiles p
  ), flags as (
    select c.user_id,
           c.cohort_week,
           c.created_at,
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
         count(*) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (created_at at time zone 'Europe/Rome')::date + 1
         )::integer as d1_eligible,
         count(*) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (created_at at time zone 'Europe/Rome')::date + 1
             and returned_d1
         )::integer as d1_returned,
         count(*) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (created_at at time zone 'Europe/Rome')::date + 7
         )::integer as d7_eligible,
         count(*) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (created_at at time zone 'Europe/Rome')::date + 7
             and returned_d7
         )::integer as d7_returned,
         count(*) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (created_at at time zone 'Europe/Rome')::date + 30
         )::integer as d30_eligible,
         count(*) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (created_at at time zone 'Europe/Rome')::date + 30
             and returned_d30
         )::integer as d30_returned
  from flags
  group by cohort_week;

create or replace view public.v_insights_core_signup_funnel
with (security_invoker = true)
as
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
  from public.user_profiles p
  left join public.v_insights_first_value fv on fv.user_id = p.id
  group by (p.created_at at time zone 'Europe/Rome')::date;

create or replace view public.v_insights_activation_by_feature
with (security_invoker = true)
as
  with activation as (
    select p.id as user_id,
           a.feature,
           min(a.occurred_at) as activated_at,
           p.created_at as signup_at
    from public.user_profiles p
    join public.v_insights_core_actions a
      on a.user_id = p.id
     and a.occurred_at >= p.created_at
     and (a.occurred_at at time zone 'Europe/Rome')::date =
         (p.created_at at time zone 'Europe/Rome')::date
    group by p.id, p.created_at, a.feature
  )
  select feature,
         count(*)::integer as activated_users,
         count(*) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (signup_at at time zone 'Europe/Rome')::date + 1
         )::integer as d1_eligible,
         count(*) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (signup_at at time zone 'Europe/Rome')::date + 1
             and exists (
               select 1 from public.v_insights_core_actions r
               where r.user_id = activation.user_id
                 and (r.occurred_at at time zone 'Europe/Rome')::date =
                     (activation.signup_at at time zone 'Europe/Rome')::date + 1
             )
         )::integer as d1_returned,
         count(*) filter (where
           (now() at time zone 'Europe/Rome')::date >
           (signup_at at time zone 'Europe/Rome')::date + 7
         )::integer as d7_eligible,
         count(*) filter (
           where (now() at time zone 'Europe/Rome')::date >
                 (signup_at at time zone 'Europe/Rome')::date + 7
             and exists (
               select 1 from public.v_insights_core_actions r
               where r.user_id = activation.user_id
                 and (r.occurred_at at time zone 'Europe/Rome')::date =
                     (activation.signup_at at time zone 'Europe/Rome')::date + 7
             )
         )::integer as d7_returned
  from activation
  group by feature;

revoke all on public.v_insights_core_actions from anon, authenticated;
revoke all on public.v_insights_first_value from anon, authenticated;
revoke all on public.v_insights_core_retention_cohorts from anon, authenticated;
revoke all on public.v_insights_core_signup_funnel from anon, authenticated;
revoke all on public.v_insights_activation_by_feature from anon, authenticated;

grant select on public.v_insights_core_actions to service_role;
grant select on public.v_insights_first_value to service_role;
grant select on public.v_insights_core_retention_cohorts to service_role;
grant select on public.v_insights_core_signup_funnel to service_role;
grant select on public.v_insights_activation_by_feature to service_role;
