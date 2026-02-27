'use client';

import { useEffect, useState } from 'react';
import { getSessions, Session } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';

function extractDeviceName(session: Session): string {
  const source = session.deviceLabel ?? session.device ?? 'Unknown device';
  return source.split(' · ')[0]?.trim() || 'Unknown device';
}

function extractCityName(session: Session): string {
  const source = session.location ?? 'Unknown';
  const withoutCoordinates = source.split(' · ')[0] ?? source;
  const city = withoutCoordinates.split(',')[0]?.trim();
  return city && city.length > 0 ? city : 'Unknown';
}

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
      render: (session: Session) => extractDeviceName(session),
    },
    {
      key: 'browser',
      header: 'Browser',
      sortable: true,
    },
    {
      key: 'location',
      header: 'Posizione',
      sortable: true,
      render: (session: Session) => extractCityName(session),
    },
    {
      key: 'createdAt',
      header: 'Ultima attivita',
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
        description="Sessioni reali utente da telemetry Lavika"
      />

      <DataTable
        data={sessions}
        columns={columns}
        searchPlaceholder="Cerca sessioni..."
        searchKeys={['userName', 'userEmail', 'location']}
      />
    </div>
  );
}
