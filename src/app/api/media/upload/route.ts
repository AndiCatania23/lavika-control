import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  r2MediaClient,
  MEDIA_BUCKET_NAME,
  MEDIA_PUBLIC_BASE_URL,
} from '@/lib/r2MediaClient';

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
    const file = formData.get('file') as File | null;

    if (!type || !formatId || !file) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let key: string;
    if (type === 'format-cover') {
      key = `formats/${formatId}/cover.webp`;
    } else if (type === 'format-hero') {
      key = `formats/${formatId}/hero.webp`;
    } else if (type === 'episode-thumbnail') {
      if (!season || !episodeId) {
        return NextResponse.json(
          { error: 'Missing season or episodeId for episode-thumbnail' },
          { status: 400 }
        );
      }
      key = `episodes/${season}/thumbnails/${episodeId}.webp`;
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    await r2MediaClient.send(
      new PutObjectCommand({
        Bucket: MEDIA_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      })
    );

    const url = `${MEDIA_PUBLIC_BASE_URL}/${key}`;
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
