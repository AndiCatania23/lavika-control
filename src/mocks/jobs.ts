export interface Job {
  id: string;
  name: string;
  description: string;
  schedule: string | null;
  lastRun: string | null;
  status: 'active' | 'paused' | 'error';
  nextRun: string | null;
}

export const jobs: Job[] = [
  {
    id: 'job_sync_video',
    name: 'Sync Video',
    description: 'Scarica e sincronizza i video dagli archivi delle singole risorse',
    schedule: null,
    lastRun: null,
    status: 'active',
    nextRun: null,
  },
];

export function getJobById(id: string): Job | undefined {
  return jobs.find(j => j.id === id);
}
