import React from 'react';
import { Img, staticFile } from 'remotion';

/* ──────────────────────────────────────────────────────────────────
   LavikaHomeMockup — screenshot REALE della pagina Match Reaction app

   Versione 2 (post utente test): sostituita la replica CSS con uno
   screenshot iPhone reale della pagina /on-demand/match-reaction.
   Pixel-perfect, mostra hero "1:2 MATCH REACTION" + lista episodi reali
   (Caturano, Toscano, ecc.).

   Lo screenshot è in public/social/match-reaction-page.png
   (1170×2532, aspect 2.165 = aspect iPhone Pro screen interno).

   Renderizzato DENTRO IPhone15ProMockup come children. Cover fill,
   no distortion (aspect ratio source ~ container).
   ────────────────────────────────────────────────────────────────── */

const SCREENSHOT_PATH = 'social/match-reaction-page.png';

// Props mantenute per compatibilità API ma non utilizzate: lo screenshot
// è statico. Quando l'app cambia, si sostituisce solo il PNG senza
// toccare la composition.
type LavikaHomeMockupProps = {
  episodeInFocus?: {
    title?: string;
    formatLabel?: string;
    formatSubtitle?: string;
    publishedRelative?: string;
    thumbnailUrl?: string;
  };
};

export const LavikaHomeMockup: React.FC<LavikaHomeMockupProps> = () => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000000',
        overflow: 'hidden',
      }}
    >
      <Img
        src={staticFile(SCREENSHOT_PATH)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          display: 'block',
        }}
      />
    </div>
  );
};
