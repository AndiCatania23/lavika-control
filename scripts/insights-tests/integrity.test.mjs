import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './database.mjs';

const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const dates = ['2026-08-25T12:00:00Z','2026-08-26T12:00:00Z',null,'2026-08-28T12:00:00Z'];

test('SQL production migration: duration, idempotency, retention and daily evidence', async () => {
 const {db,apply}=await createDatabase('2026-09-12T21:50:23Z');
 try {
  for(let n=1;n<=9;n++) await db.query('insert into user_profiles(id,created_at) values($1,$2)',[uid(n),n===7?'2026-08-25T21:30:00Z':dates[0]]);
  // Historical negative durations and duplicate video evidence are retained.
  await db.query("insert into user_sessions(user_id,session_key,first_seen_at,last_seen_at) values($1,'bad','2026-08-25T12:00:01Z','2026-08-25T12:00:00Z')",[uid(1)]);
  for(let n=0;n<2;n++) await db.query("insert into content_events(user_id,occurred_at,event_name,device_id,episode_id,metadata) values($1,'2026-08-25T13:00:00Z','view_start','device-1',$2,'{\"playback_session_key\":\"play-1\"}')",[uid(1),uid(100)]);
  await apply();
  const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
  assert.equal((await q('select count(*) n from user_sessions where last_seen_at<first_seen_at'))[0].n,0);
  assert.equal((await q("select metadata->>'integrity_v1_original_last_seen_at' original from user_sessions"))[0].original,'2026-08-25T12:00:00+00:00');
  await db.query("update user_sessions set metadata='{}' where session_key='bad'");
  assert.ok((await q("select metadata->>'integrity_v1_original_last_seen_at' original from user_sessions where session_key='bad'"))[0].original);
  assert.equal((await q('select count(*) n from content_events'))[0].n,2);
  assert.equal((await q('select count(*) n from v_insights_events'))[0].n,1);
  // Same idempotency tuple is enforced by PostgreSQL, independent of any SELECT race.
  await assert.rejects(db.query("insert into content_events(user_id,occurred_at,event_name,device_id,episode_id,metadata) values($1,'2026-08-25T13:00:00Z','view_start','device-1',$2,'{\"playback_session_key\":\"play-1\"}')",[uid(1),uid(100)]),e=>e.code==='23505');
  // First heartbeat under clock skew is clamped; updates cannot go backwards.
  await db.query("insert into user_sessions(user_id,session_key,first_seen_at,last_seen_at) values($1,'clock','2026-08-25T12:00:05Z','2026-08-25T12:00:00Z')",[uid(2)]);
  await db.query("update user_sessions set last_seen_at='2026-08-24T12:00:00Z' where session_key='clock'");
  assert.equal((await q('select count(*) n from user_sessions where last_seen_at<first_seen_at'))[0].n,0);
  // CHECK remains a second defence even if the normalization trigger is bypassed.
  await db.exec('alter table user_sessions disable trigger insights_normalize_session');
  await assert.rejects(db.query("insert into user_sessions(user_id,session_key,first_seen_at,last_seen_at) values($1,'reject','2026-08-25T12:00:05Z','2026-08-25T12:00:00Z')",[uid(2)]),e=>e.code==='23514');
  await db.exec('alter table user_sessions enable trigger insights_normalize_session');
  async function core(n,t,f='pill') { await db.query("insert into content_events(user_id,occurred_at,event_name,content_type,content_id,session_key) values($1,$2,'core_action',$3,$4,$5)",[uid(n),t,f,uid(100+n),`${n}:${t}`]); }
  // A D1/D7, B only D3, C never, D session-only D7, E core-only D7.
  await core(1,dates[1]); await core(1,'2026-09-01T12:00:00Z');
  await core(2,dates[3]);
  await db.query("insert into user_sessions(user_id,session_key,first_seen_at,last_seen_at) values($1,'session-only','2026-09-01T12:00:00Z','2026-09-01T12:00:00Z')",[uid(4)]);
  await core(5,'2026-09-01T12:00:00Z');
  // Guest conversion preserves playback identity, and pre-signup is not first value.
  await db.query("insert into content_events(occurred_at,event_name,device_id,episode_id,metadata) values('2026-08-24T12:00:00Z','view_start','guest-device',$1,'{\"playback_session_key\":\"guest-key\"}')",[uid(106)]);
  await db.query("update content_events set user_id=$1 where device_id='guest-device'",[uid(6)]);
  assert.equal((await q('select count(*) n from v_insights_first_value where user_id=$1',[uid(6)]))[0].n,0);
  await assert.rejects(db.query("insert into content_events(user_id,occurred_at,event_name,device_id,episode_id,metadata) values($1,'2026-08-24T12:00:00Z','view_start','guest-device',$2,'{\"playback_session_key\":\"guest-key\"}')",[uid(6),uid(106)]),e=>e.code==='23505');
  await core(6,dates[1]); await core(6,'2026-09-01T12:00:00Z');
  // 23:30 -> 00:20 Rome is D1 after 50 minutes.
  await core(7,'2026-08-25T22:20:00Z');
  const rows=await q('select * from v_insights_retention_users_v1');
  const r=n=>rows.find(r=>r.user_id===uid(n));
  assert.equal(r(1).d7_core_action,true); assert.equal(r(2).d7_core_action,false);
  assert.equal(r(2).returned_d1_d7_core,true); assert.equal(r(3).returned_d1_d7_app,false);
  assert.equal(r(4).d7_app_return,true); assert.equal(r(4).d7_core_action,false);
  assert.equal(r(5).d7_app_return,true); assert.equal(r(5).d7_core_action,true);
  assert.equal(r(6).d7_core_action,true);
  const cohort=(await q('select * from v_insights_complete_retention_cohorts'))[0];
  assert.equal(cohort.d1_returned,3); // A, converted guest, midnight user
  assert.equal(cohort.d7_returned,3); // A, core-only E, converted guest
  // Retention for a feature means the SAME feature, not any core action.
  await core(8,dates[0],'match'); await core(8,dates[1],'pill');
  const feat=(await q("select * from v_insights_complete_activation_by_feature where feature='match'"))[0];
  assert.equal(feat.activated_users,1); assert.equal(feat.d1_returned,0);
  // Updating last_seen no longer destroys observed D7 presence or invents intermediate days.
  await db.query("update user_sessions set last_seen_at='2026-09-02T12:00:00Z' where session_key='session-only'");
  assert.equal((await q('select d7_app_return from v_insights_retention_users_v1 where user_id=$1',[uid(4)]))[0].d7_app_return,true);
  assert.equal((await q('select count(*) n from analytics_session_days where user_id=$1',[uid(4)]))[0].n,2);
  // Certifying is not part of the migration.
  assert.equal((await q('select certified_at from analytics_measurement_versions'))[0].certified_at,null);
 } finally {await db.close();}
});

test('Europe/Rome exact dates and maturity across DST', async()=>{
 const {db,apply}=await createDatabase('2026-09-01T12:00:00Z');
 try {
  await apply();
  const {rows}=await db.query(`with f(signup,back) as (values
   ('2026-03-28T23:30:00+01'::timestamptz,'2026-03-29T23:20:00+02'::timestamptz),
   ('2026-10-24T23:30:00+02'::timestamptz,'2026-10-25T23:20:00+01'::timestamptz))
   select (back at time zone 'Europe/Rome')::date-(signup at time zone 'Europe/Rome')::date n from f`);
  assert.deepEqual(rows.map(r=>r.n),[1,1]);
  await db.query('insert into user_profiles(id,created_at) values($1,$2)',[uid(1),'2026-08-25T12:00:00Z']);
  assert.equal((await db.query('select d7_eligible from v_insights_retention_users_v1')).rows[0].d7_eligible,false);
 }finally{await db.close();}
});

test('baseline is gated by certification, excludes old signups and immature cohorts', async()=>{
 const {db,apply}=await createDatabase('2026-09-12T21:50:23Z');
 try {
  await db.query('insert into user_profiles(id,created_at) values($1,$2)',[uid(1),'2026-08-25T12:00:00Z']);
  await apply();
  assert.equal((await db.query('select acquired from v_insights_baseline_v1')).rows[0].acquired,0);
  // Isolated time fixture; production never backdates certification.
  await db.query("update analytics_measurement_versions set installed_at='2026-09-01T00:00:00Z',certified_at='2026-09-01T00:00:00Z'");
  for(const [n,t] of [[2,'2026-09-02T10:00:00Z'],[3,'2026-09-12T10:00:00Z']]) await db.query('insert into user_profiles(id,created_at) values($1,$2)',[uid(n),t]);
  await db.query("insert into content_events(user_id,occurred_at,event_name,content_type) values($1,'2026-09-02T11:00:00Z','core_action','pill')",[uid(2)]);
  await db.query("insert into user_sessions(user_id,session_key,first_seen_at,last_seen_at) values($1,'return','2026-09-09T12:00:00Z','2026-09-09T12:00:00Z')",[uid(2)]);
  const row=(await db.query('select * from v_insights_baseline_v1')).rows[0];
  assert.deepEqual([row.acquired,row.activation_eligible,row.activated_d0,row.w1_eligible,row.w1_returned,row.wau,row.mau,row.windows_complete],[2,1,1,1,1,1,1,false]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from analytics_session_days'),e=>e.code==='42501');
  await assert.rejects(db.query('select * from v_insights_baseline_v1'),e=>e.code==='42501');
 }finally{await db.close();}
});
