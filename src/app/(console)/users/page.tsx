'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Users, Activity, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { getUsers, User, getSessions, Session } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';

function useIsWide() {
  const [w, setW] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onR = () => setW(window.innerWidth >= 1024);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return w;
}

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

function fmtDate(value: string) {
  return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function badgeClass(badge: string): string {
  if (badge === 'gold')   return 'pill pill-warn';
  if (badge === 'silver') return 'pill';
  return 'pill pill-warn';
}

type Tab = 'utenti' | 'sessioni';

const SESSIONS_PAGE_SIZE = 50;

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const isWide = useIsWide();
  const [activeTab, setActiveTab] = useState<Tab>('utenti');
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getUsers().then(data => { setUsers(data); setUsersLoading(false); });
  }, []);

  useEffect(() => {
    if (activeTab !== 'sessioni') return;
    setSessionsLoading(true);
    getSessions({ limit: SESSIONS_PAGE_SIZE, offset: sessionsOffset }).then(result => {
      setSessions(result.data);
      setSessionsTotal(result.total);
      setSessionsLoading(false);
    });
  }, [activeTab, sessionsOffset]);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  const filteredSessions = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s =>
      s.userName.toLowerCase().includes(q) ||
      s.userEmail.toLowerCase().includes(q) ||
      (s.location ?? '').toLowerCase().includes(q) ||
      extractDeviceName(s).toLowerCase().includes(q)
    );
  }, [sessions, search]);

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-col sm:flex-row">
        <div className="relative w-full sm:grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={activeTab === 'utenti' ? 'Cerca utenti...' : 'Cerca sessioni...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        {activeTab === 'utenti' && (
          <button
            onClick={() => router.push('/users/new')}
            className="btn btn-primary btn-sm w-full sm:w-auto"
            style={{ alignSelf: 'stretch' }}
          >
            <UserPlus className="w-4 h-4" />
            <span>Aggiungi utente</span>
          </button>
        )}
      </div>

      {/* Tabs segmented control */}
      <div className="p-1 rounded-[var(--r)]" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)', display: 'inline-flex', maxWidth: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('utenti')}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[calc(var(--r)-2px)] typ-label transition-colors"
          style={{
            background: activeTab === 'utenti' ? 'var(--card)' : 'transparent',
            color: activeTab === 'utenti' ? 'var(--text-hi)' : 'var(--text-muted)',
            boxShadow: activeTab === 'utenti' ? 'var(--shadow-card)' : 'none',
          }}
        >
          <Users className="w-4 h-4" strokeWidth={1.75} />
          Utenti
          {!usersLoading && <span className="typ-caption">({users.length})</span>}
        </button>
        <button
          onClick={() => setActiveTab('sessioni')}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[calc(var(--r)-2px)] typ-label transition-colors"
          style={{
            background: activeTab === 'sessioni' ? 'var(--card)' : 'transparent',
            color: activeTab === 'sessioni' ? 'var(--text-hi)' : 'var(--text-muted)',
            boxShadow: activeTab === 'sessioni' ? 'var(--shadow-card)' : 'none',
          }}
        >
          <Activity className="w-4 h-4" strokeWidth={1.75} />
          Sessioni
          {sessionsTotal > 0 && <span className="typ-caption">({sessionsTotal.toLocaleString('it-IT')})</span>}
        </button>
      </div>

      {/* ── Utenti tab ── */}
      {activeTab === 'utenti' && (
        usersLoading ? <Spinner /> : filteredUsers.length === 0 ? (
          <div className="card card-body text-center">
            <Users className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="typ-caption">Nessun utente.</p>
          </div>
        ) : isWide ? (
          /* Desktop: grid-table */
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="grid items-center gap-3 px-4 py-2.5" style={{ gridTemplateColumns: '1.6fr 90px 110px 100px 160px', background: 'var(--card-muted)', borderBottom: '1px solid var(--hairline-soft)' }}>
              <span className="typ-micro">Utente</span>
              <span className="typ-micro">Badge</span>
              <span className="typ-micro">Stato</span>
              <span className="typ-micro">Sessioni</span>
              <span className="typ-micro">Ultima attività</span>
            </div>
            {filteredUsers.map(user => (
              <div
                key={user.id}
                onClick={() => router.push(`/users/${user.id}`)}
                className="grid items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                style={{ gridTemplateColumns: '1.6fr 90px 110px 100px 160px', borderBottom: '1px solid var(--hairline-soft)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-muted)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {user.avatarUrl ? (
                    <div className="w-9 h-9 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${user.avatarUrl})`, border: '1px solid var(--hairline-soft)' }} />
                  ) : (
                    <div className="w-9 h-9 rounded-full inline-grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', fontSize: 13, fontWeight: 600 }}>
                      {user.avatar}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="typ-label truncate">{user.name}</div>
                    <div className="typ-caption truncate">{user.email}</div>
                  </div>
                </div>
                <span className={badgeClass(user.badge)} style={{ fontSize: 10, padding: '1px 6px', maxWidth: 'fit-content' }}>{user.badge.toUpperCase()}</span>
                <StatusPill status={user.status} size="sm" />
                <span className="typ-mono" style={{ fontSize: 12 }}>{user.sessionsCount.toLocaleString('it-IT')}</span>
                <span className="typ-caption">{fmtDate(user.lastLogin)}</span>
              </div>
            ))}
          </div>
        ) : (
          /* Mobile: card list */
          <div className="vstack-tight">
            {filteredUsers.map(user => (
              <div
                key={user.id}
                onClick={() => router.push(`/users/${user.id}`)}
                className="card card-hover"
                style={{ cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
              >
                {user.avatarUrl ? (
                  <div className="w-11 h-11 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${user.avatarUrl})`, border: '1px solid var(--hairline-soft)' }} />
                ) : (
                  <div className="w-11 h-11 rounded-full inline-grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', fontSize: 14, fontWeight: 600 }}>
                    {user.avatar}
                  </div>
                )}
                <div className="grow min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="typ-label truncate">{user.name}</div>
                    <StatusPill status={user.status} size="sm" />
                    <span className={badgeClass(user.badge)} style={{ fontSize: 10, padding: '1px 6px' }}>{user.badge.toUpperCase()}</span>
                  </div>
                  <div className="typ-caption truncate">{user.email}</div>
                  <div className="typ-caption mt-1">
                    {user.sessionsCount.toLocaleString('it-IT')} sessioni · {fmtDate(user.lastLogin)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Sessioni tab ── */}
      {activeTab === 'sessioni' && (
        <>
          {sessionsLoading ? <Spinner /> : filteredSessions.length === 0 ? (
            <div className="card card-body text-center">
              <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="typ-caption">Nessuna sessione.</p>
            </div>
          ) : isWide ? (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="grid items-center gap-3 px-4 py-2.5" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 120px 100px 100px', background: 'var(--card-muted)', borderBottom: '1px solid var(--hairline-soft)' }}>
                <span className="typ-micro">Utente</span>
                <span className="typ-micro">Dispositivo</span>
                <span className="typ-micro">Posizione</span>
                <span className="typ-micro">Ultima attività</span>
                <span className="typ-micro">Durata</span>
                <span className="typ-micro">Stato</span>
              </div>
              {filteredSessions.map(s => {
                const mins = Math.floor(s.duration / 60);
                const secs = s.duration % 60;
                return (
                  <div
                    key={s.id}
                    className="grid items-center gap-3 px-4 py-3 transition-colors"
                    style={{ gridTemplateColumns: '1.4fr 1fr 1fr 120px 100px 100px', borderBottom: '1px solid var(--hairline-soft)' }}
                  >
                    <div className="min-w-0">
                      <div className="typ-label truncate">{s.userName}</div>
                      <div className="typ-caption truncate">{s.userEmail}</div>
                    </div>
                    <span className="typ-caption truncate">{extractDeviceName(s)}</span>
                    <span className="typ-caption truncate">{extractCityName(s)}</span>
                    <span className="typ-caption">{fmtDate(s.createdAt)}</span>
                    <span className="typ-mono" style={{ fontSize: 12 }}>{mins}m {secs}s</span>
                    <StatusPill status={s.status} size="sm" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="vstack-tight">
              {filteredSessions.map(s => {
                const mins = Math.floor(s.duration / 60);
                const secs = s.duration % 60;
                return (
                  <div key={s.id} className="card card-body">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="typ-label grow truncate">{s.userName}</div>
                      <StatusPill status={s.status} size="sm" />
                    </div>
                    <div className="typ-caption truncate mt-0.5">{s.userEmail}</div>
                    <div className="flex items-center gap-3 mt-2 typ-caption">
                      <span>{extractDeviceName(s)}</span>
                      <span>·</span>
                      <span>{extractCityName(s)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[color:var(--hairline-soft)] typ-caption">
                      <span>{fmtDate(s.createdAt)}</span>
                      <span className="typ-mono">{mins}m {secs}s</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {sessionsTotal > SESSIONS_PAGE_SIZE && (
            <div className="flex items-center justify-between typ-caption pt-1">
              <span>
                {sessionsOffset + 1}–{Math.min(sessionsOffset + SESSIONS_PAGE_SIZE, sessionsTotal)} di {sessionsTotal.toLocaleString('it-IT')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSessionsOffset(o => Math.max(0, o - SESSIONS_PAGE_SIZE))}
                  disabled={sessionsOffset === 0 || sessionsLoading}
                  className="btn btn-ghost btn-sm btn-icon"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="typ-mono">
                  {Math.floor(sessionsOffset / SESSIONS_PAGE_SIZE) + 1}/{Math.ceil(sessionsTotal / SESSIONS_PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setSessionsOffset(o => o + SESSIONS_PAGE_SIZE)}
                  disabled={sessionsOffset + SESSIONS_PAGE_SIZE >= sessionsTotal || sessionsLoading}
                  className="btn btn-ghost btn-sm btn-icon"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
