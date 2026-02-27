'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getJobById, getJobRunsData, getErrorsData, Job, JobRun, ErrorLog } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { Play, ArrowLeft, Clock, Calendar, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    Promise.all([
      getJobById(jobId),
      getJobRunsData({ jobId }),
      getErrorsData(),
    ]).then(([jobData, runsData, errorsData]) => {
      setJob(jobData || null);
      setRuns(runsData);
      const filteredErrors = jobData
        ? errorsData.filter(error => error.source.toLowerCase().includes(jobData.name.toLowerCase()))
        : errorsData;
      setErrors(filteredErrors);
      setLoading(false);
    });
  }, [jobId]);

  const handleRun = async () => {
    if (!job) return;
    setRunning(true);
    
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, triggeredBy: 'manual' }),
      });
    } catch (error) {
      console.error('Error triggering job:', error);
    }
    
    setTimeout(async () => {
      const [updatedRuns, updatedErrors] = await Promise.all([
        getJobRunsData({ jobId }),
        getErrorsData(),
      ]);
      setRuns(updatedRuns);
      const filteredErrors = job
        ? updatedErrors.filter(error => error.source.toLowerCase().includes(job.name.toLowerCase()))
        : updatedErrors;
      setErrors(filteredErrors);
      setRunning(false);
    }, 6000);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Job non trovato</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Torna ai job
      </button>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{job.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{job.description}</p>
          </div>
          <StatusPill status={job.status} />
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
          {job.schedule ? (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Schedule: {job.schedule}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Esecuzione manuale</span>
            </div>
          )}
        </div>

        {job.schedule === null && job.status !== 'paused' && (
          <button
            onClick={handleRun}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {running ? 'Esecuzione in corso...' : 'ESEGUI JOB'}
          </button>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Esecuzioni</h2>
        {runs.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
            Nessuna esecuzione trovata
          </div>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 10).map(run => (
              <div
                key={run.id}
                onClick={() => router.push(`/jobs/runs/${run.id}`)}
                className="bg-card border border-border rounded-lg p-3 flex items-center justify-between hover:border-primary/50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(run.status)}
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {run.status === 'running' ? 'In corso...' : run.status === 'success' ? 'Completato' : 'Fallito'}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(run.startedAt)}</div>
                  </div>
                </div>
                <div className="text-right text-xs">
                  {run.duration && <div className="text-muted-foreground">{run.duration}s</div>}
                  <div className="text-muted-foreground">
                    Scans: {run.scannedCount} | Ins: {run.insertedCount} | Err: {run.errorCount}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Errori</h2>
          <div className="space-y-2">
            {errors.map(error => (
              <div
                key={error.id}
                onClick={() => router.push(`/errors/${error.id}`)}
                className="bg-card border border-border rounded-lg p-3 flex items-start gap-3 hover:border-primary/50 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{error.message}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(error.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
