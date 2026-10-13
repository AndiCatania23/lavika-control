import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {firstEpisodeNumber} from './series';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2MediaClient, MEDIA_BUCKET_NAME, MEDIA_PUBLIC_BASE_URL } from '../r2MediaClient';
export const MAX_CARD_BYTES = 4 * 1024 * 1024;
export async function prepareCard(input: Buffer, series: number, episode: number, version = randomUUID()) {
 if (!Number.isInteger(series) || series < 1 || series > 999 || !Number.isInteger(episode) || episode < firstEpisodeNumber(series) || episode > 99999) throw Error('Serie o numero episodio non valido');
 if (!input.length || input.length > MAX_CARD_BYTES) throw Error('La card deve essere di massimo 4 MB');
 const metadata = await sharp(input, { limitInputPixels: 25000000 }).metadata();
 if (!metadata.format || !['jpeg','png','webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height) throw Error('Scegli una card JPG, PNG o WebP statica');
 const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
 const prefix = `comics/serie-${String(series).padStart(2,'0')}/${String(episode).padStart(3,'0')}/${version}`;
 const preview = await sharp(input, { limitInputPixels: 25000000 }).rotate().resize({width:700,withoutEnlargement:true}).webp({quality:90}).toBuffer();
 const rotated = [5,6,7,8].includes(metadata.orientation ?? 1);
 return { original: input, preview, contentType: `image/${metadata.format}`, asset: {
  id: version, series, episode_number: episode,
  original_key: `${prefix}/card.${extension}`, preview_key: `${prefix}/preview.webp`,
  image_url: `${MEDIA_PUBLIC_BASE_URL}/${prefix}/card.${extension}`,
  preview_url: `${MEDIA_PUBLIC_BASE_URL}/${prefix}/preview.webp`,
  width: rotated ? metadata.height : metadata.width, height: rotated ? metadata.width : metadata.height,
  byte_size: input.length, sha256: createHash('sha256').update(input).digest('hex'),
 }};
}
export async function storeCard(card: Awaited<ReturnType<typeof prepareCard>>) {
 if (!r2MediaClient) throw Error('Archivio media non configurato');
 // Immutable keys. Never delete/overwrite an earlier approved original.
 for (const [key,body,type] of [[card.asset.original_key,card.original,card.contentType],[card.asset.preview_key,card.preview,'image/webp']] as const) {
  await r2MediaClient.send(new PutObjectCommand({Bucket:MEDIA_BUCKET_NAME,Key:key,Body:body,ContentType:type,CacheControl:'public, max-age=31536000, immutable',IfNoneMatch:'*'}));
 }
}
