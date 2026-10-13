import {supabase} from '@/lib/supabaseClient';
export async function api(path:string,body?:unknown){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Sessione scaduta. Accedi nuovamente.');
 const multipart=body instanceof FormData;
 const response=await fetch('/api/comics'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(body&&!multipart?{'Content-Type':'application/json'}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined,cache:'no-store'});
 const result=await response.json().catch(()=>({error:'Risposta non disponibile. Riprova.'}));if(!response.ok)throw Error(result.error??'Operazione non riuscita');return result;
}
