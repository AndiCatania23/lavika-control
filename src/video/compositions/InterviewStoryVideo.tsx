import '@fontsource/anton/latin.css';
import { z } from 'zod';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { IPhone15ProMockup } from '../components/IPhone15ProMockup';
import { LavikaHomeMockup } from '../components/LavikaHomeMockup';

/* ──────────────────────────────────────────────────────────────────
   InterviewStoryVideo — Story Video Fase 2 (match-reaction)

   Pipeline 3-scene cinematic per episodio match-reaction:
   - Scene 0: IntroVS (1.5s) — match identity (CATANIA vs AVVERSARIO + score)
   - Scene 1: QuoteCore (8s)   — frame video + quote giocatore + waveform + audio
   - Scene 2: CTAMockup (1.5s) — iPhone 15 Pro Titanium con home app + store badges

   Story 9:16 1080×1920 · AUDIO ON in Scene 1.

   DURATA TOTALE VARIABILE: intro (fisso 2s) + quote (durata reale del
   segment audio Whisper, variabile) + CTA (fisso 1.8s).
   Nessun cap superiore: se la frase dura 12s o più, il video si adatta.
   IG Story spezza automaticamente oltre 15s in più frame consecutivi.

   Palette BRAND CATANIA (NON gold delle pill):
   - Rosso Catania      #E40521 → accent verbo + LIVE + CTA
   - Blu Catania        #003D7A → light streaks + accent secondario
   - Nero base          #000000
   - Bianco testo       #FFFFFF

   Atomi (ParticleField, pulseGlow, cameraShake) DUPLICATI da
   AIDirectedStoryVideo. Consolidare in src/video/atoms.ts quando
   3+ composition li usano (regola memory feedback_consolidate_dont_add).
   ────────────────────────────────────────────────────────────────── */

const FONT_DISPLAY = '"Anton", "Archivo Black", system-ui, sans-serif';
const FONT_BODY = 'system-ui, sans-serif';

const COLOR_RED = '#E40521';
const COLOR_BLUE = '#003D7A';
const COLOR_WHITE = '#FFFFFF';
const COLOR_BLACK = '#000000';

const WORDMARK_WHITE = 'brand/logo/lavika-wordmark-white.png';

const SCENE_FADE_FRAMES = 12;
const SCENE_INTRO_DURATION = 90;        // 3s @ 30fps — più respiro per match+score
const SCENE_CTA_DURATION = 75;          // 2.5s @ 30fps — CTA + store badges leggibili
const DEFAULT_QUOTE_DURATION = 240;     // 8s @ 30fps (fallback Studio)
const MIN_QUOTE_DURATION = 120;         // 4s minimo Scene 1: frasi brevi estese per leggibilità

/* Timeline VARIABILE:
   - Scene 0 IntroVS:    0 → SCENE_INTRO_DURATION (fisso 60f)
   - Scene 1 QuoteCore:  48 → 48 + quoteDuration (variabile, da Whisper segment)
   - Scene 2 CTAMockup:  ... → ... + SCENE_CTA_DURATION (fisso 54f)
   Cross-fade SCENE_FADE_FRAMES (12f) di sovrapposizione tra scene. */
export function getInterviewStoryTimeline(quoteDurationFrames: number) {
  const safeQuote = Math.max(quoteDurationFrames, MIN_QUOTE_DURATION);
  const introStart = 0;
  const introDuration = SCENE_INTRO_DURATION;
  const quoteStart = introStart + introDuration - SCENE_FADE_FRAMES;
  const quoteDuration = safeQuote;
  const ctaStart = quoteStart + quoteDuration - SCENE_FADE_FRAMES;
  const ctaDuration = SCENE_CTA_DURATION;
  const total = ctaStart + ctaDuration;
  return { introStart, introDuration, quoteStart, quoteDuration, ctaStart, ctaDuration, total };
}

/** Fallback constant per Root.tsx default `durationInFrames` quando i props
 *  reali non sono ancora noti (Studio preview). calculateMetadata sovrascrive. */
export const INTERVIEW_STORY_DEFAULT_TOTAL = getInterviewStoryTimeline(DEFAULT_QUOTE_DURATION).total;

/* ──────────────────────────────────────────────────────────────────
   SCHEMA
   ────────────────────────────────────────────────────────────────── */

const teamSchema = z.object({
  name: z.string(),
  shortName: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

const matchDataSchema = z.object({
  home: teamSchema,
  away: teamSchema,
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
  stadium: z.string().optional(),
  competition: z.string().optional(),
});

const episodeForMockupSchema = z.object({
  title: z.string(),
  thumbnailUrl: z.string().url().optional(),
  formatLabel: z.string(),       // es. "Match Reaction"
  formatSubtitle: z.string().optional(), // es. "Interviste post partita"
  publishedRelative: z.string().optional(), // es. "2h fa"
});

export const interviewStoryVideoSchema = z.object({
  matchData: matchDataSchema,
  episodeFormat: z.enum(['match-reaction', 'press-conference']).default('match-reaction'),
  /** Clip MP4 PRE-tagliata del segment in cui il giocatore dice la frase.
   *  Quando presente, Scene 1 usa <OffthreadVideo> per mostrare la persona
   *  che parla (audio integrato nel video). Override del faceFrameUrl. */
  quoteClipUrl: z.string().url().optional(),
  faceFrameUrl: z.string().url().optional(),
  quote: z.string(),
  /** Sub-segments Whisper del quote, in coordinate RELATIVE alla durata
   *  del clip (start=0 = inizio quote audio). Quando presenti e ≥ 2,
   *  Scene 1 mostra il testo in modalità "karaoke" sincronizzata con
   *  l'audio (una linea alla volta, fade tra una e l'altra) invece di
   *  un testo statico unico che riempirebbe la story. Audio resta
   *  integrale, solo il testo overlay si segmenta. Se array vuoto o
   *  un solo segment → fallback statico (testo intero in una volta). */
  quoteSubSegments: z
    .array(
      z.object({
        start: z.number().min(0),
        end: z.number().min(0),
        text: z.string(),
      }),
    )
    .default([]),
  verbToHighlight: z.string().optional(),
  waveformPngUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  episodeForMockup: episodeForMockupSchema,
  /** Durata del segment audio Whisper in frame @ 30fps. Variabile per non
   *  tagliare dichiarazioni: la Scene 1 si adatta. Default 240 (8s) per
   *  Studio preview senza props reali. Floor: 60 frame (2s minimo). */
  quoteDurationFrames: z.number().int().min(MIN_QUOTE_DURATION).default(DEFAULT_QUOTE_DURATION),
});

export type InterviewStoryVideoProps = z.infer<typeof interviewStoryVideoSchema>;

export const defaultInterviewStoryVideoProps: InterviewStoryVideoProps = {
  matchData: {
    home: { name: 'CATANIA', shortName: 'CAT' },
    away: { name: 'AUDACE CERIGNOLA', shortName: 'AUC' },
    homeScore: 2,
    awayScore: 1,
    stadium: 'Stadio Angelo Massimino',
    competition: 'Serie C',
  },
  episodeFormat: 'match-reaction',
  quote: 'Abbiamo lottato fino alla fine.',
  verbToHighlight: 'lottato',
  episodeForMockup: {
    title: 'Catania – Cerignola',
    formatLabel: 'Match Reaction',
    formatSubtitle: 'Interviste post partita',
    publishedRelative: '2h fa',
  },
  quoteDurationFrames: DEFAULT_QUOTE_DURATION,
};

/* ──────────────────────────────────────────────────────────────────
   ATOMI DUPLICATI da AIDirectedStoryVideo
   TODO: consolidare in src/video/atoms.ts quando 3+ usano
   ────────────────────────────────────────────────────────────────── */

function sceneOpacity(localFrame: number, duration: number): number {
  const fadeIn = Math.min(1, localFrame / SCENE_FADE_FRAMES);
  const fadeOut = Math.min(1, (duration - localFrame) / SCENE_FADE_FRAMES);
  return Math.min(fadeIn, fadeOut);
}

function pulseGlow(frame: number, fps: number, color: string, intensity = 1): string {
  const phase = Math.sin((frame / fps) * Math.PI * 1.4);
  const blur = 30 + phase * 20 * intensity;
  const spread = 8 + phase * 6 * intensity;
  return `0 0 ${blur}px ${spread}px ${color}33, 0 6px 30px rgba(0,0,0,0.7)`;
}

function cameraShake(frame: number, intensity = 2, durationFrames = 12): { x: number; y: number } {
  if (frame > durationFrames) return { x: 0, y: 0 };
  const decay = 1 - frame / durationFrames;
  const seed1 = Math.sin(frame * 13.7) * intensity * decay;
  const seed2 = Math.cos(frame * 17.3) * intensity * decay;
  return { x: seed1, y: seed2 };
}

const ParticleField: React.FC<{ color?: string; count?: number }> = ({
  color = COLOR_RED,
  count = 40,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const tsec = frame / fps;
  const dur = durationInFrames / fps;
  const particles = Array.from({ length: count }, (_, i) => {
    const seed = i * 137.508;
    const baseX = (Math.sin(seed) * 0.5 + 0.5) * width;
    const baseY = (Math.cos(seed * 1.7) * 0.5 + 0.5) * height;
    const speed = 0.3 + (Math.sin(seed * 2.3) * 0.5 + 0.5) * 0.7;
    const size = 1 + (Math.sin(seed * 3.7) * 0.5 + 0.5) * 3;
    const x = ((baseX + tsec * speed * 40) % (width + 40)) - 20;
    const y = baseY + Math.sin(tsec * 1.2 + seed) * 8;
    const opacity = 0.15 + Math.sin(tsec * 1.5 + seed) * 0.12;
    const envelope = Math.min(Math.min(1, tsec / 0.5), Math.min(1, (dur - tsec) / 0.5));
    return { x, y, size, opacity: opacity * envelope, key: i };
  });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {particles.map((p) => (
        <div
          key={p.key}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: color,
            opacity: p.opacity,
            filter: `blur(${p.size > 2 ? 1 : 0}px)`,
            boxShadow: `0 0 ${p.size * 3}px ${color}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────────
   ATOMO NUOVO — LightStreaks
   Diagonal streaks rosso+blu che entrano dai bordi durante intro/CTA.
   Crea il "vibe MLS" delle reference (Frame 1 + Frame 3).
   ────────────────────────────────────────────────────────────────── */

const LightStreaks: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tsec = frame / fps;

  // Pulse + envelope fade-in/out
  const pulse = (Math.sin(tsec * Math.PI * 0.5) * 0.5 + 0.5) * intensity;
  const envelope = Math.min(
    Math.min(1, frame / 15),
    Math.min(1, (durationInFrames - frame) / 15),
  );

  // Motion sweeps: ogni streak ha la sua frequenza/fase → l'ensemble
  // sembra una "luce broadcast" che pulsa e respira
  const sw1X = Math.sin(tsec * 0.9) * 80;
  const sw1Y = Math.cos(tsec * 0.7) * 30;
  const sw1Rot = Math.sin(tsec * 0.6) * 6;
  const sw1Scale = 1 + Math.sin(tsec * 0.8) * 0.12;

  const sw2X = Math.cos(tsec * 1.1) * 90;
  const sw2Y = Math.sin(tsec * 0.8) * 40;
  const sw2Rot = Math.cos(tsec * 0.7) * -7;
  const sw2Scale = 1 + Math.cos(tsec * 0.9) * 0.14;

  const sw3X = Math.sin(tsec * 1.4 + 1.2) * 70;
  const sw3Rot = Math.sin(tsec * 1.0) * 5;

  const sw4X = Math.cos(tsec * 1.3 + 0.5) * 60;
  const sw4Y = Math.sin(tsec * 1.2) * 25;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      {/* Streak rosso top-left animato */}
      <div
        style={{
          position: 'absolute',
          top: -250,
          left: -350,
          width: 1300,
          height: 900,
          background: `linear-gradient(115deg, transparent 28%, ${COLOR_RED}95 50%, transparent 72%)`,
          opacity: 0.65 * pulse * envelope,
          filter: 'blur(45px)',
          transform: `translate(${sw1X}px, ${sw1Y}px) rotate(${sw1Rot}deg) scale(${sw1Scale})`,
          transformOrigin: 'center center',
        }}
      />
      {/* Streak blu bottom-right animato (contromovimento) */}
      <div
        style={{
          position: 'absolute',
          bottom: -250,
          right: -350,
          width: 1300,
          height: 900,
          background: `linear-gradient(295deg, transparent 28%, ${COLOR_BLUE}A8 50%, transparent 72%)`,
          opacity: 0.7 * pulse * envelope,
          filter: 'blur(45px)',
          transform: `translate(${sw2X}px, ${sw2Y}px) rotate(${sw2Rot}deg) scale(${sw2Scale})`,
          transformOrigin: 'center center',
        }}
      />
      {/* Streak rosso top-right secondario (fase diversa) */}
      <div
        style={{
          position: 'absolute',
          top: -150,
          right: -250,
          width: 900,
          height: 600,
          background: `linear-gradient(245deg, transparent 32%, ${COLOR_RED}70 55%, transparent 78%)`,
          opacity: 0.5 * pulse * envelope,
          filter: 'blur(40px)',
          transform: `translateX(${sw3X}px) rotate(${sw3Rot}deg)`,
        }}
      />
      {/* Streak blu top-left secondario (riempi opposite corner) */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: -200,
          width: 700,
          height: 500,
          background: `linear-gradient(65deg, transparent 35%, ${COLOR_BLUE}60 55%, transparent 75%)`,
          opacity: 0.4 * pulse * envelope,
          filter: 'blur(40px)',
          transform: `translate(${sw4X}px, ${sw4Y}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────────
   TeamCrest — logo team con fallback shortName

   Quando teams.logo_url è disponibile (API-Football), mostra il logo
   reale dentro un disco bianco trasparente con glow accent colore
   squadra. Altrimenti fallback: shortName 3 lettere su disc colorato.
   ────────────────────────────────────────────────────────────────── */
const TeamCrest: React.FC<{
  team: { name: string; shortName?: string; logoUrl?: string };
  accent: string;
  size?: number;
}> = ({ team, accent, size = 320 }) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        // Glow accent + drop shadow (no background disc)
        filter: `drop-shadow(0 0 30px ${accent}88) drop-shadow(0 12px 28px rgba(0,0,0,0.7))`,
      }}
    >
      {team.logoUrl ? (
        <Img
          src={team.logoUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: size * 0.40,
            letterSpacing: -1,
            color: '#FFFFFF',
            textTransform: 'uppercase',
            lineHeight: 1,
            textShadow: `0 0 24px ${accent}, 0 4px 12px rgba(0,0,0,0.8)`,
          }}
        >
          {team.shortName ?? team.name.slice(0, 3)}
        </div>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────
   SCENE 0 — IntroVS (match identity)
   ────────────────────────────────────────────────────────────────── */

const IntroVS: React.FC<{
  data: InterviewStoryVideoProps['matchData'];
  duration: number;
}> = ({ data, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
    durationInFrames: 30,
  });
  const fade = sceneOpacity(frame, duration);

  return (
    <AbsoluteFill
      style={{
        background: COLOR_BLACK,
        opacity: fade,
      }}
    >
      {/* Background atmospherics */}
      <LightStreaks intensity={1.2} />
      <ParticleField color={COLOR_RED} count={35} />

      {/* Top: LAVIKA wordmark + MATCH REACTION eyebrow */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: sp,
          transform: `translateY(${(1 - sp) * -20}px)`,
        }}
      >
        <Img
          src={staticFile(WORDMARK_WHITE)}
          style={{ width: 220, height: 'auto', display: 'inline-block' }}
        />
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            color: COLOR_WHITE,
            fontSize: 32,
            letterSpacing: 10,
            textTransform: 'uppercase',
            marginTop: 18,
            textShadow: '0 2px 12px rgba(0,0,0,0.8)',
          }}
        >
          Match Reaction
        </div>
      </div>

      {/* Center: POST PARTITA + 2-col [Logo grande / Score / Nome] */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 30px',
          paddingTop: 60,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            color: COLOR_RED,
            fontSize: 56,
            letterSpacing: 14,
            textTransform: 'uppercase',
            marginBottom: 60,
            opacity: sp,
            transform: `translateY(${(1 - sp) * 20}px)`,
            textShadow: pulseGlow(frame, fps, COLOR_RED, 1.4),
          }}
        >
          Post Partita
        </div>

        {/* Riga 2-col: [Logo grande, Score grande, Nome] per ogni team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 40,
            width: '100%',
            opacity: sp,
            transform: `scale(${0.9 + sp * 0.1})`,
          }}
        >
          {/* HOME */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 30,
            }}
          >
            <TeamCrest team={data.home} accent={COLOR_RED} size={340} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                color: COLOR_WHITE,
                fontSize: 240,
                lineHeight: 0.95,
                letterSpacing: -8,
                textShadow: pulseGlow(frame, fps, COLOR_RED, 1.2),
              }}
            >
              {data.homeScore}
            </div>
          </div>

          {/* VS centrale piccolo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              alignSelf: 'flex-start',
              marginTop: 130, // allinea verticalmente al centro del logo
              fontFamily: FONT_DISPLAY,
              color: COLOR_WHITE,
              fontSize: 60,
              letterSpacing: 4,
              opacity: 0.55,
              textShadow: '0 4px 16px rgba(0,0,0,0.7)',
            }}
          >
            VS
          </div>

          {/* AWAY */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 30,
            }}
          >
            <TeamCrest team={data.away} accent={COLOR_BLUE} size={340} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                color: COLOR_WHITE,
                fontSize: 240,
                lineHeight: 0.95,
                letterSpacing: -8,
                textShadow: pulseGlow(frame, fps, COLOR_BLUE, 1.2),
              }}
            >
              {data.awayScore}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Bottom: tagline */}
      <div
        style={{
          position: 'absolute',
          bottom: 180,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT_DISPLAY,
          color: COLOR_WHITE,
          fontSize: 30,
          letterSpacing: 8,
          textTransform: 'uppercase',
          opacity: sp * 0.85,
        }}
      >
        Interviste <span style={{ color: COLOR_RED }}>|</span> Emozioni{' '}
        <span style={{ color: COLOR_RED }}>|</span> Parole Vere
      </div>
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────────
   SCENE 1 — QuoteCore (face + quote + waveform + AUDIO)
   ────────────────────────────────────────────────────────────────── */

interface QuoteSubSegment { start: number; end: number; text: string }

const QuoteCore: React.FC<{
  quoteClipUrl?: string;
  faceFrameUrl?: string;
  quote: string;
  quoteSubSegments?: QuoteSubSegment[];
  verbToHighlight?: string;
  waveformPngUrl?: string;
  audioUrl?: string;
  duration: number;
}> = ({ quoteClipUrl, faceFrameUrl, quote, quoteSubSegments = [], verbToHighlight, waveformPngUrl, audioUrl, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = sceneOpacity(frame, duration);

  // Ken-burns leggero (usato solo su faceFrame statico, NON sulla clip video viva)
  const kbScale = interpolate(frame, [0, duration], [1.05, 1.15]);

  // Quote entry spring
  const quoteSp = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
    durationInFrames: 30,
  });

  // Quote words splitting per evidenziare verbo
  const verbLower = (verbToHighlight ?? '').toLowerCase().trim();
  const renderQuoteText = (text: string) => {
    if (!verbLower) return <>{text.toUpperCase()}</>;
    // Split per parola preservando spazi
    return text.split(/(\s+)/).map((token, i) => {
      const isSpace = /^\s+$/.test(token);
      if (isSpace) return <span key={i}>{token}</span>;
      const normalized = token.toLowerCase().replace(/[.,;:!?"]/g, '');
      const isVerb = normalized === verbLower || normalized.startsWith(verbLower);
      return (
        <span
          key={i}
          style={{
            color: isVerb ? COLOR_RED : COLOR_WHITE,
            textShadow: isVerb
              ? pulseGlow(frame, fps, COLOR_RED, 1.3)
              : '0 4px 20px rgba(0,0,0,0.8)',
          }}
        >
          {token.toUpperCase()}
        </span>
      );
    });
  };

  return (
    <AbsoluteFill style={{ background: COLOR_BLACK, opacity: fade }}>
      {/* Background priorità: clip video viva > face frame statico > gradient */}
      {quoteClipUrl ? (
        // VIDEO CLIP del momento esatto in cui il giocatore dice la frase.
        // OffthreadVideo: decoding fuori thread → render più veloce e
        // stabile su clip lunghe. Audio del giocatore integrato nel clip,
        // NIENTE <Audio> separato (sync naturale, no drift).
        //
        // Centratura volto: nelle interviste post-match il broadcaster
        // mette banner/logo in alto e il personaggio nel terzo inferiore.
        // Con cover 9:16 il volto resta basso. Soluzione: scale(1.18) +
        // translateY(-7%) → zoom leggero + shift verso il basso del source
        // = volto al centro. Perdita qualità ~6%, impercettibile su mobile.
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <OffthreadVideo
            src={quoteClipUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scale(1.18) translateY(-7%)',
              transformOrigin: 'center center',
            }}
            // Fade-out audio negli ultimi 0.6s (18 frame @ 30fps): l'audio
            // si dissolve gradualmente prima del cut alla CTA invece di
            // troncare l'ultima sillaba con uno stop brusco.
            volume={(f) => {
              const FADE_FRAMES = 18;
              const fadeStart = duration - FADE_FRAMES;
              if (f < fadeStart) return 1;
              return Math.max(0, 1 - (f - fadeStart) / FADE_FRAMES);
            }}
          />
        </AbsoluteFill>
      ) : faceFrameUrl ? (
        <>
          {/* Audio originale separato solo se NON c'è il video clip */}
          {audioUrl && <Audio src={audioUrl} />}
          <AbsoluteFill style={{ transform: `scale(${kbScale})` }}>
            <Img
              src={faceFrameUrl}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 30%',
              }}
            />
          </AbsoluteFill>
        </>
      ) : (
        <>
          {audioUrl && <Audio src={audioUrl} />}
          <AbsoluteFill
            style={{
              background: `linear-gradient(180deg, #1a0508 0%, #0a0a14 60%, #000 100%)`,
            }}
          />
        </>
      )}

      {/* Tinta scura per leggibilità quote — versione "preserva-volto":
          scuro solo agli estremi (top per badge LAVIKA, bottom per quote+wave),
          al centro (zona volto del personaggio) quasi pulito. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.1) 22%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.85) 85%, rgba(0,0,0,0.95) 100%)',
        }}
      />

      {/* Top wordmark + format pill — dimensioni mobile-friendly (2x ca) */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          left: 60,
          display: 'flex',
          alignItems: 'flex-start',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <Img src={staticFile(WORDMARK_WHITE)} style={{ width: 240, height: 'auto' }} />
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            color: COLOR_WHITE,
            fontSize: 36,
            letterSpacing: 9,
            opacity: 0.92,
            textTransform: 'uppercase',
            marginLeft: 4,
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}
        >
          Match Reaction
        </div>
      </div>

      {/* Top right: INTERVISTA POST PARTITA badge — 2x mobile-friendly */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          right: 60,
          textAlign: 'right',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: COLOR_RED,
            padding: '14px 24px',
            fontFamily: FONT_DISPLAY,
            fontSize: 36,
            letterSpacing: 6,
            color: COLOR_WHITE,
            textTransform: 'uppercase',
            boxShadow: '0 4px 16px rgba(228,5,33,0.4)',
          }}
        >
          Intervista
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            color: COLOR_WHITE,
            fontSize: 28,
            letterSpacing: 7,
            opacity: 0.92,
            textTransform: 'uppercase',
            marginTop: 12,
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}
        >
          Post Partita
        </div>
      </div>

      {/* Quote block — virgolette + testo + waveform */}
      <div
        style={{
          position: 'absolute',
          bottom: 260,
          left: 60,
          right: 60,
          opacity: quoteSp,
          transform: `translateY(${(1 - quoteSp) * 30}px)`,
        }}
      >
        {/* Virgoletta apertura big */}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            color: COLOR_WHITE,
            fontSize: 180,
            lineHeight: 0.6,
            letterSpacing: -12,
            marginBottom: -20,
            opacity: 0.9,
          }}
        >
          “
        </div>

        {/* Quote text — modalità karaoke se ci sono sub-segments Whisper
            sincronizzati con l'audio, fallback testo statico altrimenti. */}
        {(() => {
          const useKaraoke = quoteSubSegments.length >= 2;
          const tsec = frame / fps;
          const KARAOKE_FADE_SEC = 0.18;

          if (useKaraoke) {
            // Trova il segment attivo al tempo corrente. Se nessuno match
            // (es. micro-gap tra segments), mostra l'ultimo già iniziato.
            let activeIdx = quoteSubSegments.findIndex(
              (s) => tsec >= s.start && tsec < s.end,
            );
            if (activeIdx === -1) {
              for (let i = quoteSubSegments.length - 1; i >= 0; i--) {
                if (tsec >= quoteSubSegments[i].start) { activeIdx = i; break; }
              }
            }
            if (activeIdx === -1) return null; // prima del primo segment

            const active = quoteSubSegments[activeIdx];
            const text = active.text;
            // Fade-in nei primi KARAOKE_FADE_SEC dopo l'inizio segment,
            // fade-out negli ultimi KARAOKE_FADE_SEC prima della fine.
            const fadeIn = Math.min(1, Math.max(0, (tsec - active.start) / KARAOKE_FADE_SEC));
            const fadeOut = Math.min(1, Math.max(0, (active.end - tsec) / KARAOKE_FADE_SEC));
            const segOpacity = Math.min(fadeIn, fadeOut);

            return (
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  // Karaoke: ogni segment è 1-2 righe (4-8s parlato).
                  // Font scaling meno aggressivo perché la stringa è breve.
                  fontSize: text.length > 60 ? 88 : text.length > 35 ? 100 : 116,
                  lineHeight: 1.05,
                  letterSpacing: -1,
                  color: COLOR_WHITE,
                  textTransform: 'uppercase',
                  textShadow: '0 4px 20px rgba(0,0,0,0.8)',
                  opacity: segOpacity,
                  minHeight: 240, // riserva spazio costante → no jump tra segment di lunghezza diversa
                }}
              >
                {renderQuoteText(text)}
              </div>
            );
          }

          // Fallback: testo intero statico (vecchio comportamento).
          return (
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: quote.length > 60 ? 78 : quote.length > 40 ? 92 : 108,
                lineHeight: 1.05,
                letterSpacing: -1,
                color: COLOR_WHITE,
                textTransform: 'uppercase',
                textShadow: '0 4px 20px rgba(0,0,0,0.8)',
              }}
            >
              {renderQuoteText(quote)}
            </div>
          );
        })()}

        {/* Virgoletta chiusura big */}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            color: COLOR_WHITE,
            fontSize: 180,
            lineHeight: 0.6,
            letterSpacing: -12,
            marginTop: -40,
            textAlign: 'right',
            opacity: 0.9,
          }}
        >
          ”
        </div>
      </div>

      {/* Waveform */}
      <div
        style={{
          position: 'absolute',
          bottom: 140,
          left: 60,
          right: 60,
          height: 70,
          opacity: quoteSp * 0.85,
        }}
      >
        {waveformPngUrl ? (
          <Img
            src={waveformPngUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          // Placeholder: 60 barre animate sinusoidali
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%' }}>
            {Array.from({ length: 60 }, (_, i) => {
              const phase = (frame / fps) * 4 + i * 0.3;
              const h = 20 + Math.abs(Math.sin(phase)) * 50;
              const isRed = i < 30;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: h,
                    background: isRed
                      ? `linear-gradient(to top, ${COLOR_RED}, ${COLOR_WHITE})`
                      : `linear-gradient(to top, ${COLOR_BLUE}, ${COLOR_WHITE})`,
                    borderRadius: 2,
                    opacity: 0.7,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────────
   Store Badges — SVG inline (look brand-coerente Apple/Google)
   ────────────────────────────────────────────────────────────────── */

const BADGE_HEIGHT = 88;
const BADGE_RADIUS = 14;
const BADGE_BG = '#000000';
const BADGE_BORDER = 'rgba(255,255,255,0.9)';

const AppStoreBadge: React.FC = () => (
  <div
    style={{
      height: BADGE_HEIGHT,
      paddingLeft: 18,
      paddingRight: 22,
      borderRadius: BADGE_RADIUS,
      background: BADGE_BG,
      border: `1.5px solid ${BADGE_BORDER}`,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
    }}
  >
    {/* Apple logo */}
    <svg width="36" height="44" viewBox="0 0 384 444" fill="#FFFFFF">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
    </svg>
    {/* Caption + Wordmark */}
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <span style={{
        fontFamily: FONT_BODY,
        color: '#FFFFFF',
        fontSize: 14,
        lineHeight: 1.1,
        opacity: 0.92,
        letterSpacing: 0.3,
      }}>
        Scarica su
      </span>
      <span style={{
        fontFamily: FONT_BODY,
        color: '#FFFFFF',
        fontSize: 26,
        lineHeight: 1.05,
        fontWeight: 600,
        letterSpacing: -0.3,
        marginTop: 2,
      }}>
        App Store
      </span>
    </div>
  </div>
);

const GooglePlayBadge: React.FC = () => (
  <div
    style={{
      height: BADGE_HEIGHT,
      paddingLeft: 18,
      paddingRight: 22,
      borderRadius: BADGE_RADIUS,
      background: BADGE_BG,
      border: `1.5px solid ${BADGE_BORDER}`,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
    }}
  >
    {/* Google Play triangle — 4 colored quadrants */}
    <svg width="36" height="42" viewBox="0 0 512 555" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="gp-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00A1FF" />
          <stop offset="100%" stopColor="#00E1FF" />
        </linearGradient>
        <linearGradient id="gp-grad2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFCE00" />
          <stop offset="100%" stopColor="#FFEA00" />
        </linearGradient>
        <linearGradient id="gp-grad3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF3A44" />
          <stop offset="100%" stopColor="#C31162" />
        </linearGradient>
        <linearGradient id="gp-grad4" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#00F076" />
          <stop offset="100%" stopColor="#00C66D" />
        </linearGradient>
      </defs>
      {/* 4 triangle wedges — Google Play official 4-color logo */}
      <path d="M14 14 v520 L274 274 Z" fill="url(#gp-grad1)" />
      <path d="M14 14 L370 200 L274 274 Z" fill="url(#gp-grad2)" />
      <path d="M370 200 L498 277 L370 354 L274 274 Z" fill="url(#gp-grad3)" />
      <path d="M14 534 L274 274 L370 354 Z" fill="url(#gp-grad4)" />
    </svg>
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <span style={{
        fontFamily: FONT_BODY,
        color: '#FFFFFF',
        fontSize: 14,
        lineHeight: 1.1,
        opacity: 0.92,
        letterSpacing: 0.3,
      }}>
        Disponibile su
      </span>
      <span style={{
        fontFamily: FONT_BODY,
        color: '#FFFFFF',
        fontSize: 26,
        lineHeight: 1.05,
        fontWeight: 600,
        letterSpacing: -0.3,
        marginTop: 2,
      }}>
        Google Play
      </span>
    </div>
  </div>
);

/* ──────────────────────────────────────────────────────────────────
   SCENE 2 — CTAMockup (iPhone 15 Pro Titanium + store badges)
   ────────────────────────────────────────────────────────────────── */

const CTAMockup: React.FC<{
  episodeForMockup: InterviewStoryVideoProps['episodeForMockup'];
  duration: number;
}> = ({ episodeForMockup, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 100 },
    durationInFrames: 30,
  });
  const fade = sceneOpacity(frame, duration);

  return (
    <AbsoluteFill
      style={{
        background: COLOR_BLACK,
        opacity: fade,
      }}
    >
      <LightStreaks intensity={1.0} />
      <ParticleField color={COLOR_RED} count={25} />

      {/* Layout flex column: top labels + iPhone center + CTA bottom.
       *  Il middle ha flex:1 → iPhone si centra automaticamente nello
       *  spazio rimanente tra top e bottom = simmetria perfetta. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: '120px 30px 100px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* TOP: LAVIKA wordmark + MATCH REACTION + INTERVISTE POST PARTITA
            Mobile-friendly: tutto +60% più grande. */}
        <div
          style={{
            textAlign: 'center',
            opacity: sp,
            transform: `translateY(${(1 - sp) * -20}px)`,
          }}
        >
          <Img
            src={staticFile(WORDMARK_WHITE)}
            style={{ width: 320, height: 'auto', display: 'inline-block' }}
          />
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              color: COLOR_WHITE,
              fontSize: 56,
              letterSpacing: 10,
              textTransform: 'uppercase',
              marginTop: 18,
              lineHeight: 1,
              textShadow: '0 2px 12px rgba(0,0,0,0.85)',
            }}
          >
            Match <span style={{ color: COLOR_RED }}>Reaction</span>
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              color: COLOR_WHITE,
              fontSize: 28,
              letterSpacing: 7,
              opacity: 0.88,
              textTransform: 'uppercase',
              marginTop: 10,
              textShadow: '0 2px 10px rgba(0,0,0,0.75)',
            }}
          >
            Interviste post partita
          </div>
        </div>

        {/* MIDDLE: iPhone centrato verticalmente nello spazio rimanente */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IPhone15ProMockup
            width={440}
            tiltDeg={-5}
            scale={0.94 + sp * 0.06}
            opacity={sp}
          >
            <LavikaHomeMockup episodeInFocus={episodeForMockup} />
          </IPhone15ProMockup>
        </div>

        {/* BOTTOM: SCARICA L'APP + LIVE + badges */}
        <div
          style={{
            textAlign: 'center',
            opacity: sp,
            transform: `translateY(${(1 - sp) * 20}px)`,
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              color: COLOR_WHITE,
              fontSize: 78,
              letterSpacing: 8,
              textTransform: 'uppercase',
              marginBottom: 20,
              textShadow: '0 4px 20px rgba(0,0,0,0.85)',
              lineHeight: 1,
            }}
          >
            Scarica l'App
          </div>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              color: COLOR_WHITE,
              fontSize: 36,
              letterSpacing: 6,
              textTransform: 'uppercase',
              opacity: 0.95,
              marginBottom: 32,
              textShadow: '0 2px 10px rgba(0,0,0,0.7)',
            }}
          >
            La puntata completa è <span style={{ color: COLOR_RED }}>LIVE</span>
          </div>

          {/* Store badges — SVG inline, look ufficiale brand-coerente */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 30,
              alignItems: 'center',
            }}
          >
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ──────────────────────────────────────────────────────────────────
   ROOT COMPONENT
   ────────────────────────────────────────────────────────────────── */

export const InterviewStoryVideo: React.FC<InterviewStoryVideoProps> = ({
  matchData,
  quoteClipUrl,
  faceFrameUrl,
  quote,
  quoteSubSegments = [],
  verbToHighlight,
  waveformPngUrl,
  audioUrl,
  episodeForMockup,
  quoteDurationFrames = DEFAULT_QUOTE_DURATION,
}) => {
  const tl = getInterviewStoryTimeline(quoteDurationFrames);
  return (
    <AbsoluteFill style={{ fontFamily: FONT_BODY, overflow: 'hidden', background: COLOR_BLACK }}>
      <Sequence from={tl.introStart} durationInFrames={tl.introDuration}>
        <IntroVS data={matchData} duration={tl.introDuration} />
      </Sequence>

      <Sequence from={tl.quoteStart} durationInFrames={tl.quoteDuration}>
        <QuoteCore
          quoteClipUrl={quoteClipUrl}
          faceFrameUrl={faceFrameUrl}
          quote={quote}
          quoteSubSegments={quoteSubSegments}
          verbToHighlight={verbToHighlight}
          waveformPngUrl={waveformPngUrl}
          audioUrl={audioUrl}
          duration={tl.quoteDuration}
        />
      </Sequence>

      <Sequence from={tl.ctaStart} durationInFrames={tl.ctaDuration}>
        <CTAMockup episodeForMockup={episodeForMockup} duration={tl.ctaDuration} />
      </Sequence>
    </AbsoluteFill>
  );
};
