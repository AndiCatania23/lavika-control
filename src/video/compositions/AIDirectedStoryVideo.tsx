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

/* Overlap frame tra scene per cross-fade (no hard cut). */
const SCENE_FADE_FRAMES = 12;

/* ──────────────────────────────────────────────────────────────────
   AMBIENT LAYERS — particles + glow + light flicker
   Riempiono di "vita" lo schermo anche mentre il testo è statico.
   ────────────────────────────────────────────────────────────────── */

/** Particle field: ~40 dots gold che driftano orizzontalmente.
    Genera atmosfera "stadium dust" continua per tutto il video. */
const ParticleField: React.FC<{ color?: string; count?: number }> = ({
  color = ACCENT_GOLD,
  count = 40,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const tsec = frame / fps;
  const dur = durationInFrames / fps;

  const particles = Array.from({ length: count }, (_, i) => {
    // Seed deterministic per particella
    const seed = i * 137.508; // golden angle distribution
    const baseX = ((Math.sin(seed) * 0.5 + 0.5) * width);
    const baseY = ((Math.cos(seed * 1.7) * 0.5 + 0.5) * height);
    const speed = 0.3 + (Math.sin(seed * 2.3) * 0.5 + 0.5) * 0.7; // 0.3-1.0
    const size = 1 + (Math.sin(seed * 3.7) * 0.5 + 0.5) * 3;       // 1-4 px
    // Posizione finale: drift orizzontale + leggera oscillazione vertical
    const x = (baseX + tsec * speed * 40) % (width + 40) - 20;
    const y = baseY + Math.sin(tsec * 1.2 + seed) * 8;
    // Opacity pulse leggero
    const opacity = 0.15 + Math.sin(tsec * 1.5 + seed) * 0.12;
    // Fade-in iniziale + fade-out finale
    const envelope = Math.min(
      Math.min(1, tsec / 0.5),
      Math.min(1, (dur - tsec) / 0.5)
    );
    return { x, y, size, opacity: opacity * envelope, key: i };
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {particles.map(p => (
        <div key={p.key} style={{
          position: 'absolute',
          left: p.x, top: p.y,
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: color,
          opacity: p.opacity,
          filter: `blur(${p.size > 2 ? 1 : 0}px)`,
          boxShadow: `0 0 ${p.size * 3}px ${color}`,
        }} />
      ))}
    </AbsoluteFill>
  );
};

/** Glow pulse: shadow box ondulante dietro al testo per "respiro". */
function pulseGlow(frame: number, fps: number, color: string, intensity = 1): string {
  const phase = Math.sin((frame / fps) * Math.PI * 1.4);
  const blur = 30 + phase * 20 * intensity;
  const spread = 8 + phase * 6 * intensity;
  return `0 0 ${blur}px ${spread}px ${color}33, 0 6px 30px rgba(0,0,0,0.7)`;
}

/** Camera shake: micro tremolio sui frame iniziali per impact. */
function cameraShake(frame: number, intensity = 2, durationFrames = 12): { x: number; y: number } {
  if (frame > durationFrames) return { x: 0, y: 0 };
  const decay = 1 - frame / durationFrames;
  const seed1 = Math.sin(frame * 13.7) * intensity * decay;
  const seed2 = Math.cos(frame * 17.3) * intensity * decay;
  return { x: seed1, y: seed2 };
}

/** Scene envelope opacity per cross-fade (fade-in + fade-out). */
function sceneOpacity(localFrame: number, duration: number): number {
  const fadeIn = Math.min(1, localFrame / SCENE_FADE_FRAMES);
  const fadeOut = Math.min(1, (duration - localFrame) / SCENE_FADE_FRAMES);
  return Math.min(fadeIn, fadeOut);
}

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
  const fadeOpacity = sceneOpacity(frame, scene.duration);
  const opacity = counterProgress * fadeOpacity;
  // Camera shake forte all'arrivo del numero finale (impact)
  const shake = cameraShake(frame, 3, 14);
  const color = colorForStyle(scene.style, tone);
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: fontSizeForStyle(scene.style, scene.text.length, true),
        lineHeight: 0.9,
        letterSpacing: -8,
        transform: `scale(${scale}) translate(${shake.x}px, ${shake.y}px)`,
        opacity,
        textShadow: pulseGlow(frame, fps, color, 1.5),
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
  const fade = sceneOpacity(frame, scene.duration);
  const color = colorForStyle(scene.style, tone);
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: 96,
        letterSpacing: 12,
        lineHeight: 1.1,
        textTransform: 'uppercase',
        transform: `translateY(${(1 - sp) * 20}px)`,
        opacity: sp * fade,
        textShadow: pulseGlow(frame, fps, color, 1.2),
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneAttribution: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone: _tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 14, stiffness: 90 }, durationInFrames: 30 });
  const fade = sceneOpacity(frame, scene.duration);
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
        opacity: sp * fade,
        textShadow: pulseGlow(frame, fps, ACCENT_GOLD, 1.3),
        textAlign: 'center',
      }}>
        — {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneTypeOn: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = sceneOpacity(frame, scene.duration);
  const color = colorForStyle(scene.style, tone);
  // LETTER-BY-LETTER reveal — più cinematografico di word-by-word
  // Wrap parole in span non-spezzabili → CSS non spezza più "Donna/rumma".
  const tokens: Array<{ text: string; start: number; isSpace: boolean }> = [];
  {
    let off = 0;
    for (const w of scene.text.split(/(\s+)/)) {
      tokens.push({ text: w, start: off, isSpace: /^\s+$/.test(w) });
      off += w.length;
    }
  }
  const totalCharsAt = interpolate(frame, [0, scene.duration * 0.75], [0, scene.text.length], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
      opacity: fade,
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: pulseGlow(frame, fps, color, 1.1),
        textAlign: 'center',
        maxWidth: 920,
      }}>
        {tokens.map((t, ti) => {
          if (t.isSpace) {
            const cp = Math.max(0, Math.min(1, totalCharsAt - t.start));
            return <span key={ti} style={{ opacity: cp }}>{t.text}</span>;
          }
          const isEmphasis = !!(scene.emphasis &&
            t.text.toLowerCase().includes(scene.emphasis.toLowerCase()));
          return (
            <span key={ti} style={{
              display: 'inline-block',
              whiteSpace: 'nowrap',
              color: isEmphasis ? ACCENT_GOLD : 'inherit',
            }}>
              {Array.from(t.text).map((ch, ci) => {
                const cp = Math.max(0, Math.min(1, totalCharsAt - (t.start + ci)));
                return (
                  <span key={ci} style={{
                    display: 'inline-block',
                    opacity: cp,
                    transform: `translateY(${(1 - cp) * 12}px) scale(${0.85 + cp * 0.15})`,
                  }}>{ch}</span>
                );
              })}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const SceneQuoteMarks: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone: _tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 12, stiffness: 70 }, durationInFrames: 25 });
  const fade = sceneOpacity(frame, scene.duration);
  const shake = cameraShake(frame, 2, 18);
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
        transform: `scale(${sp}) translate(${shake.x}px, ${(1 - sp) * 30 + shake.y}px)`,
        opacity: sp * 0.95 * fade,
        textShadow: pulseGlow(frame, fps, ACCENT_GOLD, 1.8),
      }}>
        “
      </div>
    </AbsoluteFill>
  );
};

const SceneRevealMask: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0, scene.duration * 0.6], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const fade = sceneOpacity(frame, scene.duration);
  const color = colorForStyle(scene.style, tone);
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: pulseGlow(frame, fps, color, 1.4),
        textAlign: 'center',
        maxWidth: 920,
        clipPath: `inset(0 ${100 - progress}% 0 0)`,
        opacity: fade,
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
  const fade = sceneOpacity(frame, scene.duration);
  const shake = cameraShake(frame, 2, 12);
  const color = colorForStyle(scene.style, tone);
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: pulseGlow(frame, fps, color, 1.5),
        textAlign: 'center',
        maxWidth: 920,
        transform: `scale(${0.6 + sp * 0.4}) translate(${shake.x}px, ${shake.y}px)`,
        opacity: sp * fade,
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
  const fade = sceneOpacity(frame, scene.duration);
  const color = colorForStyle(scene.style, tone);
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: pulseGlow(frame, fps, color, 1.2),
        textAlign: 'center',
        maxWidth: 920,
        transform: `translateY(${(1 - sp) * 80}px)`,
        opacity: sp * fade,
      }}>
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

const SceneFadeIn: React.FC<{ scene: z.infer<typeof sceneSchema>; tone: string }> = ({ scene, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = sceneOpacity(frame, scene.duration);
  const color = colorForStyle(scene.style, tone);
  // Subtle scale-breath durante hold per non sembrare statico
  const breath = 1 + Math.sin((frame / fps) * Math.PI * 1.2) * 0.015;
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: pulseGlow(frame, fps, color, 1.0),
        textAlign: 'center',
        maxWidth: 920,
        opacity: fade,
        transform: `scale(${breath})`,
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
  const fade = sceneOpacity(frame, scene.duration);
  const color = colorForStyle(scene.style, tone);
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        color,
        fontSize: fontSizeForStyle(scene.style, scene.text.length),
        lineHeight: 1.1,
        letterSpacing: -1,
        textShadow: pulseGlow(frame, fps, color, 1.6),
        textAlign: 'center',
        maxWidth: 920,
        transform: `scale(${pulse * entry})`,
        opacity: entry * fade,
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

  // Calcola offset cumulativo per ogni scene CON cross-fade overlap.
  // Ogni scene comincia SCENE_FADE_FRAMES prima della fine precedente
  // → cross-fade graduale invece di hard cut.
  let offset = 0;
  const sceneOffsets = scenes.map((s, i) => {
    const start = i === 0 ? 0 : offset - SCENE_FADE_FRAMES;
    offset = start + s.duration;
    return { ...s, start, extendedDuration: s.duration + SCENE_FADE_FRAMES };
  });

  // Particle field color in base al tone
  const particleColor = tone === 'provocative' ? ACCENT_WARNING : ACCENT_GOLD;

  // Wordmark fade-in negli ultimi 30 frame
  const wordmarkOpacity = interpolate(frame, [durationInFrames - 40, durationInFrames - 10], [0, 0.92], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT_BODY, overflow: 'hidden' }}>
      {/* Background */}
      <BackgroundLayer imageUrl={imageUrl} strategy={imageStrategy} />

      {/* Particle field globale — drift gold per atmosfera dinamica continua */}
      <ParticleField color={particleColor} count={45} />

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
