import { supabaseServer } from '@/lib/supabaseServer';
import { ScheduleAccess, ScheduleStatus, SCHEDULE_ACCESS_VALUES, SCHEDULE_STATUS_VALUES } from './types';

export function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidAccess(value: unknown): value is ScheduleAccess {
  return typeof value === 'string' && SCHEDULE_ACCESS_VALUES.includes(value as ScheduleAccess);
}

export function isValidStatus(value: unknown): value is ScheduleStatus {
  return typeof value === 'string' && SCHEDULE_STATUS_VALUES.includes(value as ScheduleStatus);
}

export async function isKnownFormat(formatId: string): Promise<boolean> {
  if (!supabaseServer) return false;
  const { data, error } = await supabaseServer
    .from('content_formats')
    .select('id')
    .eq('id', formatId)
    .limit(1);

  return !error && Array.isArray(data) && data.length > 0;
}
