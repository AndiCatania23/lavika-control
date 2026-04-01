'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Users, Activity, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { getUsers, User, getSessions, Session } from '@/lib/data';
import { DataTable } from '@/components/DataTable';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';

// ── Session helpers ────────────────────────────────────────────────────────────

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

function formatActivityDate(value: string): string {
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Spinner ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'utenti' | 'sessioni';

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('utenti');
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const router = useRouter();

  const SESSIONS_PAGE_SIZE = 50;

  // Load users on mount
  useEffect(() => {
    getUsers().then(data => {
      setUsers(data);
      setUsersLoading(false);
    });
  }, []);

  // Load sessions when tab is active or offset changes
  useEffect(() => {
    if (activeTab !== 'sessioni') return;
    setSessionsLoading(true);
    getSessions({ limit: SESSIONS_PAGE_SIZE, offset: sessionsOffset }).then(result => {
      setSessions(result.data);
      setSessionsTotal(result.total);
      setSessionsLoading(false);
    });
  }, [activeTab, sessionsOffset]);

  // ── Utenti columns ───────────────────────────────────────────────────────────

  const userColumns = [
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
      header: 'Ultima attività',
      sortable: true,
      className: 'w-[132px] whitespace-nowrap',
      render: (user: User) => (
        <span className="text-[11px] text-muted-foreground">{new Date(user.lastLogin).toLocaleString('it-IT')}</span>
      ),
    },
  ];

  // ── Sessioni columns ─────────────────────────────────────────────────────────

  const sessionColumns = [
    {
      key: 'userName',
      header: 'Utente',
      sortable: true,
      render: (session: Session) => (
        <div>
          <div className="font-medium text-foreground">{session.userName}</div>
          <div className="text-xs text-muted-foreground hidden md:block">{session.userEmail}</div>
        </div>
      ),
      className: 'w-[34%]',
    },
    {
      key: 'device',
      header: 'Dispositivo',
      sortable: true,
      render: (session: Session) => extractDeviceName(session),
      className: 'w-[26%]',
    },
    {
      key: 'browser',
      header: 'Browser',
      sortable: true,
      className: 'hidden lg:table-cell',
    },
    {
      key: 'location',
      header: 'Posizione',
      sortable: true,
      render: (session: Session) => extractCityName(session),
      className: 'hidden sm:table-cell w-[16%]',
    },
    {
      key: 'createdAt',
      header: 'Ultima attività',
      sortable: true,
      render: (session: Session) => formatActivityDate(session.createdAt),
      className: 'w-[16%]',
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
      className: 'hidden lg:table-cell',
    },
    {
      key: 'status',
      header: 'Stato',
      sortable: true,
      render: (session: Session) => <StatusPill status={session.status} size="sm" />,
      className: 'w-[14%]',
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Utenti"
        description="Gestisci e monitora utenti e sessioni"
        actions={activeTab === 'utenti' ? (
          <button
            onClick={() => router.push('/users/new')}
            aria-label="Aggiungi utente"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
          >
            <UserPlus className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline text-sm font-medium">Aggiungi utente</span>
          </button>
        ) : undefined}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('utenti')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'utenti'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Utenti
          {!usersLoading && (
            <span className="ml-1 text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {users.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('sessioni')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'sessioni'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Sessioni
          {sessionsTotal > 0 && (
            <span className="ml-1 text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {sessionsTotal.toLocaleString('it-IT')}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'utenti' ? (
        usersLoading ? <Spinner /> : (
          <DataTable
            data={users}
            columns={userColumns}
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
        )
      ) : (
        <>
          {sessionsLoading ? <Spinner /> : (
            <DataTable
              data={sessions}
              columns={sessionColumns}
              searchPlaceholder="Cerca sessioni..."
              searchKeys={['userName', 'userEmail', 'location', 'device', 'deviceLabel', 'browser']}
              mobileVariant="table"
            />
          )}

          {/* Server-side pagination */}
          {sessionsTotal > SESSIONS_PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                {sessionsOffset + 1}–{Math.min(sessionsOffset + SESSIONS_PAGE_SIZE, sessionsTotal)} di {sessionsTotal.toLocaleString('it-IT')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSessionsOffset(o => Math.max(0, o - SESSIONS_PAGE_SIZE))}
                  disabled={sessionsOffset === 0 || sessionsLoading}
                  className="p-2 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-muted-foreground">
                  {Math.floor(sessionsOffset / SESSIONS_PAGE_SIZE) + 1}/{Math.ceil(sessionsTotal / SESSIONS_PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setSessionsOffset(o => o + SESSIONS_PAGE_SIZE)}
                  disabled={sessionsOffset + SESSIONS_PAGE_SIZE >= sessionsTotal || sessionsLoading}
                  className="p-2 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
