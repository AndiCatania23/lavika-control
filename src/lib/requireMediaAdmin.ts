import { supabaseServer } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function requireMediaAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!supabaseServer || !token) return NextResponse.json({ error: 'Accesso richiesto' }, { status: 401 });
  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Sessione non valida' }, { status: 401 });
  const { data: admin } = await supabaseServer.from('dev_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: 'Accesso amministratore richiesto' }, { status: 403 });
  return null;
}
