import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'zlib';
import { seal } from 'tweetsodium';

const YOUTUBE_GOOGLE_SECRETS = ['YTDLP_COOKIES_YOUTUBE_GZ_B64', 'YTDLP_COOKIES_GOOGLE_GZ_B64'] as const;
const FACEBOOK_SECRET = 'YTDLP_COOKIES_FACEBOOK_GZ_B64' as const;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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

function getMissingGithubConfig(owner: string, repo: string, token: string) {
  const missing: string[] = [];

  if (!token) missing.push('GITHUB_TOKEN');
  if (!repo) missing.push('GITHUB_REPO');
  if (!owner) missing.push('GITHUB_OWNER (oppure owner/repo in GITHUB_REPO)');

  return missing;
}

function isYouTubeGoogleDomain(domain: string) {
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

function isFacebookDomain(domain: string) {
  const d = domain.toLowerCase();
  return d === 'facebook.com' || d.endsWith('.facebook.com') || d === 'fbcdn.net' || d.endsWith('.fbcdn.net');
}

function buildSecretFromCookies(
  cookiesText: string,
  domainPredicate: (domain: string) => boolean,
  emptyMessage: string
) {
  const lines = cookiesText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const filtered: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // #HttpOnly_ is NOT a comment — it is a standard prefix emitted by many browser
    // cookie-export extensions (e.g. "Get cookies.txt LOCALLY") to mark HttpOnly cookies.
    // Facebook's essential auth cookies (datr, sb, c_user, xs …) are all HttpOnly, so
    // without this handling the Facebook block is always empty.
    const isHttpOnly = /^#httponly_/i.test(line);
    if (!isHttpOnly && line.startsWith('#')) continue; // skip real comment lines

    const parts = line.split('\t');
    if (parts.length < 7) continue;

    // Strip the prefix before passing to the domain predicate, but keep the original
    // line in `filtered` so yt-dlp receives the file exactly as expected.
    const domainField = isHttpOnly ? parts[0].replace(/^#httponly_/i, '') : parts[0];
    if (domainPredicate(domainField)) filtered.push(line);
  }

  if (!filtered.length) {
    throw new Error(emptyMessage);
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
    throw new HttpError(res.status, `GitHub API ${res.status}: ${txt}`);
  }

  if (res.status === 204) return null;
  return res.json() as Promise<T>;
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.GITHUB_TOKEN?.trim() ?? '';
    const ref = process.env.GITHUB_REF?.trim() || 'master';
    const { owner, repo } = getOwnerAndRepo();
    const missing = getMissingGithubConfig(owner, repo, token);

    if (missing.length) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Config GitHub mancante lato server',
          missing,
          hint: 'Imposta le variabili e riavvia/redeploy il server',
        },
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

    const ytGoogle = buildSecretFromCookies(
      cookiesText,
      isYouTubeGoogleDomain,
      'Nessun cookie YouTube/Google trovato nel file'
    );

    const keyResp = await gh<{ key: string; key_id: string }>(
      `/repos/${owner}/${repo}/actions/secrets/public-key`,
      token
    );
    if (!keyResp) {
      throw new Error('Risposta vuota da GitHub public-key');
    }
    const key = keyResp.key;
    const keyId = keyResp.key_id;

    const encryptSecret = (plainValue: string) => {
      const messageBytes = Buffer.from(plainValue);
      const keyBytes = Buffer.from(key, 'base64');
      const encryptedBytes = seal(messageBytes, keyBytes);
      return Buffer.from(encryptedBytes).toString('base64');
    };

    const updatedSecrets: string[] = [];
    const ytGoogleEncryptedValue = encryptSecret(ytGoogle.value);

    for (const secretName of YOUTUBE_GOOGLE_SECRETS) {
      await gh(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          encrypted_value: ytGoogleEncryptedValue,
          key_id: keyId,
        }),
      });
      updatedSecrets.push(secretName);
    }

    let facebook: ReturnType<typeof buildSecretFromCookies> | null = null;
    const missingPlatforms: string[] = [];
    try {
      facebook = buildSecretFromCookies(
        cookiesText,
        isFacebookDomain,
        'Nessun cookie Facebook trovato nel file'
      );
    } catch {
      facebook = null;
      missingPlatforms.push('facebook');
    }

    if (facebook) {
      const facebookEncryptedValue = encryptSecret(facebook.value);
      await gh(`/repos/${owner}/${repo}/actions/secrets/${FACEBOOK_SECRET}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          encrypted_value: facebookEncryptedValue,
          key_id: keyId,
        }),
      });
      updatedSecrets.push(FACEBOOK_SECRET);
    }

    await gh(`/repos/${owner}/${repo}/actions/workflows/check-cookies.yml/dispatches`, token, {
      method: 'POST',
      body: JSON.stringify({ ref }),
    });

    return NextResponse.json({
      ok: true,
      message: missingPlatforms.length
        ? 'Secrets aggiornati (YouTube/Google), cookie Facebook non trovati, workflow check-cookies avviato'
        : 'Secrets YouTube/Google/Facebook aggiornati e workflow check-cookies avviato',
      warning: missingPlatforms.length
        ? `Cookie non trovati per: ${missingPlatforms.join(', ')}`
        : undefined,
      stats: {
        filteredRows: ytGoogle.filteredRows,
        secretLength: ytGoogle.secretLength,
        updatedSecrets,
        missingPlatforms,
        platformStats: {
          youtubeGoogle: {
            filteredRows: ytGoogle.filteredRows,
            secretLength: ytGoogle.secretLength,
          },
          facebook: facebook
            ? {
                filteredRows: facebook.filteredRows,
                secretLength: facebook.secretLength,
              }
            : null,
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'Errore interno';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
