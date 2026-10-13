import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
test('real migration: total openings, unique users, series, Rome days, RLS and canonical isolation',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role atlas_reader;alter default privileges in schema public grant all on tables to service_role;alter default privileges in schema public grant select on tables to atlas_reader;create schema auth;create table auth.users(id uuid primary key);
 create table comics_episodes(id uuid primary key,series integer,episode_number integer,title text,match_reference text,status text);
 create table analytics_measurement_versions(version text primary key,installed_at timestamptz default now(),certified_at timestamptz,contract text);
 create table content_events(id integer primary key,user_id uuid,event_name text);
 insert into content_events values(1,null,'view_start');
 create view v_insights_events as select * from content_events;
 grant select on comics_episodes,analytics_measurement_versions to service_role;`);
 const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const user=uuid(1),user2=uuid(2),a=uuid(3),b=uuid(4),draft=uuid(5),zero=uuid(6);
 await db.query('insert into auth.users values($1),($2)',[user,user2]);
 await db.query(`insert into comics_episodes values($1,1,10,'A','','published'),($2,2,1,'B','','published'),($3,2,2,'Draft','','draft'),($4,1,11,'Zero','','published')`,[a,b,draft,zero]);
 const before=(await db.query('select * from v_insights_events')).rows;
 const definition=(await db.query("select pg_get_viewdef('v_insights_events') d")).rows[0].d;
 await db.exec(await readFile(new URL('../../supabase/migrations/20261013192112_comics_insights.sql',import.meta.url),'utf8'));
 const baselineBefore=(await db.query("select installed_at from analytics_measurement_versions where version='comics_openings_v1'")).rows;
 await db.exec(await readFile(new URL('../../supabase/migrations/20261013192112_comics_insights.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query("select installed_at from analytics_measurement_versions where version='comics_openings_v1'")).rows,baselineBefore);
 for (const privilege of ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) assert.equal((await db.query(`select has_table_privilege('service_role','comics_openings','${privilege}') allowed`)).rows[0].allowed,false);
 assert.equal((await db.query("select has_table_privilege('atlas_reader','comics_openings','SELECT') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'comics_open%' ")).rows[0].n,1);
 await db.exec('set role service_role');
 const open=(id,opening,actor=user)=>db.query('select record_comics_opening($1,$2,$3)',[actor,uuid(opening),id]);
 await Promise.all([open(a,10),open(a,10)]);await open(a,11);await open(a,12);await open(a,10,user2);await open(b,13);await open(draft,14);
 let report=(await db.query('select comics_insights() data')).rows[0].data;
 assert(report.startedAt);assert(report.generatedAt);
 const total=report.rows.find(r=>r.kind==='total');assert.equal(total.opens,5);assert.equal(total.unique_users,2);
 const card=report.rows.find(r=>r.episode_id===a);assert.equal(card.opens,4);assert.equal(card.unique_users,2);
 assert.equal(report.rows.find(r=>r.kind==='series'&&r.series===1).opens,4);
 assert.equal(report.rows.find(r=>r.episode_id===zero).opens,0);
 assert(!report.rows.some(r=>r.episode_id===draft));
 assert.equal(report.daily.reduce((n,r)=>n+r.opens,0),5);
 // Same opening replay on another episode cannot create another row.
 await open(b,10);assert.equal((await db.query('select count(*)::int n from comics_openings')).rows[0].n,5);
 await db.exec('reset role');
 await db.exec(`update analytics_measurement_versions set installed_at=now()-interval '5 days' where version='comics_openings_v1'`);
 // Two instants on opposite sides of a Rome midnight, independent of DB timezone.
 const midnight=(await db.query("select (((now() at time zone 'Europe/Rome')::date-1)::timestamp at time zone 'Europe/Rome')::text t")).rows[0].t;
 await db.query(`insert into comics_openings values($1,$2,$3,$4::timestamptz-interval '1 second'),($5,$2,$3,$4::timestamptz+interval '1 second')`,[uuid(30),user,a,midnight,uuid(31)]);
 report=(await db.query('select comics_insights() data')).rows[0].data;
 assert.equal(report.rows.find(r=>r.kind==='total').opens,7);
 assert.equal(report.daily.filter(r=>r.series===1&&r.opens===1).length,2);
 assert(report.daily.some(r=>r.opens===0));
 assert.deepEqual((await db.query('select * from v_insights_events')).rows,before);
 assert.equal((await db.query("select pg_get_viewdef('v_insights_events') d")).rows[0].d,definition);
 assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='comics_openings'::regclass and not tgisinternal")).rows[0].n,0);
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query('select comics_insights()'),/permission denied/);
  await assert.rejects(()=>db.query('select * from comics_openings'),/permission denied/);
  await assert.rejects(()=>open(a,99),/permission denied/);
 }
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[user2]);
 assert.equal((await db.query('select count(*)::int n from comics_openings where user_id=$1',[user2])).rows[0].n,0);
 if(process.env.COMICS_BENCHMARK==='1') {
  await db.exec(`insert into auth.users select md5('bench-user-'||i)::uuid from generate_series(1,1000) i;
   insert into comics_episodes select md5('bench-card-'||i)::uuid,1+(i%2),i,'Benchmark','','published' from generate_series(1,100) i;
   insert into comics_openings select md5('bench-open-'||i)::uuid,md5('bench-user-'||(1+(i%1000)))::uuid,md5('bench-card-'||(1+(i%100)))::uuid,now() from generate_series(1,100000) i;
   analyze comics_openings;`);
  const start=performance.now();const data=(await db.query('select comics_insights() data')).rows[0].data;
  console.log('Synthetic 100000 openings / 100 episodes:',Math.round(performance.now()-start),'ms; rows:',data.rows.length);
 }
 }finally{await db.close();}
});
