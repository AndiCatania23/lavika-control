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

export type PillStatMode = 'stat' | 'anniversary' | 'year' | 'hero' | 'quote';

export interface PillStatPayload {
  /** Layout mode scelto dal pattern del titolo. */
  mode: PillStatMode;
  /** Numero principale animato. NULL = useremo `heroText` invece. */
  number: number | null;
  /** Suffisso inline opzionale (% / °) — per stat tipo "85%". */
  numberSuffix: string;
  /** Contesto sotto il numero (stat mode), UPPERCASE. */
  context: string;
  /**
   * Hero text usato in anniversary/year/hero/quote — la frase descrittiva.
   * Per mode='quote' contiene la CITAZIONE senza virgolette esterne
   * (la composition aggiunge le virgolette decorative).
   */
  heroText: string;
  /**
   * Eyebrow piccolo gold sotto al numero/quote.
   * Mode anniversary: "ANNI FA". Mode quote: il nome dello speaker
   * (es. "— RICCHIUTI"). Vuoto per altri mode.
   */
  eyebrow: string;
  /**
   * Payoff editoriale: la frase DOPO il `:` quando il titolo è una pill
   * narrativa con conclusione/morale. Renderizzato in gold UPPERCASE
   * sotto la headline (es. "L'ESPERIENZA CONTA").
   * Vuoto per pill senza split editoriale.
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

/**
 * Unità sportive comuni che seguono un numero. Catturate come `eyebrow`
 * sotto il numero per separare "12 gol" → number=12 + eyebrow=GOL +
 * context=resto, invece di context="GOL DALLA PANCHINA" che mischia
 * unità e qualifica.
 *
 * Pattern guarda il numero + spazio + unit ovunque nel title (non solo
 * all'inizio post-rimozione), così funziona anche con speaker prefix
 * tipo "Caturano: 12 gol in stagione".
 */
const NUMBER_WITH_UNIT_REGEX = /(\d{1,4})(?:°|%)?\s+(gol|reti|anni|vittorie|sconfitte|pareggi|partite|presenze|minuti|punti|posti?|posizion[ei]|spettatori|tifosi|titoli|coppe|trofei|trionfi|cartellini|assist|tiri|cross|falli|corner|rigori|stagion[ei])\b/i;

/**
 * Detection citazione speaker. Accetta:
 *   - Nomi singoli o composti (1-3 parole, prima capitalizzata)
 *   - Pattern "Speaker verbo:" (es. "Gasparin avverte:", "Toscano dichiara:")
 *   - Virgolette curly ("..." ""... '...'), straight ("..." '...'), e
 *     guillemet italiane formali («...»)
 *
 * Catturati: 1=speaker, 2=quote text (senza virgolette esterne).
 *
 * Match:
 *   'Ricchiuti: "Doppio risultato?"'                    → ["Ricchiuti", "Doppio risultato?"]
 *   "Mister Toscano: \"Vinciamo\""                       → ["Mister Toscano", "Vinciamo"]
 *   'Gasparin avverte: «Catania favorito, tallone...»'   → ["Gasparin avverte", "Catania favorito, tallone..."]
 *   'Toscano dichiara: "Forza ragazzi"'                  → ["Toscano dichiara", "Forza ragazzi"]
 *
 * No match:
 *   "Caturano: 12 gol in stagione"           (no virgolette → stat)
 *   "Catania-Crotone: la sfida"              (trattino, no virgolette → editorial split)
 */
// Char class virgolette: straight " ' + curly U+201C/D/B/9 + guillemet U+00AB/BB
const QUOTE_OPEN = '"“”„‘’«';
const QUOTE_CLOSE = '"“”„‘’»';
const QUOTE_REGEX = new RegExp(
  `^([A-ZÀ-Ý][a-zA-ZÀ-ÿ'.]+(?:\\s+[a-zA-ZÀ-ÿ'.]+){0,3}):\\s*[${QUOTE_OPEN}]\\s*([^${QUOTE_CLOSE}]+?)\\s*[.!?]?\\s*[${QUOTE_CLOSE}]\\s*$`
);
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

  // ──── PRIORITÀ MASSIMA: detection quote "Nome: 'frase'" ────
  // Pill citazioni sono frequenti (post-conference giocatore, dichiarazioni
  // ex-Catania, ecc.). Layout dedicato con virgolette decorative + speaker.
  const quoteMatch = titleRaw.match(QUOTE_REGEX);
  if (quoteMatch) {
    let speaker = quoteMatch[1].trim();
    const quote = quoteMatch[2].trim();
    // Cleanup speaker: se pattern "Nome verbo" (es. "Gasparin avverte",
    // "Toscano dichiara"), rimuovi il verbo finale (parola lowercase) per
    // ottenere attribution pulita "— GASPARIN" invece di "— GASPARIN AVVERTE".
    // Conserva invece "Mister Toscano", "De Luca" (entrambe capitalizzate).
    const speakerWords = speaker.split(/\s+/);
    if (speakerWords.length >= 2) {
      const last = speakerWords[speakerWords.length - 1];
      // Se inizia lowercase → è un verbo (avverte/dichiara/commenta/etc), drop
      if (/^[a-zà-ÿ]/.test(last)) {
        speaker = speakerWords.slice(0, -1).join(' ');
      }
    }
    return {
      mode: 'quote',
      number: null,
      numberSuffix: '',
      context: '',
      heroText: quote,
      eyebrow: speaker.toUpperCase(),
      payoff: '',
    };
  }

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
  // Strategia "2 livelli sotto numero" per non sovraccaricare:
  //   - context BIANCO = unit + qualifica unite (es. "GOL DALLA PANCHINA")
  //   - payoff GOLD   = morale dopo i `:` se presente
  //   - NIENTE eyebrow visuale (sarebbe un terzo livello sovrapposto).
  // Strip speaker prefix da context per evitare "Caturano · GOL IN STAGIONE"
  // → diventa "GOL IN STAGIONE" più pulito.
  let contextRaw = sourceStr.replace(NUMBER_REGEX, ' ');
  // Strip speaker prefix "Nome: " all'inizio se presente
  contextRaw = contextRaw.replace(/^[A-ZÀ-Ý][a-zà-ÿA-ZÀ-Ý'.\s]{1,30}:\s*/, '').trim();

  const context = cleanText(contextRaw, { uppercase: true });
  return {
    mode: 'stat',
    number,
    numberSuffix: suffix,
    context: context || cleanText(mainTitle, { uppercase: true }),
    heroText: mainTitle,
    eyebrow: '',  // niente eyebrow visuale per stat (vedi commento sopra)
    payoff,
  };
}
