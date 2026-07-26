'use client';

import { useState } from 'react';
import { CalendarClock, Loader2, ShieldCheck } from 'lucide-react';

type Scenario = 'same-league' | 'category-change' | 'playoff';

type PreflightResponse = {
  ok: boolean;
  writes: number;
  scenario?: Scenario;
  seasonLabel?: string;
  apiSeason?: number;
  leagueId?: number;
  leagueName?: string | null;
  targetAvailable?: boolean;
  availableSeasons?: number[];
  fixtures?: { count: number; teams: number };
  database?: null | {
    competitionSeasons: Array<{ seasonLabel: string; competitionName: string | null }>;
    newTeams: string[];
    missingLogo: string[];
    missingShortName: string[];
    missingColors: string[];
  };
  recommendation?: string;
  message?: string;
};

interface SeasonPreflightPanelProps {
  defaultSeason: string;
  defaultLeagueId: number;
  playoffLeagueId: number | null;
}

export function SeasonPreflightPanel({ defaultSeason, defaultLeagueId, playoffLeagueId }: SeasonPreflightPanelProps) {
  const [scenario, setScenario] = useState<Scenario>('same-league');
  const [season, setSeason] = useState(defaultSeason);
  const [leagueId, setLeagueId] = useState(String(defaultLeagueId));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreflightResponse | null>(null);

  function selectScenario(next: Scenario) {
    setScenario(next);
    if (next === 'playoff' && playoffLeagueId) setLeagueId(String(playoffLeagueId));
    if (next === 'same-league') setLeagueId(String(defaultLeagueId));
  }

  async function runPreflight() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scenario,
        season,
        leagueId,
      });
      const response = await fetch(`/api/dev/ops/season-preflight?${params.toString()}`, { cache: 'no-store' });
      const body = await response.json() as PreflightResponse;
      setResult(body);
    } catch (error) {
      setResult({
        ok: false,
        writes: 0,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
      <div className="flex items-start gap-3">
        <div className="inline-flex w-9 h-9 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--card-muted)] text-[color:var(--accent-raw)] shrink-0">
          <CalendarClock className="w-4 h-4" />
        </div>
        <div className="grow min-w-0">
          <div className="typ-label">Preflight prossima stagione</div>
          <div className="typ-caption mt-1">
            Scegli scenario e controlla API-Football/DB senza scrivere niente.
          </div>
        </div>
        <button type="button" onClick={runPreflight} disabled={loading} className="btn btn-ghost btn-sm shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          <span className="hidden sm:inline">{loading ? 'Controllo' : 'Esegui'}</span>
        </button>
      </div>

      <div className="mt-3 vstack-tight">
        <div className="grid grid-cols-3 gap-2">
          <ScenarioButton active={scenario === 'same-league'} label="Stessa lega" onClick={() => selectScenario('same-league')} />
          <ScenarioButton active={scenario === 'category-change'} label="Cambio cat." onClick={() => selectScenario('category-change')} />
          <ScenarioButton active={scenario === 'playoff'} label="Playoff" onClick={() => selectScenario('playoff')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="vstack-tight">
            <span className="typ-micro">Stagione</span>
            <input className="input" value={season} onChange={(event) => setSeason(event.target.value)} inputMode="numeric" />
          </label>
          <label className="vstack-tight">
            <span className="typ-micro">League ID</span>
            <input className="input" value={leagueId} onChange={(event) => setLeagueId(event.target.value)} inputMode="numeric" />
          </label>
        </div>
      </div>

      {result && (
        <div className="mt-3 vstack-tight">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={result.ok ? 'pill pill-ok' : 'pill pill-err'}>{result.ok ? 'ok' : 'errore'}</span>
            <span className="pill pill-info">writes {result.writes}</span>
            {result.seasonLabel && <span className="pill pill-info">{result.seasonLabel}</span>}
            {result.leagueId && <span className="pill pill-info">league {result.leagueId}</span>}
            {typeof result.targetAvailable === 'boolean' && (
              <span className={result.targetAvailable ? 'pill pill-ok' : 'pill pill-warn'}>
                API season {result.targetAvailable ? 'presente' : 'non presente'}
              </span>
            )}
          </div>
          {result.message && <div className="typ-caption text-[color:var(--danger)]">{result.message}</div>}
          {result.recommendation && <div className="typ-caption text-[color:var(--text-muted-hi)]">{result.recommendation}</div>}
          {result.availableSeasons && (
            <div className="typ-caption">Stagioni API: {result.availableSeasons.join(', ')}</div>
          )}
          {result.fixtures && (
            <div className="grid grid-cols-2 gap-2">
              <MiniMetric label="Fixtures" value={String(result.fixtures.count)} />
              <MiniMetric label="Squadre" value={String(result.fixtures.teams)} />
            </div>
          )}
          {result.database && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <MiniMetric label="Squadre nuove" value={String(result.database.newTeams.length)} />
              <MiniMetric label="Loghi mancanti" value={String(result.database.missingLogo.length)} />
              <MiniMetric label="Sigle mancanti" value={String(result.database.missingShortName.length)} />
              <MiniMetric label="Colori mancanti" value={String(result.database.missingColors.length)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScenarioButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
      style={{ justifyContent: 'center', width: '100%' }}
    >
      {label}
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-sm)] bg-[color:var(--card-muted)] p-2">
      <div className="typ-micro">{label}</div>
      <div className="typ-label mt-1">{value}</div>
    </div>
  );
}
