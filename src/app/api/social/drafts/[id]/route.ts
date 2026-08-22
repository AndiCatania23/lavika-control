import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { deleteAssetsFromUrls } from '@/lib/social/r2Cleanup';
import { validateApproval, type ApprovalAction } from '@/lib/social/approval';

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

  // Fetch latest asset job per variant for status visibility
  const variantIds = (variants ?? []).map(v => v.id);
  let jobs: Array<{ id: string; variant_id: string; status: string; error: string | null; result_url: string | null; attempts: number; updated_at: string }> = [];
  let captionJobs: Array<{ id: string; variant_id: string; status: string; last_error: string | null; attempts: number; updated_at: string; completed_at: string | null }> = [];
  if (variantIds.length > 0) {
    const [{ data: js }, { data: cjs }] = await Promise.all([
      supabaseServer
        .from('social_asset_jobs')
        .select('id, variant_id, status, error, result_url, attempts, updated_at')
        .in('variant_id', variantIds),
      supabaseServer
        .from('caption_jobs')
        .select('id, variant_id, status, last_error, attempts, updated_at, completed_at')
        .in('variant_id', variantIds),
    ]);
    jobs = js ?? [];
    captionJobs = cjs ?? [];
  }
  // Group: latest job per variant
  const jobByVariant = new Map<string, typeof jobs[0]>();
  for (const j of jobs) {
    const prev = jobByVariant.get(j.variant_id);
    if (!prev || new Date(j.updated_at) > new Date(prev.updated_at)) {
      jobByVariant.set(j.variant_id, j);
    }
  }
  const captionJobByVariant = new Map<string, typeof captionJobs[0]>();
  for (const j of captionJobs) {
    const prev = captionJobByVariant.get(j.variant_id);
    if (!prev || new Date(j.updated_at) > new Date(prev.updated_at)) {
      captionJobByVariant.set(j.variant_id, j);
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
      captionJob: captionJobByVariant.get(v.id) ?? null,
    })),
    source,
  });
}

/** Approva o scarta senza pubblicare: la pubblicazione resta sempre un'azione separata. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as { action?: ApprovalAction } | null;
  if (body?.action !== 'approve' && body?.action !== 'reject') {
    return NextResponse.json({ error: 'Azione non valida' }, { status: 400 });
  }

  const [{ data: draft, error: draftError }, { data: variants, error: variantsError }] = await Promise.all([
    supabaseServer.from('social_drafts').select('id, status, requires_approval, approved_at').eq('id', id).single(),
    supabaseServer.from('social_variants').select('status, asset_url, asset_urls').eq('draft_id', id),
  ]);
  if (draftError || !draft) return NextResponse.json({ error: `Draft non trovato: ${id}` }, { status: 404 });
  if (variantsError) return NextResponse.json({ error: variantsError.message }, { status: 500 });

  const now = new Date().toISOString();
  if (body.action === 'approve') {
    const validation = validateApproval(draft, variants ?? []);
    if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 409 });
    const { data, error } = await supabaseServer.from('social_drafts').update({
      status: 'approved', approved_at: now, updated_at: now,
    }).eq('id', id).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, draft: data });
  }

  if (draft.status === 'published') {
    return NextResponse.json({ error: 'Un pacchetto già pubblicato non può essere scartato.' }, { status: 409 });
  }
  const { data, error } = await supabaseServer.from('social_drafts').update({
    status: 'cancelled', approved_at: null, approved_by: null, updated_at: now,
  }).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, draft: data });
}

/**
 * DELETE /api/social/drafts/[id]
 *
 * - Raccoglie tutti gli asset_url delle variants
 * - Cancella asset R2 in batch
 * - Cancella draft (cascade su variants + asset_jobs)
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id } = await params;

  // Collect asset URLs to cleanup
  const { data: vs } = await supabaseServer
    .from('social_variants')
    .select('asset_url')
    .eq('draft_id', id);

  const urls = (vs ?? []).map(v => v.asset_url).filter(Boolean) as string[];
  const r2Results = urls.length > 0 ? await deleteAssetsFromUrls(urls) : [];

  // Delete draft (cascade su variants + jobs)
  const { error } = await supabaseServer
    .from('social_drafts')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    r2Cleanup: { total: urls.length, ok: r2Results.filter(r => r.ok).length },
  });
}
