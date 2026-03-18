'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/components/SectionHeader';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Eye,
  Film,
  FolderTree,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Percent,
  Shield,
  User,
} from 'lucide-react';

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

// Episode row from content_episodes
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

// Enriched episode (derived)
interface EnrichedEpisode extends EpisodeRow {
  displayName: string;
  year: string;
  dateLabel: string | null;
}

// Pending badge change
type PendingChange =
  | { type: 'format'; newBadge: string; oldBadge: string }
  | {
      type: 'episode';
      episodeId: string;
      episodeName: string;
      newBadge: string | null;
      oldBadge: string | null;
    };

// ─── Badge options ────────────────────────────────────────────────────────────

const BADGE_FORMAT_OPTIONS: { value: string; label: string; activeClass: string }[] = [
  {
    value: 'bronze',
    label: 'Bronze',
    activeClass:
      'bg-amber-500/20 border-amber-400 text-amber-700 dark:text-amber-400',
  },
  {
    value: 'silver',
    label: 'Silver',
    activeClass:
      'bg-slate-400/20 border-slate-400 text-slate-600 dark:text-slate-300',
  },
  {
    value: 'gold',
    label: 'Gold',
    activeClass:
      'bg-yellow-400/20 border-yellow-400 text-yellow-700 dark:text-yellow-400',
  },
];

const BADGE_EPISODE_OPTIONS: { value: string | null; label: string; activeClass: string }[] = [
  {
    value: null,
    label: 'Auto',
    activeClass: 'bg-muted border-border text-muted-foreground',
  },
  {
    value: 'bronze',
    label: 'Bronze',
    activeClass:
      'bg-amber-500/20 border-amber-400 text-amber-700 dark:text-amber-400',
  },
  {
    value: 'silver',
    label: 'Silver',
    activeClass:
      'bg-slate-400/20 border-slate-400 text-slate-600 dark:text-slate-300',
  },
  {
    value: 'gold',
    label: 'Gold',
    activeClass:
      'bg-yellow-400/20 border-yellow-400 text-yellow-700 dark:text-yellow-400',
  },
];

// Normalize an R2 folder name to a Supabase format_id slug
function toFormatSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function KpiViewCard({
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

// ─── Constants ────────────────────────────────────────────────────────────────

const emptyMetrics: FormatMetricsData = {
  totalPerFormat: null,
  totalPerEpisode: [],
  totalPerSeason: [],
  userPerEpisode: [],
  userPerSeason: [],
  userPerFormat: [],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsFormatDetailPage() {
  const params = useParams();
  const rawFormat = params.format as string;
  const formatSlug = toFormatSlug(rawFormat);

  // R2 data
  const [data, setData] = useState<FormatDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Metrics
  const [metrics, setMetrics] = useState<FormatMetricsData>(emptyMetrics);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Episodes
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  // Format default_min_badge
  const [formatDefaultBadge, setFormatDefaultBadge] = useState<string>('bronze');
  const [formatBadgeLoading, setFormatBadgeLoading] = useState(true);

  // Accordion
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());

  // Badge change confirmation
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Load R2, episodes, and format badge in parallel ──────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setEpisodesLoading(true);
      setFormatBadgeLoading(true);

      try {
        const [r2Response, episodesResponse, formatsResponse] = await Promise.all([
          fetch(`/api/dev/r2/formats/${encodeURIComponent(rawFormat)}`, { cache: 'no-store' }),
          fetch(`/api/media/formats/${encodeURIComponent(rawFormat)}/episodes`, { cache: 'no-store' }),
          fetch('/api/media/formats', { cache: 'no-store' }),
        ]);

        if (r2Response.ok) {
          const payload = (await r2Response.json()) as FormatDetail;
          setData(payload);
        } else {
          setData(null);
        }

        if (episodesResponse.ok) {
          const eps = (await episodesResponse.json()) as EpisodeRow[];
          setEpisodes(Array.isArray(eps) ? eps : []);
        }

        if (formatsResponse.ok) {
          const allFormats = (await formatsResponse.json()) as Array<{
            id: string;
            default_min_badge: string;
          }>;
          const thisFormat = allFormats.find(f => f.id === formatSlug);
          if (thisFormat) setFormatDefaultBadge(thisFormat.default_min_badge);
        }
      } finally {
        setLoading(false);
        setEpisodesLoading(false);
        setFormatBadgeLoading(false);
      }
    };

    load();
  }, [rawFormat, formatSlug]);

  // ── Load metrics after R2 data arrives ──────────────────────────────────
  useEffect(() => {
    if (!data) return;

    const loadMetrics = async () => {
      setMetricsLoading(true);
      const fId = data.format;

      try {
        const [totalFormatRes, totalEpisodeRes, totalSeasonRes, userEpisodeRes, userSeasonRes, userFormatRes] =
          await Promise.all([
            fetch(`/api/metrics/views/total-per-format?format_id=${encodeURIComponent(fId)}`, { cache: 'no-store' }),
            fetch(`/api/metrics/views/total-per-episode?format_id=${encodeURIComponent(fId)}`, { cache: 'no-store' }),
            fetch(`/api/metrics/views/total-per-season?format_id=${encodeURIComponent(fId)}`, { cache: 'no-store' }),
            fetch(`/api/metrics/views/user-per-episode?format_id=${encodeURIComponent(fId)}`, { cache: 'no-store' }),
            fetch(`/api/metrics/views/user-per-season?format_id=${encodeURIComponent(fId)}`, { cache: 'no-store' }),
            fetch(`/api/metrics/views/user-per-format?format_id=${encodeURIComponent(fId)}`, { cache: 'no-store' }),
          ]);

        setMetrics({
          totalPerFormat: totalFormatRes.ok ? ((await totalFormatRes.json()) as TotalPerFormatPayload) : null,
          totalPerEpisode: totalEpisodeRes.ok ? ((await totalEpisodeRes.json()) as TotalPerEpisodeRow[]) : [],
          totalPerSeason: totalSeasonRes.ok ? ((await totalSeasonRes.json()) as TotalPerSeasonRow[]) : [],
          userPerEpisode: userEpisodeRes.ok ? ((await userEpisodeRes.json()) as UserPerEpisodeRow[]) : [],
          userPerSeason: userSeasonRes.ok ? ((await userSeasonRes.json()) as UserPerSeasonRow[]) : [],
          userPerFormat: userFormatRes.ok ? ((await userFormatRes.json()) as UserPerFormatRow[]) : [],
        });
      } finally {
        setMetricsLoading(false);
      }
    };

    loadMetrics();
  }, [data]);

  // ── Auto-open most recent year when episodes load ────────────────────────
  const episodeDerived = useMemo(() => {
    /**
     * Try to extract a structured date from the episode id.
     * IDs follow the pattern: {format}-...-DD-MM-YYYY-{videoId}
     * e.g. "unica-sport-live-27-02-2026-OfhJDLxiReg"
     */
    const extractDateFromId = (id: string): { day: number; month: number; year: number } | null => {
      const m = id.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (!m) return null;
      return { day: parseInt(m[1]), month: parseInt(m[2]), year: parseInt(m[3]) };
    };

    const getYear = (ep: EpisodeRow): string => {
      // 1. Try published_at
      if (ep.published_at) {
        const y = new Date(ep.published_at).getFullYear();
        if (!isNaN(y)) return String(y);
      }
      // 2. Try to extract year from title (e.g. "Live 27 febbraio 2026" → "2026")
      if (ep.title) {
        const m = ep.title.match(/\b(20\d{2})\b/);
        if (m) return m[1];
      }
      // 3. Try to extract date from id (pattern: ...-DD-MM-YYYY-...)
      const d = extractDateFromId(ep.id);
      if (d) return String(d.year);
      return '—';
    };

    const getDateLabel = (ep: EpisodeRow): string | null => {
      if (ep.published_at) {
        return new Date(ep.published_at).toLocaleDateString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
      // Fallback: extract date from id
      const d = extractDateFromId(ep.id);
      if (d) {
        return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
      }
      return null;
    };

    // Sorted unique years (descending)
    const yearSet = new Set<string>();
    for (const ep of episodes) yearSet.add(getYear(ep));
    const years = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

    // Enrich episodes
    const enriched: EnrichedEpisode[] = episodes.map(ep => {
      const displayName =
        typeof ep.title === 'string' && ep.title
          ? ep.title
          : typeof ep.video_id === 'string' && ep.video_id
          ? ep.video_id
          : ep.id.replace(`${rawFormat}-`, '');
      return { ...ep, displayName, year: getYear(ep), dateLabel: getDateLabel(ep) };
    });

    // Sort by date descending using numeric sort key extracted from id
    enriched.sort((a, b) => {
      const da = extractDateFromId(a.id);
      const db = extractDateFromId(b.id);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      const numA = da.year * 10000 + da.month * 100 + da.day;
      const numB = db.year * 10000 + db.month * 100 + db.day;
      return numB - numA; // descending
    });

    // Group by year (descending)
    const groups = years.map(year => ({
      year,
      episodes: enriched.filter(ep => ep.year === year),
    }));

    return { years, groups, enriched };
  }, [episodes, rawFormat]);

  useEffect(() => {
    if (episodeDerived.years.length > 0) {
      setOpenYears(prev =>
        prev.size === 0 ? new Set([episodeDerived.years[0]]) : prev
      );
    }
  }, [episodeDerived.years]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const derived = useMemo(() => {
    if (!data) return { coverRate: 0, episodesPerSeason: 0, avgEpisodeSizeMB: 0 };
    return {
      coverRate: data.totals.episodes > 0 ? (data.totals.covers / data.totals.episodes) * 100 : 0,
      episodesPerSeason: data.totals.seasons > 0 ? data.totals.episodes / data.totals.seasons : 0,
      avgEpisodeSizeMB: data.totals.episodes > 0 ? data.totals.sizeBytes / data.totals.episodes / (1024 * 1024) : 0,
    };
  }, [data]);

  const metricDerived = useMemo(() => {
    const totalViews = metrics.totalPerFormat?.total_views ?? 0;
    const uniqueUsers = metrics.userPerFormat.length;
    const topUserEpisode = metrics.userPerEpisode[0]?.user_views ?? 0;
    const topEpisode = metrics.totalPerEpisode[0]?.total_views ?? 0;
    const topSeason = metrics.totalPerSeason[0]?.total_views ?? 0;
    return {
      totalViews,
      uniqueUsers,
      avgViewsPerUser: uniqueUsers > 0 ? totalViews / uniqueUsers : 0,
      topUserEpisode,
      topEpisode,
      topSeason,
      topEpisodeShare: totalViews > 0 ? (topEpisode / totalViews) * 100 : 0,
      topUserShare: totalViews > 0 ? (topUserEpisode / totalViews) * 100 : 0,
    };
  }, [metrics]);

  // ── Toggle year accordion ────────────────────────────────────────────────
  const toggleYear = useCallback((year: string) => {
    setOpenYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);

  // ── Confirm badge change ─────────────────────────────────────────────────
  const handleConfirmBadge = useCallback(async () => {
    if (!pendingChange || saving) return;
    setSaving(true);
    try {
      if (pendingChange.type === 'format') {
        const res = await fetch('/api/media/formats', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: formatSlug,
            column: 'default_min_badge',
            value: pendingChange.newBadge,
          }),
        });
        if (res.ok) setFormatDefaultBadge(pendingChange.newBadge);
      } else {
        const res = await fetch(`/api/media/formats/${encodeURIComponent(formatSlug)}/episodes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            episodeId: pendingChange.episodeId,
            min_badge: pendingChange.newBadge,
          }),
        });
        if (res.ok) {
          setEpisodes(prev =>
            prev.map(ep =>
              ep.id === pendingChange.episodeId
                ? { ...ep, min_badge: pendingChange.newBadge }
                : ep
            )
          );
        }
      }
    } finally {
      setSaving(false);
      setPendingChange(null);
    }
  }, [pendingChange, formatSlug, saving]);

  // ── Loading/error states ─────────────────────────────────────────────────
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
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Formato non trovato su R2.
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
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

      {/* ── R2 stat cards ──────────────────────────────────────────── */}
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

      {/* ── Format default_min_badge editor ────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-foreground">Badge Minimo Formato</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Badge minimo richiesto per accedere ai contenuti di questo formato.
          Le singole puntate possono sovrascriverlo. <strong>Auto</strong> su una puntata eredita questo valore.
        </p>
        <div className="flex items-center gap-2">
          {formatBadgeLoading ? (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            BADGE_FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                disabled={saving}
                onClick={() => {
                  if (opt.value !== formatDefaultBadge) {
                    setPendingChange({
                      type: 'format',
                      newBadge: opt.value,
                      oldBadge: formatDefaultBadge,
                    });
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                  opt.value === formatDefaultBadge
                    ? opt.activeClass
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50 bg-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── KPI Views ──────────────────────────────────────────────── */}
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

      {/* ── Top tables ─────────────────────────────────────────────── */}
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
                  <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">Nessuna view episodio.</td></tr>
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
                  <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">Nessuna view utente.</td></tr>
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
                  <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">Nessuna view stagione.</td></tr>
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
              return (
                <div key={season.season}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground truncate">{season.season}</span>
                    <span className="text-muted-foreground">{season.totalAssets.toLocaleString('it-IT')}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                    <div className="bg-sky-500/80" style={{ width: `${(season.episodes / total) * 100}%` }} />
                    <div className="bg-violet-500/80" style={{ width: `${(season.covers / total) * 100}%` }} />
                    <div className="bg-amber-500/80" style={{ width: `${(season.other / total) * 100}%` }} />
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

      {/* ── Elenco Puntate (Accordion by year) ─────────────────────── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-foreground">Elenco Puntate</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {episodesLoading ? 'caricamento...' : `${episodes.length} puntate · ${episodeDerived.years.length} anni`}
          </span>
        </div>

        {episodesLoading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : episodes.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">Nessuna puntata trovata nel database.</div>
        ) : (
          <div className="divide-y divide-border">
            {episodeDerived.groups.map(group => {
              const isOpen = openYears.has(group.year);
              return (
                <div key={group.year}>
                  {/* ── Year header ─────────────────────────────── */}
                  <button
                    onClick={() => toggleYear(group.year)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      }
                      <span className="text-sm font-semibold text-foreground">{group.year}</span>
                      <span className="text-xs text-muted-foreground">
                        ({group.episodes.length} {group.episodes.length === 1 ? 'puntata' : 'puntate'})
                      </span>
                    </div>
                  </button>

                  {/* ── Episodes table ───────────────────────────── */}
                  {isOpen && (
                    <div className="overflow-x-auto border-t border-border/50">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium w-9">#</th>
                            <th className="text-left px-3 py-2 font-medium">Titolo</th>
                            <th className="text-left px-3 py-2 font-medium w-24 hidden sm:table-cell">Data</th>
                            <th className="text-center px-3 py-2 font-medium w-12">Cover</th>
                            <th className="text-center px-3 py-2 font-medium w-48">Badge Minimo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.episodes.map((ep, index) => (
                            <tr
                              key={ep.id}
                              className={`border-t border-border/50 hover:bg-muted/10 transition-colors ${
                                ep.is_active === false ? 'opacity-50' : ''
                              }`}
                            >
                              <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                              <td className="px-3 py-2 text-foreground">
                                <div className="truncate max-w-[180px] sm:max-w-[300px] font-medium">{ep.displayName}</div>
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[180px]">
                                  {ep.video_id ?? ep.id}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground text-[11px] hidden sm:table-cell whitespace-nowrap">
                                {ep.dateLabel ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {ep.thumbnail_url ? (
                                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Cover presente" />
                                ) : (
                                  <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" title="Nessuna cover" />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1 justify-center">
                                  {BADGE_EPISODE_OPTIONS.map(opt => (
                                    <button
                                      key={String(opt.value)}
                                      disabled={saving}
                                      title={opt.value === null ? `Eredita badge formato (${formatDefaultBadge})` : opt.label}
                                      onClick={() => {
                                        const current = ep.min_badge ?? null;
                                        if (opt.value !== current) {
                                          setPendingChange({
                                            type: 'episode',
                                            episodeId: ep.id,
                                            episodeName: ep.displayName,
                                            newBadge: opt.value,
                                            oldBadge: current,
                                          });
                                        }
                                      }}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors disabled:cursor-not-allowed ${
                                        opt.value === (ep.min_badge ?? null)
                                          ? opt.activeClass
                                          : 'border-border/40 text-muted-foreground/50 hover:border-border hover:text-muted-foreground bg-transparent'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Confirmation dialog ─────────────────────────────────────── */}
      {pendingChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-500" />
              <h3 className="text-base font-semibold text-foreground">Conferma modifica badge</h3>
            </div>

            {pendingChange.type === 'format' ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Stai per cambiare il badge minimo del formato da{' '}
                <span className="font-semibold text-foreground capitalize">{pendingChange.oldBadge}</span>{' '}
                a{' '}
                <span className="font-semibold text-foreground capitalize">{pendingChange.newBadge}</span>.
                <br />
                <span className="text-[11px]">Tutte le puntate in modalità &quot;Auto&quot; erediteranno il nuovo valore.</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Stai per cambiare il badge minimo di{' '}
                <span className="font-semibold text-foreground">{pendingChange.episodeName}</span>{' '}
                da{' '}
                <span className="font-semibold text-foreground capitalize">{pendingChange.oldBadge ?? 'auto'}</span>{' '}
                a{' '}
                <span className="font-semibold text-foreground capitalize">{pendingChange.newBadge ?? 'auto'}</span>.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPendingChange(null)}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmBadge}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvataggio…' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
