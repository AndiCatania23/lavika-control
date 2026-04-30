/**
 * POST /api/console/sources/validate-channel
 * Body: { platform: 'youtube'|'facebook', channel: string }
 *
 * Risposta:
 *   { ok: true, status: 'reachable', detail: { http_status, content_type? } }
 *   { ok: false, status: 'unreachable'|'invalid_url'|'pattern_mismatch', error }
 *
 * Lightweight HEAD request — non scarica nulla, valida solo che l'URL del
 * canale sia raggiungibile prima del save format. Usato dal wizard FASE 4.
 *
 * NOTA: per Facebook spesso HEAD ritorna 200 con login wall HTML — la
 * "raggiungibilità" non garantisce che il discover-fb-puppeteer riuscirà
 * a scrapare. È una check di base.
 */
import { NextResponse } from 'next/server';

const YT_RE = /^https?:\/\/(www\.)?youtube\.com\/(playlist\?list=|@|channel\/|c\/|user\/)/i;
const FB_RE = /^(https?:\/\/(www\.)?facebook\.com\/|file:)/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { platform?: string; channel?: string } | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Payload non valido' }, { status: 400 });

  const { platform, channel } = body;
  if (!platform || !channel) {
    return NextResponse.json({ ok: false, error: 'platform e channel obbligatori' }, { status: 400 });
  }

  // Pattern match
  if (platform === 'youtube' && !YT_RE.test(channel)) {
    return NextResponse.json({ ok: false, status: 'pattern_mismatch', error: 'URL YouTube non riconosciuto' }, { status: 400 });
  }
  if (platform === 'facebook' && !FB_RE.test(channel)) {
    return NextResponse.json({ ok: false, status: 'pattern_mismatch', error: 'URL Facebook non riconosciuto' }, { status: 400 });
  }
  if (platform === 'manual') {
    return NextResponse.json({ ok: true, status: 'reachable', detail: { note: 'manual platform — no URL check needed' } });
  }

  // Per file: source (FB legacy) skip HTTP check
  if (channel.startsWith('file:')) {
    return NextResponse.json({ ok: true, status: 'reachable', detail: { note: 'file source — skip HTTP probe' } });
  }

  // HEAD request con timeout 5s
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(channel, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'LAVIKA-Control/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        status: 'unreachable',
        error: `HTTP ${res.status} ${res.statusText}`,
        detail: { http_status: res.status },
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      status: 'reachable',
      detail: {
        http_status: res.status,
        content_type: res.headers.get('content-type'),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({
      ok: false,
      status: 'unreachable',
      error: msg.includes('aborted') ? 'timeout (>5s)' : msg,
    }, { status: 400 });
  }
}
