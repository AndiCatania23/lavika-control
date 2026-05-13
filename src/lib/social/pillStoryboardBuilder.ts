/**
 * STEP 2 + 3 della pipeline AI-Director-v2.
 *
 *  Step 2 = CLASSIFICATION (deterministico, da facts → narrative_type).
 *           Niente LLM call: i facts già contengono tutto quello che serve.
 *
 *  Step 3 = STORYBOARD (LLM call, gemma3:12b). Riceve facts + classification
 *           e GENERA 3-5 scene Story 9:16 con animazione dichiarata per ogni
 *           scena. Il renderer Remotion esegue lo storyboard scene per scena.
 *
 *  Filosofia: l'LLM NON DECIDE il testo (già nei facts), decide solo come
 *  ANIMARE / FRASARE il contenuto già estratto. Hallucination by design ridotta.
 */

import { ollamaGenerate, ollamaUnloadModel, GEN_MODEL, safeJsonParse } from './caption/ollamaClient';
import type { ExtractedFacts } from './pillFactExtractor';

/* ──────────────────────────────────────────────────────────────────
   Step 2: classification (deterministic)
   ────────────────────────────────────────────────────────────────── */

export type NarrativeType = 'quote' | 'anniversary' | 'year' | 'stat' | 'news' | 'narrative';

export function classifyNarrative(facts: ExtractedFacts): NarrativeType {
  if (facts.quote && facts.speaker) return 'quote';
  if (facts.time_pattern === 'anniversary') return 'anniversary';
  if (facts.time_pattern === 'year') return 'year';
  if (facts.number !== null) return 'stat';
  // News editoriale: title con `:` separator hook/body OR title con keyword
  // strong (Caos, Tegola, Stop, Salva, ecc.) → split editoriale dedicato
  const hasEditorialSplit =
    !!facts.secondary_phrase && facts.secondary_phrase.length >= 5;
  const hasNewsKeyword =
    facts.tone_hint === 'provocative' || facts.tone_hint === 'celebrative';
  if (hasEditorialSplit || hasNewsKeyword) return 'news';
  return 'narrative';
}

/* ──────────────────────────────────────────────────────────────────
   Step 3: storyboard schema + LLM generation
   ────────────────────────────────────────────────────────────────── */

export type SceneAnim =
  | 'type-on'         // parole che escono una alla volta (Keynote style)
  | 'scale-in'        // entrata con scale + spring
  | 'slide-up'        // dal basso verso alto
  | 'fade-in'         // semplice fade
  | 'reveal-mask'     // mask reveal dal centro
  | 'counter-up'      // numero che conta da 0 al valore
  | 'quote-marks'     // virgolette decorative + testo
  | 'attribution'     // attribution "— NOME" gold con em-dash
  | 'eyebrow-tag'     // piccolo tag sopra (es. "ANNI FA", "GOL")
  | 'pulse-emphasis'; // emphasis con piccola pulsazione

export type SceneStyle =
  | 'subtle'        // testo bianco normal, no effetti
  | 'bold'          // bianco grande, drop shadow forte
  | 'gold'          // gold accent (#FFC72C)
  | 'warning'       // accent color "danger" per polemica
  | 'glow';         // glow effect per emozione forte

export interface Scene {
  /** ID univoco scene (debug). */
  id: string;
  /** Durata in frame (30fps). 30 = 1s. Range tipico 30-90. */
  duration: number;
  /** Tipo animazione. */
  anim: SceneAnim;
  /** Stile visivo. */
  style: SceneStyle;
  /** Testo della scena. DEVE essere preso dai facts (no invenzioni). */
  text: string;
  /** Emphasis: parola/frase dentro text da evidenziare in gold. Opzionale. */
  emphasis?: string;
}

export interface Storyboard {
  /** Tipo narrativa scelto. */
  narrative_type: NarrativeType;
  /** Scene da renderizzare in sequenza. Total duration ≈ 240 frame (8s). */
  scenes: Scene[];
  /** Tono emotivo per palette adaptive. */
  tone: 'celebrative' | 'nostalgic' | 'provocative' | 'factual';
  /** Strategia immagine background. */
  image_strategy: 'ken-burns-zoom-in' | 'ken-burns-zoom-out' | 'parallax-up' | 'static-darken';
  /** Shareability score 1-10 (sends-per-reach IG signal). */
  shareability_score: number;
  /** Rationale debug. */
  _rationale?: string;
}

const STORYBOARD_PROMPT = `Sei un Art Director per Story video Instagram 9:16 sportive (Catania FC).
Ricevi FATTI ESTRATTI da una pill + tipo narrativa. Componi uno STORYBOARD
di 3-5 scene da animare in 8 secondi totali (240 frame @ 30fps).

REGOLA #1: Il TESTO di ogni scena DEVE essere preso dai facts forniti.
NON inventare. NON riformulare. Puoi solo:
- Accorciare se >50 char
- Spezzare in 2-3 scene se è una frase lunga
- Ripetere una parola come emphasis

Animazioni disponibili (scegli per scena):
- "type-on": parole una alla volta, per build-up tensione
- "scale-in": ingresso con scala, per impatto
- "slide-up": dal basso, per arrivi delicati
- "fade-in": fade semplice, per transizioni
- "reveal-mask": mask reveal dal centro, drammatico
- "counter-up": numero che conta da 0 (solo per scene con numeri)
- "quote-marks": virgolette decorative + quote, per citazioni
- "attribution": "— NOME" gold con em-dash, per chi parla
- "eyebrow-tag": tag piccolo sopra (es. "ANNI FA", "GOL"), per qualifier
- "pulse-emphasis": pulsazione, per parole chiave

Stili disponibili (scegli per scena):
- "subtle": bianco normale, no effetti
- "bold": bianco grande, drop shadow forte
- "gold": accent gold (#FFC72C)
- "warning": red accent, polemico
- "glow": glow effect per emozione

Durata scene: 30=1s, 60=2s, 90=3s. Total deve essere ≈ 240 (8s).
DURATA MINIMA PER SCENA CON TESTO: 50 frame (1.67s) per essere leggibile.
Scene "fade-in" finale può essere min 40 frame. Niente scene < 30 frame mai.

PATTERN STORYBOARD PER NARRATIVE TYPE:

• quote:    s1=quote-marks (40f) → s2=type-on quote main (120f) → s3=attribution speaker (60f) → s4=fade-in (40f)

• stat:     s1=counter-up numero (60f) → s2=eyebrow-tag unità (60f) → s3=scale-in/reveal-mask payoff (80f) → s4=fade-in (40f)

• anniversary: s1=counter-up N (60f) → s2=eyebrow-tag "ANNI FA" (50f) → s3=reveal-mask hero (90f) → s4=fade-in payoff (40f)

• year:     s1=scale-in anno (70f) → s2=reveal-mask main_phrase (90f) → s3=slide-up/fade payoff (80f)

• news:     PATTERN EDITORIAL HEADLINE — è il 50% delle pill, regia dedicata:
            s1=scale-in HOOK UPPERCASE bold/warning (70f) →
            s2=type-on body narrativo (110f) →
            s3=pulse-emphasis o slide-up payoff (60f).
            Per tone "provocative" usa style="warning". Per "celebrative" style="gold".

• narrative: fallback hero text — usa type-on/reveal-mask 2 scene.

TONO → STILE (importante!):
- tone=provocative → style "warning" sulle scene principali (red accent #FF4444)
- tone=celebrative → style "gold" (intensifica brand color)
- tone=nostalgic → style "subtle" o "gold" tenue
- tone=factual → default style appropriato per anim

Output JSON ESATTO (niente fence):
{
  "narrative_type": "<copia da input>",
  "scenes": [{"id":"s1","duration":N,"anim":"...","style":"...","text":"...","emphasis":"..."}],
  "tone": "celebrative|nostalgic|provocative|factual",
  "image_strategy": "ken-burns-zoom-in|ken-burns-zoom-out|parallax-up|static-darken",
  "shareability_score": <int 1-10>,
  "_rationale": "<1 frase debug>"
}

ESEMPI:

INPUT facts: {quote:"Doppio risultato? Sconfitti se ci pensate", speaker:"Ricchiuti", number:null, main_phrase:"Doppio risultato?", ...}
INPUT type: "quote"
OUTPUT:
{
  "narrative_type": "quote",
  "scenes": [
    {"id":"s1","duration":40,"anim":"quote-marks","style":"gold","text":"\\""},
    {"id":"s2","duration":100,"anim":"type-on","style":"bold","text":"Doppio risultato? Sconfitti se ci pensate","emphasis":"Sconfitti"},
    {"id":"s3","duration":60,"anim":"attribution","style":"gold","text":"RICCHIUTI"},
    {"id":"s4","duration":40,"anim":"fade-in","style":"subtle","text":""}
  ],
  "tone": "provocative",
  "image_strategy": "static-darken",
  "shareability_score": 8,
  "_rationale": "Quote provocatoria, type-on per build up tension"
}

INPUT facts: {number:12, number_unit:"gol", main_phrase:"12 gol dalla panchina", secondary_phrase:"la forza nascosta del Catania", tone_hint:"celebrative", ...}
INPUT type: "stat"
OUTPUT:
{
  "narrative_type": "stat",
  "scenes": [
    {"id":"s1","duration":50,"anim":"counter-up","style":"bold","text":"12"},
    {"id":"s2","duration":40,"anim":"eyebrow-tag","style":"gold","text":"GOL DALLA PANCHINA"},
    {"id":"s3","duration":90,"anim":"reveal-mask","style":"gold","text":"LA FORZA NASCOSTA DEL CATANIA"},
    {"id":"s4","duration":60,"anim":"fade-in","style":"subtle","text":""}
  ],
  "tone": "celebrative",
  "image_strategy": "ken-burns-zoom-out",
  "shareability_score": 8,
  "_rationale": "Stat sorprendente, counter-up sul numero protagonista, payoff con reveal mask"
}

INPUT facts: {main_phrase:"Tegola inaspettata", secondary_phrase:"Donnarumma rischia i primi playoff", tone_hint:"provocative", people:["Donnarumma"], ...}
INPUT type: "news"
OUTPUT:
{
  "narrative_type": "news",
  "scenes": [
    {"id":"s1","duration":70,"anim":"scale-in","style":"warning","text":"TEGOLA INASPETTATA"},
    {"id":"s2","duration":110,"anim":"type-on","style":"bold","text":"Donnarumma rischia i primi playoff","emphasis":"Donnarumma"},
    {"id":"s3","duration":60,"anim":"pulse-emphasis","style":"warning","text":"PRIMI PLAYOFF A RISCHIO"}
  ],
  "tone": "provocative",
  "image_strategy": "static-darken",
  "shareability_score": 8,
  "_rationale": "News provocative: hook in red warning per drama, body type-on per build-up, pulse finale per emphasis"
}

INPUT facts: {main_phrase:"Caturano salva il Catania", secondary_phrase:"pareggio prezioso contro l'Atalanta U23", tone_hint:"celebrative", people:["Caturano"], ...}
INPUT type: "news"
OUTPUT:
{
  "narrative_type": "news",
  "scenes": [
    {"id":"s1","duration":70,"anim":"scale-in","style":"gold","text":"CATURANO SALVA"},
    {"id":"s2","duration":110,"anim":"type-on","style":"bold","text":"pareggio prezioso contro l'Atalanta U23","emphasis":"prezioso"},
    {"id":"s3","duration":60,"anim":"pulse-emphasis","style":"gold","text":"PUNTO D'ORO"}
  ],
  "tone": "celebrative",
  "image_strategy": "ken-burns-zoom-out",
  "shareability_score": 8,
  "_rationale": "News celebrative gol decisivo: hook bold gold, body con emphasis su 'prezioso', payoff celebrativo"
}

Output SOLO JSON. Componi storyboard per i facts qui sotto.`;

export async function generateStoryboard(args: {
  facts: ExtractedFacts;
  classification: NarrativeType;
}): Promise<Storyboard> {
  const input = {
    facts: args.facts,
    type: args.classification,
  };
  const userPrompt = `INPUT: ${JSON.stringify(input)}\n\nOUTPUT:`;

  let raw: string;
  try {
    raw = await ollamaGenerate(userPrompt, {
      model: GEN_MODEL,
      system: STORYBOARD_PROMPT,
      jsonMode: true,
      temperature: 0.3,    // un po' più alta per varietà animazione, ma sempre conservativa
      numPredict: 800,
      timeoutMs: 120_000,
    });
  } finally {
    ollamaUnloadModel(GEN_MODEL).catch(() => {});
  }

  let parsed = safeJsonParse<Partial<Storyboard>>(raw);
  if (!parsed) {
    const sanitized = raw.replace(/("(?:[^"\\]|\\.)*?")|\n/g, (m, q) => q ? q : '\\n');
    parsed = safeJsonParse<Partial<Storyboard>>(sanitized);
  }
  if (!parsed || !Array.isArray(parsed.scenes)) {
    throw new Error(`generateStoryboard: malformed output: ${raw.slice(0, 200)}`);
  }

  // Validation strict
  const validAnims = new Set<SceneAnim>([
    'type-on', 'scale-in', 'slide-up', 'fade-in', 'reveal-mask',
    'counter-up', 'quote-marks', 'attribution', 'eyebrow-tag', 'pulse-emphasis',
  ]);
  const validStyles = new Set<SceneStyle>(['subtle', 'bold', 'gold', 'warning', 'glow']);
  const validTones = new Set(['celebrative', 'nostalgic', 'provocative', 'factual']);
  const validImageStrategies = new Set(['ken-burns-zoom-in', 'ken-burns-zoom-out', 'parallax-up', 'static-darken']);

  const scenes: Scene[] = (parsed.scenes ?? [])
    .filter((s) => !!s && typeof s === 'object')
    .map((s, i) => {
      const obj = s as unknown as Record<string, unknown>;
      return {
        id: typeof obj.id === 'string' ? obj.id : `s${i + 1}`,
        duration: typeof obj.duration === 'number' ? Math.max(40, Math.min(150, obj.duration)) : 60,
        anim: validAnims.has(obj.anim as SceneAnim) ? (obj.anim as SceneAnim) : ('fade-in' as SceneAnim),
        style: validStyles.has(obj.style as SceneStyle) ? (obj.style as SceneStyle) : ('subtle' as SceneStyle),
        text: typeof obj.text === 'string' ? obj.text : '',
        emphasis: typeof obj.emphasis === 'string' ? obj.emphasis : undefined,
      };
    })
    .filter(s => s.text.length > 0 || s.anim === 'quote-marks' || s.anim === 'fade-in')
    .slice(0, 6);

  return {
    narrative_type: args.classification,
    scenes,
    tone: validTones.has(parsed.tone as string) ? (parsed.tone as Storyboard['tone']) : 'factual',
    image_strategy: validImageStrategies.has(parsed.image_strategy as string)
      ? (parsed.image_strategy as Storyboard['image_strategy'])
      : 'static-darken',
    shareability_score: typeof parsed.shareability_score === 'number'
      ? Math.max(1, Math.min(10, Math.round(parsed.shareability_score)))
      : 5,
    _rationale: typeof parsed._rationale === 'string' ? parsed._rationale : undefined,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Step 4: validation deterministica (no LLM)
   ────────────────────────────────────────────────────────────────── */

export interface ValidationReport {
  valid: boolean;
  total_duration: number;
  warnings: string[];
  grounding_pct: number;  // % di parole storyboard presenti nel facts
}

const STOPWORDS_IT = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'di', 'da', 'in', 'su',
  'con', 'per', 'a', 'al', 'alla', 'del', 'della', 'dei', 'delle', 'nel',
  'nella', 'è', 'e', 'o', 'ma', 'che', 'chi', 'non', 'si', 'più', 'meno',
]);

export function validateStoryboard(args: {
  storyboard: Storyboard;
  facts: ExtractedFacts;
  title: string;
}): ValidationReport {
  const warnings: string[] = [];
  const total = args.storyboard.scenes.reduce((sum, s) => sum + s.duration, 0);
  if (total < 180) warnings.push(`Total duration ${total} < 180 (6s minimum)`);
  if (total > 270) warnings.push(`Total duration ${total} > 270 (9s maximum)`);

  // Source vocabulary: title + facts text
  const sourceText = [
    args.title,
    args.facts.quote, args.facts.speaker,
    args.facts.main_phrase, args.facts.secondary_phrase,
    ...args.facts.people, ...args.facts.teams,
  ].join(' ').toLowerCase();
  const sourceWords = new Set(
    sourceText.replace(/[.,;:!?"'""«»()]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS_IT.has(w))
  );

  // Storyboard text words
  const storyboardText = args.storyboard.scenes.map(s => s.text).join(' ');
  const storyboardWords = storyboardText.toLowerCase()
    .replace(/[.,;:!?"'""«»()]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS_IT.has(w));
  const numeric = (s: string) => /^\d+$/.test(s);
  const matchedWords = storyboardWords.filter(w => sourceWords.has(w) || numeric(w));
  const grounding_pct = storyboardWords.length === 0
    ? 1
    : matchedWords.length / storyboardWords.length;

  if (grounding_pct < 0.7) {
    warnings.push(`Grounding ${(grounding_pct * 100).toFixed(0)}% < 70%: possibili hallucination`);
  }

  return {
    valid: warnings.length === 0,
    total_duration: total,
    warnings,
    grounding_pct,
  };
}
