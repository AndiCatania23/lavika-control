import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { listGithubRuns } from '@/lib/githubWorkflows';

interface OverviewKpi {
  key: string;
  title: string;
  value: number;
  unit?: string;
}

async function callActiveUsers(sinceIso: string): Promise<number> {
  if (!supabaseServer) return 0;
  const { data, error } = await supabaseServer.rpc('dashboard_active_users', { since_ts: sinceIso });
  if (error || typeof data !== 'number') return 0;
  return data;
}

async function callTotalUsers(): Promise<number> {
  if (!supabaseServer) return 0;
  const { data, error } = await supabaseServer.rpc('dashboard_total_users');
  if (error || typeof data !== 'number') return 0;
  return data;
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ kpis: [] as OverviewKpi[] });
  }

  const now = Date.now();
  const activeNowCutoff = new Date(now - 30 * 60 * 1000).toISOString();
  const active24hCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const active7dCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [totalUsers, activeNow, active24h, active7d, runs, revenueRes] = await Promise.all([
    callTotalUsers(),
    callActiveUsers(activeNowCutoff),
    callActiveUsers(active24hCutoff),
    callActiveUsers(active7dCutoff),
    listGithubRuns(),
    supabaseServer.from('user_profile').select('revenue,ltv'),
  ]);

  const last24h = now - 24 * 60 * 60 * 1000;
  const run24h = runs.filter(run => {
    const timestamp = new Date(run.run_started_at ?? run.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp >= last24h;
  });
  const errors24h = run24h.filter(run => run.conclusion === 'failure').length;
  const success24h = run24h.filter(run => run.conclusion === 'success').length;

  let totalRevenue = 0;
  const revenueRows = (revenueRes.data ?? []) as Array<Record<string, unknown>>;
  totalRevenue = revenueRows.reduce((sum, row) => {
    const value = row.revenue ?? row.ltv;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);

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
