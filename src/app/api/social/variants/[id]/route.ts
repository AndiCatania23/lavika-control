import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const EDITABLE_FIELDS = new Set(['caption', 'hashtags', 'scheduled_at', 'status']);

/**
 * PATCH /api/social/variants/[id]
 * Body: subset of editable fields (caption, hashtags, scheduled_at, status)
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE_FIELDS.has(k)) updates[k] = v;
  }

  const { data, error } = await supabaseServer
    .from('social_variants')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ variant: data });
}

/**
 * DELETE /api/social/variants/[id]
 * Removes a single variant (cascade removes its asset jobs).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id } = await params;
  const { error } = await supabaseServer.from('social_variants').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
