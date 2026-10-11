import { createHmac } from 'node:crypto';

export async function revalidateAppContent(): Promise<boolean> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return false;
  const origin = process.env.LAVIKA_APP_URL?.trim() || 'https://lavikasport.app';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', key).update(`revalidate-content:${timestamp}`).digest('hex');
    try {
      const response = await fetch(`${origin}/api/internal/revalidate-content`, {
        method: 'POST',
        headers: { 'x-content-timestamp': timestamp, 'x-content-signature': signature },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return true;
    } catch {
      // Retry once; the caller must distinguish a saved edit from stale app cache.
    }
  }
  return false;
}
