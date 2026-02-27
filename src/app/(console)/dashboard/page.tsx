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
  Coins,
  Database,
  GitBranch,
  HardDrive,
  RefreshCw,
  UserCheck,
  Users,
  XCircle,
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
  github?: {
    workflows?: number;
  };
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
  const [r2Summary, setR2Summary] = useState<R2Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const getKpi = useCallback(
    (key: string) => kpis.find(item => item.key === key)?.value ?? 0,
    [kpis]
  );

  const loadData = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);

    try {
      const [kpiResponse, runsResponse, diagnosticsResponse, r2Response] = await Promise.all([
        fetch('/api/dev/overview', { cache: 'no-store' }),
        fetch('/api/jobs/runs', { cache: 'no-store' }),
        fetch('/api/dev/diagnostics', { cache: 'no-store' }),
        fetch('/api/dev/r2/summary', { cache: 'no-store' }),
      ]);

      const kpiPayload = (await kpiResponse.json()) as { kpis?: OverviewKpi[] };
      const runsPayload = (await runsResponse.json()) as DashboardRun[];
      const diagnosticsPayload = (await diagnosticsResponse.json()) as DiagnosticsData;
      const r2Payload = (await r2Response.json()) as R2Summary;

      setKpis(kpiPayload.kpis ?? []);
      setRuns((runsPayload ?? []).slice(0, 6));
      setDiagnostics(diagnosticsPayload);
      setR2Summary(r2Payload);
      setLastUpdated(new Date().toLocaleTimeString('it-IT'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(() => loadData(true), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const metricCards = useMemo<MetricItem[]>(() => {
    const workflowErrors = getKpi('workflow_errors_24h');

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
        key: 'workflow_runs_24h',
        title: 'Workflow 24h',
        value: getKpi('workflow_runs_24h').toLocaleString('it-IT'),
        hint: 'Esecuzioni GitHub Actions',
        icon: <GitBranch className="w-4 h-4" />,
        iconClassName: 'text-indigo-500',
        status: 'ok' as const,
      },
      {
        key: 'workflow_errors_24h',
        title: 'Errori Workflow 24h',
        value: workflowErrors.toLocaleString('it-IT'),
        hint: 'Failure nelle ultime 24h',
        icon: <AlertTriangle className="w-4 h-4" />,
        iconClassName: workflowErrors > 0 ? 'text-amber-500' : 'text-indigo-500',
        status: workflowErrors > 0 ? 'warn' as const : 'ok' as const,
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
  }, [getKpi, r2Summary]);

  const healthItems = useMemo<HealthItem[]>(() => {
    const supabaseOk = diagnostics?.database.connected ?? false;
    const r2Ok = r2Summary?.connected ?? false;
    const githubOk = (diagnostics?.github?.workflows ?? 0) > 0;

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
        label: 'GitHub Actions',
        status: githubOk ? 'ok' : 'warn',
        detail: githubOk
          ? `${diagnostics?.github?.workflows ?? 0} workflow letti`
          : 'Nessun workflow letto',
        icon: <GitBranch className="w-4 h-4" />,
      },
    ];
  }, [diagnostics, r2Summary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        {healthItems.map(item => (
          <div key={item.label} className="bg-card border border-border rounded-lg p-2 sm:p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.label}</div>
              <div className="text-[11px] sm:text-sm font-medium text-foreground truncate">{item.detail}</div>
            </div>
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[10px] sm:text-xs shrink-0 ${
              item.status === 'ok'
                ? 'bg-green-500/10 text-green-600'
                : item.status === 'warn'
                ? 'bg-yellow-500/10 text-yellow-600'
                : 'bg-red-500/10 text-red-600'
            }`}>
              {item.status === 'ok' ? <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              <span className="inline-flex">{item.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        {metricCards.map(card => (
          <MetricCard
            key={card.key}
            title={card.title}
            value={card.value}
            hint={card.hint}
            icon={card.icon}
            iconClassName={card.iconClassName}
            status={card.status}
          />
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-semibold text-foreground mb-3">Ultime Esecuzioni GitHub</h3>
        <div className="space-y-2">
          {runs.map(run => (
            <div key={run.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-foreground truncate">{run.jobName}</div>
                <div className="text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString('it-IT')}</div>
              </div>
              <div className={`text-[11px] uppercase px-2 py-1 rounded ${
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
