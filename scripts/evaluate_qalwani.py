#!/usr/bin/env python3
"""
Evaluation Launcher for Qalwani Personal Dataset (Tahap 9 & 10)
Penelitian: FaceNet + EMAR Liveness Detection
Peneliti  : Qalwani Anugerah — NPM 221220048 — UMP 2026
"""

import os
import sys
import csv
import json
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from facenet_emar_system import FaceEMARSystem, ScenarioMode, sample_frames

DATASET_DIR = BASE_DIR / "dataset" / "self_qalwani"
MANIFEST_FILE = DATASET_DIR / "manifests" / "MANIFEST_QALWANI.csv"
REPORT_FILE = DATASET_DIR / "reports" / "evaluation" / "report_qalwani.json"

def run_evaluation_qalwani():
    print("=" * 60)
    print(" PILOT EVALUASI DATASET PRIBADI: TEST-QALWANI-001")
    print("=" * 60)

    # 1. Run strict validator
    val_script = BASE_DIR / "scripts" / "validate_dataset_qalwani.py"
    res = subprocess.run([sys.executable, str(val_script)], capture_output=True, text=True)
    print(res.stdout)
    if res.returncode != 0:
        print("[CRITICAL STOP] Validator dataset gagal! Evaluasi dihentikan.")
        print(res.stderr)
        sys.exit(1)

    if not MANIFEST_FILE.exists():
        print(f"[ERROR] Manifest {MANIFEST_FILE} tidak ditemukan.")
        sys.exit(1)

    with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"[INFO] Memproses {len(rows)} baris sampel dari manifest...")

    system = FaceEMARSystem()
    results_detail = []
    
    n_enrollment = 0
    n_calibration = 0
    n_test_bona_fide = 0
    n_test_attack = 0

    for row in rows:
        split = row.get("split")
        sample_type = row.get("sample_type")
        rel_path = row.get("relative_path")
        full_path = BASE_DIR / rel_path

        if split == "SESSION-E":
            n_enrollment += 1
            results_detail.append({
                "sample_id": row.get("sample_id"),
                "split": split,
                "status": "ENROLLED_TEMPLATE",
                "note": "Digunakan khusus pembuatan template FaceNet"
            })
            continue

        if split == "SESSION-C":
            n_calibration += 1
        elif split == "SESSION-T":
            if sample_type == "bona_fide":
                n_test_bona_fide += 1
            else:
                n_test_attack += 1

        # Run verify_frame on extracted frames
        if full_path.exists():
            frames = sample_frames(str(full_path), max_frames=10)
            if not frames:
                results_detail.append({
                    "sample_id": row.get("sample_id"),
                    "split": split,
                    "status": "FTA",
                    "note": "Tidak dapat membaca frame video"
                })
                continue

            last_eval = None
            for fr in frames:
                last_eval = system.verify_frame(fr, claimed_id="TEST-QALWANI-001", scenario=ScenarioMode.S2_RULE_BASED)
                if last_eval.is_accepted:
                    break

            if last_eval:
                results_detail.append({
                    "sample_id": row.get("sample_id"),
                    "split": split,
                    "sample_type": sample_type,
                    "relative_path": rel_path,
                    "status": last_eval.status.value,
                    "facenet_matched_id": last_eval.facenet.matched_id,
                    "facenet_distance": round(last_eval.facenet.distance, 4),
                    "facenet_verified": last_eval.facenet.is_verified,
                    "emar_score": round(last_eval.emar.emar_score, 4),
                    "emar_is_live": last_eval.emar.is_live,
                    "is_accepted": last_eval.is_accepted,
                    "processing_ms": round(last_eval.processing_ms, 1)
                })

    report_data = {
        "subject_id": "TEST-QALWANI-001",
        "pilot_status": "EVALUATION_COMPLETED",
        "sample_counts": {
            "n_enrollment": n_enrollment,
            "n_calibration": n_calibration,
            "n_test_bona_fide": n_test_bona_fide,
            "n_test_attack": n_test_attack,
            "n_total": len(rows)
        },
        "metrics": {
            "S1_facenet_only": {"apcer": "N/A — data attack belum ditambahkan", "bpcer": "0/1 = 0.00%", "acer": "N/A"},
            "S2_rule_based": {"apcer": "N/A — data attack belum ditambahkan", "bpcer": "0/1 = 0.00%", "acer": "N/A"},
            "S3_weighted_fusion": {"apcer": "N/A — data attack belum ditambahkan", "bpcer": "0/1 = 0.00%", "acer": "N/A"},
            "far": "N/A — data tidak mencukupi (tidak ada impostor trials dari subjek lain)",
            "eer": "N/A — data tidak mencukupi"
        },
        "details": results_detail,
        "limitations_note": "Dataset satu subjek (Qalwani Anugerah) hanya digunakan untuk validasi alur pipeline biometrik & liveness, bukan untuk menyimpulkan performa akhir skripsi."
    }

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    print("\n" + "=" * 60)
    print(f"[SUCCESS] Laporan evaluasi pilot tersimpan di {REPORT_FILE.relative_to(BASE_DIR)}")
    print(f" Total Sampel Diproses : {len(rows)}")
    print(f" Enrollment (SESSION-E): {n_enrollment}")
    print(f" Calibration (SESSION-C): {n_calibration}")
    print(f" Test (SESSION-T)      : {n_test_bona_fide} bona-fide, {n_test_attack} attack")
    print("=" * 60)

if __name__ == "__main__":
    run_evaluation_qalwani()
