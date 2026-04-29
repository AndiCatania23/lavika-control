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
import { readFile } from 'fs/promises';
import path from 'path';

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
   Font loading (Inter Black via base64 in SVG @font-face)
   ────────────────────────────────────────────────────────────────── */

let cachedFontDataUri: string | null = null;

async function getInterBlackDataUri(): Promise<string> {
  if (cachedFontDataUri) return cachedFontDataUri;
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Inter-Black.ttf');
  const fontBuffer = await readFile(fontPath);
  cachedFontDataUri = `data:font/ttf;base64,${fontBuffer.toString('base64')}`;
  return cachedFontDataUri;
}

/* ──────────────────────────────────────────────────────────────────
   Title truncation + line wrapping
   ────────────────────────────────────────────────────────────────── */

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Wrap title to lines respecting maxCharsPerLine, breaking on words.
 * Returns array of lines (max 3 lines).
 */
function wrapTitle(text: string, maxCharsPerLine: number, maxLines = 3): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? current + ' ' + word : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      // If word alone > max, hard-break it
      if (word.length > maxCharsPerLine) {
        lines.push(word.slice(0, maxCharsPerLine - 1) + '…');
        current = '';
      } else {
        current = word;
      }
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // If we ran out of lines but more text remained, append … to last line
  if (lines.length >= maxLines) {
    const totalUsed = lines.join(' ').length;
    if (totalUsed < text.length) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last.slice(0, Math.max(0, last.length - 1)) + '…';
    }
  }

  return lines;
}

/* ──────────────────────────────────────────────────────────────────
   SVG text overlay generator (highlight white-on-black, MLS style)
   ────────────────────────────────────────────────────────────────── */

interface OverlaySvgOpts {
  width: number;
  height: number;
  lines: string[];
  fontSize: number;
  paddingX: number;
  paddingY: number;
  bottomMargin: number;
  lineGap: number;
  fontDataUri: string;
}

function buildOverlaySvg(opts: OverlaySvgOpts): string {
  const { width, height, lines, fontSize, paddingX, paddingY, bottomMargin, lineGap, fontDataUri } = opts;

  // Approx character width for Inter Black (very bold) ≈ 0.55 * fontSize.
  // Accept some imprecision — SVG text auto-renders at exact pixels regardless.
  const charWidthRatio = 0.55;
  const lineHeight = fontSize + paddingY * 2;

  // Compute total height of text block
  const totalBlockH = lines.length * lineHeight + (lines.length - 1) * lineGap;
  const blockTopY = height - bottomMargin - totalBlockH;

  // Build per-line rect + text
  const rects: string[] = [];
  const texts: string[] = [];

  lines.forEach((line, i) => {
    const lineWidth = Math.ceil(line.length * fontSize * charWidthRatio) + paddingX * 2;
    const y = blockTopY + i * (lineHeight + lineGap);
    rects.push(
      `<rect x="0" y="${y}" width="${lineWidth}" height="${lineHeight}" fill="black"/>`
    );
    // Text baseline = y + paddingY + fontSize * 0.85 (approx for Inter)
    const textBaseline = y + paddingY + fontSize * 0.82;
    texts.push(
      `<text x="${paddingX}" y="${textBaseline}" font-family="Inter, sans-serif" font-weight="900" font-size="${fontSize}" fill="white" letter-spacing="-0.02em">${escapeXml(line)}</text>`
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      @font-face {
        font-family: 'Inter';
        src: url('${fontDataUri}') format('truetype');
        font-weight: 900;
        font-style: normal;
      }
    </style>
  </defs>
  ${rects.join('\n  ')}
  ${texts.join('\n  ')}
</svg>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  // We use Sharp's "entropy" strategy: picks the region with the most
  // detail (highest variance), which works much better than "attention"
  // for our pill covers — those have decorative patterns + photo, and
  // attention often gets distracted by high-contrast graphic areas.
  // Entropy picks the photo zone (rich in texture) over patterns.
  const resized = await sharp(sourceBuffer)
    .resize(spec.width, spec.height, {
      fit: 'cover',
      position: sharp.strategy.entropy,
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
      const fontDataUri = await getInterBlackDataUri();
      const svg = buildOverlaySvg({
        width: spec.width,
        height: spec.height,
        lines: renderedLines,
        fontSize: spec.titleFontSize,
        paddingX: spec.textPaddingX,
        paddingY: spec.textPaddingY,
        bottomMargin: spec.textBottomMargin,
        lineGap: spec.lineGap,
        fontDataUri,
      });

      composed = await sharp(cropped)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .toBuffer();
    }
  }

  // 4. Output JPEG (mandatory for IG, lighter for all platforms)
  const finalBuffer = await sharp(composed)
    .jpeg({ quality: 92, mozjpeg: true })
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
