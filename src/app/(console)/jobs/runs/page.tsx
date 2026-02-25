'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobRunsData, JobRun } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';

export default function JobRunsPage() {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    const filters = statusFilter ? { status: statusFilter } : undefined;
    getJobRunsData(filters).then(data => {
      setRuns(data);
      setLoading(false);
    });
  }, [statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const columns = [
    {
      key: 'id',
      header: 'Run ID',
      render: (run: JobRun) => (
        <span className="font-mono text-xs text-foreground">{run.id}</span>
      ),
    },
    {
      key: 'jobName',
      header: 'Job',
      sortable: true,
    },
    {
      key: 'status',
      header: 'Stato',
      sortable: true,
      render: (run: JobRun) => <StatusPill status={run.status} size="sm" />,
    },
    {
      key: 'startedAt',
      header: 'Iniziato',
      sortable: true,
      render: (run: JobRun) => new Date(run.startedAt).toLocaleString('it-IT'),
    },
    {
      key: 'duration',
      header: 'Durata',
      sortable: true,
      render: (run: JobRun) => run.duration ? `${run.duration}s` : '-',
    },
    {
      key: 'triggeredBy',
      header: 'Avviato Da',
      sortable: true,
    },
    {
      key: 'scannedCount',
      header: 'Scansionati',
      sortable: true,
    },
    {
      key: 'insertedCount',
      header: 'Inseriti',
      sortable: true,
    },
    {
      key: 'updatedCount',
      header: 'Aggiornati',
      sortable: true,
    },
    {
      key: 'errorCount',
      header: 'Errori',
      sortable: true,
      render: (run: JobRun) => (
        <span className={run.errorCount > 0 ? 'text-red-500' : 'text-muted-foreground'}>
          {run.errorCount}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Esecuzioni Job" 
        description="Storico di tutte le esecuzioni dei job"
      />

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Filtra per stato:</label>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Tutti</option>
          <option value="running">In corso</option>
          <option value="success">Completato</option>
          <option value="failed">Fallito</option>
          <option value="cancelled">Cancellato</option>
        </select>
      </div>

      <DataTable
        data={runs}
        columns={columns}
        searchPlaceholder="Search runs..."
        searchKeys={['id', 'jobName', 'triggeredBy']}
        onRowClick={(run) => router.push(`/jobs/runs/${run.id}`)}
      />
    </div>
  );
}
