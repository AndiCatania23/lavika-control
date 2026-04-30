/**
 * Social asset builder — genera asset image per i social platforms.
 *
 * Pattern: smart crop sulla cover originale (preserva soggetto centrale,
 * bias verso l'alto per lasciare spazio al testo) + overlay testo
 * "highlight bianco-su-nero" stile MLS in basso.
 *
 * Output: JPEG ottimizzati per IG/FB (compatibilità garantita, no WebP).
 *
 * Formati supportati:
 *   ig_feed_4_5     1080x1350  (IG Feed default — verticale 4:5)
 *   ig_square_1_1   1080x1080  (IG Feed quadrato)
 *   ig_story_9_16   1080x1920  (IG Story / Reel cover)
 *   fb_feed_4_5     1080x1350  (FB Feed default — verticale 4:5)
 *   fb_square_1_1   1080x1080  (FB Feed quadrato)
 *   fb_story_9_16   1080x1920  (FB Story)
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

/* ──────────────────────────────────────────────────────────────────
   Format catalog
   ────────────────────────────────────────────────────────────────── */

export type SocialFormat =
  | 'ig_feed_4_5'
  | 'ig_square_1_1'
  | 'ig_story_9_16'
  | 'fb_feed_4_5'
  | 'fb_square_1_1'
  | 'fb_story_9_16';

interface FormatSpec {
  width: number;
  height: number;
  /** Title font size in pixels */
  titleFontSize: number;
  /** Title max chars per line (approx) */
  titleMaxCharsPerLine: number;
  /** Title max total chars (truncate with … if longer) */
  titleMaxTotalChars: number;
  /** Vertical bias for smart crop: 0=top, 0.5=center, 1=bottom. Lower = subject higher up. */
  cropVerticalBias: number;
  /** Padding around text boxes */
  textPaddingX: number;
  textPaddingY: number;
  /** Distance of text block from bottom edge */
  textBottomMargin: number;
  /** Line spacing between text lines (px between rectangles) */
  lineGap: number;
}

const FORMAT_SPECS: Record<SocialFormat, FormatSpec> = {
  ig_feed_4_5: {
    width: 1080, height: 1350,
    titleFontSize: 72, titleMaxCharsPerLine: 22, titleMaxTotalChars: 70,
    cropVerticalBias: 0.35,
    textPaddingX: 24, textPaddingY: 16,
    textBottomMargin: 48, lineGap: 8,
  },
  ig_square_1_1: {
    width: 1080, height: 1080,
    titleFontSize: 64, titleMaxCharsPerLine: 24, titleMaxTotalChars: 56,
    cropVerticalBias: 0.4,
    textPaddingX: 24, textPaddingY: 14,
    textBottomMargin: 40, lineGap: 8,
  },
  ig_story_9_16: {
    width: 1080, height: 1920,
    titleFontSize: 80, titleMaxCharsPerLine: 22, titleMaxTotalChars: 110,
    cropVerticalBias: 0.3,
    textPaddingX: 32, textPaddingY: 18,
    textBottomMargin: 220,  // safe-area UI Story (logo profilo, tap, swipe)
    lineGap: 10,
  },
  fb_feed_4_5: {
    width: 1080, height: 1350,
    titleFontSize: 72, titleMaxCharsPerLine: 22, titleMaxTotalChars: 70,
    cropVerticalBias: 0.35,
    textPaddingX: 24, textPaddingY: 16,
    textBottomMargin: 48, lineGap: 8,
  },
  fb_square_1_1: {
    width: 1080, height: 1080,
    titleFontSize: 64, titleMaxCharsPerLine: 24, titleMaxTotalChars: 56,
    cropVerticalBias: 0.4,
    textPaddingX: 24, textPaddingY: 14,
    textBottomMargin: 40, lineGap: 8,
  },
  fb_story_9_16: {
    width: 1080, height: 1920,
    titleFontSize: 80, titleMaxCharsPerLine: 22, titleMaxTotalChars: 110,
    cropVerticalBias: 0.3,
    textPaddingX: 32, textPaddingY: 18,
    textBottomMargin: 220,
    lineGap: 10,
  },
};

/* ──────────────────────────────────────────────────────────────────
   Font registration via @napi-rs/canvas (Skia-based, reliable)
   Registered once at module load time.

   Anton: Google Fonts free, condensed bold display. Sostituisce
   Archivo Black come font display ufficiale LAVIKA per mega-title
   sportivi. Vedi `social-brand-book.md` § 11 (Visual Direction).
   ────────────────────────────────────────────────────────────────── */

const TITLE_FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Anton-Regular.ttf');
const TITLE_FONT_FAMILY = 'Anton';

let fontRegistered = false;
function ensureFontRegistered() {
  if (fontRegistered) return;
  GlobalFonts.registerFromPath(TITLE_FONT_PATH, TITLE_FONT_FAMILY);
  fontRegistered = true;
}

/* ──────────────────────────────────────────────────────────────────
   Logo watermark (PNG) — caricato una volta, riusato per ogni asset

   Default: lavika-wordmark-white.png (47KB).
   Posizione: angolo basso destro post 4:5/1:1, angolo basso centro
   nelle Story 9:16 (per evitare safe-area UI Story).
   ────────────────────────────────────────────────────────────────── */

const WATERMARK_PATH = path.join(process.cwd(), 'public', 'brand', 'logo', 'lavika-wordmark-white.png');

let watermarkBuffer: Buffer | null = null;
function getWatermarkBuffer(): Buffer {
  if (watermarkBuffer) return watermarkBuffer;
  if (!fs.existsSync(WATERMARK_PATH)) {
    throw new Error(`Watermark logo not found at ${WATERMARK_PATH}`);
  }
  watermarkBuffer = fs.readFileSync(WATERMARK_PATH);
  return watermarkBuffer;
}

interface WatermarkPlacement {
  /** Width in px (height auto-calc preserve aspect ratio) */
  width: number;
  /** Margin from edges in px */
  marginX: number;
  marginY: number;
  /** Anchor: 'bottom-right' for posts, 'bottom-center' for stories */
  anchor: 'bottom-right' | 'bottom-center';
  /** Opacity 0-1 (PNG alpha multiplier) */
  opacity: number;
}

function getWatermarkPlacement(format: SocialFormat): WatermarkPlacement {
  const isStory = format.endsWith('_9_16');
  if (isStory) {
    return {
      width: 200,
      marginX: 0,
      marginY: 80, // sopra safe-area UI bottom Story
      anchor: 'bottom-center',
      opacity: 0.85,
    };
  }
  // Feed posts (4:5, 1:1)
  return {
    width: 140,
    marginX: 32,
    marginY: 32,
    anchor: 'bottom-right',
    opacity: 0.85,
  };
}

/**
 * Render the watermark layer (resized + opacity adjusted) ready to be
 * composited onto the final image.
 */
async function renderWatermarkLayer(
  format: SocialFormat,
  spec: FormatSpec,
): Promise<{ buffer: Buffer; top: number; left: number }> {
  const placement = getWatermarkPlacement(format);
  const sourceLogo = getWatermarkBuffer();

  // Resize logo to target width + apply opacity
  const resized = await sharp(sourceLogo)
    .resize({ width: placement.width })
    .ensureAlpha()
    // Multiply alpha channel by opacity
    .composite([{
      input: Buffer.from([255, 255, 255, Math.round(placement.opacity * 255)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const wmW = meta.width ?? placement.width;
  const wmH = meta.height ?? Math.round(placement.width * 0.3);

  let left = 0;
  if (placement.anchor === 'bottom-right') {
    left = spec.width - wmW - placement.marginX;
  } else {
    // bottom-center
    left = Math.round((spec.width - wmW) / 2);
  }
  const top = spec.height - wmH - placement.marginY;

  return { buffer: resized, top, left };
}

/* ──────────────────────────────────────────────────────────────────
   Title truncation + line wrapping
   ────────────────────────────────────────────────────────────────── */

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Wrap title to lines, **punctuation-aware**:
 *
 *  1. Spezza il titolo in frasi su `.`, `!`, `?` (punteggiatura forte).
 *     Ogni frase parte su una nuova riga → il punto fermo non viene mai
 *     spezzato nel mezzo di una riga (era il problema visibile sui post
 *     reali tipo "Catania. Sicilia che / non molla.").
 *  2. Per ogni frase, se entra in una sola riga (≤ maxCharsPerLine) la
 *     teniamo intera. Altrimenti word-wrap interno classico.
 *  3. Stop a maxLines (default 3); il resto viene troncato con `…`.
 */
function wrapTitle(text: string, maxCharsPerLine: number, maxLines = 3): string[] {
  // Split sentences keeping trailing punctuation. Lookbehind: split AFTER `.`/`!`/`?`
  // followed by whitespace — così "Catania. Sicilia" → ["Catania.", "Sicilia"]
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const lines: string[] = [];

  outer: for (const sentence of sentences) {
    if (lines.length >= maxLines) break;

    // Frase corta → una sola riga
    if (sentence.length <= maxCharsPerLine) {
      lines.push(sentence);
      continue;
    }

    // Frase lunga → word-wrap interno
    const words = sentence.split(/\s+/);
    let current = '';
    for (const word of words) {
      const next = current ? current + ' ' + word : word;
      if (next.length <= maxCharsPerLine) {
        current = next;
      } else {
        if (current) {
          lines.push(current);
          if (lines.length >= maxLines) { current = ''; break outer; }
        }
        // Parola sola più lunga della riga → hard-break
        if (word.length > maxCharsPerLine) {
          lines.push(word.slice(0, maxCharsPerLine - 1) + '…');
          current = '';
        } else {
          current = word;
        }
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
  }

  // Più contenuto di quanto encodato → ellissi sull'ultima riga
  if (lines.length >= maxLines) {
    const totalUsed = lines.join(' ').length;
    if (totalUsed < text.length - 2) {
      const last = lines[lines.length - 1];
      if (!/[…!?.]$/.test(last)) {
        lines[lines.length - 1] = last.slice(0, Math.max(0, last.length - 1)) + '…';
      }
    }
  }

  return lines;
}

/* ──────────────────────────────────────────────────────────────────
   Text overlay rendering — Sharp native text input (uses Pango + FontConfig)
   Builds: array of {textPng, width, height, leftPadding} per line
   ────────────────────────────────────────────────────────────────── */

interface RenderedTextLine {
  textPng: Buffer;
  textWidth: number;
  textHeight: number;
}

/**
 * Render single-line text via @napi-rs/canvas (Skia, full TTF support via
 * GlobalFonts.registerFromPath). Returns RGBA PNG with WHITE text on
 * transparent background, sized to the text bounding box.
 */
function renderTextLine(text: string, fontSize: number): RenderedTextLine {
  ensureFontRegistered();

  // First pass: measure text with a temp canvas
  const measureCanvas = createCanvas(10, 10);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSize}px "${TITLE_FONT_FAMILY}"`;
  const metrics = measureCtx.measureText(text);

  const textWidth = Math.ceil(metrics.width);
  // Use actual ascent + descent for vertical sizing (more reliable than
  // estimating from fontSize alone, especially for Archivo Black's
  // generous metrics).
  const ascent  = metrics.actualBoundingBoxAscent  || fontSize * 0.85;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25;
  const textHeight = Math.ceil(ascent + descent);

  // Second pass: actual canvas with exact dimensions, draw white text
  const canvas = createCanvas(textWidth, textHeight);
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px "${TITLE_FONT_FAMILY}"`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 0, ascent);

  return {
    textPng: canvas.toBuffer('image/png'),
    textWidth,
    textHeight,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Smart crop + overlay composition
   ────────────────────────────────────────────────────────────────── */

export interface BuildAssetOpts {
  /** Public URL of source image (cover pill, episode thumbnail, etc.) */
  sourceUrl: string;
  /** Target social format */
  format: SocialFormat;
  /** Title text to overlay (highlight white-on-black, bottom). If empty, no overlay. */
  title?: string;
}

export interface BuiltAsset {
  buffer: Buffer;
  mime: 'image/jpeg';
  width: number;
  height: number;
  format: SocialFormat;
  /** Title actually rendered (after truncation/wrapping) */
  renderedTitle: string | null;
  renderedLines: string[];
}

export async function buildSocialAsset(opts: BuildAssetOpts): Promise<BuiltAsset> {
  const spec = FORMAT_SPECS[opts.format];
  if (!spec) throw new Error(`Formato non supportato: ${opts.format}`);

  // 1. Download source image
  const res = await fetch(opts.sourceUrl);
  if (!res.ok) throw new Error(`Impossibile scaricare sourceUrl: HTTP ${res.status}`);
  const sourceBuffer = Buffer.from(await res.arrayBuffer());

  // 2. Smart crop with vertical bias
  // We use Sharp's resize with position: 'attention' for smart subject detection,
  // then re-crop with vertical bias toward top to leave room for text.
  const sourceMeta = await sharp(sourceBuffer).metadata();
  if (!sourceMeta.width || !sourceMeta.height) {
    throw new Error('Impossibile leggere dimensioni sourceUrl');
  }

  // Step 2a: resize source to cover target ratio.
  //
  // History of attempts:
  //  - 'attention' strategy: distratta dai pattern grafici asimmetrici
  //    delle cover Lavika (linee/puntini decorativi a sinistra) → crop
  //    finiva a sinistra perdendo il soggetto.
  //  - 'entropy' strategy: preferisce zone ad alta texture (stadio,
  //    folla) → crop tendeva a centrarsi sullo sfondo perdendo il
  //    soggetto principale che ha entropia media (pelle uniforme).
  //
  // Le pill cover Lavika hanno il soggetto SEMPRE centrato per design.
  // Quindi crop geometrico CENTRATO è la scelta corretta. Più predictable
  // di qualsiasi smart crop su questo dataset specifico.
  const resized = await sharp(sourceBuffer)
    .resize(spec.width, spec.height, {
      fit: 'cover',
      position: 'centre',
    })
    .toBuffer();

  // Step 2b: optionally re-shift the crop window upward.
  // Sharp's "attention" strategy already centers on subject; we apply a soft
  // upward shift only if source is wide-ish landscape (16:9 or wider).
  const sourceAspect = sourceMeta.width / sourceMeta.height;
  const targetAspect = spec.width / spec.height;
  let cropped = resized;

  if (sourceAspect > targetAspect * 1.4) {
    // Source much wider than target → attention crops to subject area in middle.
    // Shift crop upward: extract spec.width × (spec.height) but offset top by bias.
    // Re-do crop manually for vertical bias control.
    const scaleFactor = spec.width / sourceMeta.width;
    const scaledHeight = Math.round(sourceMeta.height * scaleFactor);
    // If scaledHeight >= spec.height, we have room to bias
    if (scaledHeight >= spec.height) {
      // Re-render: scale to spec.width then crop with custom top
      const intermediate = await sharp(sourceBuffer)
        .resize(spec.width, null, { fit: 'inside' })
        .toBuffer();
      const intermediateMeta = await sharp(intermediate).metadata();
      if (intermediateMeta.height && intermediateMeta.height > spec.height) {
        const maxTop = intermediateMeta.height - spec.height;
        const top = Math.round(maxTop * spec.cropVerticalBias);
        cropped = await sharp(intermediate)
          .extract({ left: 0, top, width: spec.width, height: spec.height })
          .toBuffer();
      }
    }
  }

  // 3. Build text overlay if title present
  let title = opts.title?.trim();
  let renderedTitle: string | null = null;
  let renderedLines: string[] = [];

  let composed = cropped;
  if (title && title.length > 0) {
    title = truncate(title, spec.titleMaxTotalChars);
    renderedTitle = title;
    renderedLines = wrapTitle(title, spec.titleMaxCharsPerLine);

    if (renderedLines.length > 0) {
      // Render each line via @napi-rs/canvas (Skia, true Archivo Black)
      const lineRenders = renderedLines.map(line => renderTextLine(line, spec.titleFontSize));

      // Compute total block height and starting Y
      const lineHeights = lineRenders.map(r => r.textHeight + spec.textPaddingY * 2);
      const totalBlockH = lineHeights.reduce((sum, h) => sum + h, 0)
        + (lineRenders.length - 1) * spec.lineGap;
      const blockTopY = spec.height - spec.textBottomMargin - totalBlockH;

      // Build composite layers: for each line, a black rect + white text
      const composites: sharp.OverlayOptions[] = [];
      let currentY = blockTopY;

      for (let i = 0; i < lineRenders.length; i++) {
        const { textPng, textWidth, textHeight } = lineRenders[i];
        const rectWidth = textWidth + spec.textPaddingX * 2;
        const rectHeight = textHeight + spec.textPaddingY * 2;

        // Black rect (full opaque)
        const rectSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rectWidth}" height="${rectHeight}"><rect width="${rectWidth}" height="${rectHeight}" fill="black"/></svg>`;
        composites.push({
          input: Buffer.from(rectSvg),
          top: currentY,
          left: 0,
        });

        // White text on top of rect, centered vertically inside it
        composites.push({
          input: textPng,
          top: currentY + spec.textPaddingY,
          left: spec.textPaddingX,
        });

        currentY += rectHeight + spec.lineGap;
      }

      composed = await sharp(cropped).composite(composites).toBuffer();
    }
  }

  // 3.5. Watermark layer — overlay logo LAVIKA su tutti gli asset
  try {
    const wm = await renderWatermarkLayer(opts.format, spec);
    composed = await sharp(composed)
      .composite([{ input: wm.buffer, top: wm.top, left: wm.left }])
      .toBuffer();
  } catch (e) {
    // Watermark missing è non-fatal: log e continua. Asset esce senza brand.
    console.warn('[assetBuilder] Watermark skipped:', e);
  }

  // 4. Output JPEG (mandatory for IG, lighter for all platforms).
  //
  // CRITICAL: BASELINE JPEG, no progressive. Instagram Content Publish API
  // rifiuta progressive JPEG con error 9004 ("Only photo or video can be
  // accepted as media type"). Quindi NIENTE mozjpeg (forza progressive
  // hardcoded), usiamo libjpeg-turbo standard con baseline esplicito.
  const finalBuffer = await sharp(composed)
    .jpeg({ quality: 92, progressive: false, chromaSubsampling: '4:2:0' })
    .toBuffer();

  return {
    buffer: finalBuffer,
    mime: 'image/jpeg',
    width: spec.width,
    height: spec.height,
    format: opts.format,
    renderedTitle,
    renderedLines,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Format catalog export (for UI / API validation)
   ────────────────────────────────────────────────────────────────── */

export const SOCIAL_FORMATS: Array<{
  id: SocialFormat;
  label: string;
  aspect: string;
  width: number;
  height: number;
  platform: 'ig' | 'fb';
}> = [
  { id: 'ig_feed_4_5',   label: 'IG Feed (4:5)',   aspect: '4:5',  width: 1080, height: 1350, platform: 'ig' },
  { id: 'ig_square_1_1', label: 'IG Quadrato',     aspect: '1:1',  width: 1080, height: 1080, platform: 'ig' },
  { id: 'ig_story_9_16', label: 'IG Story',        aspect: '9:16', width: 1080, height: 1920, platform: 'ig' },
  { id: 'fb_feed_4_5',   label: 'FB Feed (4:5)',   aspect: '4:5',  width: 1080, height: 1350, platform: 'fb' },
  { id: 'fb_square_1_1', label: 'FB Quadrato',     aspect: '1:1',  width: 1080, height: 1080, platform: 'fb' },
  { id: 'fb_story_9_16', label: 'FB Story',        aspect: '9:16', width: 1080, height: 1920, platform: 'fb' },
];
