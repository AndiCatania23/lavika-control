#!/usr/bin/env node
/**
 * Quick CLI test for assetBuilder. Generates JPEGs for all 6 formats
 * with a sample cover + title, saves to /tmp/lavika-test/.
 *
 * Run:
 *   cd ~/LAVIKA-SPORT/repos/control
 *   npx tsx scripts/test-asset-builder.mjs
 */

import { buildSocialAsset, SOCIAL_FORMATS } from '../src/lib/social/assetBuilder';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

const TEST_COVER = process.env.TEST_COVER ||
  'https://pub-caae50e77b854437b46967f95fd48914.r2.dev/pills/pill-stat-h.webp';

const TEST_TITLE = process.env.TEST_TITLE ||
  'Sette di fila. La striscia più lunga dal 2014.';

async function main() {
  const outDir = path.join(tmpdir(), 'lavika-test');
  await mkdir(outDir, { recursive: true });

  console.log(`\nSource: ${TEST_COVER}`);
  console.log(`Title:  "${TEST_TITLE}"`);
  console.log(`Output: ${outDir}\n`);

  for (const fmt of SOCIAL_FORMATS) {
    process.stdout.write(`  ${fmt.id.padEnd(18)} (${fmt.aspect.padEnd(4)} · ${fmt.width}×${fmt.height})…  `);
    const t0 = Date.now();
    try {
      const asset = await buildSocialAsset({
        sourceUrl: TEST_COVER,
        format: fmt.id,
        title: TEST_TITLE,
      });
      const file = path.join(outDir, `${fmt.id}.jpg`);
      await writeFile(file, asset.buffer);
      const ms = Date.now() - t0;
      const kb = Math.round(asset.buffer.byteLength / 1024);
      console.log(`✓ ${kb}KB · ${ms}ms · ${asset.renderedLines.length} righe testo`);
    } catch (err) {
      console.log(`✗ ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. Apri i file in:\n  open ${outDir}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
