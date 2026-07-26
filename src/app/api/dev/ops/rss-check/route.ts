import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

type FeedRow = {
  id: string;
  slug: string;
  display_name: string;
  feed_url: string;
  enabled: boolean;
  priority: number;
};

type FeedCheck = FeedRow & {
  state: 'ok' | 'warn' | 'error';
  httpStatus: number | null;
  elapsedMs: number | null;
  message: string;
};

async function checkFeed(feed: FeedRow): Promise<FeedCheck> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(feed.feed_url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml, */*',
        'user-agent': 'LAVIKA-Control/ops-rss-check',
      },
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - started;
    await response.body?.cancel().catch(() => undefined);

    if (response.ok) {
      return {
        ...feed,
        state: 'ok',
        httpStatus: response.status,
        elapsedMs,
        message: `HTTP ${response.status}`,
      };
    }

    return {
      ...feed,
      state: response.status === 404 ? 'error' : 'warn',
      httpStatus: response.status,
      elapsedMs,
      message: `HTTP ${response.status}`,
    };
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Timeout dopo 8s'
      : error instanceof Error
        ? error.message
        : 'Fetch fallita';

    return {
      ...feed,
      state: 'error',
      httpStatus: null,
      elapsedMs,
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured', feeds: [] }, { status: 500 });
  }

  const { data, error } = await supabaseServer
    .from('rss_feeds')
    .select('id, slug, display_name, feed_url, enabled, priority')
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, feeds: [] }, { status: 500 });
  }

  const feeds = (data ?? []) as FeedRow[];
  const checked = await Promise.all(feeds.map(checkFeed));
  const summary = {
    total: checked.length,
    ok: checked.filter((feed) => feed.state === 'ok').length,
    warn: checked.filter((feed) => feed.state === 'warn').length,
    error: checked.filter((feed) => feed.state === 'error').length,
  };

  return NextResponse.json({
    ok: summary.error === 0,
    generatedAt: new Date().toISOString(),
    summary,
    feeds: checked,
  });
}
