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
  /**
   * Payoff editoriale: la frase DOPO il `:` quando il titolo è una pill
   * narrativa con conclusione/morale. Renderizzato in gold UPPERCASE
   * sotto la headline (es. "L'ESPERIENZA CONTA").
   * Vuoto per pill senza split editoriale (es. "Caturano: 12 gol" non
   * è un editorial split, è speaker prefix → payoff resta vuoto).
   */
  payoff: string;
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

/** Trunca al primo `.` `?` `!` per ottenere la "headline editoriale". */
function takeHeadline(raw: string, max = 50): string {
  const trimmed = raw.trim();
  // Prendi tutto fino al primo separatore forte se entro `max` caratteri
  const match = trimmed.match(/^(.{8,50}?)[.?!]/);
  if (match) return match[1].trim();
  // Altrimenti taglia all'ultimo spazio prima di max
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.lastIndexOf(' ', max);
  return cut > 8 ? trimmed.slice(0, cut).trim() : trimmed.slice(0, max).trim();
}

/**
 * Split editoriale del titolo su `:` distinguendo due pattern:
 *
 *   - Speaker prefix ("Caturano: ..." / "Mister Toscano: ...")
 *     → la parte prima del `:` è 1-2 parole capitalizzate (un nome).
 *     → Il `:` è solo attribution, NON un break editoriale.
 *     → mainTitle = intero titolo, payoff = ''
 *
 *   - Editorial split ("Frase lunga: morale finale")
 *     → la parte prima del `:` è una frase (>2 parole o non capitalizzata).
 *     → Il `:` separa hook (fact) da payoff (commento/morale).
 *     → mainTitle = prima parte, payoff = seconda parte
 *
 * Esempi:
 *   "Caturano: 12 gol"                   → main="Caturano: 12 gol",   payoff=""
 *   "Mister Toscano: pareggio prezioso"  → main="Mister Toscano: ...", payoff=""
 *   "Di Tacchio, 10 anni fa il trionfo playoff: l'esperienza conta"
 *     → main="Di Tacchio, 10 anni fa il trionfo playoff",
 *       payoff="l'esperienza conta"
 */
function splitEditorial(title: string): { mainTitle: string; payoff: string } {
  const colonIdx = title.indexOf(':');
  if (colonIdx <= 0) return { mainTitle: title, payoff: '' };

  const before = title.slice(0, colonIdx).trim();
  const after = title.slice(colonIdx + 1).trim();

  // Niente payoff: dopo i `:` non c'è abbastanza testo per essere un break.
  if (after.length < 5) return { mainTitle: title, payoff: '' };

  // Speaker prefix detection: 1-2 parole, ciascuna inizia con maiuscola,
  // niente trattini (per filtrare "Catania-Crotone"). Coerente con pattern
  // di quoteDetection.ts (asset image).
  const beforeWords = before.split(/\s+/);
  const isSpeakerPrefix =
    beforeWords.length <= 2 &&
    !before.includes('-') &&
    beforeWords.every(w => /^[A-ZÀ-Ý]/.test(w) && w.length >= 2);

  if (isSpeakerPrefix) {
    return { mainTitle: title, payoff: '' };
  }

  return { mainTitle: before, payoff: after };
}

export function extractStatFromPill(pill: PillLike): PillStatPayload {
  const titleRaw = (pill.title ?? '').trim();
  const content = (pill.content ?? '').trim();

  // ──── STEP 1: split editoriale ────
  // Distingue "Nome: ..." (speaker prefix → no payoff) da
  // "Frase lunga: morale" (editorial split → main + payoff)
  const { mainTitle, payoff: rawPayoff } = splitEditorial(titleRaw);
  const payoff = rawPayoff ? cleanText(rawPayoff, { uppercase: true }) : '';

  // ──── MODE 1: anniversary ("N anni fa") ────
  // Priorità massima: pattern semantico troppo specifico per il counter-up
  // generico (mostrare solo "10" senza contesto temporale è incomprensibile).
  const annMatch = mainTitle.match(ANNIVERSARY_REGEX) ?? content.match(ANNIVERSARY_REGEX);
  if (annMatch) {
    const number = parseInt(annMatch[1], 10);
    const sourceStr = mainTitle.match(ANNIVERSARY_REGEX) ? mainTitle : content;
    const withoutPattern = sourceStr.replace(ANNIVERSARY_REGEX, ' ').replace(/\s+,\s+/g, ', ');
    const headline = cleanText(takeHeadline(withoutPattern));
    return {
      mode: 'anniversary',
      number,
      numberSuffix: '',
      context: '',
      heroText: headline || mainTitle,
      eyebrow: 'ANNI FA',
      payoff,
    };
  }

  // ──── Cerca un numero generico per stat/year ────
  const numMatch = mainTitle.match(NUMBER_REGEX) ?? content.match(NUMBER_REGEX);

  if (!numMatch) {
    // ──── MODE 4: hero (nessun numero estraibile) ────
    return {
      mode: 'hero',
      number: null,
      numberSuffix: '',
      context: cleanText(mainTitle, { uppercase: true }),
      heroText: mainTitle,
      eyebrow: '',
      payoff,
    };
  }

  const numberStr = numMatch[1];
  const suffix = numMatch[2] ?? '';
  const number = parseInt(numberStr, 10);
  const sourceStr = mainTitle.match(NUMBER_REGEX) ? mainTitle : content;
  const withoutNumber = sourceStr.replace(NUMBER_REGEX, ' ').trim();

  if (isHistoricalYear(number)) {
    // ──── MODE 2: year (anno storico tipo 2007) ────
    const headline = cleanText(takeHeadline(withoutNumber));
    return {
      mode: 'year',
      number,
      numberSuffix: '',
      context: '',
      heroText: headline || mainTitle,
      eyebrow: '',
      payoff,
    };
  }

  // ──── MODE 3: stat (default, counter-up) ────
  const context = cleanText(withoutNumber, { uppercase: true });
  return {
    mode: 'stat',
    number,
    numberSuffix: suffix,
    context: context || cleanText(mainTitle, { uppercase: true }),
    heroText: mainTitle,
    eyebrow: '',
    payoff,
  };
}
