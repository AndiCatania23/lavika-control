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
    .select('status, requires_approval, approved_at, created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{
    status: string;
    requires_approval: boolean;
    approved_at: string | null;
    created_at: string;
  }>;

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
