'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getErrorByIdData, ErrorLog } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { ArrowLeft, Clock, Database } from 'lucide-react';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
        <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!error) {
    return (
      <div className="card card-body text-center">
        <p className="typ-caption">Errore non trovato</p>
        <button onClick={() => router.push('/errors')} className="btn btn-ghost btn-sm mt-3" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          Torna agli errori
        </button>
      </div>
    );
  }

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <button onClick={() => router.push('/errors')} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft className="w-4 h-4" /> Torna agli errori
      </button>

      <div className="card card-body">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="grow min-w-0">
            <div className="typ-micro">{error.source}</div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <StatusPill status={error.severity} />
            </div>
            <p className="typ-mono mt-2" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{error.id}</p>
          </div>
          <div className="typ-caption inline-flex items-center gap-1 shrink-0">
            <Clock className="w-4 h-4" /> {fmtDate(error.timestamp)}
          </div>
        </div>
      </div>

      <div>
        <div className="typ-micro mb-1.5">Messaggio</div>
        <div className="card card-body">
          <p className="typ-body">{error.message}</p>
        </div>
      </div>

      {error.stack && (
        <div>
          <div className="typ-micro mb-1.5">Stack trace</div>
          <pre className="typ-mono" style={{
            fontSize: 12,
            padding: 14,
            background: 'var(--card-muted)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--hairline-soft)',
            color: 'var(--danger)',
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
          }}>{error.stack}</pre>
        </div>
      )}

      {error.metadata && (
        <div>
          <div className="typ-micro mb-1.5">Metadata</div>
          <pre className="typ-mono" style={{
            fontSize: 12,
            padding: 14,
            background: 'var(--card-muted)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--hairline-soft)',
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
          }}>{JSON.stringify(error.metadata, null, 2)}</pre>
        </div>
      )}

      {error.jobRunId && (
        <button onClick={() => router.push(`/jobs/runs/${error.jobRunId}`)} className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
          <Database className="w-4 h-4" /> Job run <span className="typ-mono">{error.jobRunId}</span>
        </button>
      )}
    </div>
  );
}
