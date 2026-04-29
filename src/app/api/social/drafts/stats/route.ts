import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/social/drafts/stats
 * Returns counts for the Social hub dashboard.
 */
export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseServer
    .from('social_drafts')
    .select('id, status, requires_approval, approved_at, created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allDrafts = (data ?? []) as Array<{
    id: string;
    status: string;
    requires_approval: boolean;
    approved_at: string | null;
    created_at: string;
  }>;

  // Exclude drafts with 0 variants (orphans). Trigger
  // trg_social_variants_delete_orphan_draft normally cleans them up, but
  // we double-check here so the hub counter stays consistent with the
  // list view (which also filters orphans).
  const draftIds = allDrafts.map(d => d.id);
  const variantDraftIds = new Set<string>();
  if (draftIds.length > 0) {
    const { data: variants } = await supabaseServer
      .from('social_variants')
      .select('draft_id')
      .in('draft_id', draftIds);
    for (const v of variants ?? []) variantDraftIds.add(v.draft_id);
  }
  const rows = allDrafts.filter(d => variantDraftIds.has(d.id));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const stats = {
    drafts: rows.filter(r => r.status === 'draft').length,
    awaitingApproval: rows.filter(r => r.status === 'review' && r.requires_approval && !r.approved_at).length,
    scheduled: rows.filter(r => r.status === 'scheduled').length,
    publishedToday: rows.filter(r => r.status === 'published' && new Date(r.created_at).getTime() >= todayMs).length,
  };

  return NextResponse.json(stats);
}
