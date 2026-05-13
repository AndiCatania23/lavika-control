import '@fontsource/anton/latin.css';
import { z } from 'zod';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/* ──────────────────────────────────────────────────────────────────
   AIDirectedStoryVideo — Renderer flessibile pipeline AI-Director-v2

   Riceve uno storyboard JSON (output di pillStoryboardBuilder.ts) e
   renderizza scene-by-scene con transizioni e animazioni dichiarate
   dall'AI. Sostituisce PillStatVideo per le pill che passano per il
   nuovo pipeline 3-step (extract → storyboard → render).

   Scene types supportati: type-on, scale-in, slide-up, fade-in,
   reveal-mask, counter-up, quote-marks, attribution, eyebrow-tag,
   pulse-emphasis.

   Story 9:16 1080×1920 · 8s @ 30fps · no audio.
   ────────────────────────────────────────────────────────────────── */

const FONT_DISPLAY = '"Anton", "Archivo Black", system-ui, sans-serif';
const FONT_BODY = 'system-ui, sans-serif';
const ACCENT_GOLD = '#FFC72C';
const ACCENT_WARNING = '#FF4444';
const WORDMARK_WHITE = 'brand/logo/lavika-wordmark-white.png';

const sceneSchema = z.object({
  id: z.string(),
  duration: z.number(),
  anim: z.enum([
    'type-on', 'scale-in', 'slide-up', 'fade-in', 'reveal-mask',
    'counter-up', 'quote-marks', 'attribution', 'eyebrow-tag', 'pulse-emphasis',
  ]),
  style: z.enum(['subtle', 'bold', 'gold', 'warning', 'glow']),
  text: z.string(),
  emphasis: z.string().optional(),
});

export const aiDirectedStoryVideoSchema = z.object({
  scenes: z.array(sceneSchema),
  imageUrl: z.string().url().optional(),
  imageStrategy: z.enum([
    'ken-burns-zoom-in', 'ken-burns-zoom-out', 'parallax-up', 'static-darken',
  ]).default('ken-burns-zoom-in'),
  tone: z.enum(['celebrative', 'nostalgic', 'provocative', 'factual']).default('factual'),
  category: z.string().optional(),
});

export type AIDirectedStoryVideoProps = z.infer<typeof aiDirectedStoryVideoSchema>;

export const defaultAIDirectedStoryVideoProps: AIDirectedStoryVideoProps = {
  scenes: [
    { id: 's1', duration: 60, anim: 'counter-up', style: 'bold', text: '10' },
    { id: 's2', duration: 60, anim: 'eyebrow-tag', style: 'gold', text: 'ANNI FA' },
    { id: 's3', duration: 90, anim: 'reveal-mask', style: 'gold', text: 'il trionfo playoff' },
    { id: 's4', duration: 30, anim: 'fade-in', style: 'subtle', text: "l'esperienza conta" },
  ],
  imageStrategy: 'ken-burns-zoom-in',
  tone: 'nostalgic',
  category: 'storia',
};

/* ──────────────────────────────────────────────────────────────────
   Style → color mapping
   ────────────────────────────────────────────────────────────────── */

function colorForStyle(style: string, tone: string): string {
  if (style === 'gold') return ACCENT_GOLD;
  if (style === 'warning') return ACCENT_WARNING;
  if (style === 'glow') return tone === 'provocative' ? ACCENT_WARNING : ACCENT_GOLD;
  return '#FFFFFF';
}

function fontSizeForStyle(style: string, textLength: number, isShortNumeric = false): number {
  if (isShortNumeric) return 520;          // counter-up numero gigante
  if (style === 'bold')  return textLength > 30 ? 88 : 120;
  if (style === 'gold')  return textLength > 30 ? 64 : 80;
  if (style === 'warning') return textLength > 30 ? 72 : 96;
  if (style === 'glow')  return 110;
  return 56;                                 // subtle
}

function textShadowForStyle(style: string, tone: string): string {
  if (style === 'gold' || style === 'glow') {
    const c = colorForStyle(style, tone);
    return `0 6px 30px ${c}44, 0 2px 8px rgba(0,0,0,0.6)`;
  }
  if (style === 'warning') {
    return `0 6px 30px ${ACCENT_WARNING}55, 0 2px 8px rgba(0,0,0,0.7)`;
  }
  return '0 6px 30px rgba(0,0,0,0.75), 0 2px 8px rgba(0,0,0,0.55)';
}

/* ──────────────────────────────────────────────────────────────────
   SCENE COMPONENTS — ogni anim ha il suo
   ────────────────────────────────────────────────────────────────── */

const SceneCounterUp: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const target = parseInt(scene.text, 10) || 0;
  const counterProgress = spring({
    frame, fps,
    config: { damping: 14, stiffness: 80 },
    durationInFrames: Math.min(scene.duration - 10, 45),
  });
  const displayed = target >= 1000
    ? (counterProgress > 0.5 ? target : 0)
    : Math.round(target * counterProgress);
  const scale = 0.7 + counterProgress * 0.3;
  const opacity = counterProgress;
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: fontSizeForStyle(scene.style, scene.text.length, true),
        lineHeight: 0.9,
        letterSpacing: -8,
        transform: `scale(${scale})`,
        opacity,
        textShadow: textShadowForStyle(scene.style, tone),
      }}>
        {displayed}
      </div>
    </AbsoluteFill>
  );
};

const SceneEyebrowTag: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 16, stiffness: 110 }, durationInFrames: 20 });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: 96,
        letterSpacing: 12,
        lineHeight: 1.1,
        textTransform: 'uppercase',
        transform: `translateY(${(1 - sp) * 20}px)`,
        opacity: sp,
        textShadow: textShadowForStyle(scene.style, tone),
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneAttribution: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 14, stiffness: 90 }, durationInFrames: 30 });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 60px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: ACCENT_GOLD,
        fontSize: 76,
        letterSpacing: 8,
        textTransform: 'uppercase',
        transform: `translateX(${(1 - sp) * -30}px)`,
        opacity: sp,
        textShadow: textShadowForStyle(scene.style, tone),
        textAlign: 'center',
      }}>
        — {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneTypeOn: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const words = scene.text.split(/\s+/);
  // Mostra le parole una alla volta lungo i primi 80% della scene
  const wordsToShow = Math.ceil(
    interpolate(frame, [0, scene.duration * 0.7], [0, words.length], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
  );
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: textShadowForStyle(scene.style, tone),
        textAlign: 'center',
        maxWidth: 920,
      }}>
        {words.map((w, i) => {
          const isEmphasis = scene.emphasis && w.toLowerCase().includes(scene.emphasis.toLowerCase());
          return (
            <span key={i} style={{
              opacity: i < wordsToShow ? 1 : 0,
              color: isEmphasis ? ACCENT_GOLD : 'inherit',
              transition: 'opacity 100ms',
              marginRight: 12,
              display: 'inline-block',
            }}>
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const SceneQuoteMarks: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene: _scene, tone: _tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 70 }, durationInFrames: 25 });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: ACCENT_GOLD,
        fontSize: 380,
        lineHeight: 0.6,
        letterSpacing: -20,
        transform: `scale(${sp}) translateY(${(1 - sp) * 30}px)`,
        opacity: sp * 0.95,
        textShadow: `0 4px 30px ${ACCENT_GOLD}55, 0 0 60px rgba(0,0,0,0.7)`,
      }}>
        “
      </div>
    </AbsoluteFill>
  );
};

const SceneRevealMask: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, scene.duration * 0.6], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: textShadowForStyle(scene.style, tone),
        textAlign: 'center',
        maxWidth: 920,
        clipPath: `inset(0 ${100 - progress}% 0 0)`,
        opacity,
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneScaleIn: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 90 }, durationInFrames: 30 });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: textShadowForStyle(scene.style, tone),
        textAlign: 'center',
        maxWidth: 920,
        transform: `scale(${0.6 + sp * 0.4})`,
        opacity: sp,
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneSlideUp: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 16, stiffness: 100 }, durationInFrames: 30 });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: textShadowForStyle(scene.style, tone),
        textAlign: 'center',
        maxWidth: 920,
        transform: `translateY(${(1 - sp) * 80}px)`,
        opacity: sp,
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneFadeIn: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: textShadowForStyle(scene.style, tone),
        textAlign: 'center',
        maxWidth: 920,
        opacity,
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const ScenePulseEmphasis: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({ frame, fps, config: { damping: 16, stiffness: 110 }, durationInFrames: 20 });
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 3) * 0.04;
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color: colorForStyle(scene.style, tone),
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: textShadowForStyle(scene.style, tone),
        textAlign: 'center',
        maxWidth: 920,
        transform: `scale(${pulse * entry})`,
        opacity: entry,
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

function renderScene(scene: z.infer<typeof sceneSchema>, tone: string) {
  switch (scene.anim) {
    case 'counter-up':       return <SceneCounterUp scene={scene} tone={tone} />;
    case 'eyebrow-tag':      return <SceneEyebrowTag scene={scene} tone={tone} />;
    case 'attribution':      return <SceneAttribution scene={scene} tone={tone} />;
    case 'type-on':          return <SceneTypeOn scene={scene} tone={tone} />;
    case 'quote-marks':      return <SceneQuoteMarks scene={scene} tone={tone} />;
    case 'reveal-mask':      return <SceneRevealMask scene={scene} tone={tone} />;
    case 'scale-in':         return <SceneScaleIn scene={scene} tone={tone} />;
    case 'slide-up':         return <SceneSlideUp scene={scene} tone={tone} />;
    case 'pulse-emphasis':   return <ScenePulseEmphasis scene={scene} tone={tone} />;
    case 'fade-in':
    default:                 return <SceneFadeIn scene={scene} tone={tone} />;
  }
}

/* ──────────────────────────────────────────────────────────────────
   BACKGROUND IMAGE + global overlays (badge top, watermark bottom)
   ────────────────────────────────────────────────────────────────── */

const BackgroundLayer: React.FC<{
  imageUrl?: string;
  strategy: AIDirectedStoryVideoProps['imageStrategy'];
}> = ({ imageUrl, strategy }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  let kbScale = 1;
  let kbY = 0;
  if (strategy === 'ken-burns-zoom-in') {
    kbScale = interpolate(frame, [0, durationInFrames], [1.0, 1.12]);
  } else if (strategy === 'ken-burns-zoom-out') {
    kbScale = interpolate(frame, [0, durationInFrames], [1.12, 1.0]);
  } else if (strategy === 'parallax-up') {
    kbY = interpolate(frame, [0, durationInFrames], [0, -60]);
  }

  return (
    <>
      <AbsoluteFill style={{ background: '#000' }} />
      {imageUrl && (
        <AbsoluteFill style={{ transform: `scale(${kbScale}) translateY(${kbY}px)` }}>
          <Img src={imageUrl} style={{
            width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center',
          }} />
        </AbsoluteFill>
      )}
      {/* Tinta scura per leggibilità */}
      <AbsoluteFill style={{ background: imageUrl ? 'rgba(0,0,0,0.55)' : 'transparent' }} />
      {/* Vignette radiale */}
      <AbsoluteFill style={{
        background: imageUrl
          ? 'radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.85) 100%)'
          : 'radial-gradient(ellipse at center, rgba(20,20,20,1) 0%, rgba(8,8,8,1) 60%, rgba(0,0,0,1) 100%)',
      }} />
      {/* Top + bottom darkener per leggibilità badge/watermark */}
      <AbsoluteFill style={{
        background: `linear-gradient(180deg,
          rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 18%,
          rgba(0,0,0,0) 78%, rgba(0,0,0,0.75) 100%)`,
      }} />
    </>
  );
};

/* ──────────────────────────────────────────────────────────────────
   ROOT COMPONENT
   ────────────────────────────────────────────────────────────────── */

export const AIDirectedStoryVideo: React.FC<AIDirectedStoryVideoProps> = ({
  scenes, imageUrl, imageStrategy = 'ken-burns-zoom-in', tone = 'factual', category,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Calcola offset cumulativo per ogni scene
  let offset = 0;
  const sceneOffsets = scenes.map(s => {
    const start = offset;
    offset += s.duration;
    return { ...s, start };
  });

  // Wordmark fade-in negli ultimi 30 frame
  const wordmarkOpacity = interpolate(frame, [durationInFrames - 40, durationInFrames - 10], [0, 0.92], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT_BODY, overflow: 'hidden' }}>
      {/* Background */}
      <BackgroundLayer imageUrl={imageUrl} strategy={imageStrategy} />

      {/* Badge top: CATEGORIA · LAVIKA SPORT */}
      <div style={{
        position: 'absolute', top: 140, left: 0, right: 0,
        textAlign: 'center', color: '#FFFFFF', opacity: 0.55,
        fontSize: 22, letterSpacing: 6, textTransform: 'uppercase',
      }}>
        {(category ?? 'LAVIKA').toUpperCase()}&nbsp;&nbsp;·&nbsp;&nbsp;LAVIKA SPORT
      </div>

      {/* Scene sequenziali — ogni Sequence isola il frame counter */}
      {sceneOffsets.map((s) => (
        <Sequence key={s.id} from={s.start} durationInFrames={s.duration}>
          {renderScene(s, tone)}
        </Sequence>
      ))}

      {/* Wordmark LAVIKA bottom — fade-in finale */}
      <div style={{
        position: 'absolute', bottom: 140, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', opacity: wordmarkOpacity,
      }}>
        <Img src={staticFile(WORDMARK_WHITE)} style={{
          width: 240, height: 'auto',
          filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.7))',
        }} />
      </div>
    </AbsoluteFill>
  );
};
