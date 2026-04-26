import { NextResponse } from 'next/server';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { supabaseServer } from '@/lib/supabaseServer';
import { r2MediaClient, MEDIA_BUCKET_NAME, MEDIA_PUBLIC_BASE_URL } from '@/lib/r2MediaClient';
import { isGeminiConfigured, fetchImageBytes, generateCover } from '@/lib/ai/gemini-image';

// POST /api/console/pills/cover  (multipart/form-data)
//   pill_id: string
//   subject: File (foto soggetto)
//
// Versione minima: 3 input → 1 chiamata Nano Banana.

const GENERATED_PREFIX = 'pills/generated/';

export async function POST(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  if (!isGeminiConfigured()) return NextResponse.json({ error: 'GEMINI_API_KEY mancante' }, { status: 503 });
  if (!r2MediaClient) return NextResponse.json({ error: 'R2 non configurato' }, { status: 503 });

  const baseUrl = process.env.PILL_COVER_BASE_URL;
  if (!baseUrl) return NextResponse.json({ error: 'PILL_COVER_BASE_URL mancante' }, { status: 503 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Body non è multipart/form-data' }, { status: 400 });
  }
  const pillId = formData.get('pill_id') as string | null;
  const assetFiles = formData.getAll('asset').filter((v): v is File => v instanceof File);
  if (!pillId) return NextResponse.json({ error: 'pill_id mancante' }, { status: 400 });
  if (assetFiles.length === 0) return NextResponse.json({ error: 'serve almeno un asset' }, { status: 400 });

  const { data: pill, error: pillErr } = await supabaseServer
    .from('pills')
    .select('id, content, image_url')
    .eq('id', pillId)
    .single();
  if (pillErr || !pill) {
    return NextResponse.json({ error: pillErr?.message ?? 'Pill non trovata' }, { status: 404 });
  }

  // Base template + asset uploadati dall'utente.
  const baseImage = await fetchImageBytes(baseUrl);
  if (!baseImage) {
    return NextResponse.json({ error: 'Impossibile scaricare base template' }, { status: 502 });
  }
  const assets = await Promise.all(
    assetFiles.map(async (f) => ({
      data: Buffer.from(await f.arrayBuffer()),
      mimeType: f.type || 'image/jpeg',
    })),
  );

  let pngBuffer: Buffer;
  try {
    pngBuffer = await generateCover({
      baseImage,
      assets,
      pillContent: pill.content as string,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generazione fallita';
    console.error('[pills/cover] failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Force 16:9 horizontal: Nano Banana spesso eredita aspect ratio dall'asset
  // (es. logo quadrato → output quadrato). Sharp.resize fit:'cover' fa center-crop
  // a 1920x1080 indipendentemente da cosa arriva.
  const meta = await sharp(pngBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const targetRatio = 16 / 9;
  const actualRatio = h > 0 ? w / h : targetRatio;
  console.log('[pills/cover] Nano Banana output: %dx%d (ratio %f)', w, h, actualRatio);

  let normalized: Buffer;
  if (Math.abs(actualRatio - targetRatio) < 0.05) {
    // Già 16:9 (tolleranza 5%): scala solo a 2048 di larghezza max
    normalized = await sharp(pngBuffer)
      .resize({ width: 2048, withoutEnlargement: true })
      .toBuffer();
  } else {
    // Non 16:9: center-crop forzato a 1920x1080
    normalized = await sharp(pngBuffer)
      .resize(1920, 1080, { fit: 'cover', position: 'center' })
      .toBuffer();
  }
  const webp = await sharp(normalized).webp({ quality: 85 }).toBuffer();

  const key = `${GENERATED_PREFIX}${pillId}.webp`;
  const ts = Date.now();
  await r2MediaClient.send(
    new PutObjectCommand({
      Bucket: MEDIA_BUCKET_NAME,
      Key: key,
      Body: webp,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000',
    }),
  );

  // Cleanup vecchia immagine se key diversa (es. era manuale)
  const oldUrl = (pill.image_url as string | null) ?? null;
  if (oldUrl && oldUrl.startsWith(MEDIA_PUBLIC_BASE_URL)) {
    const oldKey = oldUrl.replace(`${MEDIA_PUBLIC_BASE_URL}/`, '').split('?')[0];
    if (oldKey && oldKey !== key) {
      try {
        await r2MediaClient.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: oldKey }));
      } catch (delErr) {
        console.warn('[pills/cover] cleanup vecchio file fallito:', delErr);
      }
    }
  }

  const newImageUrl = `${MEDIA_PUBLIC_BASE_URL}/${key}?v=${ts}`;
  const { error: updateErr } = await supabaseServer
    .from('pills')
    .update({ image_url: newImageUrl })
    .eq('id', pillId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, image_url: newImageUrl });
}
