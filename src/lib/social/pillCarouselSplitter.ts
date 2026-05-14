/* ──────────────────────────────────────────────────────────────────
   pillCarouselSplitter — split pill content in slide carousel chunks

   Strategia heuristic (no LLM, ~10ms):
   1. Title della pill → SEMPRE slide 1 (hero)
   2. Content split per separatori naturali: `.` / `;` / `\n`
   3. Combina chunks adiacenti fino a target ~110 char per slide
      (sweet spot Anton 56pt Story IG, 4-5 righe leggibili)
   4. Numero slide: 2-5 (cap superiore per non spammare).
      Se content troppo corto, 1 sola slide aggiuntiva.
   5. Keyword highlight: identifica parole "evidenziabili" per ogni slide
      (uppercase 4+ char, nomi capitalized, numeri+unità, verbi forti
      della whitelist quoteEngine).
   ────────────────────────────────────────────────────────────────── */

export interface CarouselSlideContent {
  /** Numero slide (1-indexed) */
  index: number;
  /** Totale slide del carosello (per badge "N/total") */
  total: number;
  /** Testo principale della slide (~100-150 char, uppercase pronto) */
  text: string;
  /** Parole-chiave da evidenziare in rosso (lowercase per matching) */
  keywords: string[];
  /** Slide 1 = hero (title della pill), altre = body (content split) */
  kind: 'hero' | 'body';
}

const TARGET_CHARS_PER_SLIDE = 120;
const MIN_CHARS_PER_SLIDE = 40;
const MAX_SLIDES = 5;
const MIN_SLIDES = 2;

/** Verbi/parole "forti" sportivi che meritano highlight in rosso. */
const HIGHLIGHT_KEYWORDS_LOWER: ReadonlyArray<string> = [
  // Verbi azione forti
  'lottare', 'lottato', 'lottiamo', 'combattere', 'combattuto',
  'credere', 'crediamo', 'creduto',
  'vincere', 'vinto', 'vinciamo',
  'sognare', 'sognato', 'sogno',
  'soffrire', 'sofferto',
  'sacrificare', 'sacrificato',
  'meritare', 'meritato', 'merita',
  'difendere', 'difeso',
  'dedicare', 'dedicato',
  'attaccare', 'attaccato',
  'arrivare', 'arrivato',
  // Sport
  'serie', 'campionato', 'playoff', 'champions', 'coppa', 'gol',
  'derby', 'finale', 'semifinale', 'promozione', 'salvezza',
  // Squadra
  'catania', 'rossoazzurri', 'rossazzurri', 'etnei',
];

const HIGHLIGHT_SET = new Set(HIGHLIGHT_KEYWORDS_LOWER);

/**
 * Pulisce il testo: rimuove emoji, hashtag, normalizza whitespace.
 * Mantiene punteggiatura per lo split successivo.
 */
function cleanText(raw: string): string {
  return raw
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/#\w+/g, '')                  // hashtag
    .replace(/https?:\/\/\S+/g, '')        // url
    .replace(/\s+/g, ' ')                  // whitespace multipli
    .trim();
}

/**
 * Suddivide il content in chunks "concettualmente coerenti".
 * Split su `.` `;` `\n` come separatori primari.
 */
function chunkContent(content: string): string[] {
  const cleaned = cleanText(content);
  if (cleaned.length === 0) return [];
  // Split su separatori forti, tenendo punteggiatura
  const rawChunks = cleaned.split(/(?<=[.;])\s+|(?<=\n)/);
  const chunks: string[] = [];
  let buffer = '';
  for (const raw of rawChunks) {
    const piece = raw.trim();
    if (!piece) continue;
    if (buffer.length === 0) {
      buffer = piece;
    } else if (buffer.length + piece.length + 1 <= TARGET_CHARS_PER_SLIDE) {
      buffer = `${buffer} ${piece}`.trim();
    } else {
      chunks.push(buffer);
      buffer = piece;
    }
  }
  if (buffer.length > 0) chunks.push(buffer);

  // Merge chunks troppo brevi col precedente (evita slide con 1 frase di 20 char)
  const merged: string[] = [];
  for (const c of chunks) {
    if (merged.length > 0 && c.length < MIN_CHARS_PER_SLIDE) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${c}`;
    } else {
      merged.push(c);
    }
  }
  return merged;
}

/**
 * Identifica keyword per highlight in un testo:
 * - parole completamente in MAIUSCOLO (4+ char)
 * - parole capitalized (nomi propri, 4+ char)
 * - numeri grossi (3+ cifre) o numeri+unità ("14 volte", "3000 tifosi")
 * - verbi/parole forti dalla whitelist
 */
function extractKeywords(text: string): string[] {
  const keywords = new Set<string>();
  // 1. UPPERCASE words 4+ char (incluso accenti italiani: À Á È É Ì Ò Ù...)
  //    Unicode \p{Lu} cattura tutte le lettere maiuscole, accentate o no.
  const upperMatches = text.match(/\b\p{Lu}{4,}\b/gu) ?? [];
  for (const w of upperMatches) keywords.add(w.toLowerCase());

  // 2. Capitalized nomi propri (4+ char): inizia con \p{Lu} + \p{Ll}+
  //    Pattern "Word" dopo space/inizio o punteggiatura
  const capMatches = text.match(/(?:^|[\s,;.!?:'"«])(\p{Lu}\p{Ll}{3,})\b/gu) ?? [];
  for (const m of capMatches) {
    const w = m.replace(/^[\s,;.!?:'"«]+/, '').trim();
    if (w.length >= 4) keywords.add(w.toLowerCase());
  }

  // 3. Numeri grossi o numeri+unità ("3000 tifosi", "14 volte")
  const numWordMatches = text.match(/\b\d{2,}\s+\p{L}+\b/gu) ?? [];
  for (const m of numWordMatches) keywords.add(m.toLowerCase());
  const bigNumbers = text.match(/\b\d{3,}\b/g) ?? [];
  for (const n of bigNumbers) keywords.add(n);

  // 4. Whitelist verbi/parole forti
  const lowerText = text.toLowerCase();
  for (const kw of HIGHLIGHT_KEYWORDS_LOWER) {
    if (new RegExp(`\\b${kw}\\b`, 'iu').test(lowerText)) keywords.add(kw);
  }

  // Limita a max 6 keyword per slide (troppe distraggono)
  return [...keywords].slice(0, 6);
}

export interface SplitOptions {
  /** Sovrascrive il numero di slide (clamp 2-5). Default = auto da content length. */
  forceSlides?: number;
}

export function splitPillToCarousel(
  pill: { title: string; content?: string | null },
  opts: SplitOptions = {},
): CarouselSlideContent[] {
  const title = cleanText(pill.title).trim();
  const contentChunks = chunkContent(pill.content ?? '');

  // Decidi numero slide totale
  let bodySlideCount = contentChunks.length;
  if (opts.forceSlides) {
    bodySlideCount = Math.max(MIN_SLIDES - 1, Math.min(MAX_SLIDES - 1, opts.forceSlides - 1));
  } else {
    // Auto: cap 4 body slide → 5 totali (con hero)
    bodySlideCount = Math.min(MAX_SLIDES - 1, bodySlideCount);
  }

  // Se troppo poco body, riduci ma garantisci min 1 slide body
  if (bodySlideCount === 0 && title.length > 0) {
    // Caso edge: nessun content → 1 sola slide (solo hero)
    return [{
      index: 1,
      total: 1,
      text: title,
      keywords: extractKeywords(title),
      kind: 'hero',
    }];
  }

  const total = 1 + bodySlideCount;
  const slides: CarouselSlideContent[] = [];
  // Slide 1 = hero (title)
  slides.push({
    index: 1,
    total,
    text: title,
    keywords: extractKeywords(title),
    kind: 'hero',
  });
  // Slide 2..N = body (content chunks)
  for (let i = 0; i < bodySlideCount; i++) {
    const chunk = contentChunks[i];
    slides.push({
      index: i + 2,
      total,
      text: chunk,
      keywords: extractKeywords(chunk),
      kind: 'body',
    });
  }

  return slides;
}
