import { z } from 'zod';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/* ──────────────────────────────────────────────────────────────────
   Schema (props validate via zod for Remotion Studio)
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
  date:         z.string(),  // ISO or human-friendly
  venue:        z.string().optional(),
  scorers:      z.array(z.object({
    side: z.enum(['home', 'away']),
    player: z.string(),
    minute: z.number(),
  })).default([]),
  primaryColor: z.string().default('#0066CC'),  // home team primary
  accentColor:  z.string().default('#B40000'),  // home team secondary
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
  scorers: [
    { side: 'home', player: 'Lunetta',  minute: 12 },
    { side: 'home', player: 'Caturano', minute: 38 },
    { side: 'away', player: 'Tumminello', minute: 56 },
    { side: 'home', player: 'Lunetta',  minute: 78 },
  ],
  primaryColor: '#0066CC',
  accentColor:  '#B40000',
};

/* ──────────────────────────────────────────────────────────────────
   Composition: MatchScorecard
   8 secondi · 4:5 1080×1350 · h264 yuv420p
   Sequenza:
     0-1.2s  zoom-in loghi
     1.2-2.4s  reveal score (count-up)
     2.4-6s   marcatori slide-in dal basso
     6-8s   outro (logo LAVIKA + tagline)
   ────────────────────────────────────────────────────────────────── */

export const MatchScorecard: React.FC<MatchScorecardProps> = ({
  homeName, homeAbbr, homeLogoUrl, homeScore,
  awayName, awayAbbr, awayLogoUrl, awayScore,
  matchday, date, scorers, primaryColor, accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // ── Logo zoom-in (0-1.2s = 0-36 frames)
  const logoSpring = spring({
    frame, fps,
    config: { damping: 12, stiffness: 80 },
    durationInFrames: 36,
  });

  // ── Score count-up (1.2-2.4s = frames 36-72)
  const scoreProgress = interpolate(frame, [36, 72], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const homeScoreShown = Math.round(homeScore * scoreProgress);
  const awayScoreShown = Math.round(awayScore * scoreProgress);

  // ── Scorers slide-in from bottom (2.4-6s = frames 72-180)
  // Each scorer animates with 6 frame delay between
  const scorerSpring = (idx: number) => spring({
    frame: frame - (72 + idx * 6),
    fps,
    config: { damping: 14, stiffness: 100 },
    durationInFrames: 20,
  });

  // ── Background: gradient using team colors
  const bgGradient = `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`;

  return (
    <AbsoluteFill style={{ background: bgGradient, fontFamily: 'system-ui, sans-serif' }}>
      {/* Subtle dark overlay for text contrast */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)' }} />

      {/* Header: matchday + date */}
      <div style={{
        position: 'absolute', top: 60, left: 0, right: 0,
        textAlign: 'center', color: 'white',
        opacity: interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 4, opacity: 0.85 }}>
          {matchday ? `GIORNATA ${matchday}` : 'AMICHEVOLE'} · SERIE C
        </div>
        <div style={{ fontSize: 18, marginTop: 8, opacity: 0.75 }}>
          {date}
        </div>
      </div>

      {/* Main: home logo + score : score + away logo */}
      <div style={{
        position: 'absolute', top: '24%', left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30,
        transform: `scale(${logoSpring})`,
      }}>
        {/* Home */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{
            width: 200, height: 200, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Img src={homeLogoUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ color: 'white', fontSize: 36, fontWeight: 900, marginTop: 12, letterSpacing: 2 }}>
            {homeAbbr}
          </div>
        </div>

        {/* Score */}
        <div style={{
          color: 'white', fontSize: 160, fontWeight: 900, lineHeight: 1,
          letterSpacing: -4, display: 'flex', gap: 30, alignItems: 'center',
        }}>
          <span>{homeScoreShown}</span>
          <span style={{ fontSize: 80, opacity: 0.6 }}>:</span>
          <span>{awayScoreShown}</span>
        </div>

        {/* Away */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{
            width: 200, height: 200, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Img src={awayLogoUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ color: 'white', fontSize: 36, fontWeight: 900, marginTop: 12, letterSpacing: 2 }}>
            {awayAbbr}
          </div>
        </div>
      </div>

      {/* Full-time pill */}
      <div style={{
        position: 'absolute', top: '54%', left: 0, right: 0, textAlign: 'center',
        opacity: interpolate(frame, [60, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>
        <span style={{
          background: 'rgba(0,0,0,0.6)', color: 'white',
          padding: '6px 16px', borderRadius: 20,
          fontSize: 16, fontWeight: 700, letterSpacing: 3,
        }}>
          FULL-TIME
        </span>
      </div>

      {/* Scorers list */}
      <div style={{
        position: 'absolute', bottom: 200, left: 60, right: 60,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {scorers.map((s, i) => {
          const sp = scorerSpring(i);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              justifyContent: s.side === 'home' ? 'flex-start' : 'flex-end',
              opacity: sp,
              transform: `translateX(${(1 - sp) * (s.side === 'home' ? -40 : 40)}px)`,
            }}>
              <div style={{
                background: s.side === 'home' ? primaryColor : accentColor,
                color: 'white', padding: '8px 14px', borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 22, fontWeight: 700,
              }}>
                <span style={{ opacity: 0.7, fontSize: 16 }}>⚽</span>
                <span>{s.player}</span>
                <span style={{ opacity: 0.7, fontSize: 18 }}>{s.minute}'</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* LAVIKA brand mark bottom-right */}
      <div style={{
        position: 'absolute', bottom: 50, right: 60,
        color: 'white', fontSize: 24, fontWeight: 900,
        letterSpacing: 4, opacity: 0.85,
      }}>
        LΛVIKΛ
      </div>
    </AbsoluteFill>
  );
};
