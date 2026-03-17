'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SectionHeader } from '@/components/SectionHeader';
import { Users, DollarSign, FileText, HardDrive, RefreshCw, Film, ImageIcon, Layers, Activity, Eye } from 'lucide-react';

type Tab = 'users' | 'revenue' | 'content' | 'traffic';

interface OverviewKpi {
  key: string;
  title: string;
  value: number;
  unit?: string;
}

interface R2FormatStat {
  format: string;
  videos: number;
  covers: number;
  other: number;
  total: number;
  sizeBytes: number;
  seasons: number;
  episodes: number;
  coverVerticalUrl?: string;
  coverHorizontalUrl?: string;
}

interface R2Summary {
  connected: boolean;
  totals: {
    formats: number;
    videos: number;
    covers: number;
    other: number;
    allAssets: number;
    sizeBytes: number;
    sizeHuman: string;
  };
  formats: R2FormatStat[];
  error?: string;
}

interface ComparisonMetric {
  metricKey: string;
  value: number | null;
  deltaDay: number | null;
  deltaWeek: number | null;
  deltaMonth: number | null;
}

interface TopViewedPage {
  path: string;
  views: number;
  uniqueUsers: number;
  share: number;
  lastViewedAt: string | null;
}

interface EpisodeTotalRow {
  episode_id: string;
  episode_name: string;
  format_name: string;
  total_views: number;
  unique_users: number;
}

const emptyR2Summary: R2Summary = {
  connected: false,
  totals: {
    formats: 0,
    videos: 0,
    covers: 0,
    other: 0,
    allAssets: 0,
    sizeBytes: 0,
    sizeHuman: '0 B',
  },
  formats: [],
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatGigabytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

function humanizePath(path: string): string {
  if (path === '/') return 'Home';
  const chunks = path.split('/').filter(Boolean);
  if (chunks.length === 0) return 'Home';
  const last = chunks[chunks.length - 1]?.replace(/[-_]+/g, ' ') ?? '';
  const detail = last
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return detail;
}

function pageReferenceLabel(path: string): string {
  const firstChunk = path.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
  if (!firstChunk) return 'HOME';

  const map: Record<string, string> = {
    news: 'NEWS',
    format: 'FORMAT',
    player: 'PLAYER',
    dashboard: 'DASHBOARD',
    analytics: 'ANALISI',
    users: 'UTENTI',
    jobs: 'JOBS',
    notifications: 'NOTIFICHE',
    sessions: 'SESSIONI',
    settings: 'IMPOSTAZIONI',
  };

  return map[firstChunk] ?? firstChunk.toUpperCase();
}

function CompactCard({
  label,
  value,
  hint,
  icon,
  iconClassName,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  iconClassName: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1 text-xs">
        <span className={iconClassName}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold text-foreground leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{hint}</div>
    </div>
  );
}

function ComparisonCard({
  title,
  description,
  deltaDay,
  deltaWeek,
  deltaMonth,
  isLoading,
}: {
  title: string;
  description: string;
  deltaDay: number | null;
  deltaWeek: number | null;
  deltaMonth: number | null;
  isLoading?: boolean;
}) {
  const formatDelta = (value: number | null) => {
    if (isLoading) return '...';
    if (value === null || Number.isNaN(value)) return '--';
    const percentage = value * 100;
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  };

  const deltaArrow = (value: number | null) => {
    if (value === null || Number.isNaN(value) || isLoading) return '';
    if (value > 0) return '↑';
    if (value < 0) return '↓';
    return '→';
  };

  const deltaTone = (value: number | null) => {
    if (value === null || Number.isNaN(value) || isLoading) return 'text-foreground';
    if (value > 0) return 'text-emerald-500';
    if (value < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const trendPill = (() => {
    if (isLoading || deltaWeek === null || Number.isNaN(deltaWeek)) {
      return { label: 'In attesa', className: 'bg-muted text-muted-foreground' };
    }
    if (deltaWeek > 0) {
      return { label: 'In crescita', className: 'bg-emerald-500/10 text-emerald-500' };
    }
    if (deltaWeek < 0) {
      return { label: 'In calo', className: 'bg-red-500/10 text-red-500' };
    }
    return { label: 'Stabile', className: 'bg-muted text-muted-foreground' };
  })();

  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${trendPill.className}`}>
          {trendPill.label}
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-md border border-border/80 px-1.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Giorno</p>
            <p className={`mt-1 text-[11px] font-semibold leading-none ${deltaTone(deltaDay)}`}>
              {deltaArrow(deltaDay)} {formatDelta(deltaDay)}
            </p>
          </div>
          <div className="rounded-md border border-border/80 px-1.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Settimana</p>
            <p className={`mt-1 text-[11px] font-semibold leading-none ${deltaTone(deltaWeek)}`}>
              {deltaArrow(deltaWeek)} {formatDelta(deltaWeek)}
            </p>
          </div>
          <div className="rounded-md border border-border/80 px-1.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mese</p>
            <p className={`mt-1 text-[11px] font-semibold leading-none ${deltaTone(deltaMonth)}`}>
              {deltaArrow(deltaMonth)} {formatDelta(deltaMonth)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [overviewKpis, setOverviewKpis] = useState<OverviewKpi[]>([]);
  const [r2Summary, setR2Summary] = useState<R2Summary>(emptyR2Summary);
  const [r2Loading, setR2Loading] = useState(false);
  // formatId → cover_horizontal_url from Supabase content_formats (R2 lavika-media)
  const [formatCovers, setFormatCovers] = useState<Record<string, string>>({});
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetric[]>([]);
  const [comparisonSnapshotDate, setComparisonSnapshotDate] = useState<string | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [topViewedPages, setTopViewedPages] = useState<TopViewedPage[]>([]);
  const [topEpisodesGlobal, setTopEpisodesGlobal] = useState<EpisodeTotalRow[]>([]);

  const getKpi = (key: string) => overviewKpis.find(item => item.key === key)?.value ?? 0;

  const loadOverview = async () => {
    const response = await fetch('/api/dev/overview', { cache: 'no-store' });
    if (!response.ok) {
      setOverviewKpis([]);
      return;
    }
    const payload = await response.json() as { kpis?: OverviewKpi[] };
    setOverviewKpis(payload.kpis ?? []);
  };

  const loadR2Summary = async () => {
    setR2Loading(true);
    try {
      const [response, formatsResponse] = await Promise.all([
        fetch('/api/dev/r2/summary', { cache: 'no-store' }),
        fetch('/api/media/formats', { cache: 'no-store' }),
      ]);

      // Load format cover URLs from Supabase
      if (formatsResponse.ok) {
        const formatsData = await formatsResponse.json() as Array<{ id: string; cover_horizontal_url: string | null }>;
        const covers: Record<string, string> = {};
        for (const fmt of formatsData) {
          if (fmt.cover_horizontal_url) covers[fmt.id] = fmt.cover_horizontal_url;
        }
        setFormatCovers(covers);
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setR2Summary({
          ...emptyR2Summary,
          error: typeof payload?.error === 'string' ? payload.error : 'Errore lettura archivio R2',
        });
        return;
      }
      const payload = await response.json() as R2Summary;
      setR2Summary(payload);
    } catch {
      setR2Summary({
        ...emptyR2Summary,
        error: 'Errore di rete durante la lettura R2',
      });
    } finally {
      setR2Loading(false);
    }
  };

  const loadComparisons = async () => {
    setComparisonLoading(true);
    try {
      const response = await fetch('/api/dev/analytics/comparisons', { cache: 'no-store' });
      if (!response.ok) {
        setComparisonMetrics([]);
        setComparisonSnapshotDate(null);
        return;
      }

      const payload = await response.json() as {
        snapshotDate: string | null;
        metrics: ComparisonMetric[];
      };

      setComparisonMetrics(Array.isArray(payload.metrics) ? payload.metrics : []);
      setComparisonSnapshotDate(payload.snapshotDate ?? null);
    } catch {
      setComparisonMetrics([]);
      setComparisonSnapshotDate(null);
    } finally {
      setComparisonLoading(false);
    }
  };

  const loadTraffic = async () => {
    setTrafficLoading(true);
    try {
      const [pagesResponse, episodesResponse] = await Promise.all([
        fetch('/api/dev/users/top-pages?limit=20', { cache: 'no-store' }),
        fetch('/api/metrics/views/total-per-episode', { cache: 'no-store' }),
      ]);

      if (pagesResponse.ok) {
        const pagesPayload = await pagesResponse.json() as { items?: TopViewedPage[] };
        setTopViewedPages(Array.isArray(pagesPayload.items) ? pagesPayload.items : []);
      } else {
        setTopViewedPages([]);
      }

      if (episodesResponse.ok) {
        const episodesPayload = await episodesResponse.json() as EpisodeTotalRow[];
        setTopEpisodesGlobal(Array.isArray(episodesPayload) ? episodesPayload : []);
      } else {
        setTopEpisodesGlobal([]);
      }
    } catch {
      setTopViewedPages([]);
      setTopEpisodesGlobal([]);
    } finally {
      setTrafficLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    loadComparisons();
  }, []);

  useEffect(() => {
    if (activeTab === 'content') {
      loadR2Summary();
    }
    if (activeTab === 'traffic') {
      loadTraffic();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'traffic') return;

    const intervalId = setInterval(() => {
      void loadTraffic();
    }, 20000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void loadTraffic();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeTab]);

  const tabs: Array<{ id: Tab; label: string; mobileLabel: string; icon: React.ReactNode }> = [
    { id: 'users', label: 'Audience', mobileLabel: 'Utenti', icon: <Users className="h-3.5 w-3.5" /> },
    { id: 'revenue', label: 'Monetizzazione', mobileLabel: 'Ricavi', icon: <DollarSign className="h-3.5 w-3.5" /> },
    { id: 'content', label: 'Catalogo', mobileLabel: 'Asset', icon: <FileText className="h-3.5 w-3.5" /> },
    { id: 'traffic', label: 'Traffico', mobileLabel: 'Traffico', icon: <Activity className="h-3.5 w-3.5" /> },
  ];

  const totalUsers = getKpi('total_users');
  const activeUsersNow = getKpi('active_users_now');
  const activeUsers24h = getKpi('active_users_24h');
  const activeUsers7d = getKpi('active_users_7d');
  const activeRate = totalUsers > 0 ? (activeUsers7d / totalUsers) * 100 : 0;

  const totalRevenue = getKpi('users_revenue_total');
  const arpu = totalUsers > 0 ? totalRevenue / totalUsers : 0;
  const revenuePerActive7d = activeUsers7d > 0 ? totalRevenue / activeUsers7d : 0;

  const totalEpisodeViews = topEpisodesGlobal.reduce((sum, row) => sum + (row.total_views || 0), 0);
  const topEpisodeViews = topEpisodesGlobal[0]?.total_views ?? 0;
  const topEpisodeUniqueUsers = topEpisodesGlobal[0]?.unique_users ?? 0;
  const topEpisodeShare = totalEpisodeViews > 0 ? (topEpisodeViews / totalEpisodeViews) * 100 : 0;
  const topPageTitle = topViewedPages[0] ? humanizePath(topViewedPages[0].path) : 'N/D';
  const topPageViews = topViewedPages[0]?.views ?? 0;
  const topPageShare = (topViewedPages[0]?.share ?? 0) * 100;

  const currentCards = (() => {
    if (activeTab === 'users') {
      return [
        {
          label: 'Utenti Totali',
          value: totalUsers.toLocaleString('it-IT'),
          hint: 'Fonte: Supabase Auth',
          icon: <Users className="w-4 h-4" />,
          iconClassName: 'text-sky-500',
        },
        {
          label: 'Utenti Attivi Ora',
          value: activeUsersNow.toLocaleString('it-IT'),
          hint: 'Attivita app ultimi 30 minuti',
          icon: <Users className="w-4 h-4" />,
          iconClassName: 'text-sky-500',
        },
        {
          label: 'Utenti Attivi 24h',
          value: activeUsers24h.toLocaleString('it-IT'),
          hint: 'Attivita app ultime 24 ore',
          icon: <Users className="w-4 h-4" />,
          iconClassName: 'text-sky-500',
        },
        {
          label: 'Utenti Attivi 7g',
          value: activeUsers7d.toLocaleString('it-IT'),
          hint: `Copertura ${activeRate.toFixed(1)}%`,
          icon: <Users className="w-4 h-4" />,
          iconClassName: 'text-sky-500',
        },
      ];
    }

    if (activeTab === 'revenue') {
      return [
        {
          label: 'Revenue Totale',
          value: `EUR ${totalRevenue.toLocaleString('it-IT')}`,
          hint: 'Somma revenue/ltv da user profile',
          icon: <DollarSign className="w-4 h-4" />,
          iconClassName: 'text-emerald-500',
        },
        {
          label: 'ARPU',
          value: `EUR ${arpu.toFixed(2)}`,
          hint: 'Revenue media per utente totale',
          icon: <DollarSign className="w-4 h-4" />,
          iconClassName: 'text-emerald-500',
        },
        {
          label: 'Revenue per Attivo 7g',
          value: `EUR ${revenuePerActive7d.toFixed(2)}`,
          hint: 'Revenue / utenti attivi 7g',
          icon: <DollarSign className="w-4 h-4" />,
          iconClassName: 'text-emerald-500',
        },
        {
          label: 'Incidenza Attivi 7g',
          value: `${activeRate.toFixed(1)}%`,
          hint: 'Per leggere qualita monetizzazione',
          icon: <DollarSign className="w-4 h-4" />,
          iconClassName: 'text-emerald-500',
        },
      ];
    }

    if (activeTab === 'traffic') {
      return [
        {
          label: 'Pagine Tracciate',
          value: topViewedPages.length.toLocaleString('it-IT'),
          hint: trafficLoading ? 'Aggiornamento in corso...' : 'Top pagine da page_view',
          icon: <Activity className="w-4 h-4" />,
          iconClassName: 'text-cyan-500',
        },
        {
          label: 'Top Pagina Utenti',
          value: topPageTitle,
          hint: trafficLoading ? 'Aggiornamento in corso...' : `${topPageViews.toLocaleString('it-IT')} views | ${topPageShare.toFixed(1)}%`,
          icon: <Eye className="w-4 h-4" />,
          iconClassName: 'text-cyan-500',
        },
        {
          label: 'Contenuti Unici',
          value: topEpisodesGlobal.length.toLocaleString('it-IT'),
          hint: trafficLoading ? 'Aggiornamento in corso...' : 'Episodi con almeno una view',
          icon: <Film className="w-4 h-4" />,
          iconClassName: 'text-amber-500',
        },
        {
          label: 'Top Contenuto Utenti',
          value: topEpisodeUniqueUsers.toLocaleString('it-IT'),
          hint: trafficLoading ? 'Aggiornamento in corso...' : `${topEpisodeViews.toLocaleString('it-IT')} views | ${topEpisodeShare.toFixed(1)}%`,
          icon: <Film className="w-4 h-4" />,
          iconClassName: 'text-amber-500',
        },
      ];
    }

    return [
      {
          label: 'Asset Totali',
          value: r2Summary.totals.allAssets.toLocaleString('it-IT'),
          hint: 'File presenti nel bucket R2',
          icon: <Layers className="w-4 h-4" />,
          iconClassName: 'text-violet-500',
        },
      {
          label: 'Video',
          value: r2Summary.totals.videos.toLocaleString('it-IT'),
          hint: 'Cartelle video/ su tutti i format',
          icon: <Film className="w-4 h-4" />,
          iconClassName: 'text-indigo-500',
        },
      {
          label: 'Copertine',
          value: r2Summary.totals.covers.toLocaleString('it-IT'),
          hint: 'Cartelle copertine/ su tutti i format',
          icon: <ImageIcon className="w-4 h-4" />,
          iconClassName: 'text-fuchsia-500',
        },
      {
          label: 'Storage Usato',
          value: r2Summary.totals.sizeHuman,
          hint: 'Dimensione totale R2',
          icon: <HardDrive className="w-4 h-4" />,
          iconClassName: r2Summary.connected ? 'text-violet-500' : 'text-red-500',
        },
      ];
  })();

  const comparisonCards = (() => {
    if (activeTab === 'users') {
      return [
        {
          metricKey: 'users_active_wau',
          title: 'Trend utenti attivi',
          description: 'Confronto DAU / WAU / MAU nei periodi precedenti',
        },
        {
          metricKey: 'users_new_7d',
          title: 'Nuovi utenti',
          description: 'Variazione acquisizione rispetto a giorno/settimana/mese',
        },
        {
          metricKey: 'users_reactivation_rate',
          title: 'Tasso di riattivazione',
          description: 'Quota utenti rientrati dopo inattivita',
        },
        {
          metricKey: 'users_stickiness_dau_mau',
          title: 'Stickiness (DAU/MAU)',
          description: 'Misura continuita utilizzo e fidelizzazione',
        },
      ];
    }

    if (activeTab === 'revenue') {
      return [
        { metricKey: null, title: 'Revenue totale', description: 'Andamento economico rispetto ai periodi precedenti' },
        { metricKey: null, title: 'ARPU', description: 'Revenue media per utente a confronto nel tempo' },
        { metricKey: null, title: 'Revenue per utenti attivi', description: 'Qualita monetizzazione sugli utenti ingaggiati' },
        { metricKey: null, title: 'Incidenza attivi 7g', description: 'Peso degli attivi sulla base totale utenti' },
      ];
    }

    return [];
  })();

  return (
    <div className="space-y-6">
      <SectionHeader title="Analisi" description="Vista KPI operativa per team DEV" />

      <div className="rounded-xl border border-border bg-card/70 p-1">
        <nav className="grid grid-cols-4 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.mobileLabel}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {currentCards.map(card => (
          <CompactCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            icon={card.icon}
            iconClassName={card.iconClassName}
          />
        ))}
      </div>

      {(activeTab === 'users' || activeTab === 'revenue') && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground">
            {activeTab === 'users' && comparisonSnapshotDate
              ? `Confronti aggiornati allo snapshot del ${new Date(comparisonSnapshotDate).toLocaleDateString('it-IT')}.`
              : activeTab === 'revenue'
              ? 'Confronti Revenue pronti: verranno popolati quando attiverete i pagamenti.'
              : 'Confronti storici pronti: collega le serie temporali per attivare i delta automatici.'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {comparisonCards.map(card => (
              (() => {
                const metric = card.metricKey
                  ? comparisonMetrics.find(item => item.metricKey === card.metricKey) ?? null
                  : null;

                return (
              <ComparisonCard
                key={card.title}
                title={card.title}
                description={card.description}
                deltaDay={metric?.deltaDay ?? null}
                deltaWeek={metric?.deltaWeek ?? null}
                deltaMonth={metric?.deltaMonth ?? null}
                isLoading={activeTab === 'users' ? comparisonLoading : false}
              />
                );
              })()
            ))}
          </div>
        </div>
      )}

      {activeTab === 'traffic' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Ranking live da <span className="text-foreground">page_view</span> e <span className="text-foreground">view_start</span>.
            </div>
            <button
              type="button"
              onClick={loadTraffic}
              disabled={trafficLoading}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs border border-border rounded-lg hover:bg-muted/40 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${trafficLoading ? 'animate-spin' : ''}`} />
              Aggiorna
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Pagine piu visualizzate</h3>
                <span className="text-xs text-muted-foreground">Top {Math.min(10, topViewedPages.length)}</span>
              </div>
              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full table-fixed text-xs md:text-sm">
                  <colgroup>
                    <col className="w-9" />
                    <col />
                    <col className="w-[40px] md:w-[64px]" />
                    <col className="w-[40px] md:w-[64px]" />
                    <col className="w-[44px] md:w-[70px]" />
                  </colgroup>
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="text-left p-1.5 md:p-2 font-medium">#</th>
                      <th className="text-left p-1.5 md:p-2 font-medium">Pagina</th>
                      <th className="text-center p-0.5 md:p-1.5 font-medium tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-full" aria-label="Views" title="Views">
                          <Eye className="h-3.5 w-3.5" />
                        </span>
                      </th>
                      <th className="text-center p-0.5 md:p-1.5 font-medium tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-full" aria-label="Utenti unici" title="Utenti unici">
                          <Users className="h-3.5 w-3.5" />
                        </span>
                      </th>
                      <th className="text-center p-0.5 md:p-2 font-medium tabular-nums whitespace-nowrap">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topViewedPages.slice(0, 10).map((row, index) => (
                      <tr key={row.path} className="border-t border-border">
                        <td className="p-1.5 md:p-2 text-muted-foreground tabular-nums align-middle">{index + 1}</td>
                        <td className="p-1.5 md:p-2 max-w-0">
                          <div className="text-foreground font-medium truncate leading-5">{humanizePath(row.path)}</div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5 leading-4">{pageReferenceLabel(row.path)}</div>
                        </td>
                        <td className="p-0.5 md:p-1 text-center text-foreground tabular-nums whitespace-nowrap align-middle text-[11px] md:text-sm">{row.views.toLocaleString('it-IT')}</td>
                        <td className="p-0.5 md:p-1 text-center text-foreground tabular-nums whitespace-nowrap align-middle text-[11px] md:text-sm">{row.uniqueUsers.toLocaleString('it-IT')}</td>
                        <td className="p-0.5 md:p-1.5 text-center text-muted-foreground tabular-nums whitespace-nowrap align-middle text-[11px] md:text-sm">{(row.share * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                    {trafficLoading && (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-muted-foreground">Aggiornamento traffico...</td>
                      </tr>
                    )}
                    {!trafficLoading && topViewedPages.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-muted-foreground">Nessuna pagina disponibile.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Contenuti piu visualizzati</h3>
                <span className="text-xs text-muted-foreground">Top {Math.min(10, topEpisodesGlobal.length)}</span>
              </div>
              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full table-fixed text-xs md:text-sm">
                  <colgroup>
                    <col className="w-9" />
                    <col />
                    <col className="w-[40px] md:w-[64px]" />
                    <col className="w-[40px] md:w-[64px]" />
                    <col className="w-[44px] md:w-[70px]" />
                  </colgroup>
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="text-left p-1.5 md:p-2 font-medium">#</th>
                      <th className="text-left p-1.5 md:p-2 font-medium">Contenuto</th>
                      <th className="text-center p-0.5 md:p-1.5 font-medium tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-full" aria-label="Views" title="Views">
                          <Eye className="h-3.5 w-3.5" />
                        </span>
                      </th>
                      <th className="text-center p-0.5 md:p-1.5 font-medium tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-full" aria-label="Utenti unici" title="Utenti unici">
                          <Users className="h-3.5 w-3.5" />
                        </span>
                      </th>
                      <th className="text-center p-0.5 md:p-2 font-medium tabular-nums whitespace-nowrap">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEpisodesGlobal.slice(0, 10).map((row, index) => {
                      const share = totalEpisodeViews > 0 ? (row.total_views / totalEpisodeViews) * 100 : 0;
                      return (
                        <tr key={row.episode_id} className="border-t border-border">
                          <td className="p-1.5 md:p-2 text-muted-foreground tabular-nums align-middle">{index + 1}</td>
                          <td className="p-1.5 md:p-2 max-w-0">
                            <div className="text-foreground font-medium truncate leading-5">{row.episode_name}</div>
                            <div className="text-[11px] text-muted-foreground truncate mt-0.5 leading-4">{row.format_name}</div>
                          </td>
                          <td className="p-0.5 md:p-1 text-center text-foreground tabular-nums whitespace-nowrap align-middle text-[11px] md:text-sm">{row.total_views.toLocaleString('it-IT')}</td>
                          <td className="p-0.5 md:p-1 text-center text-foreground tabular-nums whitespace-nowrap align-middle text-[11px] md:text-sm">{row.unique_users.toLocaleString('it-IT')}</td>
                          <td className="p-0.5 md:p-1.5 text-center text-muted-foreground tabular-nums whitespace-nowrap align-middle text-[11px] md:text-sm">{share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    {trafficLoading && (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-muted-foreground">Aggiornamento traffico...</td>
                      </tr>
                    )}
                    {!trafficLoading && topEpisodesGlobal.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-muted-foreground">Nessun contenuto disponibile.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'content' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Distribuzione R2 per format</h3>
            <button
              type="button"
              onClick={loadR2Summary}
              disabled={r2Loading}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs border border-border rounded-lg hover:bg-muted/40 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${r2Loading ? 'animate-spin' : ''}`} />
              Aggiorna
            </button>
          </div>

          {!r2Summary.connected && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-700">
              R2 non raggiungibile. Verifica `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
              {r2Summary.error ? ` Dettaglio: ${r2Summary.error}` : ''}
            </div>
          )}

          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs md:text-sm md:table-fixed">
              <colgroup>
                <col className="md:w-[32%]" />
                <col className="md:w-[12%]" />
                <col className="md:w-[14%]" />
                <col className="md:w-[12%]" />
                <col className="md:w-[12%]" />
                <col className="md:w-[18%]" />
              </colgroup>
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-1.5 sm:p-2.5 font-medium">Format</th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium tabular-nums whitespace-nowrap">
                    <span className="inline-flex items-center justify-end w-full" aria-label="Video" title="Video">
                      <Film className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Video</span>
                    </span>
                  </th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium tabular-nums whitespace-nowrap">
                    <span className="inline-flex items-center justify-end w-full" aria-label="Copertine" title="Copertine">
                      <ImageIcon className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Copertine</span>
                    </span>
                  </th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium tabular-nums whitespace-nowrap">
                    <span className="inline-flex items-center justify-end w-full" aria-label="Altri" title="Altri">
                      <Layers className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Altri</span>
                    </span>
                  </th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium tabular-nums whitespace-nowrap">Totale</th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium tabular-nums whitespace-nowrap">Size</th>
                </tr>
              </thead>
              <tbody>
                {r2Summary.formats.map(row => (
                  <tr key={row.format} className="border-t border-border">
                    <td className="p-1.5 sm:p-2.5 text-foreground font-medium max-w-0 md:max-w-none">
                      <span className="block truncate md:truncate">{row.format}</span>
                    </td>
                    <td className="p-1.5 sm:p-2.5 text-right text-foreground tabular-nums whitespace-nowrap">{row.videos.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-foreground tabular-nums whitespace-nowrap">{row.covers.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-muted-foreground tabular-nums whitespace-nowrap">{row.other.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-foreground tabular-nums whitespace-nowrap">{row.total.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                      <span className="sm:hidden">{formatGigabytes(row.sizeBytes)}</span>
                      <span className="hidden sm:inline">{formatBytes(row.sizeBytes)}</span>
                    </td>
                  </tr>
                ))}
                {r2Summary.formats.length === 0 && (
                  <tr>
                    <td className="p-3 sm:p-4 text-center text-muted-foreground" colSpan={6}>
                      Nessun format trovato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Format Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {r2Summary.formats
                .filter(row => row.videos > 0)
                .map(row => (
                  <Link
                    key={`${row.format}-overview`}
                    href={`/analytics/formats/${encodeURIComponent(row.format)}`}
                    className="bg-card border border-border rounded-lg p-2 flex items-center gap-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="w-32 sm:w-40 md:w-36 xl:w-40 aspect-video rounded-md overflow-hidden border border-border bg-muted/20 shrink-0">
                      {(formatCovers[row.format] ?? row.coverHorizontalUrl) ? (
                        <Image
                          src={formatCovers[row.format] ?? row.coverHorizontalUrl!}
                          alt={`${row.format} orizzontale`}
                          width={320}
                          height={180}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">No cover</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                      <div className="text-xs sm:text-sm font-semibold text-foreground truncate">{row.format}</div>
                      <span className="inline-flex w-fit px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] sm:text-[11px] whitespace-nowrap">
                        Stagioni: {row.seasons}
                      </span>
                      <span className="inline-flex w-fit px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] sm:text-[11px] whitespace-nowrap">
                        Episodi: {row.episodes}
                      </span>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
