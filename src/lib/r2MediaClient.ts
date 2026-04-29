import { S3Client } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

export const MEDIA_BUCKET_NAME = 'lavika-media';

/**
 * Public base URL del bucket R2.
 * - Default: dominio Cloudflare R2 standard (`pub-*.r2.dev`)
 * - Override via env `MEDIA_PUBLIC_BASE_URL` per usare custom domain
 *   (es. `https://media.lavikasport.app`).
 *
 * Il custom domain è importante perché Instagram Content Publish API
 * blacklist `pub-*.r2.dev` (untrusted scraper destination → error 9004).
 */
const R2_PUB_FALLBACK = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev';
export const MEDIA_PUBLIC_BASE_URL =
  process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? R2_PUB_FALLBACK;

/**
 * Riscrive qualsiasi URL `pub-*.r2.dev` (legacy) nel custom domain attivo.
 * Utile per asset salvati in DB col vecchio base URL prima del setup
 * custom domain — non serve migration DB, transparente al publish layer.
 */
export function rewriteToPublicBase(url: string | null | undefined): string | null {
  if (!url) return null;
  if (MEDIA_PUBLIC_BASE_URL === R2_PUB_FALLBACK) return url;  // niente da fare
  return url.replace(/^https:\/\/pub-[a-z0-9]+\.r2\.dev/, MEDIA_PUBLIC_BASE_URL);
}

export const r2MediaClient =
  accountId && accessKeyId && secretAccessKey
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      })
    : null;
