#!/usr/bin/env python3
"""
extract_best_face_frame.py
─────────────────────────────────────────────────────────────────
Estrae dal video sorgente il frame "migliore" per usare come
background della Scene 1 (QuoteCore) di InterviewStoryVideo.

Strategia:
  1. FFmpeg estrae N frame equidistanziati (filter fps=1/interval)
     in una temp dir. FFmpeg gestisce HLS multi-bitrate molto meglio
     di cv2.VideoCapture (che faceva fail su HLS LAVIKA V2).
  2. cv2 scora ogni frame estratto: laplacian_variance × faces × area.
  3. Best frame copiato come output PNG.

Scoring:
  score = laplacian_variance × (1 + face_count × 0.5) × face_size_bonus

Usage:
  ./extract_best_face_frame.py --input <url-or-path> --output <png-path>
                               [--samples 30] [--start 0] [--end 0]

Output stdout (JSON):
  {"best_path": "...", "score": 1234.5, "sampled": 30,
   "faces_in_best": 1, "face_area_pct": 12.3,
   "fallback_to_sharpness_only": false}

Exit codes:
  0 = OK
  1 = video non leggibile / FFmpeg failed
  2 = nessun frame valido
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import cv2  # type: ignore
import numpy as np


def laplacian_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def detect_faces(face_cascade, gray: np.ndarray) -> list:
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.15, minNeighbors=5, minSize=(80, 80),
    )
    return list(faces) if len(faces) > 0 else []


def score_frame(bgr: np.ndarray, face_cascade) -> tuple[float, int, float]:
    h, w = bgr.shape[:2]
    if h < 200 or w < 200:
        return (0.0, 0, 0.0)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mean_lum = float(gray.mean())
    if mean_lum < 30:
        return (0.0, 0, 0.0)
    sharpness = laplacian_variance(gray)
    if sharpness < 50:
        return (0.0, 0, 0.0)
    faces = detect_faces(face_cascade, gray)
    n_faces = len(faces)
    face_area_pct = 0.0
    if n_faces > 0:
        largest = max(faces, key=lambda f: f[2] * f[3])
        face_area_pct = (largest[2] * largest[3]) / (w * h) * 100
    if face_area_pct >= 8:
        face_size_bonus = 2.0
    elif face_area_pct >= 4:
        face_size_bonus = 1.4
    elif face_area_pct >= 1:
        face_size_bonus = 1.1
    else:
        face_size_bonus = 1.0
    score = sharpness * (1 + n_faces * 0.5) * face_size_bonus
    return (score, n_faces, face_area_pct)


def ffmpeg_get_duration(input_path: str) -> float:
    """Probe video duration via ffprobe (più affidabile su HLS di cv2.CAP_PROP)."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', input_path],
            capture_output=True, text=True, timeout=30,
        )
        return float(result.stdout.strip())
    except (subprocess.SubprocessError, ValueError):
        return 0.0


def ffmpeg_extract_frames(input_path: str, out_dir: str, samples: int,
                          start_s: float, end_s: float) -> int:
    """Estrae frame equidistanziati via FFmpeg. Restituisce numero file estratti."""
    if end_s <= start_s:
        return 0
    range_s = end_s - start_s
    fps_expr = f"{samples}/{range_s:.3f}"  # samples/sec totali → distribuiti su range

    cmd = [
        'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', f'{start_s:.3f}',
        '-i', input_path,
        '-t', f'{range_s:.3f}',
        '-vf', f'fps={fps_expr}',
        '-vsync', 'vfr',
        '-q:v', '2',
        os.path.join(out_dir, 'f_%04d.jpg'),
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=180, check=True)
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg extract failed: {e.stderr.decode('utf-8', errors='replace')[:300]}",
              file=sys.stderr)
        return 0
    except subprocess.TimeoutExpired:
        print("FFmpeg extract timeout", file=sys.stderr)
        return 0

    return len([f for f in os.listdir(out_dir) if f.startswith('f_') and f.endswith('.jpg')])


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract best face frame from video")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--samples", type=int, default=30)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, default=0)
    args = parser.parse_args()

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)
    if face_cascade.empty():
        print(f"ERROR: cascade not loaded from {cascade_path}", file=sys.stderr)
        return 1

    duration_s = ffmpeg_get_duration(args.input)
    start_s = max(0, args.start)
    end_s = args.end if args.end > 0 else duration_s
    if end_s <= start_s and duration_s > 0:
        end_s = duration_s
    if end_s <= start_s:
        # Fallback: span 0-60s blind se ffprobe ha fallito
        end_s = start_s + 60

    tmp_dir = tempfile.mkdtemp(prefix='lavika-frames-')
    try:
        n_extracted = ffmpeg_extract_frames(args.input, tmp_dir, args.samples, start_s, end_s)
        if n_extracted == 0:
            print("ERROR: FFmpeg extracted 0 frames", file=sys.stderr)
            return 1

        frame_files = sorted(
            f for f in os.listdir(tmp_dir) if f.startswith('f_') and f.endswith('.jpg')
        )

        best_score = 0.0
        best_path: str | None = None
        best_faces = 0
        best_area_pct = 0.0
        fallback_score = 0.0
        fallback_path: str | None = None

        for fname in frame_files:
            fp = os.path.join(tmp_dir, fname)
            bgr = cv2.imread(fp)
            if bgr is None:
                continue

            score, n_faces, area_pct = score_frame(bgr, face_cascade)
            if score > best_score and n_faces > 0:
                best_score = score
                best_path = fp
                best_faces = n_faces
                best_area_pct = area_pct

            # Fallback sharpness-only
            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            sharp = laplacian_variance(gray)
            if sharp > fallback_score:
                fallback_score = sharp
                fallback_path = fp

        used_fallback = False
        final_path = best_path
        if final_path is None:
            final_path = fallback_path
            used_fallback = True
            best_score = fallback_score

        if final_path is None:
            print("ERROR: no valid frame scored", file=sys.stderr)
            return 2

        # Copia il best frame come PNG di output (transcodifica jpg→png lossless)
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        bgr_best = cv2.imread(final_path)
        cv2.imwrite(args.output, bgr_best, [cv2.IMWRITE_PNG_COMPRESSION, 6])

        result = {
            "best_path": os.path.abspath(args.output),
            "score": round(best_score, 2),
            "sampled": n_extracted,
            "faces_in_best": best_faces,
            "face_area_pct": round(best_area_pct, 2),
            "fallback_to_sharpness_only": used_fallback,
            "video_duration_s": round(duration_s, 2),
        }
        print(json.dumps(result))
        return 0
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
