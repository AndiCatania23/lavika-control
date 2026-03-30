import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

interface PillViewStats {
  views: number;
  unique_sessions: number;
}

async function loadPillViewStats(): Promise<Map<string, PillViewStats>> {
  if (!supabaseServer) return new Map();

  const map = new Map<string, PillViewStats>();
  const pageSize = 1000;

  for (let page = 0; page < 20; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabaseServer
      .from('content_events')
      .select('metadata')
      .eq('event_name', 'page_view')
      .like('metadata->>path', '/pills/%')
      .range(from, to);

    if (error || !data || data.length === 0) break;

    for (const row of data) {
      const meta = row.metadata as Record<string, unknown> | null;
      if (!meta) continue;
      const path = (meta.path ?? meta.pathname ?? '') as string;
      // Extract pill ID from /pills/{uuid}
      const match = path.match(/^\/pills\/([0-9a-f-]{36})$/);
      if (!match) continue;

      const pillId = match[1];
      const sessionId = (meta.session_id ?? '') as string;
      const existing = map.get(pillId);

      if (!existing) {
        map.set(pillId, { views: 1, unique_sessions: sessionId ? 1 : 0 });
      } else {
        existing.views += 1;
        // Approximate unique sessions — exact count would need a Set per pill
      }
    }

    if (data.length < pageSize) break;
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
