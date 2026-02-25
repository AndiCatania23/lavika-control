'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getErrorByIdData, ErrorLog } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { ArrowLeft, Clock, Database } from 'lucide-react';

export default function ErrorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [error, setError] = useState<ErrorLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id as string;
    getErrorByIdData(id).then(data => {
      setError(data || null);
      setLoading(false);
    });
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!error) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Error not found</p>
        <button
          onClick={() => router.push('/errors')}
          className="mt-4 text-primary hover:underline"
        >
          Back to errors
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/errors')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to errors
      </button>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <StatusPill status={error.severity} />
            <div>
              <h2 className="text-lg font-semibold text-foreground">{error.source}</h2>
              <p className="text-xs text-muted-foreground font-mono mt-1">{error.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            {new Date(error.timestamp).toLocaleString('en-GB')}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Message</h3>
        <p className="text-foreground">{error.message}</p>
      </div>

      {error.stack && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-4">Stack Trace</h3>
          <pre className="text-sm text-red-400 font-mono whitespace-pre-wrap bg-muted/30 p-4 rounded-lg overflow-x-auto">
            {error.stack}
          </pre>
        </div>
      )}

      {error.metadata && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-4">Metadata</h3>
          <div className="bg-muted/30 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-foreground font-mono whitespace-pre-wrap">
              {JSON.stringify(error.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {error.jobRunId && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Related Job Run:</span>
            <button
              onClick={() => router.push(`/jobs/runs/${error.jobRunId}`)}
              className="text-sm font-mono text-primary hover:underline"
            >
              {error.jobRunId}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
