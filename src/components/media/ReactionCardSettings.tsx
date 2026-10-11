'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { uploadFile } from '@/lib/mediaUpload';
import { MediaPicker } from '@/components/media/MediaPicker';

type Speaker = { id: string; full_name: string; match_reaction_card_url: string | null };
type Cards = { speakers: Speaker[]; genericUrl: string | null };

export function ReactionCardSettings({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<Cards | null>(null);
  const [speakerId, setSpeakerId] = useState('');
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function show() {
    setOpen(true); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/media/reaction-cards');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Caricamento fallito');
      setCards(data); setSpeakerId(''); setDraftUrl(data.genericUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Caricamento fallito'); }
    finally { setBusy(false); }
  }

  function selectSpeaker(id: string) {
    setSpeakerId(id); setMessage('');
    setDraftUrl(id ? cards?.speakers.find(speaker => speaker.id === id)?.match_reaction_card_url ?? null : cards?.genericUrl ?? null);
  }

  async function upload(file: File) {
    setBusy(true); setMessage('');
    try { setDraftUrl(await uploadFile(file, 'library-upload', {})); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Upload fallito'); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Accedi nuovamente a Control per salvare.');
      const response = await fetch('/api/media/reaction-cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ speakerId: speakerId || null, url: draftUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Salvataggio fallito');
      setCards(current => current ? speakerId
        ? { ...current, speakers: current.speakers.map(speaker => speaker.id === speakerId ? { ...speaker, match_reaction_card_url: draftUrl } : speaker) }
        : { ...current, genericUrl: draftUrl } : current);
      setMessage(data.appRefreshed ? 'Card salvata. Aggiornate le interviste esistenti e l’app.' : 'Card salvata. La cache dell’app si aggiornerà automaticamente fra qualche minuto.');
      onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Salvataggio fallito'); }
    finally { setBusy(false); }
  }

  return (
    <section className="card card-body vstack-tight">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="typ-label">Card Match Reaction</h2><p className="typ-caption">Gestisci la generica e le card dei relatori, per le interviste passate e future.</p></div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-expanded={open} onClick={() => open ? setOpen(false) : void show()}>{open ? 'Chiudi' : 'Gestisci card'}</button>
      </div>
      {open && cards && <div className="grid gap-3 sm:grid-cols-2">
        <div className="vstack-tight">
          <label htmlFor="reaction-card-speaker" className="typ-label">Relatore</label>
          <select id="reaction-card-speaker" className="input w-full" value={speakerId} disabled={busy} onChange={event => selectSpeaker(event.target.value)}>
            <option value="">Card generica · relatore senza card</option>
            {cards.speakers.map(speaker => <option key={speaker.id} value={speaker.id}>{speaker.full_name}{speaker.match_reaction_card_url ? ' · card dedicata' : ''}</option>)}
          </select>
          <p className="typ-caption">Le card specifiche scelte sui singoli episodi hanno sempre la precedenza.</p>
          {speakerId && !draftUrl && <p className="typ-caption">Questo relatore usa la card generica.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>Carica immagine</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPickerOpen(true)}>Libreria</button>
            {speakerId && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !draftUrl} onClick={() => setDraftUrl(null)}>Usa generica</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || (!speakerId && !draftUrl)} onClick={() => void save()}>{busy ? 'Attendi…' : 'Salva card'}</button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Carica card" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
        </div>
        {(draftUrl || cards.genericUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draftUrl || cards.genericUrl || ''} alt="Anteprima card selezionata" className="w-full aspect-video object-cover rounded-[var(--r)]" />
        )}
      </div>}
      {open && message && <p role="status" className="typ-caption">{message}</p>}
      {pickerOpen && <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={url => { setDraftUrl(url); setPickerOpen(false); }} />}
    </section>
  );
}
