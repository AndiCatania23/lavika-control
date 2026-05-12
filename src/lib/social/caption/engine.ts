/**
 * Caption Hook Engine — orchestratore pipeline 4-step.
 *
 * Usage:
 *   const result = await runCaptionEngine({ variant_id, source, platform, format });
 *
 * Non tocca il DB: il daemon caption-engine.ts gestisce persistenza.
 * Vedi docs/social-engine/00-overview.md e 02-anti-hallucination-pipeline.md.
 */

import { extractFacts } from './factExtractor';
import { generateHooks } from './hookGenerator';
import { validateVariant } from './validators';
import { ollamaEmbed, GEN_MODEL } from './ollamaClient';
import type { CaptionEngineRequest, CaptionEngineResult, ValidationResult } from './types';

const FALLBACK_HOOK = 'Cosa è successo? Apri LAVIKA per scoprirlo. 👀';

export async function runCaptionEngine(req: CaptionEngineRequest): Promise<CaptionEngineResult> {
  const tStart = Date.now();
  const out: CaptionEngineResult = {
    variant_id: req.variant_id,
    source_id: req.source.id,
    variants_generated: 0,
    validations: [],
    selected_idx: null,
    fallback_used: false,
    latency_ms: { extract: 0, generate: 0, validate: 0, total: 0 },
    attempts: 0,
  };

  const maxAttempts = req.max_attempts ?? 2;

  // ---- Step 1: fact extraction (1 sola volta, costa 7s) ----
  const t1 = Date.now();
  const facts = await extractFacts(req.source);
  out.latency_ms.extract = Date.now() - t1;
  out.facts = facts;
  if (facts._error) {
    out.pipeline_failed = 'fact_extraction';
    out.error = facts._error;
    out.latency_ms.total = Date.now() - tStart;
    return out;
  }

  // ---- Pre-compute pill embedding (riusato per ogni hook validation) ----
  const pillFullText = `${req.source.title}. ${req.source.content}`;
  const pillEmb = await ollamaEmbed(pillFullText).catch(() => null);
  if (!pillEmb) {
    out.pipeline_failed = 'hook_generation';
    out.error = 'pill_embed_failed';
    out.latency_ms.total = Date.now() - tStart;
    return out;
  }

  // ---- Retry loop: gen + validate ----
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    out.attempts = attempt;

    const t2 = Date.now();
    const hooks = await generateHooks(req.source, facts);
    out.latency_ms.generate += Date.now() - t2;
    out.variants_generated = hooks.variants.length;

    if (hooks._error || hooks.variants.length === 0) {
      if (attempt === maxAttempts) {
        out.pipeline_failed = 'hook_generation';
        out.error = hooks._error || 'no_variants';
        out.latency_ms.total = Date.now() - tStart;
        return out;
      }
      continue;
    }

    // ---- Step 3: validate each variant in sequence (NLI dominates latency) ----
    const t3 = Date.now();
    const validations: ValidationResult[] = [];
    for (let i = 0; i < hooks.variants.length; i++) {
      try {
        const v = await validateVariant(i, hooks.variants[i], facts, req.source.content, pillEmb);
        validations.push(v);
      } catch (e: unknown) {
        validations.push({
          variant_idx: i,
          hook: hooks.variants[i].hook,
          framework: hooks.variants[i].framework,
          stages: {
            entity: { passed: false, reason: 'exception' },
            number: { passed: false, reason: 'exception' },
            polarity: { passed: false, reason: 'exception' },
            bait: { passed: false, reason: 'exception' },
            length: { passed: false, reason: 'exception' },
            emoji: { passed: false, reason: 'exception' },
            nli: { passed: false, reason: e instanceof Error ? e.message : String(e) },
            embed: { passed: false, reason: 'exception' },
          },
          all_pass: false,
        });
      }
    }
    out.latency_ms.validate += Date.now() - t3;
    out.validations = validations;

    const firstValidIdx = validations.findIndex((v) => v.all_pass);
    if (firstValidIdx >= 0) {
      out.selected_idx = firstValidIdx;
      out.latency_ms.total = Date.now() - tStart;
      return out;
    }
    // continua retry (gen produrra varianti diverse con temperature 0.85)
  }

  // ---- No valid variants after retry: fallback ----
  out.fallback_used = true;
  out.pipeline_failed = 'no_valid_variants';
  // Pick the variant with fewest stage failures (best-effort)
  const ranked = out.validations
    .map((v) => ({
      v,
      fails: Object.values(v.stages).filter((s) => !s.passed).length,
    }))
    .sort((a, b) => a.fails - b.fails);
  if (ranked.length > 0) out.selected_idx = ranked[0].v.variant_idx;
  out.latency_ms.total = Date.now() - tStart;
  return out;
}

export { FALLBACK_HOOK, GEN_MODEL };
