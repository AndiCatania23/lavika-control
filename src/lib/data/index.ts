import type { User } from '@/mocks/users';
import type { Session } from '@/mocks/sessions';
import type { Job } from '@/mocks/jobs';
import type { JobRun } from '@/mocks/jobRuns';
import type { ErrorLog } from '@/mocks/errors';
import type { AppNotification } from '@/mocks/notifications';
import type { UserContentInsights } from '@/lib/metrics/userInsights';

export type { User, Session, Job, JobRun, ErrorLog };
export type { AppNotification };
export type { UserContentInsights };

export interface GlobalSearchResult {
  id: string;
  type: 'user' | 'job' | 'page';
  title: string;
  subtitle: string;
  href: string;
}

export interface TopViewedPage {
  path: string;
  views: number;
  uniqueUsers: number;
  share: number;
  lastViewedAt: string | null;
}

async function safeJson<T>(response: Response, fallback: T): Promise<T> {
  if (!response.ok) return fallback;
  return response.json() as Promise<T>;
}

export async function getUsers(): Promise<User[]> {
  const response = await fetch('/api/dev/users', { cache: 'no-store' });
  return safeJson(response, [] as User[]);
}

export async function getTopViewedPages(limit: number = 5): Promise<TopViewedPage[]> {
  const response = await fetch(`/api/dev/users/top-pages?limit=${encodeURIComponent(String(limit))}`, { cache: 'no-store' });
  const payload = await safeJson(response, { items: [] as TopViewedPage[] });
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function getUserById(id: string): Promise<User | undefined> {
  const response = await fetch(`/api/dev/users/${id}`, { cache: 'no-store' });
  if (!response.ok) return undefined;
  return response.json() as Promise<User>;
}

export async function getUserInsights(id: string): Promise<UserContentInsights> {
  const response = await fetch(`/api/dev/users/${id}/insights`, { cache: 'no-store' });
  return safeJson(response, {
    userId: id,
    totalViews: 0,
    uniqueFormats: 0,
    uniqueSeasons: 0,
    uniqueEpisodes: 0,
    rewatchedEpisodes: 0,
    rewatchRate: 0,
    favoritesCount: 0,
    watchTimeSeconds: 0,
    activeDays: 0,
    avgViewsPerActiveDay: 0,
    firstViewAt: null,
    lastViewAt: null,
    lastActivityAt: null,
    activeNow: false,
    active24h: false,
    active7d: false,
    preferredDayPart: 'n/d',
    engagementSegment: 'new',
    topFormats: [],
    topEpisodes: [],
    topSeasons: [],
    topPages: [],
  } as UserContentInsights);
}

export async function getSessions(): Promise<Session[]> {
  const response = await fetch('/api/dev/sessions', { cache: 'no-store' });
  return safeJson(response, [] as Session[]);
}

export async function getSessionsByUserId(userId: string): Promise<Session[]> {
  const response = await fetch(`/api/dev/sessions?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
  return safeJson(response, [] as Session[]);
}

export async function getJobs(): Promise<Job[]> {
  const response = await fetch('/api/jobs', { cache: 'no-store' });
  return safeJson(response, [] as Job[]);
}

export async function getJobById(id: string): Promise<Job | undefined> {
  const response = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
  if (!response.ok) return undefined;
  return response.json() as Promise<Job>;
}

export async function getJobRunsData(filters?: { jobId?: string; status?: string }): Promise<JobRun[]> {
  const params = new URLSearchParams();
  if (filters?.jobId) params.set('jobId', filters.jobId);
  if (filters?.status) params.set('status', filters.status);

  const qs = params.toString();
  const response = await fetch(`/api/jobs/runs${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  return safeJson(response, [] as JobRun[]);
}

export async function getJobRunByIdData(id: string): Promise<JobRun | undefined> {
  const response = await fetch(`/api/jobs/runs/${id}`, { cache: 'no-store' });
  if (!response.ok) return undefined;
  return response.json() as Promise<JobRun>;
}

export async function triggerJob(jobId: string, _jobName: string, triggeredBy: string = 'admin'): Promise<JobRun> {
  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jobId, triggeredBy }),
  });

  if (!response.ok) {
    throw new Error(`Job trigger failed (${response.status})`);
  }

  const payload = await response.json() as { run?: JobRun };

  return payload.run ?? {
    id: `run_${Date.now()}`,
    jobId,
    jobName: jobId,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    duration: null,
    triggeredBy,
    scannedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: 0,
  };
}

export async function getErrorsData(filters?: { severity?: string; source?: string }): Promise<ErrorLog[]> {
  const params = new URLSearchParams();
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.source) params.set('source', filters.source);

  const qs = params.toString();
  const response = await fetch(`/api/console/errors${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  return safeJson(response, [] as ErrorLog[]);
}

export async function getErrorByIdData(id: string): Promise<ErrorLog | undefined> {
  const response = await fetch(`/api/console/errors/${id}`, { cache: 'no-store' });
  if (!response.ok) return undefined;
  return response.json() as Promise<ErrorLog>;
}

export async function getNotificationsData(limit: number = 3, offset: number = 0): Promise<AppNotification[]> {
  const response = await fetch(
    `/api/notifications?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
    { cache: 'no-store' }
  );
  return safeJson(response, [] as AppNotification[]);
}

export async function getGlobalSearchData(query: string, limit: number = 12): Promise<GlobalSearchResult[]> {
  const response = await fetch(
    `/api/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`,
    { cache: 'no-store' }
  );
  return safeJson(response, [] as GlobalSearchResult[]);
}
