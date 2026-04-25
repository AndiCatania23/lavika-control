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
  const subjectFile = formData.get('subject') as File | null;
  if (!pillId) return NextResponse.json({ error: 'pill_id mancante' }, { status: 400 });
  if (!subjectFile) return NextResponse.json({ error: 'foto soggetto mancante' }, { status: 400 });

  const { data: pill, error: pillErr } = await supabaseServer
    .from('pills')
    .select('id, content, image_url')
    .eq('id', pillId)
    .single();
  if (pillErr || !pill) {
    return NextResponse.json({ error: pillErr?.message ?? 'Pill non trovata' }, { status: 404 });
  }

  // Prepara i 2 input image: base (da R2) + soggetto (dall'upload)
  const baseImage = await fetchImageBytes(baseUrl);
  if (!baseImage) {
    return NextResponse.json({ error: 'Impossibile scaricare base template' }, { status: 502 });
  }
  const subjectBuffer = Buffer.from(await subjectFile.arrayBuffer());
  const subjectMime = subjectFile.type || 'image/jpeg';
  const subjectImage = { data: subjectBuffer, mimeType: subjectMime };

  // Chiama Nano Banana
  let pngBuffer: Buffer;
  try {
    pngBuffer = await generateCover({
      baseImage,
      subjectImage,
      pillContent: pill.content as string,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generazione fallita';
    console.error('[pills/cover] failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Convert e upload con stable key (overwrite garantito)
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
