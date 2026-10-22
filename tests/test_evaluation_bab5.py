#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit Tests untuk Evaluasi Serentak 3 Skenario & Data Logger Bab 5
"""

import os
import csv
import tempfile
import unittest
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

# Impor fungsi yang diuji
from evaluation_bab5 import evaluate_trial, log_to_csv, evaluate_and_log

class TestEvaluationBab5(unittest.TestCase):

    def test_s1_decision(self):
        # Euclidean <= 0.40 -> 1 (ACCEPT), Tabel 5.2
        s1, _, _ = evaluate_trial(euclidean_dist=0.0, ear=0.25, mar=0.10)
        self.assertEqual(s1, 1)

        s1, _, _ = evaluate_trial(euclidean_dist=0.40, ear=0.25, mar=0.10)
        self.assertEqual(s1, 1)

        # Euclidean > 0.40 -> 0 (REJECT)
        s1, _, _ = evaluate_trial(euclidean_dist=0.401, ear=0.25, mar=0.10)
        self.assertEqual(s1, 0)

        s1, _, _ = evaluate_trial(euclidean_dist=1.45, ear=0.25, mar=0.10)
        self.assertEqual(s1, 0)

    def test_s2_rule_based_gate(self):
        # S2 membutuhkan Wajah lolos (S1=1) DAN Kedipan (EAR < 0.20) DAN Mulut (MAR >= 0.10)
        
        # Valid semua -> S2 = 1
        s1, s2, _ = evaluate_trial(euclidean_dist=0.35, ear=0.18, mar=0.42)
        self.assertEqual(s1, 1)
        self.assertEqual(s2, 1)

        # Wajah lolos tapi mata melek (EAR >= 0.20) -> S2 = 0
        _, s2, _ = evaluate_trial(euclidean_dist=0.35, ear=0.25, mar=0.42)
        self.assertEqual(s2, 0)

        # EAR tepat 0.20 masih dihitung mata terbuka
        _, s2, _ = evaluate_trial(euclidean_dist=0.35, ear=0.20, mar=0.42)
        self.assertEqual(s2, 0)

        _, s2, _ = evaluate_trial(euclidean_dist=0.35, ear=0.199, mar=0.42)
        self.assertEqual(s2, 1)

        # Wajah lolos tapi mulut diam (MAR < 0.10) -> S2 = 0
        _, s2, _ = evaluate_trial(euclidean_dist=0.35, ear=0.18, mar=0.05)
        self.assertEqual(s2, 0)

        _, s2, _ = evaluate_trial(euclidean_dist=0.35, ear=0.18, mar=0.099)
        self.assertEqual(s2, 0)

        # MAR tepat 0.10 sudah dihitung mulut terbuka
        _, s2, _ = evaluate_trial(euclidean_dist=0.35, ear=0.18, mar=0.10)
        self.assertEqual(s2, 1)

        # Jarak tepat di ambang 0.40 lolos, 0.401 gagal
        s1, s2, _ = evaluate_trial(euclidean_dist=0.40, ear=0.18, mar=0.42)
        self.assertEqual((s1, s2), (1, 1))
        s1, s2, _ = evaluate_trial(euclidean_dist=0.401, ear=0.18, mar=0.42)
        self.assertEqual((s1, s2), (0, 0))

        # Wajah tidak lolos (S1=0) meskipun liveness valid -> S2 = 0
        s1, s2, _ = evaluate_trial(euclidean_dist=1.20, ear=0.18, mar=0.42)
        self.assertEqual(s1, 0)
        self.assertEqual(s2, 0)

    def test_s3_weighted_fusion(self):
        # S3 keputusan D1 (rumus b): d <= 0,40 DAN 0,6 * (1 - d/1,20) + 0,4 * P_live >= 0,50,
        # dengan P_live = 0,5 * kedip + 0,5 * mulut.
        # Kasus A: d = 0, kedip dan mulut -> s_final = 1,0 -> S3 = 1
        _, _, s3 = evaluate_trial(euclidean_dist=0.0, ear=0.18, mar=0.40)
        self.assertEqual(s3, 1)

        # Kasus B: d = 0,30, tanpa liveness -> 0,6 * 0,75 = 0,45 < 0,50 -> S3 = 0
        _, _, s3 = evaluate_trial(euclidean_dist=0.30, ear=0.28, mar=0.05)
        self.assertEqual(s3, 0)

        # Kasus C: d = 0,30, hanya mulut (P_live 0,5) -> 0,45 + 0,20 = 0,65 -> S3 = 1, S2 = 0
        _, s2, s3 = evaluate_trial(euclidean_dist=0.30, ear=0.28, mar=0.40)
        self.assertEqual((s2, s3), (0, 1))

        # Kasus D: gerbang identitas. d = 0,60 dengan liveness penuh dulu diterima rumus a
        # (0,76 >= 0,75); kini S3 = 0 karena d > 0,40.
        _, _, s3 = evaluate_trial(euclidean_dist=0.60, ear=0.18, mar=0.40)
        self.assertEqual(s3, 0)

        # Kasus E: tanpa liveness, d = 0,20 tepat ditolak (0,49999999999999994) dan
        # d = 0,19 diterima. Sifat rumus b ini harus dilaporkan di naskah.
        self.assertEqual(evaluate_trial(euclidean_dist=0.20, ear=0.28, mar=0.05)[2], 0)
        self.assertEqual(evaluate_trial(euclidean_dist=0.19, ear=0.28, mar=0.05)[2], 1)

    def test_log_to_csv(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            test_csv = os.path.join(tmpdir, "test_bab5.csv")
            
            # Log baris pertama (harus membuat header)
            log_to_csv(
                participant_id="P01",
                jarak=30,
                lux=300,
                label_aktual="Bona_Fide",
                euclidean_dist=0.28456,
                ear=0.1824,
                mar=0.3951,
                s1=1,
                s2=1,
                s3=1,
                filename=test_csv
            )

            # Log baris kedua (append tanpa duplikasi header)
            log_to_csv(
                participant_id="P02",
                jarak=45,
                lux=150,
                label_aktual="Print_Attack",
                euclidean_dist=0.3211,
                ear=0.2891,
                mar=0.0841,
                s1=1,
                s2=0,
                s3=0,
                filename=test_csv
            )

            # Verifikasi isi CSV
            with open(test_csv, "r", encoding="utf-8") as f:
                reader = list(csv.reader(f))

            # Total 3 baris: 1 header + 2 data
            self.assertEqual(len(reader), 3)

            # Header check
            expected_header = [
                'participant_id', 'jarak_cm', 'lux', 'label_aktual',
                'euclidean_dist', 'ear', 'mar', 'keputusan_S1', 'keputusan_S2', 'keputusan_S3'
            ]
            self.assertEqual(reader[0], expected_header)

            # Baris 1
            self.assertEqual(reader[1][0], "P01")
            self.assertEqual(reader[1][3], "Bona_Fide")
            self.assertEqual(reader[1][4], "0.285")  # Rounded 3 decimals
            self.assertEqual(reader[1][5], "0.182")
            self.assertEqual(reader[1][6], "0.395")
            self.assertEqual(reader[1][7], "1")
            self.assertEqual(reader[1][8], "1")
            self.assertEqual(reader[1][9], "1")

            # Baris 2
            self.assertEqual(reader[2][0], "P02")
            self.assertEqual(reader[2][3], "Print_Attack")
            self.assertEqual(reader[2][7], "1")
            self.assertEqual(reader[2][8], "0")
            self.assertEqual(reader[2][9], "0")

    def test_evaluate_and_log_liveness_boundaries(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            test_csv = os.path.join(tmpdir, "test_bab5_live.csv")

            res = evaluate_and_log("P01", 30, 150, "Bona_Fide", 0.40, 0.199, 0.10, filename=test_csv)
            self.assertTrue(res["liveness_valid"])
            self.assertEqual((res["s1_decision"], res["s2_decision"]), (1, 1))

            res = evaluate_and_log("P01", 30, 150, "Bona_Fide", 0.40, 0.20, 0.10, filename=test_csv)
            self.assertFalse(res["liveness_valid"])

            res = evaluate_and_log("P01", 30, 150, "Bona_Fide", 0.40, 0.199, 0.099, filename=test_csv)
            self.assertFalse(res["liveness_valid"])

            # alpha bawaan 0.60 (D1): 0.60 * (1 - 0.30/1.20) + 0.40 * 1.0 = 0.85
            res = evaluate_and_log("P01", 30, 150, "Bona_Fide", 0.30, 0.18, 0.40, filename=test_csv)
            self.assertAlmostEqual(res["s_final"], 0.85, places=3)
            self.assertAlmostEqual(res["p_face"], 0.75, places=3)


if __name__ == "__main__":
    unittest.main()
