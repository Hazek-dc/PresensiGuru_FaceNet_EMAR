"""
Analisis tingkat subjek atas presentasi berpasangan yang benar-benar terekam.

Masukan adalah CSV presentation_log dari logs/telemetry.db dalam salah satu
dari dua bentuk ekspor:
  - rute Laravel export.cochran (Dataset_Presentasi_Berpasangan_*.csv):
    participant_id, label_aktual, ..., keputusan_S1..S3 (Accept/Reject/FTA)
  - FrameTelemetryLogger.export_presentations_csv()
    (exports/presentasi_berpasangan.csv):
    subject_id, attack_label, ..., decision_s1..s3 (ACCEPT/REJECT/FTA)

Berkas dari scripts/simulasi_cochran_dataset.py ditolak. Versi lama skrip ini
membaca CSV simulasi itu dan mengunci matriks konfusinya sebagai acuan.

Positif = presentasi diterima. FTA dihitung tidak diterima, sama seperti
SubjectLevelAnalysisService di Laravel: bagi wajah asli itu galat (FN), bagi
serangan itu penolakan (TN). Jumlah FTA dilaporkan terpisah.

Analisis berhenti bila jumlah presentasi belum sesuai rancangan di
parameter_penelitian.py, kecuali dijalankan dengan --izinkan-belum-lengkap.

Pemakaian:
  python analisis_tingkat_subjek.py [CSV] [--izinkan-belum-lengkap] [--keluaran DIR]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from parameter_penelitian import N_PER_SUBJECT, N_SUBJECTS, N_TOTAL

ROOT = Path(__file__).resolve().parent
DEFAULT_CSV = ROOT / "exports" / "presentasi_berpasangan.csv"

PENANDA_SIMULASI = "SIMULASI"

METODE = {"M1": "keputusan_S1", "M2": "keputusan_S2", "M3": "keputusan_S3"}
KEPUTUSAN_SAH = {"Accept", "Reject", "FTA"}

LABEL = {
    "bona_fide": "Bona_Fide",
    "print_attack": "Print_Attack",
    "screen_attack": "Screen_Attack",
    "replay_video": "Replay_Video",
}
KEPUTUSAN_TELEMETRY = {"ACCEPT": "Accept", "REJECT": "Reject", "FTA": "FTA"}

KOLOM_LARAVEL = ["participant_id", "label_aktual"] + list(METODE.values())
KOLOM_TELEMETRY = ["subject_id", "attack_label", "decision_s1", "decision_s2", "decision_s3"]


class DataSimulasiError(ValueError):
    """Berkas masukan berlabel data simulasi, bukan hasil pengukuran."""


def _tolak_bila_simulasi(path: Path) -> None:
    if PENANDA_SIMULASI in path.name.upper():
        raise DataSimulasiError(f"{path.name}: nama berkas menandai data simulasi.")
    with path.open("r", encoding="utf-8-sig") as f:
        baris_pertama = f.readline()
    if baris_pertama.startswith("#") and PENANDA_SIMULASI in baris_pertama.upper():
        raise DataSimulasiError(f"{path.name}: baris pertama menandai data simulasi.")


def muat_presentasi(path: Path) -> pd.DataFrame:
    """
    Baca CSV presentasi terekam dan seragamkan ke kolom ekspor Laravel.

    Melempar DataSimulasiError untuk berkas simulasi dan ValueError untuk
    kolom, label, atau keputusan yang tidak dikenal. Sesi batal (aborted = 1)
    dibuang, sama seperti CochranExportService.
    """
    path = Path(path)
    _tolak_bila_simulasi(path)
    df = pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)

    if "sumber_data" in df.columns and df["sumber_data"].str.upper().str.contains(PENANDA_SIMULASI).any():
        raise DataSimulasiError(f"{path.name}: kolom sumber_data berisi {PENANDA_SIMULASI}.")

    tersedia = set(df.columns)
    if set(KOLOM_LARAVEL) <= tersedia:
        pass  # sudah berbentuk ekspor Laravel
    elif set(KOLOM_TELEMETRY) <= tersedia:
        if "aborted" in df.columns:
            df = df[df["aborted"].isin(["", "0"])]
        df = df.assign(
            participant_id=df["subject_id"],
            label_aktual=df["attack_label"].map(lambda v: LABEL.get(v, v)),
            keputusan_S1=df["decision_s1"].map(lambda v: KEPUTUSAN_TELEMETRY.get(v, v)),
            keputusan_S2=df["decision_s2"].map(lambda v: KEPUTUSAN_TELEMETRY.get(v, v)),
            keputusan_S3=df["decision_s3"].map(lambda v: KEPUTUSAN_TELEMETRY.get(v, v)),
        )
    else:
        raise ValueError(
            f"{path.name}: kolom tidak dikenali. Butuh {KOLOM_LARAVEL} (ekspor Laravel) "
            f"atau {KOLOM_TELEMETRY} (ekspor telemetry_logger)."
        )

    label_asing = sorted(set(df["label_aktual"]) - set(LABEL.values()))
    if label_asing:
        raise ValueError(f"{path.name}: label_aktual tidak dikenal: {label_asing}")
    for kolom in METODE.values():
        asing = sorted(set(df[kolom]) - KEPUTUSAN_SAH)
        if asing:
            raise ValueError(f"{path.name}: {kolom} berisi nilai di luar {sorted(KEPUTUSAN_SAH)}: {asing}")
    if (df["participant_id"] == "").any():
        raise ValueError(f"{path.name}: ada presentasi tanpa ID subjek.")

    return df.reset_index(drop=True)


def _galat(df: pd.DataFrame, kolom: str) -> pd.Series:
    diterima = df[kolom] == "Accept"
    asli = df["label_aktual"] == "Bona_Fide"
    return (asli & ~diterima) | (~asli & diterima)


def matriks_konfusi(df: pd.DataFrame) -> Dict[str, Dict[str, int]]:
    asli = df["label_aktual"] == "Bona_Fide"
    hasil = {}
    for metode, kolom in METODE.items():
        diterima = df[kolom] == "Accept"
        hasil[metode] = {
            "TP": int((asli & diterima).sum()),
            "FN": int((asli & ~diterima).sum()),
            "TN": int((~asli & ~diterima).sum()),
            "FP": int((~asli & diterima).sum()),
        }
    return hasil


def jumlah_fta(df: pd.DataFrame) -> Dict[str, Dict[str, int]]:
    asli = df["label_aktual"] == "Bona_Fide"
    hasil = {}
    for metode, kolom in METODE.items():
        fta = df[kolom] == "FTA"
        hasil[metode] = {"bona_fide": int((asli & fta).sum()), "serangan": int((~asli & fta).sum())}
    return hasil


def galat_per_subjek(df: pd.DataFrame) -> pd.DataFrame:
    """Persentase presentasi yang salah diputuskan, per subjek per metode."""
    galat = pd.DataFrame({m: _galat(df, kolom) for m, kolom in METODE.items()})
    galat["participant_id"] = df["participant_id"]
    kelompok = galat.groupby("participant_id", sort=True)
    hasil = (kelompok[list(METODE)].mean() * 100).round(2)
    hasil.insert(0, "total", kelompok.size())
    return hasil.reset_index()


def kelengkapan(df: pd.DataFrame) -> Tuple[bool, str]:
    """Bandingkan jumlah presentasi dengan rancangan, seperti SubjectLevelAnalysisService."""
    total = len(df)
    if total == 0:
        return False, (
            f"Belum ada presentasi terekam. Rancangan: {N_TOTAL} presentasi "
            f"({N_SUBJECTS} subjek x {N_PER_SUBJECT})."
        )

    per_subjek = df.groupby("participant_id").size()
    tidak_lengkap = sorted(per_subjek[per_subjek != N_PER_SUBJECT].index)
    if total == N_TOTAL and len(per_subjek) == N_SUBJECTS and not tidak_lengkap:
        return True, f"Data lengkap: {total} presentasi sesuai rancangan."

    rincian = (
        f"Data belum lengkap: {total} dari {N_TOTAL} presentasi, "
        f"{len(per_subjek)} dari {N_SUBJECTS} subjek."
    )
    if tidak_lengkap:
        rincian += f" Subjek dengan jumlah selain {N_PER_SUBJECT}: {', '.join(tidak_lengkap)}."
    return False, rincian


def uji_statistik(err_df: pd.DataFrame) -> List[str]:
    """Friedman, Wilcoxon (Bonferroni), selisih rerata dengan IK 95%, dan design effect."""
    import scipy.stats as stats

    m1, m2, m3 = (err_df[m].to_numpy(dtype=float) for m in METODE)
    baris: List[str] = []

    baris.append("2. Friedman Test")
    try:
        stat, p = stats.friedmanchisquare(m1, m2, m3)
        baris.append(f"Statistic: {stat:.4f}, p-value: {p:.4e}\n")
    except ValueError as e:
        baris.append(f"Tidak dapat dihitung: {e}\n")

    alpha = 0.05 / 3
    baris.append(f"3. Wilcoxon Signed-Rank Test (Bonferroni alpha={alpha:.4f})")
    for nama, a, b in (("M1 vs M2", m1, m2), ("M1 vs M3", m1, m3), ("M2 vs M3", m2, m3)):
        try:
            stat, p = stats.wilcoxon(a, b)
            baris.append(f"{nama}: stat={stat:.4f}, p={p:.4e} (Sig: {p < alpha})")
        except ValueError as e:
            baris.append(f"{nama}: tidak dapat dihitung: {e}")
    baris.append("")

    baris.append("4. Effect Sizes (Mean Difference & 95% CI)")
    for nama, a, b in (("M1 - M2", m1, m2), ("M1 - M3", m1, m3), ("M2 - M3", m2, m3)):
        selisih = a - b
        rerata = float(np.mean(selisih))
        ik = stats.t.interval(0.95, len(selisih) - 1, loc=rerata, scale=stats.sem(selisih))
        baris.append(f"{nama}: {rerata:.2f} [{ik[0]:.2f}, {ik[1]:.2f}]")
    baris.append("")

    # Design effect memakai jumlah presentasi per subjek menurut rancangan.
    baris.append(f"5. Design Effects (m = {N_PER_SUBJECT} presentasi per subjek)")
    for rho in (0.01, 0.05, 0.10):
        baris.append(f"rho = {rho}: deff = {1 + (N_PER_SUBJECT - 1) * rho:.2f}")
    return baris


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Analisis tingkat subjek atas presentasi terekam.")
    parser.add_argument("csv", nargs="?", type=Path, default=DEFAULT_CSV,
                        help=f"CSV presentasi terekam (bawaan: {DEFAULT_CSV.relative_to(ROOT)})")
    parser.add_argument("--izinkan-belum-lengkap", action="store_true",
                        help="tetap hitung meski jumlah presentasi belum sesuai rancangan")
    parser.add_argument("--keluaran", type=Path, default=ROOT,
                        help="folder untuk galat_per_subjek.csv dan hasil_statistik.txt")
    args = parser.parse_args(argv)

    if not args.csv.exists():
        print(f"Error: berkas tidak ditemukan: {args.csv}")
        print("Ekspor presentasi terekam lewat rute Laravel export.cochran atau "
              "FrameTelemetryLogger.export_presentations_csv().")
        return 1

    try:
        df = muat_presentasi(args.csv)
    except DataSimulasiError as e:
        print(f"Error: {e}")
        print("Berkas simulasi bukan hasil pengukuran dan tidak boleh dianalisis sebagai data penelitian.")
        return 1
    except ValueError as e:
        print(f"Error: {e}")
        return 1

    lengkap, rincian = kelengkapan(df)
    print(rincian)
    if not lengkap and not args.izinkan_belum_lengkap:
        print("Analisis dihentikan. Lengkapi perekaman atau jalankan dengan --izinkan-belum-lengkap "
              "untuk hasil sementara.")
        return 1
    if df.empty:
        return 1

    cm = matriks_konfusi(df)
    fta = jumlah_fta(df)
    err_df = galat_per_subjek(df)

    args.keluaran.mkdir(parents=True, exist_ok=True)
    out_csv = args.keluaran / "galat_per_subjek.csv"
    err_df.to_csv(out_csv, index=False)
    print(f"Saved {out_csv}")

    report = ["SUBJECT-LEVEL ANALYSIS REPORT", "============================="]
    if not lengkap:
        report.append("HASIL SEMENTARA: DATA BELUM LENGKAP, BUKAN HASIL AKHIR PENELITIAN")
    report.append(f"Sumber data: {args.csv.name}")
    report.append(f"Total rows processed: {len(df)}")
    report.append(f"Kelengkapan data: {rincian}\n")

    report.append("Confusion matrix (positif = diterima; FTA dihitung tidak diterima)")
    for m in METODE:
        c = cm[m]
        report.append(f"{m}: TP={c['TP']} FN={c['FN']} TN={c['TN']} FP={c['FP']} "
                      f"| FTA bona fide={fta[m]['bona_fide']}, FTA serangan={fta[m]['serangan']}")
    report.append("")

    report.append("1. Error Rates (Mean ± Std) [%]")
    for m in METODE:
        report.append(f"{m}: {err_df[m].mean():.2f} ± {err_df[m].std(ddof=0):.2f}")
    report.append("")

    if len(err_df) < 2:
        report.append("Uji inferensial butuh minimal 2 subjek.")
    else:
        report.extend(uji_statistik(err_df))

    report_str = "\n".join(report)
    print("\n" + report_str)

    out_txt = args.keluaran / "hasil_statistik.txt"
    out_txt.write_text(report_str, encoding="utf-8")
    print(f"\nSaved {out_txt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
