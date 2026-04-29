import { NextResponse } from 'next/server';
import { publishFbPhotoPost, publishIgPhotoPost } from '@/lib/meta/publisher';
import { MetaApiError } from '@/lib/meta/client';

interface PublishBody {
  imageUrl: string;
  caption?: string;
  platforms: Array<'fb' | 'ig'>;
}

interface PublishResult {
  platform: 'fb' | 'ig';
  ok: boolean;
  postId?: string;
  permalink?: string;
  error?: string;
}

/**
 * POST /api/social/meta/test-publish
 * Body: { imageUrl: string, caption?: string, platforms: ['fb' | 'ig'] }
 *
 * Endpoint TEST per validare publisher Meta prima di costruire il vero
 * Composer flow. Pubblica una foto + caption in modo immediato sui canali
 * scelti. NESSUNA validazione brand-check, NESSUNA persistenza in social_drafts.
 *
 * Response: { results: PublishResult[] }
 */
export async function POST(request: Request) {
  let body: PublishBody;
  try {
    body = await request.json() as PublishBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.imageUrl || !/^https:\/\//.test(body.imageUrl)) {
    return NextResponse.json({ error: 'imageUrl deve essere un URL HTTPS' }, { status: 400 });
  }
  if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
    return NextResponse.json({ error: 'Specifica almeno una piattaforma in platforms[]' }, { status: 400 });
  }

  const results: PublishResult[] = [];

  for (const platform of body.platforms) {
    try {
      if (platform === 'fb') {
        const r = await publishFbPhotoPost({ imageUrl: body.imageUrl, caption: body.caption });
        results.push({
          platform: 'fb',
          ok: true,
          postId: r.post_id ?? r.id,
          permalink: r.permalink_url,
        });
      } else if (platform === 'ig') {
        const r = await publishIgPhotoPost({ imageUrl: body.imageUrl, caption: body.caption });
        results.push({
          platform: 'ig',
          ok: true,
          postId: r.id,
          permalink: r.permalink,
        });
      } else {
        results.push({ platform, ok: false, error: 'Piattaforma non supportata in test-publish' });
      }
    } catch (err) {
      const msg = err instanceof MetaApiError
        ? err.message
        : err instanceof Error ? err.message : 'Errore sconosciuto';
      results.push({ platform, ok: false, error: msg });
    }
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
