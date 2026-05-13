/**
 * Episode → Facts adapter (DETERMINISTICO, no LLM).
 *
 * Trasforma un episodio Lavika in `ExtractedFacts`-like per il pipeline
 * AI-Director-v2 (storyboard → AIDirectedStoryVideo). I dati episode
 * sono già strutturati nel DB (title, format_id, match teams, speaker),
 * niente serve all'LLM per l'extraction.
 *
 * Strategia per format:
 *  - match-reaction → speaker dichiarazioni: emphasis speaker + match
 *  - press-conference → conferenza giocatore/allenatore: emphasis speaker
 *  - highlights → highlight match: emphasis match teams + score
 *  - unica-sport / catanista → programma TV: emphasis title + format
 *  - default → title episode generico
 *
 * Fase 1 = card promo (no Whisper / FFmpeg). Fase 2+ aggiungerà Whisper
 * cuts + sottotitoli AI per match-reaction/press-conf.
 */

import type { ExtractedFacts } from './pillFactExtractor';

interface EpisodeMatchTeam {
  normalized_name: string | null;
  short_name: string | null;
}
interface EpisodeMatch {
  id?: string;
  kickoff_at?: string | null;
  matchday?: number | null;
  home_team?: EpisodeMatchTeam | EpisodeMatchTeam[] | null;
  away_team?: EpisodeMatchTeam | EpisodeMatchTeam[] | null;
}
interface EpisodeSpeaker {
  id?: string;
  full_name?: string;
}

export interface EpisodeForStoryboard {
  id: string;
  title: string | null;
  format_id: string | null;
  thumbnail_url: string | null;
  duration_secs: number | null;
  match?: EpisodeMatch | EpisodeMatch[] | null;
  speaker?: EpisodeSpeaker | EpisodeSpeaker[] | null;
}

function firstObj<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function teamShort(t: EpisodeMatchTeam | EpisodeMatchTeam[] | null | undefined): string {
  const o = firstObj(t);
  return o?.short_name || o?.normalized_name || '';
}

/** Pretty label per il format_id (sportivo, italiano). */
const FORMAT_LABELS: Record<string, string> = {
  'highlights':       'HIGHLIGHTS',
  'match-reaction':   'A FINE PARTITA',
  'press-conference': 'IN CONFERENZA',
  'unica-sport':      'UNICA SPORT',
  'catanista':        'CATANISTA',
  'catania':          'CATANIA',
  'one-to-one':       'ONE TO ONE',
  'match-preview':    'PRE-PARTITA',
  'days-of-glory':    'DAYS OF GLORY',
};

function formatLabel(formatId: string | null): string {
  if (!formatId) return 'LAVIKA';
  return FORMAT_LABELS[formatId] ?? formatId.toUpperCase().replace(/-/g, ' ');
}

/**
 * Estrae facts dall'episode in formato compatibile col PillStoryboardBuilder.
 * Tono sempre "celebrative" per highlights, "factual" per il resto.
 */
export function episodeToFacts(ep: EpisodeForStoryboard): ExtractedFacts {
  const match = firstObj(ep.match);
  const speaker = firstObj(ep.speaker);
  const home = teamShort(match?.home_team);
  const away = teamShort(match?.away_team);
  const matchLabel = home && away ? `${home} vs ${away}` : '';
  const speakerName = speaker?.full_name?.trim() ?? '';
  const epTitle = (ep.title ?? '').trim();
  const fmtLabel = formatLabel(ep.format_id);

  // Strategia main_phrase: usa il title se esiste; altrimenti combina
  // match info + speaker.
  let main_phrase = epTitle;
  if (!main_phrase) {
    const parts = [matchLabel, speakerName].filter(Boolean);
    main_phrase = parts.join(' · ') || fmtLabel;
  }

  // Tone hint per format
  const tone_hint: ExtractedFacts['tone_hint'] =
    ep.format_id === 'highlights' ? 'celebrative' :
    ep.format_id === 'match-reaction' ? 'factual' :
    'factual';

  return {
    quote: '',
    speaker: speakerName,
    number: null,
    number_unit: '',
    main_phrase,
    // secondary_phrase = format label (es. "HIGHLIGHTS") → usato come
    // sub-info in storyboard. Non vuoto = triggera "news" classification
    // se vogliamo, altrimenti gestito esplicitamente sotto.
    secondary_phrase: fmtLabel,
    people: speakerName ? [speakerName] : [],
    teams: [home, away].filter((t): t is string => !!t),
    time_pattern: '',
    tone_hint,
  };
}

/** Format label per category prop della composition. */
export { formatLabel };
