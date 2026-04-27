'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Flag, ShieldOff, ShieldCheck, AlertCircle, Mail, RefreshCw, Check,
  ListFilter, Inbox, FileWarning, Ban, CheckCircle2,
} from 'lucide-react';

type Reason = 'offensive' | 'spam' | 'impersonation' | 'other';
type Status = 'open' | 'reviewing' | 'resolved_warned' | 'resolved_banned' | 'resolved_cleared';

type ReportRow = {
  id: string;
  reporter: { id: string | null; displayName: string | null; email: string | null } | null;
  reported: { id: string; displayName: string | null; email: string | null; avatarUrl: string | null; isBanned: boolean };
  reason: Reason;
  details: string | null;
  status: Status;
  createdAt: string;
  resolvedAt: string | null;
};

const REASON_LABEL: Record<Reason, string> = {
  offensive: 'Offensivo',
  spam: 'Spam',
  impersonation: 'Impersonificazione',
  other: 'Altro',
};

const STATUS_LABEL: Record<Status, string> = {
  open: 'Aperta',
  reviewing: 'In revisione',
  resolved_warned: 'Warning',
  resolved_banned: 'Ban',
  resolved_cleared: 'Infondata',
};

function statusPill(s: Status): string {
  if (s === 'open') return 'pill pill-accent';
  if (s === 'reviewing') return 'pill pill-info';
  if (s === 'resolved_warned') return 'pill';
  if (s === 'resolved_banned') return 'pill pill-err';
  return 'pill pill-ok';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffH = (now - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m fa`;
  if (diffH < 24) return `${Math.round(diffH)}h fa`;
  if (diffH < 24 * 7) return `${Math.round(diffH / 24)}g fa`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

type FilterKey = Status | 'all';

export default function ReportsPage() {
  const [statusFilter, setStatusFilter] = useState<FilterKey>('open');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [allOpenCount, setAllOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setError(null);
    try {
      const url = statusFilter === 'all' ? '/api/dev/reports' : `/api/dev/reports?status=${statusFilter}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'Errore caricamento.');
        return;
      }
      setReports(data.reports ?? []);
      setAllOpenCount(data.openCount ?? 0);
    } catch {
      setError('Errore di rete.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    void loadReports();
  }, [loadReports]);

  const handleAction = async (reportId: string, action: 'warn' | 'ban' | 'unban' | 'clear') => {
    setActingId(reportId);
    try {
      const res = await fetch(`/api/dev/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message ?? 'Azione non riuscita.');
        return;
      }
      await loadReports();
    } catch {
      alert('Errore di rete.');
    } finally {
      setActingId(null);
    }
  };

  const counts = useMemo(() => {
    const byStatus = new Map<Status, number>();
    for (const r of reports) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    return byStatus;
  }, [reports]);

  const kpis = [
    { label: 'Aperte', value: allOpenCount, icon: Inbox, tone: 'accent' as const, hint: 'Da revisionare ora' },
    { label: 'In revisione', value: counts.get('reviewing') ?? 0, icon: ListFilter, tone: 'info' as const, hint: 'In carico' },
    { label: 'Ban emessi', value: counts.get('resolved_banned') ?? 0, icon: Ban, tone: 'err' as const, hint: 'Risolti con ban' },
    { label: 'Risolte', value: (counts.get('resolved_warned') ?? 0) + (counts.get('resolved_cleared') ?? 0), icon: CheckCircle2, tone: 'ok' as const, hint: 'Warning + Infondate' },
  ];

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {kpis.map((k) => {
          const Ic = k.icon;
          const pillClass =
            k.tone === 'ok' ? 'pill pill-ok'
              : k.tone === 'info' ? 'pill pill-info'
                : k.tone === 'accent' ? 'pill pill-accent'
                  : k.tone === 'err' ? 'pill pill-err'
                    : 'pill';
          return (
            <div key={k.label} className="card card-body" style={{ padding: 12 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="typ-micro truncate">{k.label}</span>
                <span className={pillClass} style={{ padding: '2px 6px' }}>
                  <Ic className="w-3 h-3" />
                </span>
              </div>
              <div className="typ-metric mt-1" style={{ fontSize: 24 }}>{k.value.toLocaleString('it-IT')}</div>
              <div className="typ-caption truncate" style={{ fontSize: 11 }}>{k.hint}</div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status segmented filter */}
        <div className="p-1 rounded-[var(--r)]" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)', display: 'inline-flex', flexWrap: 'wrap' }}>
          {(['open', 'all', 'resolved_warned', 'resolved_banned', 'resolved_cleared'] as FilterKey[]).map((f) => {
            const active = statusFilter === f;
            const label = f === 'all' ? 'Tutte' : STATUS_LABEL[f as Status];
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[calc(var(--r)-2px)] typ-label transition-colors"
                style={{
                  background: active ? 'var(--card)' : 'transparent',
                  color: active ? 'var(--text-hi)' : 'var(--text-muted)',
                  boxShadow: active ? 'var(--shadow-card)' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button onClick={loadReports} className="btn btn-ghost btn-sm ml-auto">
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">Aggiorna</span>
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="card card-body text-center">
          <AlertCircle className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--err)' }} />
          <p className="typ-body" style={{ color: 'var(--err)' }}>{error}</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="card card-body text-center" style={{ padding: 'var(--s5)' }}>
          <Flag className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <p className="typ-caption">
            Nessuna segnalazione{statusFilter !== 'all' && ` "${STATUS_LABEL[statusFilter as Status]}"`}.
          </p>
        </div>
      ) : (
        <div className="vstack-tight">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              busy={actingId === r.id}
              onAction={(action) => handleAction(r.id, action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  report,
  busy,
  onAction,
}: {
  report: ReportRow;
  busy: boolean;
  onAction: (action: 'warn' | 'ban' | 'unban' | 'clear') => void;
}) {
  const isResolved = report.status !== 'open' && report.status !== 'reviewing';
  const reportedName = report.reported.displayName ?? '(senza nome)';
  const reporterName = report.reporter?.displayName ?? '(anonimo)';

  return (
    <div className="card" style={{ padding: 12 }}>
      {/* Header row: avatar + name + status pill */}
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          {report.reported.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={report.reported.avatarUrl}
              alt={reportedName}
              className="w-11 h-11 rounded-full object-cover"
              style={{ border: '1px solid var(--hairline-soft)' }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full inline-grid place-items-center"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', fontSize: 14, fontWeight: 600 }}
            >
              {reportedName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="grow min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="typ-label truncate">{reportedName}</div>
            {report.reported.isBanned && (
              <span className="pill pill-err" style={{ fontSize: 10, padding: '1px 6px' }}>
                <Ban className="w-3 h-3" /> bannato
              </span>
            )}
          </div>
          {report.reported.email && (
            <div className="typ-caption truncate">{report.reported.email}</div>
          )}
        </div>

        <span className={statusPill(report.status)} style={{ fontSize: 11, padding: '2px 8px' }}>
          {STATUS_LABEL[report.status]}
        </span>
      </div>

      {/* Reason + details */}
      <div
        className="mt-3 p-3 rounded-[calc(var(--r)-4px)]"
        style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Flag className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          <span className="typ-micro" style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {REASON_LABEL[report.reason]}
          </span>
        </div>
        {report.details ? (
          <p className="typ-body">{report.details}</p>
        ) : (
          <p className="typ-caption">Nessun dettaglio aggiuntivo</p>
        )}
      </div>

      {/* Reporter + dates */}
      <div className="flex items-center justify-between mt-2">
        <span className="typ-caption truncate">
          Da <span style={{ color: 'var(--text-hi)', fontWeight: 500 }}>{reporterName}</span>
        </span>
        <span className="typ-caption shrink-0">{formatDate(report.createdAt)}</span>
      </div>

      {/* Actions */}
      {!isResolved && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => onAction('warn')}
            disabled={busy}
            className="btn btn-sm"
            title="Marca come avvertimento (manda email manualmente)"
          >
            <Mail className="w-3.5 h-3.5" /> Warn
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Confermare ban di "${reportedName}"?\nL'utente non potrà più creare contenuti UGC (display name, predizioni).`)) {
                onAction('ban');
              }
            }}
            disabled={busy}
            className="btn btn-sm"
            style={{ background: 'var(--err-soft)', color: 'var(--err-hi)', borderColor: 'var(--err-soft)' }}
          >
            <ShieldOff className="w-3.5 h-3.5" /> Ban
          </button>
          <button
            type="button"
            onClick={() => onAction('clear')}
            disabled={busy}
            className="btn btn-sm btn-ghost"
            title="Chiudi senza azione"
          >
            <Check className="w-3.5 h-3.5" /> Infondata
          </button>
        </div>
      )}

      {report.status === 'resolved_banned' && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              if (confirm(`Rimuovere ban di "${reportedName}"?`)) {
                onAction('unban');
              }
            }}
            disabled={busy}
            className="btn btn-sm"
            style={{ background: 'var(--ok-soft)', color: 'var(--ok-hi)', borderColor: 'var(--ok-soft)' }}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Rimuovi ban
          </button>
        </div>
      )}

      {isResolved && report.resolvedAt && (
        <div className="typ-caption mt-2" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileWarning className="w-3 h-3" />
          Risolta {formatDate(report.resolvedAt)}
        </div>
      )}
    </div>
  );
}
