import { NextResponse } from 'next/server';
import type { JobRun } from '@/mocks/jobRuns';
import { supabaseServer } from '@/lib/supabaseServer';

function mapRow(row: Record<string, unknown>): JobRun {
  const startedAt = (row.started_at as string) ?? (row.created_at as string);
  const finishedAt = row.finished_at as string | null;
  const duration = startedAt && finishedAt
    ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : null;

  let status: JobRun['status'] = 'running';
  const rawStatus = row.status as string;
  if (rawStatus === 'success') status = 'success';
  else if (rawStatus === 'failed') status = 'failed';
  else if (rawStatus === 'cancelled') status = 'cancelled';

  return {
    id: row.id as string,
    jobId: 'job_sync_video',
    jobName: 'Sync Video',
    status,
    startedAt,
    finishedAt,
    duration,
    triggeredBy: (row.triggered_by as string) ?? 'manual',
    scannedCount: (row.scanned_count as number) ?? 0,
    insertedCount: (row.inserted_count as number) ?? 0,
    updatedCount: (row.updated_count as number) ?? 0,
    errorCount: (row.error_count as number) ?? 0,
    sourcesProcessed: row.sources_processed as number | null,
    downloadedVideos: row.downloaded_videos as number | null,
    uploadedVideos: row.uploaded_videos as number | null,
    totalDurationSeconds: (row.total_duration_seconds as number | null) ?? duration,
  };
}

export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json([], { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabaseServer
    .from('job_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapRow));
}
