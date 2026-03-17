import { NextResponse } from 'next/server';
import { ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { r2MediaClient, MEDIA_BUCKET_NAME, MEDIA_PUBLIC_BASE_URL } from '@/lib/r2MediaClient';

const IMAGE_EXTS = new Set(['webp', 'jpg', 'jpeg', 'png', 'avif']);

function fileExt(key: string): string {
  return key.split('.').pop()?.toLowerCase() ?? '';
}

export async function GET() {
  if (!r2MediaClient) {
    return NextResponse.json({ error: 'R2 Media not configured' }, { status: 503 });
  }

  try {
    const items: { key: string; url: string; size: number; lastModified?: string }[] = [];
    let token: string | undefined;

    do {
      const res: ListObjectsV2CommandOutput = await r2MediaClient.send(
        new ListObjectsV2Command({
          Bucket: MEDIA_BUCKET_NAME,
          ContinuationToken: token,
        })
      );

      for (const obj of res.Contents ?? []) {
        if (!obj.Key || obj.Key.endsWith('/')) continue;
        if (!IMAGE_EXTS.has(fileExt(obj.Key))) continue;
        items.push({
          key: obj.Key,
          url: `${MEDIA_PUBLIC_BASE_URL}/${obj.Key}`,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified?.toISOString(),
        });
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    // Most recently modified first
    items.sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
