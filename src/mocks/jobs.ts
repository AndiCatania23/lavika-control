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
    id: 'job_sync_full',
    name: 'Sync completo',
    description: 'Sincronizza tutti i dati da tutte le sorgenti',
    schedule: '0 2 * * *',
    lastRun: '2025-02-25T02:00:00Z',
    status: 'active',
    nextRun: '2025-02-26T02:00:00Z',
  },
  {
    id: 'job_sync_source',
    name: 'Sync singola source',
    description: 'Sincronizza dati da una sorgente specifica',
    schedule: null,
    lastRun: '2025-02-25T14:30:00Z',
    status: 'active',
    nextRun: null,
  },
  {
    id: 'job_dry_run',
    name: 'Dry-run',
    description: 'Simula sincronizzazione senza modificare dati',
    schedule: null,
    lastRun: '2025-02-24T10:00:00Z',
    status: 'active',
    nextRun: null,
  },
  {
    id: 'job_dashboard_stats',
    name: 'Dashboard stats',
    description: 'Calcola statistiche per la dashboard',
    schedule: '*/15 * * * *',
    lastRun: '2025-02-25T15:00:00Z',
    status: 'active',
    nextRun: '2025-02-25T15:15:00Z',
  },
  {
    id: 'job_scan_integrity',
    name: 'Scan integrity',
    description: 'Verifica integrità dei dati nel database',
    schedule: '0 3 * * 0',
    lastRun: '2025-02-23T03:00:00Z',
    status: 'active',
    nextRun: '2025-03-02T03:00:00Z',
  },
  {
    id: 'job_regen_thumbnails',
    name: 'Regen thumbnails',
    description: 'Rigenera miniature per tutti i contenuti',
    schedule: null,
    lastRun: null,
    status: 'paused',
    nextRun: null,
  },
];

export function getJobById(id: string): Job | undefined {
  return jobs.find(j => j.id === id);
}
