'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pencil, RefreshCw, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { SectionHeader } from '@/components/SectionHeader';
import { ModalConfirm } from '@/components/ModalConfirm';
import { useToast } from '@/lib/toast';

type AccessType = 'bronze' | 'silver' | 'gold';
type StatusType = 'draft' | 'published';
type StatusFilter = 'all' | StatusType;
type ActiveFilter = 'all' | 'active' | 'inactive';

interface FormatOption {
  id: string;
  title: string | null;
}

interface HomeScheduleItem {
  id: string;
  format_id: string;
  format_title: string | null;
  label: string | null;
  access: AccessType;
  start_at: string;
  status: StatusType;
  is_active: boolean;
  cover_override_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  items: HomeScheduleItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}

interface RowActionState {
  [id: string]: string | undefined;
}

interface FormState {
  format_id: string;
  label: string;
  access: AccessType;
  start_at: string;
  status: StatusType;
  is_active: boolean;
  cover_override_url: string;
}

const ROME_TZ = 'Europe/Rome';
const PAGE_SIZE = 20;

function parseOffsetMinutes(offsetLabel: string): number {
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? '0');
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  });
  const tzPart = formatter.formatToParts(date).find(part => part.type === 'timeZoneName')?.value ?? 'GMT+0';
  return parseOffsetMinutes(tzPart);
}

function localRomeToIso(localValue: string): string | null {
  const match = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcGuess), ROME_TZ);
  return new Date(utcGuess - offsetMinutes * 60_000).toISOString();
}

function isoToRomeInput(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ROME_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
}

function formatRomeDateTime(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: ROME_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function makeDefaultFormState(): FormState {
  return {
    format_id: '',
    label: '',
    access: 'bronze',
    start_at: isoToRomeInput(new Date().toISOString()),
    status: 'draft',
    is_active: true,
    cover_override_url: '',
  };
}

function safeErrorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
    return value.error;
  }
  return fallback;
}

export default function HomeSchedulePage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<HomeScheduleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [rowActions, setRowActions] = useState<RowActionState>({});
  const [formatOptions, setFormatOptions] = useState<FormatOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(makeDefaultFormState);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; hard: boolean; label: string } | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('status', statusFilter);
    params.set('active', activeFilter);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String((currentPage - 1) * PAGE_SIZE));

    if (fromDate) {
      const fromIso = localRomeToIso(`${fromDate}T00:00`);
      if (fromIso) params.set('from', fromIso);
    }

    if (toDate) {
      const toIso = localRomeToIso(`${toDate}T23:59`);
      if (toIso) params.set('to', toIso);
    }

    return params.toString();
  }, [activeFilter, currentPage, fromDate, statusFilter, toDate]);

  const loadFormats = useCallback(async () => {
    setLoadingFormats(true);
    try {
      const response = await fetch('/api/dev/home-schedule/formats', { cache: 'no-store' });
      const payload = await response.json().catch(() => []) as FormatOption[] | { error?: string };

      if (!response.ok) {
        showToast('error', safeErrorMessage(payload, 'Errore caricamento format disponibili.'));
        setFormatOptions([]);
        return;
      }

      const options = Array.isArray(payload) ? payload : [];
      setFormatOptions(options);

      setFormState(prev => {
        if (prev.format_id || options.length === 0) return prev;
        return { ...prev, format_id: options[0].id };
      });
    } catch {
      showToast('error', 'Errore di rete durante il caricamento dei format.');
      setFormatOptions([]);
    } finally {
      setLoadingFormats(false);
    }
  }, [showToast]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const response = await fetch(`/api/dev/home-schedule?${listQuery}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as ListResponse;

      if (!response.ok) {
        showToast('error', safeErrorMessage(payload, 'Errore caricamento palinsesto.'));
        setItems([]);
        setTotal(0);
        return;
      }

      setItems(Array.isArray(payload.items) ? payload.items : []);
      setTotal(typeof payload.total === 'number' ? payload.total : 0);
    } catch {
      showToast('error', 'Errore di rete durante il caricamento del palinsesto.');
      setItems([]);
      setTotal(0);
    } finally {
      setLoadingList(false);
    }
  }, [listQuery, showToast]);

  useEffect(() => {
    void loadFormats();
  }, [loadFormats]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormState(prev => ({
      ...makeDefaultFormState(),
      format_id: formatOptions[0]?.id ?? prev.format_id,
    }));
  }, [formatOptions]);

  const markRowAction = (id: string, value: string | undefined) => {
    setRowActions(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingForm) return;

    if (!formState.format_id) {
      showToast('warning', 'Seleziona un format valido dal menu.');
      return;
    }

    const startAtIso = localRomeToIso(formState.start_at);
    if (!startAtIso) {
      showToast('warning', 'Inserisci una data/ora valida.');
      return;
    }

    if (formState.cover_override_url.trim().length > 0) {
      try {
        const parsed = new URL(formState.cover_override_url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
      } catch {
        showToast('warning', 'Cover override URL deve essere http/https valida.');
        return;
      }
    }

    setSubmittingForm(true);
    const payload = {
      format_id: formState.format_id,
      label: formState.label.trim() || null,
      access: formState.access,
      start_at: startAtIso,
      status: formState.status,
      is_active: formState.is_active,
      cover_override_url: formState.cover_override_url.trim() || null,
    };

    try {
      const endpoint = editingId ? `/api/dev/home-schedule/${editingId}` : '/api/dev/home-schedule';
      const method = editingId ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        showToast('error', safeErrorMessage(responsePayload, 'Salvataggio non riuscito.'));
        return;
      }

      showToast('success', editingId ? 'Appuntamento aggiornato.' : 'Appuntamento creato.');
      resetForm();
      setCurrentPage(1);
      await loadList();
    } catch {
      showToast('error', 'Errore di rete durante il salvataggio.');
    } finally {
      setSubmittingForm(false);
    }
  };

  const startEdit = (item: HomeScheduleItem) => {
    setEditingId(item.id);
    setFormState({
      format_id: item.format_id,
      label: item.label ?? '',
      access: item.access,
      start_at: isoToRomeInput(item.start_at),
      status: item.status,
      is_active: item.is_active,
      cover_override_url: item.cover_override_url ?? '',
    });
  };

  const updateRow = async (id: string, payload: Record<string, unknown>, actionLabel: string) => {
    markRowAction(id, actionLabel);
    try {
      const response = await fetch(`/api/dev/home-schedule/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        showToast('error', safeErrorMessage(responsePayload, 'Aggiornamento non riuscito.'));
        return;
      }
      showToast('success', 'Aggiornamento completato.');
      await loadList();
    } catch {
      showToast('error', 'Errore di rete durante aggiornamento riga.');
    } finally {
      markRowAction(id, undefined);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id, hard } = pendingDelete;

    markRowAction(id, hard ? 'hard-delete' : 'soft-delete');
    try {
      const response = await fetch(`/api/dev/home-schedule/${id}${hard ? '?hard=true' : ''}`, {
        method: 'DELETE',
      });
      const responsePayload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        showToast('error', safeErrorMessage(responsePayload, 'Eliminazione non riuscita.'));
        return;
      }

      showToast('success', hard ? 'Record eliminato definitivamente.' : 'Record disattivato (soft delete).');

      if (editingId === id) {
        resetForm();
      }
      await loadList();
      setPendingDelete(null);
    } catch {
      showToast('error', 'Errore di rete durante eliminazione.');
    } finally {
      markRowAction(id, undefined);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Palinsesto Home"
        description="Gestione appuntamenti carousel IN ARRIVO (timezone Europe/Rome)"
        actions={
          <button
            onClick={() => {
              void loadFormats();
              void loadList();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
          >
            <RefreshCw className="h-4 w-4" />
            Ricarica
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {editingId ? 'Modifica appuntamento' : 'Nuovo appuntamento'}
            </h3>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="format-id">Format</label>
              <select
                id="format-id"
                value={formState.format_id}
                onChange={(event) => setFormState(prev => ({ ...prev, format_id: event.target.value }))}
                disabled={loadingFormats || submittingForm}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {formatOptions.length === 0 && <option value="">Nessun format disponibile</option>}
                {formatOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.title?.trim() || option.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="label">Label</label>
              <input
                id="label"
                type="text"
                value={formState.label}
                onChange={(event) => setFormState(prev => ({ ...prev, label: event.target.value }))}
                placeholder="Es. Oggi alle 21:00"
                disabled={submittingForm}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="access">Access</label>
                <select
                  id="access"
                  value={formState.access}
                  onChange={(event) => setFormState(prev => ({ ...prev, access: event.target.value as AccessType }))}
                  disabled={submittingForm}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="bronze">bronze</option>
                  <option value="silver">silver</option>
                  <option value="gold">gold</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="status">Status</label>
                <select
                  id="status"
                  value={formState.status}
                  onChange={(event) => setFormState(prev => ({ ...prev, status: event.target.value as StatusType }))}
                  disabled={submittingForm}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="start-at">Data/Ora (Europe/Rome)</label>
              <input
                id="start-at"
                type="datetime-local"
                value={formState.start_at}
                onChange={(event) => setFormState(prev => ({ ...prev, start_at: event.target.value }))}
                disabled={submittingForm}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="cover-url">Cover override URL</label>
              <input
                id="cover-url"
                type="url"
                value={formState.cover_override_url}
                onChange={(event) => setFormState(prev => ({ ...prev, cover_override_url: event.target.value }))}
                placeholder="https://..."
                disabled={submittingForm}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={formState.is_active}
                onChange={(event) => setFormState(prev => ({ ...prev, is_active: event.target.checked }))}
                disabled={submittingForm}
              />
              Attivo
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={submittingForm || loadingFormats || !formState.format_id}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submittingForm ? 'Salvataggio...' : editingId ? 'Aggiorna' : 'Aggiungi'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={submittingForm}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
                >
                  Annulla modifica
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="filter-status">Status</label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">all</option>
                <option value="draft">draft</option>
                <option value="published">published</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="filter-active">Attivo</label>
              <select
                id="filter-active"
                value={activeFilter}
                onChange={(event) => {
                  setActiveFilter(event.target.value as ActiveFilter);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">all</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="filter-from">Da</label>
              <input
                id="filter-from"
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="filter-to">A</label>
              <input
                id="filter-to"
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setActiveFilter('all');
                setFromDate('');
                setToDate('');
                setCurrentPage(1);
              }}
              className="ml-auto rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
            >
              Reset filtri
            </button>
          </div>

          {loadingList ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nessun appuntamento trovato con i filtri correnti.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-[980px] w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Data/Ora</th>
                      <th className="px-3 py-2">Format</th>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2">Access</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Attivo</th>
                      <th className="px-3 py-2">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const rowBusy = Boolean(rowActions[item.id]);
                      return (
                        <tr key={item.id} className="border-b border-border align-top text-sm last:border-0">
                          <td className="px-3 py-2 text-foreground">{formatRomeDateTime(item.start_at)}</td>
                          <td className="px-3 py-2 text-foreground">{item.format_title ?? item.format_id}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.label ?? '-'}</td>
                          <td className="px-3 py-2 text-foreground">{item.access}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              item.status === 'published' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              item.is_active ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                            }`}>
                              {item.is_active ? 'active' : 'inactive'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => startEdit(item)}
                                disabled={rowBusy || submittingForm}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-50"
                              >
                                <Pencil className="h-3 w-3" />
                                Modifica
                              </button>

                              <button
                                onClick={() => void updateRow(item.id, { status: item.status === 'draft' ? 'published' : 'draft' }, 'toggle-status')}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-50"
                              >
                                {item.status === 'draft' ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
                                {item.status === 'draft' ? 'Pubblica' : 'Bozza'}
                              </button>

                              <button
                                onClick={() => void updateRow(item.id, { is_active: !item.is_active }, 'toggle-active')}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-50"
                              >
                                {item.is_active ? <ToggleLeft className="h-3 w-3" /> : <ToggleRight className="h-3 w-3" />}
                                {item.is_active ? 'Disattiva' : 'Attiva'}
                              </button>

                              <button
                                onClick={() => setPendingDelete({ id: item.id, hard: false, label: item.label ?? item.format_title ?? item.format_id })}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                                Soft del
                              </button>

                              <button
                                onClick={() => setPendingDelete({ id: item.id, hard: true, label: item.label ?? item.format_title ?? item.format_id })}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                                Hard del
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, total)} di {total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Prec
                  </button>
                  <span className="text-muted-foreground">{currentPage}/{totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Succ
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <ModalConfirm
        isOpen={pendingDelete !== null}
        onClose={() => {
          if (!pendingDelete) return;
          if (rowActions[pendingDelete.id]) return;
          setPendingDelete(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
        title={pendingDelete?.hard ? 'Eliminazione definitiva' : 'Disattivare appuntamento'}
        message={pendingDelete?.hard
          ? `Confermi hard delete del record "${pendingDelete.label}"? Questa azione e irreversibile.`
          : `Confermi soft delete del record "${pendingDelete?.label}"? Il record restera in archivio ma inattivo.`}
        confirmLabel={pendingDelete?.hard ? 'Elimina definitivamente' : 'Disattiva'}
        cancelLabel="Annulla"
        variant={pendingDelete?.hard ? 'danger' : 'default'}
        isLoading={pendingDelete ? Boolean(rowActions[pendingDelete.id]) : false}
      />
    </div>
  );
}
