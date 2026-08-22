import type { ContentType, HookType } from './types';

const normalized = (text: string | null | undefined) => (text ?? '').trim().toLocaleLowerCase('it-IT');

export function classifyContentType(caption: string | null): ContentType {
  const text = normalized(caption);
  if (!text) return 'unknown';
  if (/\b(ultim['’]?ora|breaking|ufficiale)\b/.test(text)) return 'breaking';
  if (/\b(mercato|acquisto|cessione|firma|contratto|trattativa)\b/.test(text)) return 'market';
  if (/\b(fantacampionato|pronostic[io]|formazione fantasy)\b/.test(text)) return 'fantasy';
  if (/\b(pre[- ]?match|match day|partita|kickoff|intervallo|risultato finale)\b/.test(text)) return 'match';
  if (/\b(episodio|puntata|press conference|conferenza stampa|on demand)\b/.test(text)) return 'episode';
  if (/\b(carriera|profilo|numeri di|ritratto)\b/.test(text)) return 'player_profile';
  if (/\b(quiz|voi cosa|tifosi|community|sondaggio)\b/.test(text)) return 'community';
  if (/\b(scarica|apri l['’]?app|solo su làvika|disponibile su)\b/.test(text)) return 'promo';
  if (/\b(comunicato|società|club comunica)\b/.test(text)) return 'institutional';
  if (/\b(storia|anniversario|amarcord|accadde oggi)\b/.test(text)) return 'evergreen';
  return 'news';
}

export function classifyHook(caption: string | null): HookType {
  const text = (caption ?? '').trim();
  if (!text) return 'unknown';
  const head = text.slice(0, 100);
  if (/^(ultim['’]?ora|breaking|ufficiale)\b/i.test(head)) return 'breaking';
  if (/^\d+[\s.,:%-]/.test(head)) return 'number_led';
  if (/^[“"«'].+[”"»']/.test(head)) return 'quote';
  if (/\?/.test(head)) return 'question';
  if (/\b(vs|contro|più di|meno di|confronto)\b/i.test(head)) return 'comparison';
  if (/\b(non crederai|ecco perché|quello che|il motivo)\b/i.test(head)) return 'curiosity_gap';
  if (/\b(emozione|cuore|orgoglio|insieme|indimenticabile)\b/i.test(head)) return 'emotional';
  if (/\b(ha firmato|è ufficiale|vince|pareggia|perde|convocati)\b/i.test(head)) return 'direct_news';
  return 'statement';
}

export function contentCanBeReused(contentType: ContentType, publishedAt: string, now = new Date()): boolean {
  const ageHours = (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) return false;
  if (contentType === 'evergreen' || contentType === 'player_profile' || contentType === 'community') return true;
  if (contentType === 'breaking' || contentType === 'news') return ageHours <= 24;
  if (contentType === 'market' || contentType === 'match' || contentType === 'fantasy') return ageHours <= 48;
  return ageHours <= 72;
}
