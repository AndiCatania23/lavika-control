/**
 * Draft builder — crea social_drafts + N social_variants + N social_asset_jobs
 * dato una sorgente (pill, episode, manual).
 *
 * Restituisce { draftId, variantsCount }. Il daemon Mac processerà i jobs
 * appena inseriti via Supabase realtime.
 */

import { supabaseServer } from '@/lib/supabaseServer';
import type { SocialFormat } from './assetBuilder';
import { splitEditorialTitle } from './headlineSplit';
import { extractStatFromPill } from './extractStatFromPill';

/* ──────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────── */

export type Platform = 'instagram' | 'facebook' | 'tiktok';

export type FormatKey =
  | 'feed_post'
  | 'feed_post_4_5'
  | 'story'         // Story 9:16 image (24h)
  | 'story_video'   // Story 9:16 video (24h, MP4 via Remotion)
  | 'reel'
  | 'carousel'
  | 'photo_mode';

export interface VariantSpec {
  platform: Platform;
  format: FormatKey;
  /** Optional: override caption for this variant. If null, uses default from source. */
  caption?: string | null;
  /** Optional: scheduling. If null, draft starts as 'review'. */
  scheduledAt?: string | null;
}

export interface BuildDraftFromPillOpts {
  pillId: string;
  variants: VariantSpec[];
  /** Override draft title; default = `Pill: ${pill.title}` */
  title?: string;
  /** Override per la headline visiva degli asset (Strategy 1 audit 2026-04-30).
      Se omesso, applica `splitEditorialTitle` al pill.title. La caption usa
      sempre il titolo originale, NON l'headline override. */
  headlineOverride?: string;
  createdBy?: string;
  campaignId?: string;
}

export interface BuildDraftResult {
  draftId: string;
  variantIds: string[];
  jobIds: string[];
  variantsCount: number;
}

/* ──────────────────────────────────────────────────────────────────
   Format mapping (Composer FormatKey + Platform → SocialFormat used by Sharp)
   ────────────────────────────────────────────────────────────────── */

function resolveSocialFormat(platform: Platform, format: FormatKey): SocialFormat {
  // Default Feed posts → 4:5 (best aspect 2026 per Meta)
  if (format === 'feed_post' || format === 'feed_post_4_5') {
    return platform === 'facebook' ? 'fb_feed_4_5' : 'ig_feed_4_5';
  }
  if (format === 'carousel') {
    // Carousel uses square (legacy) — first slide locks ratio for all
    return platform === 'facebook' ? 'fb_square_1_1' : 'ig_square_1_1';
  }
  if (format === 'story' || format === 'story_video') {
    return platform === 'facebook' ? 'fb_story_9_16' : 'ig_story_9_16';
  }
  if (format === 'reel') {
    // Reels are video; we still produce a 9:16 cover image as placeholder.
    // Real Reel video will be Remotion recipe later.
    return platform === 'facebook' ? 'fb_story_9_16' : 'ig_story_9_16';
  }
  if (format === 'photo_mode') {
    // TikTok photo carousel — closest is square
    return 'ig_square_1_1';
  }
  // Default fallback
  return 'ig_feed_4_5';
}

/* ──────────────────────────────────────────────────────────────────
   Caption job enqueue (caption-engine daemon picks it up on Mac)
   ────────────────────────────────────────────────────────────────── */

async function enqueueCaptionJob(args: {
  variantId: string;
  sourceType: 'pill' | 'episode' | 'match_event' | 'manual';
  sourceId: string;
  platform: Platform;
  format: FormatKey;
  externalContext?: string | null;
}): Promise<string | null> {
  if (!supabaseServer) return null;
  const { data, error } = await supabaseServer
    .from('caption_jobs')
    .insert({
      variant_id: args.variantId,
      source_type: args.sourceType,
      source_id: args.sourceId,
      platform: args.platform,
      format: args.format,
      external_context: args.externalContext ?? null,
      status: 'queued',
    })
    .select('id')
    .single<{ id: string }>();
  if (error) {
    // Non-fatal: caption stays = defaultCaption (template). Log + continue.
    console.error('[draftBuilder] enqueueCaptionJob failed:', error.message);
    return null;
  }
  return data?.id ?? null;
}

/* ──────────────────────────────────────────────────────────────────
   Recipe selector — sceglie la pipeline asset in base al format
   ────────────────────────────────────────────────────────────────── */

interface JobRecipe {
  recipe: 'sharp_text_overlay' | 'remotion_render' | 'interview_story_video';
  recipe_params: Record<string, unknown>;
}

/** Sceglie recipe + params per il social_asset_jobs in base al format Composer. */
function buildJobRecipe(args: {
  format: FormatKey;
  socialFormat: SocialFormat;
  sourceUrl: string;
  title: string;
  /** Quando la sorgente è una pill, passa il payload stat per routare a
   *  PillStatVideo. Se omesso, fallback a MatchScorecardStory. */
  pillStatPayload?: {
    mode?: 'stat' | 'anniversary' | 'year' | 'hero' | 'quote';
    number: number | null;
    numberSuffix: string;
    context: string;
    heroText: string;
    eyebrow?: string;
    payoff?: string;
    category: string | null;
  };
  /** Quando passato, il daemon chiama il Content Director Ollama. */
  pillId?: string;
  /** Episode source: alternativa a pillId. Daemon usa adapter
   *  episodeToFacts + stesso pipeline storyboard. */
  episodeId?: string;
  /** Format dell'episodio (content_episodes.format_id) — usato per scegliere
   *  composition dedicata. Es. 'match-reaction' → InterviewStoryVideo. */
  episodeFormat?: string;
}): JobRecipe {
  const { format, socialFormat, sourceUrl, title, pillStatPayload, pillId, episodeId, episodeFormat } = args;

  // Story video / Reel video → Remotion.
  // Routing:
  //   - match-reaction / press-conference → InterviewStoryVideo (Fase 2,
  //     3-scene cinematic con Whisper quote + face frame + audio originale).
  //     Recipe DEDICATA `interview_story_video` (non remotion_render diretto)
  //     perché il daemon deve orchestrare frame extractor + Whisper + quote
  //     engine + waveform PRIMA di chiamare il renderer.
  //   - Pill (pillStatPayload) → AIDirectedStoryVideo (Caso C stat).
  //   - Altri episode → AIDirectedStoryVideo card promo (Fase 1).
  //   - Fallback → MatchScorecardStory.
  if (format === 'story_video' || format === 'reel') {
    // Match-reaction / press-conference → pipeline cinematic Fase 2
    if (episodeId && (episodeFormat === 'match-reaction' || episodeFormat === 'press-conference')) {
      return {
        recipe: 'interview_story_video',
        recipe_params: {
          episodeId,
          episodeFormat,
          // sourceUrl qui = thumbnail; daemon recupera video reale dal DB
          // (content_episodes.hls_url) per frame extraction + audio.
          fallbackThumbnailUrl: sourceUrl,
        },
      };
    }
    // Episode generico → AIDirectedStoryVideo card promo Fase 1
    if (episodeId) {
      return {
        recipe: 'remotion_render',
        recipe_params: {
          compositionId: 'AIDirectedStoryVideo',
          inputProps: {
            // Defaults che il daemon sovrascrive con storyboard generato
            scenes: [],
            imageUrl: sourceUrl,
            imageStrategy: 'ken-burns-zoom-in',
            tone: 'factual',
            category: 'episode',
          },
          episodeId,
        },
      };
    }
    if (pillStatPayload) {
      // NEW (2026-05-13): per le pill usiamo AIDirectedStoryVideo (pipeline
      // 3-step storyboard scene-by-scene). PillStatVideo resta come legacy
      // fallback se il daemon non riesce a generare storyboard.
      return {
        recipe: 'remotion_render',
        recipe_params: {
          compositionId: 'AIDirectedStoryVideo',
          inputProps: {
            mode: pillStatPayload.mode ?? 'stat',
            number: pillStatPayload.number,
            numberSuffix: pillStatPayload.numberSuffix,
            context: pillStatPayload.context,
            heroText: pillStatPayload.heroText,
            eyebrow: pillStatPayload.eyebrow ?? '',
            payoff: pillStatPayload.payoff ?? '',
            category: pillStatPayload.category ?? 'numeri',
            // sourceUrl per pill = pill.image_url → background atmosphere.
            // Composition lo opacizza + applica vignette per preservare
            // il focus su numero/headline.
            imageUrl: sourceUrl,
          },
          // Quando il daemon vede pillId, chiama il Content Director
          // (Ollama gemma3) per riformulare/dirigere la pill semanticamente.
          // Se LLM fallisce, i valori regex pre-computati nei inputProps
          // restano e l'asset esce comunque (no rotture).
          pillId,
        },
      };
    }
    return {
      recipe: 'remotion_render',
      recipe_params: {
        compositionId: 'MatchScorecardStory',
        inputProps: {
          heroPhotoUrl: sourceUrl,
          resultLabel: title.length > 0 ? title.split(/[.!?]/)[0].trim().toUpperCase() : 'LAVIKA',
        },
      },
    };
  }

  // Tutti gli altri (feed_post, story image, square, ...) → Sharp text overlay
  return {
    recipe: 'sharp_text_overlay',
    recipe_params: {
      sourceUrl,
      format: socialFormat,
      title,
    },
  };
}

/* ──────────────────────────────────────────────────────────────────
   Build draft from pill
   ────────────────────────────────────────────────────────────────── */

interface PillRow {
  id: string;
  title: string;
  content: string | null;
  type: string;
  pill_category: string | null;
  image_url: string | null;
  video_url: string | null;
}

export async function buildDraftFromPill(opts: BuildDraftFromPillOpts): Promise<BuildDraftResult> {
  if (!supabaseServer) throw new Error('Supabase not configured');
  if (!opts.pillId) throw new Error('pillId required');
  if (!Array.isArray(opts.variants) || opts.variants.length === 0) {
    throw new Error('At least one variant required');
  }

  // 1. Fetch pill
  const { data: pill, error: pErr } = await supabaseServer
    .from('pills')
    .select('id, title, content, type, pill_category, image_url, video_url')
    .eq('id', opts.pillId)
    .single<PillRow>();

  if (pErr || !pill) throw new Error(`Pill non trovata: ${opts.pillId} (${pErr?.message ?? 'no row'})`);
  if (!pill.image_url) throw new Error('Pill non ha image_url — impossibile generare asset');

  // 2. Headline asset = override utente OR split editoriale automatico OR titolo intero.
  //    splitEditorialTitle ritorna identity se ≤ 60 char. La caption usa SEMPRE
  //    il titolo originale (anche se headline è splittata).
  const assetHeadline = (opts.headlineOverride && opts.headlineOverride.trim().length > 0)
    ? opts.headlineOverride.trim()
    : splitEditorialTitle(pill.title).headline;

  // 2.5 Stat payload — usato per routare le variant story_video/reel verso
  //     la composition PillStatVideo (numero counter-up + contesto gold).
  //     Categoria pill (numeri/storia) determina il "tono" della motion graphics.
  const statPayload = {
    ...extractStatFromPill({ title: pill.title, content: pill.content, pill_category: pill.pill_category }),
    category: pill.pill_category,
  };

  // Default caption (placeholder — AI lo migliorerà nello Step "Brand")
  const defaultCaption = `${pill.title}\n\n#Lavika #ForzaCatania #SerieC`;

  // 3. Insert draft
  const { data: draft, error: dErr } = await supabaseServer
    .from('social_drafts')
    .insert({
      source_type: 'pill',
      source_id: opts.pillId,
      title: opts.title ?? `Pill: ${pill.title}`,
      status: 'review',
      requires_approval: true,
      created_by: opts.createdBy ?? null,
      campaign_id: opts.campaignId ?? null,
    })
    .select('id')
    .single<{ id: string }>();

  if (dErr || !draft) throw new Error(`Insert draft failed: ${dErr?.message}`);

  // 4. Insert variants + jobs
  const variantIds: string[] = [];
  const jobIds: string[] = [];

  for (const variantSpec of opts.variants) {
    const socialFormat = resolveSocialFormat(variantSpec.platform, variantSpec.format);

    const { data: variant, error: vErr } = await supabaseServer
      .from('social_variants')
      .insert({
        draft_id: draft.id,
        platform: variantSpec.platform,
        format: variantSpec.format,
        caption: variantSpec.caption ?? defaultCaption,
        scheduled_at: variantSpec.scheduledAt ?? null,
        status: 'asset_pending',
      })
      .select('id')
      .single<{ id: string }>();

    if (vErr || !variant) {
      // Rollback by deleting draft (cascade removes other variants)
      await supabaseServer.from('social_drafts').delete().eq('id', draft.id);
      throw new Error(`Insert variant failed: ${vErr?.message}`);
    }
    variantIds.push(variant.id);

    // Insert asset job (recipe scelto in base al format).
    // title = headline visiva asset (può essere override / splittata),
    // NON il pill.title intero che resta nella caption.
    // statPayload viene passato sempre: il routing decide se usarlo
    // (story_video/reel → PillStatVideo) o ignorarlo (image formats).
    const jobRecipe = buildJobRecipe({
      format: variantSpec.format,
      socialFormat,
      sourceUrl: pill.image_url,
      title: assetHeadline,
      pillStatPayload: statPayload,
      pillId: pill.id,
    });
    const { data: job, error: jErr } = await supabaseServer
      .from('social_asset_jobs')
      .insert({
        variant_id: variant.id,
        recipe: jobRecipe.recipe,
        recipe_params: jobRecipe.recipe_params,
        status: 'queued',
      })
      .select('id')
      .single<{ id: string }>();

    if (jErr || !job) {
      await supabaseServer.from('social_drafts').delete().eq('id', draft.id);
      throw new Error(`Insert job failed: ${jErr?.message}`);
    }
    jobIds.push(job.id);

    // Enqueue caption-engine job (Ollama on-premise, daemon Mac).
    // La defaultCaption resta come fallback temporaneo: il daemon sovrascrive
    // social_variants.caption con il hook generato + hashtag tier-based.
    // Vedi docs/social-engine/00-overview.md.
    await enqueueCaptionJob({
      variantId: variant.id,
      sourceType: 'pill',
      sourceId: opts.pillId,
      platform: variantSpec.platform,
      format: variantSpec.format,
    });
  }

  return {
    draftId: draft.id,
    variantIds,
    jobIds,
    variantsCount: variantIds.length,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Build draft from episode (placeholder — usa episode thumbnail come image)
   ────────────────────────────────────────────────────────────────── */

interface EpisodeRow {
  id: string;
  title: string | null;
  format_id: string;
  thumbnail_url: string | null;
  match_id: string | null;
}

export async function buildDraftFromEpisode(opts: {
  episodeId: string;
  variants: VariantSpec[];
  title?: string;
  createdBy?: string;
}): Promise<BuildDraftResult> {
  if (!supabaseServer) throw new Error('Supabase not configured');

  const { data: ep, error: eErr } = await supabaseServer
    .from('content_episodes')
    .select(`id, title, format_id, thumbnail_url, match_id, duration_secs,
             speaker:players!speaker_id(id, full_name),
             match:matches!match_id(id, kickoff_at, matchday,
               home_team:teams!matches_home_team_id_fkey(normalized_name, short_name),
               away_team:teams!matches_away_team_id_fkey(normalized_name, short_name))`)
    .eq('id', opts.episodeId)
    .single<EpisodeRow>();

  if (eErr || !ep) throw new Error(`Episode non trovato: ${opts.episodeId}`);
  // thumbnail_url serve solo per asset image (sharp_text_overlay).
  // story_video / reel usano hls_url server-side → thumbnail opzionale.
  const needsThumbnail = opts.variants.some(
    (v) => v.format !== 'story_video' && v.format !== 'reel',
  );
  if (needsThumbnail && !ep.thumbnail_url) {
    throw new Error('Episode non ha thumbnail_url — impossibile generare asset image');
  }

  const epTitle = ep.title || ep.id;
  const defaultCaption = `${epTitle}\n\nGuarda il video sull'app Lavika.\n#Lavika #ForzaCatania #SerieC`;

  const { data: draft, error: dErr } = await supabaseServer
    .from('social_drafts')
    .insert({
      source_type: 'episode',
      source_id: opts.episodeId,
      title: opts.title ?? `Episode: ${epTitle}`,
      status: 'review',
      requires_approval: true,
      created_by: opts.createdBy ?? null,
    })
    .select('id')
    .single<{ id: string }>();

  if (dErr || !draft) throw new Error(`Insert draft failed: ${dErr?.message}`);

  const variantIds: string[] = [];
  const jobIds: string[] = [];

  for (const v of opts.variants) {
    const socialFormat = resolveSocialFormat(v.platform, v.format);

    const { data: variant, error: vErr } = await supabaseServer
      .from('social_variants')
      .insert({
        draft_id: draft.id,
        platform: v.platform,
        format: v.format,
        caption: v.caption ?? defaultCaption,
        scheduled_at: v.scheduledAt ?? null,
        status: 'asset_pending',
      })
      .select('id')
      .single<{ id: string }>();

    if (vErr || !variant) {
      await supabaseServer.from('social_drafts').delete().eq('id', draft.id);
      throw new Error(`Insert variant failed: ${vErr?.message}`);
    }
    variantIds.push(variant.id);

    const jobRecipe = buildJobRecipe({
      format: v.format,
      socialFormat,
      // thumbnail può essere null per format video — il daemon usa hls_url internamente
      sourceUrl: ep.thumbnail_url ?? '',
      title: epTitle,
      // story_video/reel → daemon usa episodeToFacts adapter + storyboard AI
      episodeId: opts.episodeId,
      // Format episodio per routing (match-reaction → InterviewStoryVideo Fase 2)
      episodeFormat: ep.format_id,
    });
    const { data: job, error: jErr } = await supabaseServer
      .from('social_asset_jobs')
      .insert({
        variant_id: variant.id,
        recipe: jobRecipe.recipe,
        recipe_params: jobRecipe.recipe_params,
        status: 'queued',
      })
      .select('id')
      .single<{ id: string }>();

    if (jErr || !job) {
      await supabaseServer.from('social_drafts').delete().eq('id', draft.id);
      throw new Error(`Insert job failed: ${jErr?.message}`);
    }
    jobIds.push(job.id);

    // Enqueue caption-engine job (parallelo all'asset job).
    await enqueueCaptionJob({
      variantId: variant.id,
      sourceType: 'episode',
      sourceId: opts.episodeId,
      platform: v.platform,
      format: v.format,
    });
  }

  return {
    draftId: draft.id,
    variantIds,
    jobIds,
    variantsCount: variantIds.length,
  };
}
