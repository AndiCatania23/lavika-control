/**
 * Meta Graph API client — minimal wrapper for LAVIKA Social Manager.
 *
 * Uses the long-lived Page Access Token saved in env vars (set up via
 * scripts/setup-meta-tokens.mjs). No OAuth flow needed at runtime —
 * single-account mode.
 *
 * Capabilities (Standard Access, Development mode):
 *   • Get FB Page info + insights
 *   • Get IG Business account info + insights
 *   • Publish to FB Page (text, photo, link, video)
 *   • Publish to IG (feed photo, carousel, reel, story)
 *   • Read/reply comments + DMs (when permissions enabled)
 */

const GRAPH_API = 'https://graph.facebook.com/v25.0';

interface MetaConfig {
  appId: string;
  appSecret: string;
  pageId: string;
  pageAccessToken: string;
  igBusinessId: string;
  pageName: string;
}

export function getMetaConfig(): MetaConfig | null {
  const appId           = process.env.META_APP_ID;
  const appSecret       = process.env.META_APP_SECRET;
  const pageId          = process.env.META_PAGE_ID;
  const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const igBusinessId    = process.env.META_IG_BUSINESS_ID;
  const pageName        = process.env.META_PAGE_NAME;

  if (!appId || !appSecret || !pageId || !pageAccessToken || !igBusinessId) {
    return null;
  }

  return {
    appId,
    appSecret,
    pageId,
    pageAccessToken,
    igBusinessId,
    pageName: pageName ?? 'Unknown',
  };
}

/* ──────────────────────────────────────────────────────────────────
   Low-level HTTP
   ────────────────────────────────────────────────────────────────── */

interface MetaError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaApiError extends Error {
  constructor(public meta: MetaError, public httpStatus: number) {
    super(`Meta API ${httpStatus}: ${meta.message}${meta.code ? ` (code ${meta.code})` : ''}`);
    this.name = 'MetaApiError';
  }
}

async function metaCall<T = unknown>(
  path: string,
  init?: RequestInit & { token?: string }
): Promise<T> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  const token = init?.token ?? cfg.pageAccessToken;
  const sep = path.includes('?') ? '&' : '?';
  const url = `${GRAPH_API}${path}${sep}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { error: { message: text } }; }
  if (!res.ok || (json as { error?: MetaError }).error) {
    throw new MetaApiError((json as { error: MetaError }).error, res.status);
  }
  return json as T;
}

/* ──────────────────────────────────────────────────────────────────
   FB Page
   ────────────────────────────────────────────────────────────────── */

export interface FbPageInfo {
  id: string;
  name: string;
  category?: string;
  followers_count?: number;
  fan_count?: number;
  picture?: { data: { url: string } };
}

export async function getFbPageInfo(): Promise<FbPageInfo> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  return metaCall<FbPageInfo>(
    `/${cfg.pageId}?fields=id,name,category,followers_count,fan_count,picture`
  );
}

/* ──────────────────────────────────────────────────────────────────
   IG Business account
   ────────────────────────────────────────────────────────────────── */

export interface IgAccountInfo {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
  website?: string;
}

export async function getIgAccountInfo(): Promise<IgAccountInfo> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  return metaCall<IgAccountInfo>(
    `/${cfg.igBusinessId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website`
  );
}

/* ──────────────────────────────────────────────────────────────────
   Token health check (verifies token is still valid + not expired)
   ────────────────────────────────────────────────────────────────── */

export interface TokenDebugInfo {
  app_id: string;
  type: string;
  application: string;
  data_access_expires_at: number;
  expires_at: number;       // 0 = never expires
  is_valid: boolean;
  scopes: string[];
}

export async function debugPageToken(): Promise<TokenDebugInfo> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  // App access token = APP_ID|APP_SECRET (used for debug calls, not request data)
  const appAccessToken = `${cfg.appId}|${cfg.appSecret}`;
  const sep = '?';
  const url = `${GRAPH_API}/debug_token${sep}input_token=${encodeURIComponent(cfg.pageAccessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
  const res = await fetch(url);
  const json = await res.json() as { data?: TokenDebugInfo; error?: MetaError };
  if (!res.ok || json.error) {
    throw new MetaApiError(json.error!, res.status);
  }
  return json.data!;
}
