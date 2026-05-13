#!/usr/bin/env node
/**
 * night-smm-brief.ts
 * ────────────────────────────────────────────────────────────────────
 * Mac daemon (launchd cron 03:00 locale). One-shot — non KeepAlive.
 *
 * Cosa fa ogni notte:
 *   1. Aggrega snapshots account + post insights ultimi 30gg
 *   2. Pattern detection rule-based (best_hours, top_hashtags, hooks, dow)
 *   3. Identifica post sotto-performance + diagnosi rule-based
 *   4. Genera brief markdown via Ollama gemma3:12b (1 call, unload subito)
 *   5. INSERT/UPSERT in smm_night_briefs (1 row per giorno)
 *
 * Vincoli RAM/CPU:
 *   - nice -n 19 (priorità minima)
 *   - Ollama KEEP_ALIVE=0 (unload dopo ogni chiamata)
 *   - 1 sola call LLM (no parallel)
 *   - Gira alle 03:00 quando altri daemon dormono
 *
 * Output:
 *   - Tabella smm_night_briefs (UI dashboard la mattina legge l'ultima row)
 *   - Log: ~/LAVIKA-SPORT/logs/night-smm-brief.log
 * ────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { ollamaGenerate, GEN_MODEL, safeJsonParse } from '../../src/lib/social/caption/ollamaClient';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = process.env.WORKER_ID || `mac-night-smm-brief`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(`[${new Date().toISOString()}] [${WORKER_ID}] ${msg}`, extra ? JSON.stringify(extra) : '');
const logErr = (msg: string, extra?: Record<string, unknown>) =>
  console.error(`[${new Date().toISOString()}] [${WORKER_ID}] ERROR ${msg}`, extra ? JSON.stringify(extra) : '');

/* ──────────────────────────────────────────────────────────────────
   Step 1: Aggregati metriche
   ────────────────────────────────────────────────────────────────── */

interface AccountSnapshot {
  platform: string;
  account_id: string;
  snapshot_date: string;
  followers_count: number | null;
  reach_28d: number | null;
  impressions_28d: number | null;
  profile_views_28d: number | null;
}

interface PostInsight {
  external_post_id: string;
  platform: string;
  published_at: string;
  media_type: string | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  video_views: number | null;
  engagement_rate: number | null;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  snapshot_at: string;
}

async function fetchAccountSnapshots(): Promise<AccountSnapshot[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data, error } = await supabase
    .from('social_account_snapshots')
    .select('platform, account_id, snapshot_date, followers_count, reach_28d, impressions_28d, profile_views_28d')
    .gte('snapshot_date', since.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true });
  if (error) throw new Error(`fetchAccountSnapshots: ${error.message}`);
  return (data as AccountSnapshot[]) || [];
}

async function fetchPostInsights(): Promise<PostInsight[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  // Prendiamo il SNAPSHOT PIÙ RECENTE per ogni post (ultimo refresh metriche).
  // Postgres: distinct on (external_post_id) order by external_post_id, snapshot_at desc
  const { data, error } = await supabase
    .from('social_post_insights')
    .select('external_post_id, platform, published_at, media_type, reach, likes, comments, shares, saves, video_views, engagement_rate, caption, permalink, thumbnail_url, snapshot_at')
    .gte('published_at', since.toISOString())
    .order('snapshot_at', { ascending: false });
  if (error) throw new Error(`fetchPostInsights: ${error.message}`);

  // Dedup per external_post_id, tenendo lo snapshot più recente
  const seen = new Set<string>();
  const latest: PostInsight[] = [];
  for (const row of (data as PostInsight[]) || []) {
    if (seen.has(row.external_post_id)) continue;
    seen.add(row.external_post_id);
    latest.push(row);
  }
  return latest;
}

/* ──────────────────────────────────────────────────────────────────
   Step 2: Pattern detection (rule-based, no LLM)
   ────────────────────────────────────────────────────────────────── */

interface Patterns {
  best_hours: Array<{ hour: number; avg_eng: number; n: number }>;
  best_dow: Array<{ dow: number; avg_eng: number; n: number }>;
  top_hashtags: Array<{ tag: string; total_eng: number; n: number }>;
  hook_styles: Array<{ style: string; avg_eng: number; n: number }>;
  account_eng_avg: number;
  posts_count_7d: number;
  posts_count_30d: number;
}

/** Stima quale "stile di hook" usa la caption (prime 60 char). */
function classifyHookStyle(caption: string | null): string {
  if (!caption) return 'no-caption';
  const head = caption.slice(0, 60).trim();
  if (/^[“”"'].+[“”"']/.test(head)) return 'quote';
  if (/\?/.test(head.slice(0, 40))) return 'question';
  if (/^\d/.test(head)) return 'number-led';
  if (/[A-ZÀ-Ý]{4,}/.test(head)) return 'shout';
  if (/[\u{1F300}-\u{1FAFF}]/u.test(head.slice(0, 4))) return 'emoji-led';
  return 'narrative';
}

function extractHashtags(caption: string | null): string[] {
  if (!caption) return [];
  return Array.from(caption.matchAll(/#([a-zA-Z0-9_àèéìòùÀÈÉÌÒÙ]+)/g)).map(m => m[1].toLowerCase());
}

function computePatterns(posts: PostInsight[]): Patterns {
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const last7 = posts.filter(p => new Date(p.published_at).getTime() >= sevenDaysAgo);

  // best_hours
  const hourMap = new Map<number, { sum: number; n: number }>();
  for (const p of posts) {
    if (p.engagement_rate == null) continue;
    const h = new Date(p.published_at).getHours();
    const acc = hourMap.get(h) || { sum: 0, n: 0 };
    acc.sum += p.engagement_rate;
    acc.n += 1;
    hourMap.set(h, acc);
  }
  const best_hours = [...hourMap.entries()]
    .map(([hour, { sum, n }]) => ({ hour, avg_eng: sum / n, n }))
    .filter(x => x.n >= 1)
    .sort((a, b) => b.avg_eng - a.avg_eng)
    .slice(0, 6);

  // best_dow (0=domenica, 1=lunedì, ..., 6=sabato)
  const dowMap = new Map<number, { sum: number; n: number }>();
  for (const p of posts) {
    if (p.engagement_rate == null) continue;
    const d = new Date(p.published_at).getDay();
    const acc = dowMap.get(d) || { sum: 0, n: 0 };
    acc.sum += p.engagement_rate;
    acc.n += 1;
    dowMap.set(d, acc);
  }
  const best_dow = [...dowMap.entries()]
    .map(([dow, { sum, n }]) => ({ dow, avg_eng: sum / n, n }))
    .sort((a, b) => b.avg_eng - a.avg_eng);

  // top_hashtags (ranked by total engagement contributed)
  const tagMap = new Map<string, { totalEng: number; n: number }>();
  for (const p of posts) {
    const tags = extractHashtags(p.caption);
    const eng = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0);
    for (const t of tags) {
      const acc = tagMap.get(t) || { totalEng: 0, n: 0 };
      acc.totalEng += eng;
      acc.n += 1;
      tagMap.set(t, acc);
    }
  }
  const top_hashtags = [...tagMap.entries()]
    .map(([tag, { totalEng, n }]) => ({ tag, total_eng: totalEng, n }))
    .sort((a, b) => b.total_eng - a.total_eng)
    .slice(0, 10);

  // hook_styles
  const hookMap = new Map<string, { sum: number; n: number }>();
  for (const p of posts) {
    if (p.engagement_rate == null) continue;
    const style = classifyHookStyle(p.caption);
    const acc = hookMap.get(style) || { sum: 0, n: 0 };
    acc.sum += p.engagement_rate;
    acc.n += 1;
    hookMap.set(style, acc);
  }
  const hook_styles = [...hookMap.entries()]
    .map(([style, { sum, n }]) => ({ style, avg_eng: sum / n, n }))
    .sort((a, b) => b.avg_eng - a.avg_eng);

  const engVals = posts.map(p => p.engagement_rate).filter((x): x is number => x != null);
  const account_eng_avg = engVals.length ? engVals.reduce((a, b) => a + b, 0) / engVals.length : 0;

  return {
    best_hours,
    best_dow,
    top_hashtags,
    hook_styles,
    account_eng_avg,
    posts_count_7d: last7.length,
    posts_count_30d: posts.length,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Step 3: Diagnosi rule-based per i bottom post
   ────────────────────────────────────────────────────────────────── */

interface PostDiagnosis {
  external_post_id: string;
  platform: string;
  permalink: string | null;
  thumbnail_url: string | null;
  caption_snippet: string;
  engagement_rate: number;
  account_avg: number;
  delta_pct: number;
  reasons: string[];
  suggested_fix: string;
}

function diagnoseBottomPosts(posts: PostInsight[], patterns: Patterns): PostDiagnosis[] {
  if (posts.length < 3) return [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = posts
    .filter(p => p.engagement_rate != null && new Date(p.published_at).getTime() >= sevenDaysAgo);
  if (recent.length === 0) return [];

  const bottom = [...recent].sort((a, b) => (a.engagement_rate ?? 0) - (b.engagement_rate ?? 0)).slice(0, 3);
  const goodHours = new Set(patterns.best_hours.slice(0, 4).map(h => h.hour));
  const topTags = new Set(patterns.top_hashtags.slice(0, 5).map(h => h.tag));

  return bottom.map(p => {
    const eng = p.engagement_rate ?? 0;
    const reasons: string[] = [];
    const hour = new Date(p.published_at).getHours();
    if (!goodHours.has(hour) && patterns.best_hours.length >= 3) {
      reasons.push(`Orario ${String(hour).padStart(2, '0')}:00 sotto-performante (top: ${patterns.best_hours.slice(0, 3).map(h => `${h.hour}h`).join(', ')})`);
    }
    const tags = extractHashtags(p.caption);
    if (tags.length === 0) {
      reasons.push('Nessun hashtag → discoverability bassa');
    } else if (!tags.some(t => topTags.has(t)) && topTags.size > 0) {
      reasons.push('Hashtag fuori dai pattern top dell\'account');
    }
    const captionLen = p.caption?.length ?? 0;
    if (captionLen < 30) reasons.push('Caption troppo corta (<30 char) → poco contesto');
    if (captionLen > 500) reasons.push('Caption troppo lunga (>500 char) → tronca preview');
    const hook = classifyHookStyle(p.caption);
    const topHook = patterns.hook_styles[0]?.style;
    if (topHook && hook !== topHook && patterns.hook_styles.length >= 2) {
      reasons.push(`Hook stile "${hook}" — top performer: "${topHook}"`);
    }

    if (reasons.length === 0) reasons.push('Pattern non identificato — possibile fattore di timing/tema esterno');

    const suggestion =
      reasons[0].startsWith('Orario') && patterns.best_hours[0]
        ? `Ri-pubblica contenuto simile ${String(patterns.best_hours[0].hour).padStart(2, '0')}:00, eng atteso ~${(patterns.best_hours[0].avg_eng * 100).toFixed(1)}%`
        : reasons[0].startsWith('Nessun hashtag')
          ? `Aggiungi 3-5 hashtag dal pool top: ${patterns.top_hashtags.slice(0, 5).map(h => `#${h.tag}`).join(' ')}`
          : reasons[0].startsWith('Hashtag fuori')
            ? `Sostituisci con tag dal pool top: ${patterns.top_hashtags.slice(0, 5).map(h => `#${h.tag}`).join(' ')}`
            : reasons[0].startsWith('Caption troppo')
              ? 'Riscrivi caption 80-200 char con hook punchy nella prima riga'
              : reasons[0].startsWith('Hook stile')
                ? `Sperimenta hook "${topHook}" (es. domanda, numero, citazione)`
                : 'Rivedi cover + prima riga caption — il post non aggancia';

    return {
      external_post_id: p.external_post_id,
      platform: p.platform,
      permalink: p.permalink,
      thumbnail_url: p.thumbnail_url,
      caption_snippet: (p.caption || '').slice(0, 120),
      engagement_rate: eng,
      account_avg: patterns.account_eng_avg,
      delta_pct: patterns.account_eng_avg > 0 ? ((eng - patterns.account_eng_avg) / patterns.account_eng_avg) * 100 : 0,
      reasons,
      suggested_fix: suggestion,
    };
  });
}

/* ──────────────────────────────────────────────────────────────────
   Step 4: Brief markdown via Ollama (1 call, unload immediato)
   ────────────────────────────────────────────────────────────────── */

interface Recommendation {
  priority: 'high' | 'med' | 'low';
  title: string;
  why: string;
  action: string;
}

interface BriefLLMOutput {
  brief_markdown: string;
  recommendations: Recommendation[];
}

/**
 * Schema piatto chiesto a Ollama. Ogni stringa è single-line (no \n
 * literal inside) per minimizzare i fallimenti JSON.parse tipici di
 * gemma3:12b in jsonMode con markdown annidato. Il daemon poi
 * compone il markdown finale unendo i pezzi.
 */
interface LLMFlatOutput {
  headline: string;             // 1 frase di sintesi (<140 char)
  works_well: string[];          // 2-3 bullet (cose che vanno bene)
  needs_attention: string[];     // 2-3 bullet (cose da rivedere)
  today_action: string;          // 1 frase azione per oggi
  recommendations: Recommendation[]; // 3-5 entries
}

/** Compone il markdown finale dai pezzi piatti dell'LLM + dati raw. */
function composeBriefMarkdown(args: {
  brief_date: string;
  mode: 'early' | 'active';
  metrics: Record<string, unknown>;
  patterns: Patterns;
  flat: LLMFlatOutput;
}): string {
  const { brief_date, mode, metrics, patterns, flat } = args;
  const ig = (metrics as { instagram?: { followers?: number | null; reach_28d?: number | null } }).instagram;
  const fb = (metrics as { facebook?: { followers?: number | null; impressions_28d?: number | null } }).facebook;

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return [
    `# Brief del ${brief_date}`,
    '',
    `_Modalità: **${mode}** · ${patterns.posts_count_30d} post 30gg · ${patterns.posts_count_7d} ultimi 7gg_`,
    '',
    `> ${flat.headline}`,
    '',
    '## Polso',
    ig ? `- **Instagram**: ${ig.followers ?? '—'} follower · reach 28gg ${ig.reach_28d ?? '—'}` : '- **Instagram**: dati non disponibili',
    fb ? `- **Facebook**: ${fb.followers ?? '—'} follower · impressions 28gg ${fb.impressions_28d ?? '—'}` : '- **Facebook**: dati non disponibili',
    `- **Engagement medio account**: ${(patterns.account_eng_avg * 100).toFixed(2)}%`,
    '',
    '## Cosa funziona',
    ...flat.works_well.map(w => `- ${w}`),
    '',
    '## Cosa rivedere',
    ...flat.needs_attention.map(n => `- ${n}`),
    '',
    '## Pattern emersi',
    patterns.best_hours.length > 0
      ? `- **Orari top**: ${patterns.best_hours.slice(0, 3).map(h => `${fmtHour(h.hour)} (eng ${(h.avg_eng * 100).toFixed(1)}%, n=${h.n})`).join(' · ')}`
      : '- Orari top: dati insufficienti',
    patterns.best_dow.length > 0
      ? `- **Giorni top**: ${patterns.best_dow.slice(0, 3).map(d => `${dayNames[d.dow]} (${(d.avg_eng * 100).toFixed(1)}%)`).join(' · ')}`
      : '- Giorni top: dati insufficienti',
    patterns.top_hashtags.length > 0
      ? `- **Hashtag top**: ${patterns.top_hashtags.slice(0, 5).map(h => `#${h.tag}`).join(' ')}`
      : '- Hashtag: nessuno tracciato',
    patterns.hook_styles.length > 0
      ? `- **Hook che funzionano**: ${patterns.hook_styles.slice(0, 2).map(h => `${h.style} (${(h.avg_eng * 100).toFixed(1)}%)`).join(' · ')}`
      : '',
    '',
    '## Stasera',
    flat.today_action,
  ].filter(Boolean).join('\n');
}

async function generateBriefViaLLM(args: {
  mode: 'early' | 'active';
  snapshots: AccountSnapshot[];
  posts: PostInsight[];
  patterns: Patterns;
  diagnoses: PostDiagnosis[];
}): Promise<BriefLLMOutput> {
  const { mode, snapshots, posts, patterns, diagnoses } = args;

  // Riassunto ultimi snapshot per platform
  const latestByPlatform: Record<string, AccountSnapshot | undefined> = {};
  for (const s of snapshots) {
    const cur = latestByPlatform[s.platform];
    if (!cur || s.snapshot_date > cur.snapshot_date) latestByPlatform[s.platform] = s;
  }

  const summary = {
    mode,
    instagram: latestByPlatform['instagram']
      ? {
          followers: latestByPlatform['instagram']!.followers_count,
          reach_28d: latestByPlatform['instagram']!.reach_28d,
          profile_views_28d: latestByPlatform['instagram']!.profile_views_28d,
        }
      : null,
    facebook: latestByPlatform['facebook']
      ? {
          followers: latestByPlatform['facebook']!.followers_count,
          impressions_28d: latestByPlatform['facebook']!.impressions_28d,
        }
      : null,
    posts_30d: patterns.posts_count_30d,
    posts_7d: patterns.posts_count_7d,
    account_eng_avg_pct: (patterns.account_eng_avg * 100).toFixed(2),
    top_3_hours: patterns.best_hours.slice(0, 3),
    top_3_dow: patterns.best_dow.slice(0, 3).map(d => ({
      day: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][d.dow],
      avg_eng_pct: (d.avg_eng * 100).toFixed(2),
      posts: d.n,
    })),
    top_5_hashtags: patterns.top_hashtags.slice(0, 5).map(h => `#${h.tag} (${h.n} post, eng cumulato ${h.total_eng})`),
    hook_styles_ranking: patterns.hook_styles.map(h => ({ style: h.style, avg_eng_pct: (h.avg_eng * 100).toFixed(2), n: h.n })),
    bottom_posts_diagnosed: diagnoses.length,
  };

  const system = `Sei lo SMM senior di LAVIKA Sport (app tifosi Catania FC, Serie C). Brand voice: caldo, tifoso, brevità sportiva, niente filler corporate. Output ITALIANO.

Riceverai i dati delle pagine IG/FB del brand. Devi generare un brief mattutino conciso che l'utente legge alle 09:00 col caffè. Tono: collega esperto, niente pep-talk, niente emoji decorative.

Modalità "early": dataset < 14gg, NON dare consigli operativi numerici — descrivi cosa stai raccogliendo e cosa promette di emergere.

Modalità "active": dataset ≥14gg, DAI consigli concreti (orari, hashtag, hook style) basati sui pattern forniti.

IMPORTANTE — formato output:
- Ogni stringa DEVE essere su una sola riga (no \\n letterali dentro le stringhe).
- Frasi corte e dirette. Niente paragrafi lunghi.
- NON inventare dati che non sono nel summary. Se mancano dati, dillo apertamente.

Output JSON ESATTAMENTE in questo formato:
{
  "headline": "Una frase di sintesi della giornata (max 140 caratteri)",
  "works_well": ["punto 1", "punto 2"],
  "needs_attention": ["punto 1", "punto 2"],
  "today_action": "Una sola frase: cosa fare oggi",
  "recommendations": [
    {"priority": "high", "title": "...", "why": "...", "action": "..."}
  ]
}

Ogni array ha 2-5 elementi. Ogni stringa < 200 caratteri. Total recommendations: 3-5.`;

  const prompt = `Dati pagine LAVIKA Sport:

${JSON.stringify(summary, null, 2)}

Post sotto-performance ultimi 7gg (rule-based diagnosis):
${diagnoses.length === 0 ? 'Nessuno o dati insufficienti.' : diagnoses.map((d, i) => `${i + 1}. ${d.platform} eng ${(d.engagement_rate * 100).toFixed(2)}% (vs media ${(d.account_avg * 100).toFixed(2)}%, ${d.delta_pct.toFixed(0)}%). Cause: ${d.reasons.join('; ')}. Fix: ${d.suggested_fix}`).join('\n')}

Genera SOLO il JSON, niente prefazione.`;

  const t0 = Date.now();
  const raw = await ollamaGenerate(prompt, {
    model: GEN_MODEL,
    system,
    jsonMode: true,
    temperature: 0.4,
    numPredict: 1200,
    timeoutMs: 240_000,
  });
  const duration = Date.now() - t0;

  // Parse tollerante via helper. Se ancora fallisce, sanitize i newline
  // letterali dentro le stringhe (bug LLM in jsonMode).
  let flat = safeJsonParse<LLMFlatOutput>(raw);
  if (!flat) {
    const sanitized = raw.replace(/("(?:[^"\\]|\\.)*?")|\n/g, (m, q) => q ? q : '\\n');
    flat = safeJsonParse<LLMFlatOutput>(sanitized);
  }

  // Validazione struttura
  const valid =
    flat &&
    typeof flat.headline === 'string' &&
    Array.isArray(flat.works_well) &&
    Array.isArray(flat.needs_attention) &&
    typeof flat.today_action === 'string' &&
    Array.isArray(flat.recommendations);

  if (!valid) {
    log('LLM output malformed, using fallback', { raw_preview: raw.slice(0, 200), duration });
    const fallbackHeadline = mode === 'early'
      ? `Dataset early: ${patterns.posts_count_30d} post 30gg, raccogliamo dati`
      : `${patterns.posts_count_7d} post pubblicati nella settimana, eng medio ${(patterns.account_eng_avg * 100).toFixed(2)}%`;
    const fallbackFlat: LLMFlatOutput = {
      headline: fallbackHeadline,
      works_well: [],
      needs_attention: [],
      today_action: mode === 'early'
        ? 'Continua a pubblicare regolarmente. Il sistema raccoglie dati per il primo confronto a 14gg.'
        : 'Apri la dashboard insights e rivedi i pattern grezzi per decidere il prossimo post.',
      recommendations: [],
    };
    const brief_markdown_fallback = composeBriefMarkdown({
      brief_date: new Date().toISOString().slice(0, 10),
      mode,
      metrics: summary as unknown as Record<string, unknown>,
      patterns,
      flat: fallbackFlat,
    });
    return { brief_markdown: brief_markdown_fallback, recommendations: [] };
  }

  // Compose markdown finale dai pezzi piatti
  const brief_markdown = composeBriefMarkdown({
    brief_date: new Date().toISOString().slice(0, 10),
    mode,
    metrics: summary as unknown as Record<string, unknown>,
    patterns,
    flat,
  });

  return {
    brief_markdown,
    recommendations: flat.recommendations.slice(0, 5),
  };
}

/* ──────────────────────────────────────────────────────────────────
   Step 5: Persist
   ────────────────────────────────────────────────────────────────── */

async function persistBrief(args: {
  brief_date: string;
  mode: 'early' | 'active';
  snapshots: AccountSnapshot[];
  posts: PostInsight[];
  patterns: Patterns;
  diagnoses: PostDiagnosis[];
  llm: BriefLLMOutput;
  llm_duration_ms: number;
}): Promise<void> {
  const { brief_date, mode, snapshots, posts, patterns, diagnoses, llm, llm_duration_ms } = args;

  const latestByPlatform: Record<string, AccountSnapshot | undefined> = {};
  for (const s of snapshots) {
    const cur = latestByPlatform[s.platform];
    if (!cur || s.snapshot_date > cur.snapshot_date) latestByPlatform[s.platform] = s;
  }

  const metrics = {
    instagram: latestByPlatform['instagram']
      ? {
          followers: latestByPlatform['instagram']!.followers_count,
          reach_28d: latestByPlatform['instagram']!.reach_28d,
          profile_views_28d: latestByPlatform['instagram']!.profile_views_28d,
        }
      : null,
    facebook: latestByPlatform['facebook']
      ? {
          followers: latestByPlatform['facebook']!.followers_count,
          impressions_28d: latestByPlatform['facebook']!.impressions_28d,
        }
      : null,
    posts_count_30d: patterns.posts_count_30d,
    posts_count_7d: patterns.posts_count_7d,
    account_eng_avg: patterns.account_eng_avg,
  };

  const { error } = await supabase
    .from('smm_night_briefs')
    .upsert({
      brief_date,
      mode,
      metrics,
      patterns: patterns as unknown as Record<string, unknown>,
      brief_markdown: llm.brief_markdown,
      recommendations: llm.recommendations as unknown as Record<string, unknown>[],
      post_diagnoses: diagnoses as unknown as Record<string, unknown>[],
      llm_model: GEN_MODEL,
      llm_duration_ms,
    }, { onConflict: 'brief_date' });

  if (error) throw new Error(`persistBrief upsert: ${error.message}`);
}

/* ──────────────────────────────────────────────────────────────────
   Main
   ────────────────────────────────────────────────────────────────── */

async function main() {
  log('start');

  // brief_date = ieri (analizziamo i dati del giorno appena chiuso)
  const briefDate = new Date();
  briefDate.setDate(briefDate.getDate() - 1);
  const brief_date = briefDate.toISOString().slice(0, 10);

  const [snapshots, posts] = await Promise.all([fetchAccountSnapshots(), fetchPostInsights()]);
  log('data fetched', { snapshots: snapshots.length, posts: posts.length });

  const patterns = computePatterns(posts);

  // Mode determination: early se < 14 giorni di snapshot o < 3 post
  const distinctDays = new Set(snapshots.map(s => s.snapshot_date)).size;
  const mode: 'early' | 'active' = (distinctDays >= 14 && patterns.posts_count_30d >= 3) ? 'active' : 'early';

  log('mode', { mode, distinctDays, posts_30d: patterns.posts_count_30d });

  const diagnoses = mode === 'active' ? diagnoseBottomPosts(posts, patterns) : [];

  log('calling LLM gemma3:12b', { post_diagnoses: diagnoses.length });
  const t0 = Date.now();
  let llm: BriefLLMOutput;
  let llmError: string | null = null;
  try {
    llm = await generateBriefViaLLM({ mode, snapshots, posts, patterns, diagnoses });
  } catch (e) {
    llmError = (e as Error).message;
    logErr('LLM failed', { err: llmError });
    llm = {
      brief_markdown: `# Brief del ${brief_date}\n\n_Generazione AI fallita: ${llmError}. Pattern grezzi disponibili._`,
      recommendations: [],
    };
  }
  const llm_duration_ms = Date.now() - t0;
  log('LLM done', { ms: llm_duration_ms });

  await persistBrief({ brief_date, mode, snapshots, posts, patterns, diagnoses, llm, llm_duration_ms });
  log('persisted', { brief_date, recommendations: llm.recommendations.length });

  if (llmError) {
    await supabase
      .from('smm_night_briefs')
      .update({ llm_error: llmError })
      .eq('brief_date', brief_date);
  }

  log('done');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    logErr('fatal', { err: (err as Error).message, stack: (err as Error).stack });
    process.exit(1);
  });
