/**
 * Apple App Store Connect API — JWT ES256 generator.
 *
 * Genera un JWT firmato ES256 (P-256 ECDSA + SHA-256) per autenticare le
 * chiamate alle ASC API. Token validi 10 min (max consigliato da Apple).
 *
 * Docs: https://developer.apple.com/documentation/appstoreconnectapi/generating_tokens_for_api_requests
 *
 * Usa Node built-in crypto — zero dipendenze npm. `dsaEncoding: 'ieee-p1363'`
 * (Node 16.4+) chiede a OpenSSL di emettere direttamente la firma in formato
 * raw concat r||s (64 byte), evitando la conversione DER→JOSE manuale.
 *
 * Env required (in ~/LAVIKA-SPORT/config/asc.env):
 *   ASC_KEY_ID            — es. "ABC123DEF4" (10 char)
 *   ASC_ISSUER_ID         — UUID dell'organizzazione App Store Connect
 *   ASC_PRIVATE_KEY_PATH  — path assoluto al file .p8 (chmod 600)
 */

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const ASC_AUDIENCE = 'appstoreconnect-v1';
const TOKEN_LIFETIME_SECONDS = 600; // 10 minuti (max Apple)

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Genera un JWT ES256 valido per le ASC API.
 *
 * @returns {Promise<string>} compact JWT (header.payload.signature)
 */
export async function generateAscToken() {
  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  const keyPath = process.env.ASC_PRIVATE_KEY_PATH;

  if (!keyId || !issuerId || !keyPath) {
    throw new Error(
      'Missing ASC credentials. Set ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH ' +
        '(loaded from ~/LAVIKA-SPORT/config/asc.env).',
    );
  }

  const privateKeyPem = await readFile(keyPath, 'utf8');
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
    aud: ASC_AUDIENCE,
  };

  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  // dsaEncoding 'ieee-p1363' → raw concat r||s (64 byte), formato JOSE.
  const rawSig = signer.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
  const sigB64 = base64UrlEncode(rawSig);

  return `${signingInput}.${sigB64}`;
}

// Esecuzione diretta per smoke test: `node asc-jwt.mjs` stampa un token.
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAscToken()
    .then((token) => {
      console.log(token);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
