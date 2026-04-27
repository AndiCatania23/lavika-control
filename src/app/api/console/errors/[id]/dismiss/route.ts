import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Dismiss un errore — cancella fisicamente la riga `job_queue` con status
 * 'failed' o 'cancelled'. Una volta dismesso non riappare nel dashboard
 * counter `failed24h` né nella lista /errors.
 *
 * Pulizia conservativa: rifiuta record con status non terminale (running,
 * pending) per evitare di rompere job in esecuzione.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = id.startsWith('jq_') ? id.slice(3) : id;

  if (!supabaseServer) {
    return NextResponse.json({ ok: false, error: 'No DB' }, { status: 500 });
  }

  const { data: row } = await supabaseServer
    .from('job_queue')
    .select('id, status')
    .eq('id', jobId)
    .maybeSingle();

  if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  if (row.status !== 'failed' && row.status !== 'cancelled') {
    return NextResponse.json({ ok: false, error: `Cannot dismiss status '${row.status}'` }, { status: 400 });
  }

  const { error } = await supabaseServer.from('job_queue').delete().eq('id', jobId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: jobId });
}
