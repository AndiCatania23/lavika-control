'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus, Users as UsersIcon, Activity, ChevronLeft, ChevronRight, Search,
  Flame, UserCheck, Sparkles,
} from 'lucide-react';
import { getUsers, User, getSessions, Session } from '@/lib/data';

function useIsWide() {
  const [w, setW] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onR = () => setW(window.innerWidth >= 1024);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return w;
}

function deviceName(s: Session): string {
  const src = s.deviceLabel ?? s.device ?? 'Unknown device';
  return src.split(' · ')[0]?.trim() || 'Unknown device';
}

function cityName(s: Session): string {
  const src = s.location ?? 'Unknown';
  const woCoord = src.split(' · ')[0] ?? src;
  const c = woCoord.split(',')[0]?.trim();
  return c && c.length > 0 ? c : 'Unknown';
}

/* Time-ago bucket for activity indicator */
type Activity = 'online' | 'recent' | 'today' | 'week' | 'cold';

function activityBucket(lastLogin: string): { kind: Activity; label: string } {
  const ms = Date.now() - new Date(lastLogin).getTime();
  const mins = ms / 60000;
  const hrs = mins / 60;
  const days = hrs / 24;
  if (mins < 5)  return { kind: 'online', label: 'Online ora' };
  if (hrs < 1)   return { kind: 'recent', label: `${Math.round(mins)}m fa` };
  if (hrs < 24)  return { kind: 'today',  label: `${Math.round(hrs)}h fa` };
  if (days < 7)  return { kind: 'week',   label: `${Math.round(days)}g fa` };
  if (days < 30) return { kind: 'cold',   label: `${Math.round(days)}g fa` };
  if (days < 365) return { kind: 'cold',  label: `${Math.round(days / 30)} mesi fa` };
  return { kind: 'cold', label: `${Math.round(days / 365)}a fa` };
}

function activityPill(bucket: Activity): string {
  return bucket === 'online' ? 'pill pill-ok'
    : bucket === 'recent' ? 'pill pill-info'
    : bucket === 'today'  ? 'pill'
    : bucket === 'week'   ? 'pill'
    : 'pill';
}

function fmtDate(value: string) {
  return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type Tab = 'utenti' | 'sessioni';
type QuickFilter = 'all' | 'online' | 'today' | 'new' | 'suspended';

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
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  useEffect(() => {
    getUsers().then(data => { setUsers(data); setUsersLoading(false); });
  }, []);

  useEffect(() => {
    if (activeTab !== 'sessioni') return;
    setSessionsLoading(true);
    getSessions({ limit: SESSIONS_PAGE_SIZE, offset: sessionsOffset }).then(r => {
      setSessions(r.data); setSessionsTotal(r.total); setSessionsLoading(false);
    });
  }, [activeTab, sessionsOffset]);

  /* ── KPI from users array ── */
  const kpi = useMemo(() => {
    const now = Date.now();
    let onlineNow = 0, active24h = 0, new7d = 0;
    for (const u of users) {
      const loginMs = new Date(u.lastLogin).getTime();
      const ageLoginMin = (now - loginMs) / 60000;
      if (ageLoginMin < 5) onlineNow++;
      if (ageLoginMin < 24 * 60) active24h++;
      const ageCreatedDays = (now - new Date(u.createdAt).getTime()) / 86400000;
      if (ageCreatedDays < 7) new7d++;
    }
    return { onlineNow, active24h, new7d, total: users.length };
  }, [users]);

  /* ── Filter & sort users ── */
  const filteredUsers = useMemo(() => {
    const now = Date.now();
    const q = search.toLowerCase();
    return users.filter(u => {
      if (search && !(u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))) return false;
      if (quickFilter === 'online') {
        const age = (now - new Date(u.lastLogin).getTime()) / 60000;
        if (age >= 5) return false;
      }
      if (quickFilter === 'today') {
        const age = (now - new Date(u.lastLogin).getTime()) / 3600000;
        if (age >= 24) return false;
      }
      if (quickFilter === 'new') {
        const age = (now - new Date(u.createdAt).getTime()) / 86400000;
        if (age >= 7) return false;
      }
      if (quickFilter === 'suspended' && u.status !== 'suspended') return false;
      return true;
    }).sort((a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime());
  }, [users, search, quickFilter]);

  const filteredSessions = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s =>
      s.userName.toLowerCase().includes(q) ||
      s.userEmail.toLowerCase().includes(q) ||
      (s.location ?? '').toLowerCase().includes(q) ||
      deviceName(s).toLowerCase().includes(q)
    );
  }, [sessions, search]);

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>

      {/* ── Hero KPI strip ── */}
      {activeTab === 'utenti' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Online ora', value: kpi.onlineNow, icon: UserCheck, tone: 'ok' as const, hint: 'ultimi 5 min' },
            { label: 'Attivi 24h', value: kpi.active24h, icon: Activity,  tone: 'info' as const, hint: 'ultime 24 ore' },
            { label: 'Nuovi 7g',   value: kpi.new7d,     icon: Sparkles,  tone: 'accent' as const, hint: 'registrati' },
            { label: 'Totali',     value: kpi.total,     icon: UsersIcon, tone: 'neutral' as const, hint: 'base utenti' },
          ].map(k => {
            const Ic = k.icon;
            const pillClass =
              k.tone === 'ok' ? 'pill pill-ok'
              : k.tone === 'info' ? 'pill pill-info'
              : k.tone === 'accent' ? 'pill pill-accent'
              : 'pill';
            return (
              <div key={k.label} className="card card-body" style={{ padding: 12 }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="typ-micro truncate">{k.label}</span>
                  <span className={pillClass} style={{ padding: '2px 6px' }}>
                    <Ic className="w-3 h-3" />
                  </span>
                </div>
                <div className="typ-metric mt-1" style={{ fontSize: 24 }}>{k.value.toLocaleString('it-IT')}</div>
                <div className="typ-caption truncate" style={{ fontSize: 11 }}>{k.hint}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-col sm:flex-row">
        <div className="relative w-full sm:grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={activeTab === 'utenti' ? 'Cerca nome o email...' : 'Cerca sessioni...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        {activeTab === 'utenti' && (
          <button onClick={() => router.push('/users/new')} className="btn btn-primary btn-sm w-full sm:w-auto">
            <UserPlus className="w-4 h-4" /> Invita
          </button>
        )}
      </div>

      {/* ── Tabs segmented + quick filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="p-1 rounded-[var(--r)]" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)', display: 'inline-flex' }}>
          <button
            onClick={() => setActiveTab('utenti')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[calc(var(--r)-2px)] typ-label transition-colors"
            style={{
              background: activeTab === 'utenti' ? 'var(--card)' : 'transparent',
              color: activeTab === 'utenti' ? 'var(--text-hi)' : 'var(--text-muted)',
              boxShadow: activeTab === 'utenti' ? 'var(--shadow-card)' : 'none',
            }}
          >
            <UsersIcon className="w-4 h-4" strokeWidth={1.75} />
            Utenti
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

        {/* Quick filters — only on Utenti tab */}
        {activeTab === 'utenti' && (
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { id: 'all' as const,       label: 'Tutti' },
              { id: 'online' as const,    label: 'Online ora' },
              { id: 'today' as const,     label: 'Attivi oggi' },
              { id: 'new' as const,       label: 'Nuovi 7g' },
              { id: 'suspended' as const, label: 'Sospesi' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setQuickFilter(f.id)}
                className={quickFilter === f.id ? 'pill pill-accent' : 'pill'}
                style={{ cursor: 'pointer', padding: '6px 10px', fontSize: 12 }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Utenti ── */}
      {activeTab === 'utenti' && (
        usersLoading ? <Spinner /> : filteredUsers.length === 0 ? (
          <div className="card card-body text-center">
            <UsersIcon className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="typ-caption">Nessun utente per questo filtro.</p>
          </div>
        ) : (
          <div className="vstack-tight">
            {filteredUsers.map(u => {
              const bucket = activityBucket(u.lastLogin);
              return (
                <div
                  key={u.id}
                  onClick={() => router.push(`/users/${u.id}`)}
                  className="card card-hover"
                  style={{ cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {u.avatarUrl ? (
                      <div className="w-11 h-11 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${u.avatarUrl})`, border: '1px solid var(--hairline-soft)' }} />
                    ) : (
                      <div className="w-11 h-11 rounded-full inline-grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', fontSize: 14, fontWeight: 600 }}>
                        {u.avatar}
                      </div>
                    )}
                    {bucket.kind === 'online' && (
                      <span className="dot dot-ok dot-pulse" style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, border: '2px solid var(--card)' }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="grow min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="typ-label truncate">{u.name}</div>
                      {u.status === 'suspended' && <span className="pill pill-err" style={{ fontSize: 10, padding: '1px 6px' }}>sospeso</span>}
                      {u.status === 'inactive'  && <span className="pill"         style={{ fontSize: 10, padding: '1px 6px' }}>inattivo</span>}
                    </div>
                    <div className="typ-caption truncate">{u.email}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={activityPill(bucket.kind)} style={{ fontSize: 11, padding: '2px 8px' }}>
                        {bucket.kind === 'online' && <span className="dot dot-ok dot-pulse" style={{ width: 6, height: 6 }} />}
                        <Flame className="w-3 h-3" /> {bucket.label}
                      </span>
                      <span className="typ-caption">
                        {u.sessionsCount.toLocaleString('it-IT')} sess.
                        {u.revenue > 0 && ` · €${u.revenue}`}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Sessioni ── */}
      {activeTab === 'sessioni' && (
        <>
          {sessionsLoading ? <Spinner /> : filteredSessions.length === 0 ? (
            <div className="card card-body text-center">
              <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="typ-caption">Nessuna sessione.</p>
            </div>
          ) : isWide ? (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="grid items-center gap-3 px-4 py-2.5" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 140px 100px', background: 'var(--card-muted)', borderBottom: '1px solid var(--hairline-soft)' }}>
                <span className="typ-micro">Utente</span>
                <span className="typ-micro">Dispositivo</span>
                <span className="typ-micro">Posizione</span>
                <span className="typ-micro">Ultima attività</span>
                <span className="typ-micro">Durata</span>
              </div>
              {filteredSessions.map(s => {
                const mins = Math.floor(s.duration / 60);
                const secs = s.duration % 60;
                return (
                  <div key={s.id} className="grid items-center gap-3 px-4 py-3" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 140px 100px', borderBottom: '1px solid var(--hairline-soft)' }}>
                    <div className="min-w-0">
                      <div className="typ-label truncate">{s.userName}</div>
                      <div className="typ-caption truncate">{s.userEmail}</div>
                    </div>
                    <span className="typ-caption truncate">{deviceName(s)}</span>
                    <span className="typ-caption truncate">{cityName(s)}</span>
                    <span className="typ-caption">{fmtDate(s.createdAt)}</span>
                    <span className="typ-mono" style={{ fontSize: 12 }}>{mins}m {secs}s</span>
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
                    <div className="typ-label truncate">{s.userName}</div>
                    <div className="typ-caption truncate">{s.userEmail}</div>
                    <div className="flex items-center gap-3 mt-2 typ-caption">
                      <span>{deviceName(s)}</span>
                      <span>·</span>
                      <span>{cityName(s)}</span>
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

          {sessionsTotal > SESSIONS_PAGE_SIZE && (
            <div className="flex items-center justify-between typ-caption pt-1">
              <span>{sessionsOffset + 1}–{Math.min(sessionsOffset + SESSIONS_PAGE_SIZE, sessionsTotal)} di {sessionsTotal.toLocaleString('it-IT')}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setSessionsOffset(o => Math.max(0, o - SESSIONS_PAGE_SIZE))} disabled={sessionsOffset === 0 || sessionsLoading} className="btn btn-ghost btn-sm btn-icon">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="typ-mono">{Math.floor(sessionsOffset / SESSIONS_PAGE_SIZE) + 1}/{Math.ceil(sessionsTotal / SESSIONS_PAGE_SIZE)}</span>
                <button onClick={() => setSessionsOffset(o => o + SESSIONS_PAGE_SIZE)} disabled={sessionsOffset + SESSIONS_PAGE_SIZE >= sessionsTotal || sessionsLoading} className="btn btn-ghost btn-sm btn-icon">
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
