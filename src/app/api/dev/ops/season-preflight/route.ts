import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { supabaseServer } from '@/lib/supabaseServer';

type ApiFootballLeagueSeason = {
  year?: number;
  start?: string;
  end?: string;
};

type ApiFootballLeagueResponse = {
  league?: { id?: number; name?: string };
  seasons?: ApiFootballLeagueSeason[];
};

type ApiFootballFixture = {
  fixture?: { id?: number; date?: string };
  league?: { round?: string };
  teams?: {
    home?: { id?: number; name?: string };
    away?: { id?: number; name?: string };
  };
};

type Scenario = 'same-league' | 'category-change' | 'playoff';

function parseScenario(raw: string | null): Scenario {
  if (raw === 'category-change' || raw === 'playoff' || raw === 'same-league') return raw;
  return 'same-league';
}

async function getDefaultNextSeasonLabel(): Promise<string> {
  if (!supabaseServer) return '2026/2027';
  const { data } = await supabaseServer
    .from('sync_config')
    .select('value')
    .eq('key', 'campionato_sync')
    .maybeSingle();
  const current = data?.value && typeof data.value === 'object' && 'season_label' in data.value
    ? String((data.value as { season_label?: unknown }).season_label ?? '')
    : '';
  const match = current.match(/^(\d{4})\/(\d{4})$/);
  if (!match) return '2026/2027';
  return `${Number(match[1]) + 1}/${Number(match[2]) + 1}`;
}

async function parseSeasonLabel(raw: string | null): Promise<{ label: string; apiSeason: number }> {
  const label = raw?.trim() || await getDefaultNextSeasonLabel();
  if (!/^\d{4}\/\d{4}$/.test(label)) {
    throw new Error('season must use YYYY/YYYY format');
  }
  return { label, apiSeason: Number(label.slice(0, 4)) };
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

async function readConfigEnvValue(key: string): Promise<string | null> {
  try {
    const file = await readFile(join(homedir(), 'LAVIKA-SPORT', 'config', 'pills.env'), 'utf8');
    for (const rawLine of file.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || match[1] !== key) continue;
      return match[2].replace(/^['"]|['"]$/g, '').trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function apiFootball<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY?.trim() || await readConfigEnvValue('API_FOOTBALL_KEY');
  if (!key) throw new Error('Missing API_FOOTBALL_KEY');
  const base = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base}${path}?${qs}`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  const json = await res.json() as { response?: T[]; errors?: Record<string, unknown> };
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football errors: ${JSON.stringify(json.errors)}`);
  }
  return json.response ?? [];
}

export async function GET(request: NextRequest) {
  try {
    const { label, apiSeason } = await parseSeasonLabel(request.nextUrl.searchParams.get('season'));
    const scenario = parseScenario(request.nextUrl.searchParams.get('scenario'));
    const leagueId = Number(request.nextUrl.searchParams.get('leagueId') ?? process.env.SEASON_LEAGUE_ID ?? 943);

    const leagues = await apiFootball<ApiFootballLeagueResponse>('/leagues', { id: String(leagueId) });
    const league = leagues[0];
    const seasons = league?.seasons ?? [];
    const target = seasons.find((season) => season.year === apiSeason) ?? null;

    const base = {
      ok: true,
      mode: 'read-only',
      writes: 0,
      seasonLabel: label,
      apiSeason,
      scenario,
      leagueId,
      leagueName: league?.league?.name ?? null,
      availableSeasons: seasons.map((season) => season.year).filter((year): year is number => typeof year === 'number'),
      targetAvailable: Boolean(target),
      targetWindow: target ? { start: target.start ?? null, end: target.end ?? null } : null,
    };

    if (!target) {
      return NextResponse.json({
        ...base,
        fixtures: { count: 0, teams: 0 },
        database: { competitionSeasons: [], newTeams: [], missingLogo: [], missingShortName: [], missingColors: [] },
        recommendation: scenario === 'category-change'
          ? 'Categoria nuova: verifica prima il league id corretto. API-Football non ha ancora pubblicato dati per questo target.'
          : 'API-Football non ha ancora pubblicato la stagione target. Nessun rollover da eseguire.',
      });
    }

    const fixtures = await apiFootball<ApiFootballFixture>('/fixtures', {
      league: String(leagueId),
      season: String(apiSeason),
      timezone: 'Europe/Rome',
    });

    const apiTeams = new Map<string, { name: string; externalId: string | null }>();
    for (const fixture of fixtures) {
      for (const side of ['home', 'away'] as const) {
        const team = fixture.teams?.[side];
        if (team?.name) {
          apiTeams.set(norm(team.name), {
            name: team.name,
            externalId: team.id != null ? String(team.id) : null,
          });
        }
      }
    }

    if (!supabaseServer) {
      return NextResponse.json({
        ...base,
        fixtures: { count: fixtures.length, teams: apiTeams.size },
        database: null,
        recommendation: 'Supabase non configurato nel control: impossibile confrontare il DB.',
      });
    }

    const [competitionSeasonsRes, teamsRes, extIdsRes] = await Promise.all([
      supabaseServer
        .from('competition_seasons')
        .select('id, season_label, competitions(name)')
        .eq('season_label', label),
      supabaseServer
        .from('teams')
        .select('id, name, normalized_name, short_name, logo_url, primary_color, secondary_color'),
      supabaseServer
        .from('team_external_ids')
        .select('external_id, team_id')
        .eq('provider', 'api-football'),
    ]);

    const teams = (teamsRes.data ?? []) as Array<{
      id: string;
      normalized_name: string | null;
      short_name: string | null;
      logo_url: string | null;
      primary_color: string | null;
      secondary_color: string | null;
    }>;
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const teamByNorm = new Map(teams.map((team) => [norm(team.normalized_name), team]));
    const extToTeam = new Map(
      ((extIdsRes.data ?? []) as Array<{ external_id: string; team_id: string }>)
        .map((row) => [String(row.external_id), teamById.get(row.team_id)])
        .filter((entry): entry is [string, (typeof teams)[number]] => Boolean(entry[1])),
    );

    const newTeams: string[] = [];
    const missingLogo: string[] = [];
    const missingShortName: string[] = [];
    const missingColors: string[] = [];

    for (const [normalizedName, apiTeam] of apiTeams) {
      const row = (apiTeam.externalId ? extToTeam.get(apiTeam.externalId) : null) ?? teamByNorm.get(normalizedName);
      if (!row) newTeams.push(apiTeam.name);
      if (!row?.logo_url) missingLogo.push(apiTeam.name);
      if (!row?.short_name) missingShortName.push(apiTeam.name);
      if (!(row?.primary_color && row.secondary_color)) missingColors.push(apiTeam.name);
    }

    return NextResponse.json({
      ...base,
      fixtures: { count: fixtures.length, teams: apiTeams.size },
      database: {
        competitionSeasons: ((competitionSeasonsRes.data ?? []) as unknown as Array<{
          season_label: string;
          competitions: { name: string } | Array<{ name: string }> | null;
        }>).map((row) => {
          const competition = Array.isArray(row.competitions) ? row.competitions[0] : row.competitions;
          return {
            seasonLabel: row.season_label,
            competitionName: competition?.name ?? null,
          };
        }),
        newTeams,
        missingLogo,
        missingShortName,
        missingColors,
      },
      recommendation: fixtures.length > 0
        ? scenario === 'playoff'
          ? 'Preflight playoff positivo: abilita/importa playoff solo se lo scenario sportivo lo richiede.'
          : 'Preflight positivo: puoi procedere al rollover guidato quando il commit remoto sara abilitato.'
        : 'Stagione presente ma fixtures non ancora pubblicate: attendere calendario.',
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, mode: 'read-only', writes: 0, message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
