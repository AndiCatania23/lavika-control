'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Pill as PillIcon,
  AlertTriangle,
  CalendarClock,
  ArrowRight,
  Database,
  HardDrive,
  Cpu,
  RefreshCw,
  Users,
  UserCheck,
  Zap,
  Coins,
  Hourglass,
  CheckCircle2,
  XCircle,
  ImageIcon,
  Archive,
} from 'lucide-react';

/* ==================================================================
   Types
   ================================================================== */

interface OverviewKpi { key: string; title: string; value: number; unit?: string; }

interface DashboardRun {
  id: string; jobName: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string; triggeredBy: string;
}

interface DiagnosticsData { database: { connected: boolean }; }

interface MacStatus {
  daemon: { name: string; state: 'online' | 'stale' | 'offline' | 'unknown'; lastSeenAt: string | null; ageSeconds: number | null; hostname: string | null; };
  queue: { pending: number; pendingStuck: number; running: number; success24h: number; failed24h: number };
  sources: Array<{ source: string; lastRunAt: string | null; lastStatus: string | null; lastSuccessAt: string | null }>;
}

interface R2Summary { connected: boolean; totals: { allAssets: number; sizeHuman: string }; }

interface Pill {
  id: string; title: string; status: 'draft' | 'scheduled' | 'published' | 'rejected';
  scheduled_at: string | null; audit_flags: Array<{ term: string }> | null;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/* ==================================================================
   Helpers
   ================================================================== */

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function countDraftsAndScheduled(pills: Pill[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const scheduledToday = pills.filter(p => {
    if (p.status !== 'scheduled' || !p.scheduled_at) return false;
    const d = new Date(p.scheduled_at);
    return d >= today && d < tomorrow;
  });
  const drafts = pills.filter(p => p.status === 'draft');
  const flaggedDrafts = drafts.filter(p => Array.isArray(p.audit_flags) && p.audit_flags.length > 0);
  return { drafts, scheduledToday, flaggedDrafts };
}

/* ==================================================================
   Page
   ================================================================== */

export default function DashboardPage() {
  const [kpis, setKpis] = useState<OverviewKpi[]>([]);
  const [runs, setRuns] = useState<DashboardRun[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [macStatus, setMacStatus] = useState<MacStatus | null>(null);
  const [r2Summary, setR2Summary] = useState<R2Summary | null>(null);
  const [pills, setPills] = useState<Pill[]>([]);
  const [printfulOrphans, setPrintfulOrphans] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const getKpi = useCallback((key: string) => kpis.find(k => k.key === key)?.value ?? 0, [kpis]);

  const loadData = useCallback((background = false) => {
    if (background) setRefreshing(true);
    const all = [
      fetch('/api/dev/overview',          { cache: 'no-store' }).then(r => r.json() as Promise<{ kpis?: OverviewKpi[] }>).then(p => setKpis(p.kpis ?? [])).catch(() => {}),
      fetch('/api/jobs/runs',             { cache: 'no-store' }).then(r => r.json() as Promise<DashboardRun[]>).then(p => setRuns((p ?? []).slice(0, 5))).catch(() => {}),
      fetch('/api/dev/diagnostics',       { cache: 'no-store' }).then(r => r.json() as Promise<DiagnosticsData>).then(p => setDiagnostics(p)).catch(() => {}),
      fetch('/api/dev/mac-status',        { cache: 'no-store' }).then(r => r.json() as Promise<MacStatus>).then(p => setMacStatus(p)).catch(() => {}),
      fetch('/api/dev/r2/summary?fast=1', { cache: 'no-store' }).then(r => r.json() as Promise<R2Summary>).then(p => setR2Summary(p)).catch(() => {}),
      fetch('/api/dev/pills',             { cache: 'no-store' }).then(r => r.json() as Promise<Pill[]>).then(p => setPills(p ?? [])).catch(() => {}),
      fetch('/api/dev/pod/printful/orphans', { cache: 'no-store' }).then(r => r.json() as Promise<{ count?: number }>).then(p => setPrintfulOrphans(p?.count ?? 0)).catch(() => {}),
    ];
    Promise.allSettled(all).finally(() => {
      setRefreshing(false);
      setLastUpdated(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    });
  }, []);

  useEffect(() => {
    loadData();
    let t: number | null = null;
    const start = () => { if (t == null) t = window.setInterval(() => loadData(true), REFRESH_INTERVAL_MS); };
    const stop  = () => { if (t != null) { window.clearInterval(t); t = null; } };
    const onVis = () => document.visibilityState === 'visible' ? (loadData(true), start()) : stop();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [loadData]);

  const { drafts, scheduledToday, flaggedDrafts } = useMemo(() => countDraftsAndScheduled(pills), [pills]);
  const errors24h = macStatus?.queue.failed24h ?? 0;
  const pendingStuck = macStatus?.queue.pendingStuck ?? 0;

  // Actions for inbox hero
  const actions = useMemo(() => {
    const items: Array<{ key: string; icon: React.ReactNode; label: string; count: number; urgent: boolean; href: string; hint: string }> = [];
    if (drafts.length > 0) items.push({
      key: 'draft-pills', icon: <PillIcon className="w-5 h-5" strokeWidth={1.75} />, label: 'Pill da approvare', count: drafts.length,
      urgent: flaggedDrafts.length > 0, href: '/pills?filter=draft',
      hint: flaggedDrafts.length > 0 ? `${flaggedDrafts.length} con audit flag` : 'Da revisionare',
    });
    if (errors24h > 0) items.push({
      key: 'errors', icon: <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />, label: 'Errori sync', count: errors24h,
      urgent: true, href: '/errors', hint: 'Ultime 24h',
    });
    if (pendingStuck > 0) items.push({
      key: 'stuck', icon: <Hourglass className="w-5 h-5" strokeWidth={1.75} />, label: 'Job bloccati', count: pendingStuck,
      urgent: true, href: '/jobs', hint: 'Pendenti > 15 min',
    });
    if (scheduledToday.length > 0) items.push({
      key: 'scheduled', icon: <CalendarClock className="w-5 h-5" strokeWidth={1.75} />, label: 'In programma oggi', count: scheduledToday.length,
      urgent: false, href: '/pills?filter=scheduled', hint: 'Auto-publish',
    });
    if (printfulOrphans > 0) items.push({
      key: 'printful-orphans', icon: <Archive className="w-5 h-5" strokeWidth={1.75} />, label: 'Prodotti Printful orfani', count: printfulOrphans,
      urgent: false, href: '/shop/printful', hint: 'Da archiviare',
    });
    return items;
  }, [drafts.length, errors24h, pendingStuck, scheduledToday.length, flaggedDrafts.length, printfulOrphans]);

  const loaded = diagnostics !== null && macStatus !== null && r2Summary !== null;

  return (
    <div className="vstack" style={{ gap: 'var(--s6)' }}>

      {/* ============ Refresh row ============ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typ-display">Ciao</h1>
          <p className="typ-caption mt-1">
            {lastUpdated ? `Aggiornato ${lastUpdated}` : 'Caricamento…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="btn btn-ghost btn-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          <span className="hidden sm:inline">Aggiorna</span>
        </button>
      </div>

      {/* ============ HERO: le tue azioni ============ */}
      <section className="card">
        <div className="card-head">
          <div>
            <div className="typ-micro">Le tue azioni</div>
            <div className="typ-h2 mt-1">{actions.length > 0 ? `${actions.length} da sistemare` : 'Tutto tranquillo'}</div>
          </div>
          {actions.length === 0 && <CheckCircle2 className="w-6 h-6 text-[color:var(--ok)]" />}
        </div>
        <div className="card-body">
          {actions.length === 0 ? (
            <p className="typ-body text-[color:var(--text-muted)]">
              Nessuna pill in attesa, zero errori, nessun job bloccato. Puoi proseguire senza interventi urgenti.
            </p>
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fit, minmax(min(280px, 100%), 1fr))`,
              }}
            >
              {actions.map(a => (
                <Link
                  key={a.key}
                  href={a.href}
                  className="card card-hover flex items-center gap-4 p-4"
                  style={{ boxShadow: 'none', borderColor: a.urgent ? 'color-mix(in oklab, var(--danger) 26%, transparent)' : 'var(--hairline-soft)' }}
                >
                  <div
                    className={a.urgent ? 'pill pill-err' : 'pill pill-accent'}
                    style={{ width: 48, height: 48, padding: 0, justifyContent: 'center', borderRadius: 'var(--r)', flexShrink: 0 }}
                  >
                    {a.icon}
                  </div>
                  <div className="grow min-w-0">
                    <div className="typ-micro truncate">{a.hint}</div>
                    <div className="flex items-baseline gap-2 mt-1 min-w-0 flex-wrap">
                      <span className="typ-metric shrink-0" style={{ fontSize: 26 }}>{a.count}</span>
                      <span className="typ-label truncate-2">{a.label}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[color:var(--text-muted)] shrink-0" strokeWidth={1.75} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ Health strip (Supabase / R2 / Daemon) ============ */}
      <section>
        <div className="typ-micro mb-2" style={{ paddingLeft: 2 }}>Stato sistema</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {loaded ? [
            { label: 'Supabase', ok: diagnostics!.database.connected, icon: <Database className="w-[18px] h-[18px]" strokeWidth={1.75} />, detail: diagnostics!.database.connected ? 'Connesso' : 'Non raggiungibile' },
            { label: 'R2 Bucket', ok: r2Summary!.connected, icon: <HardDrive className="w-[18px] h-[18px]" strokeWidth={1.75} />, detail: r2Summary!.connected ? `Online · ${r2Summary!.totals.sizeHuman}` : 'Offline' },
            { label: 'Daemon Mac',  ok: macStatus!.daemon.state === 'online', warn: macStatus!.daemon.state === 'stale', icon: <Cpu className="w-[18px] h-[18px]" strokeWidth={1.75} />, detail: macStatus!.daemon.state === 'online' ? `Online · hb ${macStatus!.daemon.ageSeconds ?? '-'}s fa` : macStatus!.daemon.state === 'stale' ? `Lento (${macStatus!.daemon.ageSeconds ?? '-'}s)` : 'Offline' },
          ].map(h => (
            <div key={h.label} className="card card-body flex items-center gap-3">
              <div
                className="inline-flex items-center justify-center shrink-0"
                style={{
                  width: 40, height: 40, borderRadius: 'var(--r)',
                  background: h.ok ? 'color-mix(in oklab, var(--ok) 10%, transparent)' : h.warn ? 'color-mix(in oklab, var(--warn) 12%, transparent)' : 'color-mix(in oklab, var(--danger) 10%, transparent)',
                  color: h.ok ? 'var(--ok)' : h.warn ? 'var(--warn)' : 'var(--danger)',
                }}
              >
                {h.icon}
              </div>
              <div className="grow min-w-0">
                <div className="typ-micro">{h.label}</div>
                <div className="typ-label truncate">{h.detail}</div>
              </div>
              {h.ok ? <CheckCircle2 className="w-4 h-4 text-[color:var(--ok)] shrink-0" /> : h.warn ? <span className="dot dot-warn dot-pulse" /> : <XCircle className="w-4 h-4 text-[color:var(--danger)] shrink-0" />}
            </div>
          )) : Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 72, opacity: 0.4 }} />
          ))}
        </div>
      </section>

      {/* ============ KPI grid ============ */}
      <section>
        <div className="typ-micro mb-2" style={{ paddingLeft: 2 }}>Numeri</div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiTile label="Attivi ora"   icon={<UserCheck className="w-[14px] h-[14px]" />} value={getKpi('active_users_now').toLocaleString('it-IT')} hint="30 min"       tone="info" href="/users" />
          <KpiTile label="Attivi 24h"   icon={<Users     className="w-[14px] h-[14px]" />} value={getKpi('active_users_24h').toLocaleString('it-IT')} hint="Giornaliero"  tone="info" href="/users" />
          <KpiTile label="Sync OK 24h"  icon={<Zap       className="w-[14px] h-[14px]" />} value={(macStatus?.queue.success24h ?? 0).toLocaleString('it-IT')} hint="Daemon"        tone="ok" href="/jobs" />
          <KpiTile label="Pending"      icon={<Hourglass className="w-[14px] h-[14px]" />} value={(macStatus?.queue.pending ?? 0).toLocaleString('it-IT')} hint={pendingStuck > 0 ? `${pendingStuck} bloccati` : 'In coda'} tone={pendingStuck > 0 ? 'err' : 'info'} href="/jobs" />
          <KpiTile label="Asset R2"     icon={<HardDrive className="w-[14px] h-[14px]" />} value={(r2Summary?.totals.allAssets ?? 0).toLocaleString('it-IT')} hint={r2Summary?.totals.sizeHuman ?? '-'} tone="ok" href="/media" />
          <KpiTile label="Revenue tot." icon={<Coins     className="w-[14px] h-[14px]" />} value={`€ ${getKpi('users_revenue_total').toLocaleString('it-IT')}`} hint="LTV totale" tone="ok" />
        </div>
      </section>

      {/* ============ Recent runs + sources ============ */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
        {/* Ultime run */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="typ-micro">Ultime esecuzioni</div>
              <h3 className="typ-h2 mt-1">Daemon</h3>
            </div>
            <Link href="/jobs" className="typ-caption hover:text-[color:var(--text-hi)]">Tutte →</Link>
          </div>
          {runs.length === 0 ? (
            <div className="card-body typ-caption">Nessuna esecuzione recente</div>
          ) : (
            runs.map(run => (
              <div key={run.id} className="row">
                <div className="min-w-0">
                  <div className="typ-label truncate">{run.jobName}</div>
                  <div className="typ-caption truncate">{fmtTime(run.startedAt)} · {run.triggeredBy}</div>
                </div>
                <span className={
                  run.status === 'success'    ? 'pill pill-ok'
                  : run.status === 'failed'   ? 'pill pill-err'
                  : run.status === 'cancelled'? 'pill pill-warn'
                  : 'pill pill-info'
                }>{run.status}</span>
              </div>
            ))
          )}
        </div>

        {/* Sync per source */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="typ-micro">Sorgenti</div>
              <h3 className="typ-h2 mt-1">Ultimi sync</h3>
            </div>
            {macStatus?.daemon.hostname && <span className="typ-micro">{macStatus.daemon.hostname}</span>}
          </div>
          {(macStatus?.sources ?? []).length === 0 ? (
            <div className="card-body typ-caption">Nessun sync recente</div>
          ) : (
            (macStatus?.sources ?? []).map(s => (
              <div key={s.source} className="row">
                <div className="min-w-0">
                  <div className="typ-label truncate">{s.source}</div>
                  <div className="typ-caption truncate">{s.lastSuccessAt ? fmtTime(s.lastSuccessAt) : 'mai'}</div>
                </div>
                <span className={
                  s.lastStatus === 'success'   ? 'pill pill-ok'
                  : s.lastStatus === 'failed'  ? 'pill pill-err'
                  : s.lastStatus === 'running' ? 'pill pill-info'
                  : 'pill pill-warn'
                }>{s.lastStatus ?? '-'}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ============ Quick jumps ============ */}
      <section>
        <div className="typ-micro mb-2" style={{ paddingLeft: 2 }}>Vai a</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: '/pills',           label: 'Pills',       sub: 'Review editoriale',      icon: PillIcon },
            { href: '/palinsesto-home', label: 'Palinsesto',  sub: 'Comporre homepage app',  icon: CalendarClock },
            { href: '/media',           label: 'Media',       sub: 'Cover + players',        icon: ImageIcon },
            { href: '/analytics',       label: 'Analytics',   sub: 'Metriche complete',      icon: Zap },
          ].map(q => {
            const Ic = q.icon;
            return (
              <Link key={q.href} href={q.href} className="card card-hover p-4 flex flex-col gap-1.5">
                <Ic className="w-5 h-5 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
                <div className="typ-label">{q.label}</div>
                <div className="typ-caption truncate">{q.sub}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ==================================================================
   KPI tile (compact, touch-friendly)
   ================================================================== */
function KpiTile({
  label, value, hint, icon, tone, href,
}: {
  label: string; value: string; hint: string;
  icon: React.ReactNode;
  tone: 'ok' | 'warn' | 'err' | 'info';
  href?: string;
}) {
  const pillClass =
    tone === 'ok' ? 'pill pill-ok'
    : tone === 'warn' ? 'pill pill-warn'
    : tone === 'err'  ? 'pill pill-err'
    : 'pill pill-info';

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="typ-micro truncate">{label}</span>
        <span className={pillClass} style={{ padding: '2px 6px', minWidth: 20 }}>{icon}</span>
      </div>
      <div className="typ-metric truncate mt-1">{value}</div>
      <div className="typ-caption truncate">{hint}</div>
    </>
  );
  const cls = 'card card-body flex flex-col gap-0.5';
  if (href) return <Link href={href} className={`${cls} card-hover`}>{body}</Link>;
  return <div className={cls}>{body}</div>;
}
