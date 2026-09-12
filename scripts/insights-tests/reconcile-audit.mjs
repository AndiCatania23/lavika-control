/** Replay immutable audit in isolated PostgreSQL. No production connection. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createDatabase } from './database.mjs';
const auditDir=resolve(process.argv[2] || ''), out=resolve(process.argv[3] || '');
if(!process.argv[3]) throw Error('Usage: node scripts/insights-tests/reconcile-audit.mjs AUDIT_DIR OUTPUT_DIR');
const read=async name=>JSON.parse(await readFile(resolve(auditDir,name),'utf8'));
const original=await read('snapshot-anon.json'), definitions=await read('database-definitions.json');
const manual=await read('manual-view-checks.json');
const uuid=value=>value==null?null:createHash('md5').update(value).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
const {db,freeze,apply}=await createDatabase(original.audit_at);
try {
 for(const p of original.profiles) await db.query('insert into user_profiles(id,created_at,onboarding_completed_at) values($1,$2,$3)',[uuid(p.anon),p.created_at,p.onboarded?p.created_at:null]);
 for(const e of original.events) await db.query('insert into content_events(id,user_id,occurred_at,event_name,device_id,content_id,content_type,session_key,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[e.id,uuid(e.anon),e.at,e.event,e.device,e.content,e.feature,e.event==='view_start'?null:e.session,e.event==='view_start'?{playback_session_key:e.session}:{}]);
 for(const s of original.sessions) await db.query('insert into user_sessions(id,user_id,session_key,first_seen_at,last_seen_at,device_id,os_name,country_code) values($1,$2,$3,$4,$5,$6,$7,$8)',[s.id,uuid(s.anon),s.session,s.first,s.last,s.device,s.os,s.country]);
 // Original deployed definitions for the three views absent from historical migration files.
 for(const name of ['v_insights_kpi_windows','v_insights_next_day_return','v_insights_active_users_daily','v_insights_guest_vs_registered']) {
  const v=definitions.views.find(v=>v.name===name);
  await db.exec(freeze(`create or replace view ${name} as ${v.definition}`));
 }
 await apply();
 if (process.argv[4]) {
  const deployed=JSON.parse(await readFile(resolve(process.argv[4]),'utf8'));
  const order=['v_insights_core_actions','v_insights_first_value','v_insights_core_usage_windows','v_insights_core_usage_daily','v_insights_complete_retention_cohorts','v_insights_complete_signup_funnel','v_insights_complete_activation_by_feature','v_insights_kpi_windows','v_insights_next_day_return','v_insights_active_users_daily','v_insights_guest_vs_registered','v_insights_app_days','v_insights_retention_users_v1','v_insights_retention_summary_v1','v_insights_baseline_v1'];
  for(const name of order) {
   const v=deployed.find(v=>v.name===name);
   if(!v) throw Error(`Missing deployed view: ${name}`);
   await db.exec(freeze(`create or replace view ${name} as ${v.definition}`));
  }
 }
 const mapping={kpi:'v_insights_kpi_windows',nextday:'v_insights_next_day_return',features:'v_insights_core_usage_windows',guest:'v_insights_guest_vs_registered',cohorts:'v_insights_complete_retention_cohorts',daily_features:'v_insights_core_usage_daily',daily_active:'v_insights_active_users_daily',activation:'v_insights_complete_activation_by_feature',funnel:'v_insights_complete_signup_funnel'};
 const after=structuredClone(original);
 for(const [key,view] of Object.entries(mapping)) {
  const rows=JSON.parse(JSON.stringify((await db.query(`select * from ${view}`)).rows));
  // pg date is a midnight Date in JS, audit transport used date-only strings.
  for(const row of rows) for(const k of ['day','cohort_week']) if(row[k]) row[k]=row[k].slice(0,10);
  for(const row of rows) for(const k of ['session_median_min','next_day_return_pct']) if(row[k]!=null) row[k]=Number(row[k]);
  after[key]=['kpi','nextday'].includes(key)?rows[0]:rows;
 }
 for(const r of manual.rows) r.actions=(await db.query("select count(*) n from v_insights_core_actions where user_id=$1 and feature=$2 and occurred_at>='2026-08-22T20:41:06Z' and occurred_at<=$3",[uuid(r.anon),r.feature,original.audit_at])).rows[0].n;
 // Python expected side independently canonicalizes original raw; don't export SQL-derived raw.
 const retention=(await db.query('select * from v_insights_retention_users_v1')).rows.map(r=>({...r,user_id:original.profiles.find(p=>uuid(p.anon)===r.user_id)?.anon}));
 const checks=(await db.query(`select (select count(*) from user_sessions where last_seen_at<first_seen_at) negative_sessions,
 (select count(*) from content_events where analytics_duplicate_of is not null) preserved_duplicates,
 (select count(*) from (select device_id,content_id,metadata->>'playback_session_key' from v_insights_events where event_name='view_start' and nullif(metadata->>'playback_session_key','') is not null group by 1,2,3 having count(*)>1) d) duplicate_groups`)).rows[0];
 await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'snapshot-anon.json'),JSON.stringify(after,null,2));
 await writeFile(resolve(out,'manual-view-checks.json'),JSON.stringify(manual,null,2));
 await writeFile(resolve(out,'retention-after.json'),JSON.stringify(retention,null,2));
 await writeFile(resolve(out,'integrity-after.json'),JSON.stringify(checks,null,2));
 // Keep exactly the original 493 assertions. Change only feature return contract, with raw independent normalization.
 let python=await readFile(resolve(auditDir,'replay.py'),'utf8');
 python=python.replace("events=s['events']; sessions=s['sessions']",`events=s['events']; sessions=s['sessions']
# Expected transformations are independent of SQL view results.
seen=set(); canonical=[]
for e in sorted(events,key=lambda e:(dt(e['at']),e['id'])):
    if e['event']=='view_start' and e['session']:
        key=(('device:'+e['device']) if e['device'] is not None else ('user:'+e['anon']) if e['anon'] else 'unattributed:'+e['id'], e['content'] or 'unknown', e['session'])
        if key in seen: continue
        seen.add(key)
    canonical.append(e)
events=canonical
sessions=[dict(e,last=e['first'] if dt(e['last'])<dt(e['first']) else e['last']) for e in sessions]`);
 python=python.replace("sum(returned(p,n) for p in pp)","sum(any(e['anon']==p['anon'] and feature(e)==r['feature'] and day(e['at'])==day(p['created_at'])+timedelta(days=n) for e in core) for p in pp)");
 python=python.replace("print(json.dumps(","(P/'checks.json').write_text(json.dumps(checks,indent=2))\nprint(json.dumps(");
 await writeFile(resolve(out,'replay.py'),python);
 console.log(JSON.stringify({checks,retention:(await db.query('select * from v_insights_retention_summary_v1')).rows[0],output:out},null,2));
}finally{await db.close();}
