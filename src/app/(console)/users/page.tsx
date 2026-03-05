'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { getUsers, User } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import { SectionHeader } from '@/components/SectionHeader';

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
      className: 'w-[40%] min-w-0',
      render: (user: User) => (
        <div className="flex items-center gap-2 min-w-0">
          {user.avatarUrl ? (
            <div
              className="w-7 h-7 rounded-full bg-cover bg-center border border-border"
              style={{ backgroundImage: `url(${user.avatarUrl})` }}
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-medium">
              {user.avatar}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-foreground text-sm truncate">{user.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'badgeStatus',
      header: 'Badge',
      className: 'w-[72px] whitespace-nowrap',
      render: (user: User) => (
        <span className={`text-[9px] px-1 py-0.5 rounded ${
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
      className: 'w-[88px] whitespace-nowrap',
      render: (user: User) => (
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
          user.status === 'active'
            ? 'bg-green-500/10 text-green-500'
            : user.status === 'inactive'
            ? 'bg-muted text-muted-foreground'
            : 'bg-red-500/10 text-red-500'
        }`}>
          <span className="w-1 h-1 rounded-full bg-current mr-1" />
          {user.status}
        </span>
      ),
    },
    {
      key: 'sessionsCount',
      header: 'Sessioni',
      sortable: true,
      className: 'w-[90px] whitespace-nowrap',
      render: (user: User) => (
        <span className="text-xs text-foreground">{user.sessionsCount.toLocaleString('it-IT')}</span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Ultima attivita',
      sortable: true,
      className: 'w-[132px] whitespace-nowrap',
      render: (user: User) => (
        <span className="text-[11px] text-muted-foreground">{new Date(user.lastLogin).toLocaleString('it-IT')}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Utenti" 
        description="Gestisci e monitora gli utenti"
        actions={(
          <button
            onClick={() => router.push('/users/new')}
            aria-label="Aggiungi utente"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
          >
            <UserPlus className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline text-sm font-medium">Aggiungi utente</span>
          </button>
        )}
      />

      <DataTable
        data={users}
        columns={columns}
        searchPlaceholder="Cerca utenti..."
        searchKeys={['name', 'email']}
        mobileColumnKeys={['name', 'status', 'sessionsCount', 'lastLogin']}
        mobileHideLabelKeys={['name']}
        mobileDense
        mobileRowFooter={(user) => (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Badge</span>
            <span className={`rounded px-1.5 py-0.5 ${
              user.badge === 'gold' ? 'bg-yellow-500/20 text-yellow-400' :
              user.badge === 'silver' ? 'bg-gray-400/20 text-gray-300' :
              'bg-amber-700/20 text-amber-600'
            }`}>
              {user.badge.toUpperCase()}
            </span>
          </div>
        )}
        onRowClick={(user) => router.push(`/users/${user.id}`)}
      />
    </div>
  );
}
