import { NextResponse } from 'next/server';
import type { ErrorLog } from '@/mocks/errors';
import { supabaseServer } from '@/lib/supabaseServer';

interface JobQueueRow {
  id: string;
  status: string;
  source: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_count: number | null;
  logs: string | null;
  triggered_by: string | null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = id.startsWith('jq_') ? id.slice(3) : id;

  if (!supabaseServer) {
    return NextResponse.json(null, { status: 500 });
  }

  const { data } = await supabaseServer
    .from('job_queue')
    .select('id, status, source, created_at, started_at, finished_at, error_count, logs, triggered_by')
    .eq('id', jobId)
    .maybeSingle();

  const row = data as JobQueueRow | null;
  if (!row || (row.status !== 'failed' && row.status !== 'cancelled')) {
    return NextResponse.json(null, { status: 404 });
  }

  const payload: ErrorLog = {
    id: `jq_${row.id}`,
    severity: row.status === 'cancelled' ? 'warning' : 'error',
    source: row.source ?? 'job_queue',
    message: `Sync ${row.status} - ${row.source ?? row.id}`,
    metadata: {
      jobQueueId: row.id,
      triggeredBy: row.triggered_by,
      errorCount: row.error_count,
      logs: row.logs,
      status: row.status,
    },
    timestamp: row.started_at ?? row.created_at,
    jobRunId: row.id,
  };

  return NextResponse.json(payload);
}
