import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'zlib';
import { seal } from 'tweetsodium';

const SECRET_NAME = 'YTDLP_COOKIES_YOUTUBE_GZ_B64';

function getOwnerAndRepo() {
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();

  if (owner && repo && !repo.includes('/')) {
    return { owner, repo };
  }

  if (repo && repo.includes('/')) {
    const [splitOwner, splitRepo] = repo.split('/');
    return {
      owner: owner || splitOwner,
      repo: splitRepo,
    };
  }

  return { owner: owner || '', repo: repo || '' };
}

function isAllowedDomain(domain: string) {
  const d = domain.toLowerCase();
  return (
    d === 'youtu.be' ||
    d.includes('youtube.com') ||
    d === 'google.com' ||
    d.endsWith('.google.com') ||
    d === 'google.it' ||
    d.endsWith('.google.it')
  );
}

function buildSecretFromCookies(cookiesText: string) {
  const lines = cookiesText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const filtered: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    if (isAllowedDomain(parts[0])) filtered.push(line);
  }

  if (!filtered.length) {
    throw new Error('Nessun cookie YouTube/Google trovato nel file');
  }

  const netscape = [
    '# Netscape HTTP Cookie File',
    '# https://curl.haxx.se/rfc/cookie_spec.html',
    '# This is a generated file! Do not edit.',
    '',
    ...filtered,
    '',
  ].join('\n');

  const gz = gzipSync(Buffer.from(netscape, 'utf-8'));
  const value = gz.toString('base64');

  return {
    value,
    filteredRows: filtered.length,
    secretLength: value.length,
  };
}

async function gh<T>(path: string, token: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API ${res.status}: ${txt}`);
  }

  if (res.status === 204) return null;
  return res.json() as Promise<T>;
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.GITHUB_TOKEN?.trim() ?? '';
    const ref = process.env.GITHUB_REF?.trim() || 'master';
    const { owner, repo } = getOwnerAndRepo();

    if (!token || !owner || !repo) {
      return NextResponse.json(
        { ok: false, message: 'Config GitHub mancante lato server' },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get('cookies');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: 'File cookies.txt mancante' },
        { status: 400 }
      );
    }

    const cookiesText = await file.text();
    if (!cookiesText.trim()) {
      return NextResponse.json(
        { ok: false, message: 'File cookies.txt vuoto' },
        { status: 400 }
      );
    }

    const { value, filteredRows, secretLength } = buildSecretFromCookies(cookiesText);

    const keyResp = await gh<{ key: string; key_id: string }>(
      `/repos/${owner}/${repo}/actions/secrets/public-key`,
      token
    );
    if (!keyResp) {
      throw new Error('Risposta vuota da GitHub public-key');
    }
    const key = keyResp.key;
    const keyId = keyResp.key_id;

    const messageBytes = Buffer.from(value);
    const keyBytes = Buffer.from(key, 'base64');
    const encryptedBytes = seal(messageBytes, keyBytes);
    const encryptedValue = Buffer.from(encryptedBytes).toString('base64');

    await gh(`/repos/${owner}/${repo}/actions/secrets/${SECRET_NAME}`, token, {
      method: 'PUT',
      body: JSON.stringify({
        encrypted_value: encryptedValue,
        key_id: keyId,
      }),
    });

    await gh(`/repos/${owner}/${repo}/actions/workflows/check-cookies.yml/dispatches`, token, {
      method: 'POST',
      body: JSON.stringify({ ref }),
    });

    return NextResponse.json({
      ok: true,
      message: 'Secret aggiornata e workflow check-cookies avviato',
      stats: { filteredRows, secretLength },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Errore interno';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
