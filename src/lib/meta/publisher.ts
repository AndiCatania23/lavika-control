/**
 * Meta publisher — funzioni di publish per Facebook Page + Instagram Business.
 *
 * Tutte le funzioni richiedono che META_PAGE_ACCESS_TOKEN sia configurato
 * (vedi getMetaConfig in client.ts).
 *
 * Note importanti:
 * - Per **Instagram**: image_url DEVE essere pubblicamente accessibile via HTTPS.
 *   Formati supportati: JPEG, PNG. WebP NON è supportato da IG per content publish.
 *   Per pubblicare WebP serve convertirlo prima (Sharp o FFmpeg).
 * - Per **Facebook Page**: WebP è supportato per le foto.
 * - Caption max: IG 2200 char · FB 63206 char (effettivamente illimitato).
 */

import { getMetaConfig, MetaApiError } from './client';

const GRAPH_API = 'https://graph.facebook.com/v25.0';

interface MetaError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

async function metaPost<T = unknown>(path: string, body: Record<string, string>): Promise<T> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  const formData = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) formData.set(k, v);
  formData.set('access_token', cfg.pageAccessToken);
  const res = await fetch(`${GRAPH_API}${path}`, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { error: { message: text } }; }
  if (!res.ok || (json as { error?: MetaError }).error) {
    throw new MetaApiError((json as { error: MetaError }).error, res.status);
  }
  return json as T;
}

async function metaGet<T = unknown>(path: string): Promise<T> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  const sep = path.includes('?') ? '&' : '?';
  const url = `${GRAPH_API}${path}${sep}access_token=${encodeURIComponent(cfg.pageAccessToken)}`;
  const res = await fetch(url);
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { error: { message: text } }; }
  if (!res.ok || (json as { error?: MetaError }).error) {
    throw new MetaApiError((json as { error: MetaError }).error, res.status);
  }
  return json as T;
}

/* ──────────────────────────────────────────────────────────────────
   Facebook Page — Photo post
   ────────────────────────────────────────────────────────────────── */

export interface FbPostResult {
  id: string;          // photo id
  post_id?: string;    // post id (formato: {pageId}_{postId})
  permalink_url?: string;
}

export async function publishFbPhotoPost(opts: {
  imageUrl: string;
  caption?: string;
}): Promise<FbPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');

  const result = await metaPost<{ id: string; post_id?: string }>(
    `/${cfg.pageId}/photos`,
    {
      url: opts.imageUrl,
      caption: opts.caption ?? '',
      published: 'true',
    }
  );

  // Recupera permalink se presente
  let permalink_url: string | undefined;
  if (result.post_id) {
    try {
      const meta = await metaGet<{ permalink_url?: string }>(
        `/${result.post_id}?fields=permalink_url`
      );
      permalink_url = meta.permalink_url;
    } catch { /* ignore — permalink non è critico */ }
  }

  return { ...result, permalink_url };
}

/* ──────────────────────────────────────────────────────────────────
   Instagram — Photo post (2-step API)
   ────────────────────────────────────────────────────────────────── */

export interface IgPostResult {
  id: string;             // media id pubblicato
  permalink?: string;
  containerId: string;
}

interface IgContainerStatus {
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
}

// Post-Live mode Meta returns code 100 / subcode 33 on GET status for image
// containers even when they're valid. Treat as FINISHED for images.
async function waitForIgContainerReady(containerId: string, maxWaitMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const status = await metaGet<IgContainerStatus>(
        `/${containerId}?fields=status_code,status`
      );
      if (status.status_code === 'FINISHED') return;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new Error(`IG container ${status.status_code}: ${status.status ?? ''}`);
      }
    } catch (e) {
      if (e instanceof MetaApiError && e.meta.code === 100 && e.meta.error_subcode === 33) {
        return;
      }
      throw e;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`IG container timeout after ${maxWaitMs}ms`);
}

export async function publishIgPhotoPost(opts: {
  imageUrl: string;          // DEVE essere JPEG/PNG, no WebP
  caption?: string;
}): Promise<IgPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');

  // Step 1: create media container
  const container = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media`,
    {
      image_url: opts.imageUrl,
      caption: opts.caption ?? '',
    }
  );
  const containerId = container.id;

  // Step 2: wait for container to be ready (usually instant for images, longer for videos)
  await waitForIgContainerReady(containerId);

  // Step 3: publish
  const published = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media_publish`,
    { creation_id: containerId }
  );

  // Step 4: get permalink
  let permalink: string | undefined;
  try {
    const meta = await metaGet<{ permalink?: string }>(
      `/${published.id}?fields=permalink`
    );
    permalink = meta.permalink;
  } catch { /* ignore */ }

  return { id: published.id, containerId, permalink };
}

/* ──────────────────────────────────────────────────────────────────
   Instagram — Carousel (album foto, 2-10 slide)

   Flow:
     1. Crea child container per ogni slide (image_url + is_carousel_item=true)
     2. Wait FINISHED per ognuno
     3. Crea parent container (media_type=CAROUSEL + children=id1,id2,…)
     4. Wait parent FINISHED
     5. Publish parent
   Limiti: 2-10 slide. JPEG/PNG. Aspect 4:5 / 1:1 / 1.91:1 (1080×1350 OK).
   ────────────────────────────────────────────────────────────────── */

export async function publishIgCarouselPost(opts: {
  imageUrls: string[];      // 2-10, JPEG/PNG, HTTPS pubblico
  caption?: string;
}): Promise<IgPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  if (opts.imageUrls.length < 2 || opts.imageUrls.length > 10) {
    throw new Error(`IG Carousel richiede 2-10 slide (ricevute ${opts.imageUrls.length})`);
  }

  // Step 1: child containers (in parallelo)
  const childContainers = await Promise.all(
    opts.imageUrls.map(url =>
      metaPost<{ id: string }>(`/${cfg.igBusinessId}/media`, {
        image_url: url,
        is_carousel_item: 'true',
      })
    )
  );
  const childIds = childContainers.map(c => c.id);

  // Step 2: attendi che ogni child sia FINISHED (parallelo)
  await Promise.all(childIds.map(id => waitForIgContainerReady(id)));

  // Step 3: parent container CAROUSEL
  const parent = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media`,
    {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: opts.caption ?? '',
    }
  );
  const parentId = parent.id;

  // Step 4: attendi parent
  await waitForIgContainerReady(parentId);

  // Step 5: publish
  const published = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media_publish`,
    { creation_id: parentId }
  );

  let permalink: string | undefined;
  try {
    const meta = await metaGet<{ permalink?: string }>(
      `/${published.id}?fields=permalink`
    );
    permalink = meta.permalink;
  } catch { /* ignore */ }

  return { id: published.id, containerId: parentId, permalink };
}

/* ──────────────────────────────────────────────────────────────────
   Facebook Page — Carousel (multi-photo feed post)

   Flow:
     1. Upload unpublished di ogni foto su /{page-id}/photos (published=false)
        → ottieni photo_id per ognuna.
     2. POST /{page-id}/feed con message=caption + attached_media=[{media_fbid}, …]
   ────────────────────────────────────────────────────────────────── */

export async function publishFbCarouselPost(opts: {
  imageUrls: string[];
  caption?: string;
}): Promise<FbPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  if (opts.imageUrls.length < 2) {
    throw new Error(`FB Carousel richiede almeno 2 foto (ricevute ${opts.imageUrls.length})`);
  }

  // Step 1: upload unpublished (parallelo)
  const photos = await Promise.all(
    opts.imageUrls.map(url =>
      metaPost<{ id: string }>(`/${cfg.pageId}/photos`, {
        url,
        published: 'false',
      })
    )
  );
  const photoIds = photos.map(p => p.id);

  // Step 2: feed post con attached_media
  const attached_media = JSON.stringify(
    photoIds.map(id => ({ media_fbid: id }))
  );
  const post = await metaPost<{ id: string }>(
    `/${cfg.pageId}/feed`,
    {
      message: opts.caption ?? '',
      attached_media,
    }
  );
  // post.id format: "{pageId}_{postId}" — è anche il post_id

  let permalink_url: string | undefined;
  try {
    const meta = await metaGet<{ permalink_url?: string }>(
      `/${post.id}?fields=permalink_url`
    );
    permalink_url = meta.permalink_url;
  } catch { /* ignore */ }

  return { id: post.id, post_id: post.id, permalink_url };
}

/* ──────────────────────────────────────────────────────────────────
   Instagram — Story Photo (2-step, media_type=STORIES)
   Sparisce dopo 24h. Stessa API del Photo post Feed ma con
   media_type=STORIES. JPEG/PNG only (no WebP).
   ────────────────────────────────────────────────────────────────── */

export async function publishIgStoryPhoto(opts: {
  imageUrl: string;
  caption?: string;     // appears in story sticker (link / mention) — non sempre visibile
}): Promise<IgPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');

  const container = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media`,
    {
      image_url: opts.imageUrl,
      media_type: 'STORIES',
      caption: opts.caption ?? '',
    }
  );
  const containerId = container.id;
  await waitForIgContainerReady(containerId);

  const published = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media_publish`,
    { creation_id: containerId }
  );

  let permalink: string | undefined;
  try {
    const meta = await metaGet<{ permalink?: string }>(
      `/${published.id}?fields=permalink`
    );
    permalink = meta.permalink;
  } catch { /* ignore */ }

  return { id: published.id, containerId, permalink };
}

/* ──────────────────────────────────────────────────────────────────
   Instagram — Story Video (2-step, media_type=STORIES con video_url)
   Container può richiedere più tempo (encoding) → maxWait 120s.
   Video MP4 H264 yuv420p (vedi remotion.config.ts), 9:16 1080×1920.
   ────────────────────────────────────────────────────────────────── */

export async function publishIgStoryVideo(opts: {
  videoUrl: string;
  caption?: string;
}): Promise<IgPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');

  const container = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media`,
    {
      video_url: opts.videoUrl,
      media_type: 'STORIES',
      caption: opts.caption ?? '',
    }
  );
  const containerId = container.id;
  // Video container needs more time to process (encoding)
  await waitForIgContainerReady(containerId, 120000);

  const published = await metaPost<{ id: string }>(
    `/${cfg.igBusinessId}/media_publish`,
    { creation_id: containerId }
  );

  let permalink: string | undefined;
  try {
    const meta = await metaGet<{ permalink?: string }>(
      `/${published.id}?fields=permalink`
    );
    permalink = meta.permalink;
  } catch { /* ignore */ }

  return { id: published.id, containerId, permalink };
}

/* ──────────────────────────────────────────────────────────────────
   Facebook — Story Photo (2-step: upload unpublished → photo_stories)
   Sparisce dopo 24h. Endpoint dedicato photo_stories (NON feed photos).
   ────────────────────────────────────────────────────────────────── */

export async function publishFbStoryPhoto(opts: {
  imageUrl: string;
  caption?: string;     // ignored su FB Story (non c'è caption in story photo)
}): Promise<FbPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');

  // Step 1: upload photo unpublished → ottieni photo_id
  const photo = await metaPost<{ id: string }>(
    `/${cfg.pageId}/photos`,
    { url: opts.imageUrl, published: 'false' }
  );

  // Step 2: pubblica come story
  const story = await metaPost<{ post_id?: string; success?: boolean }>(
    `/${cfg.pageId}/photo_stories`,
    { photo_id: photo.id }
  );

  return {
    id: story.post_id ?? photo.id,
    post_id: story.post_id,
    permalink_url: undefined,  // FB Stories non ritornano permalink standard
  };
}

/* ──────────────────────────────────────────────────────────────────
   Facebook — Story Video (resumable upload con file_url, 3-step)
   Sparisce dopo 24h. Endpoint dedicato video_stories.

   Flow:
     1. start  → riceve { video_id, upload_url }
     2. upload → POST upload_url con header `file_url: <publicUrl>`
     3. finish → publish definitivo
   Richiede video MP4 H264 yuv420p, 9:16, max 60s, accessibile via HTTPS.
   ────────────────────────────────────────────────────────────────── */

export async function publishFbStoryVideo(opts: {
  videoUrl: string;
  caption?: string;     // description del video
}): Promise<FbPostResult> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');

  // Step 1: start upload session
  const start = await metaPost<{ video_id: string; upload_url: string }>(
    `/${cfg.pageId}/video_stories`,
    { upload_phase: 'start' }
  );
  const { video_id, upload_url } = start;

  // Step 2: upload via file_url (Meta fetcha il file dal nostro CDN)
  const uploadRes = await fetch(upload_url, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${cfg.pageAccessToken}`,
      'file_url': opts.videoUrl,
    },
  });
  const uploadJson = await uploadRes.json() as { success?: boolean; error?: MetaError };
  if (!uploadRes.ok || uploadJson.error) {
    throw new MetaApiError(
      uploadJson.error ?? { message: 'Upload phase failed' },
      uploadRes.status
    );
  }

  // Step 3: finish + publish
  const finishParams: Record<string, string> = {
    upload_phase: 'finish',
    video_id,
  };
  if (opts.caption) finishParams.description = opts.caption;
  const finish = await metaPost<{ post_id?: string; success?: boolean }>(
    `/${cfg.pageId}/video_stories`,
    finishParams
  );

  return {
    id: finish.post_id ?? video_id,
    post_id: finish.post_id,
    permalink_url: undefined,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Delete (per test cleanup)
   ────────────────────────────────────────────────────────────────── */

export async function deleteFbPost(postId: string): Promise<{ success: boolean }> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  const url = `${GRAPH_API}/${postId}?access_token=${encodeURIComponent(cfg.pageAccessToken)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const json = await res.json() as { success?: boolean; error?: MetaError };
  if (!res.ok || json.error) throw new MetaApiError(json.error!, res.status);
  return { success: !!json.success };
}

export async function deleteIgMedia(mediaId: string): Promise<{ success: boolean }> {
  const cfg = getMetaConfig();
  if (!cfg) throw new Error('Meta env vars not configured');
  const url = `${GRAPH_API}/${mediaId}?access_token=${encodeURIComponent(cfg.pageAccessToken)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const json = await res.json() as { success?: boolean; error?: MetaError };
  if (!res.ok || json.error) throw new MetaApiError(json.error!, res.status);
  return { success: !!json.success };
}
