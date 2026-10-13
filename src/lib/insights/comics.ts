import { seriesInfo } from '@/lib/comics/series';
export type ComicsMetric = { kind: 'total'|'series'|'card'; episode_id: string|null; series: number|null; episode_number: number|null; title: string|null; opens: number; unique_users: number };
export type ComicsDay = { day: string; series: number; opens: number };
export type ComicsInsights = { available: boolean; startedAt: string|null; generatedAt: string|null; rows: ComicsMetric[]; daily: ComicsDay[] };
export const unavailableComics: ComicsInsights = { available:false, startedAt:null, generatedAt:null, rows:[], daily:[] };
export function comicMetricLabel(row: ComicsMetric) {
  return row.kind==='total' ? 'LAVIKA Comics' : `${seriesInfo(row.series!).name}${row.kind==='card' ? ` #${String(row.episode_number).padStart(3,'0')} — ${row.title}` : ''}`;
}
export function comicsReport(data: ComicsInsights): string[] {
  const lines=['','## LAVIKA Comics — aperture schede'];
  if (!data.available) return [...lines,'- Dati non disponibili: misurazione non attiva o errore di lettura, non zero.'];
  lines.push(`- Inizio rilevazione: ${data.startedAt}. Totali dall’inizio al ${data.generatedAt}.`,
    '- Solo utenti autenticati; aperture ospiti escluse. Nessuna ricostruzione storica.',
    '- Una nuova apertura dopo uscita dalla scheda conta nuovamente; retry, remount, refresh e ritorno in foreground non aggiungono aperture.');
  for (const row of data.rows) lines.push(`- ${comicMetricLabel(row)}: ${row.opens} aperture totali / ${row.unique_users} utenti unici.`);
  lines.push('### Andamento giornaliero — ultimi 30 giorni, Europe/Rome (oggi parziale)');
  for (const row of data.daily) lines.push(`- ${row.day} · ${seriesInfo(row.series).name}: ${row.opens} aperture.`);
  lines.push('- Utenti unici calcolati separatamente: non sommare quelli delle singole card. Tracking best effort: eventi persi offline o con storage non disponibile non vengono stimati.');
  return lines;
}
