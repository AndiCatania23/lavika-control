/**
 * Estrae il "numero principale" e il "contesto" da un pill per
 * renderizzare la composition PillStatVideo (Story video stat
 * motion graphics).
 *
 * Strategia:
 *   1. Cerca il primo numero (≥1 cifra) nel `title`. Se non trovato,
 *      cerca nel `content`.
 *   2. Cattura: `number` = parseInt del match, `context` = tutto il
 *      title senza il numero, ripulito.
 *   3. Se ci sono `:` o `·` ridondanti, normalizza con `·` come
 *      separatore editoriale.
 *   4. Se non trova nessun numero, ritorna `{number: null, context: title}`
 *      → la composition mostrerà il title come hero text invece del counter.
 *
 * Esempi:
 *   "Caturano: 12 gol in stagione"
 *     → number: 12, context: "CATURANO · GOL IN STAGIONE"
 *
 *   "5 vittorie consecutive in trasferta"
 *     → number: 5, context: "VITTORIE CONSECUTIVE IN TRASFERTA"
 *
 *   "Promosso in B nel 2007"
 *     → number: 2007, context: "PROMOSSO IN B NEL"
 *
 *   "Caturano tabù playoff"  (no numero)
 *     → number: null, context: "CATURANO TABÙ PLAYOFF"
 */

export interface PillStatPayload {
  /** Numero principale animato. NULL = useremo `heroText` invece. */
  number: number | null;
  /** Suffisso opzionale (% / °) — null per ora, future use. */
  numberSuffix: string;
  /** Contesto sotto il numero, UPPERCASE, max ~80 char. */
  context: string;
  /** Hero text quando number è null (= title intero). */
  heroText: string;
}

interface PillLike {
  title: string;
  content?: string | null;
  pill_category?: string | null;
}

const NUMBER_REGEX = /(\d{1,4})(°|%)?/;

/** Pulisce un context: rimuove ":", spazi doppi, trim, uppercase. */
function cleanContext(raw: string): string {
  return raw
    // Sostituisce `:` con ` · ` (separatore editoriale)
    .replace(/\s*:\s*/g, ' · ')
    // Trim spazi multipli
    .replace(/\s+/g, ' ')
    // Rimuove punteggiatura iniziale/finale di troppo (· - , .)
    .replace(/^[\s·\-,.]+|[\s·\-,.]+$/g, '')
    .trim()
    .toUpperCase();
}

export function extractStatFromPill(pill: PillLike): PillStatPayload {
  const title = (pill.title ?? '').trim();
  const content = (pill.content ?? '').trim();

  // 1. Cerca numero nel title prima, poi nel content come fallback
  const match = title.match(NUMBER_REGEX) ?? content.match(NUMBER_REGEX);

  if (!match) {
    return {
      number: null,
      numberSuffix: '',
      context: cleanContext(title),
      heroText: title,
    };
  }

  const numberStr = match[1];
  const suffix = match[2] ?? '';
  const number = parseInt(numberStr, 10);

  // 2. Decidi da quale stringa è uscito il match (title o content)
  const sourceStr = title.match(NUMBER_REGEX) ? title : content;

  // 3. Rimuovi il numero dal sourceStr, ripulisci
  const withoutNumber = sourceStr.replace(NUMBER_REGEX, ' ').trim();
  const context = cleanContext(withoutNumber);

  return {
    number,
    numberSuffix: suffix,
    context: context || cleanContext(title), // fallback se context vuoto
    heroText: title,
  };
}
