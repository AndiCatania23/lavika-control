import type { EditorialSource, UpcomingMatch } from './operations';

export type EditorialTriggerType =
  | 'MATCH_MINUS_24H' | 'MATCH_MINUS_3H' | 'MATCH_STARTED' | 'HALFTIME' | 'MATCH_ENDED'
  | 'NEW_PILL' | 'NEW_EPISODE' | 'NEW_PRESS_CONFERENCE' | 'FANTASY_DEADLINE';
export type AutomationLevel = 'manual' | 'generate' | 'approval' | 'auto';

export interface EditorialTrigger {
  id: string;
  type: EditorialTriggerType;
  sourceType: 'match' | 'pill' | 'episode' | 'fantasy';
  sourceId?: string;
  title: string;
  expectedAt?: string;
  detectedAt: string;
  priority: number;
  automationLevel: AutomationLevel;
  status: 'ready' | 'waiting_trigger' | 'suggested' | 'blocked';
  actionLabel?: string;
  href?: string;
}

function matchTrigger(match: UpcomingMatch, type: EditorialTriggerType, title: string, expectedAt: Date, priority: number, status: EditorialTrigger['status']): EditorialTrigger {
  return { id: `${type}-${match.id}`, type, sourceType: type === 'FANTASY_DEADLINE' ? 'fantasy' : 'match', sourceId: match.id, title, expectedAt: expectedAt.toISOString(), detectedAt: new Date().toISOString(), priority, automationLevel: 'approval', status, actionLabel: status === 'ready' ? 'PREPARA' : undefined, href: status === 'ready' ? '/pills' : undefined };
}

export function buildEditorialRadar(args: { match: UpcomingMatch | null; sources: EditorialSource[]; now?: Date }): EditorialTrigger[] {
  const now = args.now ?? new Date();
  const triggers: EditorialTrigger[] = [];
  if (args.match) {
    const kickoff = new Date(args.match.kickoffAt);
    const hours = (kickoff.getTime() - now.getTime()) / 3_600_000;
    if (hours >= 0 && hours <= 48) {
      triggers.push(matchTrigger(args.match, 'MATCH_MINUS_24H', `Pre-partita ${args.match.label}`, new Date(kickoff.getTime() - 24 * 3_600_000), 90, hours <= 24 ? 'ready' : 'waiting_trigger'));
      triggers.push(matchTrigger(args.match, 'FANTASY_DEADLINE', 'Richiamo Fantacampionato', new Date(kickoff.getTime() - 4 * 3_600_000), 86, hours <= 24 ? 'ready' : 'waiting_trigger'));
      triggers.push(matchTrigger(args.match, 'MATCH_MINUS_3H', `Avvicinamento a ${args.match.label}`, new Date(kickoff.getTime() - 3 * 3_600_000), 88, 'waiting_trigger'));
      triggers.push(matchTrigger(args.match, 'MATCH_STARTED', `Kickoff ${args.match.label}`, kickoff, 82, 'waiting_trigger'));
      triggers.push(matchTrigger(args.match, 'HALFTIME', `Intervallo ${args.match.label}`, new Date(kickoff.getTime() + 50 * 60_000), 70, 'waiting_trigger'));
      triggers.push(matchTrigger(args.match, 'MATCH_ENDED', `Risultato finale ${args.match.label}`, new Date(kickoff.getTime() + 115 * 60_000), 92, 'waiting_trigger'));
    }
  }
  for (const source of args.sources) {
    const publishedAt = source.publishedAt ? new Date(source.publishedAt) : null;
    if (!publishedAt || now.getTime() - publishedAt.getTime() > 24 * 3_600_000 || source.alreadyDrafted) continue;
    const pressConference = source.type === 'episode' && /conferenza|press/i.test(source.title);
    const type: EditorialTriggerType = source.type === 'pill' ? 'NEW_PILL' : pressConference ? 'NEW_PRESS_CONFERENCE' : 'NEW_EPISODE';
    triggers.push({ id: `${type}-${source.id}`, type, sourceType: source.type, sourceId: source.id, title: source.title, expectedAt: source.publishedAt ?? undefined, detectedAt: now.toISOString(), priority: pressConference ? 80 : source.type === 'pill' ? 74 : 76, automationLevel: 'generate', status: 'ready', actionLabel: 'GENERA', href: `/social/composer?${source.type === 'pill' ? 'pill_id' : 'episode_id'}=${encodeURIComponent(source.id)}` });
  }
  return triggers.sort((a, b) => {
    const aTime = a.expectedAt ? new Date(a.expectedAt).getTime() : Infinity;
    const bTime = b.expectedAt ? new Date(b.expectedAt).getTime() : Infinity;
    return aTime - bTime || b.priority - a.priority;
  });
}
