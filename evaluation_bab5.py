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
- S3: S1 == 1 DAN S_final = alpha * max(0, 1 - d / D_REF) + (1 - alpha) * P_live >= 0,50
  (keputusan D1, rumus b = FusionModule.decide_s3, D_REF = 1,20)

File Output CSV: Dataset_Eksperimen_Bab5_desktop_<DECISION_VERSION>.csv
Header: CSV_HEADER. Dataset_Eksperimen_Bab5.csv (rumus a) dibekukan: penulis ini
menolak menambah baris ke berkas dengan header lain.
"""

import os
import sys
import csv
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple, Dict, Any, Optional

# Root direktori proyek
BASE_DIR = Path(__file__).resolve().parent
LUX_FILE = BASE_DIR / "attendance-web" / "storage" / "app" / "lux_reading.json"
DISTANCE_FILE = BASE_DIR / "attendance-web" / "storage" / "app" / "distance_reading.json"
# Berkas lama (rumus a, header tanpa versi) tidak ditambah lagi. Baris desktop
# punya d dan participant_id dari jalur lain (CLAUDE.md bagian 2), jadi tidak
# satu berkas dengan baris web.
LEGACY_CSV_PATH = "Dataset_Eksperimen_Bab5.csv"

# Modul Liveness Deteksi Aktif (Challenge-Response)
from active_liveness import ActiveLivenessEMAR, evaluate_active_trial

# Ambang Tabel 5.2
from parameter_penelitian import (
    ALPHA_DEFAULT,
    EAR_BLINK_THRESHOLD,
    FACENET_DISTANCE_THRESHOLD,
    FUSION_D_REF,
    FUSION_THRESHOLD,
    DECISION_VERSION,
    EMAR_W1,
    EMAR_W2,
    LIVENESS_THRESHOLD,
    MAR_OPEN_THRESHOLD,
)

DEFAULT_CSV_PATH = f"Dataset_Eksperimen_Bab5_desktop_{DECISION_VERSION}.csv"
# Sumber P_live jalur ini: EAR terendah dan MAR tertinggi satu sesi, bukan siklus dlib.
LIVENESS_SOURCE = "desktop_session_extremes"
CSV_HEADER = [
    'participant_id', 'jarak_cm', 'lux', 'label_aktual',
    'euclidean_dist', 'ear', 'mar', 'keputusan_S1', 'keputusan_S2', 'keputusan_S3',
    'decision_version', 'liveness_source', 'recorded_at_utc',
]


# =============================================================================
# 1. WORKFLOW ALGORITMA EVALUASI SERENTAK (3 GERBANG SKENARIO)
# =============================================================================
def evaluate_trial(
    euclidean_dist: float,
    ear: float,
    mar: float,
    alpha: float = ALPHA_DEFAULT,
    threshold_s3: float = FUSION_THRESHOLD
) -> Tuple[int, int, int]:
    """
    Mengevaluasi satu percobaan (trial) biometrik ke dalam tiga skenario serentak,
    dengan definisi keputusan peneliti D1 (S3 = FusionModule.decide_s3, rumus b).

    Jalur desktop hanya punya EAR terendah dan MAR tertinggi satu sesi, bukan
    siklus. Kedip dianggap ada bila EAR < 0,20 dan mulut bila MAR >= 0,10, lalu
    P_live = 0,5 * kedip + 0,5 * mulut seperti EMARModule. Aturan ini lebih lemah
    dari siklus penuh dlib karena tidak memeriksa urutan buka-tutup.

    Args:
        euclidean_dist: Jarak Euclidean L2 FaceNet (0.0 = identik, > 0.40 = non-match)
        ear: EAR terendah sesi (EAR < 0.20 indikasi kedipan mata)
        mar: MAR tertinggi sesi (MAR >= 0.10 indikasi mulut terbuka)
        alpha: Bobot komponen wajah pada S3 (default: 0.6)
        threshold_s3: Ambang skor fusi S3 (default FUSION_THRESHOLD = 0.50)

    Returns:
        Tuple[int, int, int]: (s1_decision, s2_decision, s3_decision)
                              1 = ACCEPT (Bona-fide), 0 = REJECT (Spoof / Unrecognized)
    """
    # S1: FaceNet stand-alone, d <= 0,40.
    s1_decision = 1 if euclidean_dist <= FACENET_DISTANCE_THRESHOLD else 0

    # P_live tiga tingkat {0; 0,5; 1} seperti EMARModule.liveness_from_sequence.
    blink = 1.0 if ear < EAR_BLINK_THRESHOLD else 0.0
    mouth = 1.0 if mar >= MAR_OPEN_THRESHOLD else 0.0
    p_live = round(min(EMAR_W1 * blink + EMAR_W2 * mouth, 1.0), 6)

    # S2: identitas DAN liveness penuh (kedip DAN mulut).
    s2_decision = 1 if (s1_decision == 1 and p_live >= LIVENESS_THRESHOLD) else 0

    # S3: gerbang identitas DAN s_final = alpha * s_embed + (1 - alpha) * P_live >= 0,50.
    s_embed = max(0.0, 1.0 - euclidean_dist / FUSION_D_REF)
    s_final = alpha * s_embed + (1.0 - alpha) * p_live
    s3_decision = 1 if (s1_decision == 1 and s_final >= threshold_s3) else 0

    return s1_decision, s2_decision, s3_decision


# =============================================================================
# 2. WORKFLOW PEREKAMAN LOG KE CSV (DATA LOGGER)
# =============================================================================
def log_to_csv(
    participant_id: str,
    jarak: Optional[float],
    lux: Optional[float],
    label_aktual: str,
    euclidean_dist: Optional[float],
    ear: Optional[float],
    mar: Optional[float],
    s1: Optional[int],
    s2: Optional[int],
    s3: Optional[int],
    filename: str = DEFAULT_CSV_PATH
) -> str:
    """
    Menambah satu baris percobaan ke CSV. Header CSV_HEADER ditulis bila berkas
    belum ada. Nilai yang tidak diukur (None) ditulis sebagai sel kosong.
    Berkas yang sudah ada dengan header lain (misalnya Dataset_Eksperimen_Bab5.csv
    versi rumus a) ditolak agar dua definisi keputusan tidak bercampur.
    """
    file_exists = os.path.isfile(filename) and os.path.getsize(filename) > 0
    if file_exists:
        with open(filename, newline='', encoding='utf-8') as f:
            header = next(csv.reader(f), [])
        if header != CSV_HEADER:
            raise ValueError(
                f"{filename} memakai header lain (versi keputusan lama). "
                f"Tulis ke berkas baru, misalnya {DEFAULT_CSV_PATH}."
            )

    def cell(v: Optional[float]) -> Any:
        return '' if v is None else round(float(v), 3)

    def decision(v: Optional[int]) -> Any:
        return '' if v is None else int(v)

    with open(filename, mode='a', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        if not file_exists:
            writer.writerow(CSV_HEADER)
        writer.writerow([
            participant_id, '' if jarak is None else jarak, '' if lux is None else lux, label_aktual,
            cell(euclidean_dist), cell(ear), cell(mar),
            decision(s1), decision(s2), decision(s3),
            DECISION_VERSION, LIVENESS_SOURCE,
            datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
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
    threshold_s3: float = FUSION_THRESHOLD,
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

    # Skor pendukung untuk telemetri, rumus yang sama dengan evaluate_trial (D1).
    p_live = round(min(EMAR_W1 * (ear < EAR_BLINK_THRESHOLD) + EMAR_W2 * (mar >= MAR_OPEN_THRESHOLD), 1.0), 6)
    liveness_valid = p_live >= LIVENESS_THRESHOLD
    p_face = max(0.0, 1.0 - euclidean_dist / FUSION_D_REF)
    s_final = alpha * p_face + (1.0 - alpha) * p_live

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
    # Tanpa nilai bawaan: dulu 0,28/0,18/0,40 tercatat seolah-olah hasil ukur (D10).
    parser.add_argument("--dist", type=float, default=None, help="Jarak Euclidean L2 FaceNet (wajib tanpa --demo)")
    parser.add_argument("--ear", type=float, default=None, help="EAR terendah sesi (wajib tanpa --demo)")
    parser.add_argument("--mar", type=float, default=None, help="MAR tertinggi sesi (wajib tanpa --demo)")
    parser.add_argument("--alpha", type=float, default=ALPHA_DEFAULT, help="Bobot alpha S3 (default: 0.6)")
    parser.add_argument("--thresh-s3", type=float, default=FUSION_THRESHOLD, help="Ambang batas S3 (default: 0.50, keputusan D1)")
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
        research_csv = {
            p.resolve()
            for name in (DEFAULT_CSV_PATH, LEGACY_CSV_PATH)
            for p in (BASE_DIR / name, Path(name))
        }
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

    missing = [flag for flag, v in (("--dist", args.dist), ("--ear", args.ear), ("--mar", args.mar)) if v is None]
    if missing:
        parser.error("nilai hasil ukur wajib diisi: " + ", ".join(missing))

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
