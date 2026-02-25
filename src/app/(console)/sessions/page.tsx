'use client';

import { useEffect, useState } from 'react';
import { getSessions, Session } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions().then(data => {
      setSessions(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const columns = [
    {
      key: 'userName',
      header: 'User',
      sortable: true,
      render: (session: Session) => (
        <div>
          <div className="font-medium text-foreground">{session.userName}</div>
          <div className="text-xs text-muted-foreground">{session.userEmail}</div>
        </div>
      ),
    },
    {
      key: 'device',
      header: 'Dispositivo',
      sortable: true,
    },
    {
      key: 'browser',
      header: 'Browser',
      sortable: true,
    },
    {
      key: 'ip',
      header: 'Indirizzo IP',
      sortable: true,
    },
    {
      key: 'location',
      header: 'Posizione',
      sortable: true,
    },
    {
      key: 'createdAt',
      header: 'Iniziato',
      sortable: true,
      render: (session: Session) => new Date(session.createdAt).toLocaleString('it-IT'),
    },
    {
      key: 'duration',
      header: 'Durata',
      sortable: true,
      render: (session: Session) => {
        const mins = Math.floor(session.duration / 60);
        const secs = session.duration % 60;
        return `${mins}m ${secs}s`;
      },
    },
    {
      key: 'status',
      header: 'Stato',
      sortable: true,
      render: (session: Session) => <StatusPill status={session.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Sessioni" 
        description="Sessioni utente attive e recenti"
      />

      <DataTable
        data={sessions}
        columns={columns}
        searchPlaceholder="Cerca sessioni..."
        searchKeys={['userName', 'userEmail', 'ip', 'location']}
      />
    </div>
  );
}
