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
}

let jobRuns: JobRun[] = [
  {
    id: 'run_001',
    jobId: 'job_sync_full',
    jobName: 'Sync completo',
    status: 'success',
    startedAt: '2025-02-25T02:00:00Z',
    finishedAt: '2025-02-25T02:15:32Z',
    duration: 932,
    triggeredBy: 'schedule',
    scannedCount: 15420,
    insertedCount: 342,
    updatedCount: 1256,
    errorCount: 0,
  },
  {
    id: 'run_002',
    jobId: 'job_sync_source',
    jobName: 'Sync singola source',
    status: 'success',
    startedAt: '2025-02-25T14:30:00Z',
    finishedAt: '2025-02-25T14:32:15Z',
    duration: 135,
    triggeredBy: 'admin',
    scannedCount: 1250,
    insertedCount: 45,
    updatedCount: 12,
    errorCount: 0,
  },
  {
    id: 'run_003',
    jobId: 'job_dry_run',
    jobName: 'Dry-run',
    status: 'success',
    startedAt: '2025-02-24T10:00:00Z',
    finishedAt: '2025-02-24T10:08:45Z',
    duration: 525,
    triggeredBy: 'admin',
    scannedCount: 15420,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: 0,
  },
  {
    id: 'run_004',
    jobId: 'job_dashboard_stats',
    jobName: 'Dashboard stats',
    status: 'running',
    startedAt: '2025-02-25T15:00:00Z',
    finishedAt: null,
    duration: null,
    triggeredBy: 'schedule',
    scannedCount: 8450,
    insertedCount: 125,
    updatedCount: 0,
    errorCount: 0,
  },
  {
    id: 'run_005',
    jobId: 'job_scan_integrity',
    jobName: 'Scan integrity',
    status: 'failed',
    startedAt: '2025-02-23T03:00:00Z',
    finishedAt: '2025-02-23T03:12:45Z',
    duration: 765,
    triggeredBy: 'schedule',
    scannedCount: 9876,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: 3,
  },
  {
    id: 'run_006',
    jobId: 'job_sync_full',
    jobName: 'Sync completo',
    status: 'failed',
    startedAt: '2025-02-24T02:00:00Z',
    finishedAt: '2025-02-24T02:05:22Z',
    duration: 322,
    triggeredBy: 'schedule',
    scannedCount: 5420,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: 15,
  },
];

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
