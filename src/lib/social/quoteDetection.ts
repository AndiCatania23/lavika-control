/**
 * Quote attribution detection — riconosce titoli pill che sono
 * citazioni `Nome[: "frase"]` per attivare il layout editoriale split
 * (quote grande bianca + attribution piccola gold sotto).
 *
 * Pattern editoriale italiano sportivo classico (Gazzetta, Sky, MLS):
 *
 *   "Ricchiuti: \"Doppio risultato? Sconfitti se cala...\""
 *      → quote: "Doppio risultato? Sconfitti se cala..."
 *      → attribution: "Ricchiuti"
 *
 *   "Mister Toscano: \"Vinciamo per i tifosi\""
 *      → quote: "Vinciamo per i tifosi"
 *      → attribution: "Mister Toscano"
 *
 *   "De Luca: \"Forza Catania sempre\""
 *      → quote: "Forza Catania sempre"
 *      → attribution: "De Luca"
 *
 * Detection STRICT: richiede virgolette esplicite dopo i `:` per
 * minimizzare i falsi positivi su titoli tipo:
 *   - "Catania-Crotone: la sfida"          (no virgolette → no match)
 *   - "Storia: 5 numeri impressionanti"    (no virgolette → no match)
 *   - "Caturano tabù playoff"              (no `:` → no match)
 *
 * Le virgolette possono essere curly (" ") o straight (" '), come
 * tipicamente prodotte dai generator di pills.
 */

export interface QuoteAttribution {
  /** Testo della citazione, senza virgolette esterne. */
  quote: string;
  /** Autore della citazione (es. "Ricchiuti", "Mister Toscano"). */
  attribution: string;
}

/** Virgolette accettate come "apertura" della quote dopo i `:`. */
const QUOTE_OPEN_CHARS = ['"', '“', '”', '«', "'", '‘', '’'];

/** Prefissi ruolo accettati prima del nome (sportivo italiano). */
const ROLE_PREFIX_RE = /^(Mister|Coach|Capitan|Capitano|Capt|Mr|Sig|DS|DG|Diesse|Presidente|Pres|Allenatore|Tecnico)\s+/i;

/** Una "parola attribution" valida: capitalizzata, ≥2 char, no trattino. */
const ATTRIBUTION_WORD_RE = /^[A-ZÀ-Ý][a-zà-ÿA-ZÀ-Ý'.]+$/;

/** Char massimo per la parte "Nome:" prima dei due punti. */
const ATTRIBUTION_MAX_CHARS = 40;

/** Char minimo per la citazione (sotto questa soglia non è una vera quote). */
const QUOTE_MIN_CHARS = 8;

/**
 * Detecta pattern `Nome: "frase"` o `Mister Nome: "frase"`.
 * Ritorna `null` se non matcha (caller userà il flow titolo standard).
 */
export function detectQuoteAttribution(title: string): QuoteAttribution | null {
  const t = title.trim();
  if (!t) return null;

  // Primo `:` non in posizione assurda
  const colonIdx = t.indexOf(':');
  if (colonIdx < 2 || colonIdx > ATTRIBUTION_MAX_CHARS) return null;

  const beforeColon = t.slice(0, colonIdx).trim();
  const afterColon = t.slice(colonIdx + 1).trim();

  // Senza virgolette dopo i `:` non lo consideriamo una citazione.
  // Questo filtra titoli tipo "Catania-Crotone: la sfida" o "Storia: 5 numeri".
  if (!afterColon) return null;
  const firstChar = afterColon[0];
  if (!QUOTE_OPEN_CHARS.includes(firstChar)) return null;

  // Attribution validation: 1-3 parole capitalizzate, no trattino
  // ("Catania-Crotone" → reject, "De Luca" → accept, "Mister Toscano" → accept)
  if (beforeColon.includes('-')) return null;

  const withoutPrefix = beforeColon.replace(ROLE_PREFIX_RE, '').trim();
  const words = withoutPrefix.split(/\s+/);
  if (words.length < 1 || words.length > 3) return null;
  for (const w of words) {
    if (!ATTRIBUTION_WORD_RE.test(w)) return null;
  }

  // Strip virgolette esterne dalla quote (tutte le forme, multiple, su entrambi i lati)
  const quoteCharsClass = QUOTE_OPEN_CHARS.map(c =>
    c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('');
  const stripRe = new RegExp(`^[${quoteCharsClass}]+|[${quoteCharsClass}]+$`, 'g');
  const quote = afterColon.replace(stripRe, '').trim();

  if (quote.length < QUOTE_MIN_CHARS) return null;

  return { quote, attribution: beforeColon };
}
