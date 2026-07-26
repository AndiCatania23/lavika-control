import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { supabaseServer } from '@/lib/supabaseServer';

type HealthState = 'ok' | 'info' | 'warn' | 'error' | 'unknown';

export interface OpsLogSummary {
  key: string;
  label: string;
  file: string;
  exists: boolean;
  updatedAt: string | null;
  ageSeconds: number | null;
  state: HealthState;
  hints: string[];
  lines: string[];
}

export interface OpsSnapshot {
  generatedAt: string;
  mac: {
    daemon: {
      state: 'online' | 'stale' | 'offline' | 'unknown';
      lastSeenAt: string | null;
      ageSeconds: number | null;
      hostname: string | null;
      pid: number | null;
    };
    queue: {
      pending: number;
      pendingStuck: number;
      running: number;
      success24h: number;
      failed24h: number;
    };
  };
  season: {
    campionato: SyncConfigView | null;
    playoff: SyncConfigView | null;
    seasons: SeasonView[];
    nextSeasonLabel: string | null;
    nextSeasonReady: boolean;
  };
  logs: OpsLogSummary[];
  checks: Array<{
    key: string;
    label: string;
    state: HealthState;
    detail: string;
  }>;
  scenarios: OpsScenario[];
  runbooks: OpsRunbook[];
}

interface SyncConfigView {
  key: string;
  enabled: boolean | null;
  paused: boolean | null;
  seasonLabel: string | null;
  apiSeason: number | null;
  leagueId: number | null;
  forceSync: boolean | null;
  updatedAt: string | null;
}

interface SeasonView {
  seasonLabel: string;
  competitionName: string;
  matches: number | null;
  standings: number | null;
}

export interface OpsRunbook {
  key: string;
  area: string;
  process: string;
  owner: 'mac' | 'control' | 'vercel' | 'supabase' | 'external';
  state: HealthState;
  currentControl: 'read-only' | 'manual-from-panel' | 'not-wired';
  primarySignal: string;
  recoveryToday: string;
  nextPanelAction: string;
  relatedLogKeys: string[];
}

export interface OpsScenario {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
  implication: string;
}

const LOG_DIR = join(homedir(), 'LAVIKA-SPORT', 'logs');
const STUCK_MS = 15 * 60 * 1000;
const STALE_MS = 3 * 60 * 1000;
const OFFLINE_MS = 10 * 60 * 1000;

const LOGS: Array<{ key: string; label: string; file: string; warnAfterMinutes: number; errorAfterMinutes: number; patterns?: Array<{ state: HealthState; text: string; hint: string }> }> = [
  {
    key: 'sync',
    label: 'Live score / campionato',
    file: 'sync.log',
    warnAfterMinutes: 5,
    errorAfterMinutes: 12,
    patterns: [{ state: 'error', text: 'ERROR:', hint: 'Il sync ha scritto errori recenti nel log.' }],
  },
  {
    key: 'schedule-sync',
    label: 'Schedule video',
    file: 'schedule-sync.log',
    warnAfterMinutes: 25,
    errorAfterMinutes: 45,
    patterns: [{ state: 'error', text: 'ERROR', hint: 'Schedule sync ha errori recenti.' }],
  },
  {
    key: 'pills',
    label: 'Pills generator',
    file: 'pills.log',
    warnAfterMinutes: 30 * 60,
    errorAfterMinutes: 48 * 60,
    patterns: [{ state: 'warn', text: 'HTTP 404', hint: 'Una o piu fonti RSS stanno rispondendo 404.' }],
  },
  {
    key: 'push-worker',
    label: 'Push worker',
    file: 'push-worker.log',
    warnAfterMinutes: 36 * 60,
    errorAfterMinutes: 72 * 60,
    patterns: [{ state: 'warn', text: '"failed":', hint: 'Sono presenti invii push falliti o parziali.' }],
  },
  {
    key: 'season-check',
    label: 'Monitor nuova stagione',
    file: 'check-new-season.log',
    warnAfterMinutes: 30 * 60,
    errorAfterMinutes: 48 * 60,
    patterns: [
      { state: 'ok', text: 'TROVATA', hint: 'Nuova stagione rilevata: serve preflight/rollover.' },
      { state: 'info', text: 'NON ancora disponibile', hint: 'API-Football non ha ancora pubblicato la stagione target.' },
    ],
  },
  {
    key: 'job-daemon',
    label: 'Job daemon',
    file: 'job-daemon.log',
    warnAfterMinutes: 24 * 60,
    errorAfterMinutes: 72 * 60,
    patterns: [{ state: 'error', text: 'ERROR', hint: 'Il daemon job ha errori recenti.' }],
  },
];

const RUNBOOKS: OpsRunbook[] = [
  {
    key: 'season-rollover',
    area: 'Campionato',
    process: 'Rollover calendario/stagione successiva',
    owner: 'mac',
    state: 'info',
    currentControl: 'read-only',
    primarySignal: 'check-new-season.log + sync_config + competition_seasons + scenario sportivo',
    recoveryToday: 'Eseguire preflight/commit da Mac scegliendo stagione e league id corretti.',
    nextPanelAction: 'Preflight prossima stagione, selezione scenario, poi commit rollover con audit log.',
    relatedLogKeys: ['season-check', 'sync'],
  },
  {
    key: 'campionato-sync',
    area: 'Campionato',
    process: 'Sync fixtures, standings, live score',
    owner: 'mac',
    state: 'ok',
    currentControl: 'read-only',
    primarySignal: 'sync.log + sync_config.campionato_sync',
    recoveryToday: 'Controllare log e impostare force_sync da DB/script se necessario.',
    nextPanelAction: 'Force sync campionato, pause/resume, API quota view.',
    relatedLogKeys: ['sync'],
  },
  {
    key: 'playoff-sync',
    area: 'Campionato',
    process: 'Sync playoff e bracket condizionale',
    owner: 'mac',
    state: 'info',
    currentControl: 'read-only',
    primarySignal: 'sync.log + sync_config.playoff_sync',
    recoveryToday: 'Usare solo se Catania entra nei playoff o serve mostrare playoff di categoria.',
    nextPanelAction: 'Abilita/spegni playoff per stagione, force sync, rebuild ties.',
    relatedLogKeys: ['sync'],
  },
  {
    key: 'video-schedule',
    area: 'Video',
    process: 'Palinsesto e download queue',
    owner: 'mac',
    state: 'ok',
    currentControl: 'manual-from-panel',
    primarySignal: 'job_queue + schedule-sync.log + job-daemon heartbeat',
    recoveryToday: 'Usare Job & Runs per accodare sync video; log file per diagnosi profonda.',
    nextPanelAction: 'Retry failed source, clear stale lock, open source diagnostics.',
    relatedLogKeys: ['schedule-sync', 'job-daemon'],
  },
  {
    key: 'pills-generate',
    area: 'Editoriale',
    process: 'Generazione pills giornaliera',
    owner: 'mac',
    state: 'warn',
    currentControl: 'read-only',
    primarySignal: 'pills.log + draft pills',
    recoveryToday: 'Eseguire script pills-generator da Mac se il cron salta.',
    nextPanelAction: 'Generate dry-run, generate now, inspect RSS/Gemini errors.',
    relatedLogKeys: ['pills'],
  },
  {
    key: 'pills-publish',
    area: 'Editoriale',
    process: 'Pubblicazione pills e push',
    owner: 'mac',
    state: 'warn',
    currentControl: 'read-only',
    primarySignal: 'push-worker.log + notification queue',
    recoveryToday: 'Controllare push-worker e job pubblicazione dal Mac/log.',
    nextPanelAction: 'Retry publish, resend failed push, pause auto-publish.',
    relatedLogKeys: ['push-worker'],
  },
  {
    key: 'shop-orders',
    area: 'Shop',
    process: 'Ordini, Printful, notifiche admin',
    owner: 'mac',
    state: 'info',
    currentControl: 'read-only',
    primarySignal: 'shop-notifier.log + pf.log + shop APIs',
    recoveryToday: 'Controllare log shop/Printful e pannello shop.',
    nextPanelAction: 'Test Printful, retry sync, resend admin notification.',
    relatedLogKeys: [],
  },
  {
    key: 'assets-r2',
    area: 'Media',
    process: 'R2, loghi squadre, colori, assets',
    owner: 'external',
    state: 'info',
    currentControl: 'manual-from-panel',
    primarySignal: 'R2 summary + media APIs + team metadata',
    recoveryToday: 'Usare media pages e script loghi/colori da Mac.',
    nextPanelAction: 'Refresh missing logos, extract colors, R2 health check.',
    relatedLogKeys: [],
  },
  {
    key: 'api-football',
    area: 'External',
    process: 'API-Football quota/rate limit',
    owner: 'external',
    state: 'info',
    currentControl: 'read-only',
    primarySignal: 'sync_config.vps_global circuit breaker + sync errors',
    recoveryToday: 'Aspettare cooldown o ridurre chiamate da config/script.',
    nextPanelAction: 'Quota/circuit status, cooldown controls, safe API test.',
    relatedLogKeys: ['sync', 'season-check'],
  },
];

function nextSeasonLabelFrom(label: string | null | undefined): string | null {
  if (!label) return null;
  const match = label.match(/^(\d{4})\/(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return `${start + 1}/${end + 1}`;
}

function stateFromAge(ageMs: number | null): 'online' | 'stale' | 'offline' | 'unknown' {
  if (ageMs === null) return 'unknown';
  if (ageMs <= STALE_MS) return 'online';
  if (ageMs <= OFFLINE_MS) return 'stale';
  return 'offline';
}

function normalizeConfig(row: { key: string; value: Record<string, unknown> | null; updated_at: string | null }): SyncConfigView {
  const value = row.value ?? {};
  const numberOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const boolOrNull = (v: unknown) => (typeof v === 'boolean' ? v : null);
  const stringOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    key: row.key,
    enabled: boolOrNull(value.enabled),
    paused: boolOrNull(value.paused),
    seasonLabel: stringOrNull(value.season_label),
    apiSeason: numberOrNull(value.api_season),
    leagueId: numberOrNull(value.league_id),
    forceSync: boolOrNull(value.force_sync),
    updatedAt: row.updated_at,
  };
}

async function readLogSummary(item: (typeof LOGS)[number], now: number): Promise<OpsLogSummary> {
  const absolute = join(LOG_DIR, item.file);
  try {
    const info = await stat(absolute);
    const size = Math.min(info.size, 16_000);
    const raw = await readFile(absolute, 'utf8');
    const tail = raw.slice(Math.max(0, raw.length - size));
    const lines = tail.split(/\r?\n/).filter(Boolean).slice(-18);
    const ageSeconds = Math.max(0, Math.round((now - info.mtimeMs) / 1000));
    const hints: string[] = [];
    let state: HealthState = 'ok';

    const ageMinutes = ageSeconds / 60;
    if (ageMinutes > item.errorAfterMinutes) state = 'error';
    else if (ageMinutes > item.warnAfterMinutes) state = 'warn';

    const recentText = lines.join('\n');
    for (const pattern of item.patterns ?? []) {
      if (recentText.includes(pattern.text)) {
        hints.push(pattern.hint);
        if (pattern.state === 'error') state = 'error';
        else if (pattern.state === 'warn' && state !== 'error') state = 'warn';
      }
    }

    return {
      key: item.key,
      label: item.label,
      file: absolute,
      exists: true,
      updatedAt: info.mtime.toISOString(),
      ageSeconds,
      state,
      hints,
      lines,
    };
  } catch {
    return {
      key: item.key,
      label: item.label,
      file: absolute,
      exists: false,
      updatedAt: null,
      ageSeconds: null,
      state: 'unknown',
      hints: ['Log non trovato sul filesystem del control server.'],
      lines: [],
    };
  }
}

async function getMacStatus(now: number): Promise<OpsSnapshot['mac']> {
  if (!supabaseServer) {
    return {
      daemon: { state: 'unknown', lastSeenAt: null, ageSeconds: null, hostname: null, pid: null },
      queue: { pending: 0, pendingStuck: 0, running: 0, success24h: 0, failed24h: 0 },
    };
  }

  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(now - STUCK_MS).toISOString();
  const [heartbeatRes, pendingRes, pendingStuckRes, runningRes, success24hRes, failed24hRes] = await Promise.all([
    supabaseServer.from('daemon_heartbeat').select('*').eq('name', 'job-daemon').maybeSingle(),
    supabaseServer.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseServer.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending').lt('created_at', stuckCutoff),
    supabaseServer.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supabaseServer.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'success').gte('created_at', since24h),
    supabaseServer.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since24h),
  ]);

  const hb = heartbeatRes.data as { last_seen_at?: string; hostname?: string | null; pid?: number | null } | null;
  const lastSeenAt = hb?.last_seen_at ?? null;
  const ageMs = lastSeenAt ? now - new Date(lastSeenAt).getTime() : null;

  return {
    daemon: {
      state: stateFromAge(ageMs),
      lastSeenAt,
      ageSeconds: ageMs !== null ? Math.max(0, Math.round(ageMs / 1000)) : null,
      hostname: hb?.hostname ?? null,
      pid: hb?.pid ?? null,
    },
    queue: {
      pending: pendingRes.count ?? 0,
      pendingStuck: pendingStuckRes.count ?? 0,
      running: runningRes.count ?? 0,
      success24h: success24hRes.count ?? 0,
      failed24h: failed24hRes.count ?? 0,
    },
  };
}

async function getSeasonStatus(): Promise<OpsSnapshot['season']> {
  if (!supabaseServer) {
    return { campionato: null, playoff: null, seasons: [], nextSeasonLabel: null, nextSeasonReady: false };
  }
  const db = supabaseServer;

  const [configRes, seasonsRes] = await Promise.all([
    db.from('sync_config').select('key,value,updated_at').in('key', ['campionato_sync', 'playoff_sync']),
    db
      .from('competition_seasons')
      .select('id, season_label, competitions(name)')
      .in('season_label', ['2025/2026', '2026/2027'])
      .order('season_label', { ascending: true }),
  ]);

  const configs = new Map(
    ((configRes.data ?? []) as Array<{ key: string; value: Record<string, unknown> | null; updated_at: string | null }>)
      .map((row) => [row.key, normalizeConfig(row)]),
  );
  const campionato = configs.get('campionato_sync') ?? null;
  const playoff = configs.get('playoff_sync') ?? null;
  const nextSeasonLabel = nextSeasonLabelFrom(campionato?.seasonLabel ?? playoff?.seasonLabel);

  const seasonRows = (seasonsRes.data ?? []) as unknown as Array<{
    id: string;
    season_label: string;
    competitions: { name: string } | Array<{ name: string }> | null;
  }>;

  const seasons = await Promise.all(seasonRows.map(async (row): Promise<SeasonView> => {
    const competition = Array.isArray(row.competitions) ? row.competitions[0] : row.competitions;
    const [matchesRes, standingsRes] = await Promise.all([
      db.from('matches').select('*', { count: 'exact', head: true }).eq('season_id', row.id),
      db.from('standings').select('*', { count: 'exact', head: true }).eq('season_id', row.id),
    ]);
    return {
      seasonLabel: row.season_label,
      competitionName: competition?.name ?? 'Competizione',
      matches: matchesRes.count ?? null,
      standings: standingsRes.count ?? null,
    };
  }));

  return {
    campionato,
    playoff,
    seasons,
    nextSeasonLabel,
    nextSeasonReady: Boolean(nextSeasonLabel && seasons.some((s) => s.seasonLabel === nextSeasonLabel && (s.matches ?? 0) > 0)),
  };
}

function buildScenarios(season: OpsSnapshot['season']): OpsScenario[] {
  const active = season.campionato?.seasonLabel ?? '-';
  const next = season.nextSeasonLabel ?? 'prossima stagione';
  return [
    {
      key: 'direct-promotion',
      label: 'Promozione diretta / cambio categoria',
      state: 'info',
      detail: `Se Catania cambia categoria, il rollover non deve usare automaticamente la lega attuale.`,
      implication: 'Serve selezionare nuova competition/league id prima del preflight calendario.',
    },
    {
      key: 'same-league',
      label: 'Stessa categoria, nuova regular season',
      state: season.nextSeasonReady ? 'ok' : 'info',
      detail: `Da ${active} verso ${next}.`,
      implication: 'Preflight fixtures regular season, import squadre, poi flip sync_config campionato.',
    },
    {
      key: 'playoff-conditional',
      label: 'Playoff solo se necessari',
      state: 'info',
      detail: 'I playoff non sono una certezza operativa: dipendono dal risultato sportivo.',
      implication: 'La card/playoff sync vanno abilitati o lasciati spenti in base allo scenario reale.',
    },
  ];
}

export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const now = Date.now();
  const [mac, season, logs] = await Promise.all([
    getMacStatus(now),
    getSeasonStatus(),
    Promise.all(LOGS.map((item) => readLogSummary(item, now))),
  ]);

  const failedLogs = logs.filter((log) => log.state === 'error').length;
  const warningLogs = logs.filter((log) => log.state === 'warn').length;
  const seasonCheck = logs.find((log) => log.key === 'season-check');

  const logStateByKey = new Map(logs.map((log) => [log.key, log.state]));
  const runbooks = RUNBOOKS.map((runbook) => {
    const relatedStates = runbook.relatedLogKeys.map((key) => logStateByKey.get(key)).filter(Boolean);
    const derivedState = relatedStates.includes('error') ? 'error' : relatedStates.includes('warn') ? 'warn' : runbook.state;
    return { ...runbook, state: derivedState };
  });

  return {
    generatedAt: new Date(now).toISOString(),
    mac,
    season,
    logs,
    scenarios: buildScenarios(season),
    runbooks,
    checks: [
      {
        key: 'mac-daemon',
        label: 'Mac job daemon',
        state: mac.daemon.state === 'online' ? 'ok' : mac.daemon.state === 'stale' ? 'warn' : 'error',
        detail: mac.daemon.lastSeenAt ? `Heartbeat ${mac.daemon.ageSeconds ?? '-'}s fa` : 'Nessun heartbeat disponibile',
      },
      {
        key: 'queue',
        label: 'Job queue',
        state: mac.queue.pendingStuck > 0 || mac.queue.failed24h > 0 ? 'warn' : 'ok',
        detail: `${mac.queue.pending} pending, ${mac.queue.running} running, ${mac.queue.failed24h} failed 24h`,
      },
      {
        key: 'active-season',
        label: 'Stagione attiva',
        state: season.campionato?.seasonLabel ? 'ok' : 'warn',
        detail: `Campionato ${season.campionato?.seasonLabel ?? '-'} · API ${season.campionato?.apiSeason ?? '-'}`,
      },
      {
        key: 'season-target',
        label: 'Rollover prossima stagione',
        state: season.nextSeasonReady ? 'ok' : 'info',
        detail: season.nextSeasonReady ? `Dati ${season.nextSeasonLabel} gia presenti` : seasonCheck?.hints[0] ?? 'Non ancora onboardata',
      },
      {
        key: 'logs',
        label: 'Log operativi',
        state: failedLogs > 0 ? 'error' : warningLogs > 0 ? 'warn' : 'ok',
        detail: `${failedLogs} error, ${warningLogs} warning sui log monitorati`,
      },
    ],
  };
}
