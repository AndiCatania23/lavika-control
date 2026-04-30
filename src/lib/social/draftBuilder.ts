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
   Recipe selector — sceglie la pipeline asset in base al format
   ────────────────────────────────────────────────────────────────── */

interface JobRecipe {
  recipe: 'sharp_text_overlay' | 'remotion_render';
  recipe_params: Record<string, unknown>;
}

/** Sceglie recipe + params per il social_asset_jobs in base al format Composer. */
function buildJobRecipe(args: {
  format: FormatKey;
  socialFormat: SocialFormat;
  sourceUrl: string;
  title: string;
}): JobRecipe {
  const { format, socialFormat, sourceUrl, title } = args;

  // Story video / Reel video → Remotion. Default composition: MatchScorecardStory
  // (NOTA: pensata per match results, ma usata anche per pill in attesa della
  // composition generica `PillStoryVideo`. Step futuro nel piano social.)
  if (format === 'story_video' || format === 'reel') {
    return {
      recipe: 'remotion_render',
      recipe_params: {
        compositionId: 'MatchScorecardStory',
        // inputProps minimi: il component usa defaultProps per i campi non passati
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
    const jobRecipe = buildJobRecipe({
      format: variantSpec.format,
      socialFormat,
      sourceUrl: pill.image_url,
      title: assetHeadline,
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
    .select('id, title, format_id, thumbnail_url, match_id')
    .eq('id', opts.episodeId)
    .single<EpisodeRow>();

  if (eErr || !ep) throw new Error(`Episode non trovato: ${opts.episodeId}`);
  if (!ep.thumbnail_url) {
    throw new Error('Episode non ha thumbnail_url — impossibile generare asset');
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
      sourceUrl: ep.thumbnail_url,
      title: epTitle,
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
  }

  return {
    draftId: draft.id,
    variantIds,
    jobIds,
    variantsCount: variantIds.length,
  };
}
