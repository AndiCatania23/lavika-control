import { z } from 'zod';
import {firstEpisodeNumber} from './series';
export const statuses = { draft: 'Bozza', beta: 'Solo beta', published: 'Pubblicata' } as const;
export const episodeFields = z.object({
 series: z.number().int().min(1).max(999),
 episode_number: z.number().int().min(0).max(99999),
 episode_date: z.iso.date(),
 title: z.string().trim().max(160),
 caption: z.string().trim().max(5000),
 match_reference: z.string().trim().max(200),
 character_ids: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)).max(100).refine(ids=>new Set(ids).size===ids.length,'Protagonisti duplicati').transform(ids=>[...ids].sort()),
 status: z.enum(['draft','beta','published']),
 asset_id: z.uuid(),
}).strict().refine(data=>data.episode_number>=firstEpisodeNumber(data.series), {path:['episode_number'],message:'I soliti noti parte dall’episodio 001'});
export const mutation = z.discriminatedUnion('action', [
 z.object({ action: z.literal('create'), id: z.uuid(), data: episodeFields }).strict(),
 z.object({ action: z.literal('edit'), id: z.uuid(), revision: z.number().int().positive(), data: episodeFields }).strict(),
]);
export type ComicsAsset = { id: string; image_url: string; preview_url: string; width: number; height: number; sha256: string };
export type ComicsEpisode = z.infer<typeof episodeFields> & { id: string; revision: number; asset: ComicsAsset };
export const episodeSelect = 'id,series,episode_number,episode_date,title,caption,match_reference,character_ids,status,asset_id,revision,asset:comics_assets(id,image_url,preview_url,width,height,sha256)';
