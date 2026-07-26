import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileText,
  HardDrive,
  Server,
  ShieldCheck,
  Workflow,
  XCircle,
} from 'lucide-react';
import { getOpsSnapshot, type OpsLogSummary } from '@/lib/devControl/opsSnapshot';
import { OpsActionsPanel } from './OpsActionsPanel';
import { SeasonPreflightPanel } from './SeasonPreflightPanel';

type Tone = 'ok' | 'info' | 'warn' | 'error' | 'unknown';

function toneClass(tone: Tone): string {
  if (tone === 'ok') return 'pill pill-ok';
  if (tone === 'info') return 'pill pill-info';
  if (tone === 'warn') return 'pill pill-warn';
  if (tone === 'error') return 'pill pill-err';
  return 'pill pill-info';
}

function toneIcon(tone: Tone) {
  if (tone === 'ok') return <CheckCircle2 className="w-4 h-4" />;
  if (tone === 'error') return <XCircle className="w-4 h-4" />;
  if (tone === 'warn') return <AlertTriangle className="w-4 h-4" />;
  return <Clock className="w-4 h-4" />;
}

function fmtAge(seconds: number | null): string {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LogCard({ log }: { log: OpsLogSummary }) {
  return (
    <details className="card group">
      <summary className="card-head cursor-pointer list-none">
        <div className="min-w-0">
          <div className="typ-micro truncate">{log.file}</div>
          <h3 className="typ-h2 mt-1 truncate">{log.label}</h3>
        </div>
        <span className={toneClass(log.state)}>
          {toneIcon(log.state)}
          {log.state}
        </span>
      </summary>
      <div className="card-body vstack-tight">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="pill pill-info">
            <Clock className="w-3 h-3" />
            {fmtAge(log.ageSeconds)}
          </span>
          <span className="typ-caption">{fmtDate(log.updatedAt)}</span>
        </div>
        {log.hints.length > 0 && (
          <div className="vstack-tight">
            {log.hints.map((hint) => (
              <div key={hint} className="typ-caption">{hint}</div>
            ))}
          </div>
        )}
        <div className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] bg-[color:var(--card-muted)] p-3 overflow-hidden">
          {log.lines.length === 0 ? (
            <div className="typ-caption">Nessuna riga recente disponibile</div>
          ) : (
            <pre className="typ-mono text-[11px] leading-5 whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto text-[color:var(--text-muted-hi)]">
              {log.lines.slice(-8).join('\n')}
            </pre>
          )}
        </div>
      </div>
    </details>
  );
}

export default async function OpsPage() {
  const snapshot = await getOpsSnapshot();
  const activeWarnings = snapshot.checks.filter((check) => check.state === 'warn' || check.state === 'error').length;

  return (
    <div className="vstack" style={{ gap: 'var(--s6)' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="typ-micro">Read-only cockpit</div>
          <h1 className="typ-display mt-1">Operations</h1>
          <p className="typ-caption mt-1">
            Snapshot generato {fmtDate(snapshot.generatedAt)}. Nessuna azione in questa vista modifica dati o processi.
          </p>
        </div>
        <Link href="/jobs" className="btn btn-ghost btn-sm">
          <Workflow className="w-4 h-4" />
          Job & Runs
        </Link>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="typ-micro">Stato generale</div>
            <h2 className="typ-h2 mt-1">{activeWarnings === 0 ? 'Tutto sotto controllo' : `${activeWarnings} aree da guardare`}</h2>
          </div>
          <ShieldCheck className="w-6 h-6 text-[color:var(--ok)]" strokeWidth={1.75} />
        </div>
        <div className="card-body grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
          {snapshot.checks.map((check) => (
            <div key={check.key} className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="typ-label">{check.label}</div>
                <span className={toneClass(check.state)}>{toneIcon(check.state)}{check.state}</span>
              </div>
              <div className="typ-caption mt-2">{check.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <QuickStatus
          label="Mac"
          value={snapshot.mac.daemon.state}
          state={snapshot.mac.daemon.state === 'online' ? 'ok' : snapshot.mac.daemon.state === 'stale' ? 'warn' : 'error'}
          detail={fmtAge(snapshot.mac.daemon.ageSeconds)}
        />
        <QuickStatus
          label="Queue"
          value={`${snapshot.mac.queue.pending}`}
          state={snapshot.mac.queue.pendingStuck > 0 || snapshot.mac.queue.failed24h > 0 ? 'warn' : 'ok'}
          detail="pending"
        />
        <QuickStatus
          label="Stagione"
          value={snapshot.season.campionato?.seasonLabel ?? '-'}
          state="ok"
          detail={`API ${snapshot.season.campionato?.apiSeason ?? '-'}`}
        />
        <QuickStatus
          label="Next"
          value={snapshot.season.nextSeasonReady ? 'ready' : 'wait'}
          state={snapshot.season.nextSeasonReady ? 'ok' : 'warn'}
          detail={snapshot.season.nextSeasonLabel ?? 'rollover'}
        />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h2 className="typ-h2 grow">Scenari sportivi</h2>
          <span className="typ-micro">{snapshot.scenarios.length} scenari</span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {snapshot.scenarios.map((scenario) => (
            <details key={scenario.key} className="card">
              <summary className="card-head cursor-pointer list-none items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="typ-micro">Scenario</div>
                  <h3 className="typ-h2 mt-1 leading-snug break-words">{scenario.label}</h3>
                </div>
                <span className={`${toneClass(scenario.state)} shrink-0`}>{toneIcon(scenario.state)}{scenario.state}</span>
              </summary>
              <div className="card-body vstack-tight">
                <InfoBlock label="Quando vale" value={scenario.detail} />
                <InfoBlock label="Implicazione operativa" value={scenario.implication} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1.25fr] gap-4">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="typ-micro">Mac Mini</div>
              <h2 className="typ-h2 mt-1">Worker remoto</h2>
            </div>
            <Cpu className="w-5 h-5 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          </div>
          <div className="card-body vstack-tight">
            <MetricRow icon={<Server className="w-4 h-4" />} label="Daemon" value={snapshot.mac.daemon.state} detail={`Heartbeat ${fmtAge(snapshot.mac.daemon.ageSeconds)}`} />
            <MetricRow icon={<Activity className="w-4 h-4" />} label="Queue" value={`${snapshot.mac.queue.pending} pending`} detail={`${snapshot.mac.queue.running} running · ${snapshot.mac.queue.failed24h} failed 24h`} />
            <MetricRow icon={<Database className="w-4 h-4" />} label="Host" value={snapshot.mac.daemon.hostname ?? '-'} detail={snapshot.mac.daemon.pid ? `pid ${snapshot.mac.daemon.pid}` : 'pid non disponibile'} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="typ-micro">Campionato</div>
              <h2 className="typ-h2 mt-1">Stagione e rollover</h2>
            </div>
            <CalendarClock className="w-5 h-5 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          </div>
          <div className="card-body vstack-tight">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SeasonConfigCard title="Campionato" config={snapshot.season.campionato} />
              <SeasonConfigCard title="Playoff" config={snapshot.season.playoff} />
            </div>
            <div className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] overflow-hidden">
              {snapshot.season.seasons.length === 0 ? (
                <div className="p-3 typ-caption">Nessuna season attiva o successiva trovata.</div>
              ) : (
                snapshot.season.seasons.map((season) => (
                  <div key={`${season.seasonLabel}-${season.competitionName}`} className="row">
                    <div className="min-w-0">
                      <div className="typ-label truncate">{season.competitionName}</div>
                      <div className="typ-caption">{season.seasonLabel}</div>
                    </div>
                    <div className="text-right">
                      <div className="typ-label">{season.matches ?? '-'} match</div>
                      <div className="typ-caption">{season.standings ?? '-'} standings</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Workflow className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h2 className="typ-h2 grow">Processi critici</h2>
          <span className="typ-micro">{snapshot.runbooks.length} runbook</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {snapshot.runbooks.map((runbook) => (
            <details key={runbook.key} className="card group">
              <summary className="card-head cursor-pointer list-none items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="typ-micro break-words">{runbook.area} · {runbook.owner}</div>
                  <h3 className="typ-h2 mt-1 leading-snug break-words">{runbook.process}</h3>
                </div>
                <span className={`${toneClass(runbook.state)} shrink-0`}>{toneIcon(runbook.state)}{runbook.state}</span>
              </summary>
              <div className="card-body vstack-tight">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="pill pill-info">{runbook.currentControl}</span>
                  {runbook.relatedLogKeys.map((key) => (
                    <span key={key} className="pill pill-info">{key}</span>
                  ))}
                </div>
                <InfoBlock label="Segnale primario" value={runbook.primarySignal} />
                <InfoBlock label="Recovery oggi" value={runbook.recoveryToday} />
                <InfoBlock label="Prossimo controllo remoto" value={runbook.nextPanelAction} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <OpsActionsPanel />

      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h2 className="typ-h2 grow">Log operativi</h2>
          <span className="typ-micro">{snapshot.logs.length} sorgenti</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {snapshot.logs.map((log) => <LogCard key={log.key} log={log} />)}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="typ-micro">Prossimo strato</div>
            <h2 className="typ-h2 mt-1">Diagnostica sicura</h2>
          </div>
          <HardDrive className="w-5 h-5 text-[color:var(--text-muted)]" strokeWidth={1.75} />
        </div>
        <div className="card-body vstack-tight">
          <p className="typ-body text-[color:var(--text-muted)]">
            Questi controlli sono read-only: consumano solo letture/API e non modificano DB, cron o processi.
          </p>
          <SeasonPreflightPanel
            defaultSeason={snapshot.season.nextSeasonLabel ?? ''}
            defaultLeagueId={snapshot.season.campionato?.leagueId ?? 943}
            playoffLeagueId={snapshot.season.playoff?.leagueId ?? null}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/api/dev/ops" target="_blank" className="btn btn-ghost btn-sm">
              <FileText className="w-4 h-4" />
              Snapshot JSON
            </Link>
            <Link href="/api/dev/ops/season-preflight" target="_blank" className="btn btn-ghost btn-sm">
              <CalendarClock className="w-4 h-4" />
              Preflight prossima stagione
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricRow({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
      <div className="inline-flex w-9 h-9 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--card-muted)] text-[color:var(--text-muted-hi)]">
        {icon}
      </div>
      <div className="min-w-0 grow">
        <div className="typ-micro">{label}</div>
        <div className="typ-label truncate">{value}</div>
      </div>
      <div className="typ-caption text-right shrink-0">{detail}</div>
    </div>
  );
}

function QuickStatus({ label, value, detail, state }: { label: string; value: string; detail: string; state: Tone }) {
  return (
    <div className="card card-body" style={{ minHeight: 96 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="typ-micro truncate">{label}</div>
        <span className={state === 'ok' ? 'dot dot-ok' : state === 'warn' ? 'dot dot-warn' : state === 'error' ? 'dot dot-err' : 'dot'} />
      </div>
      <div className="typ-label mt-3 truncate" style={{ fontSize: 18 }}>{value}</div>
      <div className="typ-caption mt-1 truncate">{detail}</div>
    </div>
  );
}

function SeasonConfigCard({ title, config }: { title: string; config: { enabled: boolean | null; paused: boolean | null; seasonLabel: string | null; apiSeason: number | null; leagueId: number | null; forceSync: boolean | null; updatedAt: string | null } | null }) {
  return (
    <div className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="typ-label">{title}</div>
        <span className={config?.enabled && !config.paused ? 'pill pill-ok' : 'pill pill-warn'}>
          {config?.enabled && !config.paused ? 'active' : 'paused'}
        </span>
      </div>
      <div className="typ-metric mt-3" style={{ fontSize: 28 }}>{config?.seasonLabel ?? '-'}</div>
      <div className="typ-caption mt-2">
        API {config?.apiSeason ?? '-'} · league {config?.leagueId ?? '-'} · force {config?.forceSync ? 'on' : 'off'}
      </div>
      <div className="typ-caption mt-1">Aggiornato {fmtDate(config?.updatedAt ?? null)}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="typ-micro">{label}</div>
      <div className="typ-caption mt-1 text-[color:var(--text-muted-hi)]">{value}</div>
    </div>
  );
}
