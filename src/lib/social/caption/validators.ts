/**
 * Step 3 — Validators multi-stage anti-hallucination.
 *
 * Stages:
 *   3a. entity   — fuzzy match con allowed_entities + safe-list start-of-sentence
 *   3b. number   — substring match con allowed_numbers (normalizzato senza simboli)
 *   3c. polarity — forbidden verbs vicino a entita con polarity=negative ← CRITICO
 *   3d. bait     — pattern engagement bait (tag, comment, link in bio, ecc.)
 *   3e. length   — soft cap 200 char
 *   3f. emoji    — count <= 2, dalla whitelist
 *   3g. nli      — llama3.1 semantic contradiction check
 *   3h. embed    — cosine sim hook<>pill >= 0.45
 *
 * Calibrazione verificata su 10 pill POC (v2 = 76% pass rate, 0 polarity violations).
 * Vedi docs/social-engine/04-poc-results.md.
 */

import { ollamaGenerate, ollamaEmbed, safeJsonParse, cosine, NLI_MODEL } from './ollamaClient';
import { NLI_SYSTEM } from './prompts';
import type {
  ExtractedFacts, HookVariant, StageResult, ValidationResult, ValidationStage,
} from './types';

// -------------- regex constants --------------

const POSITIVE_VERBS = [
  /segn\w*/i, /trionf\w*/i, /vinc\w*/i, /vittor\w*/i,
  /in\s+gran\s+forma/i, /in\s+forma/i,
  /protagonist\w*/i, /in\s+campo/i, /titolar\w*/i,
  /giocher\w*/i, /\bgioca\b/i, /sblocca\b/i,
  /decid\w*/i, /sbanca\b/i, /esult\w*/i,
];

const BAIT_PATTERNS = [
  /link\s+in\s+bio/i,
  /tag\s+(un|a)\s+(amico|friend)/i,
  /comment\s+🔥/i,
  /scopri\s+di\s+pi[uù]/i,
  /did\s+you\s+know/i,
  /wait\s+for\s+it/i,
  /swipe\s+up/i,
  /lo\s+sapevi\s+che/i,
];

const ALLOWED_EMOJI_SET = new Set([
  '👀','🤝','🙈','😱','🔥','🏆','⚽','💙','❤️','😅','👇','➡️','⬇️','🎯',
  '🤯','💰','💸','🤔','😳','😢','🤐','😏','💪','🤷','📈','📉','💥','💯','🚨','⚡','🥶','🥵','😬','😴','🫠',
]);

// Sequenza emoji unicode (range ampio per coprire varianti)
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F1FF}]/gu;

const SAFE_CAPITALIZED = new Set<string>([
  // pronomi/avverbi/congiunzioni
  'sai','cosa','chi','quale','quando','come','perché','dove','quanto','quanti',
  'ma','ora','adesso','allora','poi','ecco','anche','solo','infatti','comunque',
  'qualcosa','qualcuno','niente','nessuno','ognuno','tutti','tutto',
  // articoli/preposizioni
  'il','la','lo','gli','le','un','una','uno','delle','dei','degli',
  'per','con','su','tra','fra','in','a','da','di','verso','fino',
  'del','della','dello','dal','dalla','nel','nella','sul','sulla',
  // verbi capitalized comuni
  'scopri','leggi','guarda','riuscirà','vinceremo','potrà','potrebbe','deve',
  'ha','hanno','è','sono','era','erano','fu','furono','sarà','saranno',
  'vince','perde','segna','sbaglia','torna','arriva','parte',
  // tempo
  'domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato',
  'ieri','oggi','domani','stasera','stamattina','stanotte','settimana','mese',
  'gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto',
  'settembre','ottobre','novembre','dicembre',
  // numeri scritti
  'uno','due','tre','quattro','cinque','sei','sette','otto','nove','dieci',
  'undici','dodici','tredici','quattordici','quindici','venti','trenta',
  // sport-common
  'playoff','playoffs','serie','campionato','pareggio','vittoria','sconfitta',
  'partita','match','gara','girone','promozione','retrocessione',
  'gol','rete','tiro','calcio','rigore','fallo','ammonizione','espulsione',
  'tabù','maledizione','destino','sogno','incubo','riscatto','trionfo',
  'ferita','speranza','occasione','chance','futuro','passato',
  // pronomi soggetto
  'noi','voi','loro','lui','lei','io','tu',
]);

// -------------- helpers --------------

function tokenizeAllowed(allowed: string[]): Set<string> {
  const valid = new Set<string>();
  for (const ent of allowed) {
    if (!ent) continue;
    let e = ent.toLowerCase();
    e = e.replace(/^(il |la |l'|gli |le |lo |un |una |uno |dei |delle |degli )/u, '');
    for (const tok of e.split(/[\s'\-.]+/u)) {
      const t = tok.trim();
      if (t.length >= 4) valid.add(t);
    }
  }
  return valid;
}

function extractCapitalizedWords(text: string): string[] {
  const re = /[A-ZÀ-Ý][a-zà-ÿ']+(?:-[A-ZÀ-Ý]?[a-zà-ÿ']+)?/g;
  return text.match(re) || [];
}

function findNumbers(text: string): string[] {
  const re = /\b\d+(?:[.,]\d+)*(?:°|ª|'|")?(?:[\-/]\d+)?\b/g;
  return text.match(re) || [];
}

// -------------- stage validators --------------

export function validateEntity(hook: string, allowed: string[]): StageResult {
  const validTokens = tokenizeAllowed(allowed);
  const capitalized = extractCapitalizedWords(hook);
  const invalid: string[] = [];
  const foundClean: string[] = [];

  for (const w of capitalized) {
    const wLower = w.toLowerCase().replace(/['"]/g, '');
    if (SAFE_CAPITALIZED.has(wLower)) continue;
    if (!wLower || wLower.length < 3) continue;
    foundClean.push(w);
    let match = false;
    for (const vt of validTokens) {
      if (wLower.includes(vt) || vt.includes(wLower)) { match = true; break; }
    }
    if (!match) invalid.push(w);
  }
  return {
    passed: invalid.length === 0,
    reason: invalid.length ? `invalid_entities: ${invalid.join(', ')}` : undefined,
    metadata: { found: foundClean, invalid },
  };
}

export function validateNumber(hook: string, allowed: string[]): StageResult {
  const nums = findNumbers(hook);
  const norm = (s: string) => s.replace(/[°ª'"]/g, '');
  const allowedNorm = allowed.map(norm).filter(Boolean);
  const invalid: string[] = [];
  for (const n of nums) {
    const nn = norm(n);
    if (!allowedNorm.some((a) => nn.includes(a) || a.includes(nn))) invalid.push(n);
  }
  return {
    passed: invalid.length === 0,
    reason: invalid.length ? `invented_numbers: ${invalid.join(', ')}` : undefined,
    metadata: { found: nums, invalid },
  };
}

export function validatePolarity(hook: string, negativeEntities: string[]): StageResult {
  const violations: Array<{ entity: string; verb: string }> = [];
  for (const ent of negativeEntities) {
    const entEsc = ent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const verb of POSITIVE_VERBS) {
      const verbSrc = verb.source;
      const pat1 = new RegExp(`${entEsc}[^.!?]{0,30}${verbSrc}`, 'i');
      const pat2 = new RegExp(`${verbSrc}[^.!?]{0,30}${entEsc}`, 'i');
      if (pat1.test(hook) || pat2.test(hook)) {
        violations.push({ entity: ent, verb: verbSrc });
      }
    }
  }
  return {
    passed: violations.length === 0,
    reason: violations.length ? `polarity_violation: ${JSON.stringify(violations)}` : undefined,
    metadata: { violations },
  };
}

export function validateBait(hook: string): StageResult {
  const matched = BAIT_PATTERNS.filter((p) => p.test(hook)).map((p) => p.source);
  return {
    passed: matched.length === 0,
    reason: matched.length ? `bait: ${matched.join(', ')}` : undefined,
    metadata: { matched },
  };
}

export function validateLength(hook: string, softMax = 200): StageResult {
  return {
    passed: hook.length <= softMax,
    reason: hook.length > softMax ? `length_${hook.length}` : undefined,
    metadata: { char_count: hook.length },
  };
}

export function validateEmoji(hook: string): StageResult {
  const found = hook.match(EMOJI_RE) || [];
  const tooMany = found.length > 2;
  const bad = found.filter((e) => !ALLOWED_EMOJI_SET.has(e));
  return {
    passed: !tooMany && bad.length === 0,
    reason: tooMany ? `too_many_emoji_${found.length}` : (bad.length ? `non_allowed: ${bad.join('')}` : undefined),
    metadata: { count: found.length, non_allowed: bad },
  };
}

export async function validateNli(hook: string, keyClaim: string, pillContent: string): Promise<StageResult> {
  const prompt = `NEWS (key claim): ${keyClaim}
NEWS (full text): ${pillContent.slice(0, 600)}

CAPTION: ${hook}

La CAPTION contraddice FATTUALMENTE la NEWS (chi-fa-cosa, numeri, attribuzioni)? Differenze di tono/idiomi/sintesi NON sono contraddizioni.

JSON: {"contradicts": bool, "reason": "max 15 parole"}`;
  try {
    const raw = await ollamaGenerate(prompt, {
      model: NLI_MODEL,
      system: NLI_SYSTEM,
      jsonMode: true,
      temperature: 0,
      numPredict: 120,
    });
    const data = safeJsonParse<{ contradicts?: boolean; reason?: string }>(raw);
    if (!data) return { passed: false, reason: 'nli_parse_failed', metadata: { raw: raw.slice(0, 200) } };
    const contradicts = !!data.contradicts;
    return {
      passed: !contradicts,
      reason: contradicts ? data.reason : undefined,
      metadata: { reason: data.reason },
    };
  } catch (e: unknown) {
    return { passed: false, reason: `nli_error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function validateEmbed(hookEmb: number[], pillEmb: number[], threshold = 0.45): Promise<StageResult> {
  const sim = cosine(hookEmb, pillEmb);
  return {
    passed: sim >= threshold,
    reason: sim < threshold ? `low_sim_${sim.toFixed(3)}` : undefined,
    metadata: { similarity: Number(sim.toFixed(3)), threshold },
  };
}

// -------------- orchestratore single-variant --------------

export async function validateVariant(
  idx: number,
  variant: HookVariant,
  facts: ExtractedFacts,
  pillContent: string,
  pillEmb: number[],
): Promise<ValidationResult> {
  const hook = variant.hook.trim();
  const allowed = facts.entities.map((e) => e.name).filter(Boolean);
  const negatives = facts.entities.filter((e) => e.polarity === 'negative').map((e) => e.name);

  const stages: Record<ValidationStage, StageResult> = {
    entity: validateEntity(hook, allowed),
    number: validateNumber(hook, facts.numbers),
    polarity: validatePolarity(hook, negatives),
    bait: validateBait(hook),
    length: validateLength(hook),
    emoji: validateEmoji(hook),
    nli: { passed: false }, // sotto
    embed: { passed: false }, // sotto
  };

  // NLI + embed in parallelo
  const [nliRes, hookEmb] = await Promise.all([
    validateNli(hook, facts.key_claim, pillContent),
    ollamaEmbed(hook).catch((e) => { throw new Error(`embed_failed: ${e}`); }),
  ]);
  stages.nli = nliRes;
  stages.embed = await validateEmbed(hookEmb, pillEmb);

  const all_pass = Object.values(stages).every((s) => s.passed);
  return { variant_idx: idx, hook, framework: variant.framework, stages, all_pass };
}
