#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MODUL ALGORITMA CHALLENGE-RESPONSE (EMAR AKTIF)
Penelitian Skripsi: FaceNet + Eye-Mouth Aspect Ratio (EMAR)
Peneliti          : Qalwani Anugerah — NPM 221220048 — UMP 2026
=============================================================================

Alur Kerja 4 Fase:
- Fase 1: Deteksi Awal (T=0s): Memastikan wajah normal (EAR >= 0.20, MAR < 0.10)
- Fase 2: Random Challenge (T=1s): Sistem membangkitkan perintah acak ('BLINK' atau 'OPEN_MOUTH')
- Fase 3: Jendela Observasi Spesifik (T=2s s.d T=5s, timeout 4.0s):
    * BLINK     : EAR < 0.20 & MAR < 0.10 -> PASS_LIVENESS. Jika MAR >= 0.10 -> REJECT_WRONG_ACTION
    * OPEN_MOUTH: MAR >= 0.10 & EAR >= 0.20 -> PASS_LIVENESS. Jika EAR < 0.20 -> REJECT_WRONG_ACTION
    * Timeout (> 4.0s tanpa aksi benar) -> REJECT_TIMEOUT (Serangan Foto/Video Replay)
- Fase 4: Fusi Keputusan (T=6s):
    FaceNet Euclidean <= 0.40 AND PASS_LIVENESS -> ACCEPT (Bona Fide). Selain itu -> REJECT
"""

import random
import time
from typing import Tuple, Optional

# Ambang Tabel 5.2
from parameter_penelitian import (
    EAR_BLINK_THRESHOLD,
    FACENET_DISTANCE_THRESHOLD,
    MAR_OPEN_THRESHOLD,
)


class ActiveLivenessEMAR:
    """
    Kelas penilai liveness detection berbasis Challenge-Response aktif.
    """

    def __init__(self, timeout_seconds: float = 4.0):
        self.challenges = ['BLINK', 'OPEN_MOUTH']
        self.current_challenge: Optional[str] = None
        self.challenge_start_time: float = 0.0
        self.is_completed: bool = False
        self.timeout_seconds: float = timeout_seconds  # Batas waktu respons subjek (default 4.0 detik)

    def generate_challenge(self, forced_challenge: Optional[str] = None) -> Tuple[str, str]:
        """
        Membangkitkan satu perintah acak dan mencatat timestamp awal.
        
        Args:
            forced_challenge: Opsional, untuk pengetesan terarah ('BLINK' atau 'OPEN_MOUTH')
            
        Returns:
            Tuple[str, str]: (nama_tantangan, teks_instruksi)
        """
        if forced_challenge and forced_challenge in self.challenges:
            self.current_challenge = forced_challenge
        else:
            self.current_challenge = random.choice(self.challenges)

        self.challenge_start_time = time.time()
        self.is_completed = False

        prompt_text = (
            "INSTRUKSI: KEDIPKAN MATA ANDA SEKARANG!"
            if self.current_challenge == 'BLINK'
            else "INSTRUKSI: BUKA MULUT ANDA SEKARANG!"
        )
        return self.current_challenge, prompt_text

    def evaluate_response(
        self,
        current_ear: float,
        current_mar: float,
        current_time: Optional[float] = None
    ) -> str:
        """
        Mengevaluasi respons biometrik frame saat ini terhadap tantangan yang sedang aktif.
        
        Args:
            current_ear: Nilai Eye Aspect Ratio (EAR) frame
            current_mar: Nilai Mouth Aspect Ratio (MAR) frame
            current_time: Timestamp opsional untuk pengetesan deterministik
            
        Returns:
            str: 'PASS_LIVENESS', 'REJECT_WRONG_ACTION', 'REJECT_TIMEOUT', 
                 'WAITING_FOR_ACTION', atau 'ALREADY_COMPLETED'
        """
        if self.is_completed:
            return "ALREADY_COMPLETED"

        now = current_time if current_time is not None else time.time()
        elapsed = now - self.challenge_start_time

        # Cek batas waktu (Time-out = Serangan Foto/Video Replay)
        if elapsed > self.timeout_seconds:
            return "REJECT_TIMEOUT"

        if self.current_challenge == 'BLINK':
            # Jika kedip terdeteksi (EAR drop < 0.20) dan mulut tidak terbuka
            if current_ear < EAR_BLINK_THRESHOLD and current_mar < MAR_OPEN_THRESHOLD:
                self.is_completed = True
                return "PASS_LIVENESS"
            # Jika malah buka mulut padahal disuruh kedip = Deteksi Aksi Salah
            elif current_mar >= MAR_OPEN_THRESHOLD:
                return "REJECT_WRONG_ACTION"

        elif self.current_challenge == 'OPEN_MOUTH':
            # Jika mulut terbuka (MAR >= 0.10) dan mata tidak terpejam anomali
            if current_mar >= MAR_OPEN_THRESHOLD and current_ear >= EAR_BLINK_THRESHOLD:
                self.is_completed = True
                return "PASS_LIVENESS"
            # Jika malah berkedip padahal disuruh buka mulut = Deteksi Aksi Salah
            elif current_ear < EAR_BLINK_THRESHOLD:
                return "REJECT_WRONG_ACTION"

        return "WAITING_FOR_ACTION"


def evaluate_active_trial(
    euclidean_dist: float,
    challenge_passed: bool,
    threshold_dist: float = FACENET_DISTANCE_THRESHOLD
) -> str:
    """
    Logika Fusi Akhir di Detik ke-6 (T=6s).
    
    Args:
        euclidean_dist: Jarak Euclidean L2 FaceNet
        challenge_passed: True jika status liveness == 'PASS_LIVENESS'
        threshold_dist: Ambang jarak FaceNet (default: 0.40)
        
    Returns:
        str: Keputusan akhir dalam bentuk teks deskriptif
    """
    if challenge_passed and euclidean_dist <= threshold_dist:
        return "ACCEPT (Bona Fide & Identity Match)"
    elif not challenge_passed:
        return "REJECT (Liveness Challenge Failed)"
    else:
        return "REJECT (Identity Impostor / Distance Too High)"
