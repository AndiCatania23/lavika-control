import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireMediaAdmin } from '@/lib/requireMediaAdmin';
import { revalidateAppContent } from '@/lib/revalidateAppContent';
import { writeAuditLog, actorEmailFromRequest } from '@/lib/auditLog';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMediaAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (typeof body?.is_published !== 'boolean' || typeof body?.expected_is_published !== 'boolean') {
    return NextResponse.json({ error: 'Stato di pubblicazione non valido.' }, { status: 400 });
  }
  const { id } = await params;
  const { data, error } = await supabaseServer!.rpc('set_format_publication', {
    p_format_id: id,
    p_is_published: body.is_published,
    p_expected_published: body.expected_is_published,
  });
  if (error) {
    if (error.code === '40001') {
      return NextResponse.json({ error: 'La visibilità è cambiata da un’altra sessione. Ricarica il format.' }, { status: 409 });
    }
    if (error.code === 'P0002') return NextResponse.json({ error: 'Format non trovato.' }, { status: 404 });
    console.error('[format-publication]', error.code, error.message);
    return NextResponse.json({ error: 'Pubblicazione non aggiornata. Riprova.' }, { status: 500 });
  }
  await writeAuditLog({
    action: body.is_published ? 'publish_format' : 'hide_format',
    entity_table: 'content_formats', entity_id: id,
    diff: data, actor_email: actorEmailFromRequest(request),
  });
  const revalidated = await revalidateAppContent();
  return NextResponse.json({ item: data, revalidated });
}
