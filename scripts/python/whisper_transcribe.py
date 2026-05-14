#!/usr/bin/env python3
"""
whisper_transcribe.py
─────────────────────────────────────────────────────────────────
Trascrive audio da video URL / file usando faster-whisper.

Modello: large-v3 default (IT top accuracy). Output JSON con
lista di segments + lingua rilevata. Pensato per pipeline LAVIKA
match-reaction (interviste post-partita italiane).

Usage:
  ./whisper_transcribe.py --input <url-or-path>
                          [--model large-v3]
                          [--language it]
                          [--start 0] [--end 0]

Output stdout (JSON):
  {
    "language": "it",
    "language_probability": 0.99,
    "duration": 412.3,
    "segments": [
      {"start": 0.0, "end": 3.2, "text": "Abbiamo lottato fino alla fine."},
      ...
    ]
  }

Exit codes:
  0 = OK
  1 = video / audio non leggibile
  2 = faster_whisper non installato
"""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Whisper transcribe video")
    parser.add_argument("--input", required=True, help="Video URL or local path")
    parser.add_argument("--model", default="large-v3",
                        help="Whisper model size (tiny/base/small/medium/large-v3)")
    parser.add_argument("--language", default="it",
                        help="Language code (default 'it' for Italian)")
    parser.add_argument("--start", type=float, default=0,
                        help="Trim start in seconds")
    parser.add_argument("--end", type=float, default=0,
                        help="Trim end in seconds (0 = full)")
    parser.add_argument("--device", default="auto",
                        help="cpu / cuda / auto (default auto)")
    parser.add_argument("--compute-type", default="auto",
                        help="int8 / float16 / float32 / auto (default auto)")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        print("ERROR: faster_whisper not installed in venv", file=sys.stderr)
        return 2

    # Su Mac M-series il device cpu con int8 è il path supportato
    # (no CUDA su Apple Silicon, no MPS support in faster-whisper attualmente).
    device = args.device if args.device != "auto" else "cpu"
    compute_type = args.compute_type if args.compute_type != "auto" else "int8"

    print(f"Loading whisper model={args.model} device={device} compute={compute_type}",
          file=sys.stderr)

    model = WhisperModel(args.model, device=device, compute_type=compute_type)

    # Beam search 5, vad_filter True per saltare silenzi (riduce drift)
    segments_iter, info = model.transcribe(
        args.input,
        language=args.language if args.language else None,
        beam_size=5,
        vad_filter=True,
        # min_silence_duration_ms 800 (era 400): mantiene segments più
        # "concettualmente completi". Whisper non spezza su pause brevi
        # del giocatore (es. "Sono contento [pausa 1s] perché ho lottato...").
        vad_parameters={"min_silence_duration_ms": 800},
        word_timestamps=False,
        condition_on_previous_text=False,  # riduce hallucination su silenzi lunghi
    )

    segments = []
    for s in segments_iter:
        # Filtri trim opzionali
        if args.end > 0 and s.start > args.end:
            break
        if args.start > 0 and s.end < args.start:
            continue
        segments.append({
            "start": round(float(s.start), 3),
            "end": round(float(s.end), 3),
            "text": s.text.strip(),
        })

    out = {
        "language": info.language,
        "language_probability": round(float(info.language_probability), 4),
        "duration": round(float(info.duration), 2),
        "segments": segments,
        "model": args.model,
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
