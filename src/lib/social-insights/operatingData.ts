import { supabaseServer } from '@/lib/supabaseServer';
import { enrichPost } from './analytics';
import { classifyContentType } from './classification';
import { buildTodayActions, buildTodayContext, detectOpportunities, type EditorialSource, type UpcomingMatch } from './operations';
import type { SocialPostMetric } from './types';
import { buildEditorialRadar } from './editorialRadar';

export interface SocialOperatingSnapshot {
  context: ReturnType<typeof buildTodayContext>;
  actions: ReturnType<typeof buildTodayActions>;
  opportunities: ReturnType<typeof detectOpportunities>;
  approvals: Array<{ id: string; title: string; sourceType: string; createdAt: string; readyVariants: number }>;
  radar: ReturnType<typeof buildEditorialRadar>;
  errors: string[];
}

export async function loadSocialOperatingSnapshot(now = new Date()): Promise<SocialOperatingSnapshot> {
  if (!supabaseServer) return { context: buildTodayContext({ match: null, sources: [], now }), actions: [], opportunities: [], approvals: [], radar: [], errors: ['Supabase non configurato'] };
  const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const since90d = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const until7d = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  const [pillsResult, episodesResult, draftsResult, variantsResult, postsResult, matchesResult] = await Promise.all([
    supabaseServer.from('pills').select('id,title,content,pill_category,image_url,published_at,scheduled_at,status').or(`published_at.gte.${since7d},scheduled_at.gte.${since7d}`).order('created_at', { ascending: false }).limit(30),
    supabaseServer.from('content_episodes').select('id,title,format_id,thumbnail_url,published_at,is_active').eq('is_active', true).gte('published_at', since7d).order('published_at', { ascending: false }).limit(30),
    supabaseServer.from('social_drafts').select('id,title,source_type,source_id,status,created_at,requires_approval,approved_at').gte('created_at', since90d).order('created_at', { ascending: false }).limit(200),
    supabaseServer.from('social_variants').select('id,draft_id,status').gte('created_at', since90d).limit(1000),
    supabaseServer.from('social_post_insights').select('external_post_id,variant_id,platform,published_at,snapshot_at,caption,reach,impressions,likes,comments,shares,saves,engagement_rate,permalink').gte('published_at', since90d).order('snapshot_at', { ascending: false }).limit(5000),
    supabaseServer.from('matches').select(`id,kickoff_at,status,home_team:teams!matches_home_team_id_fkey(normalized_name,short_name),away_team:teams!matches_away_team_id_fkey(normalized_name,short_name)`).gte('kickoff_at', now.toISOString()).lte('kickoff_at', until7d).order('kickoff_at', { ascending: true }).limit(30),
  ]);

  const errors = [pillsResult.error, episodesResult.error, draftsResult.error, variantsResult.error, postsResult.error, matchesResult.error].filter(Boolean).map((error) => error!.message);
  const drafts = (draftsResult.data ?? []) as Array<{ id: string; title: string | null; source_type: string; source_id: string | null; status: string; created_at: string; requires_approval: boolean; approved_at: string | null }>;
  const variants = (variantsResult.data ?? []) as Array<{ id: string; draft_id: string; status: string }>;
  const draftedSources = new Set(drafts.filter((draft) => draft.source_id).map((draft) => `${draft.source_type}:${draft.source_id}`));

  const sources: EditorialSource[] = [
    ...((pillsResult.data ?? []) as Array<{ id: string; title: string; content: string; pill_category: string | null; image_url: string | null; published_at: string | null; scheduled_at: string | null }>).map((pill) => ({ id: pill.id, type: 'pill' as const, title: pill.title, publishedAt: pill.published_at ?? pill.scheduled_at, imageUrl: pill.image_url, contentType: classifyContentType(`${pill.title} ${pill.content}`), alreadyDrafted: draftedSources.has(`pill:${pill.id}`) })),
    ...((episodesResult.data ?? []) as Array<{ id: string; title: string | null; format_id: string; thumbnail_url: string | null; published_at: string | null }>).map((episode) => ({ id: episode.id, type: 'episode' as const, title: episode.title ?? episode.id, publishedAt: episode.published_at, imageUrl: episode.thumbnail_url, contentType: classifyContentType(`${episode.format_id} ${episode.title ?? ''}`), alreadyDrafted: draftedSources.has(`episode:${episode.id}`) })),
  ].sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime());

  const readyByDraft = new Map<string, number>();
  for (const variant of variants) if (variant.status === 'asset_ready' || variant.status === 'scheduled') readyByDraft.set(variant.draft_id, (readyByDraft.get(variant.draft_id) ?? 0) + 1);
  const approvals = drafts.filter((draft) => draft.status === 'review' && draft.requires_approval && !draft.approved_at && (readyByDraft.get(draft.id) ?? 0) > 0).map((draft) => ({ id: draft.id, title: draft.title ?? 'Pacchetto social', sourceType: draft.source_type, createdAt: draft.created_at, readyVariants: readyByDraft.get(draft.id) ?? 0 }));

  type Team = { normalized_name: string; short_name: string | null } | null;
  const match = ((matchesResult.data ?? []) as unknown as Array<{ id: string; kickoff_at: string; status: string; home_team: Team; away_team: Team }>).map((row): UpcomingMatch => ({ id: row.id, kickoffAt: row.kickoff_at, status: row.status, label: `${row.home_team?.short_name ?? row.home_team?.normalized_name ?? 'Casa'}–${row.away_team?.short_name ?? row.away_team?.normalized_name ?? 'Trasferta'}` })).find((row) => row.label.split('–').some((team) => team === 'CAT' || team.toLocaleLowerCase('it-IT').includes('catania'))) ?? null;

  const seenPosts = new Set<string>();
  const postVariant = new Map<string, string>();
  const posts: SocialPostMetric[] = [];
  for (const row of (postsResult.data ?? []) as Array<{ external_post_id: string; variant_id: string | null; platform: 'instagram' | 'facebook'; published_at: string; snapshot_at: string; caption: string | null; reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; engagement_rate: number | null }>) {
    if (seenPosts.has(row.external_post_id) || !row.published_at) continue;
    seenPosts.add(row.external_post_id);
    if (row.variant_id) postVariant.set(row.external_post_id, row.variant_id);
    posts.push(enrichPost({ id: row.external_post_id, platform: row.platform, publishedAt: row.published_at, snapshotAt: row.snapshot_at, caption: row.caption, reach: row.reach, impressions: row.impressions, likes: row.likes, comments: row.comments, shares: row.shares, saves: row.saves, engagementRate: row.engagement_rate }));
  }
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const sourceLinks = new Map<string, { type: 'pill' | 'episode'; id: string }>();
  for (const [postId, variantId] of postVariant) {
    const draft = draftById.get(variantById.get(variantId)?.draft_id ?? '');
    if (draft?.source_id && (draft.source_type === 'pill' || draft.source_type === 'episode')) sourceLinks.set(postId, { type: draft.source_type, id: draft.source_id });
  }

  const context = buildTodayContext({ match, sources, now });
  const actions = buildTodayActions({ sources, approvalDrafts: approvals, match });
  return { context, actions, opportunities: detectOpportunities(posts, sourceLinks, now), approvals, radar: buildEditorialRadar({ match, sources, now }), errors };
}
