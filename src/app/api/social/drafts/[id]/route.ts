import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/social/drafts/[id]
 * Returns draft + all variants joined with their latest asset_job status.
 * Used by the Composer page to render the review UI.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const { id } = await params;

  // Fetch draft
  const { data: draft, error: dErr } = await supabaseServer
    .from('social_drafts')
    .select('*')
    .eq('id', id)
    .single();

  if (dErr || !draft) {
    return NextResponse.json({ error: `Draft non trovato: ${id}` }, { status: 404 });
  }

  // Fetch variants
  const { data: variants, error: vErr } = await supabaseServer
    .from('social_variants')
    .select('*')
    .eq('draft_id', id)
    .order('created_at', { ascending: true });

  if (vErr) {
    return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  // Fetch latest job per variant for status visibility
  const variantIds = (variants ?? []).map(v => v.id);
  let jobs: Array<{ id: string; variant_id: string; status: string; error: string | null; result_url: string | null; attempts: number; updated_at: string }> = [];
  if (variantIds.length > 0) {
    const { data: js } = await supabaseServer
      .from('social_asset_jobs')
      .select('id, variant_id, status, error, result_url, attempts, updated_at')
      .in('variant_id', variantIds);
    jobs = js ?? [];
  }
  // Group: latest job per variant
  const jobByVariant = new Map<string, typeof jobs[0]>();
  for (const j of jobs) {
    const prev = jobByVariant.get(j.variant_id);
    if (!prev || new Date(j.updated_at) > new Date(prev.updated_at)) {
      jobByVariant.set(j.variant_id, j);
    }
  }

  // Optionally fetch source (pill or episode) for context
  let source: unknown = null;
  if (draft.source_type === 'pill' && draft.source_id) {
    const { data: pill } = await supabaseServer
      .from('pills')
      .select('id, title, content, type, pill_category, image_url')
      .eq('id', draft.source_id)
      .maybeSingle();
    source = pill;
  } else if (draft.source_type === 'episode' && draft.source_id) {
    const { data: ep } = await supabaseServer
      .from('content_episodes')
      .select('id, title, format_id, thumbnail_url, match_id')
      .eq('id', draft.source_id)
      .maybeSingle();
    source = ep;
  }

  return NextResponse.json({
    draft,
    variants: (variants ?? []).map(v => ({
      ...v,
      latestJob: jobByVariant.get(v.id) ?? null,
    })),
    source,
  });
}
