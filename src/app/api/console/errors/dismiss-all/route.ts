import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Dismiss bulk: cancella TUTTE le righe `job_queue` con status terminale
 * (failed, cancelled). Conservativa: lascia intatti pending/running.
 * Restituisce il count cancellato.
 */
export async function POST() {
  if (!supabaseServer) {
    return NextResponse.json({ ok: false, error: 'No DB' }, { status: 500 });
  }

  const { data, error } = await supabaseServer
    .from('job_queue')
    .delete()
    .in('status', ['failed', 'cancelled'])
    .select('id');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
