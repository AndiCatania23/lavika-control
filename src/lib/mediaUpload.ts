export const MEDIA_PUBLIC_BASE_URL = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev';

export interface UploadState { progress: number; error: string | null; done: boolean; }

export interface LibraryItem { key: string; url: string; size: number; lastModified?: string; }

export async function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas non disponibile')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        blob => { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('Conversione WebP fallita')); },
        'image/webp', 0.88
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossibile caricare l'immagine")); };
    img.src = url;
  });
}

export async function uploadFile(
  file: File,
  type: string,
  params: Record<string, string>,
  onProgress?: (p: number) => void
): Promise<string> {
  onProgress?.(5);
  const webp = await convertToWebP(file);
  onProgress?.(40);
  const fd = new FormData();
  fd.append('type', type);
  fd.append('file', new File([webp], 'image.webp', { type: 'image/webp' }));
  Object.entries(params).forEach(([k, v]) => fd.append(k, v));
  onProgress?.(60);
  const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
  onProgress?.(90);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Errore upload (${res.status})`);
  }
  const { url } = await res.json() as { url: string };
  onProgress?.(100);
  return url;
}
