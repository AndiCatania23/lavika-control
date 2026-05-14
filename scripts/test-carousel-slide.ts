#!/usr/bin/env -S npx tsx
/**
 * Test CLI per carouselSlideBuilder.
 *
 * Genera 4 slide demo (2 quote + 2 stat) e le salva in /tmp/ per
 * preview visiva. Usato per iterare sul design senza E2E daemon completo.
 *
 * Usage: npx tsx scripts/test-carousel-slide.ts
 */
import path from 'path';
import fs from 'fs/promises';
import { buildCarouselSlide } from '../src/lib/social/carouselSlideBuilder';
import { splitPillToCarousel } from '../src/lib/social/pillCarouselSplitter';

// Demo pill "quote" (citazione VP Grella, palette palette Casa di C-style)
const PILL_QUOTE = {
  title: 'Vincenzo Grella: "Questa squadra deve arrivare in Serie A"',
  content:
    'Abbiamo tutte le carte in regola e le risorse garantite dal Presidente. ' +
    'Se i risultati non arrivano la colpa è mia. ' +
    'Pelligra merita di essere rispettato, viene in Italia 14 volte all\'anno.',
};

// Demo pill "stat" — non quote, no cerchio virgolette
const PILL_STAT = {
  title: '10 anni fa il trionfo playoff del Catania',
  content:
    'Era il 2016 quando il Catania conquistava la promozione in Serie B. ' +
    'Una stagione storica con 78 punti e 22 vittorie. ' +
    'I tifosi rossazzurri non dimenticheranno mai quella cavalcata.',
};

const BG_DEMO =
  'https://pub-caae50e77b854437b46967f95fd48914.r2.dev/pills/generated/test-bg.webp';

async function main() {
  const outDir = '/tmp/lavika-carousel-demo';
  await fs.mkdir(outDir, { recursive: true });

  console.log('[1/2] Generating QUOTE carousel slides...');
  const quoteSlides = splitPillToCarousel(PILL_QUOTE);
  console.log(`  splitter: ${quoteSlides.length} slide`);
  for (const slide of quoteSlides) {
    const buf = await buildCarouselSlide({
      slide,
      backgroundImageUrl: null,  // fallback gradient (no R2 image)
      isQuote: true,
    });
    const out = path.join(outDir, `quote-slide-${slide.index}.png`);
    await fs.writeFile(out, buf);
    console.log(`  ✓ ${out} (${Math.round(buf.byteLength / 1024)}kb, keywords: ${slide.keywords.join(', ')})`);
  }

  console.log('[2/2] Generating STAT carousel slides (no quote icon)...');
  const statSlides = splitPillToCarousel(PILL_STAT);
  console.log(`  splitter: ${statSlides.length} slide`);
  for (const slide of statSlides) {
    const buf = await buildCarouselSlide({
      slide,
      backgroundImageUrl: null,
      isQuote: false,
    });
    const out = path.join(outDir, `stat-slide-${slide.index}.png`);
    await fs.writeFile(out, buf);
    console.log(`  ✓ ${out} (${Math.round(buf.byteLength / 1024)}kb, keywords: ${slide.keywords.join(', ')})`);
  }

  console.log(`\nAll done. Open ${outDir}/ to preview.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
