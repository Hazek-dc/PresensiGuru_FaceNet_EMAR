#!/usr/bin/env python3
"""
Frame Extractor for FaceNet-EMAR Evaluation
Penelitia: FaceNet + EMAR Liveness Detection
Peneliti : Qalwani Anugerah — NPM 221220048 — UMP 2026

Mengambil video dari dataset/video_singkat/ dan meng-ekstrak frame gambar ke dataset/frame_hasil/
"""

import os
import sys
import cv2
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent.parent
VIDEO_DIR = BASE_DIR / "dataset" / "video_singkat"
FRAME_OUT_DIR = BASE_DIR / "dataset" / "frame_hasil"

def extract_all_frames(max_frames_per_video: int = 15):
    """Mengekstrak frame dari semua video di dataset/video_singkat/ ke dataset/frame_hasil/."""
    FRAME_OUT_DIR.mkdir(parents=True, exist_ok=True)

    videos = list(VIDEO_DIR.glob("*.mp4")) + list(VIDEO_DIR.glob("*.webm")) + list(VIDEO_DIR.glob("*.avi"))
    
    if not videos:
        print(f"[INFO] Tidak ditemukan file video di '{VIDEO_DIR}'")
        return

    print(f"[PROCESS] Mengekstrak {len(videos)} video ke '{FRAME_OUT_DIR}'...")

    total_extracted = 0
    for v_idx, vid_path in enumerate(videos, start=1):
        cap = cv2.VideoCapture(str(vid_path))
        if not cap.isOpened():
            print(f"  [!] Gagal membuka video: {vid_path.name}")
            continue

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            total_frames = 30 # Default estimate

        import numpy as np
        want_indices = set(int(i) for i in np.linspace(0, total_frames - 1, min(max_frames_per_video, total_frames)))
        
        frame_idx = 0
        extracted_count = 0
        stem_name = vid_path.stem.replace(" ", "_")

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx in want_indices:
                out_filename = f"{stem_name}_frame_{extracted_count:02d}.jpg"
                out_path = FRAME_OUT_DIR / out_filename
                cv2.imwrite(str(out_path), frame)
                extracted_count += 1
                total_extracted += 1
            frame_idx += 1

        cap.release()
        print(f"  [{v_idx}/{len(videos)}] {vid_path.name} -> {extracted_count} frame disimpan.")

    print(f"\n[SELESAI] Total {total_extracted} frame berhasil diekstrak dan disimpan di: {FRAME_OUT_DIR}")

if __name__ == "__main__":
    extract_all_frames()
