import { addDaysLocal, formatLocalDateTime, parseLocalDateTime } from './timezone';

export type RRuleFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ByDay = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface ParsedRRule {
  freq: RRuleFreq;
  interval: number;
  byday: ByDay[];
  count: number | null;
  untilLocal: string | null;
}

const BYDAY_SET = new Set<ByDay>(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
const WEEKDAY_BYDAY: ByDay[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function parseRRuleUntil(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const localDirect = parseLocalDateTime(value);
  if (localDirect) return formatLocalDateTime(localDirect);

  const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!compactMatch) return null;

  const parts = {
    year: Number(compactMatch[1]),
    month: Number(compactMatch[2]),
    day: Number(compactMatch[3]),
    hour: Number(compactMatch[4]),
    minute: Number(compactMatch[5]),
    second: Number(compactMatch[6]),
  };

  return formatLocalDateTime(parts);
}

export function parseRRule(input: string): ParsedRRule {
  const chunks = input.split(';').map(part => part.trim()).filter(Boolean);
  const map = new Map<string, string>();

  for (const chunk of chunks) {
    const [key, ...rest] = chunk.split('=');
    if (!key || rest.length === 0) continue;
    map.set(key.toUpperCase(), rest.join('='));
  }

  const freqRaw = (map.get('FREQ') ?? '').toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freqRaw)) {
    throw new Error('RRULE non valida: FREQ supportata DAILY/WEEKLY/MONTHLY.');
  }

  const intervalRaw = Number(map.get('INTERVAL') ?? '1');
  const interval = Number.isInteger(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1;

  const bydayRaw = (map.get('BYDAY') ?? '').trim();
  const byday = bydayRaw.length > 0
    ? bydayRaw.split(',').map(part => part.trim().toUpperCase()).filter(part => BYDAY_SET.has(part as ByDay)) as ByDay[]
    : [];

  const countRaw = map.get('COUNT');
  const countParsed = countRaw ? Number(countRaw) : null;
  const count = countParsed && Number.isInteger(countParsed) && countParsed > 0 ? countParsed : null;

  const untilRaw = map.get('UNTIL');
  const untilLocal = untilRaw ? parseRRuleUntil(untilRaw) : null;
  if (untilRaw && !untilLocal) {
    throw new Error('RRULE non valida: UNTIL non parseabile.');
  }

  return {
    freq: freqRaw as RRuleFreq,
    interval,
    byday,
    count,
    untilLocal,
  };
}

export function buildRRule(params: {
  freq: RRuleFreq;
  interval: number;
  byday: ByDay[];
  count: number | null;
  untilLocal: string | null;
}): string {
  const chunks: string[] = [`FREQ=${params.freq}`];
  if (params.interval > 1) chunks.push(`INTERVAL=${params.interval}`);
  if (params.byday.length > 0) chunks.push(`BYDAY=${params.byday.join(',')}`);
  if (params.count && params.count > 0) chunks.push(`COUNT=${params.count}`);
  if (params.untilLocal) chunks.push(`UNTIL=${params.untilLocal.replace(/[-:]/g, '').replace('T', 'T')}`);
  return chunks.join(';');
}

function toUtcDate(localValue: string): Date {
  const parts = parseLocalDateTime(localValue);
  if (!parts) {
    throw new Error('Data locale non valida.');
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
}

function isSameOrAfter(a: string, b: string): boolean {
  return toUtcDate(a).getTime() >= toUtcDate(b).getTime();
}

function isSameOrBefore(a: string, b: string): boolean {
  return toUtcDate(a).getTime() <= toUtcDate(b).getTime();
}

function diffDays(a: string, b: string): number {
  const ms = toUtcDate(a).getTime() - toUtcDate(b).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function diffWeeks(a: string, b: string): number {
  return Math.floor(diffDays(a, b) / 7);
}

function diffMonths(a: string, b: string): number {
  const aa = parseLocalDateTime(a);
  const bb = parseLocalDateTime(b);
  if (!aa || !bb) return 0;
  return (aa.year - bb.year) * 12 + (aa.month - bb.month);
}

function getByday(localValue: string): ByDay {
  const parts = parseLocalDateTime(localValue);
  if (!parts) return 'MO';
  const jsDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return WEEKDAY_BYDAY[jsDate.getUTCDay()] ?? 'MO';
}

function withTime(dayValue: string, timeSource: string): string {
  const dayParts = parseLocalDateTime(dayValue);
  const timeParts = parseLocalDateTime(timeSource);
  if (!dayParts || !timeParts) return dayValue;
  return formatLocalDateTime({
    year: dayParts.year,
    month: dayParts.month,
    day: dayParts.day,
    hour: timeParts.hour,
    minute: timeParts.minute,
    second: timeParts.second,
  });
}

function isRuleMatch(candidate: string, dtstartLocal: string, parsed: ParsedRRule): boolean {
  if (!isSameOrAfter(candidate, dtstartLocal)) return false;

  if (parsed.freq === 'DAILY') {
    const days = diffDays(candidate, dtstartLocal);
    return days % parsed.interval === 0;
  }

  if (parsed.freq === 'WEEKLY') {
    const weeks = diffWeeks(candidate, dtstartLocal);
    if (weeks < 0 || weeks % parsed.interval !== 0) return false;

    const byday = parsed.byday.length > 0 ? parsed.byday : [getByday(dtstartLocal)];
    return byday.includes(getByday(candidate));
  }

  const months = diffMonths(candidate, dtstartLocal);
  if (months < 0 || months % parsed.interval !== 0) return false;

  const candidateParts = parseLocalDateTime(candidate);
  const startParts = parseLocalDateTime(dtstartLocal);
  if (!candidateParts || !startParts) return false;
  return candidateParts.day === startParts.day;
}

export interface GenerateOccurrencesInput {
  dtstartLocal: string;
  rrule: string;
  windowStartLocal: string;
  windowEndLocal: string;
  maxOccurrences: number | null;
  untilLocal: string | null;
  limit: number;
}

export function generateOccurrences(input: GenerateOccurrencesInput): string[] {
  const parsed = parseRRule(input.rrule);
  const dtstartParts = parseLocalDateTime(input.dtstartLocal);
  const windowStartParts = parseLocalDateTime(input.windowStartLocal);
  const windowEndParts = parseLocalDateTime(input.windowEndLocal);

  if (!dtstartParts || !windowStartParts || !windowEndParts) {
    throw new Error('Date di input non valide per generazione occorrenze.');
  }

  let activeUntil = parsed.untilLocal;
  if (input.untilLocal) {
    const normalizedUntil = formatLocalDateTime(parseLocalDateTime(input.untilLocal) ?? windowEndParts);
    if (!activeUntil || isSameOrBefore(normalizedUntil, activeUntil)) {
      activeUntil = normalizedUntil;
    }
  }

  let cursorDay = formatLocalDateTime({ ...dtstartParts, hour: 0, minute: 0, second: 0 });
  const endDay = formatLocalDateTime({ ...windowEndParts, hour: 0, minute: 0, second: 0 });
  const hardStopMs = toUtcDate(endDay).getTime();

  let seenOccurrences = 0;
  const result: string[] = [];
  const hardMax = Math.max(input.limit, 1);

  while (toUtcDate(cursorDay).getTime() <= hardStopMs) {
    const candidate = withTime(cursorDay, input.dtstartLocal);

    if (activeUntil && !isSameOrBefore(candidate, activeUntil)) {
      break;
    }

    if (isRuleMatch(candidate, input.dtstartLocal, parsed)) {
      seenOccurrences += 1;
      const countLimit = parsed.count ?? input.maxOccurrences;
      if (countLimit && seenOccurrences > countLimit) {
        break;
      }

      if (
        isSameOrAfter(candidate, input.windowStartLocal)
        && isSameOrBefore(candidate, input.windowEndLocal)
      ) {
        result.push(candidate);
        if (result.length >= hardMax) break;
      }
    }

    const nextDay = addDaysLocal(cursorDay, 1);
    if (!nextDay) break;
    cursorDay = nextDay;
  }

  return result;
}
