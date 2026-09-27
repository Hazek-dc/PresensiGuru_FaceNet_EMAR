#!/usr/bin/env python3
"""
Auto-Enroll Gallery Generator
Penelitian: FaceNet + EMAR Liveness Detection
Peneliti  : Qalwani Anugerah — NPM 221220048 — UMP 2026

Pendaftaran otomatis foto selfie dari dataset/foto_selfie/ ke galeri face_gallery.pkl
"""

import os
import sys
import glob
import cv2
import re
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from facenet_emar_system import FaceNetModule

def map_filename_to_subject_ids(filename: str):
    """Memetakan nama file foto selfie ke berbagai kemungkinan subject_id."""
    clean = Path(filename).stem
    # Ambil nama setelah tanda '-' jika ada
    if "-" in clean:
        name_part = clean.split("-")[-1].strip()
    else:
        name_part = clean.strip()

    # Bersihkan karakter non-alphanumeric
    norm_name = re.sub(r'[^a-zA-Z0-9]', '', name_part).upper()
    
    ids = [norm_name]
    
    # Alias tambahan untuk penyesuaian ID video. QALWANI001 bukan milik Nur Holis:
    # memetakannya ke sini menimpa template subjek lain.
    if "NURHOLIS" in norm_name:
        ids.extend(["S01", "NURHOLIS", "V1", "V2", "V3"])
    elif "VIKY" in norm_name or "FIKI" in norm_name:
        ids.extend(["S02", "FIKIWIDIYANTI", "VIKYWIDIYANTI"])
    elif "MAULUDIN" in norm_name:
        ids.extend(["S03", "MAULUDIN"])
    elif "MERLI" in norm_name:
        ids.extend(["S05", "MERLIYANTI"])
    elif "KARMILA" in norm_name:
        ids.extend(["S06", "KARMILA"])
    elif "REYNALDI" in norm_name:
        ids.extend(["S07", "REYNALDISURYA"])
    elif "TAUFIK" in norm_name:
        ids.extend(["S08", "TAUFIKHIDAYAT"])
    elif "WERY" in norm_name:
        ids.extend(["S09", "WERYSAPUTRA"])
    elif "SUSI" in norm_name:
        ids.extend(["S11", "SUSILISNASARI"])
    elif "PONCO" in norm_name:
        ids.extend(["S12", "PONCOPRASETIO"])
    elif "YULISMA" in norm_name or "SHINTA" in norm_name:
        ids.extend(["S13", "SINTAYULISMA", "YULISMASHINTA"])
    elif "ARIE" in norm_name:
        ids.extend(["ARIELAZIDO"])

    return name_part, list(set(ids))

def enroll_all_selfies():
    print("[ENROLL] Inisialisasi modul FaceNet...")
    facenet = FaceNetModule()

    selfie_dir = BASE_DIR / "dataset" / "foto_selfie"
    image_files = list(selfie_dir.glob("*.jpg")) + list(selfie_dir.glob("*.jpeg")) + list(selfie_dir.glob("*.png"))

    if not image_files:
        print(f"[WARN] Tidak ada foto selfie di {selfie_dir}")
        return

    print(f"[ENROLL] Memproses {len(image_files)} foto selfie untuk pendaftaran galeri...")

    enrolled_count = 0
    for img_path in image_files:
        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            continue

        name_part, subject_ids = map_filename_to_subject_ids(img_path.name)
        
        for sid in subject_ids:
            res = facenet.enroll(
                subject_id=sid,
                name=name_part,
                dept="Guru / Staf",
                images=[img_bgr]
            )
            if res.get("success"):
                enrolled_count += 1
                print(f"  [OK] Enrolled [{sid}] -> {name_part}")

    facenet.save_gallery()
    print(f"\n[SELESAI] Total {enrolled_count} pendaftaran identitas berhasil disimpan ke galeri!")

if __name__ == "__main__":
    enroll_all_selfies()
