import type { RetentionIntegrity } from '@/lib/insights/queries';

const formatDate = (date: string) => new Date(date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });

export function RetentionIntegrityPanel({ data }: { data: RetentionIntegrity | null }) {
  if (!data) return <p role="status" className="rounded-xl border border-amber-500/30 p-4 text-sm text-[color:var(--warn)]">Retention non disponibile: errore di lettura. Non interpretare come zero.</p>;
  const metrics = [
    { label: 'D7 App Return · exact', count: data.appD7, detail: 'Evento o sessione osservata nel giorno D0+7.' },
    { label: 'D7 Core Action · exact', count: data.coreD7, detail: 'Una core action nel giorno D0+7.' },
    { label: 'Returned D1–D7 · App', count: data.appWeek1, detail: 'W1 Return: almeno una presenza nei giorni 1–7 inclusi.' },
    { label: 'Returned D1–D7 · Core', count: data.coreWeek1, detail: 'Almeno una core action nei giorni 1–7 inclusi.' },
  ];
  return (
    <section className="space-y-3" aria-label="Retention exact e ritorno nella settimana">
      <h2 className="text-base font-semibold">Ritorno: giorno esatto e prima settimana</h2>
      <p className="text-xs text-muted-foreground">Coorti di iscrizione dal 22 agosto · Europe/Rome · giorno 7 concluso. Le metriche exact non significano “entro sette giorni”.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <article key={metric.label} className="rounded-xl border border-[color:var(--hairline)] bg-card p-4">
            <h3 className="text-xs font-medium">{metric.label}</h3>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{data.eligible ? `${Math.round(metric.count / data.eligible * 1000) / 10}%` : 'n/d'}</p>
            <p className="text-xs text-muted-foreground">{metric.count}/{data.eligible} eleggibili</p>
            <p className="mt-2 text-xs text-muted-foreground">{metric.detail}</p>
          </article>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Core: apertura Pill/Partita, primo pronostico per partita o avvio Video deduplicato. App include anche una presenza di sessione senza core action.</p>
      <p className="text-xs text-[color:var(--warn)]">Presenza giornaliera persistente dal {data.observedFrom ? formatDate(data.observedFrom) : 'n/d'}. Per le coorti precedenti, App Return è un minimo osservabile: gli heartbeat storici sovrascritti non sono ricostruibili.</p>
      <p className="text-xs text-muted-foreground">{data.certifiedAt ? `Nuova baseline certificata dal ${formatDate(data.certifiedAt)}. Lo storico rimane disponibile.` : 'Certificazione in corso: la nuova baseline non è ancora avviata.'}</p>
    </section>
  );
}
