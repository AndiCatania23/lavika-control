/* ──────────────────────────────────────────────────────────────────
   carouselSlideBuilder — render singola slide carousel pill 1080×1350

   Stile (replica La Casa di C ma palette LAVIKA rosso Catania):
   - Foto BG (pill.image_url) con duotone rosso + darken
   - Top-left: LAVIKA wordmark | Top-right: badge "N/total"
   - Centro: cerchio bianco con virgolette ,, rosse
   - Quote Anton bold uppercase, keyword in rosso
   - Bottom: attribution (es. "LAVIKA SPORT" o speaker)

   Input: CarouselSlideContent + pill metadata + bg image URL
   Output: PNG Buffer (~150-300KB per slide)
   ────────────────────────────────────────────────────────────────── */

import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

import type { CarouselSlideContent } from './pillCarouselSplitter';

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

const COLOR_RED = '#E40521';
const COLOR_RED_DARK = '#8a0314';
const COLOR_WHITE = '#FFFFFF';

const FONT_FAMILY = 'Anton';
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Anton-Regular.ttf');

let fontRegistered = false;
function ensureFontRegistered(): void {
  if (fontRegistered) return;
  if (fs.existsSync(FONT_PATH)) {
    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
    fontRegistered = true;
  }
}

const LAVIKA_WORDMARK_PATH = path.join(process.cwd(), 'public', 'brand', 'logo', 'lavika-wordmark-white.png');

export interface BuildSlideOptions {
  slide: CarouselSlideContent;
  /** URL della cover pill (HTTP/HTTPS). Se null/fail, fallback gradient rosso. */
  backgroundImageUrl?: string | null;
  /** Attribution sotto la quote. Default "LAVIKA SPORT". */
  attribution?: string;
}

/* ──────────────────────────────────────────────────────────────────
   Helpers di rendering canvas
   ────────────────────────────────────────────────────────────────── */

/** Disegna il background image come cover (preserva aspect ratio). */
async function drawBackgroundCover(
  ctx: SKRSContext2D,
  imageUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const img = await loadImage(buf);
    // Cover fit: scala fino a riempire il container, crop eccesso
    const scale = Math.max(SLIDE_WIDTH / img.width, SLIDE_HEIGHT / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (SLIDE_WIDTH - w) / 2;
    const y = (SLIDE_HEIGHT - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

/** Applica overlay duotone rosso + darken. Mantiene riconoscibilità del bg. */
function applyDuotoneOverlay(ctx: SKRSContext2D): void {
  // Layer 1: tinta rossa semi-trasparente
  ctx.fillStyle = 'rgba(228, 5, 33, 0.32)';
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  // Layer 2: darken globale per leggibilità testo
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  // Layer 3: gradient bottom più scuro per attribution
  const grad = ctx.createLinearGradient(0, SLIDE_HEIGHT * 0.5, 0, SLIDE_HEIGHT);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
}

/** Fallback BG: gradient rosso-nero quando manca pill image. */
function drawFallbackBackground(ctx: SKRSContext2D): void {
  const grad = ctx.createLinearGradient(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  grad.addColorStop(0, COLOR_RED_DARK);
  grad.addColorStop(0.55, '#1a0508');
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
}

/** Header top: LAVIKA wordmark a sx + badge "N/total" a dx. */
async function drawHeader(
  ctx: SKRSContext2D,
  slide: CarouselSlideContent,
): Promise<void> {
  const headerY = 70;
  // LAVIKA wordmark a sinistra (height 60, scale-preserve)
  if (fs.existsSync(LAVIKA_WORDMARK_PATH)) {
    try {
      const wordmarkBuf = fs.readFileSync(LAVIKA_WORDMARK_PATH);
      const wordmark = await loadImage(wordmarkBuf);
      const wmHeight = 60;
      const wmWidth = (wordmark.width / wordmark.height) * wmHeight;
      ctx.drawImage(wordmark, 60, headerY, wmWidth, wmHeight);
    } catch { /* ignore — header senza wordmark se fallisce */ }
  }

  // Badge "N/total" a destra: disco bianco con numero rosso
  if (slide.total > 1) {
    const badgeR = 42;
    const badgeX = SLIDE_WIDTH - 60 - badgeR;
    const badgeY = headerY + 30;
    // Sfondo disc bianco con shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = COLOR_WHITE;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // Testo "N/total"
    ctx.fillStyle = COLOR_RED;
    ctx.font = `700 36px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${slide.index}/${slide.total}`, badgeX, badgeY + 2);
  }
}

/** Centro: cerchio bianco con virgolette rosse */
function drawQuoteIcon(ctx: SKRSContext2D, centerX: number, centerY: number, radius: number): void {
  // Disco bianco con leggera ombra
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = COLOR_WHITE;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // Virgolette doppie ,,
  ctx.fillStyle = COLOR_RED;
  ctx.font = `700 ${radius * 1.5}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Caratteri close-quote U+201D ”
  ctx.fillText('„', centerX, centerY + radius * 0.45);
}

/* ──────────────────────────────────────────────────────────────────
   Quote rendering con keyword highlighting
   ────────────────────────────────────────────────────────────────── */

interface WordToken { text: string; isKeyword: boolean; spaceAfter: boolean }

function tokenizeWithKeywords(text: string, keywords: string[]): WordToken[] {
  const kwLower = new Set(keywords.map((k) => k.toLowerCase()));
  // Split sui whitespace, mantieni punteggiatura attaccata al word
  const parts = text.split(/(\s+)/);
  const tokens: WordToken[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^\s+$/.test(part)) continue;
    // Verifica se la parola "core" (stripped di punteggiatura) è keyword
    const core = part.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    const isKeyword = kwLower.has(core);
    const spaceAfter = i + 1 < parts.length && /^\s+$/.test(parts[i + 1]);
    tokens.push({ text: part, isKeyword, spaceAfter });
  }
  return tokens;
}

/**
 * Disegna quote multi-line wrap, con keyword evidenziate in rosso.
 * Auto-fit del font size per riempire la zona quote senza overflow.
 */
function drawQuote(
  ctx: SKRSContext2D,
  text: string,
  keywords: string[],
  boxX: number, boxY: number, boxWidth: number, boxHeight: number,
): void {
  const tokens = tokenizeWithKeywords(text.toUpperCase(), keywords);
  // Trova font size ottimale (binary search)
  let fontSize = 72;
  const minFont = 36;
  const maxFont = 92;
  let bestFit: { fontSize: number; lines: WordToken[][] } | null = null;

  for (let fs = maxFont; fs >= minFont; fs -= 2) {
    ctx.font = `700 ${fs}px ${FONT_FAMILY}`;
    const spaceWidth = ctx.measureText(' ').width;
    const lines: WordToken[][] = [[]];
    let lineWidth = 0;
    for (const tok of tokens) {
      const w = ctx.measureText(tok.text).width;
      const widthWithToken = lineWidth === 0 ? w : lineWidth + spaceWidth + w;
      if (widthWithToken > boxWidth && lines[lines.length - 1].length > 0) {
        lines.push([tok]);
        lineWidth = w;
      } else {
        lines[lines.length - 1].push(tok);
        lineWidth = widthWithToken;
      }
    }
    const totalHeight = lines.length * fs * 1.08;
    if (totalHeight <= boxHeight) {
      bestFit = { fontSize: fs, lines };
      break;
    }
  }
  if (!bestFit) {
    // ultimo tentativo: minFont
    ctx.font = `700 ${minFont}px ${FONT_FAMILY}`;
    const spaceWidth = ctx.measureText(' ').width;
    const lines: WordToken[][] = [[]];
    let lineWidth = 0;
    for (const tok of tokens) {
      const w = ctx.measureText(tok.text).width;
      const widthWithToken = lineWidth === 0 ? w : lineWidth + spaceWidth + w;
      if (widthWithToken > boxWidth && lines[lines.length - 1].length > 0) {
        lines.push([tok]);
        lineWidth = w;
      } else {
        lines[lines.length - 1].push(tok);
        lineWidth = widthWithToken;
      }
    }
    bestFit = { fontSize: minFont, lines };
  }

  const { fontSize: fs, lines } = bestFit;
  ctx.font = `700 ${fs}px ${FONT_FAMILY}`;
  const lineHeight = fs * 1.08;
  const totalHeight = lines.length * lineHeight;
  // Center verticale dentro il box
  const startY = boxY + (boxHeight - totalHeight) / 2 + fs;
  const spaceWidth = ctx.measureText(' ').width;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // Measure totale linea per centratura orizzontale
    let lineTotalWidth = 0;
    for (let i = 0; i < line.length; i++) {
      lineTotalWidth += ctx.measureText(line[i].text).width;
      if (i < line.length - 1) lineTotalWidth += spaceWidth;
    }
    let x = boxX + (boxWidth - lineTotalWidth) / 2;
    const y = startY + lineIdx * lineHeight;
    for (let i = 0; i < line.length; i++) {
      const tok = line[i];
      ctx.fillStyle = tok.isKeyword ? COLOR_RED : COLOR_WHITE;
      ctx.fillText(tok.text, x, y);
      x += ctx.measureText(tok.text).width;
      if (i < line.length - 1) x += spaceWidth;
    }
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawAttribution(ctx: SKRSContext2D, text: string): void {
  const y = SLIDE_HEIGHT - 60;
  ctx.font = `700 26px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLOR_WHITE;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8;
  ctx.fillText(text.toUpperCase(), SLIDE_WIDTH / 2, y);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/* ──────────────────────────────────────────────────────────────────
   Public API
   ────────────────────────────────────────────────────────────────── */

export async function buildCarouselSlide(opts: BuildSlideOptions): Promise<Buffer> {
  ensureFontRegistered();

  const { slide, backgroundImageUrl, attribution = 'LAVIKA SPORT' } = opts;

  const canvas = createCanvas(SLIDE_WIDTH, SLIDE_HEIGHT);
  const ctx = canvas.getContext('2d');

  // 1. Background
  let hasBg = false;
  if (backgroundImageUrl) hasBg = await drawBackgroundCover(ctx, backgroundImageUrl);
  if (!hasBg) drawFallbackBackground(ctx);

  // 2. Duotone + darken overlay
  if (hasBg) applyDuotoneOverlay(ctx);

  // 3. Header
  await drawHeader(ctx, slide);

  // 4. Quote icon centrale
  drawQuoteIcon(ctx, SLIDE_WIDTH / 2, 480, 64);

  // 5. Quote text
  drawQuote(
    ctx,
    slide.text,
    slide.keywords,
    /* boxX */ 80,
    /* boxY */ 600,
    /* boxWidth */ SLIDE_WIDTH - 160,
    /* boxHeight */ 540,
  );

  // 6. Attribution
  drawAttribution(ctx, attribution);

  // PNG buffer via canvas, poi re-encode con Sharp per ottimizzazione
  const pngBuffer = canvas.toBuffer('image/png');
  // Sharp ottimizza PNG → riduce size 20-30%
  return sharp(pngBuffer).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}
