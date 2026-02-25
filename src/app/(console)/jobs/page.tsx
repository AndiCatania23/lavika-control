'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getJobs, triggerJob, Job } from '@/lib/data';
import { JobCard } from '@/components/JobCard';
import { SectionHeader } from '@/components/SectionHeader';
import { ModalConfirm } from '@/components/ModalConfirm';
import { useToast } from '@/lib/toast';
import { ArrowRight } from 'lucide-react';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    getJobs().then(data => {
      setJobs(data);
      setLoading(false);
    });
  }, []);

  const handleStartJob = (job: Job) => {
    setSelectedJob(job);
    setConfirmOpen(true);
  };

  const handleConfirmStart = async () => {
    if (!selectedJob) return;
    setIsStarting(true);
    
    try {
      const run = await triggerJob(selectedJob.id, selectedJob.name, 'admin');
      showToast('success', `Job "${selectedJob.name}" started (Run: ${run.id})`);
    } catch {
      showToast('error', 'Failed to start job');
    }
    
    setIsStarting(false);
    setConfirmOpen(false);
    setSelectedJob(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Job" 
        description="Gestisci ed esegui job in background"
        actions={
          <Link
            href="/jobs/runs"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            Visualizza tutte le esecuzioni
            <ArrowRight className="w-4 h-4" />
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onStart={handleStartJob}
          />
        ))}
      </div>

      <ModalConfirm
        isOpen={confirmOpen}
        onClose={() => { setConfirmOpen(false); setSelectedJob(null); }}
        onConfirm={handleConfirmStart}
        title="Avvia Job"
        message={`Sei sicuro di voler avviare "${selectedJob?.name}"?`}
        confirmLabel="Avvia"
        isLoading={isStarting}
      />
    </div>
  );
}
