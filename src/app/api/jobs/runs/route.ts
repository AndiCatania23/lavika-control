import { NextResponse } from 'next/server';
import type { JobRun } from '@/mocks/jobRuns';
import { listGithubRuns } from '@/lib/githubWorkflows';

function mapRunStatus(status: string, conclusion: string | null): JobRun['status'] {
  if (status !== 'completed') return 'running';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'cancelled') return 'cancelled';
  return 'failed';
}

function mapRun(run: Awaited<ReturnType<typeof listGithubRuns>>[number]): JobRun {
  const startedAt = run.run_started_at ?? run.created_at;
  const finishedAt = run.status === 'completed' ? run.updated_at : null;
  const duration = finishedAt
    ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : null;

  return {
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
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const status = searchParams.get('status');

  const runs = (await listGithubRuns()).map(mapRun);
  const filtered = runs.filter(run => {
    if (jobId && run.jobId !== jobId && run.jobId !== 'job_sync_video') return false;
    if (status && run.status !== status) return false;
    return true;
  });

  return NextResponse.json(filtered);
}
