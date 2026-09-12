import type { IntegrityBaseline } from '@/lib/insights/queries';

export function IntegrityBaselinePanel({ data }: { data: IntegrityBaseline | null }) {
  if (!data?.certified_at) return null;
  const ratio = (n: number, d: number) => d ? `${n}/${d} · ${Math.round(n / d * 1000) / 10}%` : 'n/d · campione non maturato';
  const items = [
    ['Acquisition', `${data.acquired} nuovi account`],
    ['Activation D0 · Core', ratio(data.activated_d0, data.activation_eligible)],
    ['W1 Return · App D1–D7', ratio(data.w1_returned, data.w1_eligible)],
    ['WAU/MAU · registrati', ratio(data.wau, data.mau)],
  ];
  return <section className="space-y-3 rounded-xl border border-blue-400/30 p-4" aria-label="Nuova baseline analitica">
    <h2 className="text-base font-semibold">Nuova baseline · dal {new Date(data.certified_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</h2>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map(([label,value])=><div key={label}>
      <h3 className="text-xs text-muted-foreground">{label}</h3><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>)}</div>
    <p className="text-xs text-muted-foreground">Acquisition/Activation/W1: solo iscritti dalla certificazione. Activation: prima core action in D0, giorno concluso. W1: ritorno App nei giorni 1–7, giorno 7 concluso.</p>
    <p className="text-xs text-muted-foreground">WAU/MAU: tutti gli account registrati osservati dopo la certificazione, nelle ultime 168/720 ore. {data.windows_complete ? 'Finestre complete.' : 'Finestre parziali: raccolta da meno di 30 giorni.'}</p>
    <p className="text-xs text-muted-foreground">Next Matchday Retention: non ancora calcolata. Lo storico e l’uso delle funzioni restano nelle sezioni seguenti.</p>
  </section>;
}
