import React from 'react';
import { Img, staticFile } from 'remotion';

/* ──────────────────────────────────────────────────────────────────
   LavikaHomeMockup — replica home app LAVIKA per Story Video CTA

   Componente Remotion che riproduce la home dell'app native LAVIKA:
   - Status bar iOS (9:41 + signal/wifi/battery)
   - Header: wordmark + LIVE badge
   - Hero card: Match Reaction featured con CTA "GUARDA ORA"
   - Lista "Ultimi contenuti" con episode card
   - Tab bar: News · Partite · Live · Esclusive · Profilo

   I token visivi (colori, font, layout) seguono il design dell'app
   reale. Renderizzato DENTRO IPhone15ProMockup come children.

   Dimensioni progettate per fillare lo screen di un iPhone 480×1040
   (innerWidth ~456, innerHeight ~1016).
   ────────────────────────────────────────────────────────────────── */

const FONT_DISPLAY = '"Anton", "Archivo Black", system-ui, sans-serif';
const FONT_BODY = '-apple-system, "SF Pro Text", system-ui, sans-serif';
const COLOR_RED = '#E40521';
const COLOR_WHITE = '#FFFFFF';
const COLOR_BG = '#0a0a0a';
const COLOR_CARD = '#161618';
const WORDMARK_WHITE = 'brand/logo/lavika-wordmark-white.png';

type LavikaHomeMockupProps = {
  episodeInFocus: {
    title: string;
    formatLabel: string;
    formatSubtitle?: string;
    publishedRelative?: string;
    thumbnailUrl?: string;
  };
};

/* SVG icons tabbar (lucide-style stroke, monoline) */
const TabIcon: React.FC<{ name: 'news' | 'matches' | 'live' | 'exclusive' | 'profile'; active?: boolean }> = ({ name, active }) => {
  const stroke = active ? COLOR_RED : 'rgba(255,255,255,0.55)';
  const size = 22;
  const sw = 1.8;
  switch (name) {
    case 'news':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke={stroke} strokeWidth={sw} />
          <line x1="7" y1="9" x2="17" y2="9" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <line x1="7" y1="13" x2="17" y2="13" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <line x1="7" y1="17" x2="13" y2="17" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 'matches':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth={sw} />
          <path d="M12 3 L8 8 L12 12 L16 8 Z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M8 8 L4 11" stroke={stroke} strokeWidth={sw} />
          <path d="M16 8 L20 11" stroke={stroke} strokeWidth={sw} />
          <path d="M12 12 L9 17" stroke={stroke} strokeWidth={sw} />
          <path d="M12 12 L15 17" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case 'live':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" fill={stroke} />
          <path d="M7 7 a7 7 0 0 0 0 10" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <path d="M17 7 a7 7 0 0 1 0 10" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <path d="M4.5 4.5 a10 10 0 0 0 0 15" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <path d="M19.5 4.5 a10 10 0 0 1 0 15" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case 'exclusive':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 3 L19 7 L19 13 a7 7 0 0 1 -7 8 a7 7 0 0 1 -7 -8 L5 7 Z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case 'profile':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="9" r="3.5" stroke={stroke} strokeWidth={sw} />
          <path d="M5 20 a7 7 0 0 1 14 0" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
  }
};

const StatusBarIcons: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    {/* Signal bars */}
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
      <rect x="0" y="7" width="2.5" height="4" rx="0.5" fill={COLOR_WHITE} />
      <rect x="4" y="5" width="2.5" height="6" rx="0.5" fill={COLOR_WHITE} />
      <rect x="8" y="3" width="2.5" height="8" rx="0.5" fill={COLOR_WHITE} />
      <rect x="12" y="0" width="2.5" height="11" rx="0.5" fill={COLOR_WHITE} />
    </svg>
    {/* Wifi */}
    <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
      <path d="M7.5 9.5 l-0 0" stroke={COLOR_WHITE} strokeWidth="2" strokeLinecap="round" />
      <path d="M4.5 7 a4 4 0 0 1 6 0" stroke={COLOR_WHITE} strokeWidth="1.5" fill="none" />
      <path d="M2 4.5 a8 8 0 0 1 11 0" stroke={COLOR_WHITE} strokeWidth="1.5" fill="none" />
    </svg>
    {/* Battery */}
    <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
      <rect x="0.5" y="0.5" width="22" height="11" rx="2.5" stroke={COLOR_WHITE} strokeOpacity="0.5" fill="none" />
      <rect x="2" y="2" width="19" height="8" rx="1.5" fill={COLOR_WHITE} />
      <rect x="23.5" y="4" width="1.5" height="4" rx="0.5" fill={COLOR_WHITE} fillOpacity="0.5" />
    </svg>
  </div>
);

export const LavikaHomeMockup: React.FC<LavikaHomeMockupProps> = ({ episodeInFocus }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: COLOR_BG,
        fontFamily: FONT_BODY,
        display: 'flex',
        flexDirection: 'column',
        color: COLOR_WHITE,
      }}
    >
      {/* Status bar — gap top per Dynamic Island */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 30px 6px',
          fontFamily: FONT_BODY,
          fontSize: 15,
          fontWeight: 600,
          color: COLOR_WHITE,
          marginTop: 8,
        }}
      >
        <span style={{ marginLeft: 6 }}>9:41</span>
        <span style={{ width: 110 }} /> {/* spazio Dynamic Island */}
        <StatusBarIcons />
      </div>

      {/* Header LAVIKA + LIVE */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 24px 14px',
        }}
      >
        <Img src={staticFile(WORDMARK_WHITE)} style={{ height: 26, width: 'auto' }} />
        <div
          style={{
            background: COLOR_RED,
            color: COLOR_WHITE,
            fontFamily: FONT_DISPLAY,
            fontSize: 13,
            letterSpacing: 3,
            padding: '5px 11px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLOR_WHITE,
              display: 'inline-block',
            }}
          />
          LIVE
        </div>
      </div>

      {/* Hero card — Match Reaction featured */}
      <div
        style={{
          margin: '0 18px',
          borderRadius: 18,
          aspectRatio: '4 / 5',
          background: `linear-gradient(135deg, #1a0508 0%, #2a0a16 40%, #0a1428 100%)`,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 22,
        }}
      >
        {/* Subtle texture grain via radial */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 30% 30%, rgba(228,5,33,0.18) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(0,61,122,0.22) 0%, transparent 50%)',
          }}
        />
        {/* Bottom gradient per leggibilità */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.85) 100%)',
          }}
        />

        {/* 4-player silhouette placeholder — squadre line up sopra hero */}
        <div
          style={{
            position: 'absolute',
            top: '15%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 4,
            opacity: 0.75,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 56,
                height: 100,
                background: `linear-gradient(180deg, ${i % 2 === 0 ? '#1a3050' : '#3a0c14'} 0%, rgba(0,0,0,0.4) 100%)`,
                borderRadius: '40% 40% 8px 8px',
                clipPath: 'polygon(35% 0%, 65% 0%, 75% 25%, 100% 100%, 0% 100%, 25% 25%)',
              }}
            />
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <div
            style={{
              color: COLOR_WHITE,
              fontFamily: FONT_DISPLAY,
              fontSize: 30,
              letterSpacing: -0.5,
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Match <span style={{ color: COLOR_RED }}>Reaction</span>
          </div>
          <div
            style={{
              color: COLOR_WHITE,
              fontFamily: FONT_DISPLAY,
              fontSize: 12,
              letterSpacing: 3,
              opacity: 0.8,
              textTransform: 'uppercase',
              marginTop: 6,
            }}
          >
            Interviste post partita
          </div>
          <div
            style={{
              background: COLOR_RED,
              color: COLOR_WHITE,
              fontFamily: FONT_DISPLAY,
              fontSize: 15,
              letterSpacing: 2,
              padding: '10px 18px',
              borderRadius: 6,
              display: 'inline-block',
              marginTop: 16,
              textTransform: 'uppercase',
            }}
          >
            Guarda Ora
          </div>
        </div>
      </div>

      {/* Section header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '20px 24px 10px',
        }}
      >
        <span
          style={{
            color: COLOR_WHITE,
            fontFamily: FONT_DISPLAY,
            fontSize: 16,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          Ultimi Contenuti
        </span>
        <span
          style={{
            color: COLOR_RED,
            fontFamily: FONT_BODY,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Vedi tutti
        </span>
      </div>

      {/* Episode card */}
      <div
        style={{
          margin: '0 18px',
          background: COLOR_CARD,
          borderRadius: 14,
          padding: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {episodeInFocus.thumbnailUrl ? (
          <Img
            src={episodeInFocus.thumbnailUrl}
            style={{
              width: 84,
              height: 60,
              borderRadius: 8,
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 84,
              height: 60,
              background: 'linear-gradient(135deg, #2a0a14 0%, #0a1428 100%)',
              borderRadius: 8,
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* play icon */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
            >
              <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.5)" />
              <path d="M9 7 L17 12 L9 17 Z" fill={COLOR_WHITE} />
            </svg>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: COLOR_WHITE,
              fontFamily: FONT_BODY,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {episodeInFocus.title}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.55)',
              fontFamily: FONT_BODY,
              fontSize: 11,
              marginTop: 3,
            }}
          >
            {episodeInFocus.formatSubtitle ?? episodeInFocus.formatLabel}
            {episodeInFocus.publishedRelative ? ` · ${episodeInFocus.publishedRelative}` : ''}
          </div>
        </div>
      </div>

      {/* Spacer flex — push tab bar to bottom */}
      <div style={{ flex: 1 }} />

      {/* Tab bar — isolated floating-style come app reale */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '10px 12px 22px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(10,10,10,0.85)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {(['news', 'matches', 'live', 'exclusive', 'profile'] as const).map((name, i) => (
          <div
            key={name}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <TabIcon name={name} active={i === 2} />
            <span
              style={{
                fontFamily: FONT_BODY,
                fontSize: 10,
                fontWeight: 600,
                color: i === 2 ? COLOR_RED : 'rgba(255,255,255,0.55)',
                textTransform: 'capitalize',
              }}
            >
              {name === 'news' && 'News'}
              {name === 'matches' && 'Partite'}
              {name === 'live' && 'Live'}
              {name === 'exclusive' && 'Esclusive'}
              {name === 'profile' && 'Profilo'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
