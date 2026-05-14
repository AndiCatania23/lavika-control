import { spawn } from 'node:child_process';

import type { WhisperSegment } from './quoteEngine';

/* ──────────────────────────────────────────────────────────────────
   whisperTranscribe — wrapper TS di faster-whisper via venv Python

   Invoca lo script Python:
     ~/LAVIKA-SPORT/venv/bin/python3
        repos/control/scripts/python/whisper_transcribe.py
        --input <video-url> [--model large-v3] [--language it]

   Restituisce segments compatibili con quoteEngine.WhisperSegment.
   Su Mac M4 Pro 24GB la trascrizione di un match-reaction tipico
   (5-10 min) impiega ~2-3 min con large-v3 + int8. Il daemon deve
   tollerare timeout lunghi.

   Modello viene scaricato automaticamente al primo run (~3GB) in
   ~/.cache/huggingface/hub. Persistente cross-run.
   ────────────────────────────────────────────────────────────────── */

const VENV_PYTHON =
  process.env.LAVIKA_VENV_PYTHON ??
  '/Users/andreafailla/LAVIKA-SPORT/venv/bin/python3';

const SCRIPT_PATH =
  process.env.WHISPER_SCRIPT ??
  '/Users/andreafailla/LAVIKA-SPORT/repos/control/scripts/python/whisper_transcribe.py';

const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'large-v3';
const WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE ?? 'it';

export interface WhisperTranscriptResult {
  language: string;
  languageProbability: number;
  duration: number;
  segments: WhisperSegment[];
  model: string;
}

export interface TranscribeOptions {
  /** Whisper model size. Default 'large-v3' (~3GB, IT top). */
  model?: string;
  /** ISO 639-1 language code. Default 'it'. */
  language?: string;
  /** Start trim seconds. Default 0. */
  startSec?: number;
  /** End trim seconds. Default 0 (= full duration). */
  endSec?: number;
  /** Timeout in ms. Default 10 min (large-v3 può essere lento). */
  timeoutMs?: number;
}

export async function whisperTranscribe(
  videoUrl: string,
  opts: TranscribeOptions = {},
): Promise<WhisperTranscriptResult | null> {
  const args = [
    SCRIPT_PATH,
    '--input', videoUrl,
    '--model', opts.model ?? WHISPER_MODEL,
    '--language', opts.language ?? WHISPER_LANGUAGE,
  ];
  if (opts.startSec) args.push('--start', String(opts.startSec));
  if (opts.endSec) args.push('--end', String(opts.endSec));

  return new Promise<WhisperTranscriptResult | null>((resolve) => {
    const proc = spawn(VENV_PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (v: WhisperTranscriptResult | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        settle(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as {
          language: string;
          language_probability: number;
          duration: number;
          segments: WhisperSegment[];
          model: string;
        };
        settle({
          language: parsed.language,
          languageProbability: parsed.language_probability,
          duration: parsed.duration,
          segments: parsed.segments,
          model: parsed.model,
        });
      } catch {
        settle(null);
      }
    });

    proc.on('error', () => settle(null));

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      settle(null);
    }, opts.timeoutMs ?? 600_000);
    proc.on('close', () => clearTimeout(timer));
  });
}
