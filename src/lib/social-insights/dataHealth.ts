import { supabaseServer } from '@/lib/supabaseServer';
import { datasetFreshness, type DatasetFreshness } from './freshness';

type TimestampResult = { updatedAt: string | null; error: string | null };

export interface SocialDataHealthSignals {
  account: TimestampResult;
  posts: TimestampResult;
  ai: TimestampResult;
}

export interface SocialDataHealth {
  account: DatasetFreshness;
  posts: DatasetFreshness;
  ai: DatasetFreshness;
}

export async function loadSocialDataHealthSignals(): Promise<SocialDataHealthSignals> {
  if (!supabaseServer) {
    const missing = { updatedAt: null, error: 'Supabase non configurato' };
    return { account: missing, posts: missing, ai: missing };
  }

  const [account, posts, ai] = await Promise.all([
    supabaseServer.from('social_account_snapshots').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseServer.from('social_post_insights').select('snapshot_at').order('snapshot_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseServer.from('smm_night_briefs').select('generated_at').order('generated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    account: { updatedAt: (account.data as { created_at: string } | null)?.created_at ?? null, error: account.error?.message ?? null },
    posts: { updatedAt: (posts.data as { snapshot_at: string } | null)?.snapshot_at ?? null, error: posts.error?.message ?? null },
    ai: { updatedAt: (ai.data as { generated_at: string } | null)?.generated_at ?? null, error: ai.error?.message ?? null },
  };
}

export function buildSocialDataHealth(signals: SocialDataHealthSignals, accountPartial = false): SocialDataHealth {
  return {
    account: datasetFreshness({ source: 'Meta account', updatedAt: signals.account.updatedAt, staleAfterMinutes: 36 * 60, partial: accountPartial, error: signals.account.error }),
    posts: datasetFreshness({ source: 'Meta post insights', updatedAt: signals.posts.updatedAt, staleAfterMinutes: 8 * 60, error: signals.posts.error }),
    ai: datasetFreshness({ source: 'Sintesi AI', updatedAt: signals.ai.updatedAt, staleAfterMinutes: 30 * 60, error: signals.ai.error }),
  };
}
