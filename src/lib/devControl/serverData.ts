import type { User as AuthUser } from '@supabase/supabase-js';
import type { User } from '@/mocks/users';
import type { Session } from '@/mocks/sessions';
import type { ErrorLog } from '@/mocks/errors';
import { buildDeviceLabel, buildLocationPresentation } from '@/lib/telemetry/presentation';

interface FeedRow {
  id: string;
  feed_key: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface UserProfileOverride {
  displayName?: string;
  avatarUrl?: string;
}

export interface UserSessionAggregate {
  sessionsCount: number;
  lastSeenAt?: string;
}

interface UserSessionTelemetryRow {
  id: string;
  user_id: string;
  first_seen_at: string;
  last_seen_at: string;
  platform: string | null;
  device_type: string | null;
  os_name: string | null;
  browser_name: string | null;
  location_source: string | null;
  latitude: number | null;
  longitude: number | null;
  country_code: string | null;
  region_name: string | null;
  city_name: string | null;
  ip_hash: string | null;
}

function createInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'NA';
}

function getDisplayName(user: AuthUser, profile?: UserProfileOverride): string {
  if (profile?.displayName && profile.displayName.trim().length > 0) {
    return profile.displayName.trim();
  }

  const userMeta = user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const candidates = [
    userMeta?.display_name,
    userMeta?.full_name,
    userMeta?.name,
    appMeta?.display_name,
    appMeta?.full_name,
    appMeta?.name,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  if (user.email) {
    return user.email.split('@')[0];
  }

  return 'Utente';
}

function getAvatarUrl(user: AuthUser, profile?: UserProfileOverride): string | undefined {
  if (profile?.avatarUrl && profile.avatarUrl.trim().length > 0) {
    return profile.avatarUrl;
  }

  const userMeta = user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const candidates = [
    userMeta?.avatarUrl,
    userMeta?.avatar_url,
    userMeta?.picture,
    appMeta?.avatarUrl,
    appMeta?.avatar_url,
    appMeta?.picture,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function inferUserStatus(user: AuthUser, lastSeenAt?: string): User['status'] {
  if (user.banned_until) {
    const bannedUntil = new Date(user.banned_until).getTime();
    if (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) {
      return 'suspended';
    }
  }

  const reference = lastSeenAt ?? user.last_sign_in_at;

  if (!reference) {
    return 'inactive';
  }

  const daysFromLastLogin = (Date.now() - new Date(reference).getTime()) / (1000 * 60 * 60 * 24);
  if (daysFromLastLogin > 45) {
    return 'inactive';
  }

  return 'active';
}

function inferBadge(user: AuthUser): User['badge'] {
  const userMeta = user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const rawPlan = userMeta?.plan ?? userMeta?.tier ?? appMeta?.plan ?? appMeta?.tier;

  if (typeof rawPlan === 'string') {
    const normalized = rawPlan.toLowerCase();
    if (normalized.includes('gold') || normalized.includes('pro') || normalized.includes('premium')) return 'gold';
    if (normalized.includes('silver') || normalized.includes('plus')) return 'silver';
  }

  if (!user.created_at) return 'bronze';
  const accountAgeDays = (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (accountAgeDays > 365) return 'gold';
  if (accountAgeDays > 120) return 'silver';
  return 'bronze';
}

function inferRevenue(user: AuthUser): number {
  const userMeta = user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const candidates = [userMeta?.revenue, userMeta?.ltv, appMeta?.revenue, appMeta?.ltv];

  for (const value of candidates) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function inferSessionsCount(user: AuthUser): number {
  const userMeta = user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const raw = userMeta?.sessions_count ?? appMeta?.sessions_count;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function mapAuthUserToDevUser(user: AuthUser, profile?: UserProfileOverride, sessionAggregate?: UserSessionAggregate): User {
  const name = getDisplayName(user, profile);
  const avatarUrl = getAvatarUrl(user, profile);
  const lastLogin = sessionAggregate?.lastSeenAt ?? user.last_sign_in_at ?? user.created_at;

  return {
    id: user.id,
    email: user.email ?? '-',
    name,
    avatar: createInitials(name),
    avatarUrl,
    badge: inferBadge(user),
    status: inferUserStatus(user, sessionAggregate?.lastSeenAt),
    createdAt: user.created_at,
    lastLogin,
    sessionsCount: sessionAggregate?.sessionsCount ?? inferSessionsCount(user),
    revenue: inferRevenue(user),
  };
}

function trim(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function mapUserSessionTelemetryToSession(
  row: UserSessionTelemetryRow,
  userName: string,
  userEmail: string
): Session {
  const firstSeenMs = new Date(row.first_seen_at).getTime();
  const lastSeenMs = new Date(row.last_seen_at).getTime();
  const durationSeconds =
    Number.isFinite(firstSeenMs) && Number.isFinite(lastSeenMs) && lastSeenMs >= firstSeenMs
      ? Math.round((lastSeenMs - firstSeenMs) / 1000)
      : 0;

  const device = buildDeviceLabel(row);
  const locationPresentation = buildLocationPresentation(row);
  const browser = device.browser_label;
  const ip = trim(row.ip_hash) ? `hash:${String(row.ip_hash).slice(0, 8)}` : 'n/a';
  const location = locationPresentation.location_label;

  const status: Session['status'] = Date.now() - lastSeenMs <= 30 * 60 * 1000 ? 'active' : 'expired';

  return {
    id: row.id,
    userId: row.user_id,
    userName,
    userEmail,
    device: device.device_label,
    browser,
    ip,
    location,
    locationSource: locationPresentation.location_source,
    locationSourceLabel: locationPresentation.location_source_label,
    locationCoordinates: locationPresentation.location_coordinates,
    deviceLabel: device.device_label,
    platform: trim(row.platform) ?? null,
    deviceType: trim(row.device_type) ?? null,
    osName: trim(row.os_name) ?? null,
    browserName: trim(row.browser_name) ?? null,
    createdAt: row.last_seen_at,
    duration: Math.max(0, durationSeconds),
    status,
  };
}

export function mapAuthUserToSession(user: AuthUser): Session | null {
  if (!user.last_sign_in_at) return null;

  const userMeta = user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const name = getDisplayName(user);

  const device = typeof userMeta?.last_device === 'string' ? userMeta.last_device : 'Unknown device';
  const browser = typeof userMeta?.last_browser === 'string' ? userMeta.last_browser : 'Unknown browser';
  const ip = typeof userMeta?.last_ip === 'string' ? userMeta.last_ip : 'n/a';
  const location = typeof userMeta?.last_location === 'string' ? userMeta.last_location : 'Unknown';
  const rawDuration = userMeta?.last_session_duration ?? appMeta?.last_session_duration;
  const durationNum = typeof rawDuration === 'number' ? rawDuration : Number(rawDuration);
  const duration = Number.isFinite(durationNum) && durationNum >= 0 ? durationNum : 0;

  const sessionStatus: Session['status'] = inferUserStatus(user) === 'active' ? 'active' : 'expired';

  return {
    id: `ses_${user.id.slice(0, 12)}`,
    userId: user.id,
    userName: name,
    userEmail: user.email ?? '-',
    device,
    browser,
    ip,
    location,
    createdAt: user.last_sign_in_at,
    duration,
    status: sessionStatus,
  };
}

function inferSeverityFromFeed(item: FeedRow): ErrorLog['severity'] | null {
  const metadata = item.metadata ?? {};
  const rawSeverity = metadata.severity ?? metadata.level ?? metadata.status ?? metadata.conclusion;

  if (typeof rawSeverity === 'string') {
    const normalized = rawSeverity.toLowerCase();
    if (normalized.includes('critical') || normalized.includes('fatal')) return 'critical';
    if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('failure') || normalized.includes('cancelled')) return 'error';
    if (normalized.includes('warn')) return 'warning';
  }

  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
  if (text.includes('critical') || text.includes('panic')) return 'critical';
  if (text.includes('fallito') || text.includes('errore') || text.includes('failed') || text.includes('error')) return 'error';
  if (text.includes('warning') || text.includes('warn')) return 'warning';

  return null;
}

export function mapFeedItemToError(item: FeedRow): ErrorLog | null {
  const severity = inferSeverityFromFeed(item);
  if (!severity) return null;

  const metadata = item.metadata ?? {};
  const stack = typeof metadata.stack === 'string' ? metadata.stack : undefined;
  const runId = metadata.runId;
  const jobRunId = typeof runId === 'string' ? runId : undefined;

  return {
    id: item.id,
    severity,
    source: item.feed_key,
    message: item.description || item.title,
    stack,
    metadata,
    timestamp: item.created_at,
    jobRunId,
  };
}
