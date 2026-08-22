import { classifyContentType, classifyHook } from './classification';
import { average, confidenceForSample, median, percentileRank } from './statistics';
import type { Baseline, ContentType, MaturityBucket, PriorityCandidate, RelativePerformance, SocialPostMetric } from './types';

const hoursBetween = (later: string | Date, earlier: string | Date) =>
  (new Date(later).getTime() - new Date(earlier).getTime()) / 3_600_000;

export function maturityBucket(post: Pick<SocialPostMetric, 'publishedAt' | 'snapshotAt'>): MaturityBucket {
  const hours = hoursBetween(post.snapshotAt, post.publishedAt);
  if (!Number.isFinite(hours) || hours < 3) return 'too_fresh';
  if (hours <= 9) return '6h';
  if (hours <= 30) return '24h';
  if (hours <= 84) return '72h';
  return 'mature';
}

const shareRate = (post: SocialPostMetric) => post.reach != null && post.reach > 0 && post.shares != null ? post.shares / post.reach : null;
const saveRate = (post: SocialPostMetric) => post.reach != null && post.reach > 0 && post.saves != null ? post.saves / post.reach : null;

export function buildBaseline(posts: SocialPostMetric[], windowDays: 7 | 14 | 30 | 90, now = new Date()): Baseline {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const eligible = posts.filter((post) => new Date(post.publishedAt).getTime() >= cutoff && maturityBucket(post) !== 'too_fresh');
  return {
    windowDays,
    sampleSize: eligible.length,
    confidence: confidenceForSample(eligible.length),
    medianReach: median(eligible.map((post) => post.reach)),
    averageReach: average(eligible.map((post) => post.reach)),
    medianEngagementRate: median(eligible.map((post) => post.engagementRate)),
    medianShareRate: median(eligible.map(shareRate)),
    medianSaveRate: median(eligible.map(saveRate)),
  };
}

export function comparePost(post: SocialPostMetric, allPosts: SocialPostMetric[]): RelativePerformance {
  const maturity = maturityBucket(post);
  if (maturity === 'too_fresh') {
    return { postId: post.id, maturity, sampleSize: 0, confidence: 'insufficient', reachVsMedian: null, reachPercentile: null, comparable: false, reason: 'Post troppo recente' };
  }
  const peers = allPosts.filter((candidate) => candidate.id !== post.id && candidate.platform === post.platform && maturityBucket(candidate) === maturity && candidate.reach != null);
  const values = peers.map((candidate) => candidate.reach as number);
  const benchmark = median(values);
  const comparable = post.reach != null && benchmark != null && values.length >= 3;
  return {
    postId: post.id,
    maturity,
    sampleSize: values.length,
    confidence: confidenceForSample(values.length),
    reachVsMedian: comparable ? Math.round(((post.reach as number) / benchmark) * 100) / 100 : null,
    reachPercentile: comparable ? percentileRank([...values, post.reach as number], post.reach as number) : null,
    comparable,
    reason: comparable ? undefined : 'Campione comparabile insufficiente',
  };
}

export function contentTypeBaselines(posts: SocialPostMetric[], now = new Date()) {
  const groups = new Map<ContentType, SocialPostMetric[]>();
  for (const post of posts) {
    const type = post.contentType ?? classifyContentType(post.caption);
    groups.set(type, [...(groups.get(type) ?? []), post]);
  }
  return Array.from(groups, ([contentType, values]) => ({ contentType, ...buildBaseline(values, 30, now) }));
}

export function detectSaturation(posts: SocialPostMetric[], now = new Date()) {
  const recent = posts
    .filter((post) => hoursBetween(now, post.publishedAt) <= 24)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 6);
  const counts = new Map<ContentType, number>();
  for (const post of recent) {
    const type = post.contentType ?? classifyContentType(post.caption);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const dominant = Array.from(counts).sort((a, b) => b[1] - a[1])[0];
  if (!dominant || recent.length < 4 || dominant[1] < 4) return null;
  return { contentType: dominant[0], count: dominant[1], sampleSize: recent.length, share: dominant[1] / recent.length, confidence: confidenceForSample(recent.length) };
}

export function enrichPost(post: SocialPostMetric): SocialPostMetric {
  return { ...post, contentType: post.contentType ?? classifyContentType(post.caption), hookType: post.hookType ?? classifyHook(post.caption) };
}

export function priorityScore(candidate: PriorityCandidate): number {
  const positive = candidate.editorialRelevance + candidate.timeUrgency + candidate.audienceInterest
    + candidate.historicalPerformance + candidate.appConversionPotential + candidate.strategicImportance;
  return Math.max(0, Math.min(100, Math.round(positive / 6 - candidate.saturationPenalty)));
}

export function sortByPriority<T extends PriorityCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) => priorityScore(b) - priorityScore(a));
}
