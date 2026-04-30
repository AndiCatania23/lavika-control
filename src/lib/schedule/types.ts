export const SCHEDULE_ACCESS_VALUES = ['bronze', 'silver', 'gold'] as const;
export const SCHEDULE_STATUS_VALUES = ['draft', 'published'] as const;
export const SCHEDULE_SOURCE_VALUES = ['manual', 'series'] as const;
export const SCHEDULE_TIMEZONE = 'Europe/Rome';

export type ScheduleAccess = typeof SCHEDULE_ACCESS_VALUES[number];
export type ScheduleStatus = typeof SCHEDULE_STATUS_VALUES[number];
export type ScheduleSourceType = typeof SCHEDULE_SOURCE_VALUES[number];

export interface ScheduleCard {
  id: string;
  format_id: string;
  format_title: string | null;
  label: string | null;
  access: ScheduleAccess;
  start_at: string;
  status: ScheduleStatus;
  is_active: boolean;
  cover_override_url: string | null;
  source_type: ScheduleSourceType;
  series_id: string | null;
  occurrence_key: string | null;
  duration_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSeries {
  id: string;
  format_id: string;
  format_title: string | null;
  label: string | null;
  access: ScheduleAccess;
  cover_override_url: string | null;
  timezone: string;
  dtstart_local: string;
  rrule: string;
  until_local: string | null;
  max_occurrences: number | null;
  status: ScheduleStatus;
  is_active: boolean;
  duration_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface FormatOption {
  id: string;
  title: string | null;
}

export type ExceptionAction = 'skip' | 'override';
