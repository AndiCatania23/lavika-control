import {NextResponse} from 'next/server';
import {supabaseServer} from '@/lib/supabaseServer';
import {AUCTION_ID,mutationSchema} from '@/lib/auction/schema';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function authorize(request:Request){
 if(!supabaseServer)return {error:reply({error:'Database non disponibile'},503)};
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return {error:reply({error:'Accesso richiesto'},401)};
 const {data:{user},error}=await supabaseServer.auth.getUser(token);
 if(error||!user)return {error:reply({error:'Sessione non valida'},401)};
 const admin=await supabaseServer.from('dev_admins').select('user_id').eq('user_id',user.id).maybeSingle();
 if(admin.error||!admin.data)return {error:reply({error:'Accesso amministratore richiesto'},403)};
 return {user};
}
export async function GET(request:Request){
 const auth=await authorize(request);if(auth.error)return auth.error;
 const auditId=new URL(request.url).searchParams.get('history');
 if(auditId){
  if(!/^[0-9a-f-]{36}$/.test(auditId)&&auditId!==AUCTION_ID)return reply({error:'ID non valido'},400);
  const result=await supabaseServer!.from('editorial_auction_audit').select('*').eq('entity_id',auditId).order('recorded_at',{ascending:false}).limit(100);
  return result.error?reply({error:'Storico non disponibile'},503):reply({history:result.data});
 }
 const [auction,updates]=await Promise.all([
  supabaseServer!.from('editorial_auctions').select('*').eq('id',AUCTION_ID).single(),
  supabaseServer!.from('editorial_auction_updates').select('*').eq('auction_id',AUCTION_ID).order('created_at',{ascending:false}).limit(1000),
 ]);
 if(auction.error||updates.error)return reply({error:'Impossibile caricare l’asta'},503);
 return reply({auction:auction.data,updates:updates.data});
}
export async function POST(request:Request){
 const auth=await authorize(request);if(auth.error)return auth.error;
 const parsed=mutationSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:parsed.error.issues[0]?.message??'Dati non validi'},400);
 const input=parsed.data,actor=auth.user!.id;
 if(input.action==='state'){
  const result=await supabaseServer!.from('editorial_auctions').update({state:input.state,change_reason:input.change_reason,updated_by:actor}).eq('id',AUCTION_ID).eq('revision',input.revision).select('*').maybeSingle();
  if(result.error)return reply({error:'Salvataggio stato non riuscito'},503);
  return result.data?reply({auction:result.data}):reply({error:'Stato modificato da un’altra sessione. Ricarica prima di salvare.'},409);
 }
 const data={...input.data,source_timecode:input.data.source_kind==='article'?null:input.data.source_timecode,updated_by:actor};
 if(input.action==='create'){
  const result=await supabaseServer!.from('editorial_auction_updates').insert({...data,id:input.id,auction_id:AUCTION_ID}).select('*').single();
  if(result.error?.code==='23505'){
   // Same client-generated id is reused after network errors: never create a second update.
   const previous=await supabaseServer!.from('editorial_auction_updates').select('*').eq('id',input.id).eq('auction_id',AUCTION_ID).single();
   if(previous.error)return reply({error:'Verifica l’elenco prima di riprovare'},409);
   const same=Object.entries(data).every(([key,value])=>key==='source_published_at'?Date.parse(previous.data[key])===Date.parse(String(value)):previous.data[key]===value);
   return same?reply({update:previous.data,replayed:true}):reply({error:'Questa voce è già stata salvata con dati diversi. Ricarica l’elenco e usa Modifica.'},409);
  }
  return result.error?reply({error:'Salvataggio non riuscito. Puoi riprovare senza duplicare la voce.'},503):reply({update:result.data},201);
 }
 const result=await supabaseServer!.from('editorial_auction_updates').update(data).eq('id',input.id).eq('auction_id',AUCTION_ID).eq('revision',input.revision).select('*').maybeSingle();
 if(result.error)return reply({error:'Modifica non riuscita'},503);
 return result.data?reply({update:result.data}):reply({error:'Voce modificata da un’altra sessione. Ricarica prima di salvare.'},409);
}
