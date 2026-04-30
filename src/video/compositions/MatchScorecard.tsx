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

/* Display font family per mega-title sportivi.
   Anton è il display LAVIKA ufficiale (vedi social-brand-typography.md). */
const FONT_DISPLAY = '"Anton", "Archivo Black", system-ui, sans-serif';
const FONT_BODY    = 'system-ui, sans-serif';

/* Watermark logo LAVIKA — PNG bianco. Path relativo a public/. */
const WORDMARK_WHITE = 'brand/logo/lavika-wordmark-white.png';

/* ──────────────────────────────────────────────────────────────────
   Schema
   ────────────────────────────────────────────────────────────────── */

export const matchScorecardSchema = z.object({
  homeName:     z.string(),
  homeAbbr:     z.string(),
  homeLogoUrl:  z.string().url(),
  homeScore:    z.number(),
  awayName:     z.string(),
  awayAbbr:     z.string(),
  awayLogoUrl:  z.string().url(),
  awayScore:    z.number(),
  matchday:     z.number().nullable(),
  date:         z.string(),
  venue:        z.string().optional(),
  /** Foto hero full-bleed: momento clou del match (gol, esultanza, parata).
      In futuro: subject-extracted via Nano Banana 2 (vedi brand book sez. 11). */
  heroPhotoUrl: z.string().url(),
  /** Status mega-title (es. "VITTORIA", "PAREGGIO", "DEBACLE"). */
  resultLabel:  z.string(),
  scorers:      z.array(z.object({
    side: z.enum(['home', 'away']),
    player: z.string(),
    minute: z.number(),
  })).default([]),
  primaryColor: z.string().default('#0066CC'),
  accentColor:  z.string().default('#B40000'),
});

export type MatchScorecardProps = z.infer<typeof matchScorecardSchema>;

export const defaultMatchScorecardProps: MatchScorecardProps = {
  homeName: 'CATANIA',
  homeAbbr: 'CAT',
  homeLogoUrl: 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev/team-logos/catania.svg',
  homeScore: 3,
  awayName: 'CROTONE',
  awayAbbr: 'CRO',
  awayLogoUrl: 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev/team-logos/crotone.svg',
  awayScore: 1,
  matchday: 38,
  date: 'Domenica 28 aprile · Stadio Massimino',
  venue: 'Catania',
  // Stock photo placeholder. Sostituire con foto Catania reale quando Nano Banana 2 è on.
  heroPhotoUrl: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=1080&q=85',
  resultLabel: 'VITTORIA',
  scorers: [
    { side: 'home', player: 'Lunetta',     minute: 12 },
    { side: 'home', player: 'Caturano',    minute: 38 },
    { side: 'away', player: 'Tumminello',  minute: 56 },
    { side: 'home', player: 'Lunetta',     minute: 78 },
  ],
  primaryColor: '#0066CC',
  accentColor:  '#B40000',
};

/* ──────────────────────────────────────────────────────────────────
   Composition: MatchScorecard v3 — direzione editorial top-player
   8 secondi · 4:5 1080×1350 · h264 yuv420p

   Ispirazione: scorecard FC Barcelona / Real Madrid / NBA — foto hero
   full-bleed, tipografia editorial massiva sopra, score gigante in basso.
   Il design NON costruisce: la foto è il protagonista assoluto.

   Timeline:
     0-240   ken-burns hero photo (scale 1.0 → 1.06)
     0-30    wordmark LAVIKA top fade-in
     20-55   resultLabel mega-title slide-up + blur clear
     35-65   loghi + "v" intro
     50-95   score MEGA reveal con count-up + scale-in
     85-180  marcatori minimal stagger bottom-right
     180-240 light intensify outro
   ────────────────────────────────────────────────────────────────── */

export const MatchScorecard: React.FC<MatchScorecardProps> = ({
  homeLogoUrl, homeScore,
  awayLogoUrl, awayScore,
  matchday, date,
  heroPhotoUrl, resultLabel,
  scorers, primaryColor, accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  /* Format detection: Story 9:16 (h/w > 1.5) ha safe-area UI sopra/sotto
     diversa dal Feed 4:5/1:1 → margini e posizioni vengono ricalcolate. */
  const isStory = height / width > 1.5;
  const POS = isStory
    ? { wordmarkTop: 130, eyebrowTop: 210, titleTop: '19%',
        logosBottom: 635, scoreBottom: 280, scorerBottom: 290, dateBottom: 230,
        titleFontSize: 320, wordmarkWidth: 180,
        eyebrowFontSize: 18, eyebrowLetterSpacing: 6,
        scoreFontSize: 380, scoreDividerH: 240, scoreLogoSize: 110, scoreLogoCol: 170 }
    : { wordmarkTop:  50, eyebrowTop: 110, titleTop: '15%',
        logosBottom: 380, scoreBottom:  80, scorerBottom: 100, dateBottom:  50,
        titleFontSize: 240, wordmarkWidth: 130,
        eyebrowFontSize: 14, eyebrowLetterSpacing: 4,
        scoreFontSize: 320, scoreDividerH: 200, scoreLogoSize:  90, scoreLogoCol: 144 };

  /* ── Ken-burns: scale 1.0 → 1.06 lineare lungo tutto il video */
  const kbScale = interpolate(frame, [0, durationInFrames], [1.0, 1.06]);

  /* ── Wordmark top: fade-in 0 → 30 */
  const wordmarkOpacity = interpolate(frame, [0, 30], [0, 0.95], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  /* ── Mega-title (frame 20 → 55): slide-up + blur clear + opacity */
  const titleSpring = spring({
    frame: frame - 20, fps,
    config: { damping: 16, stiffness: 95 },
    durationInFrames: 35,
  });
  const titleOpacity = titleSpring;
  const titleY       = (1 - titleSpring) * 40;
  const titleBlur    = (1 - titleSpring) * 12;

  /* ── Loghi (frame 35 → 65): scale-in + fade */
  const logosSpring = spring({
    frame: frame - 35, fps,
    config: { damping: 14, stiffness: 120 },
    durationInFrames: 30,
  });
  const logosScale = 0.7 + logosSpring * 0.3;

  /* ── Score (frame 50 → 95): count-up + scale-in + drop-shadow */
  const scoreSpring = spring({
    frame: frame - 50, fps,
    config: { damping: 11, stiffness: 80 },
    durationInFrames: 45,
  });
  const homeScoreShown = Math.round(homeScore * scoreSpring);
  const awayScoreShown = Math.round(awayScore * scoreSpring);
  const scoreScale     = 0.85 + scoreSpring * 0.15;
  const scoreOpacity   = scoreSpring;
  const scoreY         = (1 - scoreSpring) * 30;

  /* ── Marcatori (frame 85 + idx*8): fade + slide-right */
  const scorerSpring = (idx: number) => spring({
    frame: frame - (85 + idx * 8), fps,
    config: { damping: 14, stiffness: 110 },
    durationInFrames: 22,
  });

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FONT_BODY, overflow: 'hidden' }}>
      {/* ─── HERO PHOTO full-bleed con ken-burns. Z-base. */}
      <AbsoluteFill style={{
        transform: `scale(${kbScale})`,
        transformOrigin: 'center 40%',
      }}>
        <Img
          src={heroPhotoUrl}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 30%',
          }}
        />
      </AbsoluteFill>

      {/* ─── Color cast: tinta calda warm sulla foto (multiply leggero per coerenza palette LAVIKA) */}
      <AbsoluteFill style={{
        background: `linear-gradient(180deg, ${primaryColor}33 0%, transparent 30%, transparent 70%, ${accentColor}55 100%)`,
        mixBlendMode: 'multiply',
      }} />

      {/* ─── Vignette + gradients per leggibilità testo (top scuro + bottom scuro) */}
      <AbsoluteFill style={{
        background: `linear-gradient(180deg,
          rgba(0,0,0,0.65) 0%,
          rgba(0,0,0,0.25) 22%,
          rgba(0,0,0,0.0)  40%,
          rgba(0,0,0,0.0)  55%,
          rgba(0,0,0,0.55) 78%,
          rgba(0,0,0,0.85) 100%)`,
      }} />

      {/* ─── Light beam diagonale sottile (movimento continuo) */}
      <AbsoluteFill style={{
        background: `linear-gradient(108deg,
          transparent ${interpolate(((frame / fps) % 8) / 8, [0, 1], [-30, 130]) - 8}%,
          rgba(255,235,200,0.10) ${interpolate(((frame / fps) % 8) / 8, [0, 1], [-30, 130])}%,
          transparent ${interpolate(((frame / fps) % 8) / 8, [0, 1], [-30, 130]) + 8}%)`,
        mixBlendMode: 'screen',
      }} />

      {/* ─── TOP: wordmark LAVIKA centrato (sostituisce "PRESENTED BY Spotify") */}
      <div style={{
        position: 'absolute', top: POS.wordmarkTop, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        opacity: wordmarkOpacity,
      }}>
        <Img
          src={staticFile(WORDMARK_WHITE)}
          style={{
            width: POS.wordmarkWidth, height: 'auto',
            filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.7))',
          }}
        />
      </div>

      {/* ─── Eyebrow piccolo sotto il wordmark (matchday + data, opzionale) */}
      <div style={{
        position: 'absolute', top: POS.eyebrowTop, left: 0, right: 0,
        textAlign: 'center', color: 'white',
        opacity: wordmarkOpacity * 0.65,
        fontSize: POS.eyebrowFontSize, letterSpacing: POS.eyebrowLetterSpacing,
        textShadow: '0 2px 8px rgba(0,0,0,0.7)',
      }}>
        {matchday ? `GIORNATA ${matchday}` : 'AMICHEVOLE'}&nbsp;&nbsp;·&nbsp;&nbsp;SERIE C
      </div>

      {/* ─── MEGA-TITLE editorial: status del match attraversa lo schermo */}
      <div style={{
        position: 'absolute', top: POS.titleTop, left: 0, right: 0,
        textAlign: 'center', color: 'white',
        fontFamily: FONT_DISPLAY,
        fontSize: POS.titleFontSize, lineHeight: 0.9, letterSpacing: -4,
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
        filter: `blur(${titleBlur}px)`,
        textShadow: '0 12px 50px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.6)',
        userSelect: 'none',
      }}>
        {resultLabel}
      </div>

      {/* ─── SCORE MEGA bottom-left/center: 320px Anton, divider verticale */}
      <div style={{
        position: 'absolute', bottom: POS.scoreBottom, left: 80,
        color: 'white', fontFamily: FONT_DISPLAY,
        opacity: scoreOpacity,
        transform: `translateY(${scoreY}px) scale(${scoreScale})`,
        transformOrigin: 'left bottom',
        textShadow: '0 12px 60px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', gap: 36,
        fontSize: POS.scoreFontSize, lineHeight: 0.85, letterSpacing: -10,
      }}>
        <span>{homeScoreShown}</span>
        <div style={{
          width: 2, height: POS.scoreDividerH,
          background: 'rgba(255,255,255,0.55)',
          alignSelf: 'center',
        }} />
        <span>{awayScoreShown}</span>
      </div>

      {/* ─── LOGHI squadre sopra ogni cifra score con "v" italica tra i due.
              Allineati 1:1 con le colonne dello score sotto. */}
      <div style={{
        position: 'absolute', bottom: POS.logosBottom, left: 80,
        opacity: logosSpring,
        transform: `scale(${logosScale})`,
        transformOrigin: 'left bottom',
        display: 'flex', gap: 36, alignItems: 'center',
      }}>
        <div style={{ width: POS.scoreLogoCol, display: 'flex', justifyContent: 'center' }}>
          <Img src={homeLogoUrl} style={{
            width: POS.scoreLogoSize, height: POS.scoreLogoSize, objectFit: 'contain',
            filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.7))',
          }} />
        </div>
        <div style={{ width: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{
            color: 'white', opacity: 0.7,
            fontFamily: FONT_BODY, fontSize: 20, fontStyle: 'italic',
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
          }}>v</span>
        </div>
        <div style={{ width: 144, display: 'flex', justifyContent: 'center' }}>
          <Img src={awayLogoUrl} style={{
            width: POS.scoreLogoSize, height: POS.scoreLogoSize, objectFit: 'contain',
            filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.7))',
          }} />
        </div>
      </div>

      {/* ─── MARCATORI minimal bottom-right: "MIN'  COGNOME" right-aligned */}
      <div style={{
        position: 'absolute', bottom: POS.scorerBottom, right: 70,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
        color: 'white',
        textShadow: '0 2px 10px rgba(0,0,0,0.85)',
      }}>
        {scorers.map((s, i) => {
          const sp = scorerSpring(i);
          const sideColor = s.side === 'home' ? primaryColor : accentColor;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 14,
              opacity: sp,
              transform: `translateX(${(1 - sp) * 24}px)`,
            }}>
              {/* dot side colorato */}
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: sideColor,
                boxShadow: `0 0 10px ${sideColor}`,
                alignSelf: 'center',
              }} />
              {/* minuto Anton bold */}
              <span style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 28, letterSpacing: 1,
                minWidth: 50, textAlign: 'right',
              }}>{s.minute}'</span>
              {/* nome uppercase regular */}
              <span style={{
                fontSize: 18, fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                opacity: 0.95,
              }}>{s.player}</span>
            </div>
          );
        })}
      </div>

      {/* ─── Eyebrow date bottom-left (sotto score abbr) */}
      <div style={{
        position: 'absolute', bottom: POS.dateBottom, left: 80,
        color: 'white', opacity: scoreOpacity * 0.5,
        fontSize: 12, letterSpacing: 2,
        textShadow: '0 2px 8px rgba(0,0,0,0.7)',
      }}>
        {date.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
};
