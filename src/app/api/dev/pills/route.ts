import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabaseServer
    .from('pills')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pills:', error);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Body non valido.' }, { status: 400 });
  }

  const { title, content, type, pill_category, scheduled_at, image_url } = body;

  if (!title || !content || !type) {
    return NextResponse.json({ error: 'Campi obbligatori mancanti.' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('pills')
    .insert({
      title,
      content,
      type,
      pill_category: pill_category || null,
      scheduled_at: scheduled_at || null,
      image_url: image_url || null,
      generated_by: 'manual',
      source: 'editorial',
      status: 'draft',
      is_published: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating pill:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.id) {
    return NextResponse.json({ error: 'ID mancante.' }, { status: 400 });
  }

  const { id, ...updates } = body;

  // If approving, set scheduled status
  if (updates.status === 'scheduled') {
    updates.is_published = false;
  }
  // If publishing directly
  if (updates.status === 'published') {
    updates.is_published = true;
    updates.published_at = new Date().toISOString();
  }
  // If rejecting
  if (updates.status === 'rejected') {
    updates.is_published = false;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from('pills')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating pill:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID mancante.' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('pills')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting pill:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
