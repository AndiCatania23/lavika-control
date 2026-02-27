import { NextResponse } from 'next/server';
import { loadActiveUsers, normalizeWindowMinutes } from '@/lib/metrics/activeTelemetry';

function normalized(value: string | null): string {
  return value && value.trim().length > 0 ? value.trim() : 'unknown';
}

function toSortedBuckets(map: Map<string, number>, total: number) {
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

  const countries = new Map<string, number>();
  const regions = new Map<string, number>();
  const cities = new Map<string, number>();
  const timezones = new Map<string, number>();

  for (const item of users) {
    const country = normalized(item.country_code);
    const region = normalized(item.region_name);
    const city = normalized(item.city_name);
    const timezone = normalized(item.timezone);

    countries.set(country, (countries.get(country) ?? 0) + 1);
    regions.set(`${country}__${region}`, (regions.get(`${country}__${region}`) ?? 0) + 1);
    cities.set(`${country}__${region}__${city}`, (cities.get(`${country}__${region}__${city}`) ?? 0) + 1);
    timezones.set(timezone, (timezones.get(timezone) ?? 0) + 1);
  }

  return NextResponse.json({
    windowMinutes,
    activeUsers: total,
    countries: toSortedBuckets(countries, total).map(row => ({
      country_code: row.key,
      count: row.count,
      share: row.share,
    })),
    regions: toSortedBuckets(regions, total).map(row => {
      const [country_code, region_name] = row.key.split('__');
      return {
        country_code,
        region_name,
        count: row.count,
        share: row.share,
      };
    }),
    cities: toSortedBuckets(cities, total).map(row => {
      const [country_code, region_name, city_name] = row.key.split('__');
      return {
        country_code,
        region_name,
        city_name,
        estimated: true,
        count: row.count,
        share: row.share,
      };
    }),
    timezones: toSortedBuckets(timezones, total).map(row => ({
      timezone: row.key,
      count: row.count,
      share: row.share,
    })),
  });
}
