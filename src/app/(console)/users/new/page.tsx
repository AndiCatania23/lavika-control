'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { SectionHeader } from '@/components/SectionHeader';
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
      headers: {
        'Content-Type': 'application/json',
      },
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
      const { response, data } = await requestInvite({
        name: trimmedName,
        email: trimmedEmail,
      });

      if (response.status === 409 && data.code === 'user_exists') {
        setPendingInvite({ name: trimmedName, email: trimmedEmail });
        setShowResetModal(true);
        return;
      }

      if (!response.ok) {
        showToast('error', data.error ?? 'Invio invito non riuscito.');
        return;
      }

      showToast('success', `Invito inviato a ${trimmedEmail}.`);
      setName('');
      setEmail('');
      router.push('/users');
    } catch {
      showToast('error', 'Errore di rete durante l invio dell invito.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!pendingInvite || submitting) return;

    setSubmitting(true);

    try {
      const { response, data } = await requestInvite({
        name: pendingInvite.name,
        email: pendingInvite.email,
        sendResetIfExists: true,
      });

      if (!response.ok) {
        showToast('error', data.error ?? 'Invio reset password non riuscito.');
        return;
      }

      showToast('success', `Reset password inviato a ${pendingInvite.email}.`);
      setName('');
      setEmail('');
      setShowResetModal(false);
      setPendingInvite(null);
      router.push('/users');
    } catch {
      showToast('error', 'Errore di rete durante invio reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    if (submitting) return;
    setShowResetModal(false);
    setPendingInvite(null);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/users')}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna agli utenti
      </button>

      <SectionHeader
        title="Aggiungi utente"
        description="Invita un nuovo utente per l accesso all app pubblica lavikasport.app"
      />

      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <form onSubmit={handleInvite} className="mx-auto max-w-xl space-y-5">
          <div className="space-y-2">
            <label htmlFor="invite-name" className="text-sm font-medium text-foreground">
              Nome
            </label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome utente"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="invite-email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="utente@dominio.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
              disabled={submitting}
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Invio in corso...' : 'INVITA'}
            </button>
          </div>
        </form>
      </div>

      <ModalConfirm
        isOpen={showResetModal}
        onClose={handleCloseModal}
        onConfirm={handleConfirmReset}
        title="Utente gia registrato"
        message="Questo utente esiste gia. Vuoi inviare una mail di reset password?"
        confirmLabel="SI"
        cancelLabel="NO"
        isLoading={submitting}
      />
    </div>
  );
}
