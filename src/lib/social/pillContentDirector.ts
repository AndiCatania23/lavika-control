/**
 * Pill Content Director — il "vero content creator" AI.
 *
 * Riceve una pill e decide come narrarla in una Story video LAVIKA:
 *   - quale "mode" di layout usare
 *   - se c'è un numero da animare e quale label dargli
 *   - come riformulare la headline in voice LAVIKA (tifoso, caldo, breve)
 *   - se mettere un payoff editoriale
 *   - quale tono emotivo (celebrative / nostalgic / provocative / factual)
 *
 * NON sostituisce il regex extractor: viene chiamato DOPO da daemon
 * Mac per ENRICHIRE/RIFORMULARE l'output regex. Se LLM fallisce o
 * ritorna malformed, il job usa i valori regex come fallback (no
 * rotture).
 *
 * Costo: 1 call Ollama gemma3:12b on-premise (~20-25s su M4 Pro),
 * KEEP_ALIVE=0 → unload subito. €0/mese.
 */

import { ollamaGenerate, GEN_MODEL, safeJsonParse } from './caption/ollamaClient';

export interface DirectorOutput {
  /** Layout mode scelto dall'LLM in base alla semantica pill. */
  mode: 'stat' | 'anniversary' | 'year' | 'hero' | 'achievement';
  /** Numero principale da animare. NULL = mode hero, niente counter. */
  number: number | null;
  /** Suffisso inline ("%", "°"). Vuoto per la maggior parte dei casi. */
  numberSuffix: string;
  /** Eyebrow piccolo gold sotto al numero (es. "ANNI FA", "GOL", "VITTORIE"). */
  eyebrow: string;
  /**
   * Headline editoriale RIFORMULATA in voice LAVIKA. Bianca grande sotto
   * il numero/eyebrow. Max 50 char circa per Story 9:16.
   */
  heroText: string;
  /**
   * Context gold UPPERCASE (alternativa a heroText quando mode=stat con
   * numero protagonista, es. "GOL DI CATURANO IN STAGIONE").
   */
  context: string;
  /**
   * Payoff editoriale gold UPPERCASE — la "morale" della pill (es.
   * "L'ESPERIENZA CONTA"). Vuoto se non aggiunge valore.
   */
  payoff: string;
  /** Tono emotivo (per future palette adaptive, oggi solo metadata). */
  tone: 'celebrative' | 'nostalgic' | 'provocative' | 'factual';
  /** Rationale interno (debug / log, non renderizzato). */
  _rationale?: string;
  /** Flag interno che indica che l'LLM ha generato questo output. */
  _llm_director_done: true;
}

interface PillInput {
  title: string;
  content?: string | null;
  pill_category?: string | null;
}

/* ──────────────────────────────────────────────────────────────────
   System prompt — brand voice + esempi few-shot
   ────────────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `Sei il Content Creator senior di LAVIKA Sport (app tifosi Catania FC, Serie C).
Brand voice: tifoso esperto, caldo, brevità sportiva, niente filler corporate, niente "Wow!", niente pep-talk.

Ricevi una pill (notizia breve) e devi dirigere la sua narrazione per una Story 9:16 IG/FB.
NON sei un parser regex: capisci la pill, decidi l'angolo editoriale migliore, riformula in voice LAVIKA.

Modes disponibili (usa SEMPRE uno di questi):
- "stat": una statistica numerica protagonista (es. "12 gol"). Numero counter-up grande, context UPPERCASE gold sotto.
- "anniversary": pattern temporale "N anni fa" → numero + eyebrow "ANNI FA" + headline narrativa.
- "year": anno storico specifico (es. 2007, 1983) → anno + headline narrativa.
- "hero": nessun numero ha senso → solo testo grande, narrativa pura.
- "achievement": traguardo significativo (es. "Promosso in B", "10 vittorie consecutive"). Numero + eyebrow specifico.

Output JSON ESATTO (niente prefazione, niente \`\`\` fence):
{
  "mode": "...",
  "number": <int|null>,
  "numberSuffix": "<vuoto|%|°>",
  "eyebrow": "<es. ANNI FA, GOL, VITTORIE, %, vuoto>",
  "heroText": "<frase principale RIFORMULATA, max 50 char, no virgolette>",
  "context": "<gold UPPERCASE alternativo per stat, vuoto altrimenti>",
  "payoff": "<morale/conclusione UPPERCASE, max 30 char, vuoto se inutile>",
  "tone": "celebrative|nostalgic|provocative|factual",
  "_rationale": "<1 frase: perché questa scelta>"
}

REGOLE FERREE:
- NON inventare numeri, eventi o nomi che non sono nella pill.
- RIFORMULA il titolo se è descrittivo/lungo, ma resta sui fatti reali.
- Voice tifoso: "Caturano è in stato di grazia" > "Caturano ha segnato molti gol".
- heroText e payoff devono COMPLETARSI, NON duplicarsi (se uno dice la stat, l'altro dice la morale).
- Per anniversary, eyebrow = "ANNI FA". Per stat con gol = "GOL". Per stat con %% = "%". Decidi tu il label giusto.
- Se la pill non ha un numero ovvio da animare, vai in "hero" — meglio testo che numero forzato.

ESEMPI:

INPUT: { title: "Di Tacchio, 10 anni fa il trionfo playoff: l'esperienza conta", category: "storia" }
OUTPUT: {
  "mode": "anniversary",
  "number": 10,
  "numberSuffix": "",
  "eyebrow": "ANNI FA",
  "heroText": "Di Tacchio firma i playoff",
  "context": "",
  "payoff": "L'ESPERIENZA È TUTTO",
  "tone": "nostalgic",
  "_rationale": "Pill commemorativa di una grande impresa storica del club, tono orgoglioso"
}

INPUT: { title: "Caturano: 12 gol in stagione", category: "numeri" }
OUTPUT: {
  "mode": "stat",
  "number": 12,
  "numberSuffix": "",
  "eyebrow": "GOL",
  "heroText": "Caturano in stato di grazia",
  "context": "DI CATURANO IN STAGIONE",
  "payoff": "",
  "tone": "celebrative",
  "_rationale": "Stat performante, numero protagonista, headline che enfatizza la forma"
}

INPUT: { title: "Promosso in B nel 2007", category: "storia" }
OUTPUT: {
  "mode": "year",
  "number": 2007,
  "numberSuffix": "",
  "eyebrow": "",
  "heroText": "L'anno della promozione in Serie B",
  "context": "",
  "payoff": "UNA STAGIONE INDIMENTICABILE",
  "tone": "nostalgic",
  "_rationale": "Anno storico, focus sull'evento più che sul numero"
}

INPUT: { title: "Caturano tabù playoff", category: "flash" }
OUTPUT: {
  "mode": "hero",
  "number": null,
  "numberSuffix": "",
  "eyebrow": "",
  "heroText": "Caturano, il tabù playoff",
  "context": "",
  "payoff": "ORA SERVE LA SVOLTA",
  "tone": "provocative",
  "_rationale": "Pill provocatoria su un trend negativo, niente numero, focus su narrativa"
}`;

/* ──────────────────────────────────────────────────────────────────
   Main entry — chiama Ollama, parsa, valida
   ────────────────────────────────────────────────────────────────── */

const VALID_MODES = new Set<DirectorOutput['mode']>(['stat', 'anniversary', 'year', 'hero', 'achievement']);
const VALID_TONES = new Set<DirectorOutput['tone']>(['celebrative', 'nostalgic', 'provocative', 'factual']);

/**
 * Genera il layout narrativo Story video per una pill.
 * @throws Error se Ollama fallisce (caller dovrebbe fare fallback al regex).
 */
export async function directVideoLayout(pill: PillInput): Promise<DirectorOutput> {
  const title = (pill.title ?? '').trim();
  const content = (pill.content ?? '').trim();
  const category = (pill.pill_category ?? 'flash').trim();

  if (!title) throw new Error('directVideoLayout: title required');

  const userPrompt = `INPUT: ${JSON.stringify({ title, content: content.slice(0, 300) || null, category })}

Genera SOLO il JSON output, niente prefazione né code fence.`;

  const raw = await ollamaGenerate(userPrompt, {
    model: GEN_MODEL,
    system: SYSTEM_PROMPT,
    jsonMode: true,
    temperature: 0.5,
    numPredict: 600,
    timeoutMs: 180_000,
  });

  // Parsing tollerante (fences, prefix testo, ecc.)
  let parsed = safeJsonParse<Partial<DirectorOutput>>(raw);
  if (!parsed) {
    // Fallback: sanitize newline letterali dentro stringhe
    const sanitized = raw.replace(/("(?:[^"\\]|\\.)*?")|\n/g, (m, q) => q ? q : '\\n');
    parsed = safeJsonParse<Partial<DirectorOutput>>(sanitized);
  }

  if (!parsed) throw new Error(`directVideoLayout: LLM output malformed: ${raw.slice(0, 200)}`);

  // Validazione strict — se l'LLM si è inventato un mode/tone, usa default safe
  const mode: DirectorOutput['mode'] = VALID_MODES.has(parsed.mode as DirectorOutput['mode'])
    ? (parsed.mode as DirectorOutput['mode'])
    : 'hero';
  const tone: DirectorOutput['tone'] = VALID_TONES.has(parsed.tone as DirectorOutput['tone'])
    ? (parsed.tone as DirectorOutput['tone'])
    : 'factual';

  const number = typeof parsed.number === 'number' ? parsed.number
    : (parsed.number === null ? null : null);

  return {
    mode,
    number,
    numberSuffix: typeof parsed.numberSuffix === 'string' ? parsed.numberSuffix : '',
    eyebrow: typeof parsed.eyebrow === 'string' ? parsed.eyebrow.trim().toUpperCase() : '',
    heroText: typeof parsed.heroText === 'string' ? parsed.heroText.trim() : title,
    context: typeof parsed.context === 'string' ? parsed.context.trim().toUpperCase() : '',
    payoff: typeof parsed.payoff === 'string' ? parsed.payoff.trim().toUpperCase() : '',
    tone,
    _rationale: typeof parsed._rationale === 'string' ? parsed._rationale : undefined,
    _llm_director_done: true,
  };
}
