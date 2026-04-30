/**
 * Headline split editoriale — riduce un titolo lungo a una "headline asset"
 * tipo Sky Sport / DAZN / The Athletic.
 *
 * Strategia (Strategia #1 audit 2026-04-30):
 *  1. Cerca break point editoriale entro char ~50 in priorità: `:`, `—`, `;`,
 *     `?`, `!` (la frase prima del break diventa la headline)
 *  2. Se non trovato, cerca `,` entro char 50
 *  3. Se non trovato, taglia all'ultimo spazio < threshold (graceful)
 *  4. Se la prima parola è già > threshold (caso raro), restituisce il titolo
 *     così com'è (sarà gestito dal wrap lato Sharp con `…`)
 *
 * Pattern editoriale italiano sportivo:
 *  - "Caturano salva il Catania: pareggio prezioso..."  → "Caturano salva il Catania"
 *  - "Vittoria! Catania torna al successo dopo..."     → "Vittoria!"
 *  - "Trapani penalizzato di 3 punti, Casertana..."    → "Trapani penalizzato di 3 punti"
 */

export const HEADLINE_SOFT_MAX = 60;   // sopra → mostra warning Composer
export const HEADLINE_TARGET   = 50;   // target ideale per asset readability
export const HEADLINE_HARD_MAX = 70;   // oltre → forzato truncate `…`

export interface HeadlineSplitResult {
  /** Headline finale (≤ HEADLINE_TARGET in casi normali). */
  headline: string;
  /** True se il titolo originale è stato accorciato. */
  wasShortened: boolean;
  /** Strategia utilizzata (debug / log). */
  strategy: 'identity' | 'editorial-break' | 'comma-break' | 'space-fallback' | 'truncate';
  /** Char originale → finale. */
  originalLen: number;
  finalLen: number;
}

/* Break points in priorità editoriale. La frase PRIMA del break va in headline. */
const EDITORIAL_BREAKS = [':', '—', ' - ', ';', '?', '!'];

/**
 * Riduce un titolo a una headline asset.
 * Se il titolo è già ≤ HEADLINE_TARGET, ritorna invariato (identity).
 */
export function splitEditorialTitle(title: string): HeadlineSplitResult {
  const t = title.trim();
  const originalLen = t.length;

  // Skip split: titolo già headline-grade. Soglia = SOFT_MAX (60).
  // HEADLINE_TARGET (50) è solo il "target ideale" per la ricerca break point
  // QUANDO lo split serve davvero — non un threshold di trigger.
  if (originalLen <= HEADLINE_SOFT_MAX) {
    return { headline: t, wasShortened: false, strategy: 'identity', originalLen, finalLen: originalLen };
  }

  // 1. Editorial break (`:`, `—`, ` - `, `;`, `?`, `!`)
  for (const breakChar of EDITORIAL_BREAKS) {
    const idx = t.indexOf(breakChar);
    if (idx > 0 && idx <= HEADLINE_TARGET) {
      // Per ?/! conservare la punteggiatura, per `:`/`—`/`-`/`;` rimuovere
      const keepPunct = breakChar === '?' || breakChar === '!';
      const headline = keepPunct
        ? t.slice(0, idx + 1).trim()
        : t.slice(0, idx).trim();
      if (headline.length >= 8) {       // evita risultati micro
        return {
          headline,
          wasShortened: true,
          strategy: 'editorial-break',
          originalLen,
          finalLen: headline.length,
        };
      }
    }
  }

  // 2. Virgola entro target
  const commaIdx = t.indexOf(',');
  if (commaIdx > 8 && commaIdx <= HEADLINE_TARGET) {
    const headline = t.slice(0, commaIdx).trim();
    return {
      headline,
      wasShortened: true,
      strategy: 'comma-break',
      originalLen,
      finalLen: headline.length,
    };
  }

  // 3. Space fallback: ultimo spazio prima del target
  const spaceCut = t.lastIndexOf(' ', HEADLINE_TARGET);
  if (spaceCut > 8) {
    const headline = t.slice(0, spaceCut).trim();
    // Aggiungi … per indicare continuazione
    return {
      headline: headline + '…',
      wasShortened: true,
      strategy: 'space-fallback',
      originalLen,
      finalLen: headline.length + 1,
    };
  }

  // 4. Hard truncate (caso raro: prima parola > target)
  const headline = t.slice(0, HEADLINE_HARD_MAX - 1) + '…';
  return {
    headline,
    wasShortened: true,
    strategy: 'truncate',
    originalLen,
    finalLen: headline.length,
  };
}

/** Helper: il titolo necessita di attention (warning UI Composer)? */
export function needsHeadlineWarning(title: string): boolean {
  return title.trim().length > HEADLINE_SOFT_MAX;
}
