import '@fontsource/anton/latin.css';
import { z } from 'zod';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/* ──────────────────────────────────────────────────────────────────
   PillStatVideo — Caso C "stat motion graphics"

   Story 9:16 1080×1920 · 8s @ 30fps · no audio.

   Per pill categoria "numeri" e "storia": un numero grande appare e
   counter-up, sotto il contesto in uppercase gold (#FFC72C, stesso
   accent della quote layout). Sfondo nero editoriale + linee oro
   sottili decorative. Logo LAVIKA fade-in finale.

   Brand book LAVIKA: "luce calda / linea oro" + tipografia Anton.
   Coerenza con quote layout (assetBuilder.ts) per famiglia visiva.

   Numero ≥ 100 → fade-in pop (è probabilmente un anno o stat grande).
   Numero < 100 → counter-up da 0 al valore (più drammatico).
   Niente numero (fallback) → testo grande hero senza counter.
   ────────────────────────────────────────────────────────────────── */

const FONT_DISPLAY = '"Anton", "Archivo Black", system-ui, sans-serif';
const FONT_BODY = 'system-ui, sans-serif';
const ACCENT_GOLD = '#FFC72C';
const WORDMARK_WHITE = 'brand/logo/lavika-wordmark-white.png';

export const pillStatVideoSchema = z.object({
  /** Numero principale da animare. NULL = mostriamo `heroText` invece del numero. */
  number: z.number().nullable(),
  /** Testo contesto sotto il numero (es. "GOL IN STAGIONE"). Già uppercase. */
  context: z.string(),
  /** Testo hero quando number è null (es. titolo della pill). */
  heroText: z.string().optional(),
  /** Suffisso opzionale del numero (es. "%", "°"). */
  numberSuffix: z.string().optional(),
  /** Categoria pill (numeri/storia/flash/rivali) — usata per micro-tweak palette. */
  category: z.string().optional(),
});

export type PillStatVideoProps = z.infer<typeof pillStatVideoSchema>;

export const defaultPillStatVideoProps: PillStatVideoProps = {
  number: 12,
  context: 'GOL DI CATURANO IN STAGIONE',
  numberSuffix: '',
  category: 'numeri',
};

export const PillStatVideo: React.FC<PillStatVideoProps> = ({
  number, context, heroText, numberSuffix, category,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const isStory = height / width > 1.5;
  const POS = isStory
    ? {
        numberFontSize: number !== null && number >= 1000 ? 380 : 520,
        contextFontSize: 56,
        contextLetterSpacing: 6,
        contextMaxWidth: 800,
        heroTextFontSize: 200,
        wordmarkBottom: 140,
        wordmarkWidth: 240,
        numberCenter: '42%',
        contextTop: '60%',
      }
    : {
        numberFontSize: number !== null && number >= 1000 ? 280 : 380,
        contextFontSize: 44,
        contextLetterSpacing: 5,
        contextMaxWidth: 760,
        heroTextFontSize: 140,
        wordmarkBottom: 80,
        wordmarkWidth: 180,
        numberCenter: '38%',
        contextTop: '60%',
      };

  /* ── Number animation timeline ──
     - 0-15:   fade-in container + scale-in
     - 15-60:  counter-up (se number < 1000) o pop-in (se ≥ 1000 anno)
     - 60-150: hold statico con micro-breath (scale 1.0 ↔ 1.02)
     - 180-220: fade out leggero (opacity 1 → 0.6)
  */

  // Entry: scale-in + opacity 0-15
  const entrySpring = spring({
    frame, fps,
    config: { damping: 14, stiffness: 100 },
    durationInFrames: 30,
  });
  const numberOpacity = entrySpring;
  const numberScale = 0.7 + entrySpring * 0.3;

  // Counter-up per numeri piccoli (< 1000). Pop-in per anni/grandi.
  const counterProgress = spring({
    frame: frame - 10, fps,
    config: { damping: 18, stiffness: 70 },
    durationInFrames: 40,
  });
  const isLargeNumber = number !== null && number >= 1000;
  const displayedNumber = number === null
    ? null
    : isLargeNumber
      ? (counterProgress > 0.5 ? number : 0)
      : Math.round(number * counterProgress);

  // Micro-breath dopo entry: piccola oscillazione di scale
  const breathPhase = Math.sin(((frame - 60) / fps) * Math.PI * 0.8) * 0.012;
  const breathScale = frame > 60 ? 1 + breathPhase : 1;

  // Outro fade
  const outroOpacity = interpolate(frame, [180, 220], [1, 0.55], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  /* ── Context (testo sotto): fade-in 30-70 + slide-up */
  const contextSpring = spring({
    frame: frame - 30, fps,
    config: { damping: 16, stiffness: 110 },
    durationInFrames: 40,
  });
  const contextOpacity = contextSpring * outroOpacity;
  const contextY = (1 - contextSpring) * 30;

  /* ── Wordmark LAVIKA: fade-in finale 180-220 */
  const wordmarkOpacity = interpolate(frame, [180, 220], [0, 0.92], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  /* ── Animated gold lines: 2 linee diagonali sottili che si muovono ciclicamente */
  const linePhase = ((frame / fps) % 4) / 4;
  const line1X = interpolate(linePhase, [0, 1], [-100, 100]);
  const line2X = interpolate(linePhase, [0, 1], [100, -100]);

  /* ── Subtle vignette per profondità */
  const bgGradient = `radial-gradient(ellipse at center,
    rgba(20,20,20,1) 0%,
    rgba(8,8,8,1) 60%,
    rgba(0,0,0,1) 100%)`;

  return (
    <AbsoluteFill style={{
      background: bgGradient,
      fontFamily: FONT_BODY,
      overflow: 'hidden',
    }}>
      {/* ─── Gold accent lines: orizzontali sottili sopra/sotto, animate */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: 0,
        right: 0,
        height: 1,
        background: `linear-gradient(90deg,
          transparent 0%,
          ${ACCENT_GOLD}66 ${50 + line1X / 4}%,
          transparent 100%)`,
        opacity: 0.6,
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%',
        left: 0,
        right: 0,
        height: 1,
        background: `linear-gradient(90deg,
          transparent 0%,
          ${ACCENT_GOLD}66 ${50 + line2X / 4}%,
          transparent 100%)`,
        opacity: 0.6,
      }} />

      {/* ─── Light beam diagonale tenue (continuo) */}
      <AbsoluteFill style={{
        background: `linear-gradient(115deg,
          transparent ${interpolate(((frame / fps) % 6) / 6, [0, 1], [-30, 130]) - 6}%,
          rgba(255, 199, 44, 0.05) ${interpolate(((frame / fps) % 6) / 6, [0, 1], [-30, 130])}%,
          transparent ${interpolate(((frame / fps) % 6) / 6, [0, 1], [-30, 130]) + 6}%)`,
        mixBlendMode: 'screen',
        opacity: 0.7,
      }} />

      {/* ─── NUMBER MEGA centrato vertical (o hero text se number=null) */}
      <div style={{
        position: 'absolute',
        top: POS.numberCenter,
        left: 0,
        right: 0,
        textAlign: 'center',
        transform: `translateY(-50%) scale(${numberScale * breathScale})`,
        opacity: numberOpacity * outroOpacity,
        fontFamily: FONT_DISPLAY,
        color: '#FFFFFF',
        textShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 80px ${ACCENT_GOLD}22`,
        userSelect: 'none',
        lineHeight: 0.9,
        letterSpacing: -8,
      }}>
        {number !== null && displayedNumber !== null ? (
          <span style={{ fontSize: POS.numberFontSize }}>
            {displayedNumber}{numberSuffix ?? ''}
          </span>
        ) : (
          <span style={{
            fontSize: POS.heroTextFontSize,
            lineHeight: 1.0,
            letterSpacing: -4,
            display: 'block',
            padding: '0 80px',
          }}>
            {heroText ?? context}
          </span>
        )}
      </div>

      {/* ─── CONTEXT uppercase gold sotto */}
      <div style={{
        position: 'absolute',
        top: POS.contextTop,
        left: 0,
        right: 0,
        textAlign: 'center',
        opacity: contextOpacity,
        transform: `translateY(${contextY}px)`,
        padding: '0 80px',
      }}>
        <div style={{
          color: ACCENT_GOLD,
          fontFamily: FONT_DISPLAY,
          fontSize: POS.contextFontSize,
          letterSpacing: POS.contextLetterSpacing,
          lineHeight: 1.15,
          maxWidth: POS.contextMaxWidth,
          margin: '0 auto',
          textShadow: `0 4px 20px ${ACCENT_GOLD}33, 0 2px 8px rgba(0,0,0,0.6)`,
        }}>
          {context}
        </div>
      </div>

      {/* ─── Category badge piccolo top (es. "NUMERI · LAVIKA SPORT") */}
      <div style={{
        position: 'absolute',
        top: isStory ? 140 : 60,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#FFFFFF',
        opacity: numberOpacity * 0.5,
        fontSize: isStory ? 18 : 14,
        letterSpacing: 5,
        textTransform: 'uppercase',
      }}>
        {(category ?? 'NUMERI').toUpperCase()}&nbsp;&nbsp;·&nbsp;&nbsp;LAVIKA SPORT
      </div>

      {/* ─── Wordmark LAVIKA bottom centered */}
      <div style={{
        position: 'absolute',
        bottom: POS.wordmarkBottom,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity: wordmarkOpacity,
      }}>
        <Img
          src={staticFile(WORDMARK_WHITE)}
          style={{
            width: POS.wordmarkWidth,
            height: 'auto',
            filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.7))',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
