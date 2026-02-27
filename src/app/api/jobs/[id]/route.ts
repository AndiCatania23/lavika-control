import { NextResponse } from 'next/server';
import type { Job } from '@/mocks/jobs';
import { listGithubRuns, listGithubWorkflows, mapWorkflowToJobId } from '@/lib/githubWorkflows';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workflows, runs] = await Promise.all([listGithubWorkflows(), listGithubRuns()]);

  const workflow = workflows.find(wf => mapWorkflowToJobId(wf) === id);
  if (!workflow) {
    return NextResponse.json(null, { status: 404 });
  }

  const latest = runs.find(run => run.workflow_id === workflow.id);
  const job: Job = {
    id,
    name: workflow.name,
    description: workflow.path,
    schedule: null,
    lastRun: latest?.run_started_at ?? latest?.created_at ?? null,
    status: workflow.state === 'active' ? 'active' : 'paused',
    nextRun: null,
  };

  return NextResponse.json(job);
}
