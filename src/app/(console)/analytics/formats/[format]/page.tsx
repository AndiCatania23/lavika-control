'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/components/SectionHeader';
import { ArrowLeft, Eye, Film, FolderTree, HardDrive, Image as ImageIcon, Layers, Percent, User } from 'lucide-react';

interface SeasonStat {
  season: string;
  videos: number;
  covers: number;
  other: number;
  episodes: number;
  totalAssets: number;
  sizeBytes: number;
  sizeHuman: string;
}

interface FormatDetail {
  format: string;
  totals: {
    seasons: number;
    videos: number;
    covers: number;
    other: number;
    episodes: number;
    totalAssets: number;
    sizeBytes: number;
    sizeHuman: string;
  };
  seasons: SeasonStat[];
  generatedAt: string;
}

function StatCard({
  title,
  value,
  hint,
  icon,
  iconClassName,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  iconClassName: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 h-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className={iconClassName}>{icon}</span>
      </div>
      <div className="text-lg font-semibold text-foreground leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{hint}</div>
    </div>
  );
}

function KpiViewCard({ title, value, hint, icon, iconClassName }: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  iconClassName: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 min-h-[104px] h-full">
      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
        <span className={iconClassName}>{icon}</span>
        {title}
      </div>
      <div className="text-xl font-semibold text-foreground mt-1 leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{hint}</div>
    </div>
  );
}

interface TotalPerEpisodeRow {
  episode_id: string;
  episode_name: string;
  total_views: number;
}

interface TotalPerSeasonRow {
  season_id: string;
  season_name: string;
  total_views: number;
}

interface UserPerEpisodeRow {
  user_id: string;
  user_name: string;
  episode_id: string;
  episode_name: string;
  user_views: number;
}

interface UserPerSeasonRow {
  user_id: string;
  user_name: string;
  season_id: string;
  season_name: string;
  user_views: number;
}

interface UserPerFormatRow {
  user_id: string;
  user_name: string;
  user_views: number;
}

interface TotalPerFormatPayload {
  format_id: string;
  total_views: number;
}

interface FormatMetricsData {
  totalPerFormat: TotalPerFormatPayload | null;
  totalPerEpisode: TotalPerEpisodeRow[];
  totalPerSeason: TotalPerSeasonRow[];
  userPerEpisode: UserPerEpisodeRow[];
  userPerSeason: UserPerSeasonRow[];
  userPerFormat: UserPerFormatRow[];
}

// Episode row from content_episodes table
interface EpisodeRow {
  id: string;
  format_id?: string | null;
  video_id?: string | null;
  title?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  is_active?: boolean | null;
  min_badge?: string | null;
}

const emptyMetrics: FormatMetricsData = {
  totalPerFormat: null,
  totalPerEpisode: [],
  totalPerSeason: [],
  userPerEpisode: [],
  userPerSeason: [],
  userPerFormat: [],
};

export default function AnalyticsFormatDetailPage() {
  const params = useParams();
  const rawFormat = params.format as string;
  const [data, setData] = useState<FormatDetail | null>(null);
  const [metrics, setMetrics] = useState<FormatMetricsData>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setEpisodesLoading(true);
      try {
        const [r2Response, episodesResponse] = await Promise.all([
          fetch(`/api/dev/r2/formats/${encodeURIComponent(rawFormat)}`, { cache: 'no-store' }),
          fetch(`/api/media/formats/${encodeURIComponent(rawFormat)}/episodes`, { cache: 'no-store' }),
        ]);

        if (!r2Response.ok) {
          setData(null);
        } else {
          const payload = (await r2Response.json()) as FormatDetail;
          setData(payload);
        }

        if (episodesResponse.ok) {
          const eps = (await episodesResponse.json()) as EpisodeRow[];
          setEpisodes(Array.isArray(eps) ? eps : []);
        }
      } finally {
        setLoading(false);
        setEpisodesLoading(false);
      }
    };

    load();
  }, [rawFormat]);

  useEffect(() => {
    if (!data) return;

    const loadMetrics = async () => {
      setMetricsLoading(true);
      const formatId = data.format;

      try {
        const [totalFormatRes, totalEpisodeRes, totalSeasonRes, userEpisodeRes, userSeasonRes, userFormatRes] = await Promise.all([
          fetch(`/api/metrics/views/total-per-format?format_id=${encodeURIComponent(formatId)}`, { cache: 'no-store' }),
          fetch(`/api/metrics/views/total-per-episode?format_id=${encodeURIComponent(formatId)}`, { cache: 'no-store' }),
          fetch(`/api/metrics/views/total-per-season?format_id=${encodeURIComponent(formatId)}`, { cache: 'no-store' }),
          fetch(`/api/metrics/views/user-per-episode?format_id=${encodeURIComponent(formatId)}`, { cache: 'no-store' }),
          fetch(`/api/metrics/views/user-per-season?format_id=${encodeURIComponent(formatId)}`, { cache: 'no-store' }),
          fetch(`/api/metrics/views/user-per-format?format_id=${encodeURIComponent(formatId)}`, { cache: 'no-store' }),
        ]);

        const nextMetrics: FormatMetricsData = {
          totalPerFormat: totalFormatRes.ok ? (await totalFormatRes.json()) as TotalPerFormatPayload : null,
          totalPerEpisode: totalEpisodeRes.ok ? (await totalEpisodeRes.json()) as TotalPerEpisodeRow[] : [],
          totalPerSeason: totalSeasonRes.ok ? (await totalSeasonRes.json()) as TotalPerSeasonRow[] : [],
          userPerEpisode: userEpisodeRes.ok ? (await userEpisodeRes.json()) as UserPerEpisodeRow[] : [],
          userPerSeason: userSeasonRes.ok ? (await userSeasonRes.json()) as UserPerSeasonRow[] : [],
          userPerFormat: userFormatRes.ok ? (await userFormatRes.json()) as UserPerFormatRow[] : [],
        };

        setMetrics(nextMetrics);
      } finally {
        setMetricsLoading(false);
      }
    };

    loadMetrics();
  }, [data]);

  const derived = useMemo(() => {
    if (!data) {
      return {
        coverRate: 0,
        episodesPerSeason: 0,
        avgEpisodeSizeMB: 0,
      };
    }

    const coverRate = data.totals.episodes > 0 ? (data.totals.covers / data.totals.episodes) * 100 : 0;
    const episodesPerSeason = data.totals.seasons > 0 ? data.totals.episodes / data.totals.seasons : 0;
    const avgEpisodeSizeMB = data.totals.episodes > 0 ? data.totals.sizeBytes / data.totals.episodes / (1024 * 1024) : 0;

    return { coverRate, episodesPerSeason, avgEpisodeSizeMB };
  }, [data]);

  const metricDerived = useMemo(() => {
    const totalViews = metrics.totalPerFormat?.total_views ?? 0;
    const uniqueUsers = metrics.userPerFormat.length;
    const avgViewsPerUser = uniqueUsers > 0 ? totalViews / uniqueUsers : 0;

    const topUserEpisode = metrics.userPerEpisode[0]?.user_views ?? 0;
    const topEpisode = metrics.totalPerEpisode[0]?.total_views ?? 0;
    const topSeason = metrics.totalPerSeason[0]?.total_views ?? 0;
    const topEpisodeShare = totalViews > 0 ? (topEpisode / totalViews) * 100 : 0;
    const topUserShare = totalViews > 0 ? (topUserEpisode / totalViews) * 100 : 0;

    return {
      totalViews,
      uniqueUsers,
      avgViewsPerUser,
      topUserEpisode,
      topEpisode,
      topSeason,
      topEpisodeShare,
      topUserShare,
    };
  }, [metrics]);

  // Build season list and filtered episodes for the episode browser
  const episodeDerived = useMemo(() => {
    // Derive a season label from published_at year (e.g. "2025", "2026")
    const getSeasonLabel = (ep: EpisodeRow): string => {
      if (ep.published_at) {
        const year = new Date(ep.published_at).getFullYear();
        if (!isNaN(year)) return String(year);
      }
      return '—';
    };

    // Build sorted unique season list (descending)
    const seasonSet = new Set<string>();
    for (const ep of episodes) {
      seasonSet.add(getSeasonLabel(ep));
    }
    const seasons = Array.from(seasonSet).sort((a, b) => b.localeCompare(a));

    // Filter episodes by selected season
    const filtered = selectedSeason === 'all'
      ? episodes
      : episodes.filter(ep => getSeasonLabel(ep) === selectedSeason);

    // Enrich episode names: prefer title column, fallback to video_id / id suffix
    const enriched = filtered.map(ep => {
      const displayName = (typeof ep.title === 'string' && ep.title)
        ? ep.title
        : (typeof ep.video_id === 'string' && ep.video_id)
          ? ep.video_id
          : ep.id.replace(`${rawFormat}-`, '');
      const season = getSeasonLabel(ep);
      const dateLabel = ep.published_at
        ? new Date(ep.published_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : null;
      return { ...ep, displayName, season, dateLabel };
    });

    return { seasons, enriched };
  }, [episodes, selectedSeason, rawFormat]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/analytics" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Torna ad Analisi
        </Link>
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Formato non trovato su R2.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/analytics" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Torna ad Analisi
      </Link>

      <SectionHeader
        title={`Format: ${data.format}`}
        description="Base dati reale per KPI sponsor e performance contenuto"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
        <StatCard title="Stagioni" value={data.totals.seasons.toLocaleString('it-IT')} hint="Cartelle primo livello" icon={<FolderTree className="w-4 h-4" />} iconClassName="text-violet-500" />
        <StatCard title="Puntate" value={data.totals.episodes.toLocaleString('it-IT')} hint="File video totali" icon={<Film className="w-4 h-4" />} iconClassName="text-violet-500" />
        <StatCard title="Copertine" value={data.totals.covers.toLocaleString('it-IT')} hint="Asset cover presenti" icon={<ImageIcon className="w-4 h-4" />} iconClassName="text-violet-500" />
        <StatCard title="Storage" value={data.totals.sizeHuman} hint="Peso totale formato" icon={<HardDrive className="w-4 h-4" />} iconClassName="text-violet-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard title="Cover Rate" value={`${derived.coverRate.toFixed(1)}%`} hint="Copertine / puntate" icon={<Percent className="w-4 h-4" />} iconClassName="text-amber-500" />
        <StatCard title="Puntate / Stagione" value={derived.episodesPerSeason.toFixed(1)} hint="Media episodi per stagione" icon={<Film className="w-4 h-4" />} iconClassName="text-violet-500" />
        <StatCard title="Peso medio puntata" value={`${derived.avgEpisodeSizeMB.toFixed(1)} MB`} hint="Storage / numero puntate" icon={<HardDrive className="w-4 h-4" />} iconClassName="text-violet-500" />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">KPI Views Format</h3>
          <span className="text-xs text-muted-foreground">{metricsLoading ? 'aggiornamento...' : 'live'}</span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
          <KpiViewCard title="Views Totali" value={metricDerived.totalViews.toLocaleString('it-IT')} hint="volume format" icon={<Eye className="w-3.5 h-3.5" />} iconClassName="text-sky-500" />
          <KpiViewCard title="Utenti Unici" value={metricDerived.uniqueUsers.toLocaleString('it-IT')} hint="audience reale" icon={<User className="w-3.5 h-3.5" />} iconClassName="text-sky-500" />
          <KpiViewCard title="Views / Utente" value={metricDerived.avgViewsPerUser.toFixed(2)} hint="frequenza media" icon={<Percent className="w-3.5 h-3.5" />} iconClassName="text-amber-500" />
          <KpiViewCard title="Peso Top Episodio" value={`${metricDerived.topEpisodeShare.toFixed(1)}%`} hint="quota sul totale" icon={<Film className="w-3.5 h-3.5" />} iconClassName="text-violet-500" />
          <KpiViewCard title="Top Episodio Views" value={metricDerived.topEpisode.toLocaleString('it-IT')} hint="picco singolo episodio" icon={<Film className="w-3.5 h-3.5" />} iconClassName="text-violet-500" />
          <KpiViewCard title="Top User Share" value={`${metricDerived.topUserShare.toFixed(1)}%`} hint="peso miglior utente" icon={<User className="w-3.5 h-3.5" />} iconClassName="text-sky-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Top Episodi</h3>
            <span className="text-xs text-muted-foreground">{metricsLoading ? '...' : metrics.totalPerEpisode.length}</span>
          </div>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium w-10">#</th>
                  <th className="text-left p-2 font-medium">Episodio</th>
                  <th className="text-right p-2 font-medium w-20">Views</th>
                  <th className="text-right p-2 font-medium w-16">%</th>
                </tr>
              </thead>
              <tbody>
                {metrics.totalPerEpisode.slice(0, 8).map((row, index) => {
                  const share = metricDerived.totalViews > 0 ? (row.total_views / metricDerived.totalViews) * 100 : 0;
                  return (
                    <tr key={`${row.episode_id}-${index}`} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{index + 1}</td>
                      <td className="p-2 text-foreground truncate max-w-[240px]">{row.episode_name}</td>
                      <td className="p-2 text-right text-foreground">{row.total_views.toLocaleString('it-IT')}</td>
                      <td className="p-2 text-right text-muted-foreground">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                {metrics.totalPerEpisode.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-muted-foreground">Nessuna view episodio.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Utenti</h3>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium w-10">#</th>
                  <th className="text-left p-2 font-medium">Utente</th>
                  <th className="text-right p-2 font-medium w-20">Views</th>
                  <th className="text-right p-2 font-medium w-16">%</th>
                </tr>
              </thead>
              <tbody>
                {metrics.userPerFormat.slice(0, 8).map((row, index) => {
                  const share = metricDerived.totalViews > 0 ? (row.user_views / metricDerived.totalViews) * 100 : 0;
                  return (
                    <tr key={`${row.user_id}-${index}`} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{index + 1}</td>
                      <td className="p-2">
                        <Link href={`/users/${encodeURIComponent(row.user_id)}`} className="text-foreground hover:text-primary hover:underline truncate inline-block max-w-[240px]">
                          {row.user_name}
                        </Link>
                      </td>
                      <td className="p-2 text-right text-foreground">{row.user_views.toLocaleString('it-IT')}</td>
                      <td className="p-2 text-right text-muted-foreground">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                {metrics.userPerFormat.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-muted-foreground">Nessuna view utente.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Stagioni</h3>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium w-10">#</th>
                  <th className="text-left p-2 font-medium">Stagione</th>
                  <th className="text-right p-2 font-medium w-20">Views</th>
                  <th className="text-right p-2 font-medium w-16">%</th>
                </tr>
              </thead>
              <tbody>
                {metrics.totalPerSeason.slice(0, 8).map((row, index) => {
                  const share = metricDerived.totalViews > 0 ? (row.total_views / metricDerived.totalViews) * 100 : 0;
                  return (
                    <tr key={`${row.season_id}-${index}`} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{index + 1}</td>
                      <td className="p-2 text-foreground truncate max-w-[240px]">{row.season_name}</td>
                      <td className="p-2 text-right text-foreground">{row.total_views.toLocaleString('it-IT')}</td>
                      <td className="p-2 text-right text-muted-foreground">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                {metrics.totalPerSeason.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-muted-foreground">Nessuna view stagione.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="text-sm font-semibold text-foreground mb-3">Asset Mix per Stagione</h3>
          <div className="space-y-2">
            {data.seasons.slice(0, 8).map(season => {
              const total = Math.max(1, season.totalAssets);
              const episodesPct = (season.episodes / total) * 100;
              const coversPct = (season.covers / total) * 100;
              const otherPct = (season.other / total) * 100;

              return (
                <div key={season.season}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground truncate">{season.season}</span>
                    <span className="text-muted-foreground">{season.totalAssets.toLocaleString('it-IT')}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                    <div className="bg-sky-500/80" style={{ width: `${episodesPct}%` }} />
                    <div className="bg-violet-500/80" style={{ width: `${coversPct}%` }} />
                    <div className="bg-amber-500/80" style={{ width: `${otherPct}%` }} />
                  </div>
                </div>
              );
            })}
            {data.seasons.length === 0 && <div className="text-xs text-muted-foreground">Nessun dato stagioni.</div>}
          </div>
          <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500/80" />Episodi</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500/80" />Cover</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/80" />Altri</span>
          </div>
        </div>
      </div>

      {/* ── Elenco Puntate ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-foreground">Elenco Puntate</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {episodesLoading ? 'caricamento...' : `${episodeDerived.enriched.length} / ${episodes.length}`}
          </span>
        </div>

        {/* Season filter tabs (year-based from published_at) */}
        {!episodesLoading && episodeDerived.seasons.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setSelectedSeason('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                selectedSeason === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/40'
              }`}
            >
              Tutte ({episodes.length})
            </button>
            {episodeDerived.seasons.map(season => {
              const count = episodes.filter(ep => {
                if (!ep.published_at) return season === '—';
                const y = new Date(ep.published_at).getFullYear();
                return !isNaN(y) ? String(y) === season : season === '—';
              }).length;
              return (
                <button
                  key={season}
                  onClick={() => setSelectedSeason(season)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    selectedSeason === season
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/40'
                  }`}
                >
                  {season} ({count})
                </button>
              );
            })}
          </div>
        )}

        {episodesLoading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : episodes.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Nessuna puntata trovata nel database.</div>
        ) : (
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium w-10">#</th>
                  <th className="text-left p-2 font-medium">Titolo</th>
                  <th className="text-left p-2 font-medium w-24 hidden sm:table-cell">Data</th>
                  <th className="text-center p-2 font-medium w-14">Cover</th>
                </tr>
              </thead>
              <tbody>
                {episodeDerived.enriched.map((ep, index) => (
                  <tr key={ep.id} className={`border-t border-border hover:bg-muted/20 ${ep.is_active === false ? 'opacity-50' : ''}`}>
                    <td className="p-2 text-muted-foreground">{index + 1}</td>
                    <td className="p-2 text-foreground">
                      <div className="truncate max-w-[200px] sm:max-w-[380px]">{ep.displayName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">{ep.video_id ?? ep.id}</div>
                    </td>
                    <td className="p-2 text-muted-foreground text-[11px] hidden sm:table-cell whitespace-nowrap">
                      {ep.dateLabel ?? '—'}
                    </td>
                    <td className="p-2 text-center">
                      {ep.thumbnail_url ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Cover presente" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" title="Nessuna cover" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
