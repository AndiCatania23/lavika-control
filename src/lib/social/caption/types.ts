/**
 * Caption Hook Engine — type definitions.
 * Vedi docs/social-engine/02-anti-hallucination-pipeline.md
 */

export type PillCategory = 'numeri' | 'flash' | 'rivali' | 'storia';

export type Platform = 'instagram' | 'facebook';

export type SocialFormat =
  | 'ig_feed_4_5' | 'ig_square_1_1' | 'ig_story_9_16'
  | 'fb_feed_4_5' | 'fb_square_1_1' | 'fb_story_9_16'
  | 'ig_story_video_9_16' | 'fb_story_video_9_16';

export type Polarity = 'positive' | 'negative' | 'neutral';
export type Sentiment = 'celebratory' | 'sober' | 'negative' | 'mixed' | 'neutral' | 'ironic';

export type HookFramework =
  | 'stat_shock' | 'open_loop' | 'conversational' | 'comando'
  | 'date_anchor' | 'contrarian' | 'cliffhanger_name'
  | 'question' | 'listicle' | 'negation' | 'name_drop' | 'receipt';

export type ValidationStage = 'entity' | 'number' | 'polarity' | 'bait' | 'length' | 'emoji' | 'nli' | 'embed';

export interface SourceEntity {
  name: string;
  role?: 'player' | 'coach' | 'club' | 'exec' | 'opponent' | 'other';
  polarity?: Polarity;
}

export interface ExtractedFacts {
  entities: SourceEntity[];
  numbers: string[];
  key_claim: string;
  sentiment: Sentiment;
  forbidden_claims: string[];
  _raw?: string;
  _error?: string;
}

export interface HookVariant {
  hook: string;
  framework: HookFramework | string;
  char_count?: number;
  facts_used?: string[];
}

export interface GeneratorOutput {
  variants: HookVariant[];
  _raw?: string;
  _error?: string;
}

export interface StageResult {
  passed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  variant_idx: number;
  hook: string;
  framework?: string;
  stages: Record<ValidationStage, StageResult>;
  all_pass: boolean;
}

export interface CaptionSource {
  type: 'pill' | 'episode' | 'match_event' | 'manual';
  id: string;
  title: string;
  content: string;
  category?: PillCategory | string;
  external_context?: string | null;
}

export interface CaptionEngineRequest {
  variant_id: string;
  source: CaptionSource;
  platform: Platform;
  format: SocialFormat;
  max_attempts?: number;
}

export interface CaptionEngineResult {
  variant_id: string;
  source_id: string;
  facts?: ExtractedFacts;
  variants_generated: number;
  validations: ValidationResult[];
  selected_idx: number | null;       // index del best hook (primo all_pass) o null
  fallback_used: boolean;
  pipeline_failed?: 'fact_extraction' | 'hook_generation' | 'no_valid_variants';
  latency_ms: {
    extract: number;
    generate: number;
    validate: number;
    total: number;
  };
  attempts: number;
  error?: string;
}
