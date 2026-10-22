#!/usr/bin/env python3
"""Tabel kalibrasi calibration_dev dari ekspor riwayat dan log frame (keputusan D1/D2)."""

import csv
import re
import sys
import tempfile
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

import analisis_kalibrasi_dev as ak  # noqa: E402
import parameter_penelitian as P  # noqa: E402

HEADER = [
    "No", "Jenis", "Tanggal", "Jam", "ID Subjek", "Nama", "Email", "Keputusan Final", "Jarak Euclidean (L2)",
    "Skor EMAR", "Prediksi PAD", "Prediksi Identitas", "Hasil Tantangan", "Target Jarak Skenario (cm)",
    "Target Lux Skenario", "Label Sampel", "Spesies PAI", "ID Partisipan", "Split Dataset", "Versi Keputusan",
    "Frame Total Mesin", *ak.LATENCY_COLUMNS.values(), "Sumber Biometrik", "IP", "ID Record Presensi",
]


def row(trial_id, sample, species, l2, pad, p_live="1.0", lux="300", dist="60", source="Mesin biometrik",
        split="calibration_dev", participant="P_DEV_01", version=P.DECISION_VERSION, mtcnn="610.5"):
    latency = {col: "" for col in ak.LATENCY_COLUMNS.values()}
    latency.update({
        "Latensi Total Mesin (ms)": str(10000 + trial_id),
        "Latensi Pass EMAR (ms)": "9600",
        "Latensi MTCNN (ms)": mtcnn,
    })
    return {
        "No": trial_id, "Jenis": "Presensi", "Tanggal": "2026-10-21", "Jam": "10:00:00", "ID Subjek": participant,
        "Nama": "Nama Pribadi", "Email": "pribadi@example.test", "Keputusan Final": "REJECT",
        "Jarak Euclidean (L2)": l2, "Skor EMAR": p_live, "Prediksi PAD": pad, "Prediksi Identitas": "MATCH",
        "Hasil Tantangan": "PASS_LIVENESS", "Target Jarak Skenario (cm)": dist, "Target Lux Skenario": lux,
        "Label Sampel": sample, "Spesies PAI": species, "ID Partisipan": participant, "Split Dataset": split,
        "Versi Keputusan": version, "Frame Total Mesin": "240", **latency, "Sumber Biometrik": source,
        "IP": "10.0.0.1", "ID Record Presensi": str(trial_id),
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

    def test_siklus_dlib_butuh_frame_minimum_seperti_mesin(self):
        self.assertEqual(ak.count_full_cycles([False, True, True, False], 2), 1)
        self.assertEqual(ak.count_full_cycles([False, True, False], 2), 0)
        self.assertEqual(ak.count_full_cycles([True, True, False], 2), 0)
        self.assertEqual(ak.count_full_cycles([False, True, True, True, False], 3), 1)

    def test_ambang_l2_tersirat_rumus_b(self):
        # alpha 0,60: dengan liveness penuh atau setengah, gerbang 0,40 yang mengikat.
        self.assertAlmostEqual(ak.implied_l2(0.60, 1.0), 0.40)
        self.assertAlmostEqual(ak.implied_l2(0.60, 0.5), 0.40)
        # Tanpa liveness S3 tetap menerima d < 0,20 (0,6 * (1 - d/1,20) >= 0,50).
        self.assertAlmostEqual(ak.implied_l2(0.60, 0.0), 0.20)
        self.assertIsNone(ak.implied_l2(0.30, 0.0))

    def test_s3_rumus_b_mencakup_s2_dan_tidak_identik(self):
        for alpha in ak.ALPHA_GRID:
            for l2 in (0.0, 0.10, 0.19, 0.25, 0.40, 0.41, 0.60):
                s2 = l2 <= 0.40
                if s2:
                    self.assertTrue(ak.s3_accept(l2, 1.0, alpha), (alpha, l2))
        # Satu siklus saja (P_live 0,5): S2 menolak, S3 menerima pada alpha 0,60.
        self.assertTrue(ak.s3_accept(0.30, 0.5, 0.60))

    def test_gerbang_identitas_s3(self):
        self.assertFalse(ak.s3_accept(0.41, 1.0, 0.60))
        self.assertFalse(ak.s3_accept(0.52, 1.0, 0.30))
        # Batas floating point sama dengan decide_s3: d = 0,20 tepat tanpa liveness ditolak.
        self.assertFalse(ak.s3_accept(0.20, 0.0, 0.60))
        self.assertTrue(ak.s3_accept(0.19, 0.0, 0.60))


class TestParitasWeb(unittest.TestCase):
    """Konstanta D1/D2 di web harus sama dengan parameter_penelitian.py."""

    def test_versi_dan_konstanta_fusi_sama_dengan_laravel(self):
        php = (BASE_DIR / "attendance-web" / "app" / "Services" / "FusionDecision.php").read_text(encoding="utf-8")
        self.assertIn(f"public const VERSION = '{P.DECISION_VERSION}';", php)
        config = (BASE_DIR / "attendance-web" / "config" / "biometrics.php").read_text(encoding="utf-8")
        fusion = re.search(r"'fusion' => \[(.*?)\]", config, re.S).group(1)
        values = dict(re.findall(r"'(\w+)' => ([\d.]+)", fusion))
        self.assertEqual(float(values["alpha"]), P.ALPHA_DEFAULT)
        self.assertEqual(float(values["d_ref"]), P.FUSION_D_REF)
        self.assertEqual(float(values["threshold"]), P.FUSION_THRESHOLD)
        self.assertEqual(float(values["liveness_threshold"]), P.LIVENESS_THRESHOLD)


class TestTabelKalibrasi(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _riwayat(self):
        rows = [
            row(1, "BONA_FIDE", "", "0.3000", "BONA_FIDE"),
            row(2, "BONA_FIDE", "", "0.5200", "ATTACK", p_live="0.5"),
            row(3, "ATTACK", "print_attack", "0.2500", "ATTACK", p_live="0.0"),
            row(4, "ATTACK", "replay_video", "0.3100", "BONA_FIDE"),
            row(5, "ATTACK", "replay_video", "0.4500", "ATTACK", p_live="0.5"),
            # FTA dan mesin mati tidak masuk penyebut.
            row(6, "ATTACK", "screen_attack", "", "UNAVAILABLE", source="FTA (wajah tidak terdeteksi / belum terdaftar)"),
            row(7, "BONA_FIDE", "", "", "UNAVAILABLE", source="Mesin tidak dapat dihubungi"),
            # Split lain dan partisipan lain diabaikan.
            row(8, "BONA_FIDE", "", "0.2000", "BONA_FIDE", split=""),
            row(9, "BONA_FIDE", "", "0.2000", "BONA_FIDE", participant="P_DEV_02"),
            row(10, "BONA_FIDE", "", "0.2000", "BONA_FIDE", lux="75", dist="30"),
            # Tanpa landmark dlib: FTA liveness, keluar dari tabel PAD, tetap di Tabel 2a.
            row(11, "ATTACK", "screen_attack", "0.1800", "UNAVAILABLE", p_live="0.0", mtcnn=""),
            # Versi keputusan lama tidak dicampur.
            row(12, "BONA_FIDE", "", "0.2500", "BONA_FIDE", version=""),
        ]
        path = self.dir / "riwayat.csv"
        write_csv(path, HEADER, rows)
        return path

    def _frames(self):
        open_, blink, mouth = (0.30, 0.04), (0.12, 0.04), (0.30, 0.25)
        engine = {
            # kedip 2 frame dan mulut 3 frame: siklus penuh menurut aturan mesin
            "1": [open_, open_, blink, blink, open_, mouth, mouth, mouth, open_],
            "3": [open_] * 9,                                                   # foto diam
            # replay: kedip dangkal 0,17 dan mulut dangkal 0,12
            "4": [open_, (0.17, 0.04), (0.17, 0.04), open_, (0.30, 0.12), (0.30, 0.12), (0.30, 0.12), open_],
        }
        browser = {"4": [open_] * 8}  # deret browser berbeda; tidak boleh tercampur
        rows = []
        for source, series in (("engine_dlib", engine), ("browser_mediapipe", browser)):
            for trial, frames in series.items():
                for idx, (ear, mar) in enumerate(frames):
                    rows.append({"attendance_id": trial, "frame_idx": idx, "t_ms": idx * 33.3,
                                 "raw_ear": ear, "raw_mar": mar, "landmark_source": source})
        path = self.dir / "frames.csv"
        write_csv(path, ["attendance_id", "frame_idx", "t_ms", "raw_ear", "raw_mar", "landmark_source"], rows)
        return path

    def test_tabel_dari_ekspor_riwayat(self):
        out = self.dir / "out"
        self.assertEqual(ak.main(["--riwayat", str(self._riwayat()), "--frames", str(self._frames()),
                                  "--out", str(out)]), 0)

        anon = read_table(out / "presentasi_anonim.csv")
        self.assertEqual(len(anon), 9)
        self.assertNotIn("Nama", anon[0])
        self.assertNotIn("Email", anon[0])
        self.assertNotIn("Nama Pribadi", (out / "presentasi_anonim.csv").read_text(encoding="utf-8"))
        self.assertEqual({r["decision_version"] for r in anon}, {P.DECISION_VERSION})

        overall = read_table(out / "tabel3_apcer_kondisi.csv")[-1]
        self.assertEqual(overall["lux_kategori"], "semua")
        self.assertEqual(overall["n_bona_fide"], "3")
        self.assertEqual(overall["bpcer"], "0.3333")
        self.assertEqual(overall["n_print_attack"], "1")
        self.assertEqual(overall["apcer_print_attack"], "0.0000")
        self.assertEqual(overall["n_replay_video"], "2")
        self.assertEqual(overall["apcer_replay_video"], "0.5000")
        # Satu-satunya screen_attack terukur tidak punya landmark dlib (FTA liveness).
        self.assertEqual(overall["n_screen_attack"], "0")
        self.assertEqual(overall["apcer_screen_attack"], "")
        self.assertEqual(overall["iapmr_replay_video"], "0.5000")

        cell = {(r["lux_kategori"], r["jarak_target_cm"]): r for r in read_table(out / "tabel3_apcer_kondisi.csv")}
        self.assertEqual(cell[("redup", "30")]["n_bona_fide"], "1")
        self.assertEqual(cell[("normal", "60")]["n_bona_fide"], "2")

        l2 = {r["ambang_l2"]: r for r in read_table(out / "tabel2a_ambang_l2.csv")}
        self.assertEqual(l2["0.40"]["fnmr_bona_fide"], "0.3333")
        self.assertEqual(l2["0.50"]["iapmr_replay_video"], "1.0000")
        self.assertEqual(l2["0.40"]["iapmr_screen_attack"], "1.0000")

        emar = {(r["ambang_ear"], r["ambang_mar"]): r for r in read_table(out / "tabel2b_ambang_emar.csv")}
        self.assertEqual(emar[("0.20", "0.10")]["apcer_replay_video"], "1.0000")
        self.assertEqual(emar[("0.15", "0.10")]["apcer_replay_video"], "0.0000")
        self.assertEqual(emar[("0.20", "0.10")]["bpcer"], "0.0000")
        self.assertEqual(emar[("0.20", "0.10")]["apcer_print_attack"], "0.0000")

        alpha = {r["alpha"]: r for r in read_table(out / "tabel2c_bobot_alpha.csv")}
        self.assertEqual(alpha["0.60"]["l2_maks_saat_p_live_1"], "0.4000")
        self.assertEqual(alpha["0.60"]["l2_maks_tanpa_live"], "0.2000")
        self.assertEqual(alpha["0.60"]["bona_fide_ditolak"], "0.3333")
        self.assertEqual(alpha["0.60"]["serangan_diterima_print_attack"], "0.0000")
        self.assertEqual(alpha["0.60"]["serangan_diterima_replay_video"], "0.5000")

        latency = {r["tahap"]: r for r in read_table(out / "tabel1_latensi_komponen.csv")}
        self.assertEqual(latency["total"]["n"], "7")
        self.assertEqual(latency["total"]["median_ms"], "10004.0000")
        self.assertEqual(latency["total"]["p90_ms"], "10010.4000")
        # Tahap yang tidak terukur tidak diisi nol.
        self.assertEqual(latency["mtcnn"]["n"], "6")
        self.assertEqual(latency["lock_wait"]["n"], "0")
        self.assertEqual(latency["lock_wait"]["median_ms"], "")
        self.assertEqual(latency["emar_pass_per_frame"]["median_ms"], "40.0000")

    def test_tabel_2b_browser_terpisah_dari_dlib(self):
        out = self.dir / "out"
        self.assertEqual(ak.main(["--riwayat", str(self._riwayat()), "--frames", str(self._frames()),
                                  "--frame-source", "browser_mediapipe", "--out", str(out)]), 0)
        self.assertFalse((out / "tabel2b_ambang_emar.csv").exists())
        emar = {(r["ambang_ear"], r["ambang_mar"]): r for r in read_table(out / "tabel2b_ambang_emar_browser.csv")}
        # Deret browser presentasi 4 diam: tidak live, berbeda dengan deret dlib.
        self.assertEqual(emar[("0.20", "0.10")]["apcer_replay_video"], "0.0000")
        self.assertEqual(emar[("0.20", "0.10")]["n_bona_fide"], "0")

    def test_hanya_versi_lama_tidak_menghasilkan_tabel(self):
        path = self.dir / "lama.csv"
        write_csv(path, HEADER, [row(1, "BONA_FIDE", "", "0.30", "BONA_FIDE", version="")])
        self.assertEqual(ak.main(["--riwayat", str(path), "--out", str(self.dir / "out")]), 1)


if __name__ == "__main__":
    unittest.main()
