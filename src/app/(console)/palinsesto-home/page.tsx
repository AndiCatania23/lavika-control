'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, RefreshCw, Trash2, WandSparkles, X, Filter, Eye, EyeOff, Repeat, Calendar } from 'lucide-react';
import { ModalConfirm } from '@/components/ModalConfirm';
import { useToast } from '@/lib/toast';
import { buildRRule, ByDay, generateOccurrences, RRuleFreq } from '@/lib/schedule/rrule';
import { formatRomeDisplay, localRomeToUtcIso, utcIsoToRomeLocal } from '@/lib/schedule/timezone';
import { FormatOption, ScheduleAccess, ScheduleCard, ScheduleSeries, ScheduleStatus } from '@/lib/schedule/types';

/* ==================================================================
   Types (local)
   ================================================================== */
type StatusFilter = 'all' | ScheduleStatus;
type ActiveFilter = 'all' | 'active' | 'inactive';
type CreateMode = 'single' | 'recurring';
type SeriesScope = 'all' | 'this_and_following';
type ExceptionMode = 'skip' | 'override';
type MasterTab = 'cards' | 'series';

interface ListPayload<T> { items: T[]; total: number; limit: number; offset: number; error?: string; }

interface CommonFormState {
  format_id: string;
  label: string;
  access: ScheduleAccess;
  cover_override_url: string;
  status: ScheduleStatus;
  is_active: boolean;
  duration_minutes: string;  // string per input number; serializzato a int 1..1440 al submit
}
interface SingleFormState extends CommonFormState { start_at_local: string; }
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
  { value: 'MO', label: 'Lun' }, { value: 'TU', label: 'Mar' }, { value: 'WE', label: 'Mer' },
  { value: 'TH', label: 'Gio' }, { value: 'FR', label: 'Ven' }, { value: 'SA', label: 'Sab' }, { value: 'SU', label: 'Dom' },
];

function safeErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string') return (payload as { error: string }).error;
  return fallback;
}
function isoToInputValue(isoValue: string): string {
  const local = utcIsoToRomeLocal(isoValue);
  return local ? local.slice(0, 16) : '';
}
function makeDefaultSingleState(): SingleFormState {
  return { format_id: '', label: '', access: 'bronze', cover_override_url: '', status: 'draft', is_active: true, start_at_local: isoToInputValue(new Date().toISOString()), duration_minutes: '60' };
}
function makeDefaultRecurringState(): RecurringFormState {
  return { format_id: '', label: '', access: 'bronze', cover_override_url: '', status: 'draft', is_active: true, dtstart_local: isoToInputValue(new Date().toISOString()), freq: 'WEEKLY', interval: 1, byday: ['MO', 'WE', 'FR'], until_local: '', max_occurrences: '', duration_minutes: '60' };
}

function parseDurationMinutes(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1440) return null;
  return Math.floor(n);
}

/* >=1024 = master-detail split layout (desktop + iPad landscape).
   iPad portrait (768-1023) uses sheet like mobile — more space for each view. */
function useIsWide() {
  const [w, setW] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onR = () => setW(window.innerWidth >= 1024);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return w;
}

/* ==================================================================
   Main Page
   ================================================================== */

export default function PalinsestoHomePage() {
  const { showToast } = useToast();
  const isWide = useIsWide();

  // Data
  const [formatOptions, setFormatOptions] = useState<FormatOption[]>([]);
  const [cards, setCards] = useState<ScheduleCard[]>([]);
  const [series, setSeries] = useState<ScheduleSeries[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Master tab
  const [masterTab, setMasterTab] = useState<MasterTab>('cards');

  // Form state
  const [createMode, setCreateMode] = useState<CreateMode>('single');
  const [singleState, setSingleState] = useState<SingleFormState>(makeDefaultSingleState);
  const [recurringState, setRecurringState] = useState<RecurringFormState>(makeDefaultRecurringState);
  const [editingCard, setEditingCard] = useState<ScheduleCard | null>(null);
  const [editingSeries, setEditingSeries] = useState<ScheduleSeries | null>(null);
  const [seriesScope, setSeriesScope] = useState<SeriesScope>('all');
  const [effectiveFromLocal, setEffectiveFromLocal] = useState('');
  const [formOpen, setFormOpen] = useState(false); // sheet/visibility flag

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [formatFilter, setFormatFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCards, setTotalCards] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCards / PAGE_SIZE));

  // Exception / delete
  const [exceptionTarget, setExceptionTarget] = useState<ScheduleCard | null>(null);
  const [exceptionMode, setExceptionMode] = useState<ExceptionMode>('skip');
  const [exceptionOverrideStart, setExceptionOverrideStart] = useState('');
  const [exceptionOverrideLabel, setExceptionOverrideLabel] = useState('');
  const [exceptionOverrideAccess, setExceptionOverrideAccess] = useState<ScheduleAccess>('bronze');
  const [exceptionOverrideCover, setExceptionOverrideCover] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ type: 'card' | 'series'; id: string; hard: boolean; label: string } | null>(null);

  // Derived
  const previewOccurrences = useMemo(() => {
    if (createMode !== 'recurring') return [] as string[];
    if (!recurringState.dtstart_local) return [] as string[];
    try {
      const untilLocal = recurringState.until_local ? `${recurringState.until_local}T23:59:59` : null;
      const maxOccurrences = recurringState.max_occurrences.trim().length > 0 ? Number(recurringState.max_occurrences) : null;
      const rrule = buildRRule({
        freq: recurringState.freq,
        interval: Math.max(1, recurringState.interval),
        byday: recurringState.freq === 'WEEKLY' ? recurringState.byday : [],
        count: null, untilLocal: null,
      });
      return generateOccurrences({
        dtstartLocal: `${recurringState.dtstart_local}:00`,
        rrule,
        windowStartLocal: `${recurringState.dtstart_local}:00`,
        windowEndLocal: '2099-12-31T23:59:59',
        maxOccurrences, untilLocal, limit: 10,
      });
    } catch { return []; }
  }, [createMode, recurringState]);

  const cardsQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('status', statusFilter); params.set('active', activeFilter);
    params.set('limit', String(PAGE_SIZE)); params.set('offset', String((currentPage - 1) * PAGE_SIZE));
    if (formatFilter) params.set('format_id', formatFilter);
    if (fromDate) { const iso = localRomeToUtcIso(`${fromDate}T00:00:00`); if (iso) params.set('from', iso); }
    if (toDate)   { const iso = localRomeToUtcIso(`${toDate}T23:59:59`);   if (iso) params.set('to', iso); }
    return params.toString();
  }, [activeFilter, currentPage, formatFilter, fromDate, statusFilter, toDate]);

  // Loaders
  const loadFormats = useCallback(async () => {
    setFormatsLoading(true);
    try {
      const res = await fetch('/api/dev/format-options', { cache: 'no-store' });
      const p = await res.json().catch(() => []) as FormatOption[] | { error?: string };
      if (!res.ok) { showToast('error', safeErrorMessage(p, 'Errore format.')); setFormatOptions([]); return; }
      const options = Array.isArray(p) ? p : [];
      setFormatOptions(options);
      const first = options[0]?.id ?? '';
      setSingleState(prev => ({ ...prev, format_id: prev.format_id || first }));
      setRecurringState(prev => ({ ...prev, format_id: prev.format_id || first }));
    } catch { showToast('error', 'Errore rete format.'); setFormatOptions([]); }
    finally { setFormatsLoading(false); }
  }, [showToast]);

  const loadCards = useCallback(async () => {
    setCardsLoading(true);
    try {
      const res = await fetch(`/api/dev/schedule/cards?${cardsQuery}`, { cache: 'no-store' });
      const p = await res.json().catch(() => ({})) as ListPayload<ScheduleCard>;
      if (!res.ok) { showToast('error', safeErrorMessage(p, 'Errore cards.')); setCards([]); setTotalCards(0); return; }
      setCards(Array.isArray(p.items) ? p.items : []);
      setTotalCards(typeof p.total === 'number' ? p.total : 0);
    } catch { showToast('error', 'Errore rete cards.'); setCards([]); setTotalCards(0); }
    finally { setCardsLoading(false); }
  }, [cardsQuery, showToast]);

  const loadSeries = useCallback(async () => {
    setSeriesLoading(true);
    try {
      const res = await fetch('/api/dev/schedule/series?limit=50&offset=0', { cache: 'no-store' });
      const p = await res.json().catch(() => ({})) as ListPayload<ScheduleSeries>;
      if (!res.ok) { showToast('error', safeErrorMessage(p, 'Errore serie.')); setSeries([]); return; }
      setSeries(Array.isArray(p.items) ? p.items : []);
    } catch { showToast('error', 'Errore rete serie.'); setSeries([]); }
    finally { setSeriesLoading(false); }
  }, [showToast]);

  useEffect(() => { void loadFormats(); }, [loadFormats]);
  useEffect(() => { void loadCards(); }, [loadCards]);
  useEffect(() => { void loadSeries(); }, [loadSeries]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const refreshAll = async () => { await Promise.all([loadCards(), loadSeries()]); };

  const resetForms = () => {
    setEditingCard(null); setEditingSeries(null); setSeriesScope('all'); setEffectiveFromLocal('');
    setSingleState(prev => ({ ...makeDefaultSingleState(), format_id: formatOptions[0]?.id ?? prev.format_id }));
    setRecurringState(prev => ({ ...makeDefaultRecurringState(), format_id: formatOptions[0]?.id ?? prev.format_id }));
  };

  const openNewForm = () => { resetForms(); setCreateMode('single'); setFormOpen(true); };
  const closeForm   = () => { setFormOpen(false); resetForms(); };

  // Submit handlers (logic preserved)
  const submitSingle = async () => {
    if (!singleState.format_id) { showToast('warning', 'Seleziona format.'); return; }
    const startAtIso = localRomeToUtcIso(`${singleState.start_at_local}:00`);
    if (!startAtIso) { showToast('warning', 'Data/ora invalida.'); return; }
    const duration = parseDurationMinutes(singleState.duration_minutes);
    if (duration === null) { showToast('warning', 'Durata (min) deve essere 1..1440.'); return; }
    const payload = {
      format_id: singleState.format_id, label: singleState.label.trim() || null,
      access: singleState.access, cover_override_url: singleState.cover_override_url.trim() || null,
      status: singleState.status, is_active: singleState.is_active, start_at: startAtIso,
      duration_minutes: duration,
    };
    const editing = Boolean(editingCard);
    const endpoint = editing ? `/api/dev/schedule/cards/${editingCard?.id}` : '/api/dev/schedule/cards';
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(safeErrorMessage(data, 'Salvataggio fallito.'));
  };

  const submitRecurring = async () => {
    if (!recurringState.format_id) { showToast('warning', 'Seleziona format.'); return; }
    if (!recurringState.dtstart_local) { showToast('warning', 'Inserisci data partenza.'); return; }
    if (recurringState.freq === 'WEEKLY' && recurringState.byday.length === 0) { showToast('warning', 'Seleziona almeno un giorno.'); return; }
    const maxOcc = recurringState.max_occurrences.trim().length > 0 ? Number(recurringState.max_occurrences) : null;
    if (maxOcc !== null && (!Number.isFinite(maxOcc) || maxOcc <= 0)) { showToast('warning', 'max_occurrences > 0.'); return; }
    const rrule = buildRRule({
      freq: recurringState.freq, interval: Math.max(1, recurringState.interval),
      byday: recurringState.freq === 'WEEKLY' ? recurringState.byday : [], count: null, untilLocal: null,
    });
    const duration = parseDurationMinutes(recurringState.duration_minutes);
    if (duration === null) { showToast('warning', 'Durata (min) deve essere 1..1440.'); return; }
    const payload: Record<string, unknown> = {
      format_id: recurringState.format_id, label: recurringState.label.trim() || null,
      access: recurringState.access, cover_override_url: recurringState.cover_override_url.trim() || null,
      status: recurringState.status, is_active: recurringState.is_active,
      timezone: 'Europe/Rome', dtstart_local: `${recurringState.dtstart_local}:00`, rrule,
      until_local: recurringState.until_local ? `${recurringState.until_local}T23:59:59` : null,
      max_occurrences: maxOcc,
      duration_minutes: duration,
    };
    const editing = Boolean(editingSeries);
    const endpoint = editing ? `/api/dev/schedule/series/${editingSeries?.id}` : '/api/dev/schedule/series';
    const method = editing ? 'PATCH' : 'POST';
    if (editing) {
      payload.scope = seriesScope;
      if (seriesScope === 'this_and_following') {
        if (!effectiveFromLocal) { showToast('warning', 'Inserisci data effetto.'); return; }
        payload.effective_from_local = `${effectiveFromLocal}:00`;
      }
    }
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(safeErrorMessage(data, 'Salvataggio serie fallito.'));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return;
    setSaving(true);
    try {
      if (createMode === 'single') { await submitSingle(); showToast('success', editingCard ? 'Evento aggiornato.' : 'Evento creato.'); }
      else { await submitRecurring(); showToast('success', editingSeries ? 'Serie aggiornata.' : 'Serie creata.'); }
      resetForms(); setFormOpen(false); await refreshAll();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Salvataggio fallito.');
    } finally { setSaving(false); }
  };

  const handleCardQuickPatch = async (card: ScheduleCard, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/dev/schedule/cards/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast('error', safeErrorMessage(data, 'Aggiornamento fallito.')); return; }
      await loadCards();
    } catch { showToast('error', 'Errore rete.'); }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const endpoint = pendingDelete.type === 'card'
      ? `/api/dev/schedule/cards/${pendingDelete.id}${pendingDelete.hard ? '?hard=true' : ''}`
      : `/api/dev/schedule/series/${pendingDelete.id}${pendingDelete.hard ? '?hard=true' : ''}`;
    try {
      const res = await fetch(endpoint, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast('error', safeErrorMessage(data, 'Eliminazione fallita.')); return; }
      showToast('success', pendingDelete.hard ? 'Eliminato.' : 'Disattivato.');
      setPendingDelete(null); resetForms(); setFormOpen(false); await refreshAll();
    } catch { showToast('error', 'Errore rete.'); }
  };

  const startEditCard = (card: ScheduleCard) => {
    setCreateMode('single'); setEditingSeries(null); setEditingCard(card);
    setSingleState({
      format_id: card.format_id, label: card.label ?? '', access: card.access,
      cover_override_url: card.cover_override_url ?? '', status: card.status, is_active: card.is_active,
      start_at_local: isoToInputValue(card.start_at),
      duration_minutes: String(card.duration_minutes ?? 60),
    });
    setFormOpen(true);
  };

  const startEditSeries = (item: ScheduleSeries) => {
    setCreateMode('recurring'); setEditingCard(null); setEditingSeries(item); setSeriesScope('all'); setEffectiveFromLocal('');
    let parsedFreq: RRuleFreq = 'WEEKLY', parsedInterval = 1, parsedByday: ByDay[] = ['MO', 'WE', 'FR'];
    try {
      const parsed = item.rrule || 'FREQ=WEEKLY';
      const value = parsed.split(';').reduce<Record<string, string>>((acc, piece) => {
        const [k, v] = piece.split('='); if (k && v) acc[k.toUpperCase()] = v; return acc;
      }, {});
      if (value.FREQ === 'DAILY' || value.FREQ === 'WEEKLY' || value.FREQ === 'MONTHLY') parsedFreq = value.FREQ;
      if (value.INTERVAL) parsedInterval = Math.max(1, Number(value.INTERVAL));
      if (value.BYDAY) {
        const days = value.BYDAY.split(',').filter(day => BYDAY_OPTIONS.some(opt => opt.value === day)) as ByDay[];
        if (days.length > 0) parsedByday = days;
      }
    } catch { /* noop */ }
    setRecurringState({
      format_id: item.format_id, label: item.label ?? '', access: item.access,
      cover_override_url: item.cover_override_url ?? '', status: item.status, is_active: item.is_active,
      dtstart_local: (item.dtstart_local ?? '').slice(0, 16),
      freq: parsedFreq, interval: Number.isFinite(parsedInterval) ? parsedInterval : 1, byday: parsedByday,
      until_local: item.until_local ? item.until_local.slice(0, 10) : '',
      max_occurrences: item.max_occurrences ? String(item.max_occurrences) : '',
      duration_minutes: String(item.duration_minutes ?? 60),
    });
    setFormOpen(true);
  };

  const openExceptionModal = (card: ScheduleCard) => {
    if (!card.series_id) return;
    setExceptionTarget(card); setExceptionMode('skip');
    setExceptionOverrideStart(isoToInputValue(card.start_at));
    setExceptionOverrideLabel(card.label ?? '');
    setExceptionOverrideAccess(card.access);
    setExceptionOverrideCover(card.cover_override_url ?? '');
  };

  const submitException = async () => {
    if (!exceptionTarget || !exceptionTarget.series_id) return;
    const occurrenceLocal = utcIsoToRomeLocal(exceptionTarget.start_at);
    if (!occurrenceLocal) { showToast('error', 'Occorrenza invalida.'); return; }
    const payload: Record<string, unknown> = { occurrence_local: occurrenceLocal, action: exceptionMode };
    if (exceptionMode === 'override') {
      payload.override_start_local = `${exceptionOverrideStart}:00`;
      payload.override_label = exceptionOverrideLabel.trim() || null;
      payload.override_access = exceptionOverrideAccess;
      payload.override_cover_override_url = exceptionOverrideCover.trim() || null;
    }
    try {
      const res = await fetch(`/api/dev/schedule/series/${exceptionTarget.series_id}/exceptions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast('error', safeErrorMessage(data, 'Eccezione fallita.')); return; }
      showToast('success', 'Eccezione applicata.');
      setExceptionTarget(null); await loadCards(); await loadSeries();
    } catch { showToast('error', 'Errore rete eccezione.'); }
  };

  /* ==================================================================
     Rendering
     ================================================================== */

  const formMarkup = (
    <form onSubmit={handleSubmit} className="vstack" style={{ gap: 'var(--s4)' }}>
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <div className="inline-flex p-0.5 rounded-[var(--r)] bg-[color:var(--surface-2,var(--card-muted))] border border-[color:var(--hairline-soft)]">
          <button
            type="button"
            onClick={() => setCreateMode('single')}
            className={`px-3 h-8 text-[13px] font-medium rounded-[8px] inline-flex items-center gap-1.5 ${createMode === 'single' ? 'bg-[color:var(--card)] text-[color:var(--text-hi)] shadow-sm' : 'text-[color:var(--text-muted)]'}`}
          >
            <Calendar className="w-3.5 h-3.5" /> Singolo
          </button>
          <button
            type="button"
            onClick={() => setCreateMode('recurring')}
            className={`px-3 h-8 text-[13px] font-medium rounded-[8px] inline-flex items-center gap-1.5 ${createMode === 'recurring' ? 'bg-[color:var(--card)] text-[color:var(--text-hi)] shadow-sm' : 'text-[color:var(--text-muted)]'}`}
          >
            <Repeat className="w-3.5 h-3.5" /> Ricorrente
          </button>
        </div>
      </div>

      {/* Format */}
      <div>
        <label className="typ-micro block mb-1.5">Format *</label>
        <select
          value={createMode === 'single' ? singleState.format_id : recurringState.format_id}
          onChange={e => {
            if (createMode === 'single') setSingleState(p => ({ ...p, format_id: e.target.value }));
            else setRecurringState(p => ({ ...p, format_id: e.target.value }));
          }}
          disabled={formatsLoading || saving}
          className="input"
        >
          {formatOptions.length === 0 && <option value="">Nessun format</option>}
          {formatOptions.map(o => <option key={o.id} value={o.id}>{o.title || o.id}</option>)}
        </select>
      </div>

      {/* Label + cover override */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="typ-micro block mb-1.5">Label</label>
          <input
            type="text"
            value={createMode === 'single' ? singleState.label : recurringState.label}
            onChange={e => {
              if (createMode === 'single') setSingleState(p => ({ ...p, label: e.target.value }));
              else setRecurringState(p => ({ ...p, label: e.target.value }));
            }}
            className="input"
            placeholder="Es. Lunedì ore 20:30"
          />
        </div>
        <div>
          <label className="typ-micro block mb-1.5">Cover override URL</label>
          <input
            type="url"
            value={createMode === 'single' ? singleState.cover_override_url : recurringState.cover_override_url}
            onChange={e => {
              if (createMode === 'single') setSingleState(p => ({ ...p, cover_override_url: e.target.value }));
              else setRecurringState(p => ({ ...p, cover_override_url: e.target.value }));
            }}
            className="input"
            placeholder="https://..."
          />
        </div>
      </div>

      {/* Access + status + active */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="typ-micro block mb-1.5">Access</label>
          <select
            value={createMode === 'single' ? singleState.access : recurringState.access}
            onChange={e => {
              if (createMode === 'single') setSingleState(p => ({ ...p, access: e.target.value as ScheduleAccess }));
              else setRecurringState(p => ({ ...p, access: e.target.value as ScheduleAccess }));
            }}
            className="input"
          >
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>
        </div>
        <div>
          <label className="typ-micro block mb-1.5">Status</label>
          <select
            value={createMode === 'single' ? singleState.status : recurringState.status}
            onChange={e => {
              if (createMode === 'single') setSingleState(p => ({ ...p, status: e.target.value as ScheduleStatus }));
              else setRecurringState(p => ({ ...p, status: e.target.value as ScheduleStatus }));
            }}
            className="input"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 typ-body" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={createMode === 'single' ? singleState.is_active : recurringState.is_active}
            onChange={e => {
              if (createMode === 'single') setSingleState(p => ({ ...p, is_active: e.target.checked }));
              else setRecurringState(p => ({ ...p, is_active: e.target.checked }));
            }}
            style={{ width: 18, height: 18, accentColor: 'var(--accent-raw)' }}
          />
          Attivo
        </label>
      </div>

      {/* Single date OR Recurring fields */}
      {createMode === 'single' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="typ-micro block mb-1.5">Data / Ora (Europe/Rome) *</label>
            <input
              type="datetime-local" required
              value={singleState.start_at_local}
              onChange={e => setSingleState(p => ({ ...p, start_at_local: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="typ-micro block mb-1.5">Durata (min) *</label>
            <input
              type="number" min={1} max={1440} required
              value={singleState.duration_minutes}
              onChange={e => setSingleState(p => ({ ...p, duration_minutes: e.target.value }))}
              className="input"
              placeholder="60"
            />
          </div>
        </div>
      ) : (
        <div className="card card-body vstack" style={{ gap: 'var(--s4)', background: 'var(--card-muted)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="typ-micro block mb-1.5">Partenza (Europe/Rome) *</label>
              <input
                type="datetime-local" required
                value={recurringState.dtstart_local}
                onChange={e => setRecurringState(p => ({ ...p, dtstart_local: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Frequenza</label>
              <select
                value={recurringState.freq}
                onChange={e => setRecurringState(p => ({ ...p, freq: e.target.value as RRuleFreq }))}
                className="input"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="typ-micro block mb-1.5">Intervallo</label>
              <input
                type="number" min={1}
                value={recurringState.interval}
                onChange={e => setRecurringState(p => ({ ...p, interval: Math.max(1, Number(e.target.value) || 1) }))}
                className="input"
              />
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Durata (min) *</label>
              <input
                type="number" min={1} max={1440} required
                value={recurringState.duration_minutes}
                onChange={e => setRecurringState(p => ({ ...p, duration_minutes: e.target.value }))}
                className="input"
                placeholder="60"
              />
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Fine (data)</label>
              <input
                type="date"
                value={recurringState.until_local}
                onChange={e => setRecurringState(p => ({ ...p, until_local: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Max occorrenze</label>
              <input
                type="number" min={1}
                value={recurringState.max_occurrences}
                onChange={e => setRecurringState(p => ({ ...p, max_occurrences: e.target.value }))}
                className="input" placeholder="opzionale"
              />
            </div>
          </div>

          {recurringState.freq === 'WEEKLY' && (
            <div>
              <label className="typ-micro block mb-1.5">Giorni</label>
              <div className="flex flex-wrap gap-1.5">
                {BYDAY_OPTIONS.map(day => {
                  const active = recurringState.byday.includes(day.value);
                  return (
                    <button
                      key={day.value} type="button"
                      onClick={() => {
                        setRecurringState(p => {
                          const has = p.byday.includes(day.value);
                          return { ...p, byday: has ? p.byday.filter(d => d !== day.value) : [...p.byday, day.value] };
                        });
                      }}
                      className={active ? 'pill pill-accent' : 'pill'}
                      style={{ cursor: 'pointer', padding: '6px 10px' }}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {editingSeries && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 card card-body" style={{ background: 'var(--card)' }}>
              <div>
                <label className="typ-micro block mb-1.5">Ambito modifica</label>
                <select
                  value={seriesScope}
                  onChange={e => setSeriesScope(e.target.value as SeriesScope)}
                  className="input"
                >
                  <option value="all">Tutta la serie</option>
                  <option value="this_and_following">Questa e successive</option>
                </select>
              </div>
              {seriesScope === 'this_and_following' && (
                <div>
                  <label className="typ-micro block mb-1.5">Effetto da</label>
                  <input
                    type="datetime-local"
                    value={effectiveFromLocal}
                    onChange={e => setEffectiveFromLocal(e.target.value)}
                    className="input"
                  />
                </div>
              )}
            </div>
          )}

          <div className="card card-body" style={{ background: 'var(--card)' }}>
            <div className="inline-flex items-center gap-1.5 typ-micro mb-2">
              <WandSparkles className="w-3.5 h-3.5" />
              Prossime occorrenze (anteprima)
            </div>
            {previewOccurrences.length === 0 ? (
              <p className="typ-caption">Imposta ricorrenza per vedere le date.</p>
            ) : (
              <div className="vstack-tight typ-caption">
                {previewOccurrences.map(item => {
                  const iso = localRomeToUtcIso(item);
                  return <span key={item} className="typ-mono">{iso ? formatRomeDisplay(iso) : item}</span>;
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button type="button" onClick={() => { resetForms(); setFormOpen(false); }} className="btn btn-ghost">
          Annulla
        </button>
        <button type="submit" disabled={saving || formatsLoading} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          {saving ? 'Salvo…' : (editingCard || editingSeries) ? 'Aggiorna' : 'Crea'}
        </button>
      </div>
    </form>
  );

  // Count for tabs
  const selectedExists = editingCard || editingSeries;
  const formTitle = editingCard ? 'Modifica evento' : editingSeries ? 'Modifica serie' : 'Nuovo appuntamento';

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>

      {/* ========== Toolbar ========== */}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => { void loadFormats(); void refreshAll(); }}>
          <RefreshCw className="w-4 h-4" /> <span className="hidden md:inline">Ricarica</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(v => !v)}>
          <Filter className="w-4 h-4" />
          <span className="hidden md:inline">Filtri</span>
          {(statusFilter !== 'all' || activeFilter !== 'all' || formatFilter || fromDate || toDate) && <span className="dot dot-warn" />}
        </button>
        <div className="grow" />
        <button className="btn btn-primary btn-sm" onClick={openNewForm}>
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card card-body grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="typ-micro block mb-1">Status</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1); }} className="input">
              <option value="all">Tutti</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div>
            <label className="typ-micro block mb-1">Attivo</label>
            <select value={activeFilter} onChange={e => { setActiveFilter(e.target.value as ActiveFilter); setCurrentPage(1); }} className="input">
              <option value="all">Tutti</option>
              <option value="active">Attivo</option>
              <option value="inactive">Inattivo</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="typ-micro block mb-1">Format</label>
            <select value={formatFilter} onChange={e => { setFormatFilter(e.target.value); setCurrentPage(1); }} className="input">
              <option value="">Tutti</option>
              {formatOptions.map(o => <option key={o.id} value={o.id}>{o.title || o.id}</option>)}
            </select>
          </div>
          <div>
            <label className="typ-micro block mb-1">Da</label>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setCurrentPage(1); }} className="input" />
          </div>
          <div>
            <label className="typ-micro block mb-1">A</label>
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setCurrentPage(1); }} className="input" />
          </div>
        </div>
      )}

      {/* ========== Master/Detail layout ========== */}
      <div className="grid gap-4" style={{ gridTemplateColumns: isWide && formOpen ? 'minmax(360px, 480px) 1fr' : '1fr' }}>

        {/* Master: tabs + list */}
        <div className="vstack" style={{ gap: 'var(--s4)' }}>
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-[color:var(--hairline-soft)]">
            <button
              onClick={() => setMasterTab('cards')}
              className={`px-3 h-10 typ-label border-b-2 transition-colors ${masterTab === 'cards' ? 'border-[color:var(--accent-raw)] text-[color:var(--text-hi)]' : 'border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text-hi)]'}`}
            >
              Eventi ({totalCards})
            </button>
            <button
              onClick={() => setMasterTab('series')}
              className={`px-3 h-10 typ-label border-b-2 transition-colors ${masterTab === 'series' ? 'border-[color:var(--accent-raw)] text-[color:var(--text-hi)]' : 'border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text-hi)]'}`}
            >
              Serie ({series.length})
            </button>
          </div>

          {masterTab === 'cards' ? (
            cardsLoading ? (
              <div className="typ-caption text-center py-8">Carico…</div>
            ) : cards.length === 0 ? (
              <div className="card card-body text-center">
                <div className="typ-label">Nessun evento</div>
                <div className="typ-caption mt-1">Prova a rimuovere filtri o crea un nuovo appuntamento.</div>
              </div>
            ) : (
              <>
                <div className="vstack-tight">
                  {cards.map(card => {
                    const selected = editingCard?.id === card.id;
                    return (
                      <div
                        key={card.id}
                        onClick={() => startEditCard(card)}
                        className="card card-body card-hover"
                        style={{ cursor: 'pointer', borderColor: selected ? 'var(--accent-raw)' : 'var(--hairline-soft)', boxShadow: 'none' }}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={card.status === 'published' ? 'pill pill-ok' : 'pill pill-warn'}>
                            {card.status === 'published' ? 'Pubblicata' : 'Draft'}
                          </span>
                          {!card.is_active && <span className="pill">inattiva</span>}
                          <span className="pill">{card.access}</span>
                          {card.source_type === 'series' && <span className="pill pill-info"><Repeat className="w-3 h-3" />serie</span>}
                          <span className="typ-micro ml-auto">{card.source_type === 'series' ? 'da serie' : 'singolo'}</span>
                        </div>
                        <div className="typ-label mt-2" style={{ fontSize: 16 }}>
                          {card.format_title ?? card.format_id}
                          {card.label ? <span className="typ-caption"> · {card.label}</span> : null}
                        </div>
                        <div className="typ-caption mt-1 typ-mono">
                          <CalendarClock className="w-3 h-3 inline mr-1" />
                          {formatRomeDisplay(card.start_at)}
                        </div>
                        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-[color:var(--hairline-soft)] flex-wrap" onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEditCard(card)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => void handleCardQuickPatch(card, { status: card.status === 'draft' ? 'published' : 'draft' })}>
                            {card.status === 'draft' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => void handleCardQuickPatch(card, { is_active: !card.is_active })}>
                            {card.is_active ? 'Disattiva' : 'Attiva'}
                          </button>
                          {card.source_type === 'series' && card.series_id && (
                            <button className="btn btn-ghost btn-sm" onClick={() => openExceptionModal(card)} style={{ color: 'var(--warn)' }}>
                              Solo questa
                            </button>
                          )}
                          <div className="grow" />
                          <button className="btn btn-danger btn-sm" onClick={() => setPendingDelete({ type: 'card', id: card.id, hard: false, label: card.label ?? card.id })}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between typ-caption mt-2">
                    <span>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(totalCards, currentPage * PAGE_SIZE)} di {totalCards}</span>
                    <div className="flex items-center gap-2">
                      <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="btn btn-ghost btn-sm">Prec</button>
                      <span className="typ-mono">{currentPage}/{totalPages}</span>
                      <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="btn btn-ghost btn-sm">Succ</button>
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            // Series tab
            seriesLoading ? (
              <div className="typ-caption text-center py-8">Carico…</div>
            ) : series.length === 0 ? (
              <div className="card card-body text-center">
                <div className="typ-label">Nessuna serie</div>
                <div className="typ-caption mt-1">Crea una ricorrenza da &ldquo;+ Nuovo&rdquo; → Ricorrente.</div>
              </div>
            ) : (
              <div className="vstack-tight">
                {series.map(item => {
                  const selected = editingSeries?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => startEditSeries(item)}
                      className="card card-body card-hover"
                      style={{ cursor: 'pointer', borderColor: selected ? 'var(--accent-raw)' : 'var(--hairline-soft)', boxShadow: 'none' }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="pill pill-info"><Repeat className="w-3 h-3" />serie</span>
                        <span className={item.status === 'published' ? 'pill pill-ok' : 'pill pill-warn'}>
                          {item.status === 'published' ? 'Pubblicata' : 'Draft'}
                        </span>
                        {!item.is_active && <span className="pill">inattiva</span>}
                      </div>
                      <div className="typ-label mt-2" style={{ fontSize: 16 }}>
                        {item.format_title ?? item.format_id}
                        {item.label ? <span className="typ-caption"> · {item.label}</span> : null}
                      </div>
                      <div className="typ-caption mt-1 typ-mono">
                        {item.dtstart_local} · {item.rrule}
                      </div>
                      <div className="flex items-center gap-1 mt-3 pt-2 border-t border-[color:var(--hairline-soft)]" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEditSeries(item)}>
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <div className="grow" />
                        <button className="btn btn-danger btn-sm" onClick={() => setPendingDelete({ type: 'series', id: item.id, hard: false, label: item.label ?? item.id })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Detail/Form — wide only inline */}
        {isWide && formOpen && (
          <div className="card card-body" style={{ position: 'sticky', top: 80, alignSelf: 'start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-5 h-5 text-[color:var(--accent-raw)]" />
              <h2 className="typ-h1 grow">{formTitle}</h2>
              <button className="btn btn-quiet btn-icon btn-sm" onClick={closeForm} aria-label="Chiudi"><X className="w-4 h-4" /></button>
            </div>
            {formMarkup}
          </div>
        )}
      </div>

      {/* Form sheet — mobile only */}
      {!isWide && formOpen && (
        <>
          <div className="sheet-backdrop" onClick={closeForm} />
          <div className="sheet">
            <div className="sheet-grip" />
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-5 h-5 text-[color:var(--accent-raw)]" />
              <h2 className="typ-h1 grow">{formTitle}</h2>
              <button className="btn btn-quiet btn-icon btn-sm" onClick={closeForm} aria-label="Chiudi"><X className="w-4 h-4" /></button>
            </div>
            {formMarkup}
          </div>
        </>
      )}

      {/* Exception sheet */}
      {exceptionTarget && (
        <>
          <div className="sheet-backdrop" onClick={() => setExceptionTarget(null)} />
          <div className="sheet">
            <div className="sheet-grip" />
            <div className="flex items-center gap-2 mb-3">
              <h2 className="typ-h1 grow">Solo questa occorrenza</h2>
              <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setExceptionTarget(null)} aria-label="Chiudi"><X className="w-4 h-4" /></button>
            </div>
            <p className="typ-caption mb-4">
              Serie: <span className="typ-mono">{exceptionTarget.series_id?.slice(0, 8)}…</span> · Occorrenza: <span className="typ-mono">{formatRomeDisplay(exceptionTarget.start_at)}</span>
            </p>

            <div className="vstack" style={{ gap: 'var(--s4)' }}>
              <div className="inline-flex p-0.5 rounded-[var(--r)] bg-[color:var(--card-muted)] border border-[color:var(--hairline-soft)]">
                <button type="button" className={`px-3 h-8 text-[13px] font-medium rounded-[8px] ${exceptionMode === 'skip' ? 'bg-[color:var(--card)] text-[color:var(--text-hi)] shadow-sm' : 'text-[color:var(--text-muted)]'}`} onClick={() => setExceptionMode('skip')}>Skip</button>
                <button type="button" className={`px-3 h-8 text-[13px] font-medium rounded-[8px] ${exceptionMode === 'override' ? 'bg-[color:var(--card)] text-[color:var(--text-hi)] shadow-sm' : 'text-[color:var(--text-muted)]'}`} onClick={() => setExceptionMode('override')}>Override</button>
              </div>

              {exceptionMode === 'override' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="typ-micro block mb-1.5">Nuova data/ora</label>
                    <input type="datetime-local" value={exceptionOverrideStart} onChange={e => setExceptionOverrideStart(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="typ-micro block mb-1.5">Label</label>
                    <input type="text" value={exceptionOverrideLabel} onChange={e => setExceptionOverrideLabel(e.target.value)} className="input" placeholder="Override label" />
                  </div>
                  <div>
                    <label className="typ-micro block mb-1.5">Access</label>
                    <select value={exceptionOverrideAccess} onChange={e => setExceptionOverrideAccess(e.target.value as ScheduleAccess)} className="input">
                      <option value="bronze">Bronze</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold</option>
                    </select>
                  </div>
                  <div>
                    <label className="typ-micro block mb-1.5">Cover override URL</label>
                    <input type="url" value={exceptionOverrideCover} onChange={e => setExceptionOverrideCover(e.target.value)} className="input" placeholder="https://..." />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-ghost" onClick={() => setExceptionTarget(null)}>Annulla</button>
                <button className="btn btn-primary" onClick={() => void submitException()}>Applica</button>
              </div>
            </div>
          </div>
        </>
      )}

      <ModalConfirm
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { void handleDelete(); }}
        title={pendingDelete?.hard ? 'Elimina definitivamente' : 'Disattiva'}
        message={pendingDelete ? `Confermi azione su "${pendingDelete.label}"?` : ''}
        confirmLabel={pendingDelete?.hard ? 'Elimina' : 'Conferma'}
        cancelLabel="Annulla"
        variant={pendingDelete?.hard ? 'danger' : 'default'}
        isLoading={saving}
      />
    </div>
  );
}
