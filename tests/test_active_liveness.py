#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit Tests untuk Modul Algoritma Challenge-Response (EMAR Aktif)
"""

import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from active_liveness import ActiveLivenessEMAR, evaluate_active_trial


class TestActiveLivenessEMAR(unittest.TestCase):

    def setUp(self):
        self.checker = ActiveLivenessEMAR(timeout_seconds=4.0)

    def test_generate_challenge_randomness_and_prompts(self):
        # Test BLINK
        ch, prompt = self.checker.generate_challenge(forced_challenge='BLINK')
        self.assertEqual(ch, 'BLINK')
        self.assertIn("KEDIPKAN MATA", prompt)
        self.assertFalse(self.checker.is_completed)
        self.assertGreater(self.checker.challenge_start_time, 0)

        # Test OPEN_MOUTH
        ch2, prompt2 = self.checker.generate_challenge(forced_challenge='OPEN_MOUTH')
        self.assertEqual(ch2, 'OPEN_MOUTH')
        self.assertIn("BUKA MULUT", prompt2)

    def test_blink_challenge_workflow(self):
        self.checker.generate_challenge(forced_challenge='BLINK')
        t0 = self.checker.challenge_start_time

        # 1. Menunggu respons (mata terbuka, mulut tertutup)
        status = self.checker.evaluate_response(current_ear=0.25, current_mar=0.05, current_time=t0 + 1.0)
        self.assertEqual(status, "WAITING_FOR_ACTION")

        # 2. Kedipan valid (EAR < 0.20, MAR < 0.10)
        status = self.checker.evaluate_response(current_ear=0.18, current_mar=0.05, current_time=t0 + 2.0)
        self.assertEqual(status, "PASS_LIVENESS")
        self.assertTrue(self.checker.is_completed)

        # 3. Setelah selesai, status adalah ALREADY_COMPLETED
        status = self.checker.evaluate_response(current_ear=0.25, current_mar=0.05, current_time=t0 + 2.5)
        self.assertEqual(status, "ALREADY_COMPLETED")

    def test_blink_challenge_wrong_action_reject(self):
        self.checker.generate_challenge(forced_challenge='BLINK')
        t0 = self.checker.challenge_start_time

        # Subjek malah buka mulut (MAR >= 0.10) -> Langsung REJECT_WRONG_ACTION
        status = self.checker.evaluate_response(current_ear=0.26, current_mar=0.45, current_time=t0 + 1.5)
        self.assertEqual(status, "REJECT_WRONG_ACTION")

    def test_blink_challenge_threshold_boundaries(self):
        self.checker.generate_challenge(forced_challenge='BLINK')
        t0 = self.checker.challenge_start_time

        # EAR tepat 0.20 belum dihitung mata tertutup
        status = self.checker.evaluate_response(current_ear=0.20, current_mar=0.05, current_time=t0 + 1.0)
        self.assertEqual(status, "WAITING_FOR_ACTION")

        # MAR tepat 0.10 sudah dihitung mulut terbuka
        status = self.checker.evaluate_response(current_ear=0.199, current_mar=0.10, current_time=t0 + 1.2)
        self.assertEqual(status, "REJECT_WRONG_ACTION")
        self.assertFalse(self.checker.is_completed)

        status = self.checker.evaluate_response(current_ear=0.199, current_mar=0.099, current_time=t0 + 1.5)
        self.assertEqual(status, "PASS_LIVENESS")
        self.assertTrue(self.checker.is_completed)

    def test_blink_challenge_timeout(self):
        self.checker.generate_challenge(forced_challenge='BLINK')
        t0 = self.checker.challenge_start_time

        # Tidak ada kedipan hingga lewat 4.0 detik (misal foto statis)
        status = self.checker.evaluate_response(current_ear=0.25, current_mar=0.05, current_time=t0 + 4.1)
        self.assertEqual(status, "REJECT_TIMEOUT")

    def test_open_mouth_challenge_workflow(self):
        self.checker.generate_challenge(forced_challenge='OPEN_MOUTH')
        t0 = self.checker.challenge_start_time

        # 1. Menunggu respons
        status = self.checker.evaluate_response(current_ear=0.25, current_mar=0.05, current_time=t0 + 0.5)
        self.assertEqual(status, "WAITING_FOR_ACTION")

        # 2. Mulut terbuka valid (MAR >= 0.10, EAR >= 0.20)
        status = self.checker.evaluate_response(current_ear=0.24, current_mar=0.42, current_time=t0 + 1.8)
        self.assertEqual(status, "PASS_LIVENESS")
        self.assertTrue(self.checker.is_completed)

    def test_open_mouth_challenge_wrong_action_reject(self):
        self.checker.generate_challenge(forced_challenge='OPEN_MOUTH')
        t0 = self.checker.challenge_start_time

        # Subjek malah kedip (EAR < 0.20) saat diminta buka mulut -> REJECT_WRONG_ACTION
        status = self.checker.evaluate_response(current_ear=0.16, current_mar=0.05, current_time=t0 + 1.2)
        self.assertEqual(status, "REJECT_WRONG_ACTION")

    def test_open_mouth_challenge_threshold_boundaries(self):
        self.checker.generate_challenge(forced_challenge='OPEN_MOUTH')
        t0 = self.checker.challenge_start_time

        status = self.checker.evaluate_response(current_ear=0.20, current_mar=0.099, current_time=t0 + 0.5)
        self.assertEqual(status, "WAITING_FOR_ACTION")

        status = self.checker.evaluate_response(current_ear=0.199, current_mar=0.10, current_time=t0 + 1.0)
        self.assertEqual(status, "REJECT_WRONG_ACTION")
        self.assertFalse(self.checker.is_completed)

        # MAR tepat 0.10 dan EAR tepat 0.20: mulut terbuka, mata terbuka
        status = self.checker.evaluate_response(current_ear=0.20, current_mar=0.10, current_time=t0 + 1.5)
        self.assertEqual(status, "PASS_LIVENESS")
        self.assertTrue(self.checker.is_completed)

    def test_open_mouth_challenge_timeout(self):
        self.checker.generate_challenge(forced_challenge='OPEN_MOUTH')
        t0 = self.checker.challenge_start_time

        # Tidak ada aksi hingga timeout
        status = self.checker.evaluate_response(current_ear=0.25, current_mar=0.05, current_time=t0 + 4.05)
        self.assertEqual(status, "REJECT_TIMEOUT")

    def test_evaluate_active_trial_fusion(self):
        # Kasus 1: Tantangan lolos + Euclidean <= 0.40 -> ACCEPT
        res = evaluate_active_trial(euclidean_dist=0.35, challenge_passed=True, threshold_dist=0.40)
        self.assertIn("ACCEPT", res)

        # Kasus 2: Tantangan lolos tepat di batas ambang 0.40 -> ACCEPT
        res = evaluate_active_trial(euclidean_dist=0.40, challenge_passed=True, threshold_dist=0.40)
        self.assertIn("ACCEPT", res)

        # Kasus 3: Tantangan lolos tapi wajah tidak cocok (Euclidean > 0.40) -> REJECT
        res = evaluate_active_trial(euclidean_dist=0.401, challenge_passed=True, threshold_dist=0.40)
        self.assertIn("REJECT", res)
        self.assertIn("Distance Too High", res)

        # Kasus 4: Tantangan gagal (Liveness failed) meskipun wajah mirip -> REJECT
        res = evaluate_active_trial(euclidean_dist=0.20, challenge_passed=False, threshold_dist=0.40)
        self.assertIn("REJECT", res)
        self.assertIn("Liveness Challenge Failed", res)

        # Ambang bawaan harus 0.40 (Tabel 5.2)
        self.assertIn("ACCEPT", evaluate_active_trial(euclidean_dist=0.40, challenge_passed=True))
        res = evaluate_active_trial(euclidean_dist=0.401, challenge_passed=True)
        self.assertIn("Distance Too High", res)


if __name__ == '__main__':
    unittest.main()
