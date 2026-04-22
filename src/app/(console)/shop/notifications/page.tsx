'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { useToast } from '@/lib/toast';
import { Plus, Trash2, Mail, ChevronLeft, Check, X } from 'lucide-react';

type NotificationEmail = {
  id: string;
  email: string;
  purpose: Purpose;
  enabled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type Purpose = 'new_order' | 'refund' | 'low_stock' | 'daily_summary' | 'generic';

const PURPOSE_LABELS: Record<Purpose, string> = {
  new_order: 'Nuovo ordine',
  refund: 'Refund',
  low_stock: 'Scorta bassa',
  daily_summary: 'Riepilogo giornaliero',
  generic: 'Generico',
};

const PURPOSE_OPTIONS: Purpose[] = ['new_order', 'refund', 'low_stock', 'daily_summary', 'generic'];

export default function ShopNotificationsPage() {
  const [rows, setRows] = useState<NotificationEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newPurpose, setNewPurpose] = useState<Purpose>('new_order');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev/shop/notifications', { cache: 'no-store' });
      if (!res.ok) throw new Error('Errore caricamento');
      const data = (await res.json()) as NotificationEmail[];
      setRows(data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async () => {
    const email = newEmail.trim();
    if (!email) {
      showToast('error', 'Email obbligatoria');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      showToast('error', 'Formato email non valido');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/dev/shop/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          purpose: newPurpose,
          enabled: true,
          note: newNote.trim() || null,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Errore salvataggio');
      }
      setNewEmail('');
      setNewNote('');
      setNewPurpose('new_order');
      showToast('success', 'Email aggiunta');
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/dev/shop/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error('Errore aggiornamento');
      setRows((current) => current.map((r) => (r.id === id ? { ...r, enabled } : r)));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore');
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!window.confirm(`Rimuovere ${email} dalle notifiche?`)) return;
    try {
      const res = await fetch(`/api/dev/shop/notifications?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Errore eliminazione');
      setRows((current) => current.filter((r) => r.id !== id));
      showToast('success', 'Rimossa');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore');
    }
  };

  const grouped = PURPOSE_OPTIONS.map((p) => ({
    purpose: p,
    rows: rows.filter((r) => r.purpose === p),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/shop"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Shop
        </Link>
        <SectionHeader
          title="Notifiche email"
          description="Indirizzi che ricevono le mail automatiche shop (nuovo ordine, refund, scorta bassa). Solo UI — i senders email verranno collegati dopo."
        />
      </div>

      {/* Add form */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus className="h-4 w-4" />
          Aggiungi destinatario
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_1fr_auto] md:items-end">
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nome@dominio.it"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Tipo</span>
            <select
              value={newPurpose}
              onChange={(e) => setNewPurpose(e.target.value as Purpose)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40"
            >
              {PURPOSE_OPTIONS.map((p) => (
                <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Nota (opzionale)</span>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="es. contabilita, magazzino, cc owner"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvo…' : 'Aggiungi'}
          </button>
        </div>
      </section>

      {/* List grouped by purpose */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carico…</p>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nessun destinatario configurato. Aggiungi la prima email sopra.
          </p>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.purpose} className="rounded-xl border border-border bg-card">
            <header className="border-b border-border px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {PURPOSE_LABELS[group.purpose]} · {group.rows.length}
              </h3>
            </header>
            <ul className="divide-y divide-border">
              {group.rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                  <Mail className={`h-4 w-4 shrink-0 ${row.enabled ? 'text-foreground' : 'text-muted-foreground/40'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${row.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                      {row.email}
                    </p>
                    {row.note ? (
                      <p className="truncate text-xs text-muted-foreground">{row.note}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggle(row.id, !row.enabled)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      row.enabled
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                    aria-label={row.enabled ? 'Disattiva' : 'Attiva'}
                  >
                    {row.enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {row.enabled ? 'Attiva' : 'Off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(row.id, row.email)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                    aria-label="Rimuovi"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
