#!/usr/bin/env python3
"""
Enrollment Script for Subject TEST-QALWANI-001 (Tahap 8)
Penelitian: FaceNet + EMAR Liveness Detection
Peneliti  : Qalwani Anugerah — NPM 221220048 — UMP 2026
"""

import sys
import json
import cv2
import pickle
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from facenet_emar_system import FaceNetModule, GALLERY_PATH

SUBJECT_ID = "TEST-QALWANI-001"
SUBJECT_NAME = "Qalwani Anugerah"
DEPT = "Peneliti & Admin"
CONSENT_FILE = BASE_DIR / "dataset" / "self_qalwani" / "consent" / "consent_metadata.json"
ENROLLMENT_DIR = BASE_DIR / "dataset" / "self_qalwani" / "raw" / "enrollment" / "session_e"
SESSION_TAG = "session_e"
IMAGE_EXT = {".jpg", ".jpeg", ".png"}
VIDEO_EXT = {".mp4", ".webm", ".mov"}


def enrollment_media(directory: Path = ENROLLMENT_DIR):
    """
    Gambar dan video sesi enrollment saja. Sesi kalibrasi (session_c), uji
    (session_t), dan salinan di akar self_qalwani tidak boleh ikut membentuk
    template, agar data uji tidak bocor ke galeri.
    """
    files = sorted(p for p in directory.rglob("*") if p.is_file())
    images = [p for p in files if p.suffix.lower() in IMAGE_EXT]
    videos = [p for p in files if p.suffix.lower() in VIDEO_EXT]
    return images, videos


def run_enrollment_qalwani():
    print("=" * 60)
    print(f" ENROLLMENT BIOMETRIK TEMPLATE: {SUBJECT_ID}")
    print("=" * 60)

    # 1. Verification of Consent
    if not CONSENT_FILE.exists():
        print(f"[ERROR] Metadata consent tidak ditemukan: {CONSENT_FILE}")
        sys.exit(1)

    with open(CONSENT_FILE, "r", encoding="utf-8") as f:
        consent_data = json.load(f)

    if consent_data.get("subject_id") != SUBJECT_ID:
        print("[ERROR] Subject ID pada consent mismatch!")
        sys.exit(1)

    print(f"[OK] Consent Aktif: Versi {consent_data.get('consent_version')} ({consent_data.get('granted_at')})")

    # 2. Sampel hanya dari sesi enrollment (session_e)
    image_files, video_files = enrollment_media()
    if not image_files and not video_files:
        print(f"[ERROR] Belum ada sampel di {ENROLLMENT_DIR.relative_to(BASE_DIR)}. Template TIDAK diubah.")
        sys.exit(1)

    facenet = FaceNetModule()
    
    # If existing template exists, check before replacing
    if GALLERY_PATH.exists():
        with open(GALLERY_PATH, "rb") as f:
            existing_gal = pickle.load(f)
        if SUBJECT_ID in existing_gal:
            print(f"[INFO] Template eksisting untuk {SUBJECT_ID} ditemukan (diperbarui).")

    images = []
    if image_files:
        print(f"[INFO] Memproses {len(image_files)} sampel gambar dari {ENROLLMENT_DIR.relative_to(BASE_DIR)}...")
        for p in image_files:
            img = cv2.imread(str(p))
            if img is not None:
                images.append(img)

    if video_files:
        print(f"[INFO] Memproses {len(video_files)} video enrollment dari {ENROLLMENT_DIR.relative_to(BASE_DIR)}...")
        n_from_images = len(images)
        for vp in video_files:
            cap = cv2.VideoCapture(str(vp))
            frame_idx = 0
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_idx % 15 == 0:  # Sample every 15 frames (~0.5s)
                    images.append(frame)
                frame_idx += 1
            cap.release()
        print(f"  [OK] Berhasil mengekstrak {len(images) - n_from_images} frame dari video enrollment.")

    # Template acak tidak boleh dibuat: galeri hanya berisi embedding terukur.
    if not images:
        print(f"[ERROR] Tidak ada frame terbaca di {ENROLLMENT_DIR.relative_to(BASE_DIR)}. Template TIDAK diubah.")
        sys.exit(1)

    # enroll() menyimpan galeri sendiri dan mencadangkannya bila template lama diganti.
    res = facenet.enroll(
        subject_id=SUBJECT_ID,
        name=SUBJECT_NAME,
        dept=DEPT,
        images=images,
        session_tag=SESSION_TAG,
    )
    if not res.get("success"):
        print(f"[ERROR] Gagal melakukan enrollment: {res.get('msg')}")
        sys.exit(1)
    if res.get("backup"):
        print(f"[INFO] Galeri lama dicadangkan ke {res['backup']}")

    # 3. Explicit Validation: gallery contains TEST-QALWANI-001 = true
    with open(GALLERY_PATH, "rb") as f:
        verified_gallery = pickle.load(f)

    gallery_contains_qalwani = SUBJECT_ID in verified_gallery
    print(f"\n[CHECK] gallery contains {SUBJECT_ID} = {gallery_contains_qalwani}")

    if not gallery_contains_qalwani:
        print(f"[CRITICAL FAILURE] Template {SUBJECT_ID} gagal tersimpan di galeri!")
        sys.exit(1)

    print(f"[SUCCESS] Enrollment template {SUBJECT_ID} berhasil diverifikasi di {GALLERY_PATH}!\n")

if __name__ == "__main__":
    run_enrollment_qalwani()
