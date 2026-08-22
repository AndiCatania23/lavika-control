export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';
export type ConfidenceLevel = 'insufficient' | 'low' | 'medium' | 'high';
export type ContentType =
  | 'breaking' | 'news' | 'market' | 'evergreen' | 'player_profile'
  | 'match' | 'episode' | 'community' | 'fantasy' | 'institutional' | 'promo' | 'unknown';
export type HookType =
  | 'number_led' | 'question' | 'breaking' | 'curiosity_gap' | 'statement'
  | 'quote' | 'comparison' | 'emotional' | 'direct_news' | 'unknown';
export type MaturityBucket = 'too_fresh' | '6h' | '24h' | '72h' | 'mature';

export interface SocialPostMetric {
  id: string;
  platform: SocialPlatform;
  publishedAt: string;
  snapshotAt: string;
  caption: string | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagementRate: number | null;
  contentType?: ContentType;
  hookType?: HookType;
}

export interface Baseline {
  windowDays: 7 | 14 | 30 | 90;
  sampleSize: number;
  confidence: ConfidenceLevel;
  medianReach: number | null;
  averageReach: number | null;
  medianEngagementRate: number | null;
  medianShareRate: number | null;
  medianSaveRate: number | null;
}

export interface RelativePerformance {
  postId: string;
  maturity: MaturityBucket;
  sampleSize: number;
  confidence: ConfidenceLevel;
  reachVsMedian: number | null;
  reachPercentile: number | null;
  comparable: boolean;
  reason?: string;
}

export interface PriorityCandidate {
  id: string;
  editorialRelevance: number;
  timeUrgency: number;
  audienceInterest: number;
  historicalPerformance: number;
  appConversionPotential: number;
  strategicImportance: number;
  saturationPenalty: number;
}
