import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const STUCK_MS = 15 * 60 * 1000;
const STALE_MS = 3 * 60 * 1000;
const OFFLINE_MS = 10 * 60 * 1000;

type HealthState = 'online' | 'stale' | 'offline' | 'unknown';

interface DaemonInfo {
  name: string;
  state: HealthState;
  lastSeenAt: string | null;
  startedAt: string | null;
  ageSeconds: number | null;
  pid: number | null;
  hostname: string | null;
  meta: Record<string, unknown> | null;
}

interface QueueHealth {
  pending: number;
  pendingStuck: number;
  running: number;
  success24h: number;
  failed24h: number;
}

interface SourceStatus {
  source: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSuccessAt: string | null;
}

interface MacStatusResponse {
  daemon: DaemonInfo;
  queue: QueueHealth;
  sources: SourceStatus[];
}

function stateFromAge(ageMs: number | null): HealthState {
  if (ageMs === null) return 'unknown';
  if (ageMs <= STALE_MS) return 'online';
  if (ageMs <= OFFLINE_MS) return 'stale';
  return 'offline';
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(now - STUCK_MS).toISOString();

  const [heartbeatRes, pendingRes, pendingStuckRes, runningRes, success24hRes, failed24hRes, recentRunsRes] =
    await Promise.all([
      supabaseServer.from('daemon_heartbeat').select('*').eq('name', 'job-daemon').maybeSingle(),
      supabaseServer.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseServer
        .from('job_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('created_at', stuckCutoff),
      supabaseServer.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'running'),
      supabaseServer
        .from('job_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'success')
        .gte('created_at', since24h),
      supabaseServer
        .from('job_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', since24h),
      // Pull enough rows to compute "last run" and "last success" per source — 200 covers many days.
      supabaseServer
        .from('job_queue')
        .select('source, status, created_at, started_at, finished_at')
        .not('source', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

  const hb = heartbeatRes.data as
    | { last_seen_at: string; started_at: string | null; pid: number | null; hostname: string | null; meta: Record<string, unknown> | null }
    | null;

  const lastSeenAt = hb?.last_seen_at ?? null;
  const ageMs = lastSeenAt ? now - new Date(lastSeenAt).getTime() : null;

  const daemon: DaemonInfo = {
    name: 'job-daemon',
    state: stateFromAge(ageMs),
    lastSeenAt,
    startedAt: hb?.started_at ?? null,
    ageSeconds: ageMs !== null ? Math.max(0, Math.round(ageMs / 1000)) : null,
    pid: hb?.pid ?? null,
    hostname: hb?.hostname ?? null,
    meta: hb?.meta ?? null,
  };

  const queue: QueueHealth = {
    pending: pendingRes.count ?? 0,
    pendingStuck: pendingStuckRes.count ?? 0,
    running: runningRes.count ?? 0,
    success24h: success24hRes.count ?? 0,
    failed24h: failed24hRes.count ?? 0,
  };

  // Derive per-source last status: first row per source (already ordered desc).
  const bySource = new Map<string, SourceStatus>();
  for (const row of (recentRunsRes.data ?? []) as Array<{
    source: string;
    status: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  }>) {
    const existing = bySource.get(row.source);
    if (!existing) {
      bySource.set(row.source, {
        source: row.source,
        lastRunAt: row.created_at,
        lastStatus: row.status,
        lastSuccessAt: row.status === 'success' ? row.finished_at ?? row.created_at : null,
      });
    } else if (row.status === 'success' && !existing.lastSuccessAt) {
      existing.lastSuccessAt = row.finished_at ?? row.created_at;
    }
  }

  const sources = Array.from(bySource.values()).sort((a, b) =>
    (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? ''),
  );

  const body: MacStatusResponse = { daemon, queue, sources };
  return NextResponse.json(body);
}
