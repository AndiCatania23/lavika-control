import { NextResponse } from 'next/server';
import { requireMediaAdmin } from '@/lib/requireMediaAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { MAX_CARD_BYTES, prepareCard, storeCard } from '@/lib/comics/storage';
export const runtime = 'nodejs';
export async function POST(request: Request) {
 const denied = await requireMediaAdmin(request); if (denied) return denied;
 if (Number(request.headers.get('content-length') ?? 0) > MAX_CARD_BYTES + 65536) return NextResponse.json({error:'La card deve essere di massimo 4 MB'},{status:413});
 let card;
 try {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size > MAX_CARD_BYTES) return NextResponse.json({error:'Scegli una card fino a 4 MB'},{status:400});
  card = await prepareCard(Buffer.from(await file.arrayBuffer()),Number(form.get('series')),Number(form.get('episode_number')));
 } catch { return NextResponse.json({error:'Card non valida. Usa JPG, PNG o WebP statico, massimo 4 MB e 25 megapixel.'},{status:400}); }
 try {
  await storeCard(card);
  const {error} = await supabaseServer!.from('comics_assets').insert(card.asset);
  if (error) throw error;
  return NextResponse.json({asset:card.asset},{headers:{'Cache-Control':'private, no-store'}});
 } catch { return NextResponse.json({error:'Caricamento non riuscito. La card precedente è al sicuro; riprova.'},{status:503}); }
}
