#!/usr/bin/env node
// One-shot: carica il template base delle pill cover su R2.
// Uso: node scripts/upload-pill-template.mjs <path-immagine>

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

// Minimal .env.local parser (zero deps).
function loadEnvLocal(path) {
  if (!existsSync(path)) return;
  const txt = readFileSync(path, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvLocal('.env.local');

const KEY = 'pills/template/base-v1.webp';
const BUCKET = 'lavika-media';
const PUBLIC_BASE = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node scripts/upload-pill-template.mjs <path-immagine>');
  process.exit(1);
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('R2 credentials mancanti in .env.local');
  process.exit(1);
}

const fullPath = resolve(inputPath);
console.log(`Leggo ${fullPath}…`);
const buffer = readFileSync(fullPath);

console.log('Converto in WebP (max 2048px, qualità 90)…');
const webp = await sharp(buffer)
  .resize({ width: 2048, withoutEnlargement: true })
  .webp({ quality: 90 })
  .toBuffer();

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

console.log(`Upload su r2://${BUCKET}/${KEY}…`);
await client.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: KEY,
  Body: webp,
  ContentType: 'image/webp',
  CacheControl: 'public, max-age=31536000',
}));

const publicUrl = `${PUBLIC_BASE}/${KEY}`;
console.log('\nFatto.');
console.log(`Public URL: ${publicUrl}`);
console.log(`\nAggiungi a .env.local:\nPILL_COVER_BASE_URL=${publicUrl}`);
