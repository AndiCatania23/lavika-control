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
  /**
   * Layout mode in base al pattern semantico del titolo pill.
   *  - stat        numero counter-up + context UPPERCASE sotto (default)
   *  - anniversary numero + eyebrow "ANNI FA" gold + headline editoriale
   *  - year        anno pop-in + headline editoriale
   *  - hero        solo testo grande, niente numero
   *  - quote       citazione speaker → virgolette decorative + testo + attribution
   */
  mode: z.enum(['stat', 'anniversary', 'year', 'hero', 'quote']).default('stat'),
  /** Numero principale da animare. NULL in mode 'hero'. */
  number: z.number().nullable(),
  /** Testo contesto sotto il numero (mode 'stat'). Già uppercase. */
  context: z.string(),
  /** Headline editoriale (mode anniversary/year/hero). Es. "Di Tacchio · Trionfo playoff". */
  heroText: z.string().optional(),
  /** Eyebrow sotto al numero (mode anniversary: "ANNI FA"). */
  eyebrow: z.string().optional(),
  /**
   * Payoff editoriale UPPERCASE — la frase DOPO il `:` quando il titolo
   * è un editorial split (es. "L'ESPERIENZA CONTA"). Renderizzato in
   * gold sotto la headline come "morale" della pill. Empty stringa OK.
   */
  payoff: z.string().optional(),
  /** Suffisso inline del numero (es. "%", "°"). */
  numberSuffix: z.string().optional(),
  /** Categoria pill (numeri/storia/flash/rivali) — micro-tweak palette. */
  category: z.string().optional(),
  /**
   * URL immagine cover pill da usare come sfondo.
   * Se presente: Img full-bleed + ken-burns + vignette intenso + tinta
   * scura per non rubare focus al numero/headline.
   * Se assente: fallback radial gradient nero (design originale).
   */
  imageUrl: z.string().url().optional(),
});

export type PillStatVideoProps = z.infer<typeof pillStatVideoSchema>;

export const defaultPillStatVideoProps: PillStatVideoProps = {
  mode: 'stat',
  number: 12,
  context: 'GOL DI CATURANO IN STAGIONE',
  numberSuffix: '',
  eyebrow: '',
  payoff: '',
  category: 'numeri',
};

export const PillStatVideo: React.FC<PillStatVideoProps> = ({
  mode = 'stat', number, context, heroText, eyebrow, payoff, numberSuffix, category, imageUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const isStory = height / width > 1.5;
  // Mode quote: niente numero, virgolette decorative + quote text + attribution
  const isQuoteMode = mode === 'quote';
  // Per anniversary/year il numero è più piccolo per fare spazio alla headline editoriale.
  const isCompactNumber = mode === 'anniversary' || mode === 'year';
  // Se c'è un payoff, lasciamo più spazio sotto la headline alzando i blocchi.
  const hasPayoff = !!(payoff && payoff.length > 0);
  const POS = isStory
    ? {
        numberFontSize: isCompactNumber ? 380 : (number !== null && number >= 1000 ? 380 : 520),
        contextFontSize: 56,
        contextLetterSpacing: 6,
        contextMaxWidth: 880,
        heroTextFontSize: isCompactNumber ? 78 : 200,
        heroTextLetterSpacing: -1,
        eyebrowFontSize: 40,
        eyebrowLetterSpacing: 10,
        wordmarkBottom: 140,
        wordmarkWidth: 240,
        numberCenter: isCompactNumber ? (hasPayoff ? '30%' : '34%') : '42%',
        contextTop: hasPayoff ? '56%' : '60%',
        eyebrowOffset: 30,
        payoffTop: '74%',
        payoffFontSize: 40,
        payoffLetterSpacing: 5,
        payoffMaxWidth: 820,
      }
    : {
        numberFontSize: isCompactNumber ? 280 : (number !== null && number >= 1000 ? 280 : 380),
        contextFontSize: 44,
        contextLetterSpacing: 5,
        contextMaxWidth: 800,
        heroTextFontSize: isCompactNumber ? 60 : 140,
        heroTextLetterSpacing: -1,
        eyebrowFontSize: 32,
        eyebrowLetterSpacing: 8,
        wordmarkBottom: 80,
        wordmarkWidth: 180,
        numberCenter: isCompactNumber ? (hasPayoff ? '28%' : '32%') : '38%',
        contextTop: hasPayoff ? '54%' : '60%',
        eyebrowOffset: 24,
        payoffTop: '74%',
        payoffFontSize: 32,
        payoffLetterSpacing: 4,
        payoffMaxWidth: 720,
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

  /* ── Subtle vignette per profondità (fallback se niente imageUrl) */
  const bgGradient = `radial-gradient(ellipse at center,
    rgba(20,20,20,1) 0%,
    rgba(8,8,8,1) 60%,
    rgba(0,0,0,1) 100%)`;

  /* ── Ken-burns: scale 1.0 → 1.06 lineare lungo tutto il video (solo se c'è image) */
  const kbScale = interpolate(frame, [0, durationInFrames], [1.0, 1.06]);

  return (
    <AbsoluteFill style={{
      background: imageUrl ? '#000' : bgGradient,
      fontFamily: FONT_BODY,
      overflow: 'hidden',
    }}>
      {/* ─── HERO IMAGE full-bleed con ken-burns (se imageUrl presente).
              L'immagine fa atmosphere, ma il numero/headline restano
              protagonisti grazie alla vignette + tinta scura sopra. */}
      {imageUrl && (
        <AbsoluteFill style={{
          transform: `scale(${kbScale})`,
          transformOrigin: 'center 50%',
        }}>
          <Img
            src={imageUrl}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center center',
            }}
          />
        </AbsoluteFill>
      )}

      {/* ─── Tinta scura uniforme (smorza colori e contrasto immagine).
              Solo se c'è imageUrl — sul fondo nero puro è inutile. */}
      {imageUrl && (
        <AbsoluteFill style={{
          background: 'rgba(0, 0, 0, 0.55)',
        }} />
      )}

      {/* ─── Vignette intensa per leggibilità: bordi scuri, centro
              leggermente trasparente. Sempre attiva — anche su nero
              dà profondità — ma più marcata su imageUrl. */}
      <AbsoluteFill style={{
        background: imageUrl
          ? `radial-gradient(ellipse at center,
              rgba(0,0,0,0.15) 0%,
              rgba(0,0,0,0.55) 55%,
              rgba(0,0,0,0.85) 100%)`
          : `radial-gradient(ellipse at center,
              rgba(0,0,0,0) 0%,
              rgba(0,0,0,0.4) 80%,
              rgba(0,0,0,0.7) 100%)`,
      }} />

      {/* ─── Top + bottom darkener (per badge top + logo bottom leggibili) */}
      {imageUrl && (
        <AbsoluteFill style={{
          background: `linear-gradient(180deg,
            rgba(0,0,0,0.7) 0%,
            rgba(0,0,0,0.0) 18%,
            rgba(0,0,0,0.0) 78%,
            rgba(0,0,0,0.75) 100%)`,
        }} />
      )}

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

      {/* ─── MODE QUOTE: virgolette decorative gold gigante centrale +
              quote text bianco grande sotto. Layout dedicato per le pill
              "Speaker: 'frase'" (post-conferenza, dichiarazioni). */}
      {isQuoteMode ? (
        <>
          {/* Virgola decorativa gold */}
          <div style={{
            position: 'absolute',
            top: isStory ? '20%' : '18%',
            left: 0,
            right: 0,
            textAlign: 'center',
            opacity: numberOpacity * outroOpacity * 0.85,
            fontFamily: FONT_DISPLAY,
            color: ACCENT_GOLD,
            fontSize: isStory ? 280 : 220,
            lineHeight: 0.6,
            letterSpacing: -20,
            transform: `scale(${numberScale})`,
            textShadow: `0 4px 30px ${ACCENT_GOLD}55, 0 0 60px rgba(0,0,0,0.7)`,
            userSelect: 'none',
          }}>
            “
          </div>
          {/* Quote text bianco grande al centro */}
          <div style={{
            position: 'absolute',
            top: isStory ? '46%' : '44%',
            left: 0,
            right: 0,
            textAlign: 'center',
            transform: `translateY(-50%) scale(${numberScale * breathScale})`,
            opacity: numberOpacity * outroOpacity,
            padding: '0 70px',
          }}>
            <div style={{
              fontFamily: FONT_DISPLAY,
              color: '#FFFFFF',
              fontSize: isStory ? 88 : 64,
              lineHeight: 1.05,
              letterSpacing: -1,
              textShadow: '0 6px 30px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
              maxWidth: isStory ? 900 : 800,
              margin: '0 auto',
              userSelect: 'none',
            }}>
              {heroText}
            </div>
          </div>
        </>
      ) : (
        /* ─── NUMBER MEGA centrato vertical (oppure hero text se mode='hero') */
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
          {mode !== 'hero' && number !== null && displayedNumber !== null ? (
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
      )}

      {/* ─── MODE QUOTE: attribution speaker sotto il quote text */}
      {isQuoteMode && eyebrow && (
        <div style={{
          position: 'absolute',
          top: isStory ? '74%' : '72%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: contextOpacity,
          transform: `translateY(${contextY}px)`,
        }}>
          <div style={{
            color: ACCENT_GOLD,
            fontFamily: FONT_DISPLAY,
            fontSize: isStory ? 44 : 36,
            letterSpacing: 8,
            textShadow: `0 4px 20px ${ACCENT_GOLD}44, 0 2px 8px rgba(0,0,0,0.7)`,
          }}>
            — {eyebrow}
          </div>
        </div>
      )}

      {/* ─── EYEBROW gold subito sotto al numero.
              Solo per mode='anniversary' ("ANNI FA").
              Per mode='stat' niente eyebrow visuale: l'unità è dentro il context
              (es. "GOL DALLA PANCHINA") per evitare 3 livelli sovrapposti. */}
      {mode === 'anniversary' && eyebrow && (
        <div style={{
          position: 'absolute',
          // Subito sotto al numero (number font size + offset)
          top: `calc(${POS.numberCenter} + ${POS.numberFontSize / 2}px + ${POS.eyebrowOffset}px)`,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: contextOpacity,
          transform: `translateY(${contextY}px)`,
        }}>
          <div style={{
            color: ACCENT_GOLD,
            fontFamily: FONT_DISPLAY,
            fontSize: POS.eyebrowFontSize,
            letterSpacing: POS.eyebrowLetterSpacing,
            textShadow: `0 2px 12px ${ACCENT_GOLD}44, 0 2px 8px rgba(0,0,0,0.6)`,
          }}>
            {eyebrow}
          </div>
        </div>
      )}

      {/* ─── CONTEXT/HEADLINE sotto numero:
              - mode='anniversary' o 'year' → heroText BIANCO grande (frase narrativa)
              - mode='stat' → context BIANCO MEDIO (qualifica del numero, es. "DALLA PANCHINA").
                Niente più gold qui per non confondersi col payoff gold sotto.
              - mode='hero' → context UPPERCASE gold (fallback minimal). */}
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
        {(mode === 'anniversary' || mode === 'year') && heroText ? (
          <div style={{
            color: '#FFFFFF',
            fontFamily: FONT_DISPLAY,
            fontSize: POS.heroTextFontSize,
            letterSpacing: POS.heroTextLetterSpacing,
            lineHeight: 1.05,
            maxWidth: POS.contextMaxWidth,
            margin: '0 auto',
            textShadow: '0 4px 20px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
          }}>
            {heroText}
          </div>
        ) : mode === 'stat' && context ? (
          <div style={{
            color: '#FFFFFF',
            fontFamily: FONT_DISPLAY,
            fontSize: POS.contextFontSize,
            letterSpacing: POS.contextLetterSpacing,
            lineHeight: 1.15,
            maxWidth: POS.contextMaxWidth,
            margin: '0 auto',
            textShadow: '0 4px 20px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
          }}>
            {context}
          </div>
        ) : context ? (
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
        ) : null}
      </div>

      {/* ─── PAYOFF editoriale (la "morale" dopo i `:` del titolo).
              Renderizzato in gold UPPERCASE sotto la headline.
              Visivamente è il "punch line" che chiude la pill. */}
      {payoff && payoff.length > 0 && (
        <div style={{
          position: 'absolute',
          top: POS.payoffTop,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: contextOpacity,
          padding: '0 80px',
        }}>
          <div style={{
            color: ACCENT_GOLD,
            fontFamily: FONT_DISPLAY,
            fontSize: POS.payoffFontSize,
            letterSpacing: POS.payoffLetterSpacing,
            lineHeight: 1.18,
            maxWidth: POS.payoffMaxWidth,
            margin: '0 auto',
            textShadow: `0 4px 20px ${ACCENT_GOLD}44, 0 2px 8px rgba(0,0,0,0.7)`,
          }}>
            {payoff}
          </div>
        </div>
      )}

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
