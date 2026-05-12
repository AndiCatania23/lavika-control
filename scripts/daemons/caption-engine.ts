#!/usr/bin/env node
/**
 * caption-engine.ts
 * ────────────────────────────────────────────────────────────────────
 * Mac daemon (launchd KeepAlive). Consuma caption_jobs e genera 3 hook
 * varianti via pipeline anti-hallucination 4-step (Ollama on-premise).
 *
 * Pattern: clone di social-asset-builder.ts.
 *   • Realtime subscription su INSERT in caption_jobs
 *   • Polling fallback ogni POLL_INTERVAL_MS
 *   • Claim atomico via RPC claim_caption_jobs
 *   • Reclaim job stale > 5 min
 *
 * Pipeline per job:
 *   1. Fetch source (pill/episode/match_event)
 *   2. runCaptionEngine() → facts, varianti, validazioni
 *   3. Pick hashtags (deterministic)
 *   4. Persist caption_facts + caption_metadata + caption_validation_log
 *   5. UPDATE social_variants.caption + asset/social_variants.hashtags
 *   6. Mark caption_jobs.status='completed'
 *
 * Env required (loaded by wrapper bash):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OLLAMA_URL (default http://localhost:11434)
 *   WORKER_ID, POLL_INTERVAL_MS, CLAIM_BATCH_SIZE
 * ────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { runCaptionEngine, FALLBACK_HOOK } from '../../src/lib/social/caption/engine';
import { GEN_MODEL, NLI_MODEL, EMB_MODEL } from '../../src/lib/social/caption/ollamaClient';
import { pickHashtags, type HashtagPoolRow, type HashtagPerformanceRow } from '../../src/lib/social/hashtag/picker';
import type {
  CaptionEngineRequest, CaptionSource, Platform, SocialFormat,
} from '../../src/lib/social/caption/types';

/* ────────────────────────────── Config ────────────────────────────── */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WORKER_ID         = process.env.WORKER_ID         || `mac-caption-${process.pid}`;
const POLL_INTERVAL_MS  = parseInt(process.env.POLL_INTERVAL_MS  || '2000', 10);
const CLAIM_BATCH_SIZE  = parseInt(process.env.CLAIM_BATCH_SIZE  || '1',    10);
const MAX_ATTEMPTS      = parseInt(process.env.MAX_ATTEMPTS      || '3',    10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ────────────────────────────── Logging ────────────────────────────── */

const ts = () => new Date().toISOString();
const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(`[${ts()}] [${WORKER_ID}] ${msg}`, extra ? JSON.stringify(extra) : '');
const logErr = (msg: string, extra?: Record<string, unknown>) =>
  console.error(`[${ts()}] [${WORKER_ID}] ERROR ${msg}`, extra ? JSON.stringify(extra) : '');

/* ────────────────────────────── Source fetcher ────────────────────────────── */

async function fetchSource(sourceType: string, sourceId: string): Promise<CaptionSource | null> {
  if (sourceType === 'pill') {
    const { data, error } = await supabase
      .from('pills')
      .select('id, title, content, pill_category')
      .eq('id', sourceId)
      .maybeSingle();
    if (error) throw new Error(`fetch pill: ${error.message}`);
    if (!data) return null;
    return {
      type: 'pill',
      id: data.id,
      title: data.title || '',
      content: data.content || '',
      category: data.pill_category || undefined,
    };
  }
  if (sourceType === 'episode') {
    const { data, error } = await supabase
      .from('content_episodes')
      .select('id, title, description')
      .eq('id', sourceId)
      .maybeSingle();
    if (error) throw new Error(`fetch episode: ${error.message}`);
    if (!data) return null;
    return {
      type: 'episode',
      id: String(data.id),
      title: data.title || '',
      content: data.description || data.title || '',
    };
  }
  // match_event / manual: caller deve passare title/content via job params (future)
  return null;
}

async function fetchHashtagPoolAndPerf(): Promise<{ pool: HashtagPoolRow[]; perf: HashtagPerformanceRow[] }> {
  const [{ data: poolData }, { data: perfData }] = await Promise.all([
    supabase.from('hashtag_pool').select('tag, tier, category, platform, manual_priority, is_active').eq('is_active', true),
    supabase.from('hashtag_performance').select('tag, score').order('week_start', { ascending: false }).limit(500),
  ]);
  return {
    pool: (poolData || []) as HashtagPoolRow[],
    perf: (perfData || []) as HashtagPerformanceRow[],
  };
}

/* ────────────────────────────── Job processing ────────────────────────────── */

interface CaptionQueueJob {
  id: string;
  variant_id: string;
  source_type: string;
  source_id: string;
  platform: string;
  format: string;
  external_context: string | null;
  attempts: number;
}

async function persistFacts(variantId: string, facts: unknown) {
  if (!facts || typeof facts !== 'object') return;
  const f = facts as { entities?: unknown[]; numbers?: unknown[]; key_claim?: string; sentiment?: string; forbidden_claims?: unknown[] };
  await supabase.from('caption_facts').upsert({
    variant_id: variantId,
    allowed_entities: f.entities || [],
    allowed_numbers: f.numbers || [],
    key_claim: f.key_claim || null,
    sentiment: f.sentiment || null,
    forbidden_claims: f.forbidden_claims || [],
    extractor_model: GEN_MODEL,
    raw_response: facts as Record<string, unknown>,
  });
}

async function persistMetadata(variantId: string, result: Awaited<ReturnType<typeof runCaptionEngine>>) {
  const selected = result.selected_idx != null ? result.validations[result.selected_idx] : null;
  const picked = selected ? selected : null;
  const validCount = result.validations.filter((v) => v.all_pass).length;
  await supabase.from('caption_metadata').upsert({
    variant_id: variantId,
    framework: picked?.framework || null,
    hook_type: picked?.framework || null,
    char_count: picked?.hook?.length || null,
    has_emoji: picked ? /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(picked.hook) : null,
    emoji_count: picked ? ((picked.hook.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length) : null,
    has_cta: null,
    variants_generated: result.variants_generated,
    variants_valid: validCount,
    selected_idx: result.selected_idx,
    gen_model: GEN_MODEL,
    gen_temperature: 0.85,
    gen_latency_ms: result.latency_ms.total,
  });
}

async function persistValidationLog(variantId: string, attempt: number, result: Awaited<ReturnType<typeof runCaptionEngine>>) {
  const rows: Array<Record<string, unknown>> = [];
  for (const v of result.validations) {
    for (const [stage, sr] of Object.entries(v.stages)) {
      rows.push({
        variant_id: variantId,
        attempt,
        variant_idx: v.variant_idx,
        hook_text: v.hook,
        framework: v.framework,
        stage,
        passed: sr.passed,
        reject_reason: sr.reason || null,
        metadata: sr.metadata || null,
      });
    }
  }
  if (rows.length === 0) return;
  // Insert in chunks of 100 to avoid huge requests
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await supabase.from('caption_validation_log').insert(chunk);
  }
}

async function processJob(job: CaptionQueueJob): Promise<void> {
  const t0 = Date.now();
  log('processing job', {
    id: job.id, variant_id: job.variant_id,
    source: `${job.source_type}:${job.source_id}`,
    platform: job.platform, format: job.format, attempt: job.attempts,
  });

  try {
    // 1. Fetch source
    const source = await fetchSource(job.source_type, job.source_id);
    if (!source) throw new Error(`source_not_found: ${job.source_type}:${job.source_id}`);
    if (job.external_context) source.external_context = job.external_context;

    // 2. Run engine pipeline (4-step)
    const req: CaptionEngineRequest = {
      variant_id: job.variant_id,
      source,
      platform: job.platform as Platform,
      format: job.format as SocialFormat,
    };
    const result = await runCaptionEngine(req);

    // 3. Persist facts + metadata + validation log
    if (result.facts) await persistFacts(job.variant_id, result.facts);
    await persistMetadata(job.variant_id, result);
    await persistValidationLog(job.variant_id, job.attempts, result);

    // 4. Pick the best hook (selected_idx) or fallback
    let captionText = FALLBACK_HOOK;
    let needsReview = result.fallback_used;
    if (result.selected_idx != null) {
      const picked = result.validations[result.selected_idx];
      captionText = picked.hook;
      needsReview = result.fallback_used || !picked.all_pass;
    }

    // 5. Hashtag picker (deterministico)
    const { pool, perf } = await fetchHashtagPoolAndPerf();
    const hashtagOut = pickHashtags({
      pool, performance: perf,
      platform: job.platform as Platform,
      format: job.format as SocialFormat,
      content_type: source.category || 'flash',
    });
    const captionWithTags = hashtagOut.hashtags.length > 0
      ? `${captionText}\n\n${hashtagOut.hashtags.join(' ')}`
      : captionText;

    // 6. UPDATE social_variants
    const { error: vErr } = await supabase
      .from('social_variants')
      .update({
        caption: captionWithTags,
        hashtags: hashtagOut.hashtags,
        caption_needs_review: needsReview,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.variant_id);
    if (vErr) {
      // If the columns hashtags / caption_needs_review don't yet exist on social_variants,
      // fall back to writing only the caption. This is non-fatal.
      logErr('update social_variants (full) failed, retry minimal', { error: vErr.message });
      const { error: vErr2 } = await supabase
        .from('social_variants')
        .update({ caption: captionWithTags, updated_at: new Date().toISOString() })
        .eq('id', job.variant_id);
      if (vErr2) throw new Error(`update social_variants: ${vErr2.message}`);
    }

    // 7. Mark job done
    await supabase.from('caption_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);

    log('job done', {
      id: job.id, ms: Date.now() - t0,
      generated: result.variants_generated,
      valid: result.validations.filter((v) => v.all_pass).length,
      selected: result.selected_idx,
      fallback: result.fallback_used,
      hashtags_n: hashtagOut.hashtags.length,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logErr('job failed', { id: job.id, error: errMsg, attempt: job.attempts });
    const finalFail = job.attempts >= MAX_ATTEMPTS;
    await supabase.from('caption_jobs').update({
      status: finalFail ? 'failed' : 'queued',
      last_error: errMsg,
      failed_at: finalFail ? new Date().toISOString() : null,
    }).eq('id', job.id);
  }
}

/* ────────────────────────────── Claim loop ────────────────────────────── */

let processing = false;

async function claimAndProcess() {
  if (processing) return;
  processing = true;
  try {
    const { data: jobs, error } = await supabase.rpc('claim_caption_jobs', {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_claimer_id: WORKER_ID,
      p_max_attempts: MAX_ATTEMPTS,
    });
    if (error) { logErr('claim_caption_jobs', { error: error.message }); return; }
    if (!jobs || jobs.length === 0) return;
    log(`claimed ${jobs.length} job${jobs.length === 1 ? '' : 's'}`);
    // Serial: Ollama gemma3 + llama3.1 in pipeline è gia CPU/GPU intensivo
    for (const job of jobs as CaptionQueueJob[]) {
      await processJob(job);
    }
  } finally {
    processing = false;
  }
}

/* ────────────────────────────── Realtime subscription ────────────────────────────── */

let realtimeChan: ReturnType<typeof supabase.channel> | null = null;

function subscribeRealtime() {
  realtimeChan = supabase
    .channel('caption_jobs:queued')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'caption_jobs', filter: 'status=eq.queued' },
      () => { claimAndProcess().catch((e) => logErr('realtime trigger', { error: e instanceof Error ? e.message : String(e) })); },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED')        log('realtime subscribed');
      else if (status === 'CHANNEL_ERROR') logErr('realtime channel error');
      else if (status === 'TIMED_OUT')     logErr('realtime timed out');
      else if (status === 'CLOSED')        log('realtime closed');
    });
}

/* ────────────────────────────── Bootstrap ────────────────────────────── */

async function main() {
  log('starting caption-engine daemon', {
    worker_id: WORKER_ID,
    poll_ms: POLL_INTERVAL_MS,
    batch: CLAIM_BATCH_SIZE,
    gen_model: GEN_MODEL,
    nli_model: NLI_MODEL,
    emb_model: EMB_MODEL,
    keep_alive: process.env.OLLAMA_KEEP_ALIVE || '0',
  });

  // NO warmup: caption-engine processa pacchetti social on-demand (click "Genera"
  // dal Composer). Tra un pacchetto e l'altro possono passare ore: tenere modelli
  // caldi sprecherebbe ~9GB di RAM. Il primo job pagherà ~5s di cold start
  // gemma3 + ~2s llama3.1, accettabile per latenza totale ~38s.
  log('ready (lazy model load on first job)');

  setInterval(() => {
    claimAndProcess().catch((e) => logErr('polling tick', { error: e instanceof Error ? e.message : String(e) }));
  }, POLL_INTERVAL_MS);
  await claimAndProcess();
}

async function shutdown(signal: string) {
  log(`shutdown ${signal}`);
  try { if (realtimeChan) await supabase.removeChannel(realtimeChan); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((e) => {
  logErr('fatal', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
