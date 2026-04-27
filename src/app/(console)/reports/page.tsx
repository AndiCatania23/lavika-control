'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Flag, ShieldOff, ShieldCheck, AlertCircle, Mail, RefreshCw, Check } from 'lucide-react';

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
  resolved_warned: 'Risolta · warning',
  resolved_banned: 'Risolta · ban',
  resolved_cleared: 'Risolta · infondata',
};

const STATUS_TONE: Record<Status, string> = {
  open: 'text-[color:var(--accent)] bg-[color:var(--accent-soft)]',
  reviewing: 'text-amber-500 bg-amber-500/10',
  resolved_warned: 'text-amber-500 bg-amber-500/10',
  resolved_banned: 'text-red-500 bg-red-500/10',
  resolved_cleared: 'text-emerald-500 bg-emerald-500/10',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffH = (now - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m fa`;
  if (diffH < 24) return `${Math.round(diffH)}h fa`;
  if (diffH < 24 * 7) return `${Math.round(diffH / 24)}g fa`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ReportsPage() {
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('open');
  const [reports, setReports] = useState<ReportRow[]>([]);
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

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typ-display">Segnalazioni</h1>
          <p className="typ-caption mt-1">
            {reports.length} {reports.length === 1 ? 'risultato' : 'risultati'} · filtro: {statusFilter === 'all' ? 'Tutte' : STATUS_LABEL[statusFilter]}
          </p>
        </div>
        <button onClick={loadReports} className="btn btn-ghost btn-sm">
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">Aggiorna</span>
        </button>
      </div>

      {/* Filtri status */}
      <div className="flex flex-wrap gap-2">
        {(['open', 'all', 'resolved_warned', 'resolved_banned', 'resolved_cleared'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s as Status | 'all')}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              statusFilter === s
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-[color:var(--surface-soft)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
            }`}
          >
            {s === 'all' ? 'Tutte' : STATUS_LABEL[s as Status]}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <p className="typ-caption">Caricamento…</p>
          </div>
        </div>
      ) : error ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
            <p className="typ-body text-red-500">{error}</p>
          </div>
        </div>
      ) : reports.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <Flag className="w-6 h-6 text-[color:var(--text-muted)] mx-auto mb-2" />
            <p className="typ-body text-[color:var(--text-muted)]">
              Nessuna segnalazione {statusFilter !== 'all' && `con stato "${STATUS_LABEL[statusFilter as Status]}"`}.
            </p>
          </div>
        </div>
      ) : (
        <div className="vstack" style={{ gap: 'var(--s3)' }}>
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              busy={actingId === report.id}
              onAction={(action) => handleAction(report.id, action)}
            />
          ))}
        </div>
      )}

      {/* Mini-stats footer */}
      {!loading && reports.length > 0 && (
        <div className="card">
          <div className="card-body">
            <p className="typ-micro mb-2">Conteggio per stato (filtrato)</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(['open', 'reviewing', 'resolved_warned', 'resolved_banned', 'resolved_cleared'] as Status[]).map((s) => (
                <div key={s} className="text-center">
                  <div className="typ-h2">{counts.get(s) ?? 0}</div>
                  <div className="typ-micro">{STATUS_LABEL[s]}</div>
                </div>
              ))}
            </div>
          </div>
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
    <div className="card">
      <div className="card-body">
        {/* Top: reported user + status */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="shrink-0">
            {report.reported.avatarUrl ? (
              <Image
                src={report.reported.avatarUrl}
                alt={reportedName}
                width={48}
                height={48}
                className="rounded-full object-cover"
                style={{ width: 48, height: 48 }}
              />
            ) : (
              <div className="rounded-full bg-[color:var(--surface-soft)] flex items-center justify-center text-[color:var(--text-muted)] font-bold" style={{ width: 48, height: 48 }}>
                {reportedName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Reported user info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="typ-h3 truncate">{reportedName}</p>
              {report.reported.isBanned && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-500 uppercase tracking-wide">
                  Bannato
                </span>
              )}
            </div>
            {report.reported.email && (
              <p className="typ-caption truncate">{report.reported.email}</p>
            )}
          </div>

          <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium ${STATUS_TONE[report.status]}`}>
            {STATUS_LABEL[report.status]}
          </span>
        </div>

        {/* Reason + details */}
        <div className="mt-4 p-3 rounded-lg bg-[color:var(--surface-soft)]">
          <div className="flex items-center gap-2 mb-1">
            <Flag className="w-3.5 h-3.5 text-[color:var(--accent)]" />
            <span className="typ-micro font-semibold uppercase tracking-wide">{REASON_LABEL[report.reason]}</span>
          </div>
          {report.details && (
            <p className="typ-body text-[color:var(--text-muted)]">{report.details}</p>
          )}
        </div>

        {/* Reporter + dates */}
        <div className="mt-3 flex items-center justify-between text-[12px] text-[color:var(--text-muted)]">
          <span>
            Segnalato da <strong className="text-[color:var(--text)]">{reporterName}</strong>
          </span>
          <span>{formatDate(report.createdAt)}</span>
        </div>

        {/* Actions */}
        {!isResolved && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              icon={<Mail className="w-3.5 h-3.5" />}
              label="Warn"
              tone="amber"
              busy={busy}
              onClick={() => onAction('warn')}
              hint="Marca come avvertimento dato (manda email manualmente)"
            />
            <ActionButton
              icon={<ShieldOff className="w-3.5 h-3.5" />}
              label="Ban utente"
              tone="red"
              busy={busy}
              onClick={() => {
                if (confirm(`Confermare ban di "${reportedName}"? L'utente non potrà più creare contenuti UGC.`)) {
                  onAction('ban');
                }
              }}
            />
            <ActionButton
              icon={<Check className="w-3.5 h-3.5" />}
              label="Chiudi (infondata)"
              tone="muted"
              busy={busy}
              onClick={() => onAction('clear')}
            />
          </div>
        )}

        {report.status === 'resolved_banned' && (
          <div className="mt-4">
            <ActionButton
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label="Rimuovi ban"
              tone="emerald"
              busy={busy}
              onClick={() => {
                if (confirm(`Rimuovere ban di "${reportedName}"?`)) {
                  onAction('unban');
                }
              }}
            />
          </div>
        )}

        {isResolved && report.resolvedAt && (
          <p className="mt-3 typ-micro text-[color:var(--text-muted)]">
            Risolta {formatDate(report.resolvedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon, label, tone, busy, onClick, hint,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'amber' | 'red' | 'emerald' | 'muted';
  busy: boolean;
  onClick: () => void;
  hint?: string;
}) {
  const toneClasses = {
    amber: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30',
    red: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30',
    muted: 'bg-[color:var(--surface-soft)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] border-[color:var(--border)]',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={hint}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors disabled:opacity-50 ${toneClasses}`}
    >
      {icon}
      {label}
    </button>
  );
}
