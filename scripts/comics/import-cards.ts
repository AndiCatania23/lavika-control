/** Explicit import: node --env-file=.env.local --import tsx scripts/comics/import-cards.ts <artifact-directory> */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createClient} from '@supabase/supabase-js';
import {HeadObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {prepareCard,storeCard} from '../../src/lib/comics/storage';
import {r2MediaClient,MEDIA_BUCKET_NAME,MEDIA_PUBLIC_BASE_URL} from '../../src/lib/r2MediaClient';
async function main(){
 const directory=process.argv[2];if(!directory)throw Error('Provide the approved artifact directory');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const catalog=JSON.parse(await readFile(resolve(directory,'catalogo-serie-01.json'),'utf8'));
 const imported=[];
 for(const entry of catalog.episodes){
  const input=await readFile(resolve(directory,entry.image_path));
  const digest=createHash('sha256').update(input).digest('hex');
  if(digest!==entry.sha256)throw Error(`Original changed: ${entry.episode_label}`);
  const existing=await db.from('comics_episodes').select('id').eq('series',Number(entry.series)).eq('episode_number',entry.episode_number).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data){console.log(`Already exists: ${entry.episode_label}; no overwrite`);continue;}
  const card=await prepareCard(input,Number(entry.series),entry.episode_number);await storeCard(card);
  const head=await r2MediaClient!.send(new HeadObjectCommand({Bucket:MEDIA_BUCKET_NAME,Key:card.asset.original_key}));
  if(head.ContentLength!==input.length)throw Error('Remote size mismatch');
  const assetResult=await db.from('comics_assets').insert(card.asset);if(assetResult.error)throw assetResult.error;
  const result=await db.from('comics_episodes').insert({series:Number(entry.series),episode_number:entry.episode_number,episode_date:entry.episode_date,match_reference:entry.match_reference,status:'beta',asset_id:card.asset.id}).select('id').single();
  if(result.error)throw result.error;
  imported.push({episode:entry.episode_label,episode_id:result.data.id,...card.asset});console.log(`Imported ${entry.episode_label}: original ${input.length} bytes; preview ${card.preview.length} bytes; beta only`);
 }
 const logo=await readFile(resolve(directory,'lavika-comics-logo-nero-v2.png'));
 const key=`comics/brand/${createHash('sha256').update(logo).digest('hex').slice(0,16)}/logo-nero.png`;
 await r2MediaClient!.send(new PutObjectCommand({Bucket:MEDIA_BUCKET_NAME,Key:key,Body:logo,ContentType:'image/png',CacheControl:'public, max-age=31536000, immutable'}));
 const preview=await sharp(logo).resize({width:640,withoutEnlargement:true}).webp({quality:90}).toBuffer();
 const previewKey=key.replace('logo-nero.png','logo-nero-640-v1.webp');
 await r2MediaClient!.send(new PutObjectCommand({Bucket:MEDIA_BUCKET_NAME,Key:previewKey,Body:preview,ContentType:'image/webp',CacheControl:'public, max-age=31536000, immutable'}));
 const report={imported,logo_preview_url:`${MEDIA_PUBLIC_BASE_URL}/${previewKey}`,logo_url:`${MEDIA_PUBLIC_BASE_URL}/${key}`};await writeFile(resolve(directory,'r2-import-report.json'),JSON.stringify(report,null,2)+'\n');console.log(`Logo: ${report.logo_url}`);
}
main().catch(error=>{console.error(error.message??error);process.exitCode=1;});
