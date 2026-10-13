import {NextResponse} from 'next/server';
import {PutObjectCommand} from '@aws-sdk/client-s3';
import {requireMediaAdmin} from '@/lib/requireMediaAdmin';
import {prepareCharacter,MAX_CHARACTER_BYTES} from '@/lib/comics/characterStorage';
import {r2MediaClient,MEDIA_BUCKET_NAME,MEDIA_PUBLIC_BASE_URL} from '@/lib/r2MediaClient';
export const runtime='nodejs';
const maxBytes=MAX_CHARACTER_BYTES;
export async function POST(request:Request){
 const denied=await requireMediaAdmin(request);if(denied)return denied;
 if(Number(request.headers.get('content-length')??0)>maxBytes+65536)return NextResponse.json({error:'Massimo 4 MB'},{status:413});
 let art:Awaited<ReturnType<typeof prepareCharacter>>;
 try{
  const form=await request.formData();const file=form.get('file');
  if(!(file instanceof File)||!file.size||file.size>maxBytes)throw Error();
  art=await prepareCharacter(Buffer.from(await file.arrayBuffer()),String(form.get('id')??''));
 }catch{return NextResponse.json({error:'Usa PNG o WebP con sfondo davvero trasparente, massimo 4 MB.'},{status:400});}
 try{
  if(!r2MediaClient)throw Error();
  const {original,preview,prefix,format}=art;
  for(const [key,body,contentType] of [[`${prefix}/originale.${format}`,original,`image/${format}`],[`${prefix}/personaggio.webp`,preview,'image/webp']] as const)
   await r2MediaClient.send(new PutObjectCommand({Bucket:MEDIA_BUCKET_NAME,Key:key,Body:body,ContentType:contentType,CacheControl:'public, max-age=31536000, immutable',IfNoneMatch:'*'}));
  return NextResponse.json({image_url:`${MEDIA_PUBLIC_BASE_URL}/${prefix}/personaggio.webp`},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Caricamento non riuscito. Riprova.'},{status:503});}
}
