import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireMediaAdmin } from '@/lib/requireMediaAdmin';
import { revalidateAppContent } from '@/lib/revalidateAppContent';

const schema = z.object({
  speakerId: z.string().min(1).nullable(),
  url: z.string().url().refine(value => value.startsWith('https://'), 'Usa un URL HTTPS').nullable(),
});

export async function GET() {
  if (!supabaseServer) return NextResponse.json({ error: 'Database non disponibile' }, { status: 503 });
  const [speakers, format] = await Promise.all([
    supabaseServer.from('players').select('id,full_name,match_reaction_card_url').order('full_name').limit(10000),
    supabaseServer.from('content_formats').select('cover_horizontal_url').eq('id', 'match-reaction').single(),
  ]);
  if (speakers.error || format.error) return NextResponse.json({ error: 'Impossibile caricare le card' }, { status: 500 });
  return NextResponse.json({ speakers: speakers.data, genericUrl: format.data.cover_horizontal_url });
}

export async function PATCH(request: Request) {
  const denied = await requireMediaAdmin(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Relatore o immagine non validi' }, { status: 400 });
  const { speakerId, url } = parsed.data;
  if (!speakerId && !url) return NextResponse.json({ error: 'La card generica è obbligatoria' }, { status: 400 });
  const result = speakerId
    ? await supabaseServer!.from('players').update({ match_reaction_card_url: url }).eq('id', speakerId).select('id').maybeSingle()
    : await supabaseServer!.from('content_formats').update({ cover_horizontal_url: url, updated_at: new Date().toISOString() }).eq('id', 'match-reaction').select('id').maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: 'Relatore non trovato' }, { status: 404 });
  const appRefreshed = await revalidateAppContent();
  return NextResponse.json({ ok: true, appRefreshed });
}
