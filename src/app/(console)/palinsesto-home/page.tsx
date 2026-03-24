'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, RefreshCw, Trash2, WandSparkles } from 'lucide-react';
import { ModalConfirm } from '@/components/ModalConfirm';
import { SectionHeader } from '@/components/SectionHeader';
import { useToast } from '@/lib/toast';
import { buildRRule, ByDay, generateOccurrences, RRuleFreq } from '@/lib/schedule/rrule';
import { formatRomeDisplay, localRomeToUtcIso, utcIsoToRomeLocal } from '@/lib/schedule/timezone';
import { FormatOption, ScheduleAccess, ScheduleCard, ScheduleSeries, ScheduleStatus } from '@/lib/schedule/types';

type StatusFilter = 'all' | ScheduleStatus;
type ActiveFilter = 'all' | 'active' | 'inactive';
type CreateMode = 'single' | 'recurring';
type SeriesScope = 'all' | 'this_and_following';
type ExceptionMode = 'skip' | 'override';

interface ListPayload<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}

interface CommonFormState {
  format_id: string;
  label: string;
  access: ScheduleAccess;
  cover_override_url: string;
  status: ScheduleStatus;
  is_active: boolean;
}

interface SingleFormState extends CommonFormState {
  start_at_local: string;
}

interface RecurringFormState extends CommonFormState {
  dtstart_local: string;
  freq: RRuleFreq;
  interval: number;
  byday: ByDay[];
  until_local: string;
  max_occurrences: string;
}

const PAGE_SIZE = 20;
const BYDAY_OPTIONS: Array<{ value: ByDay; label: string }> = [
  { value: 'MO', label: 'Lun' },
  { value: 'TU', label: 'Mar' },
  { value: 'WE', label: 'Mer' },
  { value: 'TH', label: 'Gio' },
  { value: 'FR', label: 'Ven' },
  { value: 'SA', label: 'Sab' },
  { value: 'SU', label: 'Dom' },
];

function safeErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return fallback;
}

function isoToInputValue(isoValue: string): string {
  const local = utcIsoToRomeLocal(isoValue);
  return local ? local.slice(0, 16) : '';
}

function makeDefaultSingleState(): SingleFormState {
  return {
    format_id: '',
    label: '',
    access: 'bronze',
    cover_override_url: '',
    status: 'draft',
    is_active: true,
    start_at_local: isoToInputValue(new Date().toISOString()),
  };
}

function makeDefaultRecurringState(): RecurringFormState {
  return {
    format_id: '',
    label: '',
    access: 'bronze',
    cover_override_url: '',
    status: 'draft',
    is_active: true,
    dtstart_local: isoToInputValue(new Date().toISOString()),
    freq: 'WEEKLY',
    interval: 1,
    byday: ['MO', 'WE', 'FR'],
    until_local: '',
    max_occurrences: '',
  };
}

export default function PalinsestoHomePage() {
  const { showToast } = useToast();

  const [formatOptions, setFormatOptions] = useState<FormatOption[]>([]);
  const [cards, setCards] = useState<ScheduleCard[]>([]);
  const [series, setSeries] = useState<ScheduleSeries[]>([]);

  const [cardsLoading, setCardsLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [createMode, setCreateMode] = useState<CreateMode>('single');
  const [singleState, setSingleState] = useState<SingleFormState>(makeDefaultSingleState);
  const [recurringState, setRecurringState] = useState<RecurringFormState>(makeDefaultRecurringState);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [formatFilter, setFormatFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCards, setTotalCards] = useState(0);

  const [editingCard, setEditingCard] = useState<ScheduleCard | null>(null);
  const [editingSeries, setEditingSeries] = useState<ScheduleSeries | null>(null);
  const [seriesScope, setSeriesScope] = useState<SeriesScope>('all');
  const [effectiveFromLocal, setEffectiveFromLocal] = useState('');

  const [pendingDelete, setPendingDelete] = useState<{ type: 'card' | 'series'; id: string; hard: boolean; label: string } | null>(null);

  const [exceptionTarget, setExceptionTarget] = useState<ScheduleCard | null>(null);
  const [exceptionMode, setExceptionMode] = useState<ExceptionMode>('skip');
  const [exceptionOverrideStart, setExceptionOverrideStart] = useState('');
  const [exceptionOverrideLabel, setExceptionOverrideLabel] = useState('');
  const [exceptionOverrideAccess, setExceptionOverrideAccess] = useState<ScheduleAccess>('bronze');
  const [exceptionOverrideCover, setExceptionOverrideCover] = useState('');

  const totalPages = Math.max(1, Math.ceil(totalCards / PAGE_SIZE));

  const previewOccurrences = useMemo(() => {
    if (createMode !== 'recurring') return [] as string[];
    if (!recurringState.dtstart_local) return [] as string[];

    try {
      const untilLocal = recurringState.until_local ? `${recurringState.until_local}T23:59:59` : null;
      const maxOccurrences = recurringState.max_occurrences.trim().length > 0
        ? Number(recurringState.max_occurrences)
        : null;

      const rrule = buildRRule({
        freq: recurringState.freq,
        interval: Math.max(1, recurringState.interval),
        byday: recurringState.freq === 'WEEKLY' ? recurringState.byday : [],
        count: null,
        untilLocal: null,
      });

      return generateOccurrences({
        dtstartLocal: `${recurringState.dtstart_local}:00`,
        rrule,
        windowStartLocal: `${recurringState.dtstart_local}:00`,
        windowEndLocal: '2099-12-31T23:59:59',
        maxOccurrences,
        untilLocal,
        limit: 10,
      });
    } catch {
      return [];
    }
  }, [createMode, recurringState]);

  const cardsQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('status', statusFilter);
    params.set('active', activeFilter);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String((currentPage - 1) * PAGE_SIZE));
    if (formatFilter) params.set('format_id', formatFilter);

    if (fromDate) {
      const fromIso = localRomeToUtcIso(`${fromDate}T00:00:00`);
      if (fromIso) params.set('from', fromIso);
    }
    if (toDate) {
      const toIso = localRomeToUtcIso(`${toDate}T23:59:59`);
      if (toIso) params.set('to', toIso);
    }
    return params.toString();
  }, [activeFilter, currentPage, formatFilter, fromDate, statusFilter, toDate]);

  const loadFormats = useCallback(async () => {
    setFormatsLoading(true);
    try {
      const response = await fetch('/api/dev/format-options', { cache: 'no-store' });
      const payload = await response.json().catch(() => []) as FormatOption[] | { error?: string };
      if (!response.ok) {
        showToast('error', safeErrorMessage(payload, 'Errore caricamento format.'));
        setFormatOptions([]);
        return;
      }

      const options = Array.isArray(payload) ? payload : [];
      setFormatOptions(options);
      const first = options[0]?.id ?? '';

      setSingleState(prev => ({ ...prev, format_id: prev.format_id || first }));
      setRecurringState(prev => ({ ...prev, format_id: prev.format_id || first }));
    } catch {
      showToast('error', 'Errore rete caricando i format.');
      setFormatOptions([]);
    } finally {
      setFormatsLoading(false);
    }
  }, [showToast]);

  const loadCards = useCallback(async () => {
    setCardsLoading(true);
    try {
      const response = await fetch(`/api/dev/schedule/cards?${cardsQuery}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as ListPayload<ScheduleCard>;
      if (!response.ok) {
        showToast('error', safeErrorMessage(payload, 'Errore caricamento appuntamenti.'));
        setCards([]);
        setTotalCards(0);
        return;
      }

      setCards(Array.isArray(payload.items) ? payload.items : []);
      setTotalCards(typeof payload.total === 'number' ? payload.total : 0);

      if ((currentPage * PAGE_SIZE) < (payload.total ?? 0)) {
        const nextOffset = currentPage * PAGE_SIZE;
        const nextParams = new URLSearchParams(cardsQuery);
        nextParams.set('offset', String(nextOffset));
        void fetch(`/api/dev/schedule/cards?${nextParams.toString()}`, { cache: 'no-store' }).catch(() => undefined);
      }
    } catch {
      showToast('error', 'Errore rete caricando appuntamenti.');
      setCards([]);
      setTotalCards(0);
    } finally {
      setCardsLoading(false);
    }
  }, [cardsQuery, currentPage, showToast]);

  const loadSeries = useCallback(async () => {
    setSeriesLoading(true);
    try {
      const response = await fetch('/api/dev/schedule/series?limit=50&offset=0', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as ListPayload<ScheduleSeries>;
      if (!response.ok) {
        showToast('error', safeErrorMessage(payload, 'Errore caricamento serie.'));
        setSeries([]);
        return;
      }
      setSeries(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      showToast('error', 'Errore rete caricando serie.');
      setSeries([]);
    } finally {
      setSeriesLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadFormats();
  }, [loadFormats]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const refreshAll = async () => {
    await Promise.all([loadCards(), loadSeries()]);
  };

  const resetForms = () => {
    setEditingCard(null);
    setEditingSeries(null);
    setSeriesScope('all');
    setEffectiveFromLocal('');
    setSingleState(prev => ({ ...makeDefaultSingleState(), format_id: formatOptions[0]?.id ?? prev.format_id }));
    setRecurringState(prev => ({ ...makeDefaultRecurringState(), format_id: formatOptions[0]?.id ?? prev.format_id }));
  };

  const submitSingle = async () => {
    if (!singleState.format_id) {
      showToast('warning', 'Seleziona un format valido.');
      return;
    }

    const startAtIso = localRomeToUtcIso(`${singleState.start_at_local}:00`);
    if (!startAtIso) {
      showToast('warning', 'Data/ora non valida.');
      return;
    }

    const payload = {
      format_id: singleState.format_id,
      label: singleState.label.trim() || null,
      access: singleState.access,
      cover_override_url: singleState.cover_override_url.trim() || null,
      status: singleState.status,
      is_active: singleState.is_active,
      start_at: startAtIso,
    };

    const editing = Boolean(editingCard);
    const endpoint = editing ? `/api/dev/schedule/cards/${editingCard?.id}` : '/api/dev/schedule/cards';
    const method = editing ? 'PATCH' : 'POST';
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(safeErrorMessage(data, 'Salvataggio evento singolo non riuscito.'));
    }
  };

  const submitRecurring = async () => {
    if (!recurringState.format_id) {
      showToast('warning', 'Seleziona un format valido.');
      return;
    }
    if (!recurringState.dtstart_local) {
      showToast('warning', 'Inserisci data/ora di partenza.');
      return;
    }
    if (recurringState.freq === 'WEEKLY' && recurringState.byday.length === 0) {
      showToast('warning', 'Per frequenza weekly seleziona almeno un giorno.');
      return;
    }

    const maxOccurrences = recurringState.max_occurrences.trim().length > 0
      ? Number(recurringState.max_occurrences)
      : null;
    if (maxOccurrences !== null && (!Number.isFinite(maxOccurrences) || maxOccurrences <= 0)) {
      showToast('warning', 'max_occurrences deve essere > 0.');
      return;
    }

    const rrule = buildRRule({
      freq: recurringState.freq,
      interval: Math.max(1, recurringState.interval),
      byday: recurringState.freq === 'WEEKLY' ? recurringState.byday : [],
      count: null,
      untilLocal: null,
    });

    const payload: Record<string, unknown> = {
      format_id: recurringState.format_id,
      label: recurringState.label.trim() || null,
      access: recurringState.access,
      cover_override_url: recurringState.cover_override_url.trim() || null,
      status: recurringState.status,
      is_active: recurringState.is_active,
      timezone: 'Europe/Rome',
      dtstart_local: `${recurringState.dtstart_local}:00`,
      rrule,
      until_local: recurringState.until_local ? `${recurringState.until_local}T23:59:59` : null,
      max_occurrences: maxOccurrences,
    };

    const editing = Boolean(editingSeries);
    const endpoint = editing ? `/api/dev/schedule/series/${editingSeries?.id}` : '/api/dev/schedule/series';
    const method = editing ? 'PATCH' : 'POST';

    if (editing) {
      payload.scope = seriesScope;
      if (seriesScope === 'this_and_following') {
        if (!effectiveFromLocal) {
          showToast('warning', 'Inserisci data effetto per "questa e successive".');
          return;
        }
        payload.effective_from_local = `${effectiveFromLocal}:00`;
      }
    }

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(safeErrorMessage(data, 'Salvataggio serie ricorrente non riuscito.'));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (createMode === 'single') {
        await submitSingle();
        showToast('success', editingCard ? 'Evento singolo aggiornato.' : 'Evento singolo creato.');
      } else {
        await submitRecurring();
        showToast('success', editingSeries ? 'Serie aggiornata e materializzata.' : 'Serie creata e materializzata.');
      }
      resetForms();
      await refreshAll();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Salvataggio non riuscito.');
    } finally {
      setSaving(false);
    }
  };

  const handleCardQuickPatch = async (card: ScheduleCard, payload: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/dev/schedule/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast('error', safeErrorMessage(data, 'Aggiornamento card non riuscito.'));
        return;
      }
      await loadCards();
    } catch {
      showToast('error', 'Errore rete aggiornando la card.');
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const endpoint = pendingDelete.type === 'card'
      ? `/api/dev/schedule/cards/${pendingDelete.id}${pendingDelete.hard ? '?hard=true' : ''}`
      : `/api/dev/schedule/series/${pendingDelete.id}${pendingDelete.hard ? '?hard=true' : ''}`;

    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast('error', safeErrorMessage(data, 'Eliminazione non riuscita.'));
        return;
      }
      showToast('success', pendingDelete.hard ? 'Eliminazione definitiva completata.' : 'Record disattivato.');
      setPendingDelete(null);
      resetForms();
      await refreshAll();
    } catch {
      showToast('error', 'Errore rete durante eliminazione.');
    }
  };

  const startEditCard = (card: ScheduleCard) => {
    setCreateMode('single');
    setEditingSeries(null);
    setEditingCard(card);
    setSingleState({
      format_id: card.format_id,
      label: card.label ?? '',
      access: card.access,
      cover_override_url: card.cover_override_url ?? '',
      status: card.status,
      is_active: card.is_active,
      start_at_local: isoToInputValue(card.start_at),
    });
  };

  const startEditSeries = (item: ScheduleSeries) => {
    setCreateMode('recurring');
    setEditingCard(null);
    setEditingSeries(item);
    setSeriesScope('all');
    setEffectiveFromLocal('');

    let parsedFreq: RRuleFreq = 'WEEKLY';
    let parsedInterval = 1;
    let parsedByday: ByDay[] = ['MO', 'WE', 'FR'];

    try {
      const parsed = item.rrule ? item.rrule : 'FREQ=WEEKLY';
      const value = parsed.split(';').reduce<Record<string, string>>((acc, piece) => {
        const [k, v] = piece.split('=');
        if (k && v) acc[k.toUpperCase()] = v;
        return acc;
      }, {});
      if (value.FREQ === 'DAILY' || value.FREQ === 'WEEKLY' || value.FREQ === 'MONTHLY') parsedFreq = value.FREQ;
      if (value.INTERVAL) parsedInterval = Math.max(1, Number(value.INTERVAL));
      if (value.BYDAY) {
        const days = value.BYDAY.split(',').filter(day => BYDAY_OPTIONS.some(opt => opt.value === day)) as ByDay[];
        if (days.length > 0) parsedByday = days;
      }
    } catch {
      // no-op
    }

    setRecurringState({
      format_id: item.format_id,
      label: item.label ?? '',
      access: item.access,
      cover_override_url: item.cover_override_url ?? '',
      status: item.status,
      is_active: item.is_active,
      dtstart_local: (item.dtstart_local ?? '').slice(0, 16),
      freq: parsedFreq,
      interval: Number.isFinite(parsedInterval) ? parsedInterval : 1,
      byday: parsedByday,
      until_local: item.until_local ? item.until_local.slice(0, 10) : '',
      max_occurrences: item.max_occurrences ? String(item.max_occurrences) : '',
    });
  };

  const openExceptionModal = (card: ScheduleCard) => {
    if (!card.series_id) return;
    setExceptionTarget(card);
    setExceptionMode('skip');
    setExceptionOverrideStart(isoToInputValue(card.start_at));
    setExceptionOverrideLabel(card.label ?? '');
    setExceptionOverrideAccess(card.access);
    setExceptionOverrideCover(card.cover_override_url ?? '');
  };

  const submitException = async () => {
    if (!exceptionTarget || !exceptionTarget.series_id) return;
    const occurrenceLocal = utcIsoToRomeLocal(exceptionTarget.start_at);
    if (!occurrenceLocal) {
      showToast('error', 'Occorrenza non valida per eccezione.');
      return;
    }

    const payload: Record<string, unknown> = {
      occurrence_local: occurrenceLocal,
      action: exceptionMode,
    };

    if (exceptionMode === 'override') {
      payload.override_start_local = `${exceptionOverrideStart}:00`;
      payload.override_label = exceptionOverrideLabel.trim() || null;
      payload.override_access = exceptionOverrideAccess;
      payload.override_cover_override_url = exceptionOverrideCover.trim() || null;
    }

    try {
      const response = await fetch(`/api/dev/schedule/series/${exceptionTarget.series_id}/exceptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast('error', safeErrorMessage(data, 'Eccezione non salvata.'));
        return;
      }

      showToast('success', 'Eccezione applicata e serie materializzata.');
      setExceptionTarget(null);
      await loadCards();
      await loadSeries();
    } catch {
      showToast('error', 'Errore rete durante salvataggio eccezione.');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Palinsesto Home"
        description="Eventi singoli e ricorrenti per carousel IN ARRIVO (Europe/Rome)"
        actions={
          <button
            onClick={() => {
              void loadFormats();
              void refreshAll();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
          >
            <RefreshCw className="h-4 w-4" />
            Ricarica
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {editingCard ? 'Modifica evento singolo' : editingSeries ? 'Modifica serie ricorrente' : 'Nuovo appuntamento'}
            </h3>
          </div>

          <div className="mb-3 inline-flex rounded-lg border border-border p-1 text-xs">
            <button
              type="button"
              onClick={() => setCreateMode('single')}
              className={`rounded px-2 py-1 ${createMode === 'single' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Singolo
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('recurring')}
              className={`rounded px-2 py-1 ${createMode === 'recurring' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Ricorrente
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor="common-format">Format</label>
              <select
                id="common-format"
                value={createMode === 'single' ? singleState.format_id : recurringState.format_id}
                onChange={(event) => {
                  if (createMode === 'single') {
                    setSingleState(prev => ({ ...prev, format_id: event.target.value }));
                  } else {
                    setRecurringState(prev => ({ ...prev, format_id: event.target.value }));
                  }
                }}
                disabled={formatsLoading || saving}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {formatOptions.length === 0 && <option value="">Nessun format</option>}
                {formatOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.title || option.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="common-label">Label</label>
                <input
                  id="common-label"
                  type="text"
                  value={createMode === 'single' ? singleState.label : recurringState.label}
                  onChange={(event) => {
                    if (createMode === 'single') setSingleState(prev => ({ ...prev, label: event.target.value }));
                    else setRecurringState(prev => ({ ...prev, label: event.target.value }));
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Es. Lunedi ore 20:30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="common-cover">Cover override URL</label>
                <input
                  id="common-cover"
                  type="url"
                  value={createMode === 'single' ? singleState.cover_override_url : recurringState.cover_override_url}
                  onChange={(event) => {
                    if (createMode === 'single') setSingleState(prev => ({ ...prev, cover_override_url: event.target.value }));
                    else setRecurringState(prev => ({ ...prev, cover_override_url: event.target.value }));
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="common-access">Access</label>
                <select
                  id="common-access"
                  value={createMode === 'single' ? singleState.access : recurringState.access}
                  onChange={(event) => {
                    if (createMode === 'single') setSingleState(prev => ({ ...prev, access: event.target.value as ScheduleAccess }));
                    else setRecurringState(prev => ({ ...prev, access: event.target.value as ScheduleAccess }));
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="bronze">bronze</option>
                  <option value="silver">silver</option>
                  <option value="gold">gold</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="common-status">Status</label>
                <select
                  id="common-status"
                  value={createMode === 'single' ? singleState.status : recurringState.status}
                  onChange={(event) => {
                    if (createMode === 'single') setSingleState(prev => ({ ...prev, status: event.target.value as ScheduleStatus }));
                    else setRecurringState(prev => ({ ...prev, status: event.target.value as ScheduleStatus }));
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </div>

              <label className="flex items-end gap-2 text-sm text-foreground pb-2">
                <input
                  type="checkbox"
                  checked={createMode === 'single' ? singleState.is_active : recurringState.is_active}
                  onChange={(event) => {
                    if (createMode === 'single') setSingleState(prev => ({ ...prev, is_active: event.target.checked }));
                    else setRecurringState(prev => ({ ...prev, is_active: event.target.checked }));
                  }}
                />
                Attivo
              </label>
            </div>

            {createMode === 'single' ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="single-start">Data/Ora (Europe/Rome)</label>
                <input
                  id="single-start"
                  type="datetime-local"
                  value={singleState.start_at_local}
                  onChange={(event) => setSingleState(prev => ({ ...prev, start_at_local: event.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground" htmlFor="series-dtstart">Partenza (Europe/Rome)</label>
                    <input
                      id="series-dtstart"
                      type="datetime-local"
                      value={recurringState.dtstart_local}
                      onChange={(event) => setRecurringState(prev => ({ ...prev, dtstart_local: event.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground" htmlFor="series-freq">Frequenza</label>
                    <select
                      id="series-freq"
                      value={recurringState.freq}
                      onChange={(event) => setRecurringState(prev => ({ ...prev, freq: event.target.value as RRuleFreq }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground" htmlFor="series-interval">Intervallo</label>
                    <input
                      id="series-interval"
                      type="number"
                      min={1}
                      value={recurringState.interval}
                      onChange={(event) => setRecurringState(prev => ({ ...prev, interval: Math.max(1, Number(event.target.value) || 1) }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground" htmlFor="series-until">Fine (data)</label>
                    <input
                      id="series-until"
                      type="date"
                      value={recurringState.until_local}
                      onChange={(event) => setRecurringState(prev => ({ ...prev, until_local: event.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground" htmlFor="series-max">Max occorrenze</label>
                    <input
                      id="series-max"
                      type="number"
                      min={1}
                      value={recurringState.max_occurrences}
                      onChange={(event) => setRecurringState(prev => ({ ...prev, max_occurrences: event.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      placeholder="opzionale"
                    />
                  </div>
                </div>

                {recurringState.freq === 'WEEKLY' && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-foreground">Giorni</span>
                    <div className="flex flex-wrap gap-1.5">
                      {BYDAY_OPTIONS.map(day => {
                        const active = recurringState.byday.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              setRecurringState(prev => {
                                const present = prev.byday.includes(day.value);
                                const next = present
                                  ? prev.byday.filter(item => item !== day.value)
                                  : [...prev.byday, day.value];
                                return { ...prev, byday: next };
                              });
                            }}
                            className={`rounded-md border px-2 py-1 text-xs ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {editingSeries && (
                  <div className="grid gap-3 rounded-md border border-border bg-card p-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground" htmlFor="series-scope">Ambito modifica</label>
                      <select
                        id="series-scope"
                        value={seriesScope}
                        onChange={(event) => setSeriesScope(event.target.value as SeriesScope)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="all">Tutta la serie</option>
                        <option value="this_and_following">Questa e successive</option>
                      </select>
                    </div>
                    {seriesScope === 'this_and_following' && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground" htmlFor="series-effective">Effetto da (datetime)</label>
                        <input
                          id="series-effective"
                          type="datetime-local"
                          value={effectiveFromLocal}
                          onChange={(event) => setEffectiveFromLocal(event.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-md border border-dashed border-border p-2">
                  <div className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <WandSparkles className="h-3.5 w-3.5" />
                    Preview prossime 10
                  </div>
                  {previewOccurrences.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Imposta ricorrenza valida per vedere le occorrenze.</p>
                  ) : (
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      {previewOccurrences.map(item => {
                        const iso = localRomeToUtcIso(item);
                        return <span key={item}>{iso ? formatRomeDisplay(iso) : item}</span>;
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={saving || formatsLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {saving ? 'Salvataggio...' : editingCard || editingSeries ? 'Aggiorna' : 'Crea'}
              </button>

              {(editingCard || editingSeries) && (
                <button
                  type="button"
                  onClick={resetForms}
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  Annulla modifica
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Lista appuntamenti materializzati</h3>

            <div className="mb-3 flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="f-status">Status</label>
                <select id="f-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1); }} className="rounded-lg border border-border bg-background px-2 py-2 text-sm">
                  <option value="all">all</option>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="f-active">Attivo</label>
                <select id="f-active" value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value as ActiveFilter); setCurrentPage(1); }} className="rounded-lg border border-border bg-background px-2 py-2 text-sm">
                  <option value="all">all</option>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="f-format">Format</label>
                <select id="f-format" value={formatFilter} onChange={(e) => { setFormatFilter(e.target.value); setCurrentPage(1); }} className="rounded-lg border border-border bg-background px-2 py-2 text-sm">
                  <option value="">Tutti</option>
                  {formatOptions.map(option => <option key={option.id} value={option.id}>{option.title || option.id}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="f-from">Da</label>
                <input id="f-from" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} className="rounded-lg border border-border bg-background px-2 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground" htmlFor="f-to">A</label>
                <input id="f-to" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} className="rounded-lg border border-border bg-background px-2 py-2 text-sm" />
              </div>
            </div>

            {cardsLoading ? (
              <div className="flex h-40 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
            ) : cards.length === 0 ? (
              <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nessun appuntamento trovato.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Data/Ora</th>
                        <th className="px-3 py-2">Format</th>
                        <th className="px-3 py-2">Label</th>
                        <th className="px-3 py-2">Access</th>
                        <th className="px-3 py-2">Stato</th>
                        <th className="px-3 py-2">Origine</th>
                        <th className="px-3 py-2">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cards.map(card => (
                        <tr key={card.id} className="border-b border-border last:border-0 align-top">
                          <td className="px-3 py-2">{formatRomeDisplay(card.start_at)}</td>
                          <td className="px-3 py-2">{card.format_title ?? card.format_id}</td>
                          <td className="px-3 py-2 text-muted-foreground">{card.label ?? '-'}</td>
                          <td className="px-3 py-2">{card.access}</td>
                          <td className="px-3 py-2">{card.status} / {card.is_active ? 'active' : 'inactive'}</td>
                          <td className="px-3 py-2">{card.source_type}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              <button className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40" onClick={() => startEditCard(card)}>
                                <Pencil className="mr-1 inline h-3 w-3" />Edit
                              </button>
                              <button className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40" onClick={() => void handleCardQuickPatch(card, { status: card.status === 'draft' ? 'published' : 'draft' })}>
                                {card.status === 'draft' ? 'Pubblica' : 'Bozza'}
                              </button>
                              <button className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40" onClick={() => void handleCardQuickPatch(card, { is_active: !card.is_active })}>
                                {card.is_active ? 'Disattiva' : 'Attiva'}
                              </button>
                              {card.source_type === 'series' && card.series_id ? (
                                <button className="rounded border border-amber-500/30 px-2 py-1 text-xs text-amber-500 hover:bg-amber-500/10" onClick={() => openExceptionModal(card)}>
                                  Solo questa
                                </button>
                              ) : null}
                              <button className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40" onClick={() => setPendingDelete({ type: 'card', id: card.id, hard: false, label: card.label ?? card.id })}>Soft del</button>
                              <button className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10" onClick={() => setPendingDelete({ type: 'card', id: card.id, hard: true, label: card.label ?? card.id })}><Trash2 className="mr-1 inline h-3 w-3" />Hard</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(totalCards, currentPage * PAGE_SIZE)} di {totalCards}
                  </span>
                  <div className="flex items-center gap-2">
                    <button disabled={currentPage <= 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className="rounded border border-border px-2 py-1 disabled:opacity-50">Prec</button>
                    <span className="text-muted-foreground">{currentPage}/{totalPages}</span>
                    <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className="rounded border border-border px-2 py-1 disabled:opacity-50">Succ</button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Serie ricorrenti</h3>
            {seriesLoading ? (
              <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
            ) : series.length === 0 ? (
              <div className="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nessuna serie.</div>
            ) : (
              <div className="space-y-2">
                {series.map(item => (
                  <div key={item.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-foreground">{item.format_title ?? item.format_id} - {item.label ?? '(senza label)'}</div>
                        <div className="text-xs text-muted-foreground">{item.dtstart_local} - RRULE: {item.rrule}</div>
                        <div className="text-xs text-muted-foreground">{item.status} / {item.is_active ? 'active' : 'inactive'}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40" onClick={() => startEditSeries(item)}>Edit serie</button>
                        <button className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40" onClick={() => setPendingDelete({ type: 'series', id: item.id, hard: false, label: item.label ?? item.id })}>Soft del</button>
                        <button className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10" onClick={() => setPendingDelete({ type: 'series', id: item.id, hard: true, label: item.label ?? item.id })}>Hard del</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <ModalConfirm
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { void handleDelete(); }}
        title={pendingDelete?.hard ? 'Eliminazione definitiva' : 'Disattivazione'}
        message={pendingDelete ? `Confermi azione su ${pendingDelete.label}?` : ''}
        confirmLabel={pendingDelete?.hard ? 'Elimina hard' : 'Conferma'}
        cancelLabel="Annulla"
        variant={pendingDelete?.hard ? 'danger' : 'default'}
        isLoading={saving}
      />

      {exceptionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-semibold text-foreground">Solo questa occorrenza</h4>
            <p className="mt-1 text-xs text-muted-foreground">Serie: {exceptionTarget.series_id} - Occorrenza: {formatRomeDisplay(exceptionTarget.start_at)}</p>

            <div className="mt-3 space-y-3">
              <div className="inline-flex rounded-lg border border-border p-1 text-xs">
                <button type="button" className={`rounded px-2 py-1 ${exceptionMode === 'skip' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`} onClick={() => setExceptionMode('skip')}>Skip</button>
                <button type="button" className={`rounded px-2 py-1 ${exceptionMode === 'override' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`} onClick={() => setExceptionMode('override')}>Override</button>
              </div>

              {exceptionMode === 'override' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="datetime-local" value={exceptionOverrideStart} onChange={(e) => setExceptionOverrideStart(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input type="text" value={exceptionOverrideLabel} onChange={(e) => setExceptionOverrideLabel(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Label override" />
                  <select value={exceptionOverrideAccess} onChange={(e) => setExceptionOverrideAccess(e.target.value as ScheduleAccess)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="bronze">bronze</option>
                    <option value="silver">silver</option>
                    <option value="gold">gold</option>
                  </select>
                  <input type="url" value={exceptionOverrideCover} onChange={(e) => setExceptionOverrideCover(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Cover override URL" />
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => setExceptionTarget(null)}>Chiudi</button>
                <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" onClick={() => void submitException()}>Applica eccezione</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
