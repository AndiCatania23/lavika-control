/**
 * Step 2 — Hook Generator (constrained)
 * Genera 3 varianti hook con framework diversi.
 * Constraints da extractedFacts: allowed_entities, allowed_numbers, forbidden_claims,
 * negative_polarity_entities.
 */

import { ollamaGenerate, safeJsonParse, GEN_MODEL } from './ollamaClient';
import { HOOK_GENERATOR_SYSTEM, HOOK_OUTPUT_SCHEMA, platformHint } from './prompts';
import type { CaptionSource, ExtractedFacts, GeneratorOutput, HookVariant, Platform, SocialFormat } from './types';

export async function generateHooks(
  source: CaptionSource,
  facts: ExtractedFacts,
  opts?: { platform?: Platform; format?: SocialFormat | string },
): Promise<GeneratorOutput> {
  const allowedEntities = facts.entities.map((e) => e.name).filter(Boolean);
  const negativeEntities = facts.entities
    .filter((e) => e.polarity === 'negative')
    .map((e) => e.name);

  // Platform tuning: char budget + style hint specifici per platform×format.
  // Senza questo, gemma3 generava caption "di lunghezza casuale" per ogni variant.
  const platform = opts?.platform || 'instagram';
  const format = String(opts?.format || 'ig_feed_4_5');
  const hint = platformHint(platform, format);

  const prompt = `PILL TITLE: ${source.title}
PILL CATEGORY: ${source.category ?? 'unknown'}

PILL CONTENT (contesto):
${source.content}

ALLOWED_ENTITIES: ${JSON.stringify(allowedEntities)}
ALLOWED_NUMBERS: ${JSON.stringify(facts.numbers)}
NEGATIVE_POLARITY_ENTITIES (mai verbi positivi vicino): ${JSON.stringify(negativeEntities)}
FORBIDDEN_CLAIMS: ${JSON.stringify(facts.forbidden_claims)}
KEY_CLAIM: ${facts.key_claim}
SENTIMENT: ${facts.sentiment}

=== PLATFORM TUNING ===
TARGET_PLATFORM: ${platform}
TARGET_FORMAT: ${format}
CHAR_BUDGET: ${hint.targetChars.min}-${hint.targetChars.max} caratteri (hard target, NON sforare)
STYLE_NOTE: ${hint.style}

Genera 3 hook DIVERSI per framework, TUTTI rispettando CHAR_BUDGET e STYLE_NOTE. JSON output:
${HOOK_OUTPUT_SCHEMA}`;

  const raw = await ollamaGenerate(prompt, {
    model: GEN_MODEL,
    system: HOOK_GENERATOR_SYSTEM,
    jsonMode: true,
    temperature: 0.85,
    numPredict: 600,
  });

  const parsed = safeJsonParse<{ variants?: HookVariant[] }>(raw);
  if (!parsed || !Array.isArray(parsed.variants)) {
    return { variants: [], _error: 'hook_parse_failed', _raw: raw.slice(0, 500) };
  }

  const variants = parsed.variants
    .slice(0, 3)
    .filter((v) => v && typeof v.hook === 'string' && v.hook.trim())
    .map((v) => ({
      hook: v.hook.trim(),
      framework: v.framework || 'unknown',
      char_count: typeof v.char_count === 'number' ? v.char_count : v.hook.length,
      facts_used: Array.isArray(v.facts_used) ? v.facts_used : [],
    }));

  return { variants };
}
