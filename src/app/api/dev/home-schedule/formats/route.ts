import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

interface FormatOptionRow {
  id: string;
  title: string | null;
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { data, error } = await supabaseServer
    .from('dev_format_options')
    .select('id,title')
    .order('title', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []) as FormatOptionRow[]);
}
