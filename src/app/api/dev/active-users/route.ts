import { NextResponse } from 'next/server';
import { loadActiveUsers, normalizeWindowMinutes } from '@/lib/metrics/activeTelemetry';
import { buildDeviceLabel, buildLocationPresentation } from '@/lib/telemetry/presentation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowMinutes = normalizeWindowMinutes(searchParams.get('windowMinutes'), 5);

  const users = await loadActiveUsers(windowMinutes);
  const items = users.map(item => {
    const device = buildDeviceLabel(item);
    const location = buildLocationPresentation(item);

    return {
      ...item,
      device_label: device.device_label,
      location_source: location.location_source,
      location_source_label: location.location_source_label,
      location_label: location.location_label,
      location_coordinates: location.location_coordinates,
    };
  });

  return NextResponse.json({
    windowMinutes,
    activeUsers: items.length,
    items,
  });
}
