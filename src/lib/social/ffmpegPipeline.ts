import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';

/* ──────────────────────────────────────────────────────────────────
   ffmpegPipeline — audio cut + waveform PNG via FFmpeg

   Due funzioni:
   - cutAudioSegment: estrae un range audio dal video sorgente come MP3
   - generateWaveformPng: produce un PNG waveform (showwavespic) per
                          la Scene 1 di InterviewStoryVideo

   FFmpeg è già installato sul Mac (usato dalla pipeline HLS V2 e
   sync). Niente install richiesto.
   ────────────────────────────────────────────────────────────────── */

const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';

interface FfmpegResult {
  ok: boolean;
  /** stderr tail (ultimi ~2KB) — usato per debug quando ok=false. */
  stderr: string;
  /** Exit code o null se killed per timeout/error. */
  exitCode: number | null;
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<FfmpegResult> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrBuf = '';
    const STDERR_MAX = 2048;
    proc.stderr?.on('data', (d) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > STDERR_MAX) {
        stderrBuf = stderrBuf.slice(-STDERR_MAX);
      }
    });
    let settled = false;
    const settle = (r: FfmpegResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    proc.on('close', (code) => settle({ ok: code === 0, stderr: stderrBuf.trim(), exitCode: code }));
    proc.on('error', (err) => settle({ ok: false, stderr: `spawn error: ${err.message}`, exitCode: null }));
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      settle({ ok: false, stderr: `timeout after ${timeoutMs}ms`, exitCode: null });
    }, timeoutMs);
    proc.on('close', () => clearTimeout(timer));
  });
}

/* ──────────────────────────────────────────────────────────────────
   cutAudioSegment — estrae un range audio MP3 dal video sorgente
   ────────────────────────────────────────────────────────────────── */

export interface CutAudioResult {
  buffer: Buffer;
  durationSec: number;
}

export async function cutAudioSegment(
  videoUrl: string,
  startSec: number,
  endSec: number,
  opts: { jobId?: string; timeoutMs?: number; bitrate?: string } = {},
): Promise<CutAudioResult | null> {
  if (endSec <= startSec) return null;
  const id = opts.jobId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputPath = join(tmpdir(), `lavika-audio-${id}.mp3`);

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', startSec.toFixed(3),
    '-to', endSec.toFixed(3),
    '-i', videoUrl,
    '-vn',
    '-acodec', 'libmp3lame',
    '-b:a', opts.bitrate ?? '128k',
    '-ac', '2',  // stereo (mono va comunque, ma stereo preferred per Story)
    outputPath,
  ];

  const result = await runFfmpeg(args, opts.timeoutMs ?? 60_000);
  if (!result.ok) {
    console.error(`[ffmpeg cutAudioSegment] failed (exit=${result.exitCode}): ${result.stderr}`);
    await unlink(outputPath).catch(() => {});
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(outputPath);
  } catch {
    return null;
  }
  await unlink(outputPath).catch(() => {});

  return { buffer, durationSec: endSec - startSec };
}

/* ──────────────────────────────────────────────────────────────────
   cutVideoSegment — estrae un range VIDEO MP4 (con audio) dal sorgente

   Usato per Scene 1 di InterviewStoryVideo: la clip viva del giocatore
   che parla, non solo audio + foto statica. Re-encode forzato per
   garantire keyframe all'inizio (seek-by-time sull'HLS richiede
   re-encode H.264, no stream copy).
   ────────────────────────────────────────────────────────────────── */

export interface CutVideoResult {
  buffer: Buffer;
  durationSec: number;
}

export async function cutVideoSegment(
  videoUrl: string,
  startSec: number,
  endSec: number,
  opts: { jobId?: string; timeoutMs?: number; crf?: number; preset?: string } = {},
): Promise<CutVideoResult | null> {
  if (endSec <= startSec) return null;
  const id = opts.jobId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputPath = join(tmpdir(), `lavika-video-${id}.mp4`);

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', startSec.toFixed(3),       // seek BEFORE input (fast seek)
    '-i', videoUrl,
    '-t', (endSec - startSec).toFixed(3),
    '-c:v', 'libx264',
    '-preset', opts.preset ?? 'veryfast',
    '-crf', String(opts.crf ?? 22),    // 22 = ottima qualità, ~5-8MB per 9s 1080p
    '-c:a', 'aac',
    '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',         // moov atom in testa, streaming-friendly
    outputPath,
  ];

  const result = await runFfmpeg(args, opts.timeoutMs ?? 120_000);
  if (!result.ok) {
    console.error(`[ffmpeg cutVideoSegment] failed (exit=${result.exitCode}): ${result.stderr}`);
    await unlink(outputPath).catch(() => {});
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(outputPath);
  } catch {
    return null;
  }
  await unlink(outputPath).catch(() => {});

  return { buffer, durationSec: endSec - startSec };
}

/* ──────────────────────────────────────────────────────────────────
   generateWaveformPng — produce waveform PNG da audio buffer / URL

   Filter showwavespic con colore rosso Catania. La composition può
   poi applicare gradient CSS overlay rosso→blu per il vibe brand.
   ────────────────────────────────────────────────────────────────── */

export interface WaveformOptions {
  /** Larghezza PNG in pixel. Default 2000 (1080×1920 Story con safe margin). */
  width?: number;
  /** Altezza PNG in pixel. Default 140. */
  height?: number;
  /** Colore primario waveform (FFmpeg syntax). Default rosso Catania. */
  color?: string;
  /** Draw mode: 'full' = pieno, 'scale' = scalato. Default 'full'. */
  draw?: 'full' | 'scale';
  /** Filter mode FFmpeg showwavespic: 'average' (default) / 'peak'. */
  filter?: 'average' | 'peak';
  jobId?: string;
  timeoutMs?: number;
}

export async function generateWaveformPng(
  audioInput: string | Buffer,
  opts: WaveformOptions = {},
): Promise<Buffer | null> {
  const id = opts.jobId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputPath = join(tmpdir(), `lavika-wave-${id}.png`);
  const width = opts.width ?? 2000;
  const height = opts.height ?? 140;
  const color = opts.color ?? '#E40521';
  const draw = opts.draw ?? 'full';
  const filterMode = opts.filter ?? 'peak';

  // Se audioInput è Buffer, scriviamo file temporaneo. Se è URL/path, passiamo diretto.
  let inputPath: string;
  let cleanupInput = false;
  if (Buffer.isBuffer(audioInput)) {
    inputPath = join(tmpdir(), `lavika-wave-in-${id}.mp3`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(inputPath, audioInput);
    cleanupInput = true;
  } else {
    inputPath = audioInput;
  }

  const filter = `showwavespic=s=${width}x${height}:colors=${color}:scale=lin:draw=${draw}:filter=${filterMode}`;
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-filter_complex', filter,
    '-frames:v', '1',
    outputPath,
  ];

  const result = await runFfmpeg(args, opts.timeoutMs ?? 30_000);

  if (cleanupInput) await unlink(inputPath).catch(() => {});
  if (!result.ok) {
    console.error(`[ffmpeg generateWaveformPng] failed (exit=${result.exitCode}): ${result.stderr}`);
    await unlink(outputPath).catch(() => {});
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(outputPath);
  } catch {
    return null;
  }
  await unlink(outputPath).catch(() => {});

  return buffer;
}
