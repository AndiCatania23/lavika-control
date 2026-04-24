'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getUserById, type User,
  getSessionsByUserId, type Session,
  getUserInsights, type UserContentInsights,
} from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import {
  ArrowLeft, Eye, Repeat2, Star, Clock, Flame, Film, Layers, Trophy,
  Calendar, CreditCard, MapPin, Gauge, Activity,
} from 'lucide-react';

const emptyInsights: UserContentInsights = {
  userId: '', totalViews: 0, uniqueFormats: 0, uniqueSeasons: 0, uniqueEpisodes: 0,
  rewatchedEpisodes: 0, rewatchRate: 0, favoritesCount: 0, watchTimeSeconds: 0,
  activeDays: 0, avgViewsPerActiveDay: 0,
  firstViewAt: null, lastViewAt: null, lastActivityAt: null,
  activeNow: false, active24h: false, active7d: false,
  preferredDayPart: 'n/d', engagementSegment: 'new',
  topFormats: [], topEpisodes: [], topSeasons: [], topPages: [],
};

function formatWatchTime(seconds: number): string {
  if (seconds <= 0) return '0m';
  const minutes = Math.round(seconds / 60);
  const days  = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins  = minutes % 60;
  if (days > 0)  return `${days}g ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function segmentLabel(s: UserContentInsights['engagementSegment']): string {
  return s === 'power' ? 'Power' : s === 'core' ? 'Core' : s === 'casual' ? 'Casual' : 'New';
}

function segmentPillClass(s: UserContentInsights['engagementSegment']): string {
  return s === 'power' ? 'pill pill-err'
    : s === 'core'   ? 'pill pill-info'
    : s === 'casual' ? 'pill pill-warn'
    : 'pill';
}

function fmtDateTime(value: string | null): string {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(value: string) {
  return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function computeEngagementScore(i: UserContentInsights): number {
  const volume    = Math.min(35, i.totalViews / 3);
  const frequency = Math.min(25, i.activeDays * 2.2);
  const depth     = Math.min(20, i.uniqueEpisodes * 1.1);
  const loyalty   = Math.min(20, i.rewatchRate * 100 * 0.45 + i.favoritesCount * 0.8);
  return Math.round(Math.min(100, volume + frequency + depth + loyalty));
}

function deviceName(s: Session): string {
  const src = s.deviceLabel ?? s.device ?? 'Unknown device';
  return src.split(' · ')[0]?.trim() || 'Unknown device';
}

function cityName(location?: string | null): string {
  const src = location ?? 'Unknown';
  const woCoord = src.split(' · ')[0] ?? src;
  const city = woCoord.split(',')[0]?.trim();
  return city && city.length > 0 ? city : 'Unknown';
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [insights, setInsights] = useState<UserContentInsights>(emptyInsights);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id as string;
    Promise.all([getUserById(id), getSessionsByUserId(id), getUserInsights(id)]).then(([u, s, i]) => {
      setUser(u || null);
      setSessions(s.data.slice(0, 5));
      setInsights(i);
      setLoading(false);
    });
  }, [params.id]);

  const score = useMemo(() => computeEngagementScore(insights), [insights]);
  const lastCity = useMemo(() => cityName(sessions[0]?.location), [sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card card-body text-center">
        <p className="typ-caption">Utente non trovato</p>
        <button onClick={() => router.push('/users')} className="btn btn-ghost btn-sm mt-3" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          Torna agli utenti
        </button>
      </div>
    );
  }

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <button onClick={() => router.push('/users')} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft className="w-4 h-4" /> Torna agli utenti
      </button>

      {/* ── Header ── */}
      <div className="card card-body">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {user.avatarUrl ? (
              <div className="w-16 h-16 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${user.avatarUrl})`, border: '1px solid var(--hairline-soft)' }} />
            ) : (
              <div className="w-16 h-16 rounded-full inline-grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', fontSize: 20, fontWeight: 600 }}>
                {user.avatar}
              </div>
            )}
            <div className="min-w-0">
              <div className="typ-h1 truncate">{user.name}</div>
              <div className="typ-caption truncate">{user.email}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusPill status={user.status} size="sm" />
                <span className={segmentPillClass(insights.engagementSegment)} style={{ fontSize: 11 }}>
                  {segmentLabel(insights.engagementSegment)}
                </span>
                <span className={insights.activeNow ? 'pill pill-ok' : 'pill'} style={{ fontSize: 11 }}>
                  <span className={insights.activeNow ? 'dot dot-ok dot-pulse' : 'dot'} />
                  {insights.activeNow ? 'Attivo ora' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Hero KPI (4) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto lg:min-w-[440px]">
            {[
              { icon: Eye,     label: 'Views',      value: insights.totalViews.toLocaleString('it-IT') },
              { icon: Clock,   label: 'Watch time', value: formatWatchTime(insights.watchTimeSeconds) },
              { icon: Repeat2, label: 'Rewatch',    value: `${(insights.rewatchRate * 100).toFixed(1)}%` },
              { icon: Flame,   label: 'Attività',   value: `${insights.activeDays}g` },
            ].map(k => {
              const Ic = k.icon;
              return (
                <div key={k.label} className="card card-body" style={{ padding: 10, background: 'var(--card-muted)', boxShadow: 'none' }}>
                  <div className="typ-micro inline-flex items-center gap-1"><Ic className="w-3 h-3" /> {k.label}</div>
                  <div className="typ-label mt-1" style={{ fontSize: 16, fontWeight: 600 }}>{k.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 vstack" style={{ gap: 'var(--s4)' }}>

          {/* Engagement score */}
          <div className="card card-body">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4" style={{ color: 'var(--accent-raw)' }} strokeWidth={1.75} />
                <h3 className="typ-h2">KPI Utente</h3>
              </div>
              <span className="typ-caption">Score {score}/100</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: 'var(--hairline-soft)' }}>
              <div className="h-full transition-all" style={{ background: 'var(--accent-raw)', width: `${score}%` }} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { icon: Film,   label: 'Format',   value: insights.uniqueFormats },
                { icon: Layers, label: 'Stagioni', value: insights.uniqueSeasons },
                { icon: Trophy, label: 'Episodi',  value: insights.uniqueEpisodes },
                { icon: Star,   label: 'Preferiti',value: insights.favoritesCount },
              ].map(k => {
                const Ic = k.icon;
                return (
                  <div key={k.label} className="card card-body" style={{ padding: 10, boxShadow: 'none' }}>
                    <div className="typ-micro inline-flex items-center gap-1"><Ic className="w-3 h-3" /> {k.label}</div>
                    <div className="typ-metric mt-1" style={{ fontSize: 20 }}>{k.value}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Format + Top Episodi */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card card-body">
              <h3 className="typ-h2 inline-flex items-center gap-2 mb-3">
                <Film className="w-4 h-4" style={{ color: 'var(--accent-raw)' }} strokeWidth={1.75} /> Top Format
              </h3>
              <div className="vstack-tight">
                {insights.topFormats.map((f, i) => (
                  <div key={f.formatId}>
                    <div className="flex items-center justify-between mb-1 typ-body">
                      <span className="truncate pr-2">{i + 1}. {f.formatName}</span>
                      <span className="typ-caption">{(f.share * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hairline-soft)' }}>
                      <div className="h-full" style={{ background: 'var(--accent-raw)', width: `${Math.min(100, f.share * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {insights.topFormats.length === 0 && <div className="typ-caption">Nessun dato.</div>}
              </div>
            </div>

            <div className="card card-body">
              <h3 className="typ-h2 inline-flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4" style={{ color: 'var(--accent-raw)' }} strokeWidth={1.75} /> Top 5 Episodi
              </h3>
              <div className="vstack-tight">
                {insights.topEpisodes.map((e, i) => (
                  <div key={e.episodeId} className="card card-body" style={{ padding: 10, boxShadow: 'none' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="typ-label truncate">{i + 1}. {e.episodeName}</span>
                      <span className="typ-mono shrink-0" style={{ fontSize: 12 }}>{e.views}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 typ-caption">
                      <span className="truncate">{e.seasonName}</span>
                      {e.rewatched && <span style={{ color: 'var(--accent-raw)' }}>Rivisto</span>}
                    </div>
                  </div>
                ))}
                {insights.topEpisodes.length === 0 && <div className="typ-caption">Nessun episodio tracciato.</div>}
              </div>
            </div>
          </div>

          {/* Top Pagine */}
          <div className="card card-body">
            <h3 className="typ-h2 inline-flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4" style={{ color: 'var(--accent-raw)' }} strokeWidth={1.75} /> Top Pagine
            </h3>
            <div className="vstack-tight">
              {insights.topPages.map((p, i) => (
                <div key={p.path} className="card card-body" style={{ padding: 10, boxShadow: 'none' }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="typ-label truncate">{i + 1}. {p.title}</span>
                    <span className="typ-mono shrink-0" style={{ fontSize: 12 }}>{p.views}</span>
                  </div>
                  <div className="typ-caption mt-1 truncate typ-mono" style={{ fontSize: 11 }}>{p.path}</div>
                  <div className="flex items-center justify-between mt-1.5 typ-caption">
                    <span>{(p.share * 100).toFixed(1)}%</span>
                    <span>{fmtDateTime(p.lastViewedAt)}</span>
                  </div>
                </div>
              ))}
              {insights.topPages.length === 0 && <div className="typ-caption">Nessuna pagina tracciata.</div>}
            </div>
          </div>

          {/* Recent sessions + Snapshot */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card card-body">
              <h3 className="typ-h2 inline-flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4" style={{ color: 'var(--accent-raw)' }} strokeWidth={1.75} /> Sessioni recenti
              </h3>
              {sessions.length > 0 ? (
                <div className="vstack-tight">
                  {sessions.map(s => (
                    <div key={s.id} className="card card-body" style={{ padding: 10, boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="grow min-w-0">
                        <div className="typ-label truncate">{deviceName(s)}</div>
                        <div className="typ-caption truncate">Source: {s.locationSourceLabel ?? 'Unknown'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="typ-caption">{cityName(s.location)}</div>
                        <div className="typ-caption" style={{ fontSize: 11 }}>{fmtDateShort(s.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="typ-caption">Nessuna sessione.</div>
              )}
            </div>

            <div className="card card-body">
              <h3 className="typ-h2 mb-3">Snapshot</h3>
              <div className="vstack-tight typ-body">
                <div className="flex items-center justify-between"><span className="typ-caption">Top format</span><span className="truncate max-w-[160px] text-right">{insights.topFormats[0]?.formatName ?? 'N/A'}</span></div>
                <div className="flex items-center justify-between"><span className="typ-caption">Episodi rivisti</span><span className="typ-mono">{insights.rewatchedEpisodes}</span></div>
                <div className="flex items-center justify-between"><span className="typ-caption">Views / giorno</span><span className="typ-mono">{insights.avgViewsPerActiveDay.toFixed(1)}</span></div>
                <div className="flex items-center justify-between"><span className="typ-caption">Fascia oraria</span><span className="capitalize">{insights.preferredDayPart}</span></div>
                <div className="pt-2 mt-1 border-t border-[color:var(--hairline-soft)]">
                  <div className="typ-micro mb-2">Attività Lavika</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Ora', value: insights.activeNow },
                      { label: '24h', value: insights.active24h },
                      { label: '7g',  value: insights.active7d },
                    ].map(a => (
                      <div key={a.label} className="card card-body text-center" style={{ padding: 8, boxShadow: 'none' }}>
                        <div className="typ-micro">{a.label}</div>
                        <div className="typ-label mt-1" style={{ color: a.value ? 'var(--ok)' : 'var(--text-muted)' }}>
                          {a.value ? 'SÌ' : 'NO'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="vstack" style={{ gap: 'var(--s4)' }}>
          <div className="card card-body">
            <h3 className="typ-h2 mb-3">Profilo</h3>
            <div className="vstack" style={{ gap: 'var(--s3)' }}>
              {[
                { icon: Calendar,   label: 'Iscritto',     value: new Date(user.createdAt).toLocaleDateString('it-IT') },
                { icon: Clock,      label: 'Ultimo login', value: fmtDateTime(user.lastLogin) },
                { icon: MapPin,     label: 'Location',     value: lastCity },
                { icon: CreditCard, label: 'Revenue',      value: `$${user.revenue}` },
              ].map(f => {
                const Ic = f.icon;
                return (
                  <div key={f.label} className="flex items-center gap-3">
                    <Ic className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />
                    <div className="min-w-0">
                      <div className="typ-micro">{f.label}</div>
                      <div className="typ-label truncate">{f.value}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card card-body">
            <h3 className="typ-h2 mb-3">Timeline</h3>
            <div className="vstack-tight">
              <div className="flex items-center justify-between typ-body">
                <span className="typ-caption">Prima view</span>
                <span className="text-right truncate">{fmtDateTime(insights.firstViewAt)}</span>
              </div>
              <div className="flex items-center justify-between typ-body">
                <span className="typ-caption">Ultima view</span>
                <span className="text-right truncate">{fmtDateTime(insights.lastViewAt)}</span>
              </div>
              <div className="flex items-center justify-between typ-body">
                <span className="typ-caption">Ultima attività</span>
                <span className="text-right truncate">{fmtDateTime(insights.lastActivityAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
