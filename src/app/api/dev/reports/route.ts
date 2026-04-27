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
 *
 * Le FK content_reports.reporter_id e reported_user_id puntano ad auth.users(id),
 * non a user_profiles(id). Quindi il join Supabase con select() non risolve.
 * Facciamo 2 query e join manuale in JS.
 */
export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ ok: false, message: 'Supabase non configurato.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');

  // 1) Carica segnalazioni
  let query = supabaseServer
    .from('content_reports')
    .select('id, reporter_id, reported_user_id, reason, details, status, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter && ['open', 'reviewing', 'resolved_warned', 'resolved_banned', 'resolved_cleared'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  const { data: reportsData, error: reportsError } = await query;

  if (reportsError) {
    console.error('[dev/reports] list failed:', reportsError.message);
    return NextResponse.json({ ok: false, message: reportsError.message }, { status: 500 });
  }

  type ReportDbRow = {
    id: string;
    reporter_id: string | null;
    reported_user_id: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    resolved_at: string | null;
  };

  const reportsList = (reportsData ?? []) as ReportDbRow[];

  // 2) Carica profili per tutti gli userId coinvolti (reporter + reported)
  const userIds = new Set<string>();
  for (const r of reportsList) {
    if (r.reporter_id) userIds.add(r.reporter_id);
    if (r.reported_user_id) userIds.add(r.reported_user_id);
  }

  type ProfileDbRow = {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    is_banned: boolean;
  };

  const profilesMap = new Map<string, ProfileDbRow>();

  if (userIds.size > 0) {
    const { data: profilesData, error: profilesError } = await supabaseServer
      .from('user_profiles')
      .select('id, display_name, email, avatar_url, is_banned')
      .in('id', Array.from(userIds));

    if (profilesError) {
      console.error('[dev/reports] profiles fetch failed:', profilesError.message);
      return NextResponse.json({ ok: false, message: profilesError.message }, { status: 500 });
    }

    for (const p of (profilesData ?? []) as ProfileDbRow[]) {
      profilesMap.set(p.id, p);
    }
  }

  // 3) Mappa in ReportRow + filtra orphan (reported user cancellato → user_profiles row mancante)
  const rows: ReportRow[] = [];
  for (const r of reportsList) {
    const reportedProfile = profilesMap.get(r.reported_user_id);
    if (!reportedProfile) continue; // skip se reported user cancellato

    const reporterProfile = r.reporter_id ? profilesMap.get(r.reporter_id) : null;

    rows.push({
      id: r.id,
      reason: r.reason as ReportRow['reason'],
      details: r.details,
      status: r.status as ReportRow['status'],
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      reporter: reporterProfile
        ? { id: reporterProfile.id, displayName: reporterProfile.display_name, email: reporterProfile.email }
        : null,
      reported: {
        id: reportedProfile.id,
        displayName: reportedProfile.display_name,
        email: reportedProfile.email,
        avatarUrl: reportedProfile.avatar_url,
        isBanned: reportedProfile.is_banned ?? false,
      },
    });
  }

  // Conteggio open per badge in dashboard
  const { count: openCount } = await supabaseServer
    .from('content_reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');

  return NextResponse.json({ ok: true, reports: rows, openCount: openCount ?? 0 });
}
