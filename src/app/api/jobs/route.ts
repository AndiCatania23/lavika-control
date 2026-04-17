import { NextRequest, NextResponse } from 'next/server';
import type { Job } from '@/mocks/jobs';
import type { JobRun } from '@/mocks/jobRuns';
import { supabaseServer } from '@/lib/supabaseServer';

function mapStatus(status: string): JobRun['status'] {
  if (status === 'pending' || status === 'running') return 'running';
  if (status === 'success') return 'success';
  if (status === 'cancelled') return 'cancelled';
  return 'failed';
}

function computeDuration(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json([], { status: 500 });
  }

  // Get latest run to populate lastRun
  const { data: latestRun } = await supabaseServer
    .from('job_queue')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const job: Job = {
    id: 'job_sync_video',
    name: 'Sync Video',
    description: 'Scarica e sincronizza i video dagli archivi delle singole risorse',
    schedule: null,
    lastRun: latestRun?.created_at ?? null,
    status: 'active',
    nextRun: null,
  };

  return NextResponse.json([job]);
}

export async function POST(request: NextRequest) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { jobId, triggeredBy = 'manual', source, facebook_url } = await request.json() as {
    jobId?: string;
    triggeredBy?: string;
    source?: string;
    facebook_url?: string;
  };

  if (jobId !== 'job_sync_video') {
    return NextResponse.json({ error: 'Unsupported job id' }, { status: 400 });
  }

  // Block only if a sync is actively running. Pending jobs are fine — the
  // daemon drains the queue FIFO, so new triggers just get appended.
  const { data: runningJobs } = await supabaseServer
    .from('job_queue')
    .select('id')
    .eq('status', 'running')
    .limit(1);

  if (runningJobs && runningJobs.length > 0) {
    return NextResponse.json(
      { success: false, error: 'Sync job already running' },
      { status: 409 }
    );
  }

  // Insert new job into queue
  const { data: newJob, error } = await supabaseServer
    .from('job_queue')
    .insert({
      job_id: 'job_sync_video',
      status: 'pending',
      source: source || null,
      facebook_url: facebook_url || null,
      triggered_by: triggeredBy,
    })
    .select()
    .single();

  if (error || !newJob) {
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Insert failed' },
      { status: 500 }
    );
  }

  const run: JobRun = {
    id: newJob.id,
    jobId: 'job_sync_video',
    jobName: 'Sync Video',
    status: 'running',
    startedAt: newJob.created_at,
    finishedAt: null,
    duration: null,
    triggeredBy,
    scannedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: 0,
  };

  return NextResponse.json({ success: true, run });
}

export async function HEAD() {
  return NextResponse.json({ ok: true });
}
