import { supabaseServer } from '@/lib/supabaseServer';
import { generateOccurrences } from './rrule';
import { addDaysLocal, localRomeToUtcIso, utcIsoToRomeLocal } from './timezone';
import { SCHEDULE_TIMEZONE, ScheduleAccess, ScheduleStatus } from './types';

interface SeriesRow {
  id: string;
  format_id: string;
  label: string | null;
  access: ScheduleAccess;
  cover_override_url: string | null;
  timezone: string;
  dtstart_local: string;
  rrule: string;
  until_local: string | null;
  max_occurrences: number | null;
  status: ScheduleStatus;
  is_active: boolean;
}

interface ExceptionRow {
  series_id: string;
  occurrence_local: string;
  action: 'skip' | 'override';
  override_start_local: string | null;
  override_label: string | null;
  override_access: ScheduleAccess | null;
  override_cover_override_url: string | null;
}

interface MaterializedRow {
  format_id: string;
  label: string | null;
  access: ScheduleAccess;
  start_at: string;
  status: ScheduleStatus;
  is_active: boolean;
  cover_override_url: string | null;
  source_type: 'series';
  series_id: string;
  occurrence_key: string;
}

export interface RetireSeriesOptions {
  seriesId: string;
  hardDelete?: boolean;
  futureOnly?: boolean;
}

export interface MaterializeOptions {
  seriesId?: string;
  windowPastDays?: number;
  windowFutureDays?: number;
}

export interface MaterializeResult {
  processedSeries: number;
  upsertedCards: number;
  removedCards: number;
}

function normalizeLocal(value: string): string {
  const normalized = value.trim().replace(' ', 'T');
  if (normalized.length === 16) return `${normalized}:00`;
  return normalized;
}

function makeOccurrenceKey(seriesId: string, startAtUtcIso: string): string {
  return `${seriesId}::${startAtUtcIso}`;
}

function getWindowBounds(windowPastDays: number, windowFutureDays: number): {
  windowStartLocal: string;
  windowEndLocal: string;
  windowStartUtcIso: string;
} {
  const nowLocal = utcIsoToRomeLocal(new Date().toISOString());
  const startLocal = addDaysLocal(nowLocal, -windowPastDays) ?? nowLocal;
  const endLocal = addDaysLocal(nowLocal, windowFutureDays) ?? nowLocal;
  const windowStartLocal = `${startLocal.slice(0, 10)}T00:00:00`;
  const windowEndLocal = `${endLocal.slice(0, 10)}T23:59:59`;
  const windowStartUtcIso = localRomeToUtcIso(windowStartLocal) ?? new Date().toISOString();
  return { windowStartLocal, windowEndLocal, windowStartUtcIso };
}

async function fetchSeries(seriesId?: string): Promise<SeriesRow[]> {
  if (!supabaseServer) return [];

  let query = supabaseServer
    .from('home_schedule_series')
    .select('id,format_id,label,access,cover_override_url,timezone,dtstart_local,rrule,until_local,max_occurrences,status,is_active')
    .order('created_at', { ascending: true });

  if (seriesId) {
    query = query.eq('id', seriesId);
  } else {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Errore lettura serie: ${error.message}`);
  }

  return (data ?? []) as SeriesRow[];
}

async function fetchExceptions(seriesId: string): Promise<Map<string, ExceptionRow>> {
  if (!supabaseServer) return new Map();

  const { data, error } = await supabaseServer
    .from('home_schedule_series_exceptions')
    .select('series_id,occurrence_local,action,override_start_local,override_label,override_access,override_cover_override_url')
    .eq('series_id', seriesId);

  if (error) {
    throw new Error(`Errore lettura eccezioni serie ${seriesId}: ${error.message}`);
  }

  const map = new Map<string, ExceptionRow>();
  for (const row of (data ?? []) as ExceptionRow[]) {
    map.set(normalizeLocal(row.occurrence_local), row);
  }
  return map;
}

function buildRowsForSeries(
  series: SeriesRow,
  exceptions: Map<string, ExceptionRow>,
  windowStartLocal: string,
  windowEndLocal: string
): MaterializedRow[] {
  if (series.timezone !== SCHEDULE_TIMEZONE) {
    throw new Error(`Timezone non supportata per serie ${series.id}. Attesa ${SCHEDULE_TIMEZONE}.`);
  }

  let occurrences = generateOccurrences({
    dtstartLocal: normalizeLocal(series.dtstart_local),
    rrule: series.rrule,
    windowStartLocal,
    windowEndLocal,
    maxOccurrences: series.max_occurrences,
    untilLocal: series.until_local ? normalizeLocal(series.until_local) : null,
    limit: 1000,
  });

  if (occurrences.length === 0) {
    const fallbackStart = normalizeLocal(series.dtstart_local);
    const fallbackEnd = addDaysLocal(fallbackStart, 365) ?? fallbackStart;

    occurrences = generateOccurrences({
      dtstartLocal: fallbackStart,
      rrule: series.rrule,
      windowStartLocal: fallbackStart,
      windowEndLocal: fallbackEnd,
      maxOccurrences: series.max_occurrences,
      untilLocal: series.until_local ? normalizeLocal(series.until_local) : null,
      limit: 1000,
    });
  }

  const rows: MaterializedRow[] = [];
  for (const occurrenceLocalRaw of occurrences) {
    const occurrenceLocal = normalizeLocal(occurrenceLocalRaw);
    const exception = exceptions.get(occurrenceLocal);
    if (exception?.action === 'skip') {
      continue;
    }

    const startLocal = normalizeLocal(exception?.override_start_local ?? occurrenceLocal);
    const startAtUtcIso = localRomeToUtcIso(startLocal);
    if (!startAtUtcIso) continue;

    rows.push({
      format_id: series.format_id,
      label: exception?.override_label ?? series.label,
      access: exception?.override_access ?? series.access,
      start_at: startAtUtcIso,
      status: series.status,
      is_active: series.is_active,
      cover_override_url: exception?.override_cover_override_url ?? series.cover_override_url,
      source_type: 'series',
      series_id: series.id,
      occurrence_key: makeOccurrenceKey(series.id, startAtUtcIso),
    });
  }

  return rows;
}

async function upsertRows(rows: MaterializedRow[]): Promise<number> {
  if (!supabaseServer || rows.length === 0) return 0;

  const { error } = await supabaseServer
    .from('home_schedule_cards')
    .upsert(rows, {
      onConflict: 'occurrence_key',
      ignoreDuplicates: false,
    });

  if (!error) {
    return rows.length;
  }

  const noConstraintConflict =
    error.code === '42P10'
    || error.message.toLowerCase().includes('no unique or exclusion constraint matching the on conflict specification');

  if (!noConstraintConflict) {
    throw new Error(`Errore upsert card materializzate: ${error.message}`);
  }

  const occurrenceKeys = rows
    .map(row => row.occurrence_key)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  const existingByKey = new Map<string, string>();
  if (occurrenceKeys.length > 0) {
    const { data: existingRows, error: existingError } = await supabaseServer
      .from('home_schedule_cards')
      .select('id,occurrence_key')
      .eq('source_type', 'series')
      .in('occurrence_key', occurrenceKeys);

    if (existingError) {
      throw new Error(`Errore lookup fallback card materializzate: ${existingError.message}`);
    }

    for (const row of existingRows ?? []) {
      const key = row.occurrence_key as string | null;
      const id = row.id as string | null;
      if (key && id && !existingByKey.has(key)) {
        existingByKey.set(key, id);
      }
    }
  }

  for (const row of rows) {
    const existingId = row.occurrence_key ? existingByKey.get(row.occurrence_key) : undefined;
    if (existingId) {
      const { error: updateError } = await supabaseServer
        .from('home_schedule_cards')
        .update({
          format_id: row.format_id,
          label: row.label,
          access: row.access,
          start_at: row.start_at,
          status: row.status,
          is_active: row.is_active,
          cover_override_url: row.cover_override_url,
          source_type: row.source_type,
          series_id: row.series_id,
          occurrence_key: row.occurrence_key,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId);

      if (updateError) {
        throw new Error(`Errore update fallback card materializzate: ${updateError.message}`);
      }
    } else {
      const { error: insertError } = await supabaseServer
        .from('home_schedule_cards')
        .insert(row);

      if (insertError) {
        throw new Error(`Errore insert fallback card materializzate: ${insertError.message}`);
      }
    }
  }

  return rows.length;
}

async function cleanupObsolete(
  seriesId: string,
  keepOccurrenceKeys: string[],
  windowStartUtcIso: string
): Promise<number> {
  if (!supabaseServer) return 0;

  let query = supabaseServer
    .from('home_schedule_cards')
    .delete({ count: 'exact' })
    .eq('source_type', 'series')
    .eq('series_id', seriesId)
    .gte('start_at', windowStartUtcIso);

  if (keepOccurrenceKeys.length > 0) {
    const escaped = keepOccurrenceKeys
      .map(item => `'${item.replace(/'/g, "''")}'`)
      .join(',');
    query = query.not('occurrence_key', 'in', `(${escaped})`);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Errore cleanup occorrenze obsolete serie ${seriesId}: ${error.message}`);
  }

  return count ?? 0;
}

export async function retireSeriesOccurrences(options: RetireSeriesOptions): Promise<number> {
  if (!supabaseServer) return 0;

  const hardDelete = options.hardDelete ?? false;
  const futureOnly = options.futureOnly ?? true;
  const nowIso = new Date().toISOString();

  if (hardDelete) {
    let query = supabaseServer
      .from('home_schedule_cards')
      .delete({ count: 'exact' })
      .eq('source_type', 'series')
      .eq('series_id', options.seriesId);

    if (futureOnly) {
      query = query.gte('start_at', nowIso);
    }

    const { count, error } = await query;
    if (error) {
      throw new Error(`Errore rimozione occorrenze serie ${options.seriesId}: ${error.message}`);
    }
    return count ?? 0;
  }

  let query = supabaseServer
    .from('home_schedule_cards')
    .update({
      is_active: false,
      status: 'draft',
      updated_at: nowIso,
    }, { count: 'exact' })
    .eq('source_type', 'series')
    .eq('series_id', options.seriesId);

  if (futureOnly) {
    query = query.gte('start_at', nowIso);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Errore disattivazione occorrenze serie ${options.seriesId}: ${error.message}`);
  }

  return count ?? 0;
}

export async function materializeSeries(options: MaterializeOptions = {}): Promise<MaterializeResult> {
  const windowPastDays = options.windowPastDays ?? 1;
  const windowFutureDays = options.windowFutureDays ?? 365;
  const { windowStartLocal, windowEndLocal, windowStartUtcIso } = getWindowBounds(windowPastDays, windowFutureDays);

  const seriesList = await fetchSeries(options.seriesId);
  let upsertedCards = 0;
  let removedCards = 0;

  for (const series of seriesList) {
    if (!series.is_active) {
      removedCards += await retireSeriesOccurrences({
        seriesId: series.id,
        hardDelete: false,
        futureOnly: true,
      });
      continue;
    }

    const exceptions = await fetchExceptions(series.id);
    const rows = buildRowsForSeries(series, exceptions, windowStartLocal, windowEndLocal);
    upsertedCards += await upsertRows(rows);
    removedCards += await cleanupObsolete(
      series.id,
      rows.map(row => row.occurrence_key),
      windowStartUtcIso
    );

  }

  return {
    processedSeries: seriesList.length,
    upsertedCards,
    removedCards,
  };
}
