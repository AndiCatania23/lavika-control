/**
 * Hashtag Picker — algoritmo deterministico tier-based.
 * NO LLM. Legge da hashtag_pool, ritorna 5-8 hashtag per IG / 0-2 per FB.
 *
 * Tier composition default (IG Feed):
 *   2 brand · 1-2 core · 1 geo · 1 event (se rilevante) · 1 niche/experimental
 *
 * Vedi docs/social-engine/03-hashtag-strategy.md
 */

import type { Platform, SocialFormat } from '../caption/types';

export interface HashtagPoolRow {
  tag: string;
  tier: 'brand' | 'core' | 'niche' | 'geo' | 'experimental' | 'trending' | 'event';
  category: string[];
  platform: string[];
  manual_priority: number;
  is_active: boolean;
}

export interface HashtagPerformanceRow {
  tag: string;
  score: number | null;
}

export interface HashtagPickerInput {
  pool: HashtagPoolRow[];
  performance?: HashtagPerformanceRow[];
  platform: Platform;
  format: SocialFormat;
  content_type: string;  // pill_storia | pill_numeri | pill_flash | pill_rivali | match_preview | match_post | ...
  match_meta?: {
    home_team?: string;
    away_team?: string;
    days_to_match?: number;
    is_derby?: boolean;
  };
  experimental_slot?: boolean;  // se attivare slot esplorativo (~30% post)
}

export interface HashtagPickerOutput {
  hashtags: string[];
  tier_breakdown: Record<string, number>;
  experimental?: string;
  rationale: string;
}

// Caps per platform/format
function platformCap(format: SocialFormat): number {
  if (format.startsWith('ig_story') || format.startsWith('fb_story')) return 0; // story: hashtag in sticker, non caption
  if (format.startsWith('ig_')) return 5; // IG limite enforced dec 2025
  if (format.startsWith('fb_')) return 2; // FB sobri
  return 5;
}

function filterActive(pool: HashtagPoolRow[], platform: Platform, contentType: string): HashtagPoolRow[] {
  return pool.filter((p) => {
    if (!p.is_active) return false;
    if (!p.platform.includes(platform)) return false;
    // category: se p.category vuota, applicabile a tutti; altrimenti deve includere il content_type
    if (p.category && p.category.length > 0) {
      if (!p.category.some((c) => contentType.includes(c) || c.includes(contentType))) return false;
    }
    return true;
  });
}

function rankByPerformance(rows: HashtagPoolRow[], perf?: HashtagPerformanceRow[]): HashtagPoolRow[] {
  if (!perf || perf.length === 0) {
    return rows.sort((a, b) => b.manual_priority - a.manual_priority);
  }
  const scoreMap = new Map<string, number>();
  for (const p of perf) {
    if (typeof p.score === 'number') scoreMap.set(p.tag, p.score);
  }
  return rows.sort((a, b) => {
    const sa = scoreMap.get(a.tag) ?? -1;
    const sb = scoreMap.get(b.tag) ?? -1;
    if (sa !== sb) return sb - sa;
    return b.manual_priority - a.manual_priority;
  });
}

function pickByTier(
  ranked: HashtagPoolRow[],
  tier: HashtagPoolRow['tier'],
  count: number,
  taken: Set<string>,
): string[] {
  const out: string[] = [];
  for (const p of ranked) {
    if (out.length >= count) break;
    if (p.tier !== tier) continue;
    if (taken.has(p.tag)) continue;
    out.push(p.tag);
    taken.add(p.tag);
  }
  return out;
}

export function pickHashtags(input: HashtagPickerInput): HashtagPickerOutput {
  const cap = platformCap(input.format);
  if (cap === 0) {
    return {
      hashtags: [],
      tier_breakdown: {},
      rationale: 'Story format: hashtag vanno in sticker, non in caption',
    };
  }

  // FB minimalista
  if (input.platform === 'facebook') {
    const candidates = filterActive(input.pool, 'facebook', input.content_type);
    const ranked = rankByPerformance(candidates, input.performance);
    const taken = new Set<string>();
    const brand = pickByTier(ranked, 'brand', Math.min(1, cap), taken);
    const event = input.match_meta?.is_derby
      ? pickByTier(ranked, 'event', cap - brand.length, taken)
      : [];
    const tags = [...brand, ...event].slice(0, cap);
    return {
      hashtags: tags,
      tier_breakdown: { brand: brand.length, event: event.length },
      rationale: 'FB minimalist: brand + event-derby se rilevante',
    };
  }

  // IG mix tier-based
  const candidates = filterActive(input.pool, 'instagram', input.content_type);
  const ranked = rankByPerformance(candidates, input.performance);
  const taken = new Set<string>();

  const brand = pickByTier(ranked, 'brand', 2, taken);
  let remaining = cap - brand.length;

  const eventNeeded = input.match_meta?.is_derby ? 1 : 0;
  const event = eventNeeded > 0 ? pickByTier(ranked, 'event', eventNeeded, taken) : [];
  remaining -= event.length;

  const core = pickByTier(ranked, 'core', Math.min(2, Math.max(0, remaining - 1)), taken);
  remaining -= core.length;

  const geo = remaining > 0 ? pickByTier(ranked, 'geo', 1, taken) : [];
  remaining -= geo.length;

  const niche = remaining > 0 ? pickByTier(ranked, 'niche', remaining, taken) : [];
  remaining -= niche.length;

  let experimental: string | undefined;
  if (input.experimental_slot && remaining > 0) {
    const exps = pickByTier(ranked, 'experimental', 1, taken);
    if (exps.length) {
      experimental = exps[0];
      remaining -= 1;
    }
  }

  const tags = [...brand, ...event, ...core, ...geo, ...niche, ...(experimental ? [experimental] : [])]
    .slice(0, cap);

  return {
    hashtags: tags,
    tier_breakdown: {
      brand: brand.length,
      event: event.length,
      core: core.length,
      geo: geo.length,
      niche: niche.length,
      experimental: experimental ? 1 : 0,
    },
    experimental,
    rationale: `IG ${cap}-cap, tier mix: brand+core+geo${eventNeeded ? '+event' : ''}${experimental ? '+experimental' : ''}`,
  };
}
