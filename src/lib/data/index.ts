import { kpis, systemStatus, Kpi } from '@/mocks/kpis';
import { users, User } from '@/mocks/users';
import { sessions, Session } from '@/mocks/sessions';
import { jobs, Job } from '@/mocks/jobs';
import { getJobRuns, getJobRunById, createJobRun, completeJobRun, JobRun } from '@/mocks/jobRuns';
import { getErrors, getErrorById, ErrorLog } from '@/mocks/errors';

export type { Kpi, User, Session, Job, JobRun, ErrorLog };

export async function getDashboardKpis(): Promise<{ kpis: Kpi[]; systemStatus: typeof systemStatus }> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return { kpis, systemStatus };
}

export async function getUsers(): Promise<User[]> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return users;
}

export async function getUserById(id: string): Promise<User | undefined> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return users.find(u => u.id === id);
}

export async function getSessions(): Promise<Session[]> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return sessions;
}

export async function getJobs(): Promise<Job[]> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return jobs;
}

export async function getJobById(id: string): Promise<Job | undefined> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return jobs.find(j => j.id === id);
}

export async function getJobRunsData(filters?: { jobId?: string; status?: string }): Promise<JobRun[]> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return getJobRuns(filters);
}

export async function getJobRunByIdData(id: string): Promise<JobRun | undefined> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return getJobRunById(id);
}

export async function triggerJob(jobId: string, jobName: string, triggeredBy: string = 'admin'): Promise<JobRun> {
  await new Promise(resolve => setTimeout(resolve, 100));
  const run = createJobRun(jobId, jobName, triggeredBy);
  
  setTimeout(() => {
    const success = Math.random() > 0.2;
    completeJobRun(run.id, success);
  }, 3000);
  
  return run;
}

export async function getErrorsData(filters?: { severity?: string; source?: string }): Promise<ErrorLog[]> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return getErrors(filters);
}

export async function getErrorByIdData(id: string): Promise<ErrorLog | undefined> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return getErrorById(id);
}
