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
}

function mapSeverity(status: string): ErrorLog['severity'] {
  if (status === 'cancelled') return 'warning';
  return 'error';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severityFilter = searchParams.get('severity');
  const sourceFilter = searchParams.get('source');

  if (!supabaseServer) {
    return NextResponse.json([]);
  }

  const { data } = await supabaseServer
    .from('job_queue')
    .select('id, status, source, created_at, started_at, finished_at, error_count, logs')
    .in('status', ['failed', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(100);

  const items: ErrorLog[] = ((data ?? []) as JobQueueRow[])
    .map(row => ({
      id: `jq_${row.id}`,
      severity: mapSeverity(row.status),
      source: row.source ?? 'job_queue',
      message: `Sync ${row.status === 'failed' ? 'failed' : 'cancelled'}${row.source ? ` - ${row.source}` : ''}`,
      metadata: {
        jobQueueId: row.id,
        errorCount: row.error_count,
        hasLogs: Boolean(row.logs),
      },
      timestamp: row.started_at ?? row.created_at,
      jobRunId: row.id,
    }))
    .filter(item => {
      if (severityFilter && item.severity !== severityFilter) return false;
      if (sourceFilter && item.source !== sourceFilter) return false;
      return true;
    });

  return NextResponse.json(items);
}
