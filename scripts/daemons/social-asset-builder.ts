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
import { directVideoLayout } from '../../src/lib/social/pillContentDirector';
import { extractFactsFromPill } from '../../src/lib/social/pillFactExtractor';
import { classifyNarrative, generateStoryboard, validateStoryboard } from '../../src/lib/social/pillStoryboardBuilder';
import { episodeToFacts, formatLabel as episodeFormatLabel } from '../../src/lib/social/episodeFactAdapter';
import { selectQuoteFromSegments, durationSecondsToFrames, type WhisperSegment } from '../../src/lib/social/quoteEngine';
import { whisperTranscribe } from '../../src/lib/social/whisperTranscribe';
import { extractBestFaceFrame } from '../../src/lib/social/frameExtractor';
import { cutAudioSegment, cutVideoSegment, generateWaveformPng } from '../../src/lib/social/ffmpegPipeline';
import { resolveBestHlsVariant } from '../../src/lib/social/hlsVariant';
import { splitPillToCarousel } from '../../src/lib/social/pillCarouselSplitter';
import { buildCarouselSlide } from '../../src/lib/social/carouselSlideBuilder';

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
const R2_PUBLIC_BASE    = (process.env.MEDIA_PUBLIC_BASE_URL ?? 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev').replace(/\/$/, '');

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
  /** Metadata LLM Content Director (solo PillStatVideo). Va nel asset_meta. */
  llm_meta?: {
    mode?: string;
    tone?: string;
    shareability_score?: number;
    shareability_factors?: string[];
    rationale?: string;
  };
  /** Multi-slide output (carousel pill). Quando popolato, processJob fa
   *  upload R2 di ogni slide e popola social_variants.asset_urls TEXT[].
   *  buffer/mime principali = primary asset (slides[0]). */
  slides?: Array<{ buffer: Buffer; mime: string }>;
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
      const p = params as {
        compositionId: string;
        inputProps?: Record<string, unknown>;
        width?: number;
        height?: number;
        /** Quando presente, il daemon chiama il Content Director (Ollama)
         *  per riformulare e dirigere il layout PRIMA di renderizzare.
         *  Se LLM fallisce, fallback agli inputProps regex già passati. */
        pillId?: string;
      };

      let finalInputProps = p.inputProps ?? {};
      let directorMeta: RecipeResult['llm_meta'] | undefined;

      // ── AIDirectedStoryVideo per EPISODI (no LLM extraction, adapter
      //    deterministico episodeToFacts. Solo Step 3 LLM (storyboard).
      const episodeId = (params as { episodeId?: string }).episodeId;
      if (p.compositionId === 'AIDirectedStoryVideo' && episodeId) {
        try {
          log('AI-Director-v2 EPISODE: fetching', { episodeId });
          const { data: ep } = await supabase
            .from('content_episodes')
            .select(`id, title, format_id, thumbnail_url, duration_secs,
                     speaker:players!speaker_id(id, full_name),
                     match:matches!match_id(id, kickoff_at, matchday,
                       home_team:teams!matches_home_team_id_fkey(normalized_name, short_name),
                       away_team:teams!matches_away_team_id_fkey(normalized_name, short_name))`)
            .eq('id', episodeId)
            .single();
          if (!ep) throw new Error('episode not found');

          // Step 1: facts deterministico (NO LLM call — risparmio 15s)
          const facts = episodeToFacts(ep as Parameters<typeof episodeToFacts>[0]);
          log('AI-Director-v2 EPISODE: facts adapted (deterministic)', {
            speaker: facts.speaker,
            teams: facts.teams,
            secondary: facts.secondary_phrase,
          });

          // Step 2: classifica come "news" se ha speaker (quote-like), altrimenti "narrative"
          // Step 3: storyboard via LLM
          const t0 = Date.now();
          const cls = facts.speaker ? 'news' : 'narrative';
          const storyboard = await generateStoryboard({ facts, classification: cls });
          const t1 = Date.now();

          const validation = validateStoryboard({
            storyboard,
            facts,
            title: (ep as { title?: string }).title ?? '',
          });
          log('AI-Director-v2 EPISODE: storyboard done', {
            storyboard_ms: t1 - t0,
            scenes: storyboard.scenes.length,
            grounding_pct: validation.grounding_pct,
          });

          finalInputProps = {
            scenes: storyboard.scenes,
            imageUrl: (ep as { thumbnail_url?: string | null }).thumbnail_url ?? undefined,
            imageStrategy: storyboard.image_strategy,
            tone: storyboard.tone,
            category: episodeFormatLabel((ep as { format_id?: string | null }).format_id ?? null),
          } as Record<string, unknown>;
          directorMeta = {
            mode: storyboard.narrative_type,
            tone: storyboard.tone,
            shareability_score: storyboard.shareability_score,
            shareability_factors: [],
            rationale: storyboard._rationale,
          };
        } catch (e) {
          log('AI-Director-v2 EPISODE failed, using defaults', { err: (e as Error).message });
        }
      } else if (p.compositionId === 'AIDirectedStoryVideo' && p.pillId) {
        try {
          log('AI-Director-v2: fetching pill', { pillId: p.pillId });
          const { data: pill } = await supabase
            .from('pills')
            .select('title, content, pill_category, image_url')
            .eq('id', p.pillId)
            .single<{ title: string; content: string | null; pill_category: string | null; image_url: string | null }>();
          if (!pill) throw new Error('pill not found');

          const t0 = Date.now();
          log('AI-Director-v2: Step 1 extract facts');
          const facts = await extractFactsFromPill({ title: pill.title, content: pill.content });
          const t1 = Date.now();

          log('AI-Director-v2: Step 2 classify');
          const narrativeType = classifyNarrative(facts);

          log('AI-Director-v2: Step 3 generate storyboard', { type: narrativeType });
          const storyboard = await generateStoryboard({ facts, classification: narrativeType });
          const t2 = Date.now();

          const validation = validateStoryboard({ storyboard, facts, title: pill.title });
          log('AI-Director-v2: Step 4 validate', {
            extract_ms: t1 - t0,
            storyboard_ms: t2 - t1,
            grounding_pct: validation.grounding_pct,
            total_duration: validation.total_duration,
            warnings: validation.warnings,
          });

          finalInputProps = {
            scenes: storyboard.scenes,
            imageUrl: pill.image_url || undefined,
            imageStrategy: storyboard.image_strategy,
            tone: storyboard.tone,
            category: pill.pill_category ?? 'storia',
          } as Record<string, unknown>;
          directorMeta = {
            mode: storyboard.narrative_type,
            tone: storyboard.tone,
            shareability_score: storyboard.shareability_score,
            shareability_factors: [],
            rationale: storyboard._rationale,
          };
        } catch (e) {
          log('AI-Director-v2 failed, using defaults', { err: (e as Error).message });
        }
      } else if (p.compositionId === 'PillStatVideo' && p.pillId) {
        try {
          log('content director: fetching pill (Ollama gemma3 LOADING)', { pillId: p.pillId });
          const { data: pill, error: pErr } = await supabase
            .from('pills')
            .select('title, content, pill_category, image_url')
            .eq('id', p.pillId)
            .single<{ title: string; content: string | null; pill_category: string | null; image_url: string | null }>();

          if (pErr || !pill) {
            log('content director: pill not found, using regex fallback', { pillId: p.pillId, err: pErr?.message });
          } else {
            const t0 = Date.now();
            const director = await directVideoLayout({
              title: pill.title,
              content: pill.content,
              pill_category: pill.pill_category,
            });
            // ── Regex pattern STRONG (quote, anniversary) sono AUTHORITATIVE ──
            // gemma3:12b ha tendenza a non riconoscere bene questi pattern
            // (es. mette "hero" invece di "quote" su "Gasparin avverte: «...»").
            // Quando il regex ha già identificato un pattern strong, il regex
            // VINCE sul mode/heroText/eyebrow. L'LLM contribuisce solo con
            // shareability score / tone / payoff (per anniversary) / rationale.
            const regexMode = finalInputProps.mode as string | undefined;
            const isStrongPattern = regexMode === 'quote' || regexMode === 'anniversary';
            const finalMode = isStrongPattern
              ? regexMode!
              : (director.mode === 'achievement' ? 'stat' : director.mode);

            log('content director: done (Ollama UNLOADING in background)', {
              ms: Date.now() - t0,
              regex_mode: regexMode,
              llm_mode: director.mode,
              final_mode: finalMode,
              authoritative: isStrongPattern ? 'regex' : 'llm',
              tone: director.tone,
              shareability: director.shareability_score,
              factors: director.shareability_factors,
              rationale: director._rationale,
            });

            finalInputProps = {
              ...finalInputProps,
              mode: finalMode,
              // Per pattern strong (quote/anniversary) il regex pre-fill vince
              // su number/eyebrow/heroText/context/payoff. Per stat/hero/year
              // l'LLM è authoritative.
              number: isStrongPattern ? finalInputProps.number : director.number,
              numberSuffix: isStrongPattern ? finalInputProps.numberSuffix : director.numberSuffix,
              eyebrow: isStrongPattern ? finalInputProps.eyebrow : director.eyebrow,
              heroText: isStrongPattern ? finalInputProps.heroText : director.heroText,
              context: isStrongPattern ? finalInputProps.context : director.context,
              // Payoff: LLM può raffinarlo per anniversary (es. punteggiatura);
              // per quote resta sempre vuoto (no payoff visivo nel quote layout)
              payoff: regexMode === 'quote' ? '' : (director.payoff || finalInputProps.payoff),
              _llm_director_done: true,
              _llm_tone: director.tone,
              _llm_shareability_score: director.shareability_score,
              _llm_shareability_factors: director.shareability_factors,
              _llm_rationale: director._rationale,
            };
            directorMeta = {
              mode: director.mode,
              tone: director.tone,
              shareability_score: director.shareability_score,
              shareability_factors: director.shareability_factors,
              rationale: director._rationale,
            };
          }
        } catch (e) {
          // LLM down/timeout → log e continua con regex fallback.
          // Asset uscirà comunque ma con regex extractor (no rotture).
          log('content director: failed, regex fallback', { err: (e as Error).message });
        }
      }

      const video = await renderRemotionComposition({
        compositionId: p.compositionId,
        inputProps:    finalInputProps,
        width:         p.width,
        height:        p.height,
      });
      return { ...(video as RecipeResult), llm_meta: directorMeta };
    }
    case 'interview_story_video': {
      /* ──────────────────────────────────────────────────────────────────
         Story Video Fase 2 — match-reaction cinematic 3-scene.

         Orchestrazione:
         1. Fetch episode + match data dal DB
         2. [TODO Whisper] Trascrivi audio → segments
         3. selectQuoteFromSegments → quote + verb + start/end
         4. [TODO OpenCV] Estrai face frame migliore dal video
         5. [TODO FFmpeg] Cut audio segment + genera waveform PNG
         6. Render Remotion InterviewStoryVideo

         GRACEFUL FALLBACK: ogni step opzionale può fallire; la composition
         renderizza comunque con default sani (placeholder face, waveform
         animata, audio off). Il primo render produce già qualcosa di
         significativo (intro VS + match data + episode mockup) anche se
         Whisper/OpenCV/FFmpeg non sono ancora installati lato Mac.
         ────────────────────────────────────────────────────────────────── */
      const p = params as {
        episodeId: string;
        episodeFormat: string;
        fallbackThumbnailUrl?: string;
      };

      log('interview_story_video: fetching episode', { episodeId: p.episodeId });
      const { data: ep, error: epErr } = await supabase
        .from('content_episodes')
        .select(`id, title, format_id, thumbnail_url, hls_url, duration_secs, published_at,
                 speaker:players!speaker_id(id, full_name),
                 match:matches!match_id(id, kickoff_at, matchday, home_score, away_score, venue,
                   home_team:teams!matches_home_team_id_fkey(normalized_name, short_name, logo_url),
                   away_team:teams!matches_away_team_id_fkey(normalized_name, short_name, logo_url))`)
        .eq('id', p.episodeId)
        .single();

      if (epErr || !ep) {
        throw new Error(`interview_story_video: episode ${p.episodeId} not found: ${epErr?.message}`);
      }
      const videoUrl = (ep as { hls_url: string | null }).hls_url;
      if (!videoUrl) {
        log('interview_story_video: no hls_url, will run in graceful fallback mode');
      }

      // Build matchData dal join (fallback sicuro se match non collegato)
      type EpMatch = {
        home_score: number | null; away_score: number | null;
        venue: string | null;
        home_team: { normalized_name: string; short_name: string | null; logo_url: string | null } | null;
        away_team: { normalized_name: string; short_name: string | null; logo_url: string | null } | null;
      };
      const m = (ep as { match: EpMatch | null }).match;
      const matchData = m && m.home_team && m.away_team ? {
        home: {
          name: m.home_team.normalized_name,
          shortName: m.home_team.short_name ?? undefined,
          logoUrl: m.home_team.logo_url ?? undefined,
        },
        away: {
          name: m.away_team.normalized_name,
          shortName: m.away_team.short_name ?? undefined,
          logoUrl: m.away_team.logo_url ?? undefined,
        },
        homeScore: m.home_score ?? 0,
        awayScore: m.away_score ?? 0,
        stadium: m.venue ?? undefined,
        competition: 'Serie C',
      } : {
        // Fallback senza match: usa nome generico Catania vs avversario indeterminato
        home: { name: 'CATANIA', shortName: 'CAT' },
        away: { name: 'AVVERSARIO', shortName: 'AVV' },
        homeScore: 0,
        awayScore: 0,
      };

      const epTitle = (ep as { title: string }).title;

      // ── Pipeline reale (Whisper + quote + face + audio + waveform) ──
      // Ogni step degrada con grazia: se fallisce, log e si va avanti.
      // La composition usa fallback sani per i campi optional mancanti.

      let quote = epTitle;
      let verbToHighlight: string | undefined;
      let quoteDurationFrames = 240; // 8s default
      let quoteClipUrl: string | undefined;
      let faceFrameUrl: string | undefined;
      let audioUrl: string | undefined;
      let waveformPngUrl: string | undefined;
      let segmentStart = 0;
      let segmentEnd = 8;
      // Sub-segments del quote in coordinate ASSOLUTE (dal video sorgente).
      // Vengono shiftate a coordinate RELATIVE al clip prima del passaggio
      // a Remotion (sotto, in inputProps). Default vuoto → Remotion userà
      // il fallback testo statico se la lista è vuota.
      let quoteSubSegmentsAbs: Array<{ start: number; end: number; text: string }> = [];

      if (videoUrl) {
        // Step 2: Whisper transcribe — TRIM ai primi 180s.
        // Reasoning: il quote killer in match-reaction/press-conference è quasi
        // sempre nei primi 3 minuti (giocatore risponde alle prime domande
        // "come va", "che partita è stata" → frase forte). Trim evita timeout
        // su interviste lunghe 8-15 min (vedi caso Viali fallito).
        // Caturano: quote a 53s, Toscano: quote a 162s, entrambi entro 180s.
        const WHISPER_TRIM_SEC = 180;
        log('interview_story_video: starting Whisper transcribe', {
          model: 'large-v3', trimSec: WHISPER_TRIM_SEC,
        });
        const t0 = Date.now();
        // Retry con backoff: Whisper può fallire in modo transient quando
        // l'HLS è stato appena caricato (segmenti non ancora propagati su CDN,
        // ffmpeg timeout di lettura). Senza retry il job procede a renderizzare
        // un video vuoto (no clip/audio/face), come è successo per Forte
        // 11:22 UTC del 18-05-2026 (fail in 4s).
        let transcript = null as Awaited<ReturnType<typeof whisperTranscribe>>;
        const WHISPER_MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= WHISPER_MAX_ATTEMPTS; attempt++) {
          transcript = await whisperTranscribe(videoUrl, { endSec: WHISPER_TRIM_SEC });
          if (transcript) break;
          if (attempt < WHISPER_MAX_ATTEMPTS) {
            const backoffMs = 3000 * attempt; // 3s, 6s
            log('interview_story_video: Whisper attempt failed, retrying', { attempt, backoffMs });
            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }
        if (transcript) {
          log('interview_story_video: Whisper done', {
            ms: Date.now() - t0,
            segments: transcript.segments.length,
            language: transcript.language,
            duration_s: transcript.duration,
          });

          // Step 3: quote selection (Ollama gemma3 + fallback regex)
          const selected = await selectQuoteFromSegments(transcript.segments, { useLLM: true });
          if (selected) {
            quote = selected.quote;
            verbToHighlight = selected.verbToHighlight;
            // Salva sub-segments per il rendering karaoke (timestamps assoluti,
            // shiftati a relativi sotto prima di inviarli al Remotion).
            quoteSubSegmentsAbs = selected.subSegments;

            // Cap hard del testo overlay a 90 caratteri. Anche con MAX_QUOTE_SEC=8
            // un parlatore veloce può infilare 100+ caratteri, e il render
            // Remotion (font Display 78px su 960px di larghezza) li trasforma
            // in 6+ righe che riempiono la story. Tronchiamo all'ultimo spazio
            // entro 90 char e aggiungiamo "..." per indicare continuazione.
            // L'AUDIO resta integrale (8s del clip) — è solo il testo visivo
            // ad essere accorciato. Trade-off accettabile: il tifoso ascolta
            // la frase completa, vede una sintesi leggibile.
            const QUOTE_TEXT_MAX_CHARS = 90;
            if (quote.length > QUOTE_TEXT_MAX_CHARS) {
              const cutAt = quote.slice(0, QUOTE_TEXT_MAX_CHARS).lastIndexOf(' ');
              const safeCut = cutAt > QUOTE_TEXT_MAX_CHARS / 2 ? cutAt : QUOTE_TEXT_MAX_CHARS;
              quote = quote.slice(0, safeCut).trim().replace(/[.,;:]+$/, '') + '…';
            }
            // Padding HEAD + TAIL + estensione min 4s.
            //
            // HEAD (-700ms): parte il clip un attimo prima dell'inizio frase →
            // vedi il personaggio respirare/iniziare a parlare naturalmente.
            // Più cinematico, lascia anche all'animazione Anton del testo
            // entrare senza essere già in sync con l'audio.
            //
            // TAIL (+500ms): Whisper segment.end è spesso prima della fine
            // reale del fonema → tail extra per "metabolizzare" la frase.
            //
            // Se naturalDur padded < 4s → estendo il cut a 4s prendendo
            // more video dopo la frase. No freeze frame, il giocatore
            // continua il moto naturale.
            //
            // Cap superiore 12s per non sforare Story IG (totale ~15.5s).
            const QUOTE_HEAD_PADDING_SEC = 0.7;
            const QUOTE_TAIL_PADDING_SEC = 0.5;
            const MIN_QUOTE_SEC = 4;
            // 8s cap (era 12s): a 12s il quote può arrivare a 110-130
            // caratteri, che con font Display 78px su viewport 1080×1920
            // (zona quote ~960×400px) genera 8-10 righe di testo che
            // riempiono tutta la story. A 8s la frase tipica resta sotto
            // gli 80 caratteri → 4-5 righe leggibili.
            const MAX_QUOTE_SEC = 8;
            const paddedStart = Math.max(0, selected.segmentStart - QUOTE_HEAD_PADDING_SEC);
            const paddedEnd = selected.segmentEnd + QUOTE_TAIL_PADDING_SEC;
            const naturalDur = paddedEnd - paddedStart;
            const targetDur = Math.min(MAX_QUOTE_SEC, Math.max(naturalDur, MIN_QUOTE_SEC));
            segmentStart = paddedStart;
            segmentEnd = paddedStart + targetDur;
            quoteDurationFrames = durationSecondsToFrames(segmentEnd - segmentStart);
            log('interview_story_video: quote selected', {
              source: selected.source,
              verb: verbToHighlight,
              start: segmentStart,
              end: segmentEnd,
              durFrames: quoteDurationFrames,
              preview: quote.slice(0, 60),
            });
          } else {
            // Quote engine ha scartato tutti i segment (filtri troppo strict).
            // Fallback: usa titolo come quote MA spostiamo segmentStart a 15s
            // per evitare di catturare l'audio della presentazione del
            // giornalista nell'apertura del video.
            log('interview_story_video: quote engine returned null, using title fallback + skip 15s');
            segmentStart = 15;
            segmentEnd = 23;
          }
        } else {
          log('interview_story_video: Whisper transcribe failed/timeout, using title fallback');
          // Euristica: la prima domanda del giornalista occupa ~15s ad apertura
          // intervista. Senza Whisper non sappiamo dove inizia la risposta del
          // giocatore → skip i primi 15s del video per evitare di catturare
          // l'audio della domanda nel clip Scene 1.
          segmentStart = 15;
          segmentEnd = 23; // 8s di clip a partire da 15s
        }

        // Risolvi HLS master → variant 720p per i step visivi (clip + face).
        // Whisper resta sull'URL originale (audio invariato).
        // FFmpeg by default sceglie il primo variant elencato (spesso 360p
        // per fast startup) — forziamo 720p per qualità Story decente.
        const visualUrl = await resolveBestHlsVariant(videoUrl, 720);
        if (visualUrl !== videoUrl) {
          log('interview_story_video: resolved HLS variant for visuals', { visualUrl });
        }

        // Step 4a: video clip cut del segment del quote (NUOVO — visual key)
        // Mostra il giocatore che parla nel video finale. L'audio è incluso
        // nel clip MP4 stesso (no <Audio> separato necessario).
        //
        // Retry 3x con backoff: stesso pattern di Whisper. Caso reale
        // Toscano 11:49 UTC del 18-05-2026: tutti e 3 gli step ffmpeg
        // (cut, face, audio) hanno fallito istantaneamente — probabile
        // glitch transient di rete sul TS della HLS. Senza retry il
        // daemon proseguiva fino al render Remotion con hasQuoteClip:false
        // → MP4 di 3.7MB con solo gradient/testo, niente video/audio.
        // Se anche dopo 3 retry fallisce, ABORT del job (throw) invece
        // di renderizzare un video vuoto: l'utente vede status=failed
        // e può rilanciare con clarity.
        let clipCut = null as Awaited<ReturnType<typeof cutVideoSegment>>;
        const CLIP_MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= CLIP_MAX_ATTEMPTS; attempt++) {
          clipCut = await cutVideoSegment(visualUrl, segmentStart, segmentEnd, {
            jobId: p.episodeId,
          });
          if (clipCut) break;
          if (attempt < CLIP_MAX_ATTEMPTS) {
            const backoffMs = 2500 * attempt; // 2.5s, 5s
            log('interview_story_video: video clip cut attempt failed, retrying', {
              attempt, backoffMs,
            });
            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }
        if (!clipCut) {
          throw new Error(
            'interview_story_video: video clip cut failed after 3 attempts — refusing to render empty story video',
          );
        }
        const clipKey = `social/_assets/${p.episodeId}/clip-${Date.now()}.mp4`;
        quoteClipUrl = await uploadToR2(clipKey, clipCut.buffer, 'video/mp4');
        log('interview_story_video: quote clip uploaded', {
          durationSec: clipCut.durationSec,
          kb: Math.round(clipCut.buffer.byteLength / 1024),
          url: quoteClipUrl,
        });

        // Step 4b: face frame extraction come fallback statico (solo se clip mancante)
        const frameRes = await extractBestFaceFrame(visualUrl, {
          jobId: p.episodeId,
          startSec: segmentStart,
          endSec: segmentEnd,
          samples: 20,
        });
        if (frameRes) {
          const faceKey = `social/_assets/${p.episodeId}/face-${Date.now()}.png`;
          faceFrameUrl = await uploadToR2(faceKey, frameRes.buffer, 'image/png');
          log('interview_story_video: face frame uploaded', {
            faces: frameRes.info.faces_in_best,
            score: frameRes.info.score,
            fallback: frameRes.info.fallback_to_sharpness_only,
            url: faceFrameUrl,
          });
        } else {
          log('interview_story_video: face extraction failed, composition will use gradient fallback');
        }

        // Step 5: audio segment cut + waveform
        const audioCut = await cutAudioSegment(videoUrl, segmentStart, segmentEnd, {
          jobId: p.episodeId,
        });
        if (audioCut) {
          const audioKey = `social/_assets/${p.episodeId}/audio-${Date.now()}.mp3`;
          audioUrl = await uploadToR2(audioKey, audioCut.buffer, 'audio/mpeg');
          log('interview_story_video: audio segment uploaded', {
            durationSec: audioCut.durationSec,
            kb: Math.round(audioCut.buffer.byteLength / 1024),
            url: audioUrl,
          });

          // Step 6: waveform PNG dal buffer audio (no re-download)
          const wave = await generateWaveformPng(audioCut.buffer, { jobId: p.episodeId });
          if (wave) {
            const waveKey = `social/_assets/${p.episodeId}/wave-${Date.now()}.png`;
            waveformPngUrl = await uploadToR2(waveKey, wave, 'image/png');
            log('interview_story_video: waveform uploaded', {
              kb: Math.round(wave.byteLength / 1024),
              url: waveformPngUrl,
            });
          }
        } else {
          log('interview_story_video: audio cut failed, no audio in final video');
        }
      } else {
        log('interview_story_video: no video URL, skipping Whisper/OpenCV/FFmpeg pipeline');
        // Fallback ultimo: usa titolo come pseudo-quote (logica originale)
        const durationSecs = (ep as { duration_secs: number | null }).duration_secs ?? 480;
        const pseudoSegments: WhisperSegment[] = [{
          start: 0,
          end: Math.min(durationSecs, 8),
          text: epTitle,
        }];
        const selected = await selectQuoteFromSegments(pseudoSegments, { useLLM: false });
        if (selected) {
          quote = selected.quote;
          verbToHighlight = selected.verbToHighlight;
          quoteDurationFrames = durationSecondsToFrames(selected.segmentEnd - selected.segmentStart);
        }
      }

      // Step 6: Render Remotion InterviewStoryVideo
      const speakerName = (ep as { speaker: { full_name: string } | null }).speaker?.full_name;
      const fmtLabel = p.episodeFormat === 'press-conference' ? 'Press Conference' : 'Match Reaction';
      const fmtSubtitle = p.episodeFormat === 'press-conference' ? 'Conferenza stampa' : 'Interviste post partita';

      // Shift sub-segments a coordinate clip-relative (segmentStart = 0).
      // Il Remotion li riceve come timestamps interni alla durata del clip,
      // così può sincronizzarsi col frame corrente senza sapere il source.
      // Filter: tieni solo quelli che cadono effettivamente dentro al clip
      // (start >= segmentStart && end <= segmentEnd, con tolleranza).
      const quoteSubSegments = quoteSubSegmentsAbs
        .filter((s) => s.end > segmentStart && s.start < segmentEnd)
        .map((s) => ({
          start: Math.max(0, s.start - segmentStart),
          end: Math.min(segmentEnd - segmentStart, s.end - segmentStart),
          text: s.text,
        }));

      const inputProps = {
        matchData,
        episodeFormat: p.episodeFormat as 'match-reaction' | 'press-conference',
        quoteClipUrl,
        faceFrameUrl,
        quote,
        quoteSubSegments,
        verbToHighlight,
        waveformPngUrl,
        audioUrl,
        quoteDurationFrames,
        episodeForMockup: {
          title: speakerName ? `${speakerName}` : epTitle.slice(0, 40),
          thumbnailUrl: (ep as { thumbnail_url: string | null }).thumbnail_url ?? p.fallbackThumbnailUrl,
          formatLabel: fmtLabel,
          formatSubtitle: fmtSubtitle,
          publishedRelative: 'oggi',
        },
      };

      log('interview_story_video: rendering Remotion', {
        compositionId: 'InterviewStoryVideo',
        quoteDurationFrames,
        hasQuoteClip: !!quoteClipUrl,
        hasFaceFrame: !!faceFrameUrl,
        hasAudio: !!audioUrl,
        hasWaveform: !!waveformPngUrl,
      });

      const video = await renderRemotionComposition({
        compositionId: 'InterviewStoryVideo',
        inputProps,
      });
      return video as RecipeResult;
    }
    case 'pill_carousel': {
      /* ──────────────────────────────────────────────────────────────────
         Pill Carousel — render N slide PNG 1080×1350 stile La Casa di C
         palette LAVIKA rosso. Split pill.content in chunk + keyword.
         Output: array di slides, processJob fa upload R2 per ognuno.
         ────────────────────────────────────────────────────────────────── */
      const p = params as {
        pillId: string;
        backgroundImageUrl?: string;
      };

      log('pill_carousel: fetching pill', { pillId: p.pillId });
      const { data: pill, error: pErr } = await supabase
        .from('pills')
        .select('title, content, pill_category, image_url')
        .eq('id', p.pillId)
        .single<{ title: string; content: string | null; pill_category: string | null; image_url: string | null }>();

      if (pErr || !pill) {
        throw new Error(`pill_carousel: pill ${p.pillId} not found: ${pErr?.message}`);
      }

      const slidesContent = splitPillToCarousel({ title: pill.title, content: pill.content });
      const bgUrl = p.backgroundImageUrl ?? pill.image_url ?? undefined;

      // isQuote: detect se la pill è una citazione. Due segnali:
      // 1. pill_category esplicito = 'quote'
      // 2. title contiene pattern citazione (es. `Caturano: "abbiamo lottato..."`
      //    o `«frase» — Speaker`)
      const titleRaw = pill.title ?? '';
      const looksLikeQuotePattern = /["«»''""]|[A-Z][a-z]+\s*:\s*/.test(titleRaw);
      const isQuote = pill.pill_category === 'quote' || looksLikeQuotePattern;

      log('pill_carousel: splitting + rendering', {
        slidesCount: slidesContent.length,
        hasBg: !!bgUrl,
        isQuote,
        category: pill.pill_category,
      });

      const renderedSlides: Array<{ buffer: Buffer; mime: string }> = [];
      for (const slide of slidesContent) {
        const buffer = await buildCarouselSlide({
          slide,
          backgroundImageUrl: bgUrl,
          attribution: 'LAVIKA SPORT',
          isQuote,
        });
        renderedSlides.push({ buffer, mime: 'image/png' });
        log('pill_carousel: slide rendered', {
          index: slide.index,
          total: slide.total,
          kb: Math.round(buffer.byteLength / 1024),
        });
      }

      // Primary asset = slide 1 (per backward compat asset_url single-image).
      // processJob legge `slides` e fa upload multi-key + popola asset_urls.
      const primary = renderedSlides[0];
      return {
        buffer: primary.buffer,
        mime: primary.mime,
        width: 1080,
        height: 1350,
        format: '1080x1350-carousel',
        renderedTitle: pill.title,
        renderedLines: slidesContent.map((s) => s.text),
        slides: renderedSlides,
      };
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

    // 2. Upload to R2 with deterministic key.
    // Carousel multi-slide: upload tutte le slide e popola asset_urls TEXT[].
    const ext = asset.mime === 'image/jpeg' ? 'jpg' : asset.mime === 'image/png' ? 'png' : asset.mime === 'video/mp4' ? 'mp4' : 'bin';
    const baseKey = `social/${job.variant_id}/${job.recipe}-${asset.format || 'asset'}`;
    let url: string;
    let assetUrls: string[] | null = null;

    if (asset.slides && asset.slides.length > 1) {
      // Multi-slide: upload ciascuna come slide-N.ext
      const urls: string[] = [];
      for (let i = 0; i < asset.slides.length; i++) {
        const s = asset.slides[i];
        const sExt = s.mime === 'image/jpeg' ? 'jpg' : s.mime === 'image/png' ? 'png' : 'bin';
        const sKey = `${baseKey}-slide-${i + 1}.${sExt}`;
        const sUrl = await uploadToR2(sKey, s.buffer, s.mime);
        urls.push(sUrl);
      }
      url = urls[0];          // primary asset = slide 1
      assetUrls = urls;        // full array per carousel
    } else {
      // Single asset (path classico)
      const key = `${baseKey}.${ext}`;
      url = await uploadToR2(key, asset.buffer, asset.mime);
    }

    // 3. Update social_variants.asset_url + asset_meta + status='asset_ready'
    const { error: vErr } = await supabase
      .from('social_variants')
      .update({
        asset_url: url,
        asset_urls: assetUrls,
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
          slides_count: assetUrls?.length ?? 1,
          // LLM Content Director output (solo PillStatVideo + pill source).
          // Usato dal SMM Night Brief per identificare pill ad alto
          // "sends per reach" potential (IG 2026 ranking signal #1 Mosseri).
          llm: asset.llm_meta ?? null,
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
