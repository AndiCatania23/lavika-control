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
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-medium">
            {user.avatar}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground text-sm truncate">{user.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'badge',
      header: 'Badge',
      sortable: true,
      render: (user: User) => (
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          user.badge === 'gold' ? 'bg-yellow-500/20 text-yellow-400' :
          user.badge === 'silver' ? 'bg-gray-400/20 text-gray-300' :
          'bg-amber-700/20 text-amber-600'
        }`}>
          {user.badge.toUpperCase()}
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
