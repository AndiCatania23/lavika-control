/* ──────────────────────────────────────────────────────────────────
   quoteEngine — seleziona la "quote killer" da segment Whisper

   INPUT: lista di WhisperSegment (start/end seconds + testo)
   OUTPUT: { quote, verbToHighlight, segmentStart, segmentEnd, segmentIndex }

   Strategia: scoring deterministico per ranking + (opzionale) refinement
   LLM via Ollama gemma3 se disponibile. Niente hallucination: il quote
   esce SEMPRE come testo letterale di uno dei segment Whisper, mai
   parafrasato. Se LLM fallisce o non disponibile, fallback regex puro.

   Pattern preso da caption-hook-engine (anti-hallucination, on-premise).
   ────────────────────────────────────────────────────────────────── */

export interface WhisperSegment {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

/* ──────────────────────────────────────────────────────────────────
   Turn-length speaker heuristic
   ─────────────────────────────────────────────────────────────────
   Whisper non identifica gli speaker. Però in match-reaction:
   - Giornalista fa DOMANDE brevi (5-20s)
   - Giocatore RISPONDE in turni lunghi (>20s)
   - Tra le due ci sono pause di 0.5-3s

   Strategia: raggruppo segments consecutivi (gap < 1s) in "turni" e
   scarto turni più brevi di 7s (probabili domande/preamboli giornalista).
   Resta solo i turni lunghi → segments del giocatore. Filter 80-90%
   accurato, no dipendenze ML (vs pyannote-audio).
   ────────────────────────────────────────────────────────────────── */

const MIN_PLAYER_TURN_SEC = 7;  // soglia minima turno = risposta giocatore
const MAX_TURN_GAP_SEC = 1.0;   // pausa max all'interno di uno stesso turno

interface SpeakerTurn {
  segments: WhisperSegment[];
  startSec: number;
  endSec: number;
  durationSec: number;
}

export function groupSpeakerTurns(
  segments: WhisperSegment[],
  maxGap = MAX_TURN_GAP_SEC,
): SpeakerTurn[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const turns: SpeakerTurn[] = [];
  let current: WhisperSegment[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.start - prev.end;
    if (gap > maxGap) {
      turns.push(buildTurn(current));
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  turns.push(buildTurn(current));
  return turns;
}

function buildTurn(segs: WhisperSegment[]): SpeakerTurn {
  return {
    segments: segs,
    startSec: segs[0].start,
    endSec: segs[segs.length - 1].end,
    durationSec: segs[segs.length - 1].end - segs[0].start,
  };
}

/** Restituisce solo i segments che appartengono a turni lunghi (>= MIN sec),
 *  ovvero probabili risposte del giocatore (non domande del giornalista). */
function filterPlayerSegments(segments: WhisperSegment[]): WhisperSegment[] {
  const turns = groupSpeakerTurns(segments);
  const playerSegments: WhisperSegment[] = [];
  for (const turn of turns) {
    if (turn.durationSec >= MIN_PLAYER_TURN_SEC) {
      playerSegments.push(...turn.segments);
    }
  }
  return playerSegments;
}

export interface SelectedQuote {
  quote: string;
  verbToHighlight: string | undefined;
  segmentStart: number;
  segmentEnd: number;
  segmentIndex: number;
  /** Source: 'llm' (Ollama refined) | 'regex' (deterministic fallback) */
  source: 'llm' | 'regex';
  /**
   * Sub-segments individuali Whisper che compongono il quote (post-expand).
   * Timestamps in secondi ASSOLUTI rispetto all'inizio del video sorgente.
   * Il consumer (social-asset-builder) li trasforma in relativi al clip
   * tagliato prima di passarli al Remotion per il rendering karaoke.
   */
  subSegments: WhisperSegment[];
}

/** Whitelist verbi d'azione "forti" per match-reaction / press-conference.
 *  Coniugazioni italiane più frequenti (3a sing presente, participio passato,
 *  noi/voi presente, infinito). Lowercase, lemma + form. */
const STRONG_VERBS: ReadonlyArray<{ verb: string; weight: number }> = [
  // Lottare (peso massimo: parola-chiave universale post-match)
  { verb: 'lottare', weight: 10 }, { verb: 'lottato', weight: 10 },
  { verb: 'lottiamo', weight: 10 }, { verb: 'lottano', weight: 10 },
  { verb: 'lotta', weight: 9 }, { verb: 'lottare', weight: 10 },
  // Combattere
  { verb: 'combattere', weight: 9 }, { verb: 'combattuto', weight: 9 },
  { verb: 'combattiamo', weight: 9 },
  // Credere / fede
  { verb: 'credere', weight: 9 }, { verb: 'crediamo', weight: 9 },
  { verb: 'creduto', weight: 8 }, { verb: 'credo', weight: 8 },
  // Vincere
  { verb: 'vincere', weight: 9 }, { verb: 'vinciamo', weight: 9 },
  { verb: 'vinto', weight: 8 }, { verb: 'vince', weight: 7 },
  // Sognare
  { verb: 'sognare', weight: 8 }, { verb: 'sogniamo', weight: 8 },
  { verb: 'sognato', weight: 8 }, { verb: 'sogno', weight: 7 },
  // Soffrire (importante per Catania, città di passione)
  { verb: 'soffrire', weight: 8 }, { verb: 'sofferto', weight: 8 },
  { verb: 'soffriamo', weight: 8 },
  // Sacrificare
  { verb: 'sacrificare', weight: 8 }, { verb: 'sacrificato', weight: 8 },
  { verb: 'sacrifichiamo', weight: 8 },
  // Meritare
  { verb: 'meritare', weight: 7 }, { verb: 'meritato', weight: 8 },
  { verb: 'meritiamo', weight: 7 }, { verb: 'merita', weight: 6 },
  // Difendere
  { verb: 'difendere', weight: 7 }, { verb: 'difeso', weight: 7 },
  { verb: 'difendiamo', weight: 7 },
  // Dedicare (post-vittoria classic)
  { verb: 'dedicare', weight: 7 }, { verb: 'dedicato', weight: 7 },
  { verb: 'dedichiamo', weight: 7 }, { verb: 'dedico', weight: 7 },
  // Regalare
  { verb: 'regalare', weight: 6 }, { verb: 'regalato', weight: 6 },
  { verb: 'regaliamo', weight: 6 },
  // Crescere
  { verb: 'crescere', weight: 6 }, { verb: 'cresciuto', weight: 6 },
  { verb: 'cresciamo', weight: 6 },
  // Voler bene / amare la squadra
  { verb: 'amare', weight: 6 }, { verb: 'amato', weight: 6 }, { verb: 'amiamo', weight: 6 },
  // TIER 2 — verbi comuni 1a persona del giocatore (peso più basso ma ammessi)
  { verb: 'cercare', weight: 4 }, { verb: 'cercato', weight: 4 }, { verb: 'cerco', weight: 4 },
  { verb: 'cerchiamo', weight: 4 },
  { verb: 'riuscire', weight: 5 }, { verb: 'riuscito', weight: 5 }, { verb: 'riusciamo', weight: 5 },
  { verb: 'volere', weight: 4 }, { verb: 'voluto', weight: 4 }, { verb: 'vogliamo', weight: 4 },
  { verb: 'voglio', weight: 4 },
  { verb: 'vedere', weight: 4 }, { verb: 'visto', weight: 4 }, { verb: 'vediamo', weight: 4 },
  { verb: 'andare', weight: 5 }, { verb: 'andato', weight: 5 }, { verb: 'andiamo', weight: 5 },
  { verb: 'cambiare', weight: 4 }, { verb: 'cambiato', weight: 4 }, { verb: 'cambiamo', weight: 4 },
  { verb: 'portare', weight: 4 }, { verb: 'portato', weight: 4 }, { verb: 'portiamo', weight: 4 },
  { verb: 'fare', weight: 3 }, { verb: 'fatto', weight: 4 }, { verb: 'facciamo', weight: 4 },
  { verb: 'pensare', weight: 4 }, { verb: 'pensato', weight: 4 }, { verb: 'penso', weight: 4 },
  { verb: 'mettere', weight: 4 }, { verb: 'messo', weight: 4 }, { verb: 'mettiamo', weight: 4 },
  { verb: 'liberare', weight: 5 }, { verb: 'liberato', weight: 5 }, { verb: 'libera', weight: 4 },
  { verb: 'mancare', weight: 5 }, { verb: 'mancato', weight: 5 }, { verb: 'manca', weight: 4 },
];

const VERB_MAP = new Map(STRONG_VERBS.map((v) => [v.verb, v.weight] as const));

/** Pattern di domanda esplicita giornalista (con ?, wh-words, ecc.) */
const QUESTION_PATTERNS: RegExp[] = [
  /\?\s*$/,                                                              // termina con ?
  /^(cosa|come|quanto|perch[éè]|quando|dove|chi|quale|quali|che cosa)\b/i, // wh-questions IT
  /^(pensa[teti]?|crede[teti]?|sente[teti]?|ritiene[teti]?|dice[teti]?)\b/i, // verbi domanda 2a/3a persona
  /^(vi sentite|vi siete|si sente|vi aspettate|vi piace)/i,              // formule giornalista
  /^(secondo (te|lei|voi))/i,
  /^(ci pu[oò]|ci può|le va)/i,
  /\bne pensa(te|i)\b/i,
  /\bcosa ne (pensi|pensa|pensate)\b/i,
];

/** Pattern di DICHIARAZIONE giornalista in 2a persona singolare/plurale.
 *  Il giornalista parla AL giocatore ("Hai dato tutto", "Avete lottato",
 *  "Siete riusciti a..."), il giocatore risponde in 1a persona.
 *  Spesso queste frasi contengono verbi forti ma vanno escluse. */
const JOURNALIST_2P_PATTERNS: RegExp[] = [
  /^(hai|avete|siete|sei)\s/i,                       // inizio: "Hai dato tutto", "Avete vinto", "Siete riusciti"
  /\b(vi siete|ti sei)\s+(visti|sentit[oi]|trovat[oi]|messi|capit[oi])\b/i,  // riflessivo 2a
  /\b(vi sentite|ti senti|vi siete|ti sei)\b/i,
  /\bdevi\s+(dire|ringraziare|dare|essere|sentire)\b/i,
  /\b(secondo te|secondo voi|per voi|per te)\b/i,
  /\b(ci hai|ci avete|ce l'hai|ce l'avete)\b/i,
  /^(tu|voi)\s+(personalmente|specificamente|chiaramente|secondo)/i,
  /\bdille|digli|dicci\b/i,                          // imperativi al giocatore
  /\b(ti sembra|vi sembra)\b/i,
];

/** Pattern 1a persona giocatore — bonus scoring (NON esclusivo). */
const PLAYER_1P_PATTERNS: RegExp[] = [
  /\b(abbiamo|siamo|ho|sono|mi sono|ci siamo)\b/i,
  /\b(noi stessi|ce la facciamo|ce la mettiamo|ce l'abbiamo)\b/i,
  /\b(credo|penso|sento|voglio|cerco|provo|spero|tengo|metto)\b/i,
  /\bmi (sento|piace|aspetto|aspettavo|sento|sembra)\b/i,
];

function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  return QUESTION_PATTERNS.some((re) => re.test(t));
}

function looksLikeJournalist(text: string): boolean {
  return JOURNALIST_2P_PATTERNS.some((re) => re.test(text));
}

function looksLikePlayer(text: string): boolean {
  return PLAYER_1P_PATTERNS.some((re) => re.test(text));
}

/** Tokenize lowercase preservando posizione originale per `findVerb`. */
function tokenize(text: string): { token: string; index: number }[] {
  const out: { token: string; index: number }[] = [];
  const re = /[\p{L}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ token: m[0].toLowerCase(), index: m.index });
  }
  return out;
}

/** Trova il verbo forte presente nel testo + il suo weight. Restituisce
 *  la versione originale (case preservato) trovata nella frase. */
function findStrongVerb(text: string): { verbOriginal: string; weight: number } | null {
  const tokens = tokenize(text);
  let best: { verbOriginal: string; weight: number } | null = null;
  for (const t of tokens) {
    const w = VERB_MAP.get(t.token);
    if (w !== undefined && (best === null || w > best.weight)) {
      // Recupera versione originale (case) usando indice
      const original = text.substring(t.index, t.index + t.token.length);
      best = { verbOriginal: original, weight: w };
    }
  }
  return best;
}

/** Scoring di un segment per "punchiness":
 *  - presenza di un verbo forte (peso da whitelist)
 *  - brevità (frasi corte = più impattanti, max 12 parole)
 *  - durata audio (3-10s sweet spot per Story)
 *  - assenza di "uh", "ehm", riempitivi (penalty)
 */
/** Frasi banali da escludere: rispondono in 1a persona ma sono troppo
 *  generiche per una Story IG ("sono contento", "sì certo", "esatto",
 *  "bene", "va benissimo"). */
const BANAL_PATTERNS: RegExp[] = [
  /^(s[iì]|no|certo|esatto|bene|ok|okay|appunto)\b[\s,.!]*$/i,
  /^(sono\s+(contento|felice|soddisfatto|d'accordo))[\s,.!]*$/i,
  /^(va\s+(bene|benissimo|cos[iì]))[\s,.!]*$/i,
];

function looksBanal(text: string): boolean {
  return BANAL_PATTERNS.some((re) => re.test(text.trim()));
}

function scoreSegment(seg: WhisperSegment): { score: number; verb: { verbOriginal: string; weight: number } | null } {
  const txt = seg.text.trim();

  // Hard filters (escludono completamente)
  if (txt.length < 10) return { score: 0, verb: null };           // <10 char = quasi sempre banale
  if (looksLikeQuestion(txt)) return { score: 0, verb: null };
  if (looksLikeJournalist(txt)) return { score: 0, verb: null };
  if (looksBanal(txt)) return { score: 0, verb: null };

  const wordCount = txt.split(/\s+/).length;
  if (wordCount < 4) return { score: 0, verb: null };             // min 4 parole
  if (wordCount > 18) return { score: 0, verb: null };

  const dur = seg.end - seg.start;
  if (dur < 2 || dur > 14) return { score: 0, verb: null };       // min 2s audio

  const verb = findStrongVerb(txt);
  const isPlayer = looksLikePlayer(txt);
  // Verbo whitelist NON è più hard-required. Se la frase è chiaramente
  // del giocatore (1a persona) viene comunque ammessa anche senza verbo
  // forte — il giocatore reale usa "cercato di", "ho visto", "voglio",
  // ecc. che spesso non matchano whitelist ma sono ottimi quote.
  if (!verb && !isPlayer) return { score: 0, verb: null };

  // Score: peso verbo (se presente) + bonus lunghezza punchy + duration + speaker
  let score = verb ? verb.weight * 10 : 8;  // base 8 se passa solo per 1a persona
  // Sweet spot 6-12 parole — frasi che riempiono lo schermo Story senza overflow
  if (wordCount >= 6 && wordCount <= 12) score += 12;
  else if (wordCount >= 5) score += 4;
  // Duration sweet spot 3.5-9s (anche più larga per dare respiro)
  if (dur >= 3.5 && dur <= 9) score += 8;
  else if (dur >= 2.5 && dur <= 11) score += 3;
  // Speaker hint: 1a persona = giocatore → boost
  if (isPlayer) score += 15;
  // Filler penalty
  const fillers = ['ehm', 'eh ', ' uh', 'cioè ', 'praticamente', 'insomma'];
  for (const f of fillers) if (txt.toLowerCase().includes(f)) score -= 4;

  return { score, verb };
}

/** Selezione regex deterministica (no LLM). Sempre disponibile come fallback. */
function selectQuoteRegex(segments: WhisperSegment[]): SelectedQuote | null {
  let best: { idx: number; score: number; verb: { verbOriginal: string; weight: number } | null } | null = null;
  segments.forEach((seg, idx) => {
    const { score, verb } = scoreSegment(seg);
    if (score > 0 && (best === null || score > best.score)) {
      best = { idx, score, verb };
    }
  });
  if (best === null) return null;
  const sel = best as { idx: number; score: number; verb: { verbOriginal: string; weight: number } | null };
  const seg = segments[sel.idx];
  return {
    quote: seg.text.trim(),
    verbToHighlight: sel.verb?.verbOriginal,
    segmentStart: seg.start,
    segmentEnd: seg.end,
    segmentIndex: sel.idx,
    source: 'regex',
    // Seed iniziale: il segment scelto. expandQuoteWithContinuation
    // popolerà con gli eventuali segments di continuazione.
    subSegments: [{ start: seg.start, end: seg.end, text: seg.text.trim() }],
  };
}

/* ──────────────────────────────────────────────────────────────────
   LLM refinement via Ollama gemma3:12b (locale Mac)

   Solo se OLLAMA_BASE_URL è settato e il daemon ha accesso (Mac Mini).
   Prompt strict JSON output, single-sentence quote literally taken da uno
   dei segment (no hallucination). Fallback regex se LLM fail/timeout.
   ────────────────────────────────────────────────────────────────── */

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_QUOTE_MODEL ?? 'gemma3:12b';
const OLLAMA_TIMEOUT_MS = 20_000;

interface OllamaQuoteResponse {
  segment_index: number;
  quote: string;
  verb_to_highlight: string;
}

async function selectQuoteOllama(segments: WhisperSegment[]): Promise<SelectedQuote | null> {
  // Compatta segments per LLM: testo + indice + durata
  const segList = segments
    .map((s, i) => {
      const dur = (s.end - s.start).toFixed(1);
      return `[${i}] (${dur}s) "${s.text.trim()}"`;
    })
    .join('\n');

  const prompt = `Sei l'editor video di LAVIKA Sport, dedicato al Catania FC.
Da questa intervista post-partita, trova LA FRASE PIÙ FORTE detta dal GIOCATORE/ALLENATORE per una Story Instagram di 15 secondi.

DISTINZIONE CRITICA — SPEAKER:
- Il GIORNALISTA parla in 2a persona: "Hai dato tutto", "Avete lottato", "Siete riusciti", "Vi siete sentiti", "Ti sei trovato", "Cosa pensate", "Secondo voi", "Devi dire grazie a...", "Tu personalmente...". Termina spesso con "?". DA ESCLUDERE TUTTE.
- Il GIOCATORE/ALLENATORE risponde in 1a persona: "Abbiamo", "Siamo", "Ho", "Mi sono", "Credo", "Penso", "Voglio", "Cerco di", "Ci siamo", "Sento che", "Noi". DA PREFERIRE.

Criteri OBBLIGATORI:
- DEVE essere una RISPOSTA in 1a persona del giocatore/allenatore, MAI una frase del giornalista (né domanda né dichiarazione in 2a persona).
- La frase deve contenere un verbo d'azione forte (lottare, credere, soffrire, vincere, sognare, sacrificare, meritare, difendere, dedicare, combattere, regalare, crescere, dare).
- LUNGHEZZA: tra 6 e 12 parole (sweet spot punchy). MIN 5 parole assoluto.
- DURATA: tra 3 e 9 secondi (sweet spot). MIN 2.5s assoluto.
- ESCLUDI frasi banali corte: "Sono contento", "Sì certo", "Esatto", "Va bene", "Bene", "Certo".
- Niente riempitivi ("ehm", "cioè", "praticamente", "insomma").
- Emotionally punchy: frase che un tifoso vorrebbe condividere come motto.

ESEMPI:
- ❌ ESCLUDI: "Hai dato tutto fino alla fine?" (giornalista, 2a persona, domanda)
- ❌ ESCLUDI: "Avete lottato come leoni oggi" (giornalista, 2a persona plurale)
- ❌ ESCLUDI: "Vi siete sentiti pronti" (giornalista, riflessivo 2a persona)
- ✅ INCLUDI: "Abbiamo lottato fino alla fine" (giocatore, 1a plurale)
- ✅ INCLUDI: "Ho creduto sempre nei miei compagni" (giocatore, 1a sing)
- ✅ INCLUDI: "Siamo qui per giocarci tutto" (giocatore, 1a plurale)

SEGMENT DISPONIBILI:
${segList}

Output JSON RIGOROSO (no markdown, no testo extra):
{"segment_index": <numero da 0 a ${segments.length - 1}>, "quote": "<copia LETTERALE testo segment>", "verb_to_highlight": "<il verbo come scritto nel quote>"}

REGOLE CRITICHE:
1. il campo "quote" deve essere ESATTAMENTE il testo del segment scelto, niente parafrasi.
2. PRIMA esclude ogni segment in 2a persona o con "?". POI seleziona il migliore tra i restanti.
3. Se TUTTI sono giornalista, scegli il segment più probabilmente del giocatore anche senza verbo forte.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2, num_predict: 200 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { response: string };
    const parsed = JSON.parse(data.response) as OllamaQuoteResponse;

    // Validazione anti-hallucination: segment_index deve esistere.
    // NIENTE literal-match strict — Whisper fa errori di trascrizione minori
    // e Ollama spesso normalizza; basta che l'indice esista e il testo del
    // segment originale è quello che useremo come quote (no parafrasi LLM).
    const segIdx = parsed.segment_index;
    if (segIdx < 0 || segIdx >= segments.length) return null;
    const seg = segments[segIdx];
    // Usa il testo Whisper raw (no parafrasi del LLM)
    const quoteText = seg.text.trim();
    // Anti-domanda / anti-giornalista: LLM può sbagliare nonostante il prompt.
    // Verifichiamo sul testo Whisper raw del segment (non sulla parafrasi LLM).
    if (looksLikeQuestion(quoteText) || looksLikeJournalist(quoteText)) return null;

    return {
      quote: quoteText,
      verbToHighlight: parsed.verb_to_highlight?.trim() || findStrongVerb(quoteText)?.verbOriginal,
      segmentStart: seg.start,
      segmentEnd: seg.end,
      segmentIndex: segIdx,
      source: 'llm',
      // Seed iniziale: il segment scelto. expandQuoteWithContinuation
      // popolerà con gli eventuali segments di continuazione.
      subSegments: [{ start: seg.start, end: seg.end, text: quoteText }],
    };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────────
   API pubblica
   ────────────────────────────────────────────────────────────────── */

export interface SelectQuoteOptions {
  /** Se false, salta Ollama e usa solo regex deterministico. Default true. */
  useLLM?: boolean;
}

/**
 * Seleziona la quote killer da un transcript Whisper.
 * Strategia: Ollama gemma3 prima (se disponibile + useLLM), fallback regex.
 * Restituisce null se nessun segment passa il filtro minimo (no verbi forti,
 * tutti troppo lunghi, ecc.) — chiamante decide cosa fare (skip quote scene,
 * usa default, ecc.).
 */
/**
 * Expand quote con segment di continuazione. Whisper a volte chiude un
 * segment dopo "Sono contento" e mette "perché ho liberato questo gol"
 * in un segment successivo (separati da una breve pausa del giocatore).
 * Questa funzione attacca i segment successivi se sono CONTINUAZIONE
 * dello stesso speaker (gap < 2s, non giornalista, non già altro turno).
 * Risultato: il quote passa il CONCETTO completo, non solo l'inizio.
 */
function expandQuoteWithContinuation(
  selected: SelectedQuote,
  allSegments: WhisperSegment[],
  maxLookAheadGapSec = 2.0,
  maxQuoteDurSec = 12,
): SelectedQuote {
  // Trova nell'array completo l'indice del segment selezionato (match per timestamp)
  const startIdx = allSegments.findIndex(
    (s) => Math.abs(s.start - selected.segmentStart) < 0.1,
  );
  if (startIdx === -1) {
    return { ...selected, subSegments: [{ start: selected.segmentStart, end: selected.segmentEnd, text: selected.quote }] };
  }

  let endTime = selected.segmentEnd;
  let quote = selected.quote;
  // Inizia con il segment "seme" (quello già selezionato).
  const subSegments: WhisperSegment[] = [
    { start: allSegments[startIdx].start, end: allSegments[startIdx].end, text: allSegments[startIdx].text.trim() },
  ];

  for (let i = startIdx + 1; i < allSegments.length; i++) {
    const next = allSegments[i];
    const gap = next.start - endTime;
    if (gap < 0 || gap > maxLookAheadGapSec) break;            // troppo lontano = altro turno
    if (looksLikeJournalist(next.text) || looksLikeQuestion(next.text)) break;
    if (next.end - selected.segmentStart > maxQuoteDurSec) break;  // cap durata
    // Aggiungi come continuazione del concetto
    quote = `${quote} ${next.text.trim()}`.replace(/\s+/g, ' ').trim();
    endTime = next.end;
    subSegments.push({ start: next.start, end: next.end, text: next.text.trim() });
  }

  return { ...selected, quote, segmentEnd: endTime, subSegments };
}

export async function selectQuoteFromSegments(
  segments: WhisperSegment[],
  opts: SelectQuoteOptions = {},
): Promise<SelectedQuote | null> {
  if (segments.length === 0) return null;

  // PRE-FILTER speaker: tieni solo segments dentro turni lunghi (>= 7s),
  // che con alta probabilità sono risposte del giocatore. Le domande
  // brevi del giornalista (5-20s spesso, isolate, gap > 1s) vengono
  // escluse. Se nessun turno è abbastanza lungo (intervista atipica),
  // fallback a tutti i segments per non ritornare null.
  const playerSegments = filterPlayerSegments(segments);
  const eligibleSegments = playerSegments.length > 0 ? playerSegments : segments;

  const useLLM = opts.useLLM !== false;
  let selected: SelectedQuote | null = null;
  if (useLLM) {
    selected = await selectQuoteOllama(eligibleSegments);
  }
  if (!selected) {
    selected = selectQuoteRegex(eligibleSegments);
  }
  if (!selected) return null;

  // POST: estendi il quote con segment di continuazione (passa il CONCETTO,
  // non solo la prima frase tagliata da una pausa del giocatore).
  return expandQuoteWithContinuation(selected, segments);
}

/** Converte durata segment (secondi) in frame @ fps (default 30).
 *  Floor 120 frame (4s) per coerenza con MIN_QUOTE_DURATION composition:
 *  frasi brevi vengono estese a 4s per leggibilità testo Story IG. */
export function durationSecondsToFrames(seconds: number, fps = 30): number {
  return Math.max(120, Math.round(seconds * fps));
}
