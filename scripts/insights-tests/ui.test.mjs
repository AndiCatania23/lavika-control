import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { RetentionIntegrityPanel } = require('../../src/app/(console)/insights/components/RetentionIntegrityPanel.tsx');
const { IntegrityBaselinePanel } = require('../../src/app/(console)/insights/components/IntegrityBaselinePanel.tsx');
const { buildReport } = require('../../src/app/(console)/insights/components/CopyInsightsReport.tsx');

const retention={eligible:20,appD7:1,coreD7:0,appWeek1:14,coreWeek1:10,observedFrom:'2026-09-13T00:00:00Z',certifiedAt:'2026-09-13T01:00:00Z'};
const baseline={certified_at:retention.certifiedAt,acquired:0,activation_eligible:0,activated_d0:0,w1_eligible:0,w1_returned:0,wau:0,mau:0,windows_complete:false};
test('UI and copied report distinguish exact app/core, cumulative and immature baseline',async()=>{
 const html=renderToStaticMarkup(createElement('main',{className:'mx-auto max-w-[1280px] space-y-7 p-6'},
  createElement('p',{},'Fixture di verifica — numeri dello snapshot audit, certificazione simulata'),
  createElement(IntegrityBaselinePanel,{data:baseline}),createElement(RetentionIntegrityPanel,{data:retention})));
 for(const label of ['D7 App Return','D7 Core Action','Returned D1–D7','1/20','0/20','14/20','10/20','campione non maturato','Finestre parziali']) assert.ok(html.includes(label),label);
 const missing=renderToStaticMarkup(createElement(RetentionIntegrityPanel,{data:null}));
 assert.ok(missing.includes('errore di lettura'));assert.ok(!missing.includes('0%'));
 const report=buildReport({hero:{retentionD7Returned:0,retentionD7Sample:20,retentionD7Pct:0},retentionIntegrity:retention,integrityBaseline:baseline,coreUsage:[],coreUsageAvailable:true,coreUsageDaily:[],funnel:{},activation:[],cohorts:[{cohortWeek:'2026-08-24',cohortSize:20,d1Returned:3,d1Eligible:20,d1Pct:15,d7Returned:0,d7Eligible:20,d7Pct:0,d30Returned:0,d30Eligible:0,d30Pct:null}],dauSeries:[],guestVsReg:[],apple:{latest:{metricDate:null},series:[]},deviceGeo:{topOs:[],topCountries:[]}});
 for(const line of ['D7 App Return · exact: 1/20 = 5%','D7 Core Action · exact: 0/20 = 0%','Returned D1–D7 · App / W1 Return: 14/20 = 70%','Returned D1–D7 · Core: 10/20 = 50%','core D1 exact 3/20','campione non maturato']) assert.ok(report.includes(line),line);
 assert.ok(!report.includes('iscritti; stessa funzione'));
 if(process.env.INSIGHTS_UI_ARTIFACT) {
  const chunks='.next/static/chunks';
  const css=(await Promise.all((await readdir(chunks)).filter(f=>f.endsWith('.css')).map(f=>readFile(`${chunks}/${f}`,'utf8')))).join('\n');
  await writeFile(process.env.INSIGHTS_UI_ARTIFACT,`<!doctype html><html data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Insights integrity — fixture</title><style>${css}</style><body>${html}</body></html>`);
 }
});
