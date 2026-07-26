/**
 * format-sync-watchdog
 *
 * Edge Function chiamata da pg_cron. Legge solo lo stato operativo del sync
 * format video e manda Telegram quando trova ritardi reali.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_ADMIN_CHAT_ID
 *   FORMAT_SYNC_WATCHDOG_SECRET (opzionale ma consigliato per pg_cron)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase hosted)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CARD_DELAY_MINUTES = 30;
const PENDING_DELAY_MINUTES = 15;
const RUNNING_DELAY_HOURS = 4;
const HEARTBEAT_DELAY_MINUTES = 10;
const CARD_WINDOW_HOURS = 36;
const ALERT_DEBOUNCE_MINUTES = 30;

type Severity = "SEV1" | "SEV2";

interface Alert {
  severity: Severity;
  title: string;
  lines: string[];
}

const env = (key: string, required = true): string => {
  const value = Deno.env.get(key);
  if (!value && required) throw new Error(`Missing env: ${key}`);
  return value ?? "";
};

const supabase = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const ageLabel = (iso: string) => {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const totalMin = Math.round(diffMs / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

async function readyPublishedCards(): Promise<Alert | null> {
  const sb = supabase();
  const now = Date.now();
  const { data: cards, error: cardsErr } = await sb
    .from("home_schedule_cards")
    .select("id, format_id, label, start_at, duration_minutes")
    .eq("status", "published")
    .eq("is_active", true)
    .gte("start_at", hoursAgo(CARD_WINDOW_HOURS))
    .lte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true });

  if (cardsErr) throw new Error(`home_schedule_cards: ${cardsErr.message}`);
  if (!cards || cards.length === 0) return null;

  const formatIds = [...new Set(cards.map((card) => card.format_id).filter(Boolean))];
  const { data: formats, error: formatsErr } = await sb
    .from("content_formats")
    .select("id, title, sync_trigger_offset_minutes")
    .in("id", formatIds);
  if (formatsErr) throw new Error(`content_formats: ${formatsErr.message}`);

  const formatById = new Map((formats ?? []).map((format) => [format.id, format]));
  const delayed = cards.flatMap((card) => {
    const format = formatById.get(card.format_id);
    const duration = card.duration_minutes ?? 60;
    const offset = format?.sync_trigger_offset_minutes ?? 15;
    const readyAt = new Date(card.start_at).getTime() + (duration + offset) * 60 * 1000;
    const delayedByMin = Math.floor((now - readyAt) / 60000);
    if (delayedByMin < CARD_DELAY_MINUTES) return [];
    return [{
      format: format?.title ?? card.format_id,
      startAt: card.start_at,
      readyAt: new Date(readyAt).toISOString(),
      delayedByMin,
    }];
  });

  if (delayed.length === 0) return null;
  return {
    severity: "SEV1",
    title: `${delayed.length} card ready ancora published`,
    lines: delayed.slice(0, 8).map((item) =>
      `- ${item.format}: start ${fmtTime(item.startAt)}, ready da ${ageLabel(item.readyAt)}`),
  };
}

async function stalePendingJobs(): Promise<Alert | null> {
  const { data, error } = await supabase()
    .from("job_queue")
    .select("id, source, triggered_by, created_at")
    .eq("status", "pending")
    .lt("created_at", minutesAgo(PENDING_DELAY_MINUTES))
    .order("created_at", { ascending: true })
    .limit(8);

  if (error) throw new Error(`job_queue pending: ${error.message}`);
  if (!data || data.length === 0) return null;
  return {
    severity: "SEV2",
    title: `${data.length} job pending da oltre ${PENDING_DELAY_MINUTES}m`,
    lines: data.map((job) =>
      `- ${job.source ?? "all"} (${job.triggered_by ?? "unknown"}), pending da ${ageLabel(job.created_at)}`),
  };
}

async function staleRunningJobs(): Promise<Alert | null> {
  const { data, error } = await supabase()
    .from("job_queue")
    .select("id, source, triggered_by, started_at")
    .eq("status", "running")
    .lt("started_at", hoursAgo(RUNNING_DELAY_HOURS))
    .order("started_at", { ascending: true })
    .limit(8);

  if (error) throw new Error(`job_queue running: ${error.message}`);
  if (!data || data.length === 0) return null;
  return {
    severity: "SEV2",
    title: `${data.length} job running da oltre ${RUNNING_DELAY_HOURS}h`,
    lines: data.map((job) =>
      `- ${job.source ?? "all"} (${job.triggered_by ?? "unknown"}), running da ${ageLabel(job.started_at)}`),
  };
}

async function staleDaemonHeartbeat(): Promise<Alert | null> {
  const { data, error } = await supabase()
    .from("daemon_heartbeat")
    .select("name, last_seen_at, hostname, pid")
    .eq("name", "job-daemon")
    .maybeSingle();

  if (error) throw new Error(`daemon_heartbeat: ${error.message}`);
  if (!data?.last_seen_at) {
    return {
      severity: "SEV1",
      title: "job-daemon senza heartbeat",
      lines: ["- Nessuna riga daemon_heartbeat per job-daemon"],
    };
  }

  const stale = new Date(data.last_seen_at).getTime() < Date.now() - HEARTBEAT_DELAY_MINUTES * 60 * 1000;
  if (!stale) return null;
  return {
    severity: "SEV1",
    title: `job-daemon heartbeat stale da ${ageLabel(data.last_seen_at)}`,
    lines: [`- host ${data.hostname ?? "unknown"}, pid ${data.pid ?? "unknown"}, last_seen ${fmtTime(data.last_seen_at)}`],
  };
}

async function shouldSend(fingerprint: string) {
  const sb = supabase();
  const key = "format_sync_watchdog_last_alert";
  const { data } = await sb
    .from("sync_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const previous = data?.value as { fingerprint?: string; sent_at?: string } | null;
  if (previous?.fingerprint === fingerprint && previous.sent_at) {
    const sentAt = new Date(previous.sent_at).getTime();
    if (Date.now() - sentAt < ALERT_DEBOUNCE_MINUTES * 60 * 1000) return false;
  }

  await sb.from("sync_config").upsert({
    key,
    value: { fingerprint, sent_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  return true;
}

async function sendTelegram(text: string) {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chatId = env("TELEGRAM_ADMIN_CHAT_ID");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram ${response.status}: ${body.slice(0, 200)}`);
  }
}

function render(alerts: Alert[]) {
  const topSeverity: Severity = alerts.some((alert) => alert.severity === "SEV1") ? "SEV1" : "SEV2";
  const lines = [
    `[${topSeverity}] LAVIKA format sync watchdog`,
    "",
    ...alerts.flatMap((alert) => [
      `${alert.severity} - ${alert.title}`,
      ...alert.lines,
      "",
    ]),
  ];
  return lines.join("\n").trim();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const sharedSecret = Deno.env.get("FORMAT_SYNC_WATCHDOG_SECRET") ?? "";
  if (sharedSecret && req.headers.get("x-watchdog-secret") !== sharedSecret) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const alerts = (await Promise.all([
    readyPublishedCards(),
    staleDaemonHeartbeat(),
    stalePendingJobs(),
    staleRunningJobs(),
  ])).filter((alert): alert is Alert => Boolean(alert));

  if (alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, alerts: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const fingerprint = JSON.stringify(alerts.map((alert) => [alert.severity, alert.title, alert.lines]));
  const sent = await shouldSend(fingerprint);
  if (sent) await sendTelegram(render(alerts));

  return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
