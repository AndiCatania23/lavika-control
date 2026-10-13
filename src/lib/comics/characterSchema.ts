import {z} from 'zod';
export const characterId=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const characterMutation=z.object({
 id:characterId,revision:z.number().int().positive().nullable(),
 data:z.object({
  player_id:z.string().min(1).max(200).nullable(),name:z.string().trim().min(1).max(80),
  role:z.string().trim().max(100),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  image_url:z.string().min(1).max(1000),active:z.boolean(),sort_order:z.number().int().min(0).max(99999),
 }).strict(),
}).strict();
