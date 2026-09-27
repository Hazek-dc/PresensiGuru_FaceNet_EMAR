#!/usr/bin/env python3
"""
Dataset Preparation & Evaluation Launcher
Penelitian: FaceNet + EMAR Liveness Detection
Peneliti  : Qalwani Anugerah — NPM 221220048 — UMP 2026
"""

import os
import sys
import csv
import re
import random
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "dataset"
RESULTS_DIR = BASE_DIR / "results"
SUBJECTS_FILE = DATA_DIR / "subjects.csv"

def create_directory_structure():
    dirs = [
        DATA_DIR / "foto_selfie",
        DATA_DIR / "video_singkat",
        DATA_DIR / "frame_hasil",
        RESULTS_DIR
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    print("[OK] Struktur folder dataset lokal telah disiapkan.")

def load_subjects():
    if not SUBJECTS_FILE.exists():
        print(f"[ERROR] Roster identitas tidak ditemukan: {SUBJECTS_FILE}")
        return []
    
    subjects = []
    with open(SUBJECTS_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["match_keywords"] = [k.strip().lower() for k in row["match_keywords"].split(",")]
            subjects.append(row)
    return subjects

def match_subject(filename, subjects):
    fname_lower = filename.lower()
    for sub in subjects:
        if sub["subject_id"].lower() in fname_lower:
            return sub["subject_id"]
        for kw in sub["match_keywords"]:
            if kw and kw in fname_lower:
                return sub["subject_id"]
    return None

def auto_generate_manifest_if_needed(target_manifest: Path):
    print("[AUTO-MANIFEST] Memulai pembuatan manifest ketat (strict mode)...")
    
    subjects = load_subjects()
    if not subjects:
        return
        
    foto_dir = DATA_DIR / "foto_selfie"
    video_dir = DATA_DIR / "video_singkat"
    
    image_files = list(foto_dir.glob("*.jpg")) + list(foto_dir.glob("*.jpeg")) + list(foto_dir.glob("*.png"))
    video_files = list(video_dir.glob("*.mp4")) + list(video_dir.glob("*.webm")) + list(video_dir.glob("*.avi"))
    
    rows = []
    
    # Process enrollment images
    enrolled_count = 0
    for img in image_files:
        subject_id = match_subject(img.name, subjects)
        if not subject_id:
            print(f"[WARN] File {img.name} tidak dikenali sebagai subject manapun. Diabaikan.")
            continue
            
        rel_path = img.relative_to(BASE_DIR).as_posix()
        sample_id = f"ENR_{subject_id}_{img.stem[:6]}"
        rows.append({
            "sample_id": sample_id,
            "subject_id": subject_id,
            "claimed_subject_id": subject_id,
            "sample_type": "bona_fide",
            "pai_species": "bona_fide",
            "lux_category": "normal",
            "distance_cm": 60,
            "session": "enrollment",
            "split": "TRAIN",
            "image_path": rel_path,
            "gt_label": 1
        })
        enrolled_count += 1
        
    # Process probe videos
    probe_count = 0
    for vid in video_files:
        subject_id = match_subject(vid.name, subjects)
        if not subject_id:
            # Maybe it's a spoof without a clear subject id?
            if "spoof" in vid.name.lower():
                subject_id = "UNKNOWN_SPOOF"
            else:
                print(f"[WARN] Video {vid.name} tidak dikenali. Diabaikan.")
                continue
                
        is_spoof = "spoof" in vid.name.lower() or "attack" in vid.name.lower() or "screen" in vid.name.lower()
        
        sample_type = "screen_attack" if is_spoof else "bona_fide"
        pai_species = "screen_phone" if is_spoof else "bona_fide"
        gt_label = 0 if is_spoof else 1
        prefix = "ATK" if is_spoof else "PROBE"
        
        claimed_subject_id = subject_id
        if subject_id == "UNKNOWN_SPOOF":
            # For spoof videos without specific subject, we simulate claiming a valid ID to test PAD
            claimed_subject_id = "S01"
            
        # Random assignment of splits
        rand = random.random()
        if rand < 0.2:
            split = "CALIBRATION"
        else:
            split = "TEST"
            
        rel_path = vid.relative_to(BASE_DIR).as_posix()
        sample_id = f"{prefix}_{claimed_subject_id}_{vid.stem[:8]}"
        
        rows.append({
            "sample_id": sample_id,
            "subject_id": subject_id,
            "claimed_subject_id": claimed_subject_id,
            "sample_type": sample_type,
            "pai_species": pai_species,
            "lux_category": "normal",
            "distance_cm": 60,
            "session": "probe",
            "split": split,
            "image_path": rel_path,
            "gt_label": gt_label
        })
        probe_count += 1

    fieldnames = ["sample_id", "subject_id", "claimed_subject_id", "sample_type", "pai_species", "lux_category", "distance_cm", "session", "split", "image_path", "gt_label"]
    with open(target_manifest, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print("\n" + "="*50)
    print(" STRICT VALIDATION REPORT")
    print("="*50)
    print(f" Total Manifest Rows : {len(rows)}")
    print(f" Enrollment Samples  : {enrolled_count} (Dari foto_selfie)")
    print(f" Probe Samples       : {probe_count} (Dari video_singkat)")
    print(f" File frame_hasil    : DIABAIKAN SECARA EKSPLISIT")
    print("="*50 + "\n")

def run_evaluation(manifest_file: Path):
    if not manifest_file.exists():
        print(f"[ERROR] File manifest '{manifest_file}' tidak ditemukan!")
        return

    print(f"[RUN] Memulai Evaluasi Metrik ISO/IEC 30107-3 menggunakan manifest: {manifest_file}")
    
    sys.path.append(str(BASE_DIR))
    from facenet_emar_system import FaceEMARSystem
    
    system = FaceEMARSystem()
    metrics = system.evaluate_dataset(str(manifest_file), str(BASE_DIR))
    
    print("\n" + "="*55)
    print(" HASIL EVALUASI METRIK BIOMETRIK ISO/IEC 30107-3")
    print("="*55)
    for m in metrics:
        print(f"[{m.scenario} | Kondisi: {m.condition}]")
        print(f"   * APCER  : {m.apcer * 100:.2f}% (Attack Presentation Classification Error Rate)")
        print(f"   * BPCER  : {m.bpcer * 100:.2f}% (Bona-fide Presentation Classification Error Rate)")
        print(f"   * ACER   : {m.acer * 100:.2f}%  (Average Classification Error Rate)")
        print(f"   * Akurasi: {m.accuracy * 100:.2f}% | F1-Score: {m.f1 * 100:.2f}% | Total Sampel: {m.n_total}")
        print("-" * 55)

if __name__ == "__main__":
    create_directory_structure()
    
    # We enforce generation to avoid reusing the old messy manifest
    manifest_target = DATA_DIR / "MANIFEST_UJI.csv"
    auto_generate_manifest_if_needed(manifest_target)

    if manifest_target.exists():
        run_evaluation(manifest_target)
    else:
        print("\n[INFO] Gagal membuat manifest.")
