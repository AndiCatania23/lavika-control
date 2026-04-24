'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
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
  FileEdit,
  Pill,
} from 'lucide-react';

interface OverviewKpi { key: string; title: string; value: number; unit?: string; }

interface DashboardRun {
  id: string;
  jobName: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  triggeredBy: string;
}

interface DiagnosticsData { database: { connected: boolean }; }

interface MacStatus {
  daemon: {
    name: string;
    state: 'online' | 'stale' | 'offline' | 'unknown';
    lastSeenAt: string | null;
    ageSeconds: number | null;
    hostname: string | null;
  };
  queue: { pending: number; pendingStuck: number; running: number; success24h: number; failed24h: number };
  sources: Array<{ source: string; lastRunAt: string | null; lastStatus: string | null; lastSuccessAt: string | null }>;
}

interface R2Summary { connected: boolean; totals: { allAssets: number; sizeHuman: string }; }

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type Tone = 'ok' | 'warn' | 'error' | 'info';
type KpiCell = {
  key: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: Tone;
  href?: string;
};

function toneClass(tone: Tone): string {
  switch (tone) {
    case 'ok':    return 'lk-pill-ok';
    case 'warn':  return 'lk-pill-warn';
    case 'error': return 'lk-pill-err';
    case 'info':  return 'lk-pill-info';
  }
}

function KpiCellView({ cell }: { cell: KpiCell }) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="lk-micro truncate">{cell.label}</span>
        <span className={`lk-pill ${toneClass(cell.tone)} [&>svg]:w-3 [&>svg]:h-3`}>{cell.icon}</span>
      </div>
      <div className="lk-metric truncate">{cell.value}</div>
      <div className="lk-caption truncate">{cell.hint}</div>
    </>
  );
  if (cell.href) {
    return (
      <Link href={cell.href} className="lk-kpi-cell hover:bg-[color:var(--surface-2)] transition-colors">
        {content}
      </Link>
    );
  }
  return <div className="lk-kpi-cell">{content}</div>;
}

export default function DashboardPage() {
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
      fetch('/api/dev/overview',         { cache: 'no-store' }).then(r => r.json() as Promise<{ kpis?: OverviewKpi[] }>).then(p => setKpis(p.kpis ?? [])).catch(() => {}),
      fetch('/api/jobs/runs',            { cache: 'no-store' }).then(r => r.json() as Promise<DashboardRun[]>).then(p => setRuns((p ?? []).slice(0, 6))).catch(() => {}),
      fetch('/api/dev/diagnostics',      { cache: 'no-store' }).then(r => r.json() as Promise<DiagnosticsData>).then(p => setDiagnostics(p)).catch(() => {}),
      fetch('/api/dev/mac-status',       { cache: 'no-store' }).then(r => r.json() as Promise<MacStatus>).then(p => setMacStatus(p)).catch(() => {}),
      fetch('/api/dev/r2/summary?fast=1',{ cache: 'no-store' }).then(r => r.json() as Promise<R2Summary>).then(p => setR2Summary(p)).catch(() => {}),
    ];

    Promise.allSettled(fetches).finally(() => {
      setRefreshing(false);
      setLastUpdated(new Date().toLocaleTimeString('it-IT'));
    });
  }, []);

  useEffect(() => {
    loadData();
    let timer: number | null = null;
    const start = () => { if (timer == null) timer = window.setInterval(() => loadData(true), REFRESH_INTERVAL_MS); };
    const stop  = () => { if (timer != null) { window.clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { loadData(true); start(); } else { stop(); }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [loadData]);

  // ── Health pills (Supabase / R2 / Daemon) ──
  const health = useMemo(() => {
    const supabaseOk = diagnostics?.database.connected ?? false;
    const r2Ok = r2Summary?.connected ?? false;
    const daemonState = macStatus?.daemon.state ?? 'unknown';
    const daemonAge = macStatus?.daemon.ageSeconds;
    const daemonTone: Tone =
      daemonState === 'online' ? 'ok' : daemonState === 'stale' ? 'warn' : 'error';
    return [
      { label: 'Supabase',  tone: (supabaseOk ? 'ok' : 'error') as Tone, detail: supabaseOk ? 'Connesso' : 'Non raggiungibile', icon: <Database className="w-4 h-4" /> },
      { label: 'R2 Bucket', tone: (r2Ok ? 'ok' : 'error') as Tone, detail: r2Ok ? 'Online' : 'Non raggiungibile', icon: <HardDrive className="w-4 h-4" /> },
      { label: 'Daemon Mac Mini', tone: daemonTone, detail: daemonState === 'online' ? `Online · hb ${daemonAge ?? '-'}s fa` : daemonState === 'stale' ? `Heartbeat in ritardo (${daemonAge ?? '-'}s)` : daemonState === 'offline' ? 'Offline' : 'Stato sconosciuto', icon: <Cpu className="w-4 h-4" /> },
    ];
  }, [diagnostics, macStatus, r2Summary]);

  // ── KPI grid (6 colonne desktop, 3 tablet, 2 mobile) ──
  const kpiCells = useMemo<KpiCell[]>(() => {
    const failed = macStatus?.queue.failed24h ?? 0;
    const stuck  = macStatus?.queue.pendingStuck ?? 0;
    return [
      { key: 'users_now',   label: 'Attivi ora',    value: getKpi('active_users_now').toLocaleString('it-IT'), hint: 'Ultimi 30 min',        icon: <UserCheck className="w-3 h-3" />, tone: 'info', href: '/users' },
      { key: 'users_24h',   label: 'Attivi 24h',    value: getKpi('active_users_24h').toLocaleString('it-IT'), hint: 'Ultime 24 ore',        icon: <Users     className="w-3 h-3" />, tone: 'info', href: '/users' },
      { key: 'sync_ok',     label: 'Sync OK 24h',   value: (macStatus?.queue.success24h ?? 0).toLocaleString('it-IT'), hint: 'Job completati', icon: <Zap       className="w-3 h-3" />, tone: 'ok',   href: '/jobs' },
      { key: 'sync_err',    label: 'Errori Sync',   value: failed.toLocaleString('it-IT'),                     hint: failed > 0 ? 'Ultime 24h' : 'Tutto tranquillo', icon: <AlertTriangle className="w-3 h-3" />, tone: failed > 0 ? 'warn' : 'ok', href: '/errors' },
      { key: 'pending',     label: 'In coda',       value: (macStatus?.queue.pending ?? 0).toLocaleString('it-IT'), hint: stuck > 0 ? `${stuck} bloccati >15m` : 'Pending regolari', icon: <Hourglass className="w-3 h-3" />, tone: stuck > 0 ? 'error' : 'info', href: '/jobs' },
      { key: 'r2',          label: 'Asset R2',      value: (r2Summary?.totals.allAssets ?? 0).toLocaleString('it-IT'), hint: r2Summary?.totals.sizeHuman ?? '-', icon: <HardDrive className="w-3 h-3" />, tone: r2Summary?.connected ? 'ok' : 'error' },
    ];
  }, [getKpi, macStatus, r2Summary]);

  // ── Secondary KPI row (revenue, pills-to-review) ──
  const secondary = useMemo<KpiCell[]>(() => {
    return [
      { key: 'revenue',     label: 'Revenue totale', value: `€ ${getKpi('users_revenue_total').toLocaleString('it-IT')}`, hint: 'Sum LTV base utenti', icon: <Coins className="w-3 h-3" />, tone: 'ok' },
      { key: 'users_total', label: 'Utenti totali',  value: getKpi('total_users').toLocaleString('it-IT'), hint: 'Autenticati', icon: <Users className="w-3 h-3" />, tone: 'info', href: '/users' },
    ];
  }, [getKpi]);

  const loaded = kpis.length > 0 && macStatus !== null && diagnostics !== null && r2Summary !== null;

  return (
    <div className="lk-page space-y-6 lg:space-y-7">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="lk-display">Oggi</h1>
          <p className="lk-caption mt-1">Stato sistema e KPI operativi a colpo d'occhio.</p>
        </div>
        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 h-10 rounded-lg border border-[color:var(--hairline)] bg-card text-sm text-foreground hover:bg-[color:var(--surface-2)] disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Aggiorna</span>
          {lastUpdated && <span className="lk-caption hidden md:inline">· {lastUpdated}</span>}
        </button>
      </div>

      {/* Health strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {loaded ? health.map(h => (
          <div key={h.label} className="lk-card flex items-center justify-between gap-3 p-3 sm:p-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`inline-grid place-items-center w-8 h-8 rounded-md ${
                h.tone === 'ok'    ? 'bg-[color:color-mix(in_oklab,var(--success)_10%,transparent)] text-[color:var(--success)]'
                : h.tone === 'warn' ? 'bg-[color:color-mix(in_oklab,var(--warn)_12%,transparent)] text-[color:var(--warn)]'
                : 'bg-[color:color-mix(in_oklab,var(--danger)_10%,transparent)] text-[color:var(--danger)]'
              }`}>{h.icon}</span>
              <div className="min-w-0">
                <div className="lk-micro">{h.label}</div>
                <div className="lk-label truncate">{h.detail}</div>
              </div>
            </div>
            {h.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 text-[color:var(--success)] shrink-0" /> : <XCircle className="w-4 h-4 text-[color:var(--danger)] shrink-0" />}
          </div>
        )) : Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="lk-card h-[60px] animate-pulse" />
        ))}
      </div>

      {/* KPI grid 6-col */}
      {loaded ? (
        <div className="lk-kpi-grid">
          {kpiCells.map(cell => <KpiCellView key={cell.key} cell={cell} />)}
        </div>
      ) : (
        <div className="lk-kpi-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="lk-kpi-cell h-[92px] animate-pulse" />
          ))}
        </div>
      )}

      {/* Secondary row */}
      {loaded && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {secondary.map(cell => (
            <Link key={cell.key} href={cell.href ?? '#'} className="lk-card p-3 sm:p-4 block hover:bg-[color:var(--surface-2)] transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="lk-micro truncate">{cell.label}</span>
                <span className={`lk-pill ${toneClass(cell.tone)} [&>svg]:w-3 [&>svg]:h-3`}>{cell.icon}</span>
              </div>
              <div className="lk-metric truncate">{cell.value}</div>
              <div className="lk-caption truncate">{cell.hint}</div>
            </Link>
          ))}
        </div>
      )}

      {/* Split: Sources & Runs */}
      <div className="lk-split">
        {/* Sync per source */}
        <div className="lk-card">
          <div className="lk-card-head">
            <div>
              <h3 className="lk-h2">Ultimi Sync per Source</h3>
              <p className="lk-caption">Top-level stato per ogni sorgente</p>
            </div>
            {macStatus?.daemon.hostname && (
              <span className="lk-micro">{macStatus.daemon.hostname}</span>
            )}
          </div>
          <div>
            {(macStatus?.sources ?? []).map(s => (
              <div key={s.source} className="lk-row lk-row--mobile-card grid-cols-[1fr_auto]">
                <div className="min-w-0 lk-cell-primary">
                  <div className="lk-label truncate">{s.source}</div>
                  <div className="lk-caption truncate">
                    Ultimo sync: {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString('it-IT') : 'mai'}
                  </div>
                </div>
                <span className={`lk-pill lk-cell-right ${
                  s.lastStatus === 'success' ? 'lk-pill-ok'
                  : s.lastStatus === 'failed' ? 'lk-pill-err'
                  : s.lastStatus === 'running' || s.lastStatus === 'pending' ? 'lk-pill-info'
                  : 'lk-pill-warn'
                }`}>
                  {s.lastStatus ?? '-'}
                </span>
              </div>
            ))}
            {(!macStatus || macStatus.sources.length === 0) && (
              <div className="p-5 lk-caption">Nessun sync recente</div>
            )}
          </div>
        </div>

        {/* Ultime run */}
        <div className="lk-card">
          <div className="lk-card-head">
            <div>
              <h3 className="lk-h2">Ultime Esecuzioni</h3>
              <p className="lk-caption">Job queue recenti</p>
            </div>
            <Link href="/jobs" className="lk-micro hover:text-foreground transition-colors inline-flex items-center gap-1">
              Tutte <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div>
            {runs.map(run => (
              <div key={run.id} className="lk-row lk-row--mobile-card grid-cols-[1fr_auto]">
                <div className="min-w-0 lk-cell-primary">
                  <div className="lk-label truncate">{run.jobName}</div>
                  <div className="lk-caption truncate flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    {new Date(run.startedAt).toLocaleString('it-IT')} · {run.triggeredBy}
                  </div>
                </div>
                <span className={`lk-pill lk-cell-right ${
                  run.status === 'success'   ? 'lk-pill-ok'
                  : run.status === 'failed'  ? 'lk-pill-err'
                  : run.status === 'cancelled'? 'lk-pill-warn'
                  : 'lk-pill-info'
                }`}>
                  {run.status}
                </span>
              </div>
            ))}
            {runs.length === 0 && <div className="p-5 lk-caption">Nessuna esecuzione recente</div>}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Link href="/pills" className="lk-card flex items-center justify-between p-4 hover:bg-[color:var(--surface-2)] transition-colors">
          <div className="flex items-center gap-2.5">
            <Pill className="w-4 h-4 text-[color:var(--primary)]" strokeWidth={1.75} />
            <span className="lk-label">Rivedi Pills</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link href="/palinsesto-home" className="lk-card flex items-center justify-between p-4 hover:bg-[color:var(--surface-2)] transition-colors">
          <div className="flex items-center gap-2.5">
            <FileEdit className="w-4 h-4 text-[color:var(--primary)]" strokeWidth={1.75} />
            <span className="lk-label">Palinsesto Home</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link href="/analytics" className="lk-card flex items-center justify-between p-4 hover:bg-[color:var(--surface-2)] transition-colors">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4 text-[color:var(--primary)]">
              <path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>
            </svg>
            <span className="lk-label">Analytics complete</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
