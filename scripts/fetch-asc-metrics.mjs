#!/usr/bin/env node
/**
 * Apple App Store Connect Analytics fetcher.
 *
 * Scarica le metriche giornaliere dell'app (downloads, sessions, active
 * devices, crashes) via ASC Analytics Reports API v1 e le upserta in
 * Supabase tabella `apple_app_metrics`.
 *
 * Flow:
 *   1. Genera JWT ES256 via asc-jwt.mjs
 *   2. POST  /v1/analyticsReportRequests (ONE_TIME_SNAPSHOT, app_id corrente)
 *   3. GET   /v1/analyticsReportRequests/{id}/reports?filter[category]=APP_USAGE
 *   4. GET   /v1/analyticsReports/{id}/instances?filter[granularity]=DAILY&filter[processingDate]=YYYY-MM-DD
 *   5. GET   /v1/analyticsReportInstances/{id}/segments → URL S3 presigned
 *   6. Download .csv.gz → parse → upsert su `apple_app_metrics` (idempotente)
 *
 * Apple delay: ASC Analytics ha ~48h di delay sulle metriche.
 * Default: scarica i dati di `today - 2 days` (configurabile via TARGET_DATE).
 *
 * Env required (in ~/LAVIKA-SPORT/config/asc.env):
 *   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH (vedi asc-jwt.mjs)
 *   ASC_APP_ID                 — es. "6762273646" (LAVIKA Sport)
 *   NEXT_PUBLIC_SUPABASE_URL   — https://znvykgdgjcvubodeoczr.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  — service_role JWT
 *
 * Env optional:
 *   TARGET_DATE                — YYYY-MM-DD (default: today - 2 days)
 *   ASC_REPORT_CATEGORY        — default "APP_USAGE"
 */

import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateAscToken } from './asc-jwt.mjs';

const ASC_BASE = 'https://api.appstoreconnect.apple.com';

// Cache locale del request_id ASC (Apple non permette GET collection su
// analyticsReportRequests → riusiamo l'ID generato al primo run).
const REQUEST_ID_CACHE = `${homedir()}/LAVIKA-SPORT/config/asc-report-request-id.txt`;

function todayMinusDays(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function ascFetch(path, token, options = {}) {
  const url = path.startsWith('http') ? path : `${ASC_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(options.body && !options.headers?.['Content-Type']
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ASC ${res.status} ${path}: ${body.slice(0, 500)}`);
  }
  // Alcuni endpoint ritornano text/csv o stream; gestione fuori.
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

/**
 * Step 1: Crea (o riusa) una analytics report request ONE_TIME_SNAPSHOT
 * per l'app. Apple NON permette GET collection su analyticsReportRequests
 * (errore "operation not allowed"), quindi cachiamo l'ID localmente su file
 * dopo il primo POST e lo riusiamo nei run successivi.
 *
 * Se il file cache contiene un ID valido → GET_INSTANCE per verificare che
 * sia ancora attivo. Se 404/410 → ricrea.
 */
async function getOrCreateReportRequest(token, appId) {
  // 1) Prova a riusare ID cachato su file
  let cachedId = null;
  try {
    cachedId = (await readFile(REQUEST_ID_CACHE, 'utf8')).trim();
  } catch {
    // file non esiste = first run
  }

  if (cachedId) {
    try {
      const existing = await ascFetch(
        `/v1/analyticsReportRequests/${cachedId}`,
        token,
      );
      if (existing.data?.id) {
        log(`Reusing cached report request ${cachedId}`);
        return cachedId;
      }
    } catch (err) {
      log(`Cached request ${cachedId} non valido (${err.message.slice(0, 80)}). Ricreo.`);
    }
  }

  // 2) Crea nuova request ONE_TIME_SNAPSHOT
  log('Creating new ONE_TIME_SNAPSHOT report request...');
  const created = await ascFetch('/v1/analyticsReportRequests', token, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'analyticsReportRequests',
        attributes: { accessType: 'ONE_TIME_SNAPSHOT' },
        relationships: {
          app: { data: { type: 'apps', id: appId } },
        },
      },
    }),
  });

  const newId = created.data.id;

  // 3) Cache su file per il prossimo run
  try {
    await mkdir(dirname(REQUEST_ID_CACHE), { recursive: true });
    await writeFile(REQUEST_ID_CACHE, newId, { mode: 0o600 });
    log(`Cached request ${newId} in ${REQUEST_ID_CACHE}`);
  } catch (err) {
    log(`Warning: cache write failed (${err.message}). Ricreera' nuovo ID al prossimo run.`);
  }

  return newId;
}

async function listReports(token, requestId, category) {
  const data = await ascFetch(
    `/v1/analyticsReportRequests/${requestId}/reports?filter[category]=${category}&limit=200`,
    token,
  );
  return data.data || [];
}

async function listInstances(token, reportId, targetDate) {
  const data = await ascFetch(
    `/v1/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&filter[processingDate]=${targetDate}&limit=200`,
    token,
  );
  return data.data || [];
}

async function listSegments(token, instanceId) {
  const data = await ascFetch(
    `/v1/analyticsReportInstances/${instanceId}/segments?limit=200`,
    token,
  );
  return data.data || [];
}

/**
 * Scarica un .csv.gz da URL S3 presigned, decomprime e parsa in righe.
 * Apple usa tab-separated; gestiamo entrambi (`\t` se presente, altrimenti `,`).
 */
async function downloadAndParseCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`segment download ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Decomprimi gzip se necessario
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  let text;
  if (isGzip) {
    const chunks = [];
    await pipeline(Readable.from(buf), createGunzip(), async function* (src) {
      for await (const chunk of src) {
        chunks.push(chunk);
        yield chunk;
      }
    });
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    text = buf.toString('utf8');
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(sep);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
  return { headers, rows };
}

/**
 * Aggrega righe CSV (tipicamente granulari per country/device/source) in un
 * singolo record per (metric_date, region). region 'WORLD' = totale globale.
 *
 * Le colonne tipiche di APP_USAGE (categoria primaria):
 *   - Date, App Name, App Apple ID, App Version, Country/Region, Source Type, ...
 *   - Total Downloads, First-Time Downloads, Redownloads, Installations, Sessions, Active Devices, Crashes
 *
 * Per ora aggreghiamo solo i totali WORLD e teniamo i top-5 country in
 * `breakdown` JSONB per la dashboard.
 */
function aggregate(rows, targetDate, appId) {
  let downloads = 0;
  let firstTime = 0;
  let redownloads = 0;
  let installs = 0;
  let sessions = 0;
  let activeDevices = 0;
  let crashes = 0;

  const byCountry = new Map();

  for (const r of rows) {
    const country = r['Country/Region'] || r['Country'] || r['country'] || '';
    const dl = Number(r['Total Downloads'] || r['Downloads'] || 0);
    const ft = Number(r['First-Time Downloads'] || r['First Time Downloads'] || 0);
    const rd = Number(r['Redownloads'] || 0);
    const inst = Number(r['Installations'] || r['Installs'] || 0);
    const sess = Number(r['Sessions'] || 0);
    const ad = Number(r['Active Devices'] || 0);
    const cr = Number(r['Crashes'] || 0);

    downloads += isFinite(dl) ? dl : 0;
    firstTime += isFinite(ft) ? ft : 0;
    redownloads += isFinite(rd) ? rd : 0;
    installs += isFinite(inst) ? inst : 0;
    sessions += isFinite(sess) ? sess : 0;
    activeDevices += isFinite(ad) ? ad : 0;
    crashes += isFinite(cr) ? cr : 0;

    if (country) {
      const prev = byCountry.get(country) || { downloads: 0, sessions: 0 };
      prev.downloads += dl;
      prev.sessions += sess;
      byCountry.set(country, prev);
    }
  }

  const topCountries = Array.from(byCountry.entries())
    .map(([country, v]) => ({ country, ...v }))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 10);

  const crashFreeRate =
    sessions > 0 ? Math.max(0, Math.min(1, 1 - crashes / sessions)) : null;

  return {
    metric_date: targetDate,
    app_id: appId,
    region: 'WORLD',
    downloads,
    first_time_downloads: firstTime,
    redownloads,
    installs,
    sessions,
    active_devices: activeDevices,
    crashes,
    crash_free_rate: crashFreeRate,
    breakdown: { topCountries },
    snapshot_at: new Date().toISOString(),
  };
}

async function main() {
  const appId = process.env.ASC_APP_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetDate = process.env.TARGET_DATE || todayMinusDays(2);
  const category = process.env.ASC_REPORT_CATEGORY || 'APP_USAGE';

  if (!appId) throw new Error('ASC_APP_ID required (es. 6762273646)');
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env required');

  log(`Target date: ${targetDate}, app: ${appId}, category: ${category}`);

  const token = await generateAscToken();
  log('JWT generated');

  const requestId = await getOrCreateReportRequest(token, appId);
  const reports = await listReports(token, requestId, category);
  log(`Found ${reports.length} reports in category ${category}`);

  if (reports.length === 0) {
    log('No reports yet — Apple may still be preparing the snapshot. Retry tomorrow.');
    return;
  }

  // Aggrega segments da tutti i report della categoria
  const allRows = [];
  let segmentCount = 0;

  for (const report of reports) {
    const instances = await listInstances(token, report.id, targetDate);
    for (const inst of instances) {
      const segments = await listSegments(token, inst.id);
      for (const seg of segments) {
        const url = seg.attributes?.url;
        if (!url) continue;
        try {
          const { rows } = await downloadAndParseCsv(url);
          allRows.push(...rows);
          segmentCount += 1;
        } catch (err) {
          log(`segment download failed (${seg.id}):`, err.message);
        }
      }
    }
  }

  log(`Fetched ${segmentCount} segments, ${allRows.length} rows`);

  if (allRows.length === 0) {
    log(`No data for ${targetDate}. Apple may not have processed it yet (48h delay normal).`);
    return;
  }

  const aggregated = aggregate(allRows, targetDate, appId);
  log('Aggregated:', {
    downloads: aggregated.downloads,
    sessions: aggregated.sessions,
    activeDevices: aggregated.active_devices,
    crashes: aggregated.crashes,
    topCountries: aggregated.breakdown.topCountries.slice(0, 3),
  });

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase
    .from('apple_app_metrics')
    .upsert(aggregated, { onConflict: 'metric_date,app_id,region' });

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  log(`✅ Upserted apple_app_metrics for ${targetDate} / ${appId}`);
}

main().catch((err) => {
  console.error('[fetch-asc-metrics] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
