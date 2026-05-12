/**
 * Step 1 — Fact Extractor
 * Estrae facts strutturati dalla pill via gemma3 JSON-mode.
 * Output: entities (con polarity), numbers, key_claim, sentiment, forbidden_claims.
 */

import { ollamaGenerate, safeJsonParse, GEN_MODEL } from './ollamaClient';
import { FACT_EXTRACTOR_SYSTEM, FACT_SCHEMA_HINT } from './prompts';
import type { CaptionSource, ExtractedFacts, SourceEntity } from './types';

export async function extractFacts(source: CaptionSource): Promise<ExtractedFacts> {
  const prompt = `PILL TITLE: ${source.title}

PILL CONTENT:
${source.content}

Estrai i fatti in JSON secondo questo schema:
${FACT_SCHEMA_HINT}

Vincoli:
- Includi TUTTI i nomi propri menzionati (giocatori, allenatori, club, ex-dirigenti).
- Numeri: estrai cifre esatte, percentuali, date, durate ESATTAMENTE come nella pill.
- forbidden_claims: 3-5 claim che sarebbero contraddizioni della pill.
- sentiment: una sola parola tra le opzioni.`;

  const raw = await ollamaGenerate(prompt, {
    model: GEN_MODEL,
    system: FACT_EXTRACTOR_SYSTEM,
    jsonMode: true,
    temperature: 0.2,
    numPredict: 600,
  });

  const parsed = safeJsonParse<Partial<ExtractedFacts>>(raw);
  if (!parsed) {
    return {
      entities: [],
      numbers: [],
      key_claim: '',
      sentiment: 'neutral',
      forbidden_claims: [],
      _error: 'fact_parse_failed',
      _raw: raw.slice(0, 500),
    };
  }

  // Normalize
  const entities: SourceEntity[] = Array.isArray(parsed.entities) ? parsed.entities : [];
  const normalizedEntities = entities
    .filter((e) => e && typeof e.name === 'string' && e.name.trim())
    .map((e) => ({
      name: e.name.trim(),
      role: e.role,
      polarity: (e.polarity || 'neutral') as SourceEntity['polarity'],
    }));

  return {
    entities: normalizedEntities,
    numbers: Array.isArray(parsed.numbers) ? parsed.numbers.map(String) : [],
    key_claim: parsed.key_claim || '',
    sentiment: (parsed.sentiment || 'neutral') as ExtractedFacts['sentiment'],
    forbidden_claims: Array.isArray(parsed.forbidden_claims) ? parsed.forbidden_claims : [],
  };
}
