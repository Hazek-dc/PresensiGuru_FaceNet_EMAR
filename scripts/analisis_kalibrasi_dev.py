#!/usr/bin/env python3
"""
Tabel kalibrasi ambang dari data mandiri peneliti (split calibration_dev).

Masukan:
  --riwayat  CSV "Riwayat_Presensi_dan_Log_Aktivitas_*.csv" dari dashboard/riwayat.
  --frames   logs/log_raw_frames_dev.csv (deret EAR/MAR per frame), opsional.

Keluaran di --out (bawaan exports/kalibrasi_dev/):
  presentasi_anonim.csv     satu baris per presentasi, tanpa nama/email/IP/perangkat
  tabel2a_ambang_l2.csv     FNMR bona fide dan IAPMR per spesies untuk tiap ambang L2
  tabel2b_ambang_emar.csv   APCER/BPCER/ACER untuk tiap pasangan ambang EAR x MAR
  tabel2c_bobot_alpha.csv   keputusan S3 untuk tiap alpha, termasuk ambang L2 tersiratnya
  tabel3_apcer_kondisi.csv  APCER per spesies dan BPCER per sel 3 lux x 3 jarak

Aturan yang dipakai (sama dengan sistem, lihat parameter_penelitian.py):
  - FTA (mesin tidak menghasilkan jarak L2) dilaporkan terpisah dan tidak masuk
    penyebut APCER/BPCER. Presentasi saat mesin tidak terhubung juga dikeluarkan.
  - Kondisi dikelompokkan menurut target skenario (Target Lux/Jarak Skenario),
    bukan hasil ukur: pada serangan, jarak kamera membaca ukuran wajah di foto
    atau layar, bukan jarak artefak.
  - Tabel 2b menghitung ulang siklus kedip/mulut dari deret per frame dengan
    aturan pasif naskah (>= 1 siklus kedip DAN >= 1 siklus mulut). Keputusan
    sistem yang tercatat memakai tantangan acak, yang waktunya tidak tercatat
    per frame, sehingga 2b adalah analisis ambang, bukan ulangan keputusan sistem.
  - ACER = (APCER spesies terburuk + BPCER) / 2, mengikuti protokol OULU-NPU.
    ACER bukan metrik normatif ISO/IEC 30107-3; laporkan APCER per spesies juga.

Semua presentasi berasal dari satu orang, jadi tidak saling bebas. Interval
Wilson di Tabel 3 hanya gambaran ketidakpastian dan terlalu sempit untuk
digeneralisasi ke subjek lain.
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from parameter_penelitian import (  # noqa: E402
    ATTACK_LABELS,
    DISTANCE_CM,
    FACENET_DISTANCE_THRESHOLD,
    kategori_lux,
)

SPLIT = "calibration_dev"
ENGINE_LABEL = "Mesin biometrik"
UNAVAILABLE_LABEL = "Mesin tidak dapat dihubungi"

# Bobot dan ambang S3 sama dengan PresensiController: S = a*P_face + (1-a)*P_live >= 0,75.
S3_ACCEPT = 0.75
P_FACE_SCALE = 1.5

L2_GRID = (0.30, 0.35, 0.40, 0.45, 0.50)
EAR_GRID = (0.15, 0.18, 0.20, 0.25)
MAR_GRID = (0.05, 0.10, 0.15, 0.20)
ALPHA_GRID = (0.30, 0.50, 0.60, 0.70)
LUX_ORDER = ("redup", "normal", "terang")

# Kolom ekspor riwayat yang boleh keluar dari skrip ini.
ANON_COLUMNS = {
    "ID Record Presensi": "trial_id",
    "ID Partisipan": "participant_id",
    "Split Dataset": "dataset_split",
    "Tanggal": "tanggal",
    "Jam": "jam",
    "Label Sampel": "sample_type",
    "Spesies PAI": "pai_species",
    "Target Lux Skenario": "lux_target",
    "Target Jarak Skenario (cm)": "distance_target_cm",
    "Lux": "lux_terukur",
    "Sumber Lux": "sumber_lux",
    "Jarak Kamera (cm)": "jarak_terukur_cm",
    "Sumber Jarak": "sumber_jarak",
    "Sumber Biometrik": "sumber_biometrik",
    "Jarak Euclidean (L2)": "euclidean_distance",
    "Prediksi PAD": "pad_pred",
    "Prediksi Identitas": "id_pred",
    "Keputusan Final": "final_decision",
    "Tantangan": "active_challenge",
    "Hasil Tantangan": "challenge_status",
    "Kedipan (EAR)": "ear_blinks",
    "Gerak Mulut (MAR)": "mar_mouths",
    "Wajah Stabil (%)": "face_detected_pct",
    "S1": "s1",
    "S2": "s2",
    "S3": "s3",
    "S Final": "s_final",
}


def _float(value: str) -> Optional[float]:
    try:
        return float(value) if value not in ("", None) else None
    except ValueError:
        return None


def read_csv(path: Path) -> List[Dict[str, str]]:
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def load_trials(rows: Iterable[Dict[str, str]], participant: str) -> List[Dict[str, object]]:
    """Baris Presensi calibration_dev milik partisipan, dengan label yang sudah diperiksa."""
    trials = []
    for row in rows:
        if row.get("Jenis") != "Presensi" or row.get("Split Dataset") != SPLIT:
            continue
        if row.get("ID Partisipan") != participant:
            continue
        sample = row.get("Label Sampel", "")
        species = row.get("Spesies PAI", "")
        if sample == "BONA_FIDE":
            label = "bona_fide"
        elif sample == "ATTACK" and species in ATTACK_LABELS:
            label = species
        else:
            raise ValueError(f"presentasi #{row.get('ID Record Presensi')} tanpa label sah: {sample!r}/{species!r}")
        lux_target = _float(row.get("Target Lux Skenario", ""))
        distance_target = _float(row.get("Target Jarak Skenario (cm)", ""))
        if lux_target is None or distance_target is None:
            raise ValueError(f"presentasi #{row.get('ID Record Presensi')} tanpa target skenario")
        source = row.get("Sumber Biometrik", "")
        trials.append({
            "row": row,
            "trial_id": row.get("ID Record Presensi", ""),
            "label": label,
            "lux": kategori_lux(lux_target),
            "distance": int(round(distance_target)),
            "unavailable": source == UNAVAILABLE_LABEL,
            "fta": source != ENGINE_LABEL and source != UNAVAILABLE_LABEL,
            "l2": _float(row.get("Jarak Euclidean (L2)", "")),
            "pad_bona_fide": row.get("Prediksi PAD") == "BONA_FIDE",
            "challenge_pass": row.get("Hasil Tantangan") == "PASS_LIVENESS" if row.get("Hasil Tantangan") else None,
        })
    return trials


def write_anonymized(trials: Sequence[Dict[str, object]], path: Path) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(list(ANON_COLUMNS.values()) + ["lux_kategori", "fta"])
        for t in trials:
            row = t["row"]
            writer.writerow([row.get(src, "") for src in ANON_COLUMNS] + [t["lux"], int(bool(t["fta"]))])


def measured(trials: Iterable[Dict[str, object]]) -> List[Dict[str, object]]:
    """Presentasi yang masuk penyebut: bukan FTA dan mesin terhubung."""
    return [t for t in trials if not t["fta"] and not t["unavailable"] and t["l2"] is not None]


def rate(errors: int, total: int) -> Optional[float]:
    return errors / total if total else None


def wilson(errors: int, total: int, z: float = 1.959964) -> Tuple[Optional[float], Optional[float]]:
    if total == 0:
        return None, None
    p = errors / total
    denom = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denom
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def fmt(value: Optional[float]) -> str:
    return "" if value is None else f"{value:.4f}"


def fmt_interval(pair: Tuple[Optional[float], Optional[float]]) -> str:
    return "" if pair[0] is None else f"{pair[0]:.4f}-{pair[1]:.4f}"


# ---------------------------------------------------------------- Tabel 2a

def table_l2(trials: Sequence[Dict[str, object]], grid: Sequence[float] = L2_GRID) -> List[List[str]]:
    rows = [["ambang_l2", "n_bona_fide", "fnmr_bona_fide"]
            + [f"{k}_{s}" for s in ATTACK_LABELS for k in ("n", "iapmr")]]
    data = measured(trials)
    bona = [t for t in data if t["label"] == "bona_fide"]
    for tau in grid:
        line = [f"{tau:.2f}", str(len(bona)), fmt(rate(sum(t["l2"] > tau for t in bona), len(bona)))]
        for species in ATTACK_LABELS:
            attacks = [t for t in data if t["label"] == species]
            line += [str(len(attacks)), fmt(rate(sum(t["l2"] <= tau for t in attacks), len(attacks)))]
        rows.append(line)
    return rows


# ---------------------------------------------------------------- Tabel 2b

def count_cycles(active: Iterable[bool]) -> int:
    """Siklus penuh nonaktif -> aktif -> nonaktif, sama dengan CycleCounter di emarGeometry.ts."""
    count, is_active, seen_inactive = 0, False, False
    for flag in active:
        if flag:
            if seen_inactive:
                is_active = True
            continue
        seen_inactive = True
        if is_active:
            is_active = False
            count += 1
    return count


def load_frames(path: Path) -> Dict[str, List[Tuple[float, float, float]]]:
    series: Dict[str, List[Tuple[int, float, float, float]]] = defaultdict(list)
    for row in read_csv(path):
        ear, mar = _float(row.get("raw_ear", "")), _float(row.get("raw_mar", ""))
        t_ms = _float(row.get("t_ms", ""))
        if ear is None or mar is None or t_ms is None:
            continue
        series[row["attendance_id"]].append((int(row.get("frame_idx") or 0), t_ms, ear, mar))
    return {k: [(t, e, m) for _, t, e, m in sorted(v)] for k, v in series.items()}


def passive_live(frames: Sequence[Tuple[float, float, float]], ear_tau: float, mar_tau: float) -> bool:
    blinks = count_cycles(ear < ear_tau for _, ear, _ in frames)
    mouths = count_cycles(mar >= mar_tau for _, _, mar in frames)
    return blinks >= 1 and mouths >= 1


def pad_errors(decisions: Sequence[Tuple[str, bool]]) -> Dict[str, Optional[float]]:
    """APCER per spesies, APCER terburuk, BPCER, ACER dari pasangan (label, prediksi_bona_fide)."""
    out: Dict[str, Optional[float]] = {}
    bona = [live for label, live in decisions if label == "bona_fide"]
    out["n_bona_fide"] = len(bona)
    out["bpcer"] = rate(sum(not live for live in bona), len(bona))
    worst = None
    for species in ATTACK_LABELS:
        attacks = [live for label, live in decisions if label == species]
        out[f"n_{species}"] = len(attacks)
        apcer = rate(sum(attacks), len(attacks))
        out[f"apcer_{species}"] = apcer
        if apcer is not None:
            worst = apcer if worst is None else max(worst, apcer)
    out["apcer_max"] = worst
    out["acer"] = None if worst is None or out["bpcer"] is None else (worst + out["bpcer"]) / 2
    return out


def table_emar(trials: Sequence[Dict[str, object]], frames: Dict[str, List[Tuple[float, float, float]]],
               ear_grid: Sequence[float] = EAR_GRID, mar_grid: Sequence[float] = MAR_GRID) -> List[List[str]]:
    usable = [t for t in measured(trials) if frames.get(str(t["trial_id"]))]
    keys = ["n_bona_fide", "bpcer"] + [f"{k}_{s}" for s in ATTACK_LABELS for k in ("n", "apcer")] + ["apcer_max", "acer"]
    rows = [["ambang_ear", "ambang_mar"] + keys]
    for ear_tau in ear_grid:
        for mar_tau in mar_grid:
            decisions = [(str(t["label"]), passive_live(frames[str(t["trial_id"])], ear_tau, mar_tau)) for t in usable]
            res = pad_errors(decisions)
            rows.append([f"{ear_tau:.2f}", f"{mar_tau:.2f}"]
                        + [str(res[k]) if k.startswith("n_") else fmt(res[k]) for k in keys])
    return rows


# ---------------------------------------------------------------- Tabel 2c

def implied_l2(alpha: float) -> Optional[float]:
    """Jarak L2 terbesar yang masih diterima S3 bila P_live = 1; None bila tidak ada."""
    p_face_min = (S3_ACCEPT - (1 - alpha)) / alpha
    if p_face_min > 1:
        return None
    return P_FACE_SCALE * (1 - max(0.0, p_face_min))


def s3_accept(l2: float, live: bool, alpha: float) -> bool:
    p_face = max(0.0, 1.0 - l2 / P_FACE_SCALE)
    return alpha * p_face + (1 - alpha) * (1.0 if live else 0.0) >= S3_ACCEPT


def table_alpha(trials: Sequence[Dict[str, object]], grid: Sequence[float] = ALPHA_GRID) -> List[List[str]]:
    usable = [t for t in measured(trials) if t["challenge_pass"] is not None]
    rows = [["alpha", "l2_maks_tersirat_saat_live", "diterima_tanpa_live", "n_bona_fide", "bona_fide_ditolak"]
            + [f"{k}_{s}" for s in ATTACK_LABELS for k in ("n", "serangan_diterima")]]
    for alpha in grid:
        bona = [t for t in usable if t["label"] == "bona_fide"]
        line = [
            f"{alpha:.2f}",
            fmt(implied_l2(alpha)),
            # P_live = 0: S = alpha * P_face <= alpha, jadi tidak pernah diterima bila alpha < 0,75.
            "ya" if alpha >= S3_ACCEPT else "tidak",
            str(len(bona)),
            fmt(rate(sum(not s3_accept(t["l2"], t["challenge_pass"], alpha) for t in bona), len(bona))),
        ]
        for species in ATTACK_LABELS:
            attacks = [t for t in usable if t["label"] == species]
            line += [str(len(attacks)), fmt(rate(sum(s3_accept(t["l2"], t["challenge_pass"], alpha) for t in attacks), len(attacks)))]
        rows.append(line)
    return rows


# ---------------------------------------------------------------- Tabel 3

def table_conditions(trials: Sequence[Dict[str, object]]) -> List[List[str]]:
    keys = ["n_bona_fide", "bpcer"] + [f"{k}_{s}" for s in ATTACK_LABELS for k in ("n", "apcer")]
    rows = [["lux_kategori", "jarak_target_cm"] + keys + ["iapmr_" + s for s in ATTACK_LABELS]
            + ["bpcer_ci95", "apcer_max_ci95"]]
    data = measured(trials)
    cells = [(lux, d) for lux in LUX_ORDER for d in DISTANCE_CM] + [("semua", "semua")]
    for lux, distance in cells:
        subset = [t for t in data if (lux == "semua" or t["lux"] == lux) and (distance == "semua" or t["distance"] == distance)]
        res = pad_errors([(str(t["label"]), bool(t["pad_bona_fide"])) for t in subset])
        iapmr = []
        for species in ATTACK_LABELS:
            attacks = [t for t in subset if t["label"] == species]
            iapmr.append(fmt(rate(sum(t["l2"] <= FACENET_DISTANCE_THRESHOLD for t in attacks), len(attacks))))
        bona = [t for t in subset if t["label"] == "bona_fide"]
        bpcer_ci = wilson(sum(not t["pad_bona_fide"] for t in bona), len(bona))
        worst_species = max(ATTACK_LABELS, key=lambda s: res[f"apcer_{s}"] if res[f"apcer_{s}"] is not None else -1)
        worst = [t for t in subset if t["label"] == worst_species]
        apcer_ci = wilson(sum(bool(t["pad_bona_fide"]) for t in worst), len(worst))
        rows.append([lux, str(distance)] + [str(res[k]) if k.startswith("n_") else fmt(res[k]) for k in keys]
                    + iapmr + [fmt_interval(bpcer_ci), fmt_interval(apcer_ci)])
    return rows


def write_table(rows: List[List[str]], path: Path) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerows(rows)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--riwayat", required=True, type=Path)
    parser.add_argument("--frames", type=Path, default=None)
    parser.add_argument("--participant", default="P_DEV_01")
    parser.add_argument("--out", type=Path, default=BASE_DIR / "exports" / "kalibrasi_dev")
    args = parser.parse_args(argv)

    trials = load_trials(read_csv(args.riwayat), args.participant)
    if not trials:
        print(f"Tidak ada presentasi {SPLIT} untuk {args.participant}.", file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)

    write_anonymized(trials, args.out / "presentasi_anonim.csv")
    write_table(table_l2(trials), args.out / "tabel2a_ambang_l2.csv")
    write_table(table_alpha(trials), args.out / "tabel2c_bobot_alpha.csv")
    write_table(table_conditions(trials), args.out / "tabel3_apcer_kondisi.csv")
    if args.frames is not None:
        write_table(table_emar(trials, load_frames(args.frames)), args.out / "tabel2b_ambang_emar.csv")

    n_fta = sum(bool(t["fta"]) for t in trials)
    n_unavailable = sum(bool(t["unavailable"]) for t in trials)
    print(f"{len(trials)} presentasi: {len(measured(trials))} terukur, {n_fta} FTA, {n_unavailable} mesin tidak terhubung.")
    if args.frames is None:
        print("Tabel 2b dilewati: berikan --frames logs/log_raw_frames_dev.csv.")
    print("Tabel 1 (waktu per komponen) belum bisa dibuat: mesin belum mencatat waktu MTCNN/FaceNet/dlib per presentasi.")
    print(f"Hasil di {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
