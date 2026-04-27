import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

export type ReportRow = {
  id: string;
  reporter: { id: string | null; displayName: string | null; email: string | null } | null;
  reported: { id: string; displayName: string | null; email: string | null; avatarUrl: string | null; isBanned: boolean };
  reason: 'offensive' | 'spam' | 'impersonation' | 'other';
  details: string | null;
  status: 'open' | 'reviewing' | 'resolved_warned' | 'resolved_banned' | 'resolved_cleared';
  createdAt: string;
  resolvedAt: string | null;
};

/**
 * GET /api/dev/reports?status=open
 * Lista segnalazioni filtrate per status. Default: tutte.
 */
export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ ok: false, message: 'Supabase non configurato.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');

  let query = supabaseServer
    .from('content_reports')
    .select(`
      id, reason, details, status, created_at, resolved_at,
      reporter:user_profiles!content_reports_reporter_id_fkey(id, display_name, email),
      reported:user_profiles!content_reports_reported_user_id_fkey(id, display_name, email, avatar_url, is_banned)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter && ['open', 'reviewing', 'resolved_warned', 'resolved_banned', 'resolved_cleared'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[dev/reports] list failed:', error.message);
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  type DbRow = {
    id: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    resolved_at: string | null;
    reporter: { id: string; display_name: string | null; email: string | null } | null;
    reported: { id: string; display_name: string | null; email: string | null; avatar_url: string | null; is_banned: boolean } | null;
  };

  const rows: ReportRow[] = ((data ?? []) as unknown as DbRow[])
    .filter((r) => r.reported !== null) // exclude orphan reports (reported user deleted)
    .map((r) => ({
      id: r.id,
      reason: r.reason as ReportRow['reason'],
      details: r.details,
      status: r.status as ReportRow['status'],
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      reporter: r.reporter
        ? { id: r.reporter.id, displayName: r.reporter.display_name, email: r.reporter.email }
        : null,
      reported: {
        id: r.reported!.id,
        displayName: r.reported!.display_name,
        email: r.reported!.email,
        avatarUrl: r.reported!.avatar_url,
        isBanned: r.reported!.is_banned ?? false,
      },
    }));

  // Conteggio open per badge in dashboard
  const { count: openCount } = await supabaseServer
    .from('content_reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');

  return NextResponse.json({ ok: true, reports: rows, openCount: openCount ?? 0 });
}
