'use client';

import { Play, Clock, Calendar } from 'lucide-react';
import type { Job } from '@/lib/data';
import { StatusPill } from './StatusPill';

interface JobCardProps {
  job: Job;
  onStart: (job: Job) => void;
}

export function JobCard({ job, onStart }: JobCardProps) {
  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-medium text-foreground">{job.name}</h3>
        <StatusPill status={job.status} size="sm" />
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">{job.description}</p>
      
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        {job.schedule ? (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{job.schedule}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>Manual</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground">
          Last run: {formatDate(job.lastRun)}
        </div>
        {job.status !== 'paused' && (
          <button
            onClick={() => onStart(job)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Play className="w-3 h-3" />
            Avvia
          </button>
        )}
      </div>
    </div>
  );
}
