import { NextResponse } from 'next/server';
import { buildDraftFromPill, type Platform, type FormatKey } from '@/lib/social/draftBuilder';

interface PostBody {
  pillId: string;
  variants: Array<{
    platform: Platform;
    format: FormatKey;
    caption?: string | null;
    scheduledAt?: string | null;
  }>;
  title?: string;
}

/**
 * POST /api/social/drafts/from-pill
 * Body: { pillId, variants: [{platform, format, caption?, scheduledAt?}], title? }
 *
 * Crea social_drafts + N social_variants + N social_asset_jobs (queued).
 * Il daemon Mac li processa via Supabase realtime.
 *
 * Response: { draftId, variantIds, jobIds, variantsCount }
 */
export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json() as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.pillId) return NextResponse.json({ error: 'pillId required' }, { status: 400 });
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return NextResponse.json({ error: 'variants[] required (at least 1)' }, { status: 400 });
  }

  try {
    const result = await buildDraftFromPill({
      pillId: body.pillId,
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
