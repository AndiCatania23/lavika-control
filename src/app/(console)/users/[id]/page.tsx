'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getUserById, type User,
  getSessionsByUserId, type Session,
  getUserInsights, type UserContentInsights,
} from '@/lib/data';
import {
  ArrowLeft, Mail, Copy, Shield, Clock, MapPin, Calendar, Smartphone,
  Film, TrendingUp, Flame, CreditCard, Moon, Sun, Sunrise, Sunset,
} from 'lucide-react';
import { useToast } from '@/lib/toast';

const emptyInsights: UserContentInsights = {
  userId: '', totalViews: 0, uniqueFormats: 0, uniqueSeasons: 0, uniqueEpisodes: 0,
  rewatchedEpisodes: 0, rewatchRate: 0, favoritesCount: 0, watchTimeSeconds: 0,
  activeDays: 0, avgViewsPerActiveDay: 0,
  firstViewAt: null, lastViewAt: null, lastActivityAt: null,
  activeNow: false, active24h: false, active7d: false,
  preferredDayPart: 'n/d', engagementSegment: 'new',
  topFormats: [], topEpisodes: [], topSeasons: [], topPages: [],
};

/* ── Helpers ── */

function formatWatchTime(seconds: number): string {
  if (seconds <= 0) return '0m';
  const m = Math.round(seconds / 60);
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

function computeScore(i: UserContentInsights): number {
  const volume    = Math.min(35, i.totalViews / 3);
  const frequency = Math.min(25, i.activeDays * 2.2);
  const depth     = Math.min(20, i.uniqueEpisodes * 1.1);
  const loyalty   = Math.min(20, i.rewatchRate * 100 * 0.45 + i.favoritesCount * 0.8);
  return Math.round(Math.min(100, volume + frequency + depth + loyalty));
}

function segmentInfo(s: UserContentInsights['engagementSegment']): { label: string; pill: string } {
  if (s === 'power')  return { label: 'Power',  pill: 'pill pill-err' };
  if (s === 'core')   return { label: 'Core',   pill: 'pill pill-info' };
  if (s === 'casual') return { label: 'Casual', pill: 'pill pill-warn' };
  return { label: 'New', pill: 'pill' };
}

function dayPartIcon(dayPart: string) {
  const k = (dayPart || '').toLowerCase();
  if (k.includes('matt') || k.includes('morn')) return <Sunrise className="w-3.5 h-3.5" />;
  if (k.includes('pome') || k.includes('afte')) return <Sun     className="w-3.5 h-3.5" />;
  if (k.includes('sera') || k.includes('even')) return <Sunset  className="w-3.5 h-3.5" />;
  if (k.includes('nott') || k.includes('nigh')) return <Moon    className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = ms / 60000, hrs = mins / 60, days = hrs / 24;
  if (mins < 1)  return 'ora';
  if (mins < 60) return `${Math.round(mins)}m fa`;
  if (hrs < 24)  return `${Math.round(hrs)}h fa`;
  if (days < 30) return `${Math.round(days)}g fa`;
  if (days < 365) return `${Math.round(days / 30)} mesi fa`;
  return `${Math.round(days / 365)}a fa`;
}

function fmtDateFull(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function deviceName(s: Session): string {
  const src = s.deviceLabel ?? s.device ?? 'Unknown device';
  return src.split(' · ')[0]?.trim() || 'Unknown device';
}

function cityName(location?: string | null): string {
  const src = location ?? 'Unknown';
  const wo = src.split(' · ')[0] ?? src;
  const c = wo.split(',')[0]?.trim();
  return c && c.length > 0 ? c : 'Unknown';
}

/* ── Page ── */

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();

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

  const score = useMemo(() => computeScore(insights), [insights]);
  const segment = useMemo(() => segmentInfo(insights.engagementSegment), [insights]);

  /* Detect session anomaly: multiple unique cities in last 5 sessions */
  const locationFlag = useMemo(() => {
    const cities = new Set(sessions.map(s => cityName(s.location)));
    cities.delete('Unknown');
    return cities.size >= 3;
  }, [sessions]);

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

  const copyId = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(user.id).then(() => showToast('success', 'ID copiato'));
    }
  };

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      <button onClick={() => router.push('/users')} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft className="w-4 h-4" /> Torna agli utenti
      </button>

      {/* ══════════════════════════════════════════════
          HERO + ACTIONS + SCORE
          ══════════════════════════════════════════════ */}
      <div className="card card-body">
        {/* Top: avatar + name + pills (actions below on mobile, right on wide) */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            {user.avatarUrl ? (
              <div className="w-14 h-14 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${user.avatarUrl})`, border: '1px solid var(--hairline-soft)' }} />
            ) : (
              <div className="w-14 h-14 rounded-full inline-grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', fontSize: 18, fontWeight: 600 }}>
                {user.avatar}
              </div>
            )}
            {insights.activeNow && (
              <span className="dot dot-ok dot-pulse" style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, border: '2px solid var(--card)' }} />
            )}
          </div>
          <div className="grow min-w-0">
            <div className="typ-h1 truncate">{user.name}</div>
            <div className="typ-caption truncate">{user.email}</div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className={segment.pill} style={{ fontSize: 11 }}>{segment.label}</span>
              {insights.activeNow && <span className="pill pill-ok" style={{ fontSize: 11 }}><span className="dot dot-ok dot-pulse" />Online</span>}
              {user.status === 'suspended' && <span className="pill pill-err" style={{ fontSize: 11 }}>Sospeso</span>}
              {user.status === 'inactive'  && <span className="pill" style={{ fontSize: 11 }}>Inattivo</span>}
              <span className="typ-caption">Iscritto {timeAgo(user.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Action bar — stack under on narrow, inline above on wide via reordering */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[color:var(--hairline-soft)] flex-wrap">
          <a href={`mailto:${user.email}`} className="btn btn-ghost btn-sm">
            <Mail className="w-4 h-4" /> Email
          </a>
          <button onClick={copyId} className="btn btn-ghost btn-sm">
            <Copy className="w-4 h-4" /> Copia ID
          </button>
          {user.status !== 'suspended' && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', marginLeft: 'auto' }}>
              <Shield className="w-4 h-4" /> Sospendi
            </button>
          )}
        </div>

        {/* Score progress */}
        <div className="mt-4 pt-4 border-t border-[color:var(--hairline-soft)]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="typ-micro">Engagement score</span>
            <span className="typ-mono" style={{ fontSize: 13, fontWeight: 600 }}>{score}/100</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--hairline-soft)' }}>
            <div className="h-full transition-all" style={{ background: 'var(--accent-raw)', width: `${score}%` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <HeroKpi label="Views"      value={insights.totalViews.toLocaleString('it-IT')} />
            <HeroKpi label="Watch time" value={formatWatchTime(insights.watchTimeSeconds)} />
            <HeroKpi label="Giorni attivi" value={`${insights.activeDays}g`} />
            <HeroKpi label="Rewatch"    value={`${(insights.rewatchRate * 100).toFixed(0)}%`} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          MAIN GRID: 2 columns xl+
          ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="vstack" style={{ gap: 'var(--s4)' }}>

          {/* ── 1. COSA GUARDA ── */}
          <Section title="Cosa guarda" icon={<Film className="w-4 h-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="typ-micro mb-2">Top format</div>
                {insights.topFormats.length > 0 ? (
                  <div className="vstack-tight">
                    {insights.topFormats.slice(0, 3).map((f, i) => (
                      <div key={f.formatId}>
                        <div className="flex items-center justify-between typ-body mb-1">
                          <span className="truncate pr-2">
                            <span className="typ-mono" style={{ color: 'var(--text-muted)', fontSize: 12, marginRight: 8 }}>#{i + 1}</span>
                            {f.formatName}
                          </span>
                          <span className="typ-caption shrink-0">{(f.share * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hairline-soft)' }}>
                          <div className="h-full" style={{ background: 'var(--accent-raw)', width: `${Math.min(100, f.share * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="typ-caption">Nessun dato ancora.</div>
                )}
              </div>

              <div>
                <div className="typ-micro mb-2">Top episodi</div>
                {insights.topEpisodes.length > 0 ? (
                  <div className="vstack-tight">
                    {insights.topEpisodes.slice(0, 5).map((e, i) => (
                      <div key={e.episodeId} className="flex items-center gap-2">
                        <span className="typ-mono shrink-0" style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 22 }}>#{i + 1}</span>
                        <div className="grow min-w-0">
                          <div className="typ-body truncate">{e.episodeName}</div>
                          {e.rewatched && (
                            <span className="pill pill-accent inline-block mt-0.5" style={{ fontSize: 10, padding: '1px 6px' }}>
                              rivisto
                            </span>
                          )}
                        </div>
                        <span className="typ-mono shrink-0 tabular-nums" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.views}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="typ-caption">Nessun episodio tracciato.</div>
                )}
              </div>
            </div>

            {insights.favoritesCount > 0 && (
              <div className="typ-caption mt-3 pt-3 border-t border-[color:var(--hairline-soft)]">
                ⭐ {insights.favoritesCount} preferiti salvati
              </div>
            )}
          </Section>

          {/* ── 2. QUANDO È ATTIVO ── */}
          <Section title="Quando è attivo" icon={<TrendingUp className="w-4 h-4" />}>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Ora',    value: insights.activeNow },
                { label: '24h',    value: insights.active24h },
                { label: '7g',     value: insights.active7d },
              ].map(a => (
                <div key={a.label} className="card card-body text-center" style={{ padding: 12, boxShadow: 'none', background: a.value ? 'color-mix(in oklab, var(--ok) 8%, var(--card))' : 'var(--card-muted)', borderColor: a.value ? 'color-mix(in oklab, var(--ok) 30%, transparent)' : 'var(--hairline-soft)' }}>
                  <div className="typ-micro">{a.label}</div>
                  <div className="typ-metric mt-1" style={{ fontSize: 20, color: a.value ? 'var(--ok)' : 'var(--text-muted)' }}>
                    {a.value ? 'SÌ' : 'NO'}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-grid place-items-center shrink-0" style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)', color: 'var(--accent-raw)' }}>
                  {dayPartIcon(insights.preferredDayPart)}
                </span>
                <div className="min-w-0">
                  <div className="typ-micro">Fascia preferita</div>
                  <div className="typ-label capitalize">{insights.preferredDayPart || 'n/d'}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="inline-grid place-items-center shrink-0" style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)', color: 'var(--accent-raw)' }}>
                  <Flame className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="typ-micro">Views / giorno</div>
                  <div className="typ-label">{insights.avgViewsPerActiveDay.toFixed(1)}</div>
                </div>
              </div>
            </div>

            <div className="typ-caption mt-3 pt-3 border-t border-[color:var(--hairline-soft)]">
              Ultima attività {timeAgo(insights.lastActivityAt)} · ultima view {timeAgo(insights.lastViewAt)}
            </div>
          </Section>

          {/* ── 3. DOVE ACCEDE ── */}
          <Section
            title="Dove accede"
            icon={<Smartphone className="w-4 h-4" />}
            flag={locationFlag ? 'Accessi da città multiple' : undefined}
          >
            {sessions.length === 0 ? (
              <div className="typ-caption">Nessuna sessione recente.</div>
            ) : (
              <div className="vstack-tight">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-start gap-2.5">
                    <span className="inline-grid place-items-center shrink-0 mt-0.5" style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)' }}>
                      <Smartphone className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </span>
                    <div className="grow min-w-0">
                      <div className="typ-label truncate">{deviceName(s)}</div>
                      <div className="typ-caption truncate">
                        <MapPin className="inline w-3 h-3 mr-0.5" />
                        {cityName(s.location)}
                      </div>
                    </div>
                    <div className="shrink-0 typ-caption" style={{ textAlign: 'right' }}>
                      {timeAgo(s.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ══════════════════════════════════════════════
            SIDEBAR destra (desktop) / dopo (mobile)
            ══════════════════════════════════════════════ */}
        <div className="vstack" style={{ gap: 'var(--s4)' }}>
          <div className="card card-body">
            <h3 className="typ-h2 mb-3">Profilo</h3>
            <div className="vstack" style={{ gap: 'var(--s3)' }}>
              <SidebarRow icon={<Calendar className="w-3.5 h-3.5" />} label="Iscritto"     value={new Date(user.createdAt).toLocaleDateString('it-IT')} />
              <SidebarRow icon={<Clock className="w-3.5 h-3.5" />}    label="Ultimo login" value={`${timeAgo(user.lastLogin)} · ${fmtDateFull(user.lastLogin)}`} />
              <SidebarRow icon={<MapPin className="w-3.5 h-3.5" />}   label="Ultima città" value={cityName(sessions[0]?.location)} />
              {user.revenue > 0 && (
                <SidebarRow icon={<CreditCard className="w-3.5 h-3.5" />} label="Revenue" value={`$${user.revenue}`} />
              )}
            </div>
          </div>

          <div className="card card-body">
            <h3 className="typ-h2 mb-3">Timeline</h3>
            <div className="vstack-tight typ-body">
              <div className="flex items-center justify-between">
                <span className="typ-caption">Prima view</span>
                <span className="typ-caption" style={{ color: 'var(--text-hi)' }}>{timeAgo(insights.firstViewAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="typ-caption">Ultima view</span>
                <span className="typ-caption" style={{ color: 'var(--text-hi)' }}>{timeAgo(insights.lastViewAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="typ-caption">Ultima attività</span>
                <span className="typ-caption" style={{ color: 'var(--text-hi)' }}>{timeAgo(insights.lastActivityAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers components ── */

function Section({ title, icon, flag, children }: { title: string; icon: React.ReactNode; flag?: string; children: React.ReactNode }) {
  return (
    <div className="card card-body">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-2 grow">
          <span style={{ color: 'var(--accent-raw)' }}>{icon}</span>
          <h3 className="typ-h2">{title}</h3>
        </span>
        {flag && (
          <span className="pill pill-warn" style={{ fontSize: 10, padding: '2px 8px' }}>
            ⚠ {flag}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function HeroKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-body" style={{ padding: 10, background: 'var(--card-muted)', boxShadow: 'none' }}>
      <div className="typ-micro">{label}</div>
      <div className="typ-metric mt-1" style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}

function SidebarRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-grid place-items-center shrink-0" style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)', color: 'var(--text-muted)' }}>
        {icon}
      </span>
      <div className="min-w-0 grow">
        <div className="typ-micro">{label}</div>
        <div className="typ-label truncate">{value}</div>
      </div>
    </div>
  );
}
