import { NextResponse } from 'next/server';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { r2MediaClient, MEDIA_BUCKET_NAME, MEDIA_PUBLIC_BASE_URL } from '@/lib/r2MediaClient';
import { supabaseServer } from '@/lib/supabaseServer';

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
    const playerSlug = formData.get('playerSlug') as string | null;
    const productSlug = formData.get('productSlug') as string | null;
    const imageRole = formData.get('imageRole') as string | null; // main | gallery | detail
    const bannerId = formData.get('bannerId') as string | null;
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
      case 'player-cutout':
        if (!playerSlug) return NextResponse.json({ error: 'Missing playerSlug' }, { status: 400 });
        // Slug goes into the path so each player has one canonical cutout file.
        key = `players/${playerSlug}/cutout.webp`;
        break;
      case 'shop-product-image':
        if (!productSlug) return NextResponse.json({ error: 'Missing productSlug' }, { status: 400 });
        // Main immutable path (stable URL); gallery uses timestamp suffix.
        if (imageRole === 'main') {
          key = `shop/products/${productSlug}/main.webp`;
        } else {
          key = `shop/products/${productSlug}/${imageRole ?? 'gallery'}-${ts}.webp`;
        }
        break;
      case 'shop-banner':
        if (!bannerId) return NextResponse.json({ error: 'Missing bannerId' }, { status: 400 });
        key = `shop/banners/${bannerId}/hero-${ts}.webp`;
        break;
      default:
        return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
    }

    // Convert to WebP server-side. For player cutouts we PRESERVE the alpha
    // channel (trasparenza) and use a larger cap (2560px) because cutouts are
    // used as hero. Other types stay at 2048/quality 85.
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const isCutout = type === 'player-cutout';
    const isShopProduct = type === 'shop-product-image';

    let pipeline = sharp(inputBuffer)
      .rotate()
      .resize({ width: isCutout ? 2560 : 2048, withoutEnlargement: true });

    // Shop packshot: normalizza i pixel chiari neutri a bianco puro. I
    // photographer spesso consegnano foto con background grigio chiaro
    // (#e8e8e8 circa). Flatten da solo non basta (agisce solo su alpha),
    // qui facciamo un pixel-scan: lum >= 215 + canali quasi uguali → #fff.
    // Soglie conservative per preservare ombre e bordi morbidi del prodotto.
    if (isShopProduct) {
      pipeline = pipeline.flatten({ background: '#ffffff' }).removeAlpha();
      const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
      const out = Buffer.from(data);
      const LUM_MIN = 215;
      const NEUTRAL_MAX_DIFF = 14;
      for (let i = 0; i < out.length; i += 3) {
        const r = out[i], g = out[i + 1], b = out[i + 2];
        const lum = (r + g + b) / 3;
        const diff = Math.max(r, g, b) - Math.min(r, g, b);
        if (lum >= LUM_MIN && diff < NEUTRAL_MAX_DIFF) {
          out[i] = 255; out[i + 1] = 255; out[i + 2] = 255;
        }
      }
      pipeline = sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
    }

    const webp = await pipeline
      .webp({ quality: isCutout ? 90 : 85, alphaQuality: 90 })
      .toBuffer();

    // Cleanup: se questa è una pill-image manuale che sostituisce una cover precedente,
    // elimina la vecchia (se è su R2 e ha key diversa). Stessa key = overwrite, no cleanup.
    if (type === 'pill-image' && pillId && supabaseServer) {
      try {
        const { data: existing } = await supabaseServer
          .from('pills')
          .select('image_url')
          .eq('id', pillId)
          .single();
        const oldUrl = (existing?.image_url as string | null) ?? null;
        if (oldUrl && oldUrl.startsWith(MEDIA_PUBLIC_BASE_URL)) {
          const oldKey = oldUrl.replace(`${MEDIA_PUBLIC_BASE_URL}/`, '').split('?')[0];
          if (oldKey && oldKey !== key) {
            await r2MediaClient.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: oldKey }));
          }
        }
      } catch (cleanupErr) {
        console.warn('[media/upload] cleanup vecchia pill-image fallito:', cleanupErr);
      }
    }

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
