import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

interface FeedRow {
  id: string;
  slug: string;
  display_name: string;
  feed_url: string;
  priority: number;
  enabled: boolean;
  last_fetched_at: string | null;
  last_article_at: string | null;
  articles_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ feeds: [] }, { status: 500 });
  }

  const { data, error } = await supabaseServer
    .from('rss_feeds')
    .select('*')
    .order('priority', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, feeds: [] }, { status: 500 });
  }

  // Recompute article counts from pill_sources so numbers stay fresh between
  // generator runs (when articles_total is updated in batch).
  const feeds = (data ?? []) as FeedRow[];
  const slugs = feeds.map(f => f.slug);
  let countsBySlug = new Map<string, { total: number; last: string | null }>();
  if (slugs.length > 0) {
    const { data: stats } = await supabaseServer
      .from('pill_sources')
      .select('source_name, published_at');
    for (const row of (stats ?? []) as Array<{ source_name: string; published_at: string | null }>) {
      const cur = countsBySlug.get(row.source_name) ?? { total: 0, last: null };
      cur.total += 1;
      if (row.published_at && (!cur.last || row.published_at > cur.last)) {
        cur.last = row.published_at;
      }
      countsBySlug.set(row.source_name, cur);
    }
  }

  const enriched = feeds.map(f => {
    const s = countsBySlug.get(f.slug);
    return {
      ...f,
      articles_total: s?.total ?? f.articles_total,
      last_article_at: s?.last ?? f.last_article_at,
    };
  });

  return NextResponse.json({ feeds: enriched });
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as {
    slug?: string; display_name?: string; feed_url?: string; priority?: number; notes?: string;
  } | null;

  if (!body?.slug || !body.display_name || !body.feed_url) {
    return NextResponse.json({ error: 'slug, display_name e feed_url sono obbligatori' }, { status: 400 });
  }
  try {
    new URL(body.feed_url);
  } catch {
    return NextResponse.json({ error: 'feed_url non è un URL valido' }, { status: 400 });
  }

  const slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const { data, error } = await supabaseServer
    .from('rss_feeds')
    .insert({
      slug,
      display_name: body.display_name.trim(),
      feed_url: body.feed_url.trim(),
      priority: Number.isFinite(body.priority) ? body.priority : 50,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505' ? `Slug "${slug}" esiste già` : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ feed: data });
}

export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string; enabled?: boolean; priority?: number; notes?: string; display_name?: string;
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
  if (Number.isFinite(body.priority)) updates.priority = body.priority;
  if (typeof body.notes === 'string') updates.notes = body.notes;
  if (typeof body.display_name === 'string') updates.display_name = body.display_name.trim();

  const { data, error } = await supabaseServer
    .from('rss_feeds')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ feed: data });
}

export async function DELETE(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  }
  const { error } = await supabaseServer.from('rss_feeds').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
