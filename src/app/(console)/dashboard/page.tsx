'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SectionHeader } from '@/components/SectionHeader';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  Database,
  HardDrive,
  Hourglass,
  RefreshCw,
  UserCheck,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';

interface OverviewKpi {
  key: string;
  title: string;
  value: number;
  unit?: string;
}

interface DashboardRun {
  id: string;
  jobName: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  triggeredBy: string;
}

interface DiagnosticsData {
  database: {
    connected: boolean;
  };
}

interface MacStatus {
  daemon: {
    name: string;
    state: 'online' | 'stale' | 'offline' | 'unknown';
    lastSeenAt: string | null;
    startedAt: string | null;
    ageSeconds: number | null;
    pid: number | null;
    hostname: string | null;
    meta: Record<string, unknown> | null;
  };
  queue: {
    pending: number;
    pendingStuck: number;
    running: number;
    success24h: number;
    failed24h: number;
  };
  sources: Array<{
    source: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastSuccessAt: string | null;
  }>;
}

interface R2Summary {
  connected: boolean;
  totals: {
    allAssets: number;
    sizeHuman: string;
  };
}

interface HealthItem {
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  icon: React.ReactNode;
}

interface MetricItem {
  key: string;
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  iconClassName: string;
  status: 'ok' | 'warn' | 'error';
}

const REFRESH_INTERVAL_MS = 30000;

function MetricCard({
  title,
  value,
  hint,
  icon,
  iconClassName,
  status,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  iconClassName: string;
  status?: 'ok' | 'warn' | 'error';
}) {
  const statusClass =
    status === 'error'
      ? 'border-red-500/30'
      : status === 'warn'
      ? 'border-yellow-500/30'
      : 'border-border';

  return (
    <div className={`bg-card border rounded-lg p-3 sm:p-3.5 ${statusClass}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-muted-foreground line-clamp-1">{title}</span>
        <span className={iconClassName}>{icon}</span>
      </div>
      <div className="text-lg sm:text-xl font-semibold text-foreground leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{hint}</div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [kpis, setKpis] = useState<OverviewKpi[]>([]);
  const [runs, setRuns] = useState<DashboardRun[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [macStatus, setMacStatus] = useState<MacStatus | null>(null);
  const [r2Summary, setR2Summary] = useState<R2Summary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const getKpi = useCallback(
    (key: string) => kpis.find(item => item.key === key)?.value ?? 0,
    [kpis]
  );

  const loadData = useCallback((background = false) => {
    if (background) setRefreshing(true);

    const fetches = [
      fetch('/api/dev/overview', { cache: 'no-store' })
        .then(r => r.json() as Promise<{ kpis?: OverviewKpi[] }>)
        .then(p => setKpis(p.kpis ?? []))
        .catch(() => {}),
      fetch('/api/jobs/runs', { cache: 'no-store' })
        .then(r => r.json() as Promise<DashboardRun[]>)
        .then(p => setRuns((p ?? []).slice(0, 6)))
        .catch(() => {}),
      fetch('/api/dev/diagnostics', { cache: 'no-store' })
        .then(r => r.json() as Promise<DiagnosticsData>)
        .then(p => setDiagnostics(p))
        .catch(() => {}),
      fetch('/api/dev/mac-status', { cache: 'no-store' })
        .then(r => r.json() as Promise<MacStatus>)
        .then(p => setMacStatus(p))
        .catch(() => {}),
      fetch('/api/dev/r2/summary?fast=1', { cache: 'no-store' })
        .then(r => r.json() as Promise<R2Summary>)
        .then(p => setR2Summary(p))
        .catch(() => {}),
    ];

    Promise.allSettled(fetches).finally(() => {
      setRefreshing(false);
      setLastUpdated(new Date().toLocaleTimeString('it-IT'));
    });
  }, []);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(() => loadData(true), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const metricCards = useMemo<MetricItem[]>(() => {
    const syncErrors = macStatus?.queue.failed24h ?? 0;
    const pendingStuck = macStatus?.queue.pendingStuck ?? 0;

    return [
      {
        key: 'total_users',
        title: 'Utenti Totali',
        value: getKpi('total_users').toLocaleString('it-IT'),
        hint: 'Base utenti autenticati',
        icon: <Users className="w-4 h-4" />,
        iconClassName: 'text-sky-500',
        status: 'ok' as const,
      },
      {
        key: 'active_users_now',
        title: 'Attivi Ora',
        value: getKpi('active_users_now').toLocaleString('it-IT'),
        hint: 'Attivita app ultimi 30 minuti',
        icon: <UserCheck className="w-4 h-4" />,
        iconClassName: 'text-sky-500',
        status: 'ok' as const,
      },
      {
        key: 'active_users_24h',
        title: 'Attivi 24h',
        value: getKpi('active_users_24h').toLocaleString('it-IT'),
        hint: 'Attivita app ultime 24 ore',
        icon: <UserCheck className="w-4 h-4" />,
        iconClassName: 'text-sky-500',
        status: 'ok' as const,
      },
      {
        key: 'sync_24h',
        title: 'Sync 24h',
        value: (macStatus?.queue.success24h ?? 0).toLocaleString('it-IT'),
        hint: 'Job completati dal daemon',
        icon: <Zap className="w-4 h-4" />,
        iconClassName: 'text-indigo-500',
        status: 'ok' as const,
      },
      {
        key: 'sync_errors_24h',
        title: 'Errori Sync 24h',
        value: syncErrors.toLocaleString('it-IT'),
        hint: 'Job falliti nelle ultime 24h',
        icon: <AlertTriangle className="w-4 h-4" />,
        iconClassName: syncErrors > 0 ? 'text-amber-500' : 'text-indigo-500',
        status: syncErrors > 0 ? 'warn' as const : 'ok' as const,
      },
      {
        key: 'queue_pending',
        title: 'In coda',
        value: (macStatus?.queue.pending ?? 0).toLocaleString('it-IT'),
        hint: pendingStuck > 0 ? `${pendingStuck} bloccati > 15min` : 'Pending in attesa',
        icon: <Hourglass className="w-4 h-4" />,
        iconClassName: pendingStuck > 0 ? 'text-red-500' : 'text-muted-foreground',
        status: pendingStuck > 0 ? 'error' as const : 'ok' as const,
      },
      {
        key: 'users_revenue_total',
        title: 'Revenue Totale',
        value: `EUR ${getKpi('users_revenue_total').toLocaleString('it-IT')}`,
        hint: 'Somma revenue/ltv',
        icon: <Coins className="w-4 h-4" />,
        iconClassName: 'text-emerald-500',
        status: 'ok' as const,
      },
      {
        key: 'r2_assets',
        title: 'Asset R2',
        value: (r2Summary?.totals.allAssets ?? 0).toLocaleString('it-IT'),
        hint: `Storage: ${r2Summary?.totals.sizeHuman ?? '-'}`,
        icon: <HardDrive className="w-4 h-4" />,
        iconClassName: r2Summary?.connected ? 'text-violet-500' : 'text-red-500',
        status: r2Summary?.connected ? 'ok' as const : 'error' as const,
      },
    ];
  }, [getKpi, macStatus, r2Summary]);

  const healthItems = useMemo<HealthItem[]>(() => {
    const supabaseOk = diagnostics?.database.connected ?? false;
    const r2Ok = r2Summary?.connected ?? false;
    const daemonState = macStatus?.daemon.state ?? 'unknown';
    const daemonAge = macStatus?.daemon.ageSeconds;

    const daemonStatus: 'ok' | 'warn' | 'error' =
      daemonState === 'online' ? 'ok' : daemonState === 'stale' ? 'warn' : 'error';
    const daemonDetail =
      daemonState === 'online'
        ? `Online · hb ${daemonAge ?? '-'}s fa`
        : daemonState === 'stale'
          ? `Heartbeat in ritardo (${daemonAge ?? '-'}s)`
          : daemonState === 'offline'
            ? 'Daemon offline'
            : 'Stato sconosciuto';

    return [
      {
        label: 'Supabase',
        status: supabaseOk ? 'ok' : 'error',
        detail: supabaseOk ? 'Connesso' : 'Non raggiungibile',
        icon: <Database className="w-4 h-4" />,
      },
      {
        label: 'R2',
        status: r2Ok ? 'ok' : 'error',
        detail: r2Ok ? 'Bucket online' : 'Connessione assente',
        icon: <HardDrive className="w-4 h-4" />,
      },
      {
        label: 'Mac Mini',
        status: daemonStatus,
        detail: daemonDetail,
        icon: <Cpu className="w-4 h-4" />,
      },
    ];
  }, [diagnostics, macStatus, r2Summary]);

  const kpisLoaded = kpis.length > 0;
  const diagnosticsLoaded = diagnostics !== null;
  const macLoaded = macStatus !== null;
  const r2Loaded = r2Summary !== null;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 lg:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Indietro
      </button>

      <SectionHeader
        title="Dashboard"
        description="Stato sistema e KPI operativi a colpo d occhio"
        actions={
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted/40 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Aggiorna {lastUpdated ? `(${lastUpdated})` : ''}
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {(diagnosticsLoaded && macLoaded && r2Loaded) ? healthItems.map(item => (
          <div key={item.label} className="bg-card border border-border rounded-lg p-2 sm:p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.label}</div>
              <div className="text-[11px] sm:text-sm font-medium text-foreground truncate">{item.detail}</div>
            </div>
            <div className={`inline-flex items-center gap-1 px-0 py-0 sm:px-2 sm:py-1 rounded text-[10px] leading-none sm:text-xs shrink-0 ${
              item.status === 'ok'
                ? 'bg-transparent text-green-600 sm:bg-green-500/10'
                : item.status === 'warn'
                ? 'bg-transparent text-yellow-600 sm:bg-yellow-500/10'
                : 'bg-transparent text-red-600 sm:bg-red-500/10'
            }`}>
              {item.status === 'ok' ? <CheckCircle2 className="w-3 h-3 shrink-0 sm:w-3.5 sm:h-3.5" /> : <XCircle className="w-3 h-3 shrink-0 sm:w-3.5 sm:h-3.5" />}
              <span className="inline-flex shrink-0">{item.icon}</span>
            </div>
          </div>
        )) : Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-2 sm:p-3 h-[52px] animate-pulse" />
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {(kpisLoaded && macLoaded) ? metricCards.map(card => (
          <MetricCard
            key={card.key}
            title={card.title}
            value={card.value}
            hint={card.hint}
            icon={card.icon}
            iconClassName={card.iconClassName}
            status={card.status}
          />
        )) : Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-3 sm:p-3.5 h-[78px] animate-pulse" />
        ))}
      </div>

      {/* Mac Mini sync per source */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Ultimi Sync per Source</h3>
          {macStatus?.daemon.hostname && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{macStatus.daemon.hostname}</span>
          )}
        </div>
        <div className="space-y-2">
          {(macStatus?.sources ?? []).map(s => (
            <div key={s.source} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-foreground truncate font-medium">{s.source}</div>
                <div className="text-[11px] text-muted-foreground">
                  Ultimo sync: {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString('it-IT') : 'mai'}
                </div>
              </div>
              <div className={`text-[11px] uppercase px-2 py-1 rounded shrink-0 ${
                s.lastStatus === 'success'
                  ? 'bg-green-500/10 text-green-600'
                  : s.lastStatus === 'failed'
                  ? 'bg-red-500/10 text-red-600'
                  : s.lastStatus === 'running' || s.lastStatus === 'pending'
                  ? 'bg-blue-500/10 text-blue-600'
                  : 'bg-yellow-500/10 text-yellow-600'
              }`}>
                {s.lastStatus ?? '-'}
              </div>
            </div>
          ))}
          {(!macStatus || macStatus.sources.length === 0) && (
            <div className="text-sm text-muted-foreground">Nessun sync recente</div>
          )}
        </div>
      </div>

      {/* Ultimi run queue (generic) */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-foreground mb-3">Ultime Esecuzioni</h3>
        <div className="space-y-2">
          {runs.map(run => (
            <div key={run.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-foreground truncate">{run.jobName}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{new Date(run.startedAt).toLocaleString('it-IT')} · {run.triggeredBy}
                </div>
              </div>
              <div className={`text-[11px] uppercase px-2 py-1 rounded shrink-0 ${
                run.status === 'success'
                  ? 'bg-green-500/10 text-green-600'
                  : run.status === 'failed'
                  ? 'bg-red-500/10 text-red-600'
                  : run.status === 'cancelled'
                  ? 'bg-yellow-500/10 text-yellow-600'
                  : 'bg-blue-500/10 text-blue-600'
              }`}>
                {run.status}
              </div>
            </div>
          ))}
          {runs.length === 0 && <div className="text-sm text-muted-foreground">Nessuna esecuzione recente</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link href="/users" className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
          <span className="text-sm text-foreground">Gestione Utenti</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link href="/analytics" className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
          <span className="text-sm text-foreground">Analisi Contenuti</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
