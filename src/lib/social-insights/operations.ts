import { comparePost, priorityScore, sortByPriority } from './analytics';
import { contentCanBeReused } from './classification';
import type { ConfidenceLevel, ContentType, PriorityCandidate, SocialPostMetric } from './types';

export type OperationalStatus = 'done' | 'ready' | 'needs_approval' | 'scheduled' | 'waiting_trigger' | 'suggested' | 'blocked' | 'skipped';

export interface EditorialSource {
  id: string;
  type: 'pill' | 'episode';
  title: string;
  publishedAt: string | null;
  imageUrl: string | null;
  contentType: ContentType;
  alreadyDrafted: boolean;
}

export interface UpcomingMatch {
  id: string;
  label: string;
  kickoffAt: string;
  status: string;
}

export interface OperationalAction extends PriorityCandidate {
  title: string;
  summary: string;
  status: OperationalStatus;
  timingLabel: string;
  actionLabel: string;
  href: string;
  sourceType?: 'pill' | 'episode' | 'draft' | 'match';
  sourceId?: string;
}

export interface SocialOpportunity {
  id: string;
  title: string;
  summary: string;
  evidence: string[];
  confidence: ConfidenceLevel;
  sampleSize: number;
  actionLabel: string;
  href: string;
  score: number;
}

export function buildTodayContext(args: { match: UpcomingMatch | null; sources: EditorialSource[]; now?: Date }) {
  const now = args.now ?? new Date();
  if (args.match) {
    const hours = (new Date(args.match.kickoffAt).getTime() - now.getTime()) / 3_600_000;
    if (hours >= 0 && hours <= 30) {
      const when = hours <= 12 ? 'oggi' : 'domani';
      return {
        subtitle: `${args.match.label} ${when}. Priorità alla copertura pre-partita.`,
        objective: 'Aumentare l’attenzione pre-partita e portare i tifosi verso le funzioni match di LÀVIKA.',
      };
    }
  }
  const latest = args.sources.find((source) => !source.alreadyDrafted);
  if (latest) {
    return { subtitle: `Nuovo contenuto disponibile: ${latest.title}`, objective: 'Trasformare il contenuto editoriale più recente in un’azione social utile, senza duplicare ciò che è già pronto.' };
  }
  return { subtitle: 'Nessun evento ad alta priorità nelle prossime ore.', objective: 'Mantenere continuità editoriale senza saturare il feed.' };
}

export function buildTodayActions(args: { sources: EditorialSource[]; approvalDrafts: Array<{ id: string; title: string }>; match: UpcomingMatch | null }): OperationalAction[] {
  const actions: OperationalAction[] = [];
  for (const draft of args.approvalDrafts.slice(0, 3)) {
    actions.push({ id: `approve-${draft.id}`, title: draft.title, summary: 'Pacchetto pronto: controlla caption e asset prima della pubblicazione.', status: 'needs_approval', timingLabel: 'ORA', actionLabel: 'VEDI', href: `/social/composer/draft/${draft.id}`, sourceType: 'draft', sourceId: draft.id, editorialRelevance: 90, timeUrgency: 90, audienceInterest: 65, historicalPerformance: 50, appConversionPotential: 55, strategicImportance: 85, saturationPenalty: 0 });
  }
  for (const source of args.sources.filter((item) => !item.alreadyDrafted).slice(0, 4)) {
    actions.push({ id: `source-${source.type}-${source.id}`, title: source.title, summary: source.type === 'pill' ? 'Pill disponibile e non ancora trasformata in pacchetto social.' : 'Episodio disponibile e non ancora trasformato in pacchetto social.', status: 'ready', timingLabel: 'OGGI', actionLabel: 'GENERA', href: `/social/composer?${source.type === 'pill' ? 'pill_id' : 'episode_id'}=${encodeURIComponent(source.id)}`, sourceType: source.type, sourceId: source.id, editorialRelevance: 75, timeUrgency: 65, audienceInterest: 60, historicalPerformance: 50, appConversionPotential: 80, strategicImportance: 70, saturationPenalty: 0 });
  }
  if (args.match) {
    actions.push({ id: `match-${args.match.id}`, title: `Prepara la copertura di ${args.match.label}`, summary: 'Il match è rilevato dal calendario. La generazione diretta da match non è ancora disponibile: prepara prima la fonte editoriale.', status: 'suggested', timingLabel: 'PRIMA DEL MATCH', actionLabel: 'APRI PILLS', href: '/pills', sourceType: 'match', sourceId: args.match.id, editorialRelevance: 95, timeUrgency: 85, audienceInterest: 85, historicalPerformance: 65, appConversionPotential: 85, strategicImportance: 90, saturationPenalty: 0 });
  }
  return sortByPriority(actions).slice(0, 5);
}

export function detectOpportunities(posts: SocialPostMetric[], sourceLinks: Map<string, { type: 'pill' | 'episode'; id: string }>, now = new Date()): SocialOpportunity[] {
  const opportunities: SocialOpportunity[] = [];
  for (const post of posts) {
    const comparison = comparePost(post, posts);
    if (!comparison.comparable || comparison.reachVsMedian == null || comparison.reachVsMedian < 1.5) continue;
    const type = post.contentType ?? 'unknown';
    const reusable = contentCanBeReused(type, post.publishedAt, now);
    const link = sourceLinks.get(post.id);
    const multiplier = comparison.reachVsMedian.toLocaleString('it-IT', { maximumFractionDigits: 1 });
    opportunities.push({
      id: post.id,
      title: (post.caption ?? 'Contenuto ad alta performance').slice(0, 90),
      summary: reusable ? 'Sfrutta il momentum con un contenuto complementare, non con una copia identica.' : 'La notizia non è più fresca: crea un seguito aggiornato, non ripubblicare il contenuto.',
      evidence: [`Reach ${multiplier}× rispetto alla mediana di post con maturità confrontabile`, `Finestra ${comparison.maturity}`],
      confidence: comparison.confidence,
      sampleSize: comparison.sampleSize,
      actionLabel: link ? 'CREA FOLLOW-UP' : 'VEDI CONTENUTO',
      href: link ? `/social/composer?${link.type === 'pill' ? 'pill_id' : 'episode_id'}=${encodeURIComponent(link.id)}` : '#',
      score: Math.min(100, Math.round(comparison.reachVsMedian * 25 + comparison.sampleSize)),
    });
  }
  return opportunities.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function actionPriority(action: OperationalAction) {
  return priorityScore(action);
}
