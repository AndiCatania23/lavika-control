export interface GithubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
  updated_at: string;
}

export interface GithubWorkflowRun {
  id: number;
  name: string;
  display_title?: string;
  status: string;
  conclusion: string | null;
  run_started_at: string | null;
  created_at: string;
  updated_at: string;
  actor?: { login?: string };
  workflow_id?: number;
  html_url?: string;
  logs_url?: string;
  run_number?: number;
}

function getRepo() {
  const ownerEnv = process.env.GITHUB_OWNER;
  const repoEnv = process.env.GITHUB_REPO;

  if (repoEnv && repoEnv.includes('/')) {
    const [owner, repoName] = repoEnv.split('/');
    return { owner, repoName };
  }

  return {
    owner: ownerEnv || 'AndiCatania23',
    repoName: repoEnv || 'lavika-video-sync',
  };
}

function getHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export function mapWorkflowToJobId(workflow: Pick<GithubWorkflow, 'path' | 'id'>): string {
  const normalizedPath = workflow.path.toLowerCase();
  if (normalizedPath.includes('sync-videos.yml')) return 'job_sync_video';
  return `job_${workflow.id}`;
}

export async function listGithubWorkflows(): Promise<GithubWorkflow[]> {
  const headers = getHeaders();
  if (!headers) return [];

  const { owner, repoName } = getRepo();
  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/actions/workflows?per_page=100`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) return [];
  const payload = await response.json() as { workflows?: GithubWorkflow[] };
  return payload.workflows ?? [];
}

export async function listGithubRuns(): Promise<GithubWorkflowRun[]> {
  const headers = getHeaders();
  if (!headers) return [];

  const { owner, repoName } = getRepo();
  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/actions/runs?per_page=100`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) return [];
  const payload = await response.json() as { workflow_runs?: GithubWorkflowRun[] };
  return payload.workflow_runs ?? [];
}

export async function getGithubRunById(id: string): Promise<GithubWorkflowRun | null> {
  const headers = getHeaders();
  if (!headers) return null;

  const { owner, repoName } = getRepo();
  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/actions/runs/${id}`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) return null;
  return response.json() as Promise<GithubWorkflowRun>;
}

export async function triggerGithubWorkflow(
  workflowFile: string,
  ref: string = 'master',
  inputs?: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const headers = getHeaders();
  if (!headers) return { ok: false, error: 'Missing GITHUB_TOKEN' };

  const { owner, repoName } = getRepo();
  const body: { ref: string; inputs?: Record<string, string> } = { ref };
  if (inputs && Object.keys(inputs).length > 0) {
    body.inputs = inputs;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { ok: false, error: await response.text() };
  }

  return { ok: true };
}
