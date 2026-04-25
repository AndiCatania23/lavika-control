import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

interface PillViewStats {
  views: number;
  unique_sessions: number;
}

async function loadPillViewStats(): Promise<Map<string, PillViewStats>> {
  if (!supabaseServer) return new Map();

  // Aggregato lato DB via RPC: ritorna ~N righe (1 per pill) invece di
  // scaricare tutti i page_view eventi (riduce egress da MB a KB).
  const { data, error } = await supabaseServer.rpc('pill_view_stats');

  if (error || !data) {
    console.error('Error loading pill_view_stats:', error);
    return new Map();
  }

  const map = new Map<string, PillViewStats>();
  for (const row of data as Array<{ pill_id: string; views: number; unique_sessions: number }>) {
    if (!row.pill_id) continue;
    map.set(row.pill_id, {
      views: Number(row.views) || 0,
      unique_sessions: Number(row.unique_sessions) || 0,
    });
  }
  return map;
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json([]);
  }

  const [pillsRes, viewStats] = await Promise.all([
    supabaseServer
      .from('pills')
      .select('*')
      .order('created_at', { ascending: false }),
    loadPillViewStats(),
  ]);

  if (pillsRes.error) {
    console.error('Error fetching pills:', pillsRes.error);
    return NextResponse.json([], { status: 500 });
  }

  const pills = (pillsRes.data ?? []).map((pill: Record<string, unknown>) => {
    const stats = viewStats.get(pill.id as string);
    if (stats) {
      return {
        ...pill,
        views: stats.views,
        impressions: stats.views, // best approximation from page_view events
      };
    }
    return pill;
  });

  return NextResponse.json(pills);
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Body non valido.' }, { status: 400 });
  }

  const { title, content, type, pill_category, scheduled_at, image_url, source_attribution } = body;

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
      source_attribution: source_attribution || null,
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

  // Keep published_at in sync with status transitions.
  // When moving BACK from 'published' (or into any non-published state)
  // we reset published_at so the detail view doesn't show a stale timestamp.
  if (updates.status === 'published') {
    updates.is_published = true;
    updates.published_at = new Date().toISOString();
  } else if (updates.status === 'scheduled' || updates.status === 'draft' || updates.status === 'rejected') {
    updates.is_published = false;
    updates.published_at = null;
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
