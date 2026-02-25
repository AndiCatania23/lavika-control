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
      header: 'Device',
      sortable: true,
    },
    {
      key: 'browser',
      header: 'Browser',
      sortable: true,
    },
    {
      key: 'ip',
      header: 'IP Address',
      sortable: true,
    },
    {
      key: 'location',
      header: 'Location',
      sortable: true,
    },
    {
      key: 'createdAt',
      header: 'Started',
      sortable: true,
      render: (session: Session) => new Date(session.createdAt).toLocaleString('en-GB'),
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: true,
      render: (session: Session) => {
        const mins = Math.floor(session.duration / 60);
        const secs = session.duration % 60;
        return `${mins}m ${secs}s`;
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (session: Session) => <StatusPill status={session.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Sessions" 
        description="Active and recent user sessions"
      />

      <DataTable
        data={sessions}
        columns={columns}
        searchPlaceholder="Search sessions..."
        searchKeys={['userName', 'userEmail', 'ip', 'location']}
      />
    </div>
  );
}
