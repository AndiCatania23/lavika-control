/**
 * STEP 1 della pipeline AI-Director-v2 (zero-API approach).
 *
 * Estrazione strutturata di FATTI dalla pill. L'LLM riceve un prompt
 * MINIMALE focalizzato SOLO su extraction (no interpretazione, no
 * riformulazione, no creatività). Output: schema rigido.
 *
 * Filosofia anti-hallucination: meno spazio dai all'LLM per inventare,
 * meno inventa. Un prompt che chiede "estrai questi 6 campi dal testo"
 * è più affidabile di "interpreta semanticamente la pill".
 *
 * Modello: gemma3:12b locale. Latenza: 8-15s. RAM picco: ~9GB.
 * Unload immediato post-call (KEEP_ALIVE=0 + explicit unload).
 */

import { ollamaGenerate, ollamaUnloadModel, GEN_MODEL, safeJsonParse } from './caption/ollamaClient';

export interface ExtractedFacts {
  /** Citazione tra virgolette se presente, vuoto altrimenti. */
  quote: string;
  /** Speaker della citazione (es. "Gasparin", "Mister Toscano"), vuoto se no quote. */
  speaker: string;
  /** Primo numero significativo nel title (es. 12, 2007), null se nessuno. */
  number: number | null;
  /** Unità del numero (es. "gol", "anni fa", "%"), vuoto se nessuna. */
  number_unit: string;
  /** Frase principale del titolo, accorciata se troppo lunga. PAROLE DAL TITLE. */
  main_phrase: string;
  /** Frase secondaria/payoff (parte dopo `:` di solito). Vuoto se assente. */
  secondary_phrase: string;
  /** Persone nominate (giocatori, allenatori, ecc.) trovate nel title. */
  people: string[];
  /** Squadre nominate (Catania, Crotone, Palermo, ecc.). */
  teams: string[];
  /** Pattern temporale: "anniversary" se "N anni fa", "year" se anno storico, "" altrimenti. */
  time_pattern: 'anniversary' | 'year' | '';
}

const EXTRACTION_PROMPT = `Sei un parser strutturato. Ricevi una pill (titolo notizia sportiva in italiano).

IL TUO COMPITO: estrarre i FATTI presenti nel titolo. NON interpretare, NON
riformulare, NON inventare. Se un campo non è nel titolo, vuoto/null.

Output JSON ESATTO:
{
  "quote": "<testo tra virgolette se presente, SENZA virgolette esterne, vuoto se assente>",
  "speaker": "<chi parla se è citazione (Nome o 'Mister Nome'), vuoto se non quote>",
  "number": <int se c'è un numero nel title, null altrimenti>,
  "number_unit": "<unità che SEGUE il numero: 'gol', 'anni fa', '%', 'vittorie', '°', vuoto>",
  "main_phrase": "<frase principale del title, ESATTAMENTE come scritta, max 60 char>",
  "secondary_phrase": "<frase DOPO i ':' se presente e non è una quote, vuoto altrimenti>",
  "people": [<lista nomi propri di persone trovate nel title>],
  "teams": [<lista nomi squadre trovate: Catania, Crotone, ecc.>],
  "time_pattern": "<'anniversary' se 'N anni fa', 'year' se anno 1900-2100, vuoto altrimenti>"
}

REGOLE FERREE:
- USA SOLO parole presenti nel title. NIENTE riformulazioni.
- Se è citazione "Nome: \\"frase\\"" → quote=frase, speaker=Nome, main_phrase=frase
- Se è anniversary "N anni fa, evento" → number=N, number_unit="anni fa", time_pattern="anniversary", main_phrase=evento
- Se è stat "N unità di X" → number=N, number_unit=unità, main_phrase=title intero
- people: nomi propri di giocatori/allenatori (Caturano, Di Tacchio, Ricchiuti, Toscano, ecc.)
- teams: Catania, Crotone, Palermo, Picerno, Casertana, Cosenza, Avellino, ecc.

ESEMPI:

TITLE: "Gasparin avverte: «Catania favorito, ma c'è un tallone d'Achille»"
OUTPUT:
{
  "quote": "Catania favorito, ma c'è un tallone d'Achille",
  "speaker": "Gasparin",
  "number": null,
  "number_unit": "",
  "main_phrase": "Catania favorito, ma c'è un tallone d'Achille",
  "secondary_phrase": "",
  "people": ["Gasparin"],
  "teams": ["Catania"],
  "time_pattern": ""
}

TITLE: "12 gol dalla panchina: la forza nascosta del Catania"
OUTPUT:
{
  "quote": "",
  "speaker": "",
  "number": 12,
  "number_unit": "gol",
  "main_phrase": "12 gol dalla panchina",
  "secondary_phrase": "la forza nascosta del Catania",
  "people": [],
  "teams": ["Catania"],
  "time_pattern": ""
}

TITLE: "Di Tacchio, 10 anni fa il trionfo playoff: l'esperienza conta"
OUTPUT:
{
  "quote": "",
  "speaker": "",
  "number": 10,
  "number_unit": "anni fa",
  "main_phrase": "il trionfo playoff di Di Tacchio",
  "secondary_phrase": "l'esperienza conta",
  "people": ["Di Tacchio"],
  "teams": [],
  "time_pattern": "anniversary"
}

Output SOLO JSON, niente prefazione. Estrai dal title qui sotto.`;

export async function extractFactsFromPill(args: {
  title: string;
  content?: string | null;
}): Promise<ExtractedFacts> {
  const title = args.title.trim();
  if (!title) throw new Error('extractFactsFromPill: title required');

  const userPrompt = `TITLE: "${title}"\n\nOUTPUT:`;

  let raw: string;
  try {
    raw = await ollamaGenerate(userPrompt, {
      model: GEN_MODEL,
      system: EXTRACTION_PROMPT,
      jsonMode: true,
      temperature: 0.1,    // bassissima: solo extraction, no creatività
      numPredict: 400,
      timeoutMs: 90_000,
    });
  } finally {
    ollamaUnloadModel(GEN_MODEL).catch(() => {});
  }

  let parsed = safeJsonParse<Partial<ExtractedFacts>>(raw);
  if (!parsed) {
    const sanitized = raw.replace(/("(?:[^"\\]|\\.)*?")|\n/g, (m, q) => q ? q : '\\n');
    parsed = safeJsonParse<Partial<ExtractedFacts>>(sanitized);
  }
  if (!parsed) {
    throw new Error(`extractFactsFromPill: malformed output: ${raw.slice(0, 200)}`);
  }

  return {
    quote: typeof parsed.quote === 'string' ? parsed.quote.trim() : '',
    speaker: typeof parsed.speaker === 'string' ? parsed.speaker.trim() : '',
    number: typeof parsed.number === 'number' ? parsed.number : null,
    number_unit: typeof parsed.number_unit === 'string' ? parsed.number_unit.trim() : '',
    main_phrase: typeof parsed.main_phrase === 'string' ? parsed.main_phrase.trim() : title,
    secondary_phrase: typeof parsed.secondary_phrase === 'string' ? parsed.secondary_phrase.trim() : '',
    people: Array.isArray(parsed.people) ? parsed.people.filter((p): p is string => typeof p === 'string') : [],
    teams: Array.isArray(parsed.teams) ? parsed.teams.filter((t): t is string => typeof t === 'string') : [],
    time_pattern:
      parsed.time_pattern === 'anniversary' || parsed.time_pattern === 'year'
        ? parsed.time_pattern
        : '',
  };
}
