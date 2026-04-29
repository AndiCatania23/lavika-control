import { NextResponse } from 'next/server';
import { buildDraftFromEpisode, type Platform, type FormatKey } from '@/lib/social/draftBuilder';

interface PostBody {
  episodeId: string;
  variants: Array<{
    platform: Platform;
    format: FormatKey;
    caption?: string | null;
    scheduledAt?: string | null;
  }>;
  title?: string;
}

/**
 * POST /api/social/drafts/from-episode
 * Body: { episodeId, variants: [{platform, format, caption?, scheduledAt?}], title? }
 *
 * Identico a /from-pill ma sourcing da content_episodes.
 */
export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json() as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.episodeId) return NextResponse.json({ error: 'episodeId required' }, { status: 400 });
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return NextResponse.json({ error: 'variants[] required (at least 1)' }, { status: 400 });
  }

  try {
    const result = await buildDraftFromEpisode({
      episodeId: body.episodeId,
      variants: body.variants,
      title: body.title,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      redirectTo: `/social/composer/draft/${result.draftId}`,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Errore sconosciuto',
    }, { status: 500 });
  }
}
