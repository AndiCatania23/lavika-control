/**
 * Remotion programmatic renderer — chiamato dal daemon Mac.
 *
 * Usa @remotion/bundler + @remotion/renderer per renderizzare una
 * composition come MP4. NIENTE CLI overhead.
 *
 * Bundle è cached su disk (in-memory map) — primo render ~10-15s di
 * bundling, successivi ~3-5s solo render.
 *
 * NOTA: NON importare da Vercel — questa libreria usa Chromium headless
 * (via @remotion/renderer) e NON gira in serverless. Solo per il daemon Mac.
 */

import path from 'path';
import { mkdir, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

/* ──────────────────────────────────────────────────────────────────
   Bundle cache (one bundle per process lifetime — daemon long-running)
   ────────────────────────────────────────────────────────────────── */

let bundlePromise: Promise<string> | null = null;

async function getBundleLocation(): Promise<string> {
  if (bundlePromise) return bundlePromise;
  bundlePromise = bundle({
    entryPoint: path.resolve(process.cwd(), 'src/video/index.ts'),
    webpackOverride: (config) => config,
    publicDir: path.resolve(process.cwd(), 'public'),
  });
  return bundlePromise;
}

/* ──────────────────────────────────────────────────────────────────
   Render
   ────────────────────────────────────────────────────────────────── */

export interface RenderOpts {
  /** Composition id registered in src/video/Root.tsx (e.g. 'MatchScorecard') */
  compositionId: string;
  /** Props passed to the composition. Validated by zod schema if defined. */
  inputProps?: Record<string, unknown>;
  /** Override default width/height — useful for multi-format from one composition */
  width?: number;
  height?: number;
}

export interface RenderedVideo {
  buffer: Buffer;
  mime: 'video/mp4';
  width: number;
  height: number;
  durationFrames: number;
  fps: number;
  format: string;
  renderedTitle: null;
  renderedLines: string[];
}

export async function renderRemotionComposition(opts: RenderOpts): Promise<RenderedVideo> {
  const { compositionId, inputProps = {}, width, height } = opts;

  const serveUrl = await getBundleLocation();

  // Pick composition + inject overrides
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  });

  const finalWidth  = width  ?? composition.width;
  const finalHeight = height ?? composition.height;

  // Output to tmp file (renderMedia requires file output, then we read it)
  const outDir = path.join(tmpdir(), 'lavika-remotion');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${compositionId}-${Date.now()}.mp4`);

  await renderMedia({
    composition: { ...composition, width: finalWidth, height: finalHeight },
    serveUrl,
    codec: 'h264',
    outputLocation: outFile,
    inputProps,
    pixelFormat: 'yuv420p',
    chromiumOptions: {
      gl: 'angle',  // GPU acceleration via ANGLE on macOS
    },
  });

  const buffer = await readFile(outFile);
  // Cleanup tmp file
  try { await unlink(outFile); } catch { /* ignore */ }

  return {
    buffer,
    mime: 'video/mp4',
    width: finalWidth,
    height: finalHeight,
    durationFrames: composition.durationInFrames,
    fps: composition.fps,
    format: `${finalWidth}x${finalHeight}`,
    renderedTitle: null,
    renderedLines: [],
  };
}
