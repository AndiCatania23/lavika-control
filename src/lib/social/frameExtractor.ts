import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';

/* ──────────────────────────────────────────────────────────────────
   frameExtractor — wrapper TS dello script Python OpenCV

   Estrae dal video sorgente il frame "migliore" per la Scene 1 di
   InterviewStoryVideo (background quote). Sotto il cofano:
     ~/LAVIKA-SPORT/venv/bin/python3
        repos/control/scripts/python/extract_best_face_frame.py
        --input <url> --output <tmp.png>

   Restituisce il buffer PNG (per upload R2 dal daemon) + metadata.
   Se Python script fallisce / non trova frame validi, ritorna null
   → il daemon usa il fallback gradient della composition (graceful).
   ────────────────────────────────────────────────────────────────── */

const VENV_PYTHON =
  process.env.LAVIKA_VENV_PYTHON ??
  '/Users/andreafailla/LAVIKA-SPORT/venv/bin/python3';

const SCRIPT_PATH =
  process.env.FACE_FRAME_SCRIPT ??
  '/Users/andreafailla/LAVIKA-SPORT/repos/control/scripts/python/extract_best_face_frame.py';

export interface FrameExtractionInfo {
  best_path: string;
  score: number;
  sampled: number;
  faces_in_best: number;
  face_area_pct: number;
  fallback_to_sharpness_only: boolean;
  video_duration_s: number;
}

export interface FrameExtractionResult {
  buffer: Buffer;
  info: FrameExtractionInfo;
}

export interface ExtractBestFaceFrameOptions {
  /** Numero di sample da analizzare (default 30). */
  samples?: number;
  /** Start time in seconds (default 0). */
  startSec?: number;
  /** End time in seconds (default video end). 0 = video duration. */
  endSec?: number;
  /** Timeout massimo in ms (default 90s — su HLS remoto può essere lento). */
  timeoutMs?: number;
  /** Unique id per nome file temporaneo (es. job.id). */
  jobId?: string;
}

export async function extractBestFaceFrame(
  videoUrl: string,
  opts: ExtractBestFaceFrameOptions = {},
): Promise<FrameExtractionResult | null> {
  const id = opts.jobId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputPath = join(tmpdir(), `lavika-face-${id}.png`);

  const args = [
    SCRIPT_PATH,
    '--input', videoUrl,
    '--output', outputPath,
    '--samples', String(opts.samples ?? 30),
  ];
  if (opts.startSec) args.push('--start', String(opts.startSec));
  if (opts.endSec) args.push('--end', String(opts.endSec));

  const result = await new Promise<{ code: number; stdout: string; stderr: string } | null>((resolve) => {
    const proc = spawn(VENV_PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (v: { code: number; stdout: string; stderr: string } | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => settle({ code: code ?? -1, stdout, stderr }));
    proc.on('error', () => settle(null));

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      settle(null);
    }, opts.timeoutMs ?? 90_000);
    proc.on('close', () => clearTimeout(timer));
  });

  if (!result || result.code !== 0) {
    // Cleanup eventuale file parziale
    await unlink(outputPath).catch(() => {});
    return null;
  }

  let info: FrameExtractionInfo;
  try {
    info = JSON.parse(result.stdout) as FrameExtractionInfo;
  } catch {
    await unlink(outputPath).catch(() => {});
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(outputPath);
  } catch {
    return null;
  }
  // File temporaneo non più necessario dopo lettura
  await unlink(outputPath).catch(() => {});

  return { buffer, info };
}
