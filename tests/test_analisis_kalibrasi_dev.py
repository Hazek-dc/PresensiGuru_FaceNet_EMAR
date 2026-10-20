#!/usr/bin/env python3
"""Tabel kalibrasi calibration_dev dari ekspor riwayat dan log frame."""

import csv
import sys
import tempfile
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

import analisis_kalibrasi_dev as ak  # noqa: E402

HEADER = [
    "No", "Jenis", "Tanggal", "Jam", "ID Subjek", "Nama", "Email", "Keputusan Final", "Jarak Euclidean (L2)",
    "Prediksi PAD", "Prediksi Identitas", "Hasil Tantangan", "Target Jarak Skenario (cm)", "Target Lux Skenario",
    "Label Sampel", "Spesies PAI", "ID Partisipan", "Split Dataset", "Sumber Biometrik", "IP", "ID Record Presensi",
]


def row(trial_id, sample, species, l2, pad, challenge="PASS_LIVENESS", lux="300", dist="60",
        source="Mesin biometrik", split="calibration_dev", participant="P_DEV_01"):
    return {
        "No": trial_id, "Jenis": "Presensi", "Tanggal": "2026-10-20", "Jam": "10:00:00", "ID Subjek": participant,
        "Nama": "Nama Pribadi", "Email": "pribadi@example.test", "Keputusan Final": "REJECT",
        "Jarak Euclidean (L2)": l2, "Prediksi PAD": pad, "Prediksi Identitas": "MATCH", "Hasil Tantangan": challenge,
        "Target Jarak Skenario (cm)": dist, "Target Lux Skenario": lux, "Label Sampel": sample, "Spesies PAI": species,
        "ID Partisipan": participant, "Split Dataset": split, "Sumber Biometrik": source, "IP": "10.0.0.1",
        "ID Record Presensi": str(trial_id),
    }


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)


def read_table(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


class TestSiklusDanS3(unittest.TestCase):

    def test_siklus_sama_dengan_cycle_counter_browser(self):
        self.assertEqual(ak.count_cycles([False, True, False]), 1)
        # Aktif sejak frame pertama belum dihitung: belum terlihat keadaan nonaktif.
        self.assertEqual(ak.count_cycles([True, False]), 0)
        self.assertEqual(ak.count_cycles([False, True, True, False, True, False]), 2)
        self.assertEqual(ak.count_cycles([False, True]), 0)

    def test_ambang_l2_tersirat_tiap_alpha(self):
        self.assertAlmostEqual(ak.implied_l2(0.60), 0.625)
        self.assertAlmostEqual(ak.implied_l2(0.30), 1.25)
        self.assertAlmostEqual(ak.implied_l2(0.50), 0.75)

    def test_gerbang_identitas_membuat_s3_sama_dengan_s2(self):
        # P_live biner: bila L2 <= 0,40 diwajibkan, S3 hanya ditentukan liveness,
        # yaitu keputusan S2. Inilah alasan gerbang tidak dipasang ke S3.
        for alpha in ak.ALPHA_GRID:
            for l2 in (0.0, 0.10, 0.25, 0.40):
                for live in (True, False):
                    self.assertEqual(ak.s3_accept(l2, live, alpha), live, (alpha, l2, live))

    def test_s3_tanpa_gerbang_menerima_non_match_yang_live(self):
        self.assertTrue(ak.s3_accept(0.52, True, 0.60))
        self.assertFalse(ak.s3_accept(0.63, True, 0.60))


class TestTabelKalibrasi(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_tabel_dari_ekspor_riwayat(self):
        rows = [
            row(1, "BONA_FIDE", "", "0.3000", "BONA_FIDE"),
            row(2, "BONA_FIDE", "", "0.5200", "ATTACK", challenge="REJECT_TIMEOUT"),
            row(3, "ATTACK", "print_attack", "0.2500", "ATTACK", challenge="REJECT_TIMEOUT"),
            row(4, "ATTACK", "replay_video", "0.3100", "BONA_FIDE"),
            row(5, "ATTACK", "replay_video", "0.4500", "ATTACK", challenge="REJECT_TIMEOUT"),
            # FTA dan mesin mati tidak masuk penyebut.
            row(6, "ATTACK", "screen_attack", "", "ATTACK", source="FTA (wajah tidak terdeteksi / belum terdaftar)"),
            row(7, "BONA_FIDE", "", "", "ATTACK", source="Mesin tidak dapat dihubungi"),
            # Split lain dan partisipan lain diabaikan.
            row(8, "BONA_FIDE", "", "0.2000", "BONA_FIDE", split=""),
            row(9, "BONA_FIDE", "", "0.2000", "BONA_FIDE", participant="P_DEV_02"),
            row(10, "BONA_FIDE", "", "0.2000", "BONA_FIDE", lux="75", dist="30"),
        ]
        riwayat = self.dir / "riwayat.csv"
        write_csv(riwayat, HEADER, rows)
        frames = self.dir / "frames.csv"
        frame_rows = []
        for trial, series in {
            "1": [(0.30, 0.04), (0.12, 0.04), (0.30, 0.25), (0.30, 0.04)],   # kedip dan buka mulut
            "3": [(0.30, 0.04)] * 4,                                         # foto diam
            "4": [(0.30, 0.04), (0.17, 0.12), (0.30, 0.04)],                 # replay kedip+mulut dangkal
        }.items():
            for idx, (ear, mar) in enumerate(series):
                frame_rows.append({"attendance_id": trial, "frame_idx": idx, "t_ms": idx * 33.3,
                                   "raw_ear": ear, "raw_mar": mar})
        write_csv(frames, ["attendance_id", "frame_idx", "t_ms", "raw_ear", "raw_mar"], frame_rows)

        out = self.dir / "out"
        self.assertEqual(ak.main(["--riwayat", str(riwayat), "--frames", str(frames), "--out", str(out)]), 0)

        anon = read_table(out / "presentasi_anonim.csv")
        self.assertEqual(len(anon), 8)
        self.assertNotIn("Nama", anon[0])
        self.assertNotIn("Email", anon[0])
        self.assertNotIn("Nama Pribadi", (out / "presentasi_anonim.csv").read_text(encoding="utf-8"))

        overall = read_table(out / "tabel3_apcer_kondisi.csv")[-1]
        self.assertEqual(overall["lux_kategori"], "semua")
        self.assertEqual(overall["n_bona_fide"], "3")
        self.assertEqual(overall["bpcer"], "0.3333")
        self.assertEqual(overall["n_print_attack"], "1")
        self.assertEqual(overall["apcer_print_attack"], "0.0000")
        self.assertEqual(overall["n_replay_video"], "2")
        self.assertEqual(overall["apcer_replay_video"], "0.5000")
        self.assertEqual(overall["n_screen_attack"], "0")
        self.assertEqual(overall["apcer_screen_attack"], "")
        self.assertEqual(overall["iapmr_replay_video"], "0.5000")

        cell = {(r["lux_kategori"], r["jarak_target_cm"]): r for r in read_table(out / "tabel3_apcer_kondisi.csv")}
        self.assertEqual(cell[("redup", "30")]["n_bona_fide"], "1")
        self.assertEqual(cell[("normal", "60")]["n_bona_fide"], "2")

        l2 = {r["ambang_l2"]: r for r in read_table(out / "tabel2a_ambang_l2.csv")}
        self.assertEqual(l2["0.40"]["fnmr_bona_fide"], "0.3333")
        self.assertEqual(l2["0.50"]["iapmr_replay_video"], "1.0000")

        emar = {(r["ambang_ear"], r["ambang_mar"]): r for r in read_table(out / "tabel2b_ambang_emar.csv")}
        self.assertEqual(emar[("0.20", "0.10")]["apcer_replay_video"], "1.0000")
        self.assertEqual(emar[("0.15", "0.10")]["apcer_replay_video"], "0.0000")
        self.assertEqual(emar[("0.20", "0.10")]["bpcer"], "0.0000")
        self.assertEqual(emar[("0.20", "0.10")]["apcer_print_attack"], "0.0000")

        alpha = {r["alpha"]: r for r in read_table(out / "tabel2c_bobot_alpha.csv")}
        self.assertEqual(alpha["0.60"]["l2_maks_tersirat_saat_live"], "0.6250")
        self.assertEqual(alpha["0.60"]["serangan_diterima_replay_video"], "0.5000")

    def test_baris_tanpa_target_atau_label_ditolak(self):
        riwayat = self.dir / "riwayat.csv"
        write_csv(riwayat, HEADER, [row(1, "BONA_FIDE", "", "0.3", "BONA_FIDE", lux="")])
        with self.assertRaises(ValueError):
            ak.main(["--riwayat", str(riwayat), "--out", str(self.dir / "out")])
        write_csv(riwayat, HEADER, [row(1, "ATTACK", "", "0.3", "ATTACK")])
        with self.assertRaises(ValueError):
            ak.main(["--riwayat", str(riwayat), "--out", str(self.dir / "out")])


if __name__ == "__main__":
    unittest.main()
