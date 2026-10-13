import { z } from 'zod';
export const statuses = { draft: 'Bozza', beta: 'Solo beta', published: 'Pubblicata' } as const;
export const episodeFields = z.object({
 series: z.number().int().min(1).max(999),
 episode_number: z.number().int().min(0).max(99999),
 episode_date: z.iso.date(),
 title: z.string().trim().max(160),
 caption: z.string().trim().max(5000),
 match_reference: z.string().trim().max(200),
 status: z.enum(['draft','beta','published']),
 asset_id: z.uuid(),
}).strict();
export const mutation = z.discriminatedUnion('action', [
 z.object({ action: z.literal('create'), id: z.uuid(), data: episodeFields }).strict(),
 z.object({ action: z.literal('edit'), id: z.uuid(), revision: z.number().int().positive(), data: episodeFields }).strict(),
]);
export type ComicsAsset = { id: string; image_url: string; preview_url: string; width: number; height: number; sha256: string };
export type ComicsEpisode = z.infer<typeof episodeFields> & { id: string; revision: number; asset: ComicsAsset };
export const episodeSelect = 'id,series,episode_number,episode_date,title,caption,match_reference,status,asset_id,revision,asset:comics_assets(id,image_url,preview_url,width,height,sha256)';
