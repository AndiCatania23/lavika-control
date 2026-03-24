import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { data, error } = await supabaseServer
    .from('content_formats')
    .select('id,title')
    .order('title', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
