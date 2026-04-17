import { NextResponse } from 'next/server';
import type { JobRun } from '@/mocks/jobRuns';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) {
    return NextResponse.json(null, { status: 500 });
  }

  const { id } = await params;

  const { data: row, error } = await supabaseServer
    .from('job_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !row) {
    return NextResponse.json(null, { status: 404 });
  }

  const startedAt = row.started_at ?? row.created_at;
  const finishedAt = row.finished_at;
  const duration = startedAt && finishedAt
    ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : null;

  let status: JobRun['status'] = 'running';
  if (row.status === 'success') status = 'success';
  else if (row.status === 'failed') status = 'failed';
  else if (row.status === 'cancelled') status = 'cancelled';

  const payload: JobRun = {
    id: row.id,
    jobId: 'job_sync_video',
    jobName: 'Sync Video',
    status,
    startedAt,
    finishedAt,
    duration,
    triggeredBy: row.triggered_by ?? 'manual',
    scannedCount: row.scanned_count ?? 0,
    insertedCount: row.inserted_count ?? 0,
    updatedCount: row.updated_count ?? 0,
    errorCount: row.error_count ?? 0,
    sourcesProcessed: row.sources_processed,
    downloadedVideos: row.downloaded_videos,
    uploadedVideos: row.uploaded_videos,
    totalDurationSeconds: row.total_duration_seconds ?? duration,
    source: row.source,
    logs: row.logs,
  };

  return NextResponse.json(payload);
}
