'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUsers, User } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getUsers().then(data => {
      setUsers(data);
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
      key: 'name',
      header: 'Utente',
      sortable: true,
      render: (user: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
            {user.avatar}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{user.name}</div>
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Piano',
      sortable: true,
      render: (user: User) => (
        <span className={`text-xs px-2 py-1 rounded ${
          user.plan === 'enterprise' ? 'bg-purple-500/10 text-purple-400' :
          user.plan === 'pro' ? 'bg-blue-500/10 text-blue-400' :
          'bg-muted text-muted-foreground'
        }`}>
          {user.plan.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Stato',
      sortable: true,
      render: (user: User) => <StatusPill status={user.status} size="sm" />,
    },
    {
      key: 'sessionsCount',
      header: 'Sessioni',
      sortable: true,
      className: 'hidden md:table-cell',
    },
    {
      key: 'revenue',
      header: 'Ricavi',
      sortable: true,
      className: 'hidden md:table-cell',
      render: (user: User) => user.revenue > 0 ? `€${user.revenue}` : '-',
    },
    {
      key: 'createdAt',
      header: 'Iscritto',
      sortable: true,
      className: 'hidden lg:table-cell',
      render: (user: User) => new Date(user.createdAt).toLocaleDateString('it-IT'),
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Utenti" 
        description="Gestisci e monitora gli utenti"
      />

      <DataTable
        data={users}
        columns={columns}
        searchPlaceholder="Cerca utenti..."
        searchKeys={['name', 'email']}
        onRowClick={(user) => router.push(`/users/${user.id}`)}
      />
    </div>
  );
}
