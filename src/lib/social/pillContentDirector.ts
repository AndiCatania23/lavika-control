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

const SYSTEM_PROMPT = `Sei il Content Director di LAVIKA Sport (app tifosi Catania FC, Serie C).
Decidi come strutturare visivamente una pill per una Story 9:16. Brand voice: tifoso, breve, asciutto.

REGOLA #1 (NON DEROGABILE): heroText, context e payoff devono usare SOLO parole e concetti
presenti nel TITLE della pill. Puoi accorciarlo, riordinarlo, scegliere quale parte mettere
in heroText vs payoff — ma NON puoi aggiungere concetti che non sono nel title.

Il "content" che ricevi NON è una fonte testuale. Lo usi SOLO per:
- Capire il tono emotivo (celebrative / nostalgic / provocative / factual)
- Verificare che il numero estratto dal title sia coerente
NIENTE frasi prese dal content, MAI.

Esempio di errore da NON fare:
  Title: "Di Tacchio, 10 anni fa il trionfo playoff: l'esperienza conta"
  Content: "... il capitano Francesco Di Tacchio alzava la Serie B..."
  ❌ MALE:  heroText: "L'urlo dei playoff", payoff: "IL CAPITANO È UN SIMBOLO"
            (non sono nel title, sono interpretazioni dal content)
  ✅ BENE:  heroText: "Di Tacchio, il trionfo playoff", payoff: "L'ESPERIENZA CONTA"
            (entrambi presi/derivati dal title)

Modes disponibili (scegli UNO):
- "stat": una stat numerica → numero counter-up + context UPPERCASE sotto
- "anniversary": pattern "N anni fa/dopo" → numero + eyebrow "ANNI FA" + headline dal title
- "year": anno storico (1900-2100) → anno + headline dal title
- "hero": niente numero → solo testo grande dal title
- "achievement": traguardo (sinonimo di stat per record/promozioni)

Output JSON ESATTO (niente fence, niente prefazione):
{
  "mode": "stat|anniversary|year|hero|achievement",
  "number": <int dal title|null>,
  "numberSuffix": "<vuoto|%|°>",
  "eyebrow": "<label uppercase: ANNI FA, GOL, VITTORIE, % — solo se serve>",
  "heroText": "<sotto-frase ESTRATTA/ACCORCIATA dal title, max 50 char, no virgolette>",
  "context": "<sotto-frase UPPERCASE per stat, vuoto altrimenti>",
  "payoff": "<sotto-frase UPPERCASE dopo i ':' del title se presente, vuoto altrimenti>",
  "tone": "celebrative|nostalgic|provocative|factual",
  "_rationale": "<1 frase debug>"
}

ALTRE REGOLE:
- numberSuffix solo se il title ha "%" o "°" attaccato al numero
- payoff: usa SOLO la parte del title DOPO i ":" (se presente), altrimenti vuoto
- eyebrow: deduci dal contesto del title (es. "10 anni fa" → ANNI FA, "12 gol" → GOL)
- Se NON c'è numero ovvio nel title, vai in "hero"
- max char enforced: heroText ≤ 50, context ≤ 40, payoff ≤ 30

ESEMPI:

INPUT: { title: "Di Tacchio, 10 anni fa il trionfo playoff: l'esperienza conta", category: "flash" }
OUTPUT: {
  "mode": "anniversary",
  "number": 10,
  "numberSuffix": "",
  "eyebrow": "ANNI FA",
  "heroText": "Di Tacchio, il trionfo playoff",
  "context": "",
  "payoff": "L'ESPERIENZA CONTA",
  "tone": "nostalgic",
  "_rationale": "Anniversary 10 anni fa, heroText prima del ':', payoff dopo"
}

INPUT: { title: "Caturano: 12 gol in stagione", category: "numeri" }
OUTPUT: {
  "mode": "stat",
  "number": 12,
  "numberSuffix": "",
  "eyebrow": "GOL",
  "heroText": "Caturano: 12 gol in stagione",
  "context": "DI CATURANO IN STAGIONE",
  "payoff": "",
  "tone": "celebrative",
  "_rationale": "Stat numero gol, eyebrow GOL, niente payoff (no ':' editoriale)"
}

INPUT: { title: "Promosso in B nel 2007", category: "storia" }
OUTPUT: {
  "mode": "year",
  "number": 2007,
  "numberSuffix": "",
  "eyebrow": "",
  "heroText": "Promosso in B",
  "context": "",
  "payoff": "",
  "tone": "nostalgic",
  "_rationale": "Anno storico promozione, heroText accorciato dal title"
}

INPUT: { title: "Caturano tabù playoff", category: "flash" }
OUTPUT: {
  "mode": "hero",
  "number": null,
  "numberSuffix": "",
  "eyebrow": "",
  "heroText": "Caturano tabù playoff",
  "context": "",
  "payoff": "",
  "tone": "provocative",
  "_rationale": "No numero, hero text dal title intero"
}`;

/* ──────────────────────────────────────────────────────────────────
   Main entry — chiama Ollama, parsa, valida
   ────────────────────────────────────────────────────────────────── */

const VALID_MODES = new Set<DirectorOutput['mode']>(['stat', 'anniversary', 'year', 'hero', 'achievement']);
const VALID_TONES = new Set<DirectorOutput['tone']>(['celebrative', 'nostalgic', 'provocative', 'factual']);

/** Stopword italiane comuni — escluse dal calcolo overlap title↔output. */
const STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno',
  'di', 'da', 'in', 'su', 'con', 'per', 'tra', 'fra', 'a', 'al', 'alla', 'allo',
  'del', 'della', 'dello', 'dei', 'degli', 'delle',
  'nel', 'nella', 'nello', 'nei', 'negli', 'nelle',
  'è', 'e', 'o', 'ma', 'che', 'chi', 'come', 'non', 'si', 'se', 'ci', 'cui',
  'più', 'meno', 'molto', 'poco', 'tutto', 'tutti', 'questa', 'questo', 'questi',
  'sua', 'suo', 'sue', 'suoi', 'mia', 'mio', 'sua', 'loro', 'lui', 'lei',
  'ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno', 'sono', 'sei', 'siamo', 'siete',
]);

/** Estrae token significativi (non stopword, ≥3 char). */
function meaningfulTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[.,;:!?"'""«»()\[\]]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3 && !STOPWORDS.has(w))
  );
}

/**
 * Verifica grounding: heroText e payoff dell'LLM devono avere almeno il
 * `minOverlapPct` di token significativi in comune col title.
 * Ritorna true se l'output è "ancorato" al title (no hallucination).
 */
function isGroundedToTitle(
  output: { heroText: string; payoff: string },
  title: string,
  minOverlapPct = 0.5,
): { grounded: boolean; heroOverlap: number; payoffOverlap: number } {
  const titleTokens = meaningfulTokens(title);
  if (titleTokens.size === 0) return { grounded: true, heroOverlap: 1, payoffOverlap: 1 };

  const heroTokens = meaningfulTokens(output.heroText);
  const payoffTokens = meaningfulTokens(output.payoff);

  const heroOverlap = heroTokens.size === 0 ? 1
    : [...heroTokens].filter(t => titleTokens.has(t)).length / heroTokens.size;
  const payoffOverlap = payoffTokens.size === 0 ? 1
    : [...payoffTokens].filter(t => titleTokens.has(t)).length / payoffTokens.size;

  return {
    grounded: heroOverlap >= minOverlapPct && payoffOverlap >= minOverlapPct,
    heroOverlap,
    payoffOverlap,
  };
}

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
    temperature: 0.2,  // bassa creatività → ridotta hallucination
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

  const heroText = typeof parsed.heroText === 'string' ? parsed.heroText.trim() : title;
  const payoff = typeof parsed.payoff === 'string' ? parsed.payoff.trim().toUpperCase() : '';

  // ── Anti-hallucination grounding check ──
  // heroText e payoff devono avere ≥50% di token significativi in comune
  // col title. Se l'AI è andata fuori-tema (interpretato il content come
  // fonte testuale), rifiutiamo e lanciamo errore → caller fa fallback regex.
  const grounding = isGroundedToTitle({ heroText, payoff }, title, 0.5);
  if (!grounding.grounded) {
    throw new Error(
      `directVideoLayout: ungrounded output (hero overlap ${(grounding.heroOverlap * 100).toFixed(0)}%, ` +
      `payoff overlap ${(grounding.payoffOverlap * 100).toFixed(0)}% < 50%). ` +
      `Title="${title}" heroText="${heroText}" payoff="${payoff}". Caller should fallback to regex.`
    );
  }

  return {
    mode,
    number,
    numberSuffix: typeof parsed.numberSuffix === 'string' ? parsed.numberSuffix : '',
    eyebrow: typeof parsed.eyebrow === 'string' ? parsed.eyebrow.trim().toUpperCase() : '',
    heroText,
    context: typeof parsed.context === 'string' ? parsed.context.trim().toUpperCase() : '',
    payoff,
    tone,
    _rationale: typeof parsed._rationale === 'string' ? parsed._rationale : undefined,
    _llm_director_done: true,
  };
}
