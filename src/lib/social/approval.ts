export type ApprovalAction = 'approve' | 'reject';

export type ApprovalVariant = {
  status: string;
  asset_url?: string | null;
  asset_urls?: string[] | null;
};

const READY_STATUSES = new Set(['asset_ready', 'scheduled', 'published']);
const BUSY_STATUSES = new Set(['draft', 'asset_pending', 'publishing', 'failed']);

export function validateApproval(
  draft: { status: string; requires_approval: boolean; approved_at?: string | null },
  variants: ApprovalVariant[],
): { ok: true } | { ok: false; reason: string } {
  if (!draft.requires_approval) return { ok: false, reason: 'Questo pacchetto non richiede approvazione.' };
  if (draft.approved_at || draft.status === 'approved') return { ok: false, reason: 'Il pacchetto è già approvato.' };
  if (draft.status === 'cancelled') return { ok: false, reason: 'Il pacchetto è stato scartato.' };
  if (variants.length === 0) return { ok: false, reason: 'Il pacchetto non contiene varianti.' };
  if (variants.some((variant) => BUSY_STATUSES.has(variant.status))) {
    return { ok: false, reason: 'Attendi che asset e caption siano pronti e correggi eventuali errori.' };
  }
  const publishable = variants.filter((variant) => READY_STATUSES.has(variant.status));
  if (publishable.length === 0) return { ok: false, reason: 'Nessuna variante pronta da approvare.' };
  const missingAsset = publishable.some((variant) => !variant.asset_url && !(variant.asset_urls?.length));
  if (missingAsset) return { ok: false, reason: 'Una o più varianti non hanno ancora un asset.' };
  return { ok: true };
}

export function canPublishApprovedDraft(draft: {
  requires_approval?: boolean | null;
  approved_at?: string | null;
  status?: string | null;
}): boolean {
  return !draft.requires_approval || Boolean(draft.approved_at) || draft.status === 'approved';
}
