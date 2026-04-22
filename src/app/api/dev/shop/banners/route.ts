import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Shop banners CRUD.

export async function GET() {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { data, error } = await supabaseServer
    .from('shop_banners')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.type || !body.headline) {
      return NextResponse.json({ error: 'type e headline obbligatori' }, { status: 400 });
    }

    const insertPayload = {
      type: body.type as string,
      headline: body.headline as string,
      subline: (body.subline as string) ?? null,
      image_url: (body.image_url as string) ?? null,
      cta_label: (body.cta_label as string) ?? null,
      cta_href: (body.cta_href as string) ?? null,
      accent_color: (body.accent_color as string) ?? null,
      priority: body.priority ? Number(body.priority) : 0,
      active: Boolean(body.active),
      starts_at: (body.starts_at as string) ?? null,
      ends_at: (body.ends_at as string) ?? null,
    };

    const { data, error } = await supabaseServer.from('shop_banners').insert(insertPayload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  try {
    const body = (await request.json()) as { id?: string } & Record<string, unknown>;
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { id, ...updates } = body;
    const { data, error } = await supabaseServer.from('shop_banners').update(updates).eq('id', id as string).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseServer.from('shop_banners').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
