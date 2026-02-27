import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { listGithubRuns } from '@/lib/githubWorkflows';

interface OverviewKpi {
  key: string;
  title: string;
  value: number;
  unit?: string;
}

const ACTIVITY_SOURCES = [
  { table: 'user_sessions', column: 'last_seen_at' },
  { table: 'content_events', column: 'occurred_at' },
  { table: 'watch_history', column: 'viewed_at' },
  { table: 'content_watch_time', column: 'last_watched_at' },
] as const;

async function countAllUsers(): Promise<number> {
  const client = supabaseServer;
  if (!client) return 0;

  let total = 0;
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    total += (data.users ?? []).length;
    if ((data.users ?? []).length < perPage) break;
  }

  return total;
}

async function collectActiveUserIdsSince(sinceIso: string): Promise<Set<string>> {
  const client = supabaseServer;
  if (!client) return new Set<string>();

  const userIds = new Set<string>();

  await Promise.all(
    ACTIVITY_SOURCES.map(async source => {
      const pageSize = 1000;
      for (let page = 0; page < 60; page += 1) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await client
          .from(source.table)
          .select(`user_id,${source.column}`)
          .not('user_id', 'is', null)
          .gte(source.column, sinceIso)
          .order(source.column, { ascending: false })
          .range(from, to);

        if (error || !data || data.length === 0) break;

        for (const row of data as Array<{ user_id: string | null }>) {
          if (typeof row.user_id === 'string' && row.user_id.length > 0) {
            userIds.add(row.user_id);
          }
        }

        if (data.length < pageSize) break;
      }
    })
  );

  return userIds;
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ kpis: [] as OverviewKpi[] });
  }

  const totalUsers = await countAllUsers();

  const now = Date.now();
  const activeNowCutoff = new Date(now - 30 * 60 * 1000).toISOString();
  const active24hCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const active7dCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [activeNowUsers, active24hUsers, active7dUsers] = await Promise.all([
    collectActiveUserIdsSince(activeNowCutoff),
    collectActiveUserIdsSince(active24hCutoff),
    collectActiveUserIdsSince(active7dCutoff),
  ]);

  const activeNow = activeNowUsers.size;
  const active24h = active24hUsers.size;
  const active7d = active7dUsers.size;

  const runs = await listGithubRuns();
  const last24h = now - 24 * 60 * 60 * 1000;
  const run24h = runs.filter(run => {
    const timestamp = new Date(run.run_started_at ?? run.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp >= last24h;
  });

  const errors24h = run24h.filter(run => run.conclusion === 'failure').length;
  const success24h = run24h.filter(run => run.conclusion === 'success').length;

  const profileRevenueTables = ['user_profile', 'user_profiles'] as const;
  let totalRevenue = 0;

  for (const table of profileRevenueTables) {
    const { data, error } = await supabaseServer.from(table).select('revenue,ltv');
    if (error || !data) continue;

    totalRevenue = (data as Record<string, unknown>[]).reduce((sum, row) => {
      const value = row.revenue ?? row.ltv;
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0);
    break;
  }

  const kpis: OverviewKpi[] = [
    { key: 'total_users', title: 'Utenti Totali', value: totalUsers },
    { key: 'active_users_now', title: 'Utenti Attivi Ora', value: activeNow },
    { key: 'active_users_24h', title: 'Utenti Attivi 24h', value: active24h },
    { key: 'active_users_7d', title: 'Utenti Attivi 7g', value: active7d },
    { key: 'workflow_runs_24h', title: 'Workflow 24h', value: run24h.length },
    { key: 'workflow_success_24h', title: 'Successi 24h', value: success24h },
    { key: 'workflow_errors_24h', title: 'Errori 24h', value: errors24h },
    { key: 'users_revenue_total', title: 'Revenue Totale', value: totalRevenue, unit: 'EUR' },
  ];

  return NextResponse.json({ kpis });
}
