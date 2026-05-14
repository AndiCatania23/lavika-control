import React from 'react';

/* ──────────────────────────────────────────────────────────────────
   IPhone15ProMockup — CSS-only mockup iPhone 15 Pro Titanium

   Niente asset PNG, tutto CSS/SVG inline per controllo pixel-perfect
   e modificabilità dal codice. Replica la silhouette caratteristica:
   - Frame Titanium (gradient metallo opaco con highlight specular)
   - Dynamic Island al posto del notch
   - Bordi sottili e rounded ~62px radius
   - Side buttons (action, volume up/down SX, power DX)

   Wrapper esterno applica tilt 3D + drop shadow.
   Children renderizzati DENTRO lo screen con clipping rounded.

   Default dimensioni: 480×1000 (proporzioni Pro 19.5:9 approssimate
   con bordo nero generoso intorno per la "vibe screen-show-off").
   ────────────────────────────────────────────────────────────────── */

type IPhone15ProMockupProps = {
  width?: number;
  /** rotazione Y in gradi (negativo = vista da SX). Default -5. */
  tiltDeg?: number;
  children?: React.ReactNode;
  /** scala uniforme (per zoom-in entry animation) */
  scale?: number;
  /** opacity wrapper (per fade-in scene) */
  opacity?: number;
};

const TITANIUM_LIGHT = '#5a5a60';
const TITANIUM_MID = '#3a3a3d';
const TITANIUM_DARK = '#1f1f22';
const TITANIUM_HIGHLIGHT = '#8a8a92';

export const IPhone15ProMockup: React.FC<IPhone15ProMockupProps> = ({
  width = 480,
  tiltDeg = -5,
  children,
  scale = 1,
  opacity = 1,
}) => {
  // Proporzioni Pro: aspect ratio ~ 0.46 (W/H) per device intero
  const height = Math.round(width * 2.16);
  const frameBorder = Math.round(width * 0.025);    // ~12px su 480
  const innerRadius = Math.round(width * 0.10);     // ~48px screen radius
  const outerRadius = innerRadius + frameBorder;    // ~60px outer radius
  const islandWidth = Math.round(width * 0.27);     // ~130px Dynamic Island
  const islandHeight = Math.round(width * 0.065);   // ~31px Island height
  const sideButtonW = Math.round(frameBorder * 0.5);

  return (
    <div
      style={{
        width,
        height,
        transform: `perspective(1800px) rotateY(${tiltDeg}deg) scale(${scale})`,
        transformStyle: 'preserve-3d',
        opacity,
        position: 'relative',
        filter: `drop-shadow(0 40px 80px rgba(0,0,0,0.55)) drop-shadow(0 12px 30px rgba(0,0,0,0.35))`,
      }}
    >
      {/* Outer frame — Titanium gradient con highlight specular */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: outerRadius,
          background: `
            linear-gradient(135deg,
              ${TITANIUM_LIGHT} 0%,
              ${TITANIUM_MID} 30%,
              ${TITANIUM_DARK} 55%,
              ${TITANIUM_MID} 75%,
              ${TITANIUM_LIGHT} 100%)
          `,
          // Sottile bordo esterno scuro per definire il device
          boxShadow: `
            inset 0 0 0 1px rgba(255,255,255,0.08),
            inset 0 0 0 2px rgba(0,0,0,0.4)
          `,
        }}
      />

      {/* Specular highlight bordo destro (riflesso luce camera 3D rotateY) */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          right: 0,
          width: frameBorder + 2,
          height: '40%',
          background: `linear-gradient(180deg, transparent 0%, ${TITANIUM_HIGHLIGHT} 30%, ${TITANIUM_HIGHLIGHT} 70%, transparent 100%)`,
          borderRadius: outerRadius,
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />

      {/* Side buttons SX: action + volume up + volume down */}
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: -sideButtonW + 1,
          width: sideButtonW,
          height: '4%',
          background: TITANIUM_DARK,
          borderRadius: '2px 0 0 2px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '22%',
          left: -sideButtonW + 1,
          width: sideButtonW,
          height: '7%',
          background: TITANIUM_DARK,
          borderRadius: '2px 0 0 2px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '32%',
          left: -sideButtonW + 1,
          width: sideButtonW,
          height: '7%',
          background: TITANIUM_DARK,
          borderRadius: '2px 0 0 2px',
        }}
      />

      {/* Power button DX */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          right: -sideButtonW + 1,
          width: sideButtonW,
          height: '10%',
          background: TITANIUM_DARK,
          borderRadius: '0 2px 2px 0',
        }}
      />

      {/* Screen — nero + clipping rounded per children */}
      <div
        style={{
          position: 'absolute',
          inset: frameBorder,
          background: '#000000',
          borderRadius: innerRadius,
          overflow: 'hidden',
        }}
      >
        {/* Content layer (children riempiono lo screen) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
          }}
        >
          {children}
        </div>

        {/* Dynamic Island — pillola nera al centro top dello screen */}
        <div
          style={{
            position: 'absolute',
            top: Math.round(width * 0.025),
            left: '50%',
            transform: 'translateX(-50%)',
            width: islandWidth,
            height: islandHeight,
            background: '#000000',
            borderRadius: islandHeight,
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04)`,
            zIndex: 10,
          }}
        />

        {/* Subtle screen reflection top-left (glass shine) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '50%',
            height: '40%',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />
      </div>
    </div>
  );
};
