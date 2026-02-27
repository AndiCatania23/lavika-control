import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const USER_METRIC_KEYS = [
  'users_active_wau',
  'users_new_7d',
  'users_reactivation_rate',
  'users_stickiness_dau_mau',
] as const;

interface ComparisonRow {
  metric_key: string;
  value_num: number | string | null;
  delta_day: number | string | null;
  delta_week: number | string | null;
  delta_month: number | string | null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function GET() {
  const client = supabaseServer;
  if (!client) {
    return NextResponse.json({ snapshotDate: null, metrics: [] });
  }

  const latestSnapshotResponse = await client
    .from('dev_kpi_daily_values')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSnapshotResponse.error || !latestSnapshotResponse.data?.snapshot_date) {
    return NextResponse.json({ snapshotDate: null, metrics: [] });
  }

  const snapshotDate = latestSnapshotResponse.data.snapshot_date;

  const { data, error } = await client
    .from('dev_kpi_daily_comparisons')
    .select('metric_key,value_num,delta_day,delta_week,delta_month')
    .eq('snapshot_date', snapshotDate)
    .in('metric_key', [...USER_METRIC_KEYS]);

  if (error || !data) {
    return NextResponse.json({ snapshotDate, metrics: [] });
  }

  const metrics = (data as ComparisonRow[]).map(row => ({
    metricKey: row.metric_key,
    value: asNumber(row.value_num),
    deltaDay: asNumber(row.delta_day),
    deltaWeek: asNumber(row.delta_week),
    deltaMonth: asNumber(row.delta_month),
  }));

  return NextResponse.json({ snapshotDate, metrics });
}
