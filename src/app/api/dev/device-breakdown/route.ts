import { NextResponse } from 'next/server';
import { loadActiveUsers, normalizeWindowMinutes } from '@/lib/metrics/activeTelemetry';

interface BucketRow {
  key: string;
  count: number;
  share: number;
}

function groupBy(rows: string[], total: number): BucketRow[] {
  const map = new Map<string, number>();

  for (const value of rows) {
    const key = value || 'unknown';
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([key, count]) => ({
      key,
      count,
      share: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowMinutes = normalizeWindowMinutes(searchParams.get('windowMinutes'), 5);
  const users = await loadActiveUsers(windowMinutes);
  const total = users.length;

  return NextResponse.json({
    windowMinutes,
    activeUsers: total,
    deviceTypes: groupBy(users.map(item => item.device_type ?? 'unknown'), total),
    osNames: groupBy(users.map(item => item.os_name ?? 'unknown'), total),
    browserNames: groupBy(users.map(item => item.browser_name ?? 'unknown'), total),
  });
}
