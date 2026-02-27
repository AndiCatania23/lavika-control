interface ReverseGeoAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country_code?: string;
}

interface ReverseGeoPayload {
  address?: ReverseGeoAddress;
}

export interface ReverseGeoResult {
  city_name: string | null;
  region_name: string | null;
  country_code: string | null;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { value: ReverseGeoResult | null; cachedAt: number }>();
const inFlight = new Map<string, Promise<ReverseGeoResult | null>>();

function normalizeText(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

export async function reverseGeocodeCoordinates(latitude: number, longitude: number): Promise<ReverseGeoResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const key = getCacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt <= CACHE_TTL_MS) {
    return cached.value;
  }

  const existingRequest = inFlight.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('lon', String(longitude));
      url.searchParams.set('zoom', '12');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'it,en');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'lavika-control/1.0',
        },
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json() as ReverseGeoPayload;
      const address = payload.address;
      if (!address) return null;

      const cityName =
        normalizeText(address.city) ??
        normalizeText(address.town) ??
        normalizeText(address.village) ??
        normalizeText(address.municipality) ??
        normalizeText(address.county);

      const regionName = normalizeText(address.state) ?? normalizeText(address.region);
      const countryCode = normalizeText(address.country_code)?.toUpperCase() ?? null;

      const result: ReverseGeoResult = {
        city_name: cityName,
        region_name: regionName,
        country_code: countryCode,
      };

      return result;
    } catch {
      return null;
    }
  })();

  inFlight.set(key, request);

  const result = await request;
  cache.set(key, { value: result, cachedAt: Date.now() });
  inFlight.delete(key);

  return result;
}
