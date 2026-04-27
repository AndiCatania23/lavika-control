import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

type Action = 'warn' | 'ban' | 'unban' | 'clear';

const ACTION_TO_STATUS: Record<Action, string> = {
  warn: 'resolved_warned',
  ban: 'resolved_banned',
  unban: 'open', // resetta status: report ritorna in coda
  clear: 'resolved_cleared',
};

/**
 * PATCH /api/dev/reports/[id]
 * Body: { action: 'warn' | 'ban' | 'unban' | 'clear' }
 *
 * - warn: marca segnalazione come "warning emesso" (admin scrive a mano via email)
 * - ban: setta user_profiles.is_banned=true sull'utente segnalato
 * - unban: rimuove il ban dall'utente segnalato e riapre la segnalazione
 * - clear: chiude la segnalazione senza azione (segnalazione infondata)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabaseServer) {
    return NextResponse.json({ ok: false, message: 'Supabase non configurato.' }, { status: 500 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, message: 'Report ID richiesto.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action as Action | undefined;

  if (!action || !['warn', 'ban', 'unban', 'clear'].includes(action)) {
    return NextResponse.json({ ok: false, message: 'Azione non valida.' }, { status: 400 });
  }

  // Recupera la segnalazione per l'utente target
  const { data: report, error: fetchError } = await supabaseServer
    .from('content_reports')
    .select('id, reported_user_id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchError || !report) {
    return NextResponse.json({ ok: false, message: 'Segnalazione non trovata.' }, { status: 404 });
  }

  const reportedUserId = report.reported_user_id as string;

  // Esegui side effect per ban/unban
  if (action === 'ban') {
    const { error: banError } = await supabaseServer
      .from('user_profiles')
      .update({ is_banned: true, updated_at: new Date().toISOString() })
      .eq('id', reportedUserId);

    if (banError) {
      console.error('[dev/reports/PATCH] ban failed:', banError.message);
      return NextResponse.json({ ok: false, message: banError.message }, { status: 500 });
    }
  }

  if (action === 'unban') {
    const { error: unbanError } = await supabaseServer
      .from('user_profiles')
      .update({ is_banned: false, updated_at: new Date().toISOString() })
      .eq('id', reportedUserId);

    if (unbanError) {
      console.error('[dev/reports/PATCH] unban failed:', unbanError.message);
      return NextResponse.json({ ok: false, message: unbanError.message }, { status: 500 });
    }
  }

  // Update status segnalazione
  const newStatus = ACTION_TO_STATUS[action];
  const updates: Record<string, unknown> = {
    status: newStatus,
  };

  if (action !== 'unban') {
    updates.resolved_at = new Date().toISOString();
  } else {
    updates.resolved_at = null;
  }

  const { error: updateError } = await supabaseServer
    .from('content_reports')
    .update(updates)
    .eq('id', id);

  if (updateError) {
    console.error('[dev/reports/PATCH] status update failed:', updateError.message);
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
