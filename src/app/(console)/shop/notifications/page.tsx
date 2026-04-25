'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/lib/toast';
import { Plus, Trash2, Mail, ChevronLeft, Check, X } from 'lucide-react';

type Purpose = 'new_order' | 'refund' | 'low_stock' | 'daily_summary' | 'generic';

type NotificationEmail = {
  id: string;
  email: string;
  purpose: Purpose;
  enabled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

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
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleAdd = async () => {
    const email = newEmail.trim();
    if (!email) { showToast('error', 'Email obbligatoria'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('error', 'Formato email non valido'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/dev/shop/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: newPurpose, enabled: true, note: newNote.trim() || null }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Errore salvataggio');
      }
      setNewEmail(''); setNewNote(''); setNewPurpose('new_order');
      showToast('success', 'Email aggiunta');
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore salvataggio');
    } finally { setSaving(false); }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/dev/shop/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error('Errore aggiornamento');
      setRows(current => current.map(r => r.id === id ? { ...r, enabled } : r));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore');
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!window.confirm(`Rimuovere ${email} dalle notifiche?`)) return;
    try {
      const res = await fetch(`/api/dev/shop/notifications?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore eliminazione');
      setRows(current => current.filter(r => r.id !== id));
      showToast('success', 'Rimossa');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore');
    }
  };

  const grouped = PURPOSE_OPTIONS.map(p => ({
    purpose: p, rows: rows.filter(r => r.purpose === p),
  })).filter(g => g.rows.length > 0);

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      <Link href="/shop" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ChevronLeft className="w-4 h-4" /> Shop
      </Link>

      {/* Add form */}
      <div className="card card-body">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4" style={{ color: 'var(--accent-raw)' }} strokeWidth={1.75} />
          <h3 className="typ-h2">Aggiungi destinatario</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_1fr_auto] gap-3 md:items-end">
          <div>
            <label className="typ-micro block mb-1.5">Email</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="nome@dominio.it" className="input" />
          </div>
          <div>
            <label className="typ-micro block mb-1.5">Tipo</label>
            <select value={newPurpose} onChange={e => setNewPurpose(e.target.value as Purpose)} className="input">
              {PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="typ-micro block mb-1.5">Nota (opzionale)</label>
            <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="es. contabilità, magazzino, cc owner" className="input" />
          </div>
          <button type="button" onClick={() => void handleAdd()} disabled={saving} className="btn btn-primary">
            {saving ? 'Salvo…' : 'Aggiungi'}
          </button>
        </div>
      </div>

      {/* List grouped by purpose */}
      {loading ? (
        <div className="typ-caption text-center py-6">Carico…</div>
      ) : grouped.length === 0 ? (
        <div className="card card-body text-center">
          <Mail className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-caption">Nessun destinatario configurato. Aggiungi la prima email sopra.</p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.purpose} className="card" style={{ overflow: 'hidden' }}>
            <div className="card-head">
              <span className="typ-micro">{PURPOSE_LABELS[group.purpose]} · {group.rows.length}</span>
            </div>
            <div>
              {group.rows.map(row => (
                <div key={row.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                  <Mail className="w-4 h-4 shrink-0" style={{ color: row.enabled ? 'var(--text-hi)' : 'var(--text-muted)', opacity: row.enabled ? 1 : 0.4 }} />
                  <div className="min-w-0 grow">
                    <div className="typ-label truncate" style={{ textDecoration: row.enabled ? 'none' : 'line-through', color: row.enabled ? 'var(--text-hi)' : 'var(--text-muted)' }}>
                      {row.email}
                    </div>
                    {row.note && <div className="typ-caption truncate">{row.note}</div>}
                  </div>
                  <button
                    onClick={() => void handleToggle(row.id, !row.enabled)}
                    className={row.enabled ? 'pill pill-ok' : 'pill'}
                    style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 11 }}
                    aria-label={row.enabled ? 'Disattiva' : 'Attiva'}
                  >
                    {row.enabled ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {row.enabled ? 'Attiva' : 'Off'}
                  </button>
                  <button
                    onClick={() => void handleDelete(row.id, row.email)}
                    className="btn btn-ghost btn-sm btn-icon"
                    style={{ color: 'var(--danger)' }}
                    aria-label="Rimuovi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
