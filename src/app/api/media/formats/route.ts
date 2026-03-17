import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

type FormatImageColumn = 'cover_vertical_url' | 'cover_horizontal_url' | 'hero_url';
const VALID_COLUMNS: FormatImageColumn[] = ['cover_vertical_url', 'cover_horizontal_url', 'hero_url'];

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const { data, error } = await supabaseServer
    .from('content_formats')
    .select('id, title, cover_vertical_url, cover_horizontal_url, hero_url')
    .order('title');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const body = await request.json() as { id?: string; column?: string; value?: string | null };
  const { id, column, value } = body;

  if (!id || !column) {
    return NextResponse.json({ error: 'Missing id or column' }, { status: 400 });
  }
  if (!VALID_COLUMNS.includes(column as FormatImageColumn)) {
    return NextResponse.json({ error: `Invalid column: ${column}` }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('content_formats')
    .update({ [column]: value ?? null, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
