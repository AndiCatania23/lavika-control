'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getUserById,
  type User,
  getSessionsByUserId,
  type Session,
  getUserInsights,
  type UserContentInsights,
} from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import {
  ArrowLeft,
  Eye,
  Repeat2,
  Star,
  Clock,
  Flame,
  Film,
  Layers,
  Trophy,
  Calendar,
  CreditCard,
  MapPin,
  Gauge,
  Activity,
} from 'lucide-react';

const emptyInsights: UserContentInsights = {
  userId: '',
  totalViews: 0,
  uniqueFormats: 0,
  uniqueSeasons: 0,
  uniqueEpisodes: 0,
  rewatchedEpisodes: 0,
  rewatchRate: 0,
  favoritesCount: 0,
  watchTimeSeconds: 0,
  activeDays: 0,
  avgViewsPerActiveDay: 0,
  firstViewAt: null,
  lastViewAt: null,
  lastActivityAt: null,
  activeNow: false,
  active24h: false,
  active7d: false,
  preferredDayPart: 'n/d',
  engagementSegment: 'new',
  topFormats: [],
  topEpisodes: [],
  topSeasons: [],
  topPages: [],
};

function formatWatchTime(seconds: number): string {
  if (seconds <= 0) return '0m';
  const minutes = Math.round(seconds / 60);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}g ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function segmentLabel(segment: UserContentInsights['engagementSegment']): string {
  if (segment === 'power') return 'Power';
  if (segment === 'core') return 'Core';
  if (segment === 'casual') return 'Casual';
  return 'New';
}

function segmentClass(segment: UserContentInsights['engagementSegment']): string {
  if (segment === 'power') return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (segment === 'core') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (segment === 'casual') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-muted text-muted-foreground border-border';
}

function formatDateTime(value: string | null): string {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('it-IT');
}

function activityDotClass(active: boolean): string {
  return active ? 'bg-emerald-500' : 'bg-muted-foreground/40';
}

function computeEngagementScore(insights: UserContentInsights): number {
  const volume = Math.min(35, insights.totalViews / 3);
  const frequency = Math.min(25, insights.activeDays * 2.2);
  const depth = Math.min(20, insights.uniqueEpisodes * 1.1);
  const loyalty = Math.min(20, insights.rewatchRate * 100 * 0.45 + insights.favoritesCount * 0.8);
  return Math.round(Math.min(100, volume + frequency + depth + loyalty));
}

function getDeviceName(session: Session): string {
  const source = session.deviceLabel ?? session.device ?? 'Unknown device';
  return source.split(' · ')[0]?.trim() || 'Unknown device';
}

function getCityName(location: string | undefined): string {
  const source = location ?? 'Unknown';
  const withoutCoordinates = source.split(' · ')[0] ?? source;
  const city = withoutCoordinates.split(',')[0]?.trim();
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
    Promise.all([getUserById(id), getSessionsByUserId(id), getUserInsights(id)]).then(([userData, sessionsData, insightsData]) => {
      setUser(userData || null);
      setSessions(sessionsData.slice(0, 5));
      setInsights(insightsData);
      setLoading(false);
    });
  }, [params.id]);

  const engagementScore = useMemo(() => computeEngagementScore(insights), [insights]);
  const latestSessionCity = useMemo(() => getCityName(sessions[0]?.location), [sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">User not found</p>
        <button onClick={() => router.push('/users')} className="mt-4 text-primary hover:underline">
          Back to users
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/users')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to users
      </button>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {user.avatarUrl ? (
              <div
                className="w-14 h-14 rounded-full bg-cover bg-center border border-border"
                style={{ backgroundImage: `url(${user.avatarUrl})` }}
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-primary text-lg font-semibold">
                {user.avatar}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-lg font-semibold text-foreground truncate">{user.name}</div>
              <div className="text-sm text-muted-foreground truncate">{user.email}</div>
              <div className="flex items-center gap-2 mt-2">
                <StatusPill status={user.status} />
                <span className={`text-[11px] px-2 py-1 rounded border ${segmentClass(insights.engagementSegment)}`}>
                  {segmentLabel(insights.engagementSegment)}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border text-muted-foreground">
                  <span className={`w-1.5 h-1.5 rounded-full ${activityDotClass(insights.activeNow)}`} />
                  {insights.activeNow ? 'Attivo ora' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full lg:w-auto lg:min-w-[520px]">
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Eye className="w-3.5 h-3.5" />Views</div>
              <div className="text-sm font-semibold text-foreground mt-1">{insights.totalViews.toLocaleString('it-IT')}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="w-3.5 h-3.5" />Watch time</div>
              <div className="text-sm font-semibold text-foreground mt-1">{formatWatchTime(insights.watchTimeSeconds)}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Repeat2 className="w-3.5 h-3.5" />Rewatch</div>
              <div className="text-sm font-semibold text-foreground mt-1">{(insights.rewatchRate * 100).toFixed(1)}%</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Flame className="w-3.5 h-3.5" />Attivita</div>
              <div className="text-sm font-semibold text-foreground mt-1">{insights.activeDays} giorni</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                KPI Utente
              </h3>
              <span className="text-xs text-muted-foreground">Score {engagementScore}/100</span>
            </div>

            <div className="h-2 rounded-full border border-border overflow-hidden mb-4">
              <div className="h-full bg-primary" style={{ width: `${engagementScore}%` }} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-border p-3">
                <div className="text-muted-foreground flex items-center gap-1"><Film className="w-3.5 h-3.5" />Format unici</div>
                <div className="text-foreground font-semibold text-base mt-1">{insights.uniqueFormats}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-muted-foreground flex items-center gap-1"><Layers className="w-3.5 h-3.5" />Stagioni uniche</div>
                <div className="text-foreground font-semibold text-base mt-1">{insights.uniqueSeasons}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-muted-foreground flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />Episodi unici</div>
                <div className="text-foreground font-semibold text-base mt-1">{insights.uniqueEpisodes}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-muted-foreground flex items-center gap-1"><Star className="w-3.5 h-3.5" />Preferiti</div>
                <div className="text-foreground font-semibold text-base mt-1">{insights.favoritesCount}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <Film className="w-4 h-4" />
                Top Format
              </h3>
              <div className="space-y-3">
                {insights.topFormats.map((format, index) => (
                  <div key={format.formatId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-foreground truncate pr-2">{index + 1}. {format.formatName}</span>
                      <span className="text-muted-foreground">{(format.share * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full border border-border overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, format.share * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {insights.topFormats.length === 0 && <div className="text-xs text-muted-foreground">Nessun dato formato.</div>}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4" />
                Top 5 Episodi
              </h3>
              <div className="space-y-2.5">
                {insights.topEpisodes.map((episode, index) => (
                  <div key={episode.episodeId} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground truncate">{index + 1}. {episode.episodeName}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{episode.views}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between gap-2">
                      <span className="truncate">{episode.seasonName}</span>
                      {episode.rewatched ? <span className="text-primary">Rivisto</span> : null}
                    </div>
                  </div>
                ))}
                {insights.topEpisodes.length === 0 && <div className="text-xs text-muted-foreground">Nessun episodio tracciato.</div>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3 sm:mb-4">
              <Activity className="w-4 h-4" />
              Top Pagine Navigate
            </h3>
            <div className="space-y-2 sm:space-y-2.5">
              {insights.topPages.map((page, index) => (
                <div key={page.path} className="rounded-lg border border-border px-2.5 py-2 sm:px-3 sm:py-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] sm:text-sm text-foreground truncate leading-5">{index + 1}. {page.title}</span>
                    <span className="text-muted-foreground whitespace-nowrap text-[12px] sm:text-sm">{page.views}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{page.path}</div>
                  <div className="text-[11px] text-muted-foreground mt-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="sm:hidden text-muted-foreground/80">Share</span>
                      <span>{(page.share * 100).toFixed(1)}%</span>
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="sm:hidden text-muted-foreground/80">Ultima</span>
                      <span>{formatDateTime(page.lastViewedAt)}</span>
                    </span>
                  </div>
                </div>
              ))}
              {insights.topPages.length === 0 && <div className="text-xs text-muted-foreground">Nessuna pagina tracciata.</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4" />
                Sessioni Recenti
              </h3>
              {sessions.length > 0 ? (
                <div className="space-y-2">
                  {sessions.map(session => (
                    <div key={session.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-foreground truncate">{getDeviceName(session)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Source: {session.locationSourceLabel ?? 'Unknown'}
                        </div>
                      </div>
                      <div className="text-right pl-3">
                        <div className="text-xs text-foreground">{getCityName(session.location)}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(session.createdAt).toLocaleString('it-IT')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Nessuna sessione trovata.</div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Snapshot</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Top format</span>
                  <span className="text-foreground truncate max-w-[140px] text-right">{insights.topFormats[0]?.formatName ?? 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Episodi rivisti</span>
                  <span className="text-foreground">{insights.rewatchedEpisodes}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Views / giorno</span>
                  <span className="text-foreground">{insights.avgViewsPerActiveDay.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fascia oraria</span>
                  <span className="text-foreground capitalize">{insights.preferredDayPart}</span>
                </div>
                <div className="pt-1 border-t border-border">
                  <div className="text-[11px] text-muted-foreground mb-2">Attivita Lavika</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-border px-2 py-1.5 text-center">
                      <div className="text-[11px] text-muted-foreground">Ora</div>
                      <div className="text-xs font-medium text-foreground mt-0.5">{insights.activeNow ? 'SI' : 'NO'}</div>
                    </div>
                    <div className="rounded-md border border-border px-2 py-1.5 text-center">
                      <div className="text-[11px] text-muted-foreground">24h</div>
                      <div className="text-xs font-medium text-foreground mt-0.5">{insights.active24h ? 'SI' : 'NO'}</div>
                    </div>
                    <div className="rounded-md border border-border px-2 py-1.5 text-center">
                      <div className="text-[11px] text-muted-foreground">7g</div>
                      <div className="text-xs font-medium text-foreground mt-0.5">{insights.active7d ? 'SI' : 'NO'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Profilo</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Iscritto</div>
                  <div className="text-sm text-foreground">{new Date(user.createdAt).toLocaleDateString('it-IT')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Ultimo login</div>
                  <div className="text-sm text-foreground">{new Date(user.lastLogin).toLocaleString('it-IT')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div className="text-sm text-foreground">{latestSessionCity}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="text-sm text-foreground">${user.revenue}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Timeline</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Prima view</span>
                <span className="text-foreground text-right">{formatDateTime(insights.firstViewAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ultima view</span>
                <span className="text-foreground text-right">{formatDateTime(insights.lastViewAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ultima attivita app</span>
                <span className="text-foreground text-right">{formatDateTime(insights.lastActivityAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
