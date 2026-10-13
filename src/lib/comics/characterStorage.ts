import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {characterId} from './characterSchema';
export const MAX_CHARACTER_BYTES=4*1024*1024;
export async function prepareCharacter(original:Buffer,id:string){
 characterId.parse(id);
 if(!original.length||original.length>MAX_CHARACTER_BYTES)throw Error('Dimensione non valida');
 const options={limitInputPixels:25000000};
 const meta=await sharp(original,options).metadata();
 if(!meta.format||!['png','webp'].includes(meta.format)||(meta.pages??1)>1||!meta.hasAlpha)throw Error('Formato non valido');
 const stats=await sharp(original,options).stats();if(stats.isOpaque)throw Error('Sfondo non trasparente');
 const preview=await sharp(original,options).rotate().resize({height:640,withoutEnlargement:true}).webp({quality:92}).toBuffer();
 return {original,preview,prefix:`comics/personaggi/${id}/${randomUUID()}`,format:meta.format};
}
