import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBaseline, comparePost, contentTypeBaselines, detectSaturation, priorityScore, sortByPriority } from './analytics';
import { contentCanBeReused } from './classification';
import type { SocialPostMetric } from './types';

const now = new Date('2026-08-22T12:00:00Z');
const post = (overrides: Partial<SocialPostMetric> & Pick<SocialPostMetric, 'id'>): SocialPostMetric => ({
  id: overrides.id, platform: 'instagram', publishedAt: '2026-08-21T10:00:00Z', snapshotAt: '2026-08-22T10:00:00Z',
  caption: 'Notizia Catania', reach: 100, impressions: 120, likes: 10, comments: 1, shares: 2, saves: 1, engagementRate: 0.14,
  ...overrides,
});

test('campione insufficiente viene dichiarato, non trasformato in pattern', () => {
  assert.equal(buildBaseline([post({ id: '1' }), post({ id: '2' })], 30, now).confidence, 'insufficient');
});

test('post appena pubblicato non viene confrontato con post maturi', () => {
  const fresh = post({ id: 'fresh', publishedAt: '2026-08-22T10:00:00Z', snapshotAt: '2026-08-22T11:00:00Z' });
  assert.deepEqual(comparePost(fresh, [fresh, post({ id: 'old' })]).comparable, false);
  assert.equal(comparePost(fresh, [fresh]).reason, 'Post troppo recente');
});

test('news scaduta non è riproponibile, evergreen sì', () => {
  assert.equal(contentCanBeReused('news', '2026-08-20T10:00:00Z', now), false);
  assert.equal(contentCanBeReused('evergreen', '2025-01-01T10:00:00Z', now), true);
});

test('rileva saturazione solo con concentrazione significativa', () => {
  const posts = Array.from({ length: 6 }, (_, index) => post({ id: String(index), publishedAt: `2026-08-22T0${index + 4}:00:00Z`, contentType: index < 4 ? 'market' : 'community' }));
  const saturation = detectSaturation(posts, now);
  assert.equal(saturation?.contentType, 'market');
  assert.equal(saturation?.count, 4);
});

test('baseline per tipo mantiene campione e mediana separati', () => {
  const rows = [post({ id: 'm1', contentType: 'market', reach: 100 }), post({ id: 'm2', contentType: 'market', reach: 300 }), post({ id: 'c1', contentType: 'community', reach: 50 })];
  const market = contentTypeBaselines(rows, now).find((row) => row.contentType === 'market');
  assert.equal(market?.medianReach, 200);
  assert.equal(market?.sampleSize, 2);
});

test('priority score applica penalità saturazione e ordinamento', () => {
  const high = { id: 'high', editorialRelevance: 90, timeUrgency: 90, audienceInterest: 80, historicalPerformance: 80, appConversionPotential: 70, strategicImportance: 80, saturationPenalty: 5 };
  const low = { id: 'low', editorialRelevance: 40, timeUrgency: 30, audienceInterest: 40, historicalPerformance: 30, appConversionPotential: 30, strategicImportance: 40, saturationPenalty: 10 };
  assert.ok(priorityScore(high) > priorityScore(low));
  assert.equal(sortByPriority([low, high])[0].id, 'high');
});
