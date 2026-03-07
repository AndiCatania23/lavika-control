import { NextResponse } from 'next/server';
import { loadTopViewedPages } from '@/lib/metrics/pageViews';

function normalizeLimit(value: string | null, fallback = 5): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = normalizeLimit(searchParams.get('limit'), 5);
  const items = await loadTopViewedPages(limit);

  return NextResponse.json({
    limit,
    items,
  });
}
