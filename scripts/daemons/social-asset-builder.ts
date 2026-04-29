#!/usr/bin/env node
/**
 * social-asset-builder.mjs
 * ────────────────────────────────────────────────────────────────────
 * Mac daemon (launchd KeepAlive). Consuma social_asset_jobs e genera
 * gli asset (image/video) per le varianti social via Sharp / Remotion /
 * FFmpeg, poi upload R2 e aggiorna social_variants.
 *
 * Pattern: clone di notification-worker.mjs.
 *   • Realtime subscription su INSERT in social_asset_jobs
 *   • Polling fallback ogni POLL_INTERVAL_MS
 *   • Claim atomico via RPC claim_social_asset_jobs
 *   • Reclaim automatico job stale > 5 min
 *
 * Recipes supportate:
 *   • sharp_text_overlay  — usa @/lib/social/assetBuilder.buildSocialAsset
 *   • remotion_render     — TODO Step 1.7
 *   • ffmpeg_resize       — TODO future
 *
 * Env required (loaded by wrapper bash):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   WORKER_ID, POLL_INTERVAL_MS, CLAIM_BATCH_SIZE
 * ────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { buildSocialAsset } from '../../src/lib/social/assetBuilder';
import { renderRemotionComposition } from '../../src/lib/social/remotionRenderer';

/* ────────────────────────────── Config ────────────────────────────── */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const WORKER_ID         = process.env.WORKER_ID         || `mac-${process.pid}`;
const POLL_INTERVAL_MS  = parseInt(process.env.POLL_INTERVAL_MS  || '2000', 10);
const CLAIM_BATCH_SIZE  = parseInt(process.env.CLAIM_BATCH_SIZE  || '3',    10);
const MAX_ATTEMPTS      = parseInt(process.env.MAX_ATTEMPTS      || '3',    10);
const R2_BUCKET         = 'lavika-media';
const R2_PUBLIC_BASE    = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('FATAL: R2_* env vars required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

/* ────────────────────────────── Logging ────────────────────────────── */

const log    = (msg: string, extra?: Record<string, unknown>) => console.log(`[${new Date().toISOString()}] [${WORKER_ID}] ${msg}`, extra ? JSON.stringify(extra) : '');
const logErr = (msg: string, extra?: Record<string, unknown>) => console.error(`[${new Date().toISOString()}] [${WORKER_ID}] ERROR ${msg}`, extra ? JSON.stringify(extra) : '');

/* ────────────────────────────── R2 upload ────────────────────────────── */

async function uploadToR2(key: string, buffer: Buffer, mime: string): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mime,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${R2_PUBLIC_BASE}/${key}`;
}

/* ────────────────────────────── Recipe runner ────────────────────────────── */

interface RecipeResult {
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
  format: string;
  renderedTitle: string | null;
  renderedLines: string[];
}

async function runRecipe(recipe: string, params: Record<string, unknown>): Promise<RecipeResult> {
  switch (recipe) {
    case 'sharp_text_overlay': {
      const p = params as { sourceUrl: string; format: import('../../src/lib/social/assetBuilder').SocialFormat; title?: string };
      const asset = await buildSocialAsset({
        sourceUrl: p.sourceUrl,
        format: p.format,
        title: p.title,
      });
      return asset as RecipeResult;
    }
    case 'remotion_render': {
      const p = params as { compositionId: string; inputProps?: Record<string, unknown>; width?: number; height?: number };
      const video = await renderRemotionComposition({
        compositionId: p.compositionId,
        inputProps:    p.inputProps ?? {},
        width:         p.width,
        height:        p.height,
      });
      return video as RecipeResult;
    }
    case 'ffmpeg_resize':
      throw new Error('ffmpeg_resize: NOT YET IMPLEMENTED');
    default:
      throw new Error(`Recipe sconosciuta: ${recipe}`);
  }
}

/* ────────────────────────────── Job processing ────────────────────────────── */

interface QueueJob {
  id: string;
  variant_id: string;
  recipe: string;
  recipe_params: Record<string, unknown>;
  attempts: number;
}

async function processJob(job: QueueJob): Promise<void> {
  const t0 = Date.now();
  log('processing job', { id: job.id, recipe: job.recipe, variant_id: job.variant_id, attempt: job.attempts });

  try {
    // 1. Run recipe → produces { buffer, mime, width, height, format, ... }
    const asset = await runRecipe(job.recipe, job.recipe_params || {});

    // 2. Upload to R2 with deterministic key
    const ext = asset.mime === 'image/jpeg' ? 'jpg' : asset.mime === 'image/png' ? 'png' : asset.mime === 'video/mp4' ? 'mp4' : 'bin';
    const key = `social/${job.variant_id}/${job.recipe}-${asset.format || 'asset'}.${ext}`;
    const url = await uploadToR2(key, asset.buffer, asset.mime);

    // 3. Update social_variants.asset_url + asset_meta + status='asset_ready'
    const { error: vErr } = await supabase
      .from('social_variants')
      .update({
        asset_url: url,
        asset_type: asset.mime?.startsWith('image/') ? 'image' : asset.mime?.startsWith('video/') ? 'video' : null,
        asset_meta: {
          width: asset.width,
          height: asset.height,
          mime: asset.mime,
          rendered_title: asset.renderedTitle ?? null,
          rendered_lines: asset.renderedLines ?? null,
          recipe: job.recipe,
          built_at: new Date().toISOString(),
          built_by: WORKER_ID,
        },
        status: 'asset_ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.variant_id);

    if (vErr) throw new Error(`update social_variants: ${vErr.message}`);

    // 4. Mark job completed
    const { error: jErr } = await supabase
      .from('social_asset_jobs')
      .update({
        status: 'completed',
        result_url: url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (jErr) throw new Error(`update job completed: ${jErr.message}`);

    log('job done', { id: job.id, ms: Date.now() - t0, kb: Math.round(asset.buffer.byteLength / 1024), url });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErr('job failed', { id: job.id, error: errMsg, attempt: job.attempts });

    const finalFail = job.attempts >= MAX_ATTEMPTS;
    await supabase.from('social_asset_jobs').update({
      status: finalFail ? 'failed' : 'queued',  // requeue if attempts left
      error: errMsg,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);

    if (finalFail) {
      // Mark variant as failed too
      await supabase.from('social_variants').update({
        status: 'failed',
        error: `Asset build failed: ${errMsg}`,
        updated_at: new Date().toISOString(),
      }).eq('id', job.variant_id);
    }
  }
}

/* ────────────────────────────── Claim loop ────────────────────────────── */

let processing = false;

async function claimAndProcess() {
  if (processing) return;
  processing = true;
  try {
    const { data: jobs, error } = await supabase.rpc('claim_social_asset_jobs', {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_claimer_id: WORKER_ID,
      p_max_attempts: MAX_ATTEMPTS,
    });

    if (error) {
      logErr('claim_social_asset_jobs', { error: error.message });
      return;
    }

    if (!jobs || jobs.length === 0) return;

    log(`claimed ${jobs.length} job${jobs.length === 1 ? '' : 's'}`);

    // Process serially (Sharp/Remotion are CPU-bound; concurrency could OOM)
    for (const job of jobs) {
      await processJob(job);
    }
  } finally {
    processing = false;
  }
}

/* ────────────────────────────── Realtime subscription ────────────────────────────── */

let realtimeChan = null;

function subscribeRealtime() {
  realtimeChan = supabase
    .channel('social_asset_jobs:queued')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'social_asset_jobs', filter: 'status=eq.queued' },
      () => { claimAndProcess().catch(e => logErr('realtime trigger', { error: e.message })); }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED')             log('realtime subscribed');
      else if (status === 'CHANNEL_ERROR')     logErr('realtime channel error');
      else if (status === 'TIMED_OUT')         logErr('realtime timed out');
      else if (status === 'CLOSED')            log('realtime closed');
    });
}

/* ────────────────────────────── Bootstrap ────────────────────────────── */

async function main() {
  log('starting', { worker_id: WORKER_ID, poll_ms: POLL_INTERVAL_MS, batch: CLAIM_BATCH_SIZE });

  subscribeRealtime();

  // Polling loop (fallback se realtime fallisce, oppure pickup di stale jobs)
  setInterval(() => {
    claimAndProcess().catch(e => logErr('polling tick', { error: e.message }));
  }, POLL_INTERVAL_MS);

  // Initial sweep at boot
  await claimAndProcess();

  log('ready');
}

async function shutdown(signal) {
  log(`shutdown ${signal}`);
  try { if (realtimeChan) await supabase.removeChannel(realtimeChan); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

main().catch(err => { logErr('main crashed', { error: err.message, stack: err.stack }); process.exit(1); });
