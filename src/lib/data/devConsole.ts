import { supabase } from '../supabaseClient';

export interface DevCard {
  id: string;
  card_key: string;
  card_type: string;
  title: string;
  subtitle?: string;
  icon?: string;
  sort_order: number;
  is_enabled: boolean;
  meta?: Record<string, unknown>;
}

export interface DevCardValue {
  id: string;
  card_key: string;
  value_num?: number;
  value_text?: string;
  unit?: string;
  delta_num?: number;
  delta_text?: string;
  delta_direction?: 'up' | 'down' | 'flat';
  status?: 'ok' | 'warn' | 'error';
  computed_at: string;
}

export interface DevFeedItem {
  id: string;
  feed_key: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export async function getDevCards(): Promise<DevCard[]> {
  const { data: s } = await supabase.auth.getSession();
  console.log('[DBG session]', s?.session?.user?.id ?? null, s?.session ? 'HAS_SESSION' : 'NO_SESSION');

  const { data, error } = await supabase
    .from('dev_cards')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order');

  console.log('[DBG dev_cards]', { len: data?.length ?? 0, error });

  if (error) {
    console.error('[DBG dev_cards error]', {
      code: (error as any).code,
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    return [];
  }

  return data || [];
}

export async function getLatestCardValues(cardKeys: string[]): Promise<DevCardValue[]> {
  if (cardKeys.length === 0) return [];

  const { data, error } = await supabase
    .from('dev_card_values')
    .select('*')
    .in('card_key', cardKeys)
    .order('computed_at', { ascending: false });

  if (error) {
    console.error('Error fetching card values:', error);
    return [];
  }

  // Riduci a un valore per card_key (il più recente)
  const valueMap = new Map<string, DevCardValue>();
  for (const item of data || []) {
    if (!valueMap.has(item.card_key)) {
      valueMap.set(item.card_key, item);
    }
  }

  return Array.from(valueMap.values());
}

export async function getDevFeed(feedKey: string, limit: number = 20): Promise<DevFeedItem[]> {
  const { data, error } = await supabase
    .from('dev_feed_items')
    .select('*')
    .eq('feed_key', feedKey)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching feed:', error);
    return [];
  }

  return data || [];
}
