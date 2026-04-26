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
  // Padding 16:9 transparent prima di Nano Banana: se l'asset è quadrato/verticale,
  // viene contenuto in un canvas 1920x1080 con sfondo trasparente. Cosi' tutti
  // gli input (base + asset) hanno stesso aspect ratio → output 16:9.
  const assets = await Promise.all(
    assetFiles.map(async (f) => {
      const raw = Buffer.from(await f.arrayBuffer());
      const padded = await sharp(raw)
        .resize(1920, 1080, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      return { data: padded, mimeType: 'image/png' };
    }),
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

  // Logga aspect ratio output per debug; nessun crop forzato (rovinava la composizione).
  const meta = await sharp(pngBuffer).metadata();
  console.log('[pills/cover] Nano Banana output: %dx%d (ratio %f)',
    meta.width ?? 0, meta.height ?? 0, meta.height ? (meta.width ?? 0) / meta.height : 0);

  const webp = await sharp(pngBuffer)
    .resize({ width: 2048, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

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
