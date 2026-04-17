import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { r2MediaClient, MEDIA_BUCKET_NAME, MEDIA_PUBLIC_BASE_URL } from '@/lib/r2MediaClient';

export async function POST(request: Request) {
  if (!r2MediaClient) {
    return NextResponse.json({ error: 'R2 Media client not configured' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const type = formData.get('type') as string | null;
    const formatId = formData.get('formatId') as string | null;
    const season = formData.get('season') as string | null;
    const episodeId = formData.get('episodeId') as string | null;
    const pillId = formData.get('pillId') as string | null;
    const file = formData.get('file') as File | null;

    if (!type || !file) {
      return NextResponse.json({ error: 'Missing type or file' }, { status: 400 });
    }

    const ts = Date.now();
    let key: string;

    switch (type) {
      case 'format-cover-vertical':
        if (!formatId) return NextResponse.json({ error: 'Missing formatId' }, { status: 400 });
        key = `formats/${formatId}/cover-vertical.webp`;
        break;
      case 'format-cover-horizontal':
        if (!formatId) return NextResponse.json({ error: 'Missing formatId' }, { status: 400 });
        key = `formats/${formatId}/cover-horizontal.webp`;
        break;
      case 'format-hero':
        if (!formatId) return NextResponse.json({ error: 'Missing formatId' }, { status: 400 });
        key = `formats/${formatId}/hero.webp`;
        break;
      case 'episode-thumbnail':
        if (!season || !episodeId) {
          return NextResponse.json({ error: 'Missing season or episodeId' }, { status: 400 });
        }
        key = `episodes/${season}/thumbnails/${episodeId}.webp`;
        break;
      case 'batch-thumbnail':
        key = `episodes/batch/${ts}.webp`;
        break;
      case 'library-upload':
        key = `library/${ts}.webp`;
        break;
      case 'pill-image':
        key = `pills/manual/${pillId ?? 'new'}-${ts}.webp`;
        break;
      default:
        return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
    }

    // Convert to WebP server-side so the client can send any supported format
    // (JPEG/PNG/HEIC/…). Keep aspect ratio, cap width to 2048px, quality 85.
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const webp = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 2048, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    await r2MediaClient.send(
      new PutObjectCommand({
        Bucket: MEDIA_BUCKET_NAME,
        Key: key,
        Body: webp,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      })
    );

    return NextResponse.json({ ok: true, url: `${MEDIA_PUBLIC_BASE_URL}/${key}?v=${ts}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
