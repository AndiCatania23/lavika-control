import { NextResponse } from 'next/server';
import { getMetaConfig, getFbPageInfo, getIgAccountInfo, debugPageToken, MetaApiError } from '@/lib/meta/client';

/**
 * GET /api/social/meta/test
 * Verifica che le env Meta siano configurate e che il Page Access Token
 * sia valido. Restituisce info su FB Page + IG Business + scadenza token.
 */
export async function GET() {
  const cfg = getMetaConfig();
  if (!cfg) {
    return NextResponse.json({
      ok: false,
      error: 'Meta env vars mancanti. Configura META_APP_ID, META_APP_SECRET, META_PAGE_ID, META_PAGE_ACCESS_TOKEN, META_IG_BUSINESS_ID in .env.local',
    }, { status: 503 });
  }

  try {
    const [tokenInfo, page, ig] = await Promise.all([
      debugPageToken(),
      getFbPageInfo(),
      getIgAccountInfo(),
    ]);

    const expiresAt = tokenInfo.expires_at;
    const expiry = expiresAt === 0
      ? { status: 'never_expires' as const, message: 'Token a vita ✓' }
      : {
          status: 'expires' as const,
          expiresAt: new Date(expiresAt * 1000).toISOString(),
          daysRemaining: Math.round((expiresAt * 1000 - Date.now()) / 86400000),
        };

    return NextResponse.json({
      ok: true,
      config: {
        appId: cfg.appId,
        pageId: cfg.pageId,
        igBusinessId: cfg.igBusinessId,
      },
      token: {
        valid: tokenInfo.is_valid,
        type: tokenInfo.type,
        scopes: tokenInfo.scopes,
        expiry,
      },
      fbPage: {
        id: page.id,
        name: page.name,
        category: page.category,
        followers: page.followers_count ?? page.fan_count,
        picture: page.picture?.data?.url,
      },
      igAccount: {
        id: ig.id,
        username: ig.username,
        name: ig.name,
        followers: ig.followers_count,
        following: ig.follows_count,
        mediaCount: ig.media_count,
        biography: ig.biography,
        profilePicture: ig.profile_picture_url,
      },
    });
  } catch (err) {
    if (err instanceof MetaApiError) {
      return NextResponse.json({
        ok: false,
        error: err.message,
        meta: err.meta,
        httpStatus: err.httpStatus,
      }, { status: 502 });
    }
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Errore sconosciuto',
    }, { status: 500 });
  }
}
