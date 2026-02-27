'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobs, Job } from '@/lib/data';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';
import { Play, Clock, Calendar, ChevronRight } from 'lucide-react';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    getJobs().then(data => {
      setJobs(data);
      setLoading(false);
    });
  }, []);

  const handleRunJob = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    setRunningJobId(job.id);
    
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, triggeredBy: 'manual' }),
      });
      
      if (!response.ok) {
        console.error('Job trigger failed');
      }
    } catch (error) {
      console.error('Error triggering job:', error);
    }
    
    setTimeout(async () => {
      const { getJobs: reloadJobs } = await import('@/lib/data');
      reloadJobs().then(data => setJobs(data));
      setRunningJobId(null);
    }, 6000);
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Mai';
    return new Date(date).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader 
        title="Job" 
        description="Lista job dalla piattaforma"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map(job => (
          <div
            key={job.id}
            onClick={() => router.push(`/jobs/${job.id}`)}
            className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 cursor-pointer transition-all active:scale-[0.99]"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-foreground text-base">{job.name}</h3>
              <StatusPill status={job.status} size="sm" />
            </div>
            
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{job.description}</p>
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
              {job.schedule ? (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{job.schedule}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Manuale</span>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground mb-3">
              Ultima esecuzione: {formatDate(job.lastRun)}
            </div>
            
            <div className="flex items-center gap-2 pt-3 border-t border-border">
              {job.schedule === null && job.status !== 'paused' && (
                <button
                  onClick={(e) => handleRunJob(e, job)}
                  disabled={runningJobId === job.id}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  {runningJobId === job.id ? 'Esecuzione...' : 'ESEGUI'}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`/jobs/${job.id}`); }}
                className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50"
              >
                Dettagli
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
