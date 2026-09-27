#!/usr/bin/env python3
"""
Dataset Validator for Qalwani Personal Research Dataset (Tahap 7.4 & 7.7)
Penelitian: FaceNet + EMAR Liveness Detection
Peneliti  : Qalwani Anugerah — NPM 221220048 — UMP 2026

Validasi ketat:
1. Keberadaan file di disk.
2. Keunikan sample_id.
3. Subject ID wajib 'TEST-QALWANI-001'.
4. Keberadaan subjek di galeri (gallery/face_gallery.pkl).
5. Bebas kebocoran data antar split (SESSION-E, SESSION-C, SESSION-T).
6. Konsistensi label bona_fide vs attack_type.
"""

import os
import sys
import csv
import json
import pickle
import hashlib
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "dataset" / "self_qalwani"
MANIFEST_FILE = DATASET_DIR / "manifests" / "MANIFEST_QALWANI.csv"
TEMPLATE_MANIFEST = DATASET_DIR / "manifests" / "MANIFEST_QALWANI_TEMPLATE.csv"
GALLERY_FILE = BASE_DIR / "gallery" / "face_gallery.pkl"

def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def validate_qalwani_dataset(check_gallery_presence: bool = True):
    print("=" * 60)
    print(" VALIDATOR DATASET PRIBADI QALWANI (TEST-QALWANI-001)")
    print("=" * 60)

    target_manifest = MANIFEST_FILE if MANIFEST_FILE.exists() else TEMPLATE_MANIFEST
    print(f"[INFO] Menggunakan manifest: {target_manifest.relative_to(BASE_DIR)}")

    if not target_manifest.exists():
        print(f"[CRITICAL ERROR] Manifest tidak ditemukan: {target_manifest}")
        sys.exit(1)

    errors = []
    warnings = []

    with open(target_manifest, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"[INFO] Total baris manifest: {len(rows)}")

    # 1. Gallery Check
    if check_gallery_presence:
        if not GALLERY_FILE.exists():
            errors.append(f"Galeri {GALLERY_FILE.relative_to(BASE_DIR)} tidak ditemukan. Subjek TEST-QALWANI-001 belum terdaftar!")
        else:
            try:
                with open(GALLERY_FILE, "rb") as f:
                    gallery_data = pickle.load(f)
                if "TEST-QALWANI-001" not in gallery_data:
                    errors.append("Subjek 'TEST-QALWANI-001' TIDAK DITEMUKAN di galeri FaceNet! Evaluasi dihentikan.")
                else:
                    print("  [OK] Subjek 'TEST-QALWANI-001' terkonfirmasi ada di galeri FaceNet.")
            except Exception as e:
                errors.append(f"Gagal membaca file galeri: {e}")

    if not rows:
        warnings.append("Manifest masih kosong (0 baris sampel).")
        print("\n[SUMMARY] Pengujian manifest kosong selesai.")
        if errors:
            print(f"\n[FAILED] Ditemukan {len(errors)} error kritis:")
            for err in errors:
                print(f"  - {err}")
            sys.exit(1)
        else:
            print("[PASSED] Manifest template valid.")
            sys.exit(0)

    sample_ids = set()
    seen_hashes = defaultdict(list)
    split_files = defaultdict(set)
    split_hashes = defaultdict(set)

    for i, row in enumerate(rows, start=2):
        sid = row.get("sample_id")
        subject = row.get("subject_id")
        rel_path = row.get("relative_path")
        sample_type = row.get("sample_type")
        attack_type = row.get("attack_type")
        split = row.get("split")
        session = row.get("session_id")

        # Subject ID check
        if subject != "TEST-QALWANI-001":
            errors.append(f"Baris {i}: subject_id '{subject}' tidak konsisten (wajib 'TEST-QALWANI-001').")

        # Sample ID uniqueness
        if sid in sample_ids:
            errors.append(f"Baris {i}: Duplicate sample_id '{sid}'.")
        sample_ids.add(sid)

        # File existence & SHA-256 check
        if rel_path:
            file_path = BASE_DIR / rel_path
            if not file_path.exists():
                errors.append(f"Baris {i}: File tidak ditemukan di disk: {rel_path}")
            else:
                actual_hash = compute_sha256(file_path)
                expected_hash = row.get("sha256")
                if expected_hash and expected_hash != actual_hash:
                    errors.append(f"Baris {i}: SHA-256 mismatch untuk {rel_path}.")

                seen_hashes[actual_hash].append((i, rel_path, split))
                split_files[split].add(rel_path)
                split_hashes[split].add(actual_hash)

        # Label consistency
        if sample_type == "bona_fide" and attack_type and attack_type.strip() != "":
            errors.append(f"Baris {i}: bona_fide tidak boleh memiliki attack_type '{attack_type}'.")
        if sample_type != "bona_fide" and (not attack_type or attack_type.strip() == ""):
            errors.append(f"Baris {i}: {sample_type} wajib mengisi attack_type.")

    # 2. Data Leakage Check across splits
    active_splits = ["SESSION-E", "SESSION-C", "SESSION-T", "TRAIN", "CALIBRATION", "TEST"]
    for i_sp in range(len(active_splits)):
        for j_sp in range(i_sp + 1, len(active_splits)):
            sp1, sp2 = active_splits[i_sp], active_splits[j_sp]
            overlap = split_files[sp1].intersection(split_files[sp2])
            if overlap:
                errors.append(f"DATA LEAKAGE: Split '{sp1}' dan '{sp2}' berbagi file sama: {overlap}")
            hash_overlap = split_hashes[sp1].intersection(split_hashes[sp2])
            if hash_overlap:
                errors.append(f"DATA LEAKAGE: Split '{sp1}' dan '{sp2}' berbagi konten hash sama: {hash_overlap}")

    print("\n" + "=" * 60)
    if errors:
        print(f"[VALIDATION FAILED] Ditemukan {len(errors)} kesalahan kritis:")
        for err in errors:
            print(f"  [X] {err}")
        sys.exit(1)
    else:
        print("[VALIDATION PASSED] Dataset Qalwani tervalidasi 100% compliant!")
        if warnings:
            for w in warnings:
                print(f"  [*] Warning: {w}")
        sys.exit(0)

if __name__ == "__main__":
    check_gal = "--skip-gallery-check" not in sys.argv
    validate_qalwani_dataset(check_gallery_presence=check_gal)
