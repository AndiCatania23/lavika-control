/**
 * R2 cleanup helpers — cancellazione asset social da Cloudflare R2
 * quando una variant o un draft viene eliminato dal DB.
 *
 * Pattern: estraggo R2 key da asset_url, chiamo DeleteObjectCommand.
 * Errori (key non trovata, R2 down) sono LOGGATI ma non bloccanti
 * (l'asset orfano non rompe nulla, può essere ripulito da cron futuro).
 */

import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2MediaClient, MEDIA_BUCKET_NAME, MEDIA_PUBLIC_BASE_URL } from '@/lib/r2MediaClient';

/**
 * Estrae la R2 key da un asset URL pubblico.
 * Es: https://pub-XXX.r2.dev/social/variantId/file.jpg → social/variantId/file.jpg
 */
function urlToR2Key(url: string): string | null {
  if (!url) return null;
  if (url.startsWith(MEDIA_PUBLIC_BASE_URL)) {
    return url.slice(MEDIA_PUBLIC_BASE_URL.length).replace(/^\/+/, '');
  }
  // Try generic pub-*.r2.dev
  const m = url.match(/^https:\/\/pub-[^.]+\.r2\.dev\/(.+)$/);
  if (m) return m[1];
  return null;
}

export interface DeleteAssetResult {
  url: string;
  key: string | null;
  ok: boolean;
  error?: string;
}

/**
 * Elimina un singolo asset da R2 dato il suo URL pubblico.
 */
export async function deleteAssetFromUrl(url: string | null | undefined): Promise<DeleteAssetResult | null> {
  if (!url) return null;
  if (!r2MediaClient) {
    console.warn('[r2Cleanup] r2MediaClient non configurato, skip');
    return { url, key: null, ok: false, error: 'r2MediaClient not configured' };
  }
  const key = urlToR2Key(url);
  if (!key) {
    return { url, key: null, ok: false, error: 'URL non riconosciuto come R2 path' };
  }
  try {
    await r2MediaClient.send(new DeleteObjectCommand({
      Bucket: MEDIA_BUCKET_NAME,
      Key: key,
    }));
    return { url, key, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[r2Cleanup] delete failed', { key, error: msg });
    return { url, key, ok: false, error: msg };
  }
}

/**
 * Elimina più asset in batch (parallelo).
 */
export async function deleteAssetsFromUrls(urls: Array<string | null | undefined>): Promise<DeleteAssetResult[]> {
  const results = await Promise.all(urls.map(deleteAssetFromUrl));
  return results.filter((r): r is DeleteAssetResult => r !== null);
}
