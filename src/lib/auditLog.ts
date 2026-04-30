/**
 * Audit log helper — scrive una riga in `audit_log` per ogni mutation eseguita
 * dagli endpoint Control `/api/console/*`. Retention infinito (decisione piano).
 *
 * Uso:
 *   await writeAuditLog({
 *     action: 'create_format',
 *     entity_table: 'content_formats',
 *     entity_id: format.id,
 *     diff: { before: null, after: format },
 *     actor_email: actorEmailFromRequest(request),  // opzionale
 *   });
 *
 * Il fallimento di scrittura NON blocca l'operazione principale (try/catch interno):
 * meglio una mutation senza audit che bloccarla per un audit fallito.
 */
import { supabaseServer } from './supabaseServer';

export interface AuditLogInput {
  action: string;
  entity_table: string;
  entity_id: string;
  diff?: Record<string, unknown>;
  actor_email?: string | null;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  if (!supabaseServer) return;
  try {
    const { error } = await supabaseServer.from('audit_log').insert({
      action: input.action,
      entity_table: input.entity_table,
      entity_id: input.entity_id,
      diff: input.diff ?? {},
      actor_email: input.actor_email ?? null,
    });
    if (error) {
      console.warn(`[audit_log] write failed (non-blocking): ${error.message}`);
    }
  } catch (err) {
    console.warn('[audit_log] unexpected error (non-blocking):', err);
  }
}

/**
 * Estrae l'email actor dalla request. Cerca header `x-actor-email` (settato
 * dal client Control quando disponibile). Fallback `null` (registrato come system).
 */
export function actorEmailFromRequest(request: Request): string | null {
  const fromHeader = request.headers.get('x-actor-email');
  if (fromHeader && fromHeader.trim().length > 0) return fromHeader.trim();
  return null;
}
