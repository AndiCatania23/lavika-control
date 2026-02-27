'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SectionHeader } from '@/components/SectionHeader';
import { Users, DollarSign, FileText, HardDrive, RefreshCw, Film, ImageIcon, Layers } from 'lucide-react';

type Tab = 'users' | 'revenue' | 'content';

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

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [overviewKpis, setOverviewKpis] = useState<OverviewKpi[]>([]);
  const [r2Summary, setR2Summary] = useState<R2Summary>(emptyR2Summary);
  const [r2Loading, setR2Loading] = useState(false);

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
      const response = await fetch('/api/dev/r2/summary', { cache: 'no-store' });
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

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (activeTab === 'content') {
      loadR2Summary();
    }
  }, [activeTab]);

  const tabs: Array<{ id: Tab; label: string; mobileLabel: string; icon: React.ReactNode }> = [
    { id: 'users', label: 'Audience', mobileLabel: 'Utenti', icon: <Users className="h-3.5 w-3.5" /> },
    { id: 'revenue', label: 'Monetizzazione', mobileLabel: 'Ricavi', icon: <DollarSign className="h-3.5 w-3.5" /> },
    { id: 'content', label: 'Catalogo', mobileLabel: 'Asset', icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  const totalUsers = getKpi('total_users');
  const activeUsersNow = getKpi('active_users_now');
  const activeUsers24h = getKpi('active_users_24h');
  const activeUsers7d = getKpi('active_users_7d');
  const activeRate = totalUsers > 0 ? (activeUsers7d / totalUsers) * 100 : 0;

  const totalRevenue = getKpi('users_revenue_total');
  const arpu = totalUsers > 0 ? totalRevenue / totalUsers : 0;
  const revenuePerActive7d = activeUsers7d > 0 ? totalRevenue / activeUsers7d : 0;

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

  return (
    <div className="space-y-6">
      <SectionHeader title="Analisi" description="Vista KPI operativa per team DEV" />

      <div className="rounded-xl border border-border bg-card/70 p-1">
        <nav className="grid grid-cols-3 gap-1">
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

      {activeTab !== 'content' && (
        <div className="rounded-lg border border-border p-3.5 text-xs text-muted-foreground">
          Nessun valore stimato o demo: qui vedi solo KPI reali disponibili oggi. Per trend storici servono serie temporali dedicate.
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
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-1.5 sm:p-2.5 font-medium">Format</th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium">
                    <span className="inline-flex items-center justify-end w-full" aria-label="Video" title="Video">
                      <Film className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Video</span>
                    </span>
                  </th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium">
                    <span className="inline-flex items-center justify-end w-full" aria-label="Copertine" title="Copertine">
                      <ImageIcon className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Copertine</span>
                    </span>
                  </th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium">
                    <span className="inline-flex items-center justify-end w-full" aria-label="Altri" title="Altri">
                      <Layers className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Altri</span>
                    </span>
                  </th>
                  <th className="text-center p-1.5 sm:p-2.5 font-medium">Totale</th>
                  <th className="text-right p-1.5 sm:p-2.5 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {r2Summary.formats.map(row => (
                  <tr key={row.format} className="border-t border-border">
                    <td className="p-1.5 sm:p-2.5 text-foreground font-medium">{row.format}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-foreground">{row.videos.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-foreground">{row.covers.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-muted-foreground">{row.other.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-center text-foreground">{row.total.toLocaleString('it-IT')}</td>
                    <td className="p-1.5 sm:p-2.5 text-right text-muted-foreground">
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
                      {row.coverHorizontalUrl ? (
                        <Image
                          src={row.coverHorizontalUrl}
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
