#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MODUL EVALUASI SERENTAK 3 SKENARIO & DATA LOGGER CSV (BAB 5)
Penelitian Skripsi: FaceNet + Eye-Mouth Aspect Ratio (EMAR)
Peneliti          : Qalwani Anugerah — NPM 221220048 — UMP 2026
=============================================================================

Skenario Pengujian (ISO/IEC 30107-3):
- S1: FaceNet Stand-alone (Jarak Euclidean <= 0.40 -> 1, selain itu 0)
- S2: Rule-Based Gate (S1 == 1 DAN (EAR < 0.20 AND MAR >= 0.10) -> 1, selain itu 0)
- S3: Weighted Fusion (S_final = alpha*P_face + (1-alpha)*P_live >= threshold_s3 -> 1, selain itu 0)

File Output CSV: Dataset_Eksperimen_Bab5.csv
Header: participant_id, jarak_cm, lux, label_aktual, euclidean_dist, ear, mar, keputusan_S1, keputusan_S2, keputusan_S3
"""

import os
import sys
import csv
import json
import argparse
from pathlib import Path
from typing import Tuple, Dict, Any, Optional

# Root direktori proyek
BASE_DIR = Path(__file__).resolve().parent
LUX_FILE = BASE_DIR / "attendance-web" / "storage" / "app" / "lux_reading.json"
DISTANCE_FILE = BASE_DIR / "attendance-web" / "storage" / "app" / "distance_reading.json"
DEFAULT_CSV_PATH = "Dataset_Eksperimen_Bab5.csv"

# Modul Liveness Deteksi Aktif (Challenge-Response)
from active_liveness import ActiveLivenessEMAR, evaluate_active_trial

# Ambang Tabel 5.2
from parameter_penelitian import (
    ALPHA_DEFAULT,
    EAR_BLINK_THRESHOLD,
    FACENET_DISTANCE_THRESHOLD,
    MAR_OPEN_THRESHOLD,
)


# =============================================================================
# 1. WORKFLOW ALGORITMA EVALUASI SERENTAK (3 GERBANG SKENARIO)
# =============================================================================
def evaluate_trial(
    euclidean_dist: float,
    ear: float,
    mar: float,
    alpha: float = ALPHA_DEFAULT,
    threshold_s3: float = 0.75
) -> Tuple[int, int, int]:
    """
    Mengevaluasi satu percobaan (trial) biometrik ke dalam tiga skenario serentak:
    
    Args:
        euclidean_dist: Jarak Euclidean L2 FaceNet (0.0 = identik, > 0.40 = non-match)
        ear: Eye Aspect Ratio (EAR < 0.20 indikasi kedipan mata)
        mar: Mouth Aspect Ratio (MAR >= 0.10 indikasi gerakan mulut terbuka)
        alpha: Bobot komponen wajah pada S3 (default: 0.6)
        threshold_s3: Ambang batas skor fusi S3 untuk ACCEPT (default: 0.75)
        
    Returns:
        Tuple[int, int, int]: (s1_decision, s2_decision, s3_decision)
                              1 = ACCEPT (Bona-fide), 0 = REJECT (Spoof / Unrecognized)
    """
    # ==========================================
    # SKENARIO 1 (S1): FaceNet Stand-alone
    # Mengabaikan liveness, hanya melihat kemiripan wajah
    # ==========================================
    if euclidean_dist <= FACENET_DISTANCE_THRESHOLD:
        s1_decision = 1  # 1 = ACCEPT (Bona-fide)
    else:
        s1_decision = 0  # 0 = REJECT (Spoof/Unrecognized)

    # ==========================================
    # SKENARIO 2 (S2): Rule-Based Gate (FaceNet + EMAR)
    # Wajib Lolos Wajah DAN Lolos Kedipan/Mulut
    # ==========================================
    liveness_valid = (ear < EAR_BLINK_THRESHOLD) and (mar >= MAR_OPEN_THRESHOLD)
    
    if (s1_decision == 1) and liveness_valid:
        s2_decision = 1
    else:
        s2_decision = 0

    # ==========================================
    # SKENARIO 3 (S3): Weighted Fusion (FaceNet + EMAR)
    # Menghitung probabilitas fusi menggunakan bobot alpha
    # ==========================================
    # Mengubah Euclidean L2 menjadi probabilitas (P_face) 
    # (Asumsi: Jarak 0 = 100% mirip, Jarak 1.5 = 0% mirip)
    p_face = max(0.0, 1.0 - (euclidean_dist / 1.5)) 
    
    # Probabilitas Liveness (P_live)
    p_live = 1.0 if liveness_valid else 0.0
    
    # Kalkulasi Skor Fusi: S_final = a(P_face) + (1-a)(P_live)
    s_final = (alpha * p_face) + ((1.0 - alpha) * p_live)
    
    if s_final >= threshold_s3:
        s3_decision = 1
    else:
        s3_decision = 0

    return s1_decision, s2_decision, s3_decision


# =============================================================================
# 2. WORKFLOW PEREKAMAN LOG KE CSV (DATA LOGGER)
# =============================================================================
def log_to_csv(
    participant_id: str,
    jarak: float,
    lux: float,
    label_aktual: str,
    euclidean_dist: float,
    ear: float,
    mar: float,
    s1: int,
    s2: int,
    s3: int,
    filename: str = DEFAULT_CSV_PATH
) -> str:
    """
    Menyimpan satu baris data pengujian serentak langsung ke format CSV.
    Membuat file dengan header standar jika file belum ada.
    """
    file_exists = os.path.isfile(filename)
    
    with open(filename, mode='a', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        # Tulis Header jika file baru dibuat
        if not file_exists:
            writer.writerow([
                'participant_id', 'jarak_cm', 'lux', 'label_aktual', 
                'euclidean_dist', 'ear', 'mar', 'keputusan_S1', 'keputusan_S2', 'keputusan_S3'
            ])
        
        # Tulis baris data pengujian
        writer.writerow([
            participant_id, jarak, lux, label_aktual, 
            round(float(euclidean_dist), 3), round(float(ear), 3), round(float(mar), 3),
            int(s1), int(s2), int(s3)
        ])
        
    return filename


# =============================================================================
# 3. HELPER PEMBACA SENSOR LIVE & RUNNER BERSAMA
# =============================================================================
def read_live_environment_sensors() -> Tuple[Optional[float], Optional[float]]:
    """
    Jarak dan lux live dari sidecar sensor Laravel, dengan aturan yang sama
    dengan capture_session.read_sidecar (segar <= 10 s, bukan preset/fallback).
    None bila tidak ada bacaan hasil ukur; CSV lalu berisi sel kosong. Dulu
    nilainya jatuh ke 30 cm / 300 lux dan tercatat seolah-olah terukur.
    """
    from capture_session import read_sidecar

    return read_sidecar(DISTANCE_FILE, "distance_cm"), read_sidecar(LUX_FILE, "lux")


def evaluate_and_log(
    participant_id: str,
    jarak: Optional[float],
    lux: Optional[float],
    label_aktual: str,
    euclidean_dist: float,
    ear: float,
    mar: float,
    alpha: float = ALPHA_DEFAULT,
    threshold_s3: float = 0.75,
    filename: str = DEFAULT_CSV_PATH
) -> Dict[str, Any]:
    """
    Fungsi all-in-one: Mengevaluasi 3 skenario serentak lalu menyimpannya ke CSV.
    """
    # Auto-read sensors jika jarak atau lux None
    live_dist, live_lux = read_live_environment_sensors()
    final_jarak = jarak if jarak is not None else live_dist
    final_lux = lux if lux is not None else live_lux

    s1, s2, s3 = evaluate_trial(
        euclidean_dist=euclidean_dist,
        ear=ear,
        mar=mar,
        alpha=alpha,
        threshold_s3=threshold_s3
    )

    # Logging ke CSV
    saved_path = log_to_csv(
        participant_id=participant_id,
        jarak=final_jarak,
        lux=final_lux,
        label_aktual=label_aktual,
        euclidean_dist=euclidean_dist,
        ear=ear,
        mar=mar,
        s1=s1,
        s2=s2,
        s3=s3,
        filename=filename
    )

    # Hitung probabilitas pendukung untuk telemetri
    liveness_valid = (ear < EAR_BLINK_THRESHOLD) and (mar >= MAR_OPEN_THRESHOLD)
    p_face = max(0.0, 1.0 - (euclidean_dist / 1.5))
    p_live = 1.0 if liveness_valid else 0.0
    s_final = (alpha * p_face) + ((1.0 - alpha) * p_live)

    return {
        "participant_id": participant_id,
        "jarak_cm": final_jarak,
        "lux": final_lux,
        "label_aktual": label_aktual,
        "euclidean_dist": round(euclidean_dist, 3),
        "ear": round(ear, 3),
        "mar": round(mar, 3),
        "s1_decision": s1,
        "s2_decision": s2,
        "s3_decision": s3,
        "liveness_valid": liveness_valid,
        "p_face": round(p_face, 3),
        "p_live": round(p_live, 3),
        "s_final": round(s_final, 3),
        "csv_saved_to": saved_path
    }


# =============================================================================
# 4. CLI INTERFACE UNTUK PENGUJIAN MANUAL & OTOMASI
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="Evaluasi Serentak 3 Skenario (S1, S2, S3) & Perekam Log CSV Bab 5"
    )
    parser.add_argument("--dist", type=float, default=0.28, help="Jarak Euclidean L2 FaceNet (default: 0.28)")
    parser.add_argument("--ear", type=float, default=0.18, help="Nilai Eye Aspect Ratio (default: 0.18)")
    parser.add_argument("--mar", type=float, default=0.40, help="Nilai Mouth Aspect Ratio (default: 0.40)")
    parser.add_argument("--alpha", type=float, default=ALPHA_DEFAULT, help="Bobot alpha S3 (default: 0.6)")
    parser.add_argument("--thresh-s3", type=float, default=0.75, help="Ambang batas S3 (default: 0.75)")
    parser.add_argument("--participant", type=str, default="P01", help="ID Partisipan (contoh: P01, Guru-01)")
    parser.add_argument("--jarak", type=float, default=None, help="Jarak fisik cm (baca dari sensor jika kosong)")
    parser.add_argument("--lux", type=float, default=None, help="Intensitas cahaya lux (baca dari sensor jika kosong)")
    parser.add_argument("--label", type=str, default="Bona_Fide",
                        choices=["Bona_Fide", "Print_Attack", "Screen_Attack", "Replay_Video"],
                        help="Label aktual sampel (default: Bona_Fide)")
    parser.add_argument("--csv", type=str, default=DEFAULT_CSV_PATH, help="Nama file CSV output")
    parser.add_argument("--demo", action="store_true", help="Jalankan simulasi 4 jenis pengujian representatif")

    args = parser.parse_args()

    if args.demo:
        # Demo menulis baris simulasi P01-P04; tanpa --csv lain baris itu
        # masuk ke dataset riset seolah-olah hasil pengujian.
        research_csv = {(BASE_DIR / DEFAULT_CSV_PATH).resolve(), Path(DEFAULT_CSV_PATH).resolve()}
        if Path(args.csv).resolve() in research_csv:
            print("--demo menulis baris simulasi. Tentukan --csv ke berkas lain, bukan "
                  f"{DEFAULT_CSV_PATH} (dataset riset).", file=sys.stderr)
            sys.exit(2)
        print("=" * 70)
        print(" DEMO SIMULASI EVALUASI SERENTAK 3 SKENARIO (BAB 5)")
        print("=" * 70)
        test_cases = [
            ("P01", 30, 300, "Bona_Fide", 0.25, 0.17, 0.42),       # Wajah cocok + Kedip & Mulut -> S1=1, S2=1, S3=1
            ("P02", 45, 150, "Print_Attack", 0.32, 0.29, 0.08),    # Wajah mirip + Tanpa Kedip/Mulut -> S1=1, S2=0, S3=0
            ("P03", 60, 550, "Screen_Attack", 0.38, 0.28, 0.12),   # Layar HP diam -> S1=1, S2=0, S3=0
            ("P04", 30, 300, "Bona_Fide_Unknown", 1.25, 0.16, 0.40)# Wajah asing (Jarak > 0.40) -> S1=0, S2=0, S3=0
        ]
        for p, j, l, lbl, d, ear, mar in test_cases:
            res = evaluate_and_log(
                participant_id=p,
                jarak=j,
                lux=l,
                label_aktual=lbl,
                euclidean_dist=d,
                ear=ear,
                mar=mar,
                alpha=args.alpha,
                threshold_s3=args.thresh_s3,
                filename=args.csv
            )
            print(f"[{lbl:18s}] Dist={d:.2f} EAR={ear:.2f} MAR={mar:.2f} -> "
                  f"S1={res['s1_decision']} | S2={res['s2_decision']} | S3={res['s3_decision']} "
                  f"(S_final={res['s_final']:.3f})")
        print(f"\n[OK] Seluruh baris simulasi berhasil dicatat ke: {args.csv}")
        print("=" * 70)
        return

    # Single execution
    res = evaluate_and_log(
        participant_id=args.participant,
        jarak=args.jarak,
        lux=args.lux,
        label_aktual=args.label,
        euclidean_dist=args.dist,
        ear=args.ear,
        mar=args.mar,
        alpha=args.alpha,
        threshold_s3=args.thresh_s3,
        filename=args.csv
    )

    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
