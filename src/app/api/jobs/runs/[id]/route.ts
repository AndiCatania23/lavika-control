import { NextResponse } from 'next/server';
import type { JobRun } from '@/mocks/jobRuns';
import { getGithubRunById } from '@/lib/githubWorkflows';

function mapRunStatus(status: string, conclusion: string | null): JobRun['status'] {
  if (status !== 'completed') return 'running';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'cancelled') return 'cancelled';
  return 'failed';
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getGithubRunById(id);

  if (!run) {
    return NextResponse.json(null, { status: 404 });
  }

  const startedAt = run.run_started_at ?? run.created_at;
  const finishedAt = run.status === 'completed' ? run.updated_at : null;
  const duration = finishedAt
    ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : null;

  const payload: JobRun = {
    id: String(run.id),
    jobId: run.workflow_id ? `job_${run.workflow_id}` : 'job_sync_video',
    jobName: run.name,
    status: mapRunStatus(run.status, run.conclusion),
    startedAt,
    finishedAt,
    duration,
    triggeredBy: run.actor?.login ?? 'github',
    scannedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: run.conclusion === 'failure' ? 1 : 0,
  };

  return NextResponse.json(payload);
}
