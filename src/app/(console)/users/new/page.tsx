'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, UserPlus } from 'lucide-react';
import { ModalConfirm } from '@/components/ModalConfirm';
import { useToast } from '@/lib/toast';

interface InviteResponse {
  error?: string;
  code?: string;
  mode?: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ name: string; email: string } | null>(null);

  const requestInvite = async (payload: { name: string; email: string; sendResetIfExists?: boolean }) => {
    const response = await fetch('/api/dev/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({})) as InviteResponse;
    return { response, data };
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName || !trimmedEmail) {
      showToast('warning', 'Compila nome e email prima di invitare.');
      return;
    }
    setSubmitting(true);
    try {
      const { response, data } = await requestInvite({ name: trimmedName, email: trimmedEmail });
      if (response.status === 409 && data.code === 'user_exists') {
        setPendingInvite({ name: trimmedName, email: trimmedEmail });
        setShowResetModal(true);
        return;
      }
      if (!response.ok) {
        showToast('error', data.error ?? 'Invio invito non riuscito.');
        return;
      }
      if (data.mode === 'invited') {
        showToast('success', `Invito inviato a ${trimmedEmail}.`);
      } else {
        showToast('success', `Invio completato per ${trimmedEmail}.`);
      }
      setName(''); setEmail('');
      router.push('/users');
    } catch {
      showToast('error', 'Errore di rete durante l\'invio dell\'invito.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!pendingInvite || submitting) return;
    setSubmitting(true);
    try {
      const { response, data } = await requestInvite({ name: pendingInvite.name, email: pendingInvite.email, sendResetIfExists: true });
      if (!response.ok) { showToast('error', data.error ?? 'Invio reset password non riuscito.'); return; }
      showToast('success', `Reset password inviato a ${pendingInvite.email}.`);
      setName(''); setEmail('');
      setShowResetModal(false); setPendingInvite(null);
      router.push('/users');
    } catch {
      showToast('error', 'Errore di rete durante invio reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <button onClick={() => router.push('/users')} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft className="w-4 h-4" /> Torna agli utenti
      </button>

      <div>
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h1 className="typ-h1">Aggiungi utente</h1>
        </div>
        <p className="typ-caption mt-1">Invita un nuovo utente per l&apos;accesso all&apos;app lavikasport.app.</p>
      </div>

      <div className="card card-body" style={{ maxWidth: 560 }}>
        <form onSubmit={handleInvite} className="vstack" style={{ gap: 'var(--s4)' }}>
          <div>
            <label htmlFor="invite-name" className="typ-micro block mb-1.5">Nome *</label>
            <input
              id="invite-name" type="text"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Nome utente"
              className="input"
              disabled={submitting} required
            />
          </div>

          <div>
            <label htmlFor="invite-email" className="typ-micro block mb-1.5">Email *</label>
            <input
              id="invite-email" type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="utente@dominio.com"
              className="input"
              disabled={submitting} required
            />
          </div>

          <div className="pt-1">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              <Send className="w-4 h-4" />
              {submitting ? 'Invio in corso…' : 'Invita'}
            </button>
          </div>
        </form>
      </div>

      <ModalConfirm
        isOpen={showResetModal}
        onClose={() => { if (!submitting) { setShowResetModal(false); setPendingInvite(null); } }}
        onConfirm={handleConfirmReset}
        title="Utente già registrato"
        message="Questo utente esiste già. Vuoi inviare una mail di reset password?"
        confirmLabel="Sì, invia reset"
        cancelLabel="Annulla"
        isLoading={submitting}
      />
    </div>
  );
}
