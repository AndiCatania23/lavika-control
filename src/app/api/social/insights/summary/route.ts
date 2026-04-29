import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/social/insights/summary
 *
 * Endpoint leggero per il widget hero sull'hub /social.
 * Restituisce solo i campi essenziali pre-aggregati dalla view
 * v_social_insights_summary (~500 byte di payload).
 */
export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseServer
    .from('v_social_insights_summary')
    .select('platform, followers_count, followers_delta_7d, followers_delta_30d, reach_28d, avg_eng_rate_14d, posts_count_14d, days_of_data, mode, refreshed_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{
    platform: 'instagram' | 'facebook';
    followers_count: number | null;
    followers_delta_7d: number | null;
    followers_delta_30d: number | null;
    reach_28d: number | null;
    avg_eng_rate_14d: number | null;
    posts_count_14d: number;
    days_of_data: number;
    mode: 'early' | 'active';
    refreshed_at: string | null;
  }>;

  const ig = rows.find(r => r.platform === 'instagram') ?? null;
  const fb = rows.find(r => r.platform === 'facebook') ?? null;

  const daysOfData = Math.max(ig?.days_of_data ?? 0, fb?.days_of_data ?? 0);
  const mode: 'early' | 'active' =
    ig?.mode === 'active' || fb?.mode === 'active' ? 'active' : 'early';

  const avgEngRate14d =
    ig?.avg_eng_rate_14d != null && fb?.avg_eng_rate_14d != null
      ? (ig.avg_eng_rate_14d + fb.avg_eng_rate_14d) / 2
      : ig?.avg_eng_rate_14d ?? fb?.avg_eng_rate_14d ?? null;

  return NextResponse.json({
    ig: ig
      ? {
          followers: ig.followers_count,
          delta7d: ig.followers_delta_7d,
          delta30d: ig.followers_delta_30d,
          reach28d: ig.reach_28d,
        }
      : null,
    fb: fb
      ? {
          followers: fb.followers_count,
          delta7d: fb.followers_delta_7d,
          delta30d: fb.followers_delta_30d,
        }
      : null,
    avgEngRate14d,
    postsCount14d: (ig?.posts_count_14d ?? 0) + (fb?.posts_count_14d ?? 0),
    daysOfData,
    mode,
    refreshedAt: ig?.refreshed_at ?? fb?.refreshed_at ?? null,
  });
}
