"""
Data simulasi Cochran tidak boleh terbaca sebagai hasil pengukuran.

scripts/simulasi_cochran_dataset.py membangkitkan 6.480 baris dari hash CRC32.
Tes ini mengunci tiga hal: berkasnya berlabel simulasi, analisis_tingkat_subjek.py
menolaknya, dan analisis atas data terekam menghitung FTA sama seperti
SubjectLevelAnalysisService di Laravel.
"""

import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SIMULASI_CSV = ROOT / "exports" / "SIMULASI_Cochran_Q_6480_BUKAN_DATA_UKUR.csv"
PANDAS_ADA = importlib.util.find_spec("pandas") is not None

LARAVEL_HEADER = [
    "participant_id", "label_aktual", "kondisi_lux", "kondisi_jarak",
    "skor_facenet", "skor_ear", "skor_mar", "keputusan_S1", "keputusan_S2", "keputusan_S3",
]


def _tulis_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    return path


class BerkasSimulasiBerlabel(unittest.TestCase):
    def test_nama_lama_tidak_ada_lagi(self):
        self.assertFalse((ROOT / "exports" / "Dataset_Cochran_Q_ISO30107_6480.csv").exists())
        self.assertFalse((ROOT / "scripts" / "export_cochran_dataset.py").exists())

    def test_baris_pertama_dan_kolom_menandai_simulasi(self):
        with SIMULASI_CSV.open(encoding="utf-8-sig") as f:
            self.assertTrue(f.readline().startswith("# DATA SIMULASI, BUKAN HASIL PENGUKURAN"))
            rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 6480)
        self.assertEqual({r["sumber_data"] for r in rows}, {"SIMULASI"})

    def test_docstring_skrip_menandai_simulasi(self):
        teks = (ROOT / "scripts" / "simulasi_cochran_dataset.py").read_text(encoding="utf-8-sig")
        self.assertIn("DATA SIMULASI, BUKAN HASIL PENGUKURAN", teks.split('"""')[1])


@unittest.skipUnless(PANDAS_ADA, "pandas tidak terpasang")
class AnalisisMenolakSimulasi(unittest.TestCase):
    def setUp(self):
        import analisis_tingkat_subjek as ats
        self.ats = ats
        self.tmp = Path(tempfile.mkdtemp(prefix="analisis_"))

    def test_berkas_simulasi_di_repo_ditolak(self):
        with self.assertRaises(self.ats.DataSimulasiError):
            self.ats.muat_presentasi(SIMULASI_CSV)

    def test_kolom_sumber_data_simulasi_ditolak_meski_berganti_nama(self):
        path = _tulis_csv(self.tmp / "data.csv", ["sumber_data"] + LARAVEL_HEADER,
                          [["SIMULASI", "P01", "Bona_Fide", "Redup", "30cm", "0.2", "0.3", "0.1",
                            "Accept", "Accept", "Accept"]])
        with self.assertRaises(self.ats.DataSimulasiError):
            self.ats.muat_presentasi(path)

    def test_main_berhenti_pada_berkas_simulasi(self):
        kode = self.ats.main([str(SIMULASI_CSV), "--izinkan-belum-lengkap", "--keluaran", str(self.tmp)])
        self.assertEqual(kode, 1)
        self.assertFalse((self.tmp / "hasil_statistik.txt").exists())


@unittest.skipUnless(PANDAS_ADA, "pandas tidak terpasang")
class AnalisisDataTerekam(unittest.TestCase):
    # Kasus yang sama dengan test_analisis_menghitung_dari_data_terekam di
    # attendance-web/tests/Feature/CochranDatasetExportTest.php.
    LARAVEL_ROWS = [
        ["S01", "Bona_Fide", "Redup", "30cm", "0.3", "0.25", "0.12", "Accept", "Reject", "FTA"],
        ["S01", "Screen_Attack", "Redup", "30cm", "0.3", "0.25", "0.12", "Accept", "FTA", "Reject"],
    ]
    MATRIKS = {
        "M1": {"TP": 1, "FN": 0, "TN": 0, "FP": 1},
        "M2": {"TP": 0, "FN": 1, "TN": 1, "FP": 0},
        "M3": {"TP": 0, "FN": 1, "TN": 1, "FP": 0},
    }

    def setUp(self):
        import analisis_tingkat_subjek as ats
        self.ats = ats
        self.tmp = Path(tempfile.mkdtemp(prefix="analisis_"))

    def test_ekspor_laravel(self):
        df = self.ats.muat_presentasi(_tulis_csv(self.tmp / "laravel.csv", LARAVEL_HEADER, self.LARAVEL_ROWS))
        self.assertEqual(self.ats.matriks_konfusi(df), self.MATRIKS)
        self.assertEqual(self.ats.jumlah_fta(df)["M3"], {"bona_fide": 1, "serangan": 0})

        galat = self.ats.galat_per_subjek(df).set_index("participant_id")
        self.assertEqual(galat.loc["S01", "total"], 2)
        self.assertEqual(galat.loc["S01", "M1"], 50.0)
        self.assertEqual(galat.loc["S01", "M2"], 50.0)

        lengkap, rincian = self.ats.kelengkapan(df)
        self.assertFalse(lengkap)
        self.assertIn("2 dari 3240", rincian)

    def test_ekspor_telemetry_logger_setara(self):
        header = ["session_id", "subject_id", "attack_label", "decision_s1", "decision_s2",
                  "decision_s3", "aborted"]
        rows = [
            ["a", "S01", "bona_fide", "ACCEPT", "REJECT", "FTA", "0"],
            ["b", "S01", "screen_attack", "ACCEPT", "FTA", "REJECT", "0"],
            ["c", "S01", "print_attack", "ACCEPT", "ACCEPT", "ACCEPT", "1"],
        ]
        df = self.ats.muat_presentasi(_tulis_csv(self.tmp / "presentasi.csv", header, rows))
        self.assertEqual(len(df), 2, "sesi batal tidak ikut dianalisis")
        self.assertEqual(self.ats.matriks_konfusi(df), self.MATRIKS)

    def test_keputusan_kosong_ditolak(self):
        rows = [self.LARAVEL_ROWS[0][:7] + ["Accept", "", "Accept"]]
        with self.assertRaises(ValueError):
            self.ats.muat_presentasi(_tulis_csv(self.tmp / "kosong.csv", LARAVEL_HEADER, rows))

    def test_main_berhenti_bila_belum_lengkap(self):
        path = _tulis_csv(self.tmp / "laravel.csv", LARAVEL_HEADER, self.LARAVEL_ROWS)
        self.assertEqual(self.ats.main([str(path), "--keluaran", str(self.tmp)]), 1)
        self.assertFalse((self.tmp / "galat_per_subjek.csv").exists())


if __name__ == "__main__":
    unittest.main()
