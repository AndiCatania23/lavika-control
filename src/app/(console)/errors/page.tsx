'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorsData, ErrorLog } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { Search, AlertTriangle, Clock, ChevronRight, X, Database, Trash2 } from 'lucide-react';

function useIsWide() {
  const [w, setW] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onR = () => setW(window.innerWidth >= 1024);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return w;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ErrorsPage() {
  const router = useRouter();
  const isWide = useIsWide();
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    const filters = severityFilter ? { severity: severityFilter } : undefined;
    getErrorsData(filters).then(data => {
      setErrors(data);
      setLoading(false);
    });
  }, [severityFilter, reloadTick]);

  async function dismissOne(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/console/errors/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      if (selectedId === id) setSelectedId(null);
      setReloadTick(t => t + 1);
    } catch (e) {
      alert(`Errore: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  }

  async function dismissAll() {
    if (!confirm(`Cancellare definitivamente tutti gli errori (${errors.length})? Operazione irreversibile.`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/console/errors/dismiss-all', { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      setSelectedId(null);
      setReloadTick(t => t + 1);
    } catch (e) {
      alert(`Errore: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return errors;
    const q = search.toLowerCase();
    return errors.filter(e =>
      e.message.toLowerCase().includes(q) ||
      e.source.toLowerCase().includes(q)
    );
  }, [errors, search]);

  const selected = selectedId ? errors.find(e => e.id === selectedId) ?? null : null;

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-col sm:flex-row">
        <div className="relative w-full sm:grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Cerca messaggio o sorgente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="input" style={{ width: 'auto', minWidth: 140 }}>
          <option value="">Tutte severità</option>
          <option value="critical">Critico</option>
          <option value="error">Errore</option>
          <option value="warning">Avviso</option>
        </select>
        {errors.length > 0 && (
          <button
            type="button"
            onClick={dismissAll}
            disabled={busy}
            className="btn btn-quiet btn-sm"
            title="Cancella tutti gli errori storici dal job_queue"
          >
            <Trash2 className="w-4 h-4" /> Dismetti tutti
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card card-body text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-caption">Nessun errore.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: isWide && selected ? 'minmax(320px, 440px) 1fr' : '1fr' }}>
          {/* List */}
          <div className="vstack-tight">
            {filtered.map(error => {
              const isSelected = selected?.id === error.id;
              return (
                <div
                  key={error.id}
                  onClick={() => setSelectedId(error.id)}
                  className="card card-hover card-body"
                  style={{
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--accent-raw)' : 'var(--hairline-soft)',
                    boxShadow: isSelected ? 'none' : 'var(--shadow-card)',
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={error.severity} size="sm" />
                    <span className="typ-micro">{error.source}</span>
                    <span className="typ-micro ml-auto inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtDate(error.timestamp)}
                    </span>
                  </div>
                  <div className="typ-label mt-2 truncate-2">{error.message}</div>
                  {error.jobRunId && (
                    <div className="typ-caption mt-1 typ-mono" style={{ fontSize: 11 }}>
                      Run: {error.jobRunId}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detail (wide only inline) */}
          {isWide && selected && (
            <div className="card card-body" style={{ position: 'sticky', top: 80, alignSelf: 'start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
              <ErrorDetail error={selected} onClose={() => setSelectedId(null)} onOpenRun={(runId) => router.push(`/jobs/runs/${runId}`)} onDismiss={() => dismissOne(selected.id)} busy={busy} />
            </div>
          )}
        </div>
      )}

      {/* Detail sheet (mobile) */}
      {!isWide && selected && (
        <>
          <div className="sheet-backdrop" onClick={() => setSelectedId(null)} />
          <div className="sheet" style={{ maxHeight: '92vh' }}>
            <div className="sheet-grip" />
            <ErrorDetail error={selected} onClose={() => setSelectedId(null)} onOpenRun={(runId) => router.push(`/jobs/runs/${runId}`)} />
          </div>
        </>
      )}
    </div>
  );
}

function ErrorDetail({ error, onClose, onOpenRun, onDismiss, busy }: { error: ErrorLog; onClose: () => void; onOpenRun: (runId: string) => void; onDismiss?: () => void; busy?: boolean }) {
  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="grow min-w-0">
          <div className="typ-micro">Errore · {error.source}</div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <StatusPill status={error.severity} size="sm" />
            <span className="typ-caption inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> {fmtDate(error.timestamp)}
            </span>
          </div>
          <p className="typ-mono mt-1" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{error.id}</p>
        </div>
        <div className="flex items-center gap-1">
          {onDismiss && (
            <button
              className="btn btn-quiet btn-sm"
              onClick={onDismiss}
              disabled={busy}
              title="Cancella questo errore dal job_queue"
            >
              <Trash2 className="w-4 h-4" /> Dismetti
            </button>
          )}
          <button className="btn btn-quiet btn-icon btn-sm" onClick={onClose} aria-label="Chiudi">
            <X className="w-4 h-4" />
          </button>
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
            fontSize: 11,
            padding: 12,
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
            fontSize: 11,
            padding: 12,
            background: 'var(--card-muted)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--hairline-soft)',
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
          }}>{JSON.stringify(error.metadata, null, 2)}</pre>
        </div>
      )}

      {error.jobRunId && (
        <button onClick={() => onOpenRun(error.jobRunId!)} className="btn btn-ghost">
          <Database className="w-4 h-4" /> Apri job run <span className="typ-mono">{error.jobRunId}</span>
        </button>
      )}
    </div>
  );
}
