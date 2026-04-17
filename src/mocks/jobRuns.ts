export interface JobRun {
  id: string;
  jobId: string;
  jobName: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  triggeredBy: string;
  scannedCount: number;
  insertedCount: number;
  updatedCount: number;
  errorCount: number;
  sourcesProcessed?: number | null;
  downloadedVideos?: number | null;
  uploadedVideos?: number | null;
  totalDurationSeconds?: number | null;
  source?: string | null;
  logs?: string | null;
}

let jobRuns: JobRun[] = [];

export function getJobRuns(filters?: { jobId?: string; status?: string }): JobRun[] {
  let filtered = [...jobRuns];
  if (filters?.jobId) {
    filtered = filtered.filter(r => r.jobId === filters.jobId);
  }
  if (filters?.status) {
    filtered = filtered.filter(r => r.status === filters.status);
  }
  return filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function getJobRunById(id: string): JobRun | undefined {
  return jobRuns.find(r => r.id === id);
}

export function createJobRun(jobId: string, jobName: string, triggeredBy: string): JobRun {
  const newRun: JobRun = {
    id: `run_${Date.now()}`,
    jobId,
    jobName,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    duration: null,
    triggeredBy,
    scannedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: 0,
  };
  jobRuns = [newRun, ...jobRuns];
  return newRun;
}

export function completeJobRun(id: string, success: boolean): void {
  const run = jobRuns.find(r => r.id === id);
  if (run) {
    run.status = success ? 'success' : 'failed';
    run.finishedAt = new Date().toISOString();
    run.duration = Math.floor((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
    if (success) {
      run.scannedCount = Math.floor(Math.random() * 10000);
      run.insertedCount = Math.floor(Math.random() * 500);
      run.updatedCount = Math.floor(Math.random() * 200);
    } else {
      run.errorCount = Math.floor(Math.random() * 10) + 1;
    }
  }
}
