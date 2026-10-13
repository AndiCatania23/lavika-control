import { NextResponse } from 'next/server';
import { requireMediaAdmin } from '@/lib/requireMediaAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { mutation, episodeSelect } from '@/lib/comics/schema';
export const dynamic = 'force-dynamic';
const reply = (data: unknown,status=200) => NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request: Request) {
 const denied = await requireMediaAdmin(request); if (denied) return denied;
 const {data,error} = await supabaseServer!.from('comics_episodes').select(episodeSelect).order('series',{ascending:false}).order('episode_number',{ascending:false}).limit(1000);
 return error ? reply({error:'Archivio Comics non disponibile'},503) : reply({episodes:data});
}
export async function POST(request: Request) {
 const denied = await requireMediaAdmin(request); if (denied) return denied;
 const parsed = mutation.safeParse(await request.json().catch(()=>null));
 if (!parsed.success) return reply({error:'Controlla numero, data, testi e card prima di salvare.'},400);
 const input = parsed.data;
 const asset = await supabaseServer!.from('comics_assets').select('id').eq('id',input.data.asset_id).eq('series',input.data.series).eq('episode_number',input.data.episode_number).maybeSingle();
 if (asset.error) return reply({error:'Verifica della card non disponibile'},503);
 if (!asset.data) return reply({error:'Carica una card per questo episodio'},400);
 if (input.action === 'create') {
  const result = await supabaseServer!.from('comics_episodes').insert({id:input.id,...input.data}).select(episodeSelect).single();
  if (result.error?.code === '23505') {
   const previous = await supabaseServer!.from('comics_episodes').select(episodeSelect).eq('id',input.id).maybeSingle();
   const row = previous.data;
   if (row && Object.entries(input.data).every(([key,value])=>row[key as keyof typeof row]===value)) return reply({episode:row});
   return reply({error:'Esiste già un episodio con questo numero nella serie. Aprilo dall’archivio.'},409);
  }
  return result.error ? reply({error:'Salvataggio non riuscito. Puoi riprovare.'},503) : reply({episode:result.data},201);
 }
 const result = await supabaseServer!.from('comics_episodes').update(input.data).eq('id',input.id).eq('revision',input.revision).select(episodeSelect).maybeSingle();
 if (result.error) return reply({error:'Modifica non riuscita'},503);
 return result.data ? reply({episode:result.data}) : reply({error:'Episodio modificato da un’altra sessione. Ricarica prima di salvare.'},409);
}
