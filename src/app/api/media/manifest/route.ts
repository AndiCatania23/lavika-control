import { NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, r2BucketName } from '@/lib/r2Client';

export async function GET() {
  if (!r2Client || !r2BucketName) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 });
  }

  try {
    const response = await r2Client.send(
      new GetObjectCommand({ Bucket: r2BucketName, Key: 'manifest.json' })
    );
    const body = await response.Body?.transformToString();
    if (!body) return NextResponse.json({ formats: [] });
    return NextResponse.json(JSON.parse(body));
  } catch (error) {
    const code =
      (error as { Code?: string })?.Code ??
      (error as { name?: string })?.name;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      return NextResponse.json({ formats: [] });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!r2Client || !r2BucketName) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 });
  }

  try {
    const manifest: unknown = await request.json();
    const body = JSON.stringify(manifest, null, 2);

    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: 'manifest.json',
        Body: body,
        ContentType: 'application/json',
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
