/**
 * Estrae il payload visivo da un pill per renderizzare la composition
 * PillStatVideo (Story video). Decide un `mode` di layout in base al
 * pattern semantico del titolo:
 *
 *   - `anniversary`  pill "N anni fa ..." → mostra N + eyebrow "ANNI FA" + headline
 *   - `year`         numero ≥ 1900 (anno storico) → pop-in instant + headline
 *   - `stat`         numero generico < 1000 → counter-up animation + context
 *   - `hero`         nessun numero → solo testo grande, no counter
 *
 * Esempi:
 *
 *   "Di Tacchio, 10 anni fa il trionfo playoff: l'esperienza conta"
 *     → mode: 'anniversary', number: 10, eyebrow: "ANNI FA",
 *       headline: "Di Tacchio · Il trionfo playoff"
 *
 *   "Caturano: 12 gol in stagione"
 *     → mode: 'stat', number: 12, context: "CATURANO · GOL IN STAGIONE"
 *
 *   "Promosso in B nel 2007"
 *     → mode: 'year', number: 2007, headline: "PROMOSSO IN B"
 *
 *   "Caturano tabù playoff"  (no numero)
 *     → mode: 'hero', heroText: "Caturano tabù playoff"
 */

export type PillStatMode = 'stat' | 'anniversary' | 'year' | 'hero';

export interface PillStatPayload {
  /** Layout mode scelto dal pattern del titolo. */
  mode: PillStatMode;
  /** Numero principale animato. NULL = useremo `heroText` invece. */
  number: number | null;
  /** Suffisso inline opzionale (% / °) — per stat tipo "85%". */
  numberSuffix: string;
  /** Contesto sotto il numero (stat mode), UPPERCASE. */
  context: string;
  /** Hero text usato in anniversary/year/hero — la frase descrittiva. */
  heroText: string;
  /** Eyebrow piccolo gold sotto al numero (anniversary mode: "ANNI FA"). */
  eyebrow: string;
}

interface PillLike {
  title: string;
  content?: string | null;
  pill_category?: string | null;
}

const NUMBER_REGEX = /(\d{1,4})(°|%)?/;
/** Pattern "N anni fa" / "N anni dopo" / "da N anni" — case-insensitive. */
const ANNIVERSARY_REGEX = /(\d{1,3})\s+anni\s+(?:fa|dopo)\b/i;
/** Numeri ≥ 1900 e ≤ 2100 sono trattati come anni storici. */
function isHistoricalYear(n: number): boolean {
  return n >= 1900 && n <= 2100;
}

/** Pulisce un context/headline: rimuove ":", spazi doppi, virgole orfane, trim. */
function cleanText(raw: string, opts: { uppercase?: boolean } = {}): string {
  const cleaned = raw
    // Sostituisce `:` con ` · ` (separatore editoriale)
    .replace(/\s*:\s*/g, ' · ')
    // Rimuove virgole orfane (spazio,spazio o ,fine)
    .replace(/\s*,\s*/g, ', ')
    // Trim spazi multipli
    .replace(/\s+/g, ' ')
    // Rimuove punteggiatura iniziale/finale di troppo (· - , .)
    .replace(/^[\s·\-,.]+|[\s·\-,.]+$/g, '')
    .trim();
  return opts.uppercase ? cleaned.toUpperCase() : cleaned;
}

/** Trunca al primo `:` o `.` o `?` per ottenere la "headline editoriale". */
function takeHeadline(raw: string, max = 50): string {
  const trimmed = raw.trim();
  // Prendi tutto fino al primo separatore forte se entro `max` caratteri
  const match = trimmed.match(/^(.{8,50}?)[:.?!]/);
  if (match) return match[1].trim();
  // Altrimenti taglia all'ultimo spazio prima di max
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.lastIndexOf(' ', max);
  return cut > 8 ? trimmed.slice(0, cut).trim() : trimmed.slice(0, max).trim();
}

export function extractStatFromPill(pill: PillLike): PillStatPayload {
  const title = (pill.title ?? '').trim();
  const content = (pill.content ?? '').trim();

  // ──── MODE 1: anniversary ("N anni fa") ────
  // Priorità massima: questo pattern semantico è troppo specifico per
  // essere gestito dal counter-up generico (mostrare solo "10" senza
  // contesto temporale è incomprensibile).
  const annMatch = title.match(ANNIVERSARY_REGEX) ?? content.match(ANNIVERSARY_REGEX);
  if (annMatch) {
    const number = parseInt(annMatch[1], 10);
    const sourceStr = title.match(ANNIVERSARY_REGEX) ? title : content;
    // Rimuovi tutto il pattern "N anni fa/dopo" + virgole orfane circostanti
    const withoutPattern = sourceStr.replace(ANNIVERSARY_REGEX, ' ').replace(/\s+,\s+/g, ', ');
    // Headline = parte editoriale principale (prima del `:` se presente)
    const headline = cleanText(takeHeadline(withoutPattern));
    return {
      mode: 'anniversary',
      number,
      numberSuffix: '',
      context: '',
      heroText: headline || title,
      eyebrow: 'ANNI FA',
    };
  }

  // ──── Cerca un numero generico per stat/year ────
  const numMatch = title.match(NUMBER_REGEX) ?? content.match(NUMBER_REGEX);

  if (!numMatch) {
    // ──── MODE 4: hero (nessun numero estraibile) ────
    return {
      mode: 'hero',
      number: null,
      numberSuffix: '',
      context: cleanText(title, { uppercase: true }),
      heroText: title,
      eyebrow: '',
    };
  }

  const numberStr = numMatch[1];
  const suffix = numMatch[2] ?? '';
  const number = parseInt(numberStr, 10);
  const sourceStr = title.match(NUMBER_REGEX) ? title : content;
  const withoutNumber = sourceStr.replace(NUMBER_REGEX, ' ').trim();

  if (isHistoricalYear(number)) {
    // ──── MODE 2: year (anno storico tipo 2007) ────
    // Mostriamo l'anno + heroText editoriale invece di context grezzo.
    const headline = cleanText(takeHeadline(withoutNumber));
    return {
      mode: 'year',
      number,
      numberSuffix: '',
      context: '',
      heroText: headline || title,
      eyebrow: '',
    };
  }

  // ──── MODE 3: stat (default, counter-up) ────
  const context = cleanText(withoutNumber, { uppercase: true });
  return {
    mode: 'stat',
    number,
    numberSuffix: suffix,
    context: context || cleanText(title, { uppercase: true }),
    heroText: title,
    eyebrow: '',
  };
}
