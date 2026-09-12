import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const migrationPath = resolve('supabase/migrations/20260912223611_insights_data_integrity_p0.sql');
export async function createDatabase(asOf = null) {
  const db = new PGlite();
  await db.exec(`
    set timezone='UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create table user_profiles(id uuid primary key, created_at timestamptz not null,
      onboarding_completed_at timestamptz);
    create table user_sessions(id uuid primary key default gen_random_uuid(), user_id uuid references user_profiles(id),
      session_key text, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
      device_id text, metadata jsonb, os_name text, country_code text,
      unique(user_id,session_key));
    create table content_events(id uuid primary key default gen_random_uuid(), user_id uuid references user_profiles(id),
      occurred_at timestamptz not null, created_at timestamptz default now(), event_name text,
      device_id text, episode_id uuid, content_id text, content_type text, session_key text, metadata jsonb);
    create unique index content_events_core_action_session_unique on content_events(user_id,session_key,content_type,content_id)
      where event_name='core_action' and user_id is not null and session_key is not null and content_type is not null and content_id is not null;
    grant all on user_profiles,user_sessions,content_events to service_role;
  `);
  const freeze = text => asOf ? text.replace(/now\(\)/gi, `timestamptz '${asOf}'`) : text;
  // Committed historical definitions, independent of the production connection.
  for (const file of ['20260822202834_core_action_analytics.sql','20260822205559_product_growth_dashboard.sql']) {
    let sql = await readFile(resolve('supabase/migrations',file),'utf8');
    // Test scaffold has no event-name constraint to drop; preserve all views.
    sql=sql.replace('drop constraint content_events_event_name_check','drop constraint if exists content_events_event_name_check');
    await db.exec(freeze(sql));
  }
  return {db, freeze, apply: async () => db.exec(freeze(await readFile(migrationPath,'utf8')))};
}
