'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck } from 'lucide-react';

type Published = { id: string; full_name: string; position: string | null; resolved_shirt_number: number | null; shirt_number_verification_status: string | null; membership_status: string };
type Pending = { player_id: string; membership_status: string; consecutive_misses: number; players: { full_name: string; position: string | null; api_football_player_id: number | null } };
type Conflict = { id: string; player_id: string; proposed_value: unknown; review_note: string | null; players: { full_name: string }; player_data_sources: { provider: string; source_reference: string } };
type Run = { id: string; provider: string; status: string; observed_players: number; published_players: number; anomaly_count: number; started_at: string };

export default function RosterPage() {
  const [data, setData] = useState<{ published: Published[]; pending: Pending[]; conflicts: Conflict[]; runs: Run[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/roster', { cache: 'no-store' }); setData(await r.json()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const membershipAction = async (playerId: string, action: 'publish_membership' | 'reject_membership') => {
    const sourceReference = action === 'publish_membership'
      ? window.prompt('Incolla il link ufficiale che conferma il giocatore nel Catania:')?.trim()
      : undefined;
    if (action === 'publish_membership' && !sourceReference) return;
    setBusy(playerId);
    try {
      await fetch('/api/roster', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, action, sourceReference }) });
      await load();
    } finally { setBusy(null); }
  };

  if (loading && !data) return <div className="card card-body">Caricamento roster verificato…</div>;
  const latest = data?.runs[0];
  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="typ-h1">Roster affidabile</h1><p className="typ-caption mt-1">Dati pubblicati, conflitti e osservazioni provider. LAVIKA mostra solo valori approvati.</p></div>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw className="w-4 h-4" />Ricarica</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={ShieldCheck} label="Pubblicati" value={data?.published.length ?? 0} color="var(--ok)" />
        <Metric icon={Database} label="Da verificare" value={data?.pending.length ?? 0} color="var(--info)" />
        <Metric icon={AlertTriangle} label="Conflitti tracciati" value={data?.conflicts.length ?? 0} color="var(--warn)" />
        <Metric icon={CheckCircle2} label="Ultimo sync" value={latest?.status ?? '—'} color={latest?.status === 'failed' ? 'var(--danger)' : 'var(--ok)'} />
      </div>

      <section className="card card-body">
        <h2 className="typ-h2">Rosa pubblicata</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {(data?.published ?? []).map((player) => <div key={player.id} className="flex items-center gap-3 pill" style={{ padding: '8px 12px' }}>
            <strong style={{ width: 34, color: player.shirt_number_verification_status === 'verified' ? 'var(--ok)' : 'var(--warn)' }}>#{player.resolved_shirt_number ?? '—'}</strong>
            <div className="min-w-0"><div className="typ-label truncate">{player.full_name}</div><div className="typ-micro">{player.membership_status} · {player.shirt_number_verification_status ?? 'numero assente'}</div></div>
          </div>)}
        </div>
      </section>

      <section className="card card-body">
        <h2 className="typ-h2">Osservazioni non pubblicate</h2>
        <p className="typ-caption mt-1">Conferma solo dopo aver aperto una fonte ufficiale.</p>
        <div className="mt-3 vstack-tight">
          {(data?.pending ?? []).map((row) => <div key={row.player_id} className="flex items-center gap-3 flex-wrap" style={{ padding: 10, borderBottom: '1px solid var(--hairline-soft)' }}>
            <div className="grow"><div className="typ-label">{row.players.full_name}</div><div className="typ-micro">API #{row.players.api_football_player_id ?? '—'} · assenze consecutive {row.consecutive_misses}</div></div>
            <button disabled={busy === row.player_id} className="btn btn-ghost btn-sm" onClick={() => membershipAction(row.player_id, 'reject_membership')}>Rifiuta</button>
            <button disabled={busy === row.player_id} className="btn btn-primary btn-sm" onClick={() => membershipAction(row.player_id, 'publish_membership')}>Conferma</button>
          </div>)}
          {(data?.pending.length ?? 0) === 0 && <div className="typ-caption">Nessuna osservazione in attesa.</div>}
        </div>
      </section>

      <section className="card card-body">
        <h2 className="typ-h2">Conflitti neutralizzati</h2>
        <div className="mt-3 vstack-tight">{(data?.conflicts ?? []).map((row) => <div key={row.id} className="flex items-center gap-3" style={{ padding: 10, borderBottom: '1px solid var(--hairline-soft)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--warn)' }} /><div><div className="typ-label">{row.players.full_name}: provider propone {String(row.proposed_value)}</div><div className="typ-micro">{row.review_note} · {row.player_data_sources.provider}</div></div>
        </div>)}</div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, color }: { icon: typeof ShieldCheck; label: string; value: string | number; color: string }) {
  return <div className="card card-body"><Icon className="w-5 h-5" style={{ color }} /><div className="typ-h1 mt-2">{value}</div><div className="typ-caption">{label}</div></div>;
}
