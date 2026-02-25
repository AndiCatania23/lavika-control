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
      header: 'User',
      sortable: true,
      render: (user: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
            {user.avatar}
          </div>
          <div>
            <div className="font-medium text-foreground">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
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
      header: 'Status',
      sortable: true,
      render: (user: User) => <StatusPill status={user.status} size="sm" />,
    },
    {
      key: 'sessionsCount',
      header: 'Sessions',
      sortable: true,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      sortable: true,
      render: (user: User) => user.revenue > 0 ? `$${user.revenue}` : '-',
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      render: (user: User) => new Date(user.createdAt).toLocaleDateString('en-GB'),
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Users" 
        description="Manage and monitor your users"
      />

      <DataTable
        data={users}
        columns={columns}
        searchPlaceholder="Search users..."
        searchKeys={['name', 'email']}
        onRowClick={(user) => router.push(`/users/${user.id}`)}
      />
    </div>
  );
}
