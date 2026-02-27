interface DeviceLabelInput {
  device_type?: string | null;
  os_name?: string | null;
  browser_name?: string | null;
  platform?: string | null;
}

interface LocationInput {
  location_source?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city_name?: string | null;
  region_name?: string | null;
  country_code?: string | null;
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTitleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeOsName(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'ios') return 'iOS';
  if (v === 'ipados' || v === 'ipad os') return 'iPadOS';
  if (v === 'macos' || v === 'mac os' || v === 'os x') return 'macOS';
  if (v === 'windows') return 'Windows';
  if (v === 'android') return 'Android';
  if (v === 'linux') return 'Linux';
  return toTitleCase(raw);
}

function normalizeBrowserName(raw: string | null): string {
  if (!raw) return 'Unknown browser';
  const v = raw.toLowerCase();
  if (v.includes('safari')) return 'Safari';
  if (v.includes('chrome')) return 'Chrome';
  if (v.includes('firefox')) return 'Firefox';
  if (v.includes('edge')) return 'Edge';
  return toTitleCase(raw);
}

function normalizeDeviceType(raw: string | null): 'mobile' | 'tablet' | 'desktop' | 'tv' | 'bot' | 'unknown' {
  if (!raw) return 'unknown';
  const v = raw.toLowerCase();
  if (v.includes('mobile') || v === 'phone') return 'mobile';
  if (v.includes('tablet') || v.includes('ipad')) return 'tablet';
  if (v.includes('desktop') || v.includes('laptop')) return 'desktop';
  if (v.includes('tv')) return 'tv';
  if (v.includes('bot') || v.includes('crawler') || v.includes('spider')) return 'bot';
  return 'unknown';
}

function normalizePlatformLabel(rawPlatform: string | null, deviceType: ReturnType<typeof normalizeDeviceType>): string {
  const platform = rawPlatform?.toLowerCase() ?? '';
  const isWeb = platform.length === 0 || platform.includes('web') || platform.includes('browser');

  if (isWeb) {
    if (deviceType === 'mobile') return 'Mobile Web';
    if (deviceType === 'tablet') return 'Tablet Web';
    return 'Desktop Web';
  }

  if (platform.includes('ios')) return 'iOS App';
  if (platform.includes('android')) return 'Android App';
  return toTitleCase(rawPlatform ?? 'Unknown platform');
}

function computePrimaryDeviceLabel(osName: string | null, deviceType: ReturnType<typeof normalizeDeviceType>): string {
  if (osName === 'iOS' && deviceType === 'mobile') return 'iPhone';
  if ((osName === 'iOS' || osName === 'iPadOS') && deviceType === 'tablet') return 'iPad';
  if (osName) return osName;
  if (deviceType === 'mobile') return 'Mobile';
  if (deviceType === 'tablet') return 'Tablet';
  if (deviceType === 'desktop') return 'Desktop';
  return 'Unknown device';
}

export function buildDeviceLabel(input: DeviceLabelInput): {
  device_label: string;
  browser_label: string;
  platform_label: string;
  os_label: string | null;
} {
  const osLabel = normalizeOsName(text(input.os_name));
  const browserLabel = normalizeBrowserName(text(input.browser_name));
  const deviceType = normalizeDeviceType(text(input.device_type));
  const platformLabel = normalizePlatformLabel(text(input.platform), deviceType);
  const primaryDevice = computePrimaryDeviceLabel(osLabel, deviceType);

  return {
    device_label: `${primaryDevice} · ${browserLabel} · ${platformLabel}`,
    browser_label: browserLabel,
    platform_label: platformLabel,
    os_label: osLabel,
  };
}

function normalizeLocationSource(raw: string | null): 'gps' | 'ip' | 'unknown' {
  if (!raw) return 'unknown';
  const value = raw.trim().toLowerCase();
  if (
    value === 'gps' ||
    value === 'device_gps' ||
    value === 'browser_gps' ||
    value === 'geolocation' ||
    value === 'html5_geolocation'
  ) return 'gps';
  if (value === 'ip' || value === 'geoip') return 'ip';
  return 'unknown';
}

function normalizeCountryCode(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  return value.toUpperCase();
}

function formatApproxCoordinate(value: number): string {
  return value.toFixed(2);
}

function normalizeRegionName(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (/^\d+$/.test(value)) return null;
  return value;
}

export function buildLocationPresentation(input: LocationInput): {
  location_source: 'gps' | 'ip' | 'unknown';
  location_source_label: 'GPS' | 'IP' | 'Unknown';
  location_label: string;
  location_coordinates: string | null;
} {
  const source = normalizeLocationSource(text(input.location_source));
  const latitude = Number.isFinite(input.latitude) ? Number(input.latitude) : null;
  const longitude = Number.isFinite(input.longitude) ? Number(input.longitude) : null;
  const hasCoordinates = latitude !== null && longitude !== null;

  const locationFallback = [text(input.city_name), normalizeRegionName(text(input.region_name)), normalizeCountryCode(text(input.country_code))]
    .filter(Boolean)
    .join(', ') || 'Unknown';

  const coordinates = hasCoordinates
    ? `${formatApproxCoordinate(latitude)}, ${formatApproxCoordinate(longitude)}`
    : null;

  if (source === 'gps') {
    const label =
      locationFallback !== 'Unknown'
        ? coordinates
          ? `${locationFallback} · ${coordinates} (approx)`
          : locationFallback
        : coordinates
        ? `${coordinates} (approx)`
        : 'Unknown';

    return {
      location_source: source,
      location_source_label: 'GPS',
      location_label: label,
      location_coordinates: coordinates,
    };
  }

  if (source === 'ip') {
    return {
      location_source: source,
      location_source_label: 'IP',
      location_label: locationFallback,
      location_coordinates: coordinates,
    };
  }

  return {
    location_source: 'unknown',
    location_source_label: 'Unknown',
    location_label: hasCoordinates ? `${coordinates} (approx)` : locationFallback,
    location_coordinates: coordinates,
  };
}
