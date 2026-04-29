/**
 * social-insights-fetcher
 *
 * Edge Function chiamata da pg_cron per popolare le tabelle insights.
 * Tasks supportati:
 *   - account_snapshot  → 1 row/canale/giorno in social_account_snapshots
 *   - post_insights     → 1 row/post/giorno in social_post_insights (ultimi 14gg)
 *   - all               → entrambi (default)
 *
 * Auth: verify_jwt=false. Il caller (pg_cron) deve passare
 * X-Insights-Secret: $INSIGHTS_CRON_SECRET. Senza secret risponde 401.
 *
 * Env vars (settare via `supabase secrets set` o dashboard):
 *   META_PAGE_ID, META_PAGE_ACCESS_TOKEN, META_IG_BUSINESS_ID,
 *   INSIGHTS_CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const META_GRAPH_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const POSTS_LOOKBACK_DAYS = 14;
const POSTS_LIMIT = 25;

const env = (k: string, required = true): string => {
  const v = Deno.env.get(k);
  if (!v && required) throw new Error(`Missing env: ${k}`);
  return v ?? "";
};

let _config: ReturnType<typeof loadConfig> | null = null;
function loadConfig() {
  return {
    PAGE_ID: env("META_PAGE_ID"),
    PAGE_TOKEN: env("META_PAGE_ACCESS_TOKEN"),
    IG_BUSINESS_ID: env("META_IG_BUSINESS_ID"),
    SHARED_SECRET: env("INSIGHTS_CRON_SECRET"),
    SUPABASE_URL: env("SUPABASE_URL"),
    SERVICE_KEY: env("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
const config = () => (_config ??= loadConfig());

function supabase() {
  const c = config();
  return createClient(c.SUPABASE_URL, c.SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

async function fetchMeta(path: string, params: Record<string, string> = {}) {
  const u = new URL(`${META_BASE}${path}`);
  u.searchParams.set("access_token", config().PAGE_TOKEN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Meta ${path} ${r.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const todayUtc = () => new Date().toISOString().split("T")[0];

// ============================================================================
// ACCOUNT SNAPSHOT
// ============================================================================
async function snapshotAccounts(): Promise<{ instagram: unknown; facebook: unknown }> {
  const c = config();
  const sb = supabase();
  const today = todayUtc();
  const out: { instagram: unknown; facebook: unknown } = {
    instagram: null,
    facebook: null,
  };

  // ---------------- INSTAGRAM ----------------
  try {
    const igInfo = await fetchMeta(`/${c.IG_BUSINESS_ID}`, {
      fields: "followers_count,follows_count,media_count",
    });

    // IG insights — period=day per ultimi 28d, sommiamo
    const since = Math.floor((Date.now() - 28 * 86_400_000) / 1000);
    const until = Math.floor(Date.now() / 1000);

    // Meta v18+: 'impressions' rimossa per IG, sostituita da 'views'.
    // Lista valida oggi: reach, views, profile_views, accounts_engaged, total_interactions, ...
    let igInsights: { data?: Array<{ name: string; values?: Array<{ value: number }> }> } = {};
    try {
      igInsights = await fetchMeta(`/${c.IG_BUSINESS_ID}/insights`, {
        metric: "reach,views,profile_views,accounts_engaged,total_interactions",
        period: "day",
        since: String(since),
        until: String(until),
        metric_type: "total_value",
      });
    } catch {
      igInsights = await fetchMeta(`/${c.IG_BUSINESS_ID}/insights`, {
        metric: "reach,views,profile_views",
        metric_type: "total_value",
        period: "day",
      });
    }

    const sumMetric = (name: string) => {
      const series = igInsights.data?.find((d) => d.name === name);
      if (!series?.values) return 0;
      return series.values.reduce((s, v) => s + (v.value ?? 0), 0);
    };

    const row = {
      platform: "instagram" as const,
      account_id: c.IG_BUSINESS_ID,
      snapshot_date: today,
      followers_count: igInfo.followers_count ?? null,
      reach_28d: sumMetric("reach"),
      // Meta IG v18+: 'impressions' rinominato in 'views' (content views)
      impressions_28d: sumMetric("views") || sumMetric("impressions"),
      profile_views_28d: sumMetric("profile_views"),
      raw: { igInfo, igInsights },
    };

    const { error } = await sb
      .from("social_account_snapshots")
      .upsert(row, { onConflict: "platform,account_id,snapshot_date" });
    if (error) throw error;
    out.instagram = { followers: row.followers_count, reach_28d: row.reach_28d };
  } catch (e) {
    out.instagram = { error: String(e) };
  }

  // ---------------- FACEBOOK PAGE ----------------
  try {
    const fbInfo = await fetchMeta(`/${c.PAGE_ID}`, {
      fields: "fan_count,followers_count",
    });

    let fbInsights: { data?: Array<{ name: string; values?: Array<{ value: number }> }> } = {};
    try {
      fbInsights = await fetchMeta(`/${c.PAGE_ID}/insights`, {
        metric: "page_impressions,page_views_total,page_post_engagements",
        period: "days_28",
      });
    } catch (e) {
      // Some metrics are deprecated in newer API versions, capture and continue
      fbInsights = { data: [] };
      console.warn("FB Page insights failed:", e);
    }

    const fbMetric = (name: string) =>
      fbInsights.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;

    const row = {
      platform: "facebook" as const,
      account_id: c.PAGE_ID,
      snapshot_date: today,
      followers_count: fbInfo.followers_count ?? fbInfo.fan_count ?? null,
      reach_28d: null,
      impressions_28d: fbMetric("page_impressions"),
      profile_views_28d: fbMetric("page_views_total"),
      raw: { fbInfo, fbInsights },
    };

    const { error } = await sb
      .from("social_account_snapshots")
      .upsert(row, { onConflict: "platform,account_id,snapshot_date" });
    if (error) throw error;
    out.facebook = { followers: row.followers_count, impressions_28d: row.impressions_28d };
  } catch (e) {
    out.facebook = { error: String(e) };
  }

  return out;
}

// ============================================================================
// POST INSIGHTS
// ============================================================================
async function snapshotPosts(): Promise<{ instagram: number; facebook: number; errors: string[] }> {
  const c = config();
  const sb = supabase();
  const cutoff = Date.now() - POSTS_LOOKBACK_DAYS * 86_400_000;
  const errors: string[] = [];
  let igCount = 0;
  let fbCount = 0;

  // ---------------- INSTAGRAM MEDIA ----------------
  try {
    const igMedia = await fetchMeta(`/${c.IG_BUSINESS_ID}/media`, {
      fields: "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp",
      limit: String(POSTS_LIMIT),
    });

    for (const m of igMedia.data ?? []) {
      const publishedMs = new Date(m.timestamp).getTime();
      if (publishedMs < cutoff) continue;

      const isReel = m.media_product_type === "REELS";
      const isVideo = m.media_type === "VIDEO" || isReel;
      const isStory = m.media_product_type === "STORY";
      if (isStory) continue;

      const metricList = isVideo
        ? "reach,likes,comments,shares,saved,plays,total_interactions"
        : "reach,likes,comments,shares,saved,total_interactions";

      let insights: { data?: Array<{ name: string; values?: Array<{ value: number }> }> } = {};
      try {
        insights = await fetchMeta(`/${m.id}/insights`, { metric: metricList });
      } catch (e) {
        errors.push(`IG ${m.id}: ${e}`);
        continue;
      }

      const get = (name: string) =>
        insights.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;
      const reach = Number(get("reach")) || 0;
      const likes = Number(get("likes")) || 0;
      const comments = Number(get("comments")) || 0;
      const shares = Number(get("shares")) || 0;
      const saves = Number(get("saved")) || 0;
      const totalInteractions = Number(get("total_interactions")) || 0;
      const numerator = totalInteractions || (likes + comments + shares + saves);
      const engRate = reach > 0 ? Math.min(numerator / reach, 9.9999) : 0;

      const { error } = await sb.from("social_post_insights").upsert(
        {
          platform: "instagram",
          external_post_id: m.id,
          published_at: m.timestamp,
          media_type: isReel ? "reel" : (m.media_type ?? "").toLowerCase() || "post",
          reach,
          impressions: null,
          likes,
          comments,
          shares,
          saves,
          video_views: isVideo ? Number(get("plays")) || null : null,
          engagement_rate: engRate,
          caption: m.caption ?? "",
          permalink: m.permalink ?? null,
          thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
          raw: { media: m, insights },
        },
        { onConflict: "external_post_id,snapshot_date" },
      );
      if (error) errors.push(`upsert IG ${m.id}: ${error.message}`);
      else igCount++;
    }
  } catch (e) {
    errors.push(`IG list: ${e}`);
  }

  // ---------------- FACEBOOK POSTS ----------------
  try {
    const fbPosts = await fetchMeta(`/${c.PAGE_ID}/posts`, {
      fields: "id,message,permalink_url,created_time,full_picture,attachments{media_type}",
      limit: String(POSTS_LIMIT),
    });

    for (const p of fbPosts.data ?? []) {
      const publishedMs = new Date(p.created_time).getTime();
      if (publishedMs < cutoff) continue;

      let insights: { data?: Array<{ name: string; values?: Array<{ value: unknown }> }> } = {};
      try {
        insights = await fetchMeta(`/${p.id}/insights`, {
          metric:
            "post_impressions,post_impressions_unique,post_engaged_users,post_clicks,post_reactions_by_type_total",
        });
      } catch (e) {
        errors.push(`FB ${p.id}: ${e}`);
        continue;
      }

      const getNum = (name: string) =>
        Number(insights.data?.find((d) => d.name === name)?.values?.[0]?.value) || 0;
      const getObj = (name: string) =>
        insights.data?.find((d) => d.name === name)?.values?.[0]?.value as
          | Record<string, number>
          | undefined;

      const reach = getNum("post_impressions_unique");
      const impressions = getNum("post_impressions");
      const engaged = getNum("post_engaged_users");
      const reactions = getObj("post_reactions_by_type_total") ?? {};
      const likes = Object.values(reactions).reduce((s, v) => s + (Number(v) || 0), 0);
      const engRate = reach > 0 ? Math.min(engaged / reach, 9.9999) : 0;

      const { error } = await sb.from("social_post_insights").upsert(
        {
          platform: "facebook",
          external_post_id: p.id,
          published_at: p.created_time,
          media_type: p.attachments?.data?.[0]?.media_type ?? "post",
          reach,
          impressions,
          likes,
          comments: null,
          shares: null,
          saves: null,
          video_views: null,
          engagement_rate: engRate,
          caption: p.message ?? "",
          permalink: p.permalink_url ?? null,
          thumbnail_url: p.full_picture ?? null,
          raw: { post: p, insights },
        },
        { onConflict: "external_post_id,snapshot_date" },
      );
      if (error) errors.push(`upsert FB ${p.id}: ${error.message}`);
      else fbCount++;
    }
  } catch (e) {
    errors.push(`FB list: ${e}`);
  }

  return { instagram: igCount, facebook: fbCount, errors };
}

// ============================================================================
// HTTP HANDLER
// ============================================================================
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }

  // Auth: shared secret in header
  const incoming = req.headers.get("x-insights-secret");
  if (!incoming || incoming !== config().SHARED_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({})) as { task?: string };
  const task = body.task ?? "all";

  const start = Date.now();
  const result: Record<string, unknown> = { task };

  try {
    if (task === "account_snapshot" || task === "all") {
      result.account_snapshot = await snapshotAccounts();
    }
    if (task === "post_insights" || task === "all") {
      result.post_insights = await snapshotPosts();
    }
    if (task === "refresh_view" || task === "all") {
      const { error } = await supabase().rpc("social_insights_refresh");
      result.refresh_view = error ? { error: error.message } : "ok";
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e), partial: result }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, duration_ms: Date.now() - start, ...result }),
    { headers: { "Content-Type": "application/json" } },
  );
});
