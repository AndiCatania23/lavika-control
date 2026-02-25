'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorsData, ErrorLog } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    const filters = severityFilter ? { severity: severityFilter } : undefined;
    getErrorsData(filters).then(data => {
      setErrors(data);
      setLoading(false);
    });
  }, [severityFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const columns = [
    {
      key: 'severity',
      header: 'Severità',
      sortable: true,
      render: (error: ErrorLog) => <StatusPill status={error.severity} size="sm" />,
    },
    {
      key: 'source',
      header: 'Sorgente',
      sortable: true,
    },
    {
      key: 'message',
      header: 'Messaggio',
      render: (error: ErrorLog) => (
        <div className="max-w-md truncate text-foreground">{error.message}</div>
      ),
    },
    {
      key: 'timestamp',
      header: 'Ora',
      sortable: true,
      render: (error: ErrorLog) => new Date(error.timestamp).toLocaleString('it-IT'),
    },
    {
      key: 'jobRunId',
      header: 'Job Run',
      render: (error: ErrorLog) => error.jobRunId ? (
        <span className="font-mono text-xs text-primary">{error.jobRunId}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Errori" 
        description="Errori e avvisi di sistema"
      />

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Filtra per severità:</label>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Tutti</option>
          <option value="critical">Critico</option>
          <option value="error">Errore</option>
          <option value="warning">Avviso</option>
        </select>
      </div>

      <DataTable
        data={errors}
        columns={columns}
        searchPlaceholder="Cerca errori..."
        searchKeys={['message', 'source']}
        onRowClick={(error) => router.push(`/errors/${error.id}`)}
      />
    </div>
  );
}
