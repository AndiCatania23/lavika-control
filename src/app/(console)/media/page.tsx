'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import {
  Upload,
  Image as ImageIcon,
  Film,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BookOpen,
  ChevronDown,
  Cloud,
  HardDrive,
  X,
  Send,
} from 'lucide-react';

const MEDIA_PUBLIC_BASE_URL = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Episode {
  id: string;
  name?: string;
  title?: string;
  episodeNumber?: number;
  thumbnailUrl?: string;
  videoUrl?: string;
}

interface Season {
  id: string;
  name?: string;
  episodes: Episode[];
}

interface Format {
  id: string;
  name?: string;
  seasons: Season[];
}

interface Manifest {
  formats?: Format[];
  [key: string]: unknown;
}

interface UploadState {
  progress: number;
  error: string | null;
  done: boolean;
}

type ActiveSection = 'formats' | 'episodes';

// ── Utilities ──────────────────────────────────────────────────────────────────

async function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas non disponibile'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error('Conversione WebP fallita'));
        },
        'image/webp',
        0.88
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossibile caricare l\'immagine'));
    };

    img.src = url;
  });
}

async function uploadImage(
  file: File,
  type: 'format-cover' | 'format-hero' | 'episode-thumbnail',
  formatId: string,
  season?: string,
  episodeId?: string,
  onProgress?: (p: number) => void
): Promise<string> {
  onProgress?.(10);

  const webpBlob = await convertToWebP(file);
  onProgress?.(35);

  const fd = new FormData();
  fd.append('type', type);
  fd.append('formatId', formatId);
  if (season) fd.append('season', season);
  if (episodeId) fd.append('episodeId', episodeId);
  fd.append('file', new File([webpBlob], 'image.webp', { type: 'image/webp' }));

  onProgress?.(55);

  const response = await fetch('/api/media/upload', { method: 'POST', body: fd });
  onProgress?.(90);

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Errore upload (${response.status})`);
  }

  const result = await response.json() as { url: string };
  onProgress?.(100);
  return result.url;
}

function isMediaUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(MEDIA_PUBLIC_BASE_URL));
}

function episodeLabel(ep: Episode): string {
  if (ep.name) return ep.name;
  if (ep.title) return ep.title;
  if (ep.episodeNumber != null) return `Episodio ${ep.episodeNumber}`;
  return ep.id;
}

// ── UploadZone ─────────────────────────────────────────────────────────────────

function UploadZone({
  label,
  aspectClass,
  currentUrl,
  uploadState,
  onFile,
}: {
  label: string;
  aspectClass: string;
  currentUrl?: string;
  uploadState?: UploadState;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState(false);

  const resolvedUrl = uploadState?.done && currentUrl ? currentUrl : currentUrl;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(jpe?g|png|webp)$/i.test(file.name)) onFile(file);
  };

  const uploading = uploadState && !uploadState.done && uploadState.progress > 0;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <div
        className={`relative ${aspectClass} rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
          dragging
            ? 'border-primary bg-primary/10'
            : 'border-dashed border-border hover:border-primary/50 hover:bg-muted/20'
        } ${uploadState?.error ? 'border-red-500/50' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {/* Current image */}
        {resolvedUrl && !imgError && !uploading && (
          <img
            src={resolvedUrl}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}

        {/* Overlay */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 transition-opacity ${
          uploading ? 'bg-background/80' : resolvedUrl && !imgError ? 'opacity-0 hover:opacity-100 bg-background/70' : ''
        }`}>
          {uploading ? (
            <div className="w-full px-4 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="w-full bg-muted rounded-full h-1">
                <div
                  className="bg-primary h-1 rounded-full transition-all duration-300"
                  style={{ width: `${uploadState!.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{uploadState!.progress}%</span>
            </div>
          ) : (
            <>
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground text-center px-1">
                {dragging ? 'Rilascia qui' : 'Clicca o trascina'}
              </span>
            </>
          )}
        </div>

        {/* Done badge */}
        {uploadState?.done && (
          <div className="absolute top-1 right-1">
            <CheckCircle2 className="w-4 h-4 text-green-500 drop-shadow" />
          </div>
        )}
      </div>

      {/* Error */}
      {uploadState?.error && (
        <p className="text-[10px] text-red-500 line-clamp-2">{uploadState.error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { onFile(file); e.target.value = ''; }
        }}
      />
    </div>
  );
}

// ── EpisodeBadge ───────────────────────────────────────────────────────────────

function EpisodeBadge({ thumbnailUrl }: { thumbnailUrl?: string }) {
  const isMedia = isMediaUrl(thumbnailUrl);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
      isMedia
        ? 'bg-green-500/10 text-green-500'
        : thumbnailUrl
        ? 'bg-muted text-muted-foreground'
        : 'bg-muted text-muted-foreground/60'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isMedia ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
      {isMedia ? 'lavika-media' : thumbnailUrl ? 'lavika-videos' : 'Nessuna'}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('formats');
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [workingManifest, setWorkingManifest] = useState<Manifest | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Format image uploads
  const [formatUploads, setFormatUploads] = useState<Record<string, UploadState>>({});
  // Format image current URLs (updated after successful upload)
  const [formatImageUrls, setFormatImageUrls] = useState<Record<string, string>>({});

  // Episode thumbnail uploads
  const [episodeUploads, setEpisodeUploads] = useState<Record<string, UploadState>>({});

  // Section 2 selectors
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');

  // Load manifest
  const loadManifest = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/media/manifest', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Manifest;
      setManifest(data);
      setWorkingManifest(structuredClone(data));
      // Set default selectors
      const formats = data.formats ?? [];
      if (formats.length > 0) {
        setSelectedFormatId(formats[0].id);
        if (formats[0].seasons.length > 0) {
          setSelectedSeasonId(formats[0].seasons[0].id);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Errore caricamento manifest');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadManifest(); }, [loadManifest]);

  // Sync selectedSeasonId when format changes
  useEffect(() => {
    const fmt = workingManifest?.formats?.find(f => f.id === selectedFormatId);
    if (fmt && fmt.seasons.length > 0) {
      setSelectedSeasonId(fmt.seasons[0].id);
    } else {
      setSelectedSeasonId('');
    }
  }, [selectedFormatId, workingManifest]);

  const formats = workingManifest?.formats ?? [];
  const selectedFormat = formats.find(f => f.id === selectedFormatId);
  const selectedSeason = selectedFormat?.seasons.find(s => s.id === selectedSeasonId);

  // ── Format image upload ───────────────────────────────────────────────────

  function handleFormatImageUpload(
    formatId: string,
    imageType: 'cover' | 'hero',
    file: File
  ) {
    const key = `${formatId}-${imageType}`;
    setFormatUploads(prev => ({ ...prev, [key]: { progress: 0, error: null, done: false } }));

    const type = imageType === 'cover' ? 'format-cover' : 'format-hero';

    uploadImage(file, type, formatId, undefined, undefined, (p) => {
      setFormatUploads(prev => ({ ...prev, [key]: { progress: p, error: null, done: false } }));
    })
      .then((url) => {
        setFormatUploads(prev => ({ ...prev, [key]: { progress: 100, error: null, done: true } }));
        setFormatImageUrls(prev => ({ ...prev, [key]: url }));
      })
      .catch((err: Error) => {
        setFormatUploads(prev => ({
          ...prev,
          [key]: { progress: 0, error: err.message, done: false },
        }));
      });
  }

  // ── Episode thumbnail upload ──────────────────────────────────────────────

  function handleEpisodeThumbnailUpload(
    episode: Episode,
    seasonId: string,
    formatId: string,
    file: File
  ) {
    const key = `ep-${episode.id}`;
    setEpisodeUploads(prev => ({ ...prev, [key]: { progress: 0, error: null, done: false } }));

    uploadImage(file, 'episode-thumbnail', formatId, seasonId, episode.id, (p) => {
      setEpisodeUploads(prev => ({ ...prev, [key]: { progress: p, error: null, done: false } }));
    })
      .then((url) => {
        setEpisodeUploads(prev => ({ ...prev, [key]: { progress: 100, error: null, done: true } }));
        // Update working manifest in memory
        setWorkingManifest(prev => {
          if (!prev) return prev;
          const clone = structuredClone(prev);
          const fmt = clone.formats?.find(f => f.id === formatId);
          const ssn = fmt?.seasons.find(s => s.id === seasonId);
          const ep = ssn?.episodes.find(e => e.id === episode.id);
          if (ep) ep.thumbnailUrl = url;
          return clone;
        });
        setPendingIds(prev => new Set(prev).add(episode.id));
      })
      .catch((err: Error) => {
        setEpisodeUploads(prev => ({
          ...prev,
          [key]: { progress: 0, error: err.message, done: false },
        }));
      });
  }

  // ── Publish manifest ─────────────────────────────────────────────────────

  async function handlePublish() {
    if (!workingManifest) return;
    setPublishLoading(true);
    setPublishResult(null);
    try {
      const response = await fetch('/api/media/manifest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workingManifest),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Errore (${response.status})`);
      }
      setManifest(structuredClone(workingManifest));
      setPendingIds(new Set());
      setPublishResult({ ok: true, msg: 'Manifest pubblicato con successo' });
    } catch (err) {
      setPublishResult({
        ok: false,
        msg: err instanceof Error ? err.message : 'Errore pubblicazione',
      });
    } finally {
      setPublishLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Media" description="Gestione immagini lavika-media" />
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-500">Errore caricamento manifest</p>
            <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
            <button
              onClick={loadManifest}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Riprova
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-32">
      <SectionHeader
        title="Media"
        description="Gestione immagini pubbliche su lavika-media · Manifest episodi su lavika-videos"
        actions={
          <button
            onClick={loadManifest}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted/40"
          >
            <RefreshCw className="w-4 h-4" />
            Ricarica
          </button>
        }
      />

      {/* Bucket context banner */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Cloud className="w-4 h-4 text-violet-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Immagini su</p>
            <p className="text-xs font-medium text-foreground truncate">lavika-media (pubblico)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <HardDrive className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Catalogo su</p>
            <p className="text-xs font-medium text-foreground truncate">lavika-videos (privato)</p>
          </div>
        </div>
      </div>

      {/* Section tab switcher */}
      <div className="rounded-xl border border-border bg-card/70 p-1">
        <nav className="grid grid-cols-2 gap-1">
          {([
            { id: 'formats' as const, label: 'Immagini Format', icon: <ImageIcon className="h-3.5 w-3.5" /> },
            { id: 'episodes' as const, label: 'Thumbnail Episodi', icon: <Film className="h-3.5 w-3.5" /> },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                activeSection === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Section 1: Format Images ─────────────────────────────────────── */}
      {activeSection === 'formats' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              Le immagini vengono caricate su{' '}
              <span className="text-foreground font-medium">lavika-media</span> al percorso{' '}
              <code className="bg-muted px-1 rounded text-[10px]">formats/&#123;id&#125;/cover.webp</code> e{' '}
              <code className="bg-muted px-1 rounded text-[10px]">formats/&#123;id&#125;/hero.webp</code>.
            </p>
            <p>Formati accettati: JPG, PNG, WebP · Convertiti automaticamente in WebP prima del caricamento.</p>
          </div>

          {formats.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nessun format trovato nel manifest.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Assicurati che il bucket lavika-videos contenga un manifest.json valido con un array <code>formats</code>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {formats.map(fmt => {
                const coverKey = `${fmt.id}-cover`;
                const heroKey = `${fmt.id}-hero`;
                const coverUrl = formatImageUrls[coverKey] ?? `${MEDIA_PUBLIC_BASE_URL}/formats/${fmt.id}/cover.webp`;
                const heroUrl = formatImageUrls[heroKey] ?? `${MEDIA_PUBLIC_BASE_URL}/formats/${fmt.id}/hero.webp`;

                return (
                  <div key={fmt.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{fmt.name ?? fmt.id}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{fmt.id}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {fmt.seasons.length} stagion{fmt.seasons.length === 1 ? 'e' : 'i'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Cover 2:3 */}
                      <UploadZone
                        label="Cover 2:3"
                        aspectClass="aspect-[2/3]"
                        currentUrl={coverUrl}
                        uploadState={formatUploads[coverKey]}
                        onFile={(file) => handleFormatImageUpload(fmt.id, 'cover', file)}
                      />
                      {/* Hero 16:9 */}
                      <UploadZone
                        label="Hero 16:9"
                        aspectClass="aspect-video"
                        currentUrl={heroUrl}
                        uploadState={formatUploads[heroKey]}
                        onFile={(file) => handleFormatImageUpload(fmt.id, 'hero', file)}
                      />
                    </div>

                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <p>cover: <span className="text-foreground/60 font-mono">formats/{fmt.id}/cover.webp</span></p>
                      <p>hero: <span className="text-foreground/60 font-mono">formats/{fmt.id}/hero.webp</span></p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Section 2: Episode Thumbnails ────────────────────────────────── */}
      {activeSection === 'episodes' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              Le thumbnail vengono caricate su{' '}
              <span className="text-foreground font-medium">lavika-media</span> al percorso{' '}
              <code className="bg-muted px-1 rounded text-[10px]">episodes/&#123;season&#125;/thumbnails/&#123;id&#125;.webp</code>.
            </p>
            <p>
              Il campo <code className="bg-muted px-1 rounded text-[10px]">thumbnailUrl</code> viene aggiornato in memoria — premi{' '}
              <strong className="text-foreground">Pubblica Manifest</strong> per salvare su lavika-videos.
            </p>
          </div>

          {/* Format + Season selectors */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Format selector */}
            <div className="relative flex-1">
              <select
                value={selectedFormatId}
                onChange={e => setSelectedFormatId(e.target.value)}
                className="w-full appearance-none bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground pr-8"
              >
                {formats.length === 0 && (
                  <option value="">Nessun format disponibile</option>
                )}
                {formats.map(f => (
                  <option key={f.id} value={f.id}>{f.name ?? f.id}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            {/* Season selector */}
            <div className="relative flex-1">
              <select
                value={selectedSeasonId}
                onChange={e => setSelectedSeasonId(e.target.value)}
                className="w-full appearance-none bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground pr-8"
                disabled={!selectedFormat || selectedFormat.seasons.length === 0}
              >
                {(!selectedFormat || selectedFormat.seasons.length === 0) && (
                  <option value="">Nessuna stagione</option>
                )}
                {selectedFormat?.seasons.map(s => (
                  <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Press Conference warning */}
          {selectedFormat && /press.?conf|conferenza/i.test(selectedFormat.id + (selectedFormat.name ?? '')) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Assicurati che la thumbnail rispecchi il soggetto dell&apos;episodio (allenatore, giocatore, ecc.)
              </p>
            </div>
          )}

          {/* Episodes grid */}
          {!selectedSeason || selectedSeason.episodes.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <Film className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {!selectedSeason ? 'Seleziona un format e una stagione.' : 'Nessun episodio in questa stagione.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {selectedSeason.episodes.map(ep => {
                const epKey = `ep-${ep.id}`;
                const epState = episodeUploads[epKey];
                const uploading = epState && !epState.done && epState.progress > 0;
                const isPending = pendingIds.has(ep.id);

                return (
                  <EpisodeCard
                    key={ep.id}
                    episode={ep}
                    seasonId={selectedSeasonId}
                    formatId={selectedFormatId}
                    uploadState={epState}
                    uploading={!!uploading}
                    isPending={isPending}
                    onFile={(file) =>
                      handleEpisodeThumbnailUpload(ep, selectedSeasonId, selectedFormatId, file)
                    }
                  />
                );
              })}
            </div>
          )}

          {/* Publish result feedback */}
          {publishResult && (
            <div className={`flex items-center gap-2 rounded-lg border p-3 ${
              publishResult.ok
                ? 'border-green-500/30 bg-green-500/10'
                : 'border-red-500/30 bg-red-500/10'
            }`}>
              {publishResult.ok
                ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              }
              <span className={`text-xs ${publishResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {publishResult.msg}
              </span>
              <button
                onClick={() => setPublishResult(null)}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sticky publish button (episodes section only) ─────────────────── */}
      {activeSection === 'episodes' && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 lg:left-64 right-0 px-4 lg:px-6 pointer-events-none">
          <div className="max-w-4xl mx-auto pointer-events-auto">
            <div className={`flex items-center gap-3 rounded-xl border shadow-lg px-4 py-3 transition-all duration-300 ${
              pendingIds.size > 0
                ? 'bg-card border-primary/30 opacity-100 translate-y-0'
                : 'bg-card border-border opacity-60 translate-y-0'
            }`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {pendingIds.size > 0
                    ? `${pendingIds.size} modifica${pendingIds.size === 1 ? '' : 'he'} in attesa`
                    : 'Nessuna modifica pendente'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Le thumbnail sono già su lavika-media — pubblica per aggiornare il manifest su lavika-videos
                </p>
              </div>
              <button
                onClick={handlePublish}
                disabled={publishLoading || pendingIds.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {publishLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Pubblica Manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EpisodeCard ────────────────────────────────────────────────────────────────

function EpisodeCard({
  episode,
  seasonId,
  formatId,
  uploadState,
  uploading,
  isPending,
  onFile,
}: {
  episode: Episode;
  seasonId: string;
  formatId: string;
  uploadState?: UploadState;
  uploading: boolean;
  isPending: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState(false);

  void seasonId;
  void formatId;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(jpe?g|png|webp)$/i.test(file.name)) onFile(file);
  };

  return (
    <div className={`rounded-lg border bg-card overflow-hidden transition-colors ${
      isPending ? 'border-primary/40' : 'border-border'
    }`}>
      {/* Thumbnail area */}
      <div
        className={`relative aspect-video cursor-pointer overflow-hidden ${
          dragging ? 'bg-primary/10' : 'bg-muted/20'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {episode.thumbnailUrl && !imgError && !uploading && (
          <img
            src={episode.thumbnailUrl}
            alt={episodeLabel(episode)}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}

        {/* Overlay */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 transition-opacity ${
          uploading ? 'bg-background/80' : episode.thumbnailUrl && !imgError ? 'opacity-0 hover:opacity-100 bg-background/60' : ''
        }`}>
          {uploading ? (
            <div className="w-full px-4 flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="w-full bg-muted rounded-full h-1">
                <div
                  className="bg-primary h-1 rounded-full transition-all"
                  style={{ width: `${uploadState!.progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                {dragging ? 'Rilascia' : 'Carica thumbnail'}
              </span>
            </>
          )}
        </div>

        {/* Done indicator */}
        {uploadState?.done && (
          <div className="absolute top-1 right-1">
            <CheckCircle2 className="w-4 h-4 text-green-500 drop-shadow" />
          </div>
        )}

        {/* Pending indicator */}
        {isPending && (
          <div className="absolute top-1 left-1">
            <span className="text-[9px] font-medium bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
              Pendente
            </span>
          </div>
        )}
      </div>

      {/* Episode info */}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
            {episodeLabel(episode)}
          </p>
          {episode.episodeNumber != null && (
            <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
              #{episode.episodeNumber}
            </span>
          )}
        </div>

        <EpisodeBadge thumbnailUrl={episode.thumbnailUrl} />

        {uploadState?.error && (
          <p className="text-[10px] text-red-500 line-clamp-2">{uploadState.error}</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { onFile(file); e.target.value = ''; }
        }}
      />
    </div>
  );
}
