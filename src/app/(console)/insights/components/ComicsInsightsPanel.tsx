import { comicMetricLabel, type ComicsInsights } from '@/lib/insights/comics';
import { seriesInfo } from '@/lib/comics/series';
export function ComicsInsightsPanel({ data }: { data: ComicsInsights }) {
  if (!data.available) return <p className="text-sm text-muted-foreground">Dati non disponibili: misurazione non attiva o errore di lettura. Non equivale a zero aperture.</p>;
  const total=data.rows.find(row=>row.kind==='total');
  const series=data.rows.filter(row=>row.kind==='series');
  const cards=data.rows.filter(row=>row.kind==='card').sort((a,b)=>b.opens-a.opens);
  const days=[...new Set(data.daily.map(row=>row.day))];
  const daily=new Map(data.daily.map(row=>[`${row.day}:${row.series}`,row.opens]));
  const date=(value:string)=>new Date(value).toLocaleString('it-IT',{timeZone:'Europe/Rome'});
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">Inizio rilevazione: {date(data.startedAt!)} · aggiornato al {date(data.generatedAt!)}. Nessuna ricostruzione storica.</p>
    <p className="text-sm">Solo utenti autenticati; aperture ospiti escluse.</p>
    {total&&<div className="grid grid-cols-2 gap-3">{[['Aperture totali',total.opens],['Utenti unici',total.unique_users]].map(([label,value])=><div key={label} className="rounded-lg bg-white/5 p-3"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-xl tabular-nums">{value}</strong></div>)}</div>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="py-2 text-left font-semibold">Serie e singoli episodi · totali dall’inizio rilevazione</caption><thead><tr><th className="p-2">Serie / episodio</th><th className="p-2">Aperture totali</th><th className="p-2">Utenti unici</th></tr></thead><tbody>{[...series,...cards].map(row=><tr key={`${row.kind}-${row.series}-${row.episode_id}`} className="border-t border-white/10"><th className="p-2 font-medium">{comicMetricLabel(row)}</th><td className="p-2 tabular-nums">{row.opens}</td><td className="p-2 tabular-nums">{row.unique_users}</td></tr>)}</tbody></table></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="py-2 text-left font-semibold">Andamento giornaliero · ultimi 30 giorni · Europe/Rome (oggi parziale)</caption><thead><tr><th className="p-2">Giorno</th>{series.map(row=><th key={row.series} className="p-2">{seriesInfo(row.series!).name}</th>)}<th className="p-2">Totale</th></tr></thead><tbody>{days.map(day=><tr key={day} className="border-t border-white/10"><th className="p-2 font-medium">{day}</th>{series.map(row=><td key={row.series} className="p-2 tabular-nums">{daily.get(`${day}:${row.series}`)??0}</td>)}<td className="p-2 tabular-nums">{series.reduce((sum,row)=>sum+(daily.get(`${day}:${row.series}`)??0),0)}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">Nuovi ingressi nella scheda, non impression o letture completate. Refresh, remount e retry non aumentano le aperture. Gli utenti unici delle singole card non sono sommabili. Raccolta best effort, senza stime degli eventi persi.</p>
  </div>;
}
