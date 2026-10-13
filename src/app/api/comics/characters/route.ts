import {NextResponse} from 'next/server';
import {requireMediaAdmin} from '@/lib/requireMediaAdmin';
import {supabaseServer} from '@/lib/supabaseServer';
import {characterMutation} from '@/lib/comics/characterSchema';
import {MEDIA_PUBLIC_BASE_URL} from '@/lib/r2MediaClient';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 const denied=await requireMediaAdmin(request);if(denied)return denied;
 const q=new URL(request.url).searchParams.get('q')?.trim().slice(0,80)??'';
 if(q.length<2)return reply({people:[]});
 // Search the canonical registry: also includes coaches and historical players.
 const escaped=q.replace(/[\\%_]/g,'\\$&');
 const {data,error}=await supabaseServer!.from('players').select('id,full_name,position,slug').ilike('full_name',`%${escaped}%`).order('full_name').limit(40);
 return error?reply({error:'Anagrafica non disponibile'},503):reply({people:data});
}
export async function POST(request:Request){
 const denied=await requireMediaAdmin(request);if(denied)return denied;
 const parsed=characterMutation.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:'Controlla nome, immagine e dati del personaggio.'},400);
 const {id,revision,data}=parsed.data;
 const previous=await supabaseServer!.from('comics_characters').select('id,player_id,name,role,color,image_url,active,sort_order').eq('id',id).maybeSingle();
 if(previous.error)return reply({error:'Catalogo non disponibile'},503);
 if(revision===null&&previous.data&&Object.entries(data).every(([key,value])=>previous.data?.[key as keyof typeof previous.data]===value))return reply({ok:true});
 const prefix=`${MEDIA_PUBLIC_BASE_URL}/comics/personaggi/${id}/`;
 if(data.image_url!==previous.data?.image_url&&!data.image_url.startsWith(prefix))return reply({error:'Carica la caricatura dal selettore immagini.'},400);
 const result=revision===null
  ?await supabaseServer!.from('comics_characters').insert({id,...data}).select('id').single()
  :await supabaseServer!.from('comics_characters').update(data).eq('id',id).eq('revision',revision).select('id').maybeSingle();
 if(result.error?.code==='23505')return reply({error:'Questa persona ha già un personaggio. Aprilo dal catalogo.'},409);
 if(result.error?.code==='23503')return reply({error:'Persona non trovata nell’anagrafica. Cercala nuovamente.'},400);
 if(result.error)return reply({error:'Salvataggio non riuscito. Riprova.'},503);
 return result.data?reply({ok:true}):reply({error:'Personaggio modificato in un’altra sessione. Ricarica il catalogo.'},409);
}
