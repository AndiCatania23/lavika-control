import {z} from 'zod';
export const AUCTION_ID='logo-storico-catania';
const sourceUrl=z.string().trim().max(2000).url().refine(value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}},'Inserisci un link HTTP o HTTPS');
const fields=z.object({
 amount:z.number().finite().positive().max(999999999).refine(v=>Math.abs(v*100-Math.round(v*100))<.0001,'Massimo due decimali'),
 source_kind:z.enum(['article','broadcast']),source_name:z.string().trim().min(1).max(120),source_url:z.string().trim().pipe(z.union([z.literal(''),sourceUrl])).default(''),
 source_title:z.string().trim().max(500).default(''),source_published_at:z.iso.datetime({offset:true}).refine(v=>Date.parse(v)<=Date.now()+60000,'La fonte non può essere nel futuro'),
 source_timecode:z.string().regex(/^(?:\d{1,3}:)?[0-5]?\d:[0-5]\d$/,'Usa mm:ss o hh:mm:ss').nullable(),internal_notes:z.string().max(10000),
 status:z.enum(['draft','published','withdrawn']),change_reason:z.string().trim().min(3).max(1000),
}).strict().refine(v=>v.source_kind==='broadcast'||v.source_timecode===null,'Il minuto riguarda soltanto le trasmissioni');
export const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id:z.uuid(),data:fields}).strict(),
 z.object({action:z.literal('edit'),id:z.uuid(),revision:z.number().int().positive(),data:fields}).strict(),
 z.object({action:z.literal('state'),revision:z.number().int().positive(),state:z.enum(['scheduled','live','paused','closed']),change_reason:z.string().trim().min(3).max(1000)}).strict(),
]);
export type AuctionFields=z.infer<typeof fields>;
export type AuctionRow=AuctionFields&{id:string;revision:number;published_at:string|null;created_at:string;updated_at:string};
export type AuctionConfig={id:string;title:string;state:'scheduled'|'live'|'paused'|'closed';revision:number;updated_at:string};
