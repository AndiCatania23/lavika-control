import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
// Pass a local PGlite install path: no production connection, jobs or pushes.
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const root=new URL('../../supabase/migrations/',import.meta.url);

test('Comics first-publication push: copy, audience, atomicity and lifetime deduplication',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.notification_jobs(id uuid primary key default gen_random_uuid(),topic text not null,channel text default 'push',episode_id text,payload jsonb default '{}',audience_filter jsonb,status text default 'queued',scheduled_at timestamptz default now(),updated_at timestamptz default now());
 grant all on public.notification_jobs to service_role;`);
 await db.exec(await readFile(new URL('20261013104212_lavika_comics.sql',root),'utf8'));
 async function card(series,number,status='draft'){
 const {rows:[asset]}=await db.query(`insert into comics_assets(series,episode_number,original_key,preview_key,image_url,preview_url,width,height,byte_size,sha256) values($1,$2,'comics/'||gen_random_uuid(),'comics/'||gen_random_uuid(),'https://example.test/card.jpg','https://example.test/preview.webp',1080,1350,1024,repeat('a',64)) returning id`,[series,number]);
 const {rows:[episode]}=await db.query(`insert into comics_episodes(series,episode_number,episode_date,status,asset_id) values($1,$2,current_date,$3,$4) returning id`,[series,number,status,asset.id]);return episode.id;
 }
 const legacy=await card(1,9,'published');
 await db.exec(await readFile(new URL('20261013181134_comics_publication_push.sql',root),'utf8'));
 const jobs=async()=> (await db.query('select * from notification_jobs order by episode_id')).rows;
 assert.equal((await jobs()).length,0,'no retrospective notifications');
 await db.query(`update comics_episodes set status='draft' where id=$1`,[legacy]);
 await db.query(`update comics_episodes set status='published' where id=$1`,[legacy]);
 assert.equal((await jobs()).length,0,'historical cards stay silent');
 await db.exec('set role service_role');
 const first=await card(1,10);await db.query(`update comics_episodes set status='beta' where id=$1`,[first]);
 assert.equal((await jobs()).length,0,'draft and beta do not notify');
 await db.query(`update comics_episodes set status='published' where id=$1`,[first]);
 let job=(await jobs())[0];
 assert.equal(job.topic,'new_comic');assert.deepEqual(job.audience_filter,{type:'all_active'});
 assert.equal(job.payload.title,'LAVIKA COMICS');
 assert.equal(job.payload.body,'Il fischio finale è solo l’inizio. Scopri l’episodio #010.');
 assert.equal(job.payload.url,`/comics/${first}`);
 await db.query(`update comics_episodes set caption='Edit',push_on_publish_consumed=false where id=$1`,[first]);
 assert.equal((await jobs()).length,1,'edits cannot reset dedup');
 await db.query(`update comics_episodes set status='draft' where id=$1`,[first]);
 assert.equal((await jobs())[0].status,'canceled');
 await db.query(`update comics_episodes set status='published' where id=$1`,[first]);
 assert.equal((await jobs()).length,1,'republishing never duplicates');
 const named=await card(2,1,'published');
 job=(await jobs()).find(j=>j.episode_id===named);
 assert.equal(job.payload.title,'I soliti noti sono tornati.');
 assert.equal(job.payload.body,'Nuovo episodio #001 di LAVIKA COMICS. Stavolta che avranno combinato?');
 const zero=(await db.query(`select comics_push_payload(2,0,$1) as payload`,[named])).rows[0].payload;
 assert.match(zero.body,/#000 /);
 const large=(await db.query(`select comics_push_payload(1,1000,$1) as payload`,[named])).rows[0].payload;
 assert.match(large.body,/#1000\./);
 const future=await card(3,0,'published');assert.match((await jobs()).find(j=>j.episode_id===future).payload.body,/#000\./);
 const count=(await jobs()).length;
 await db.exec('begin');await card(2,2,'published');await db.exec('rollback');
 assert.equal((await jobs()).length,count,'rollback leaves no sendable job');
 await assert.rejects(db.query(`insert into notification_jobs(topic,episode_id) values('new_comic',$1)`,[named]));
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query(`select comics_push_payload(1,1,$1)`,[named]));
 await assert.rejects(db.query(`insert into notification_jobs(topic) values('new_comic')`));
 }finally{await db.close();}
});
