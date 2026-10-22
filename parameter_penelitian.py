"""
Parameter penelitian yang dikunci naskah skripsi.

Satu sumber untuk ambang keputusan, kondisi uji, dan ukuran desain. Modul lain
mengimpor dari sini alih-alih menulis angkanya sendiri, supaya sistem yang
menghasilkan data dan naskah yang melaporkannya tidak bisa diam-diam berbeda.

Rujukan naskah:
  - Tabel 4.4 dan Tabel 5.2  : ambang FaceNet, EAR, MAR, alpha, jendela 8,0 detik
  - Subbab 5.2               : tingkat lux dan rentang posisi jarak
  - Subbab 3.3.1             : 18 subjek, 9 kombinasi kondisi

Keputusan peneliti (25 September 2026):
  - rentang lux mengikuti PRD dan naskah: redup <100, normal 100-300, terang >300
  - jarak 30, 45, 60 cm
  - repetisi diturunkan dari 10 menjadi 5 per kombinasi kondisi

Modul ini sengaja tidak mengimpor torch, dlib, atau cv2 agar bisa dipakai
skrip ringan (logger telemetry, pengukur lux/jarak, analisis statistik).
"""

from __future__ import annotations

import math
from typing import Optional

# Ambang keputusan (Tabel 5.2)

# Embedding dinormalisasi L2, sehingga cosine = 1 - d^2 / 2. Pada d = 0,40
# cosine = 0,92 -- inilah "skor kesamaan >= 0,92" yang disebut naskah.
FACENET_DISTANCE_THRESHOLD = 0.40   # cocok jika d(x1, x2) <= 0,40
EAR_BLINK_THRESHOLD = 0.20          # mata tertutup jika EAR < 0,20
MAR_OPEN_THRESHOLD = 0.10           # mulut terbuka jika MAR >= 0,10
ALPHA_DEFAULT = 0.60                # S_final = 0,60 * S_embed + 0,40 * S_liveness
OBSERVATION_WINDOW_S = 8.0          # batas jendela pengamatan

# Fusi S3, keputusan peneliti D1 (21 Oktober 2026): rumus FusionModule.decide_s3.
# S3 diterima bila d <= 0,40 DAN ALPHA * s_embed + (1 - ALPHA) * P_live >= 0,50,
# dengan s_embed = max(0, 1 - d / 1,20) dan P_live in {0; 0,5; 1}. Tanpa liveness
# (P_live = 0) S3 tetap menerima bila s_embed >= 0,833, yaitu d < 0,20.
FUSION_D_REF = 1.20
FUSION_THRESHOLD = 0.50
# P_live = EMAR_W1 * min(siklus_kedip, 1) + EMAR_W2 * min(siklus_mulut, 1); liveness
# (keputusan D2: dlib mesin) lolos bila P_live >= 1,0, yaitu kedua siklus ada.
EMAR_W1 = 0.50
EMAR_W2 = 0.50
LIVENESS_THRESHOLD = 1.0
# Versi definisi keputusan yang dicatat tiap presentasi web
# (attendance-web/app/Services/FusionDecision.php::VERSION) dan dipakai sebagai
# akhiran nama CSV riset. Naikkan bila salah satu konstanta keputusan berubah
# (dikunci tests/test_parameter_naskah.py::test_versi_keputusan_terikat_konstanta).
DECISION_VERSION = "D1b-D2dlib-2026-10-21"

# "masing-masing wajib tervalidasi minimal satu siklus transisi penuh di dalam
# jendela observasi 8,0 s" (Subbab 5.3). Kedipan DAN gerakan mulut keduanya wajib.
MIN_BLINK_CYCLES = 1
MIN_MOUTH_CYCLES = 1
# Satu siklus = tidak-aktif -> aktif paling sedikit N frame -> tidak-aktif (dlib mesin).
BLINK_CONSEC_FRAMES = 2
MOUTH_OPEN_FRAMES = 3


def cosine_from_distance(d: float) -> float:
    """Skor kesamaan cosine dari jarak Euclidean dua embedding ter-normalisasi L2."""
    return 1.0 - (d * d) / 2.0


# Kondisi lingkungan (Subbab 5.2, PRD bagian 7)

LUX_REDUP_MAX = 100.0     # redup  : lux < 100
LUX_NORMAL_MAX = 300.0    # normal : 100 <= lux <= 300 ; terang : lux > 300

LUX_CATEGORIES = {
    "redup": (0.0, LUX_REDUP_MAX),
    "normal": (LUX_REDUP_MAX, LUX_NORMAL_MAX),
    "terang": (LUX_NORMAL_MAX, math.inf),
}


def kategori_lux(lux: float) -> str:
    """'redup', 'normal', atau 'terang' untuk satu nilai lux."""
    if lux < LUX_REDUP_MAX:
        return "redup"
    if lux <= LUX_NORMAL_MAX:
        return "normal"
    return "terang"


DISTANCE_CM = (30, 45, 60)

# Rentang posisi yang dianggap sah untuk tiap tingkat jarak (Subbab 5.2).
# Di antara rentang (mis. 42 cm) posisi subjek belum memenuhi kondisi mana pun.
DISTANCE_BANDS = {
    30: (30.0, 40.0),
    45: (45.0, 55.0),
    60: (60.0, 70.0),
}
DISTANCE_LABELS = {30: "Dekat", 45: "Ideal", 60: "Jauh"}


def tingkat_jarak(cm: float) -> Optional[int]:
    """Tingkat jarak (30/45/60) bila cm berada di rentangnya, selain itu None."""
    for level, (lo, hi) in DISTANCE_BANDS.items():
        if lo <= cm <= hi:
            return level
    return None


def tingkat_jarak_terdekat(cm: float) -> int:
    """Tingkat jarak yang paling dekat dengan cm, untuk panduan reposisi."""
    return min(DISTANCE_CM, key=lambda level: abs(cm - level))


# Desain pengujian (Subbab 3.3.1, dengan repetisi 5)

N_SUBJECTS = 18
REPETITIONS = 5

BONA_FIDE = "bona_fide"
ATTACK_LABELS = ("print_attack", "screen_attack", "replay_video")
SAMPLE_LABELS = (BONA_FIDE,) + ATTACK_LABELS

N_CONDITIONS = len(LUX_CATEGORIES) * len(DISTANCE_CM)                 # 9
N_BONA_FIDE = N_SUBJECTS * REPETITIONS * N_CONDITIONS                  # 810
N_ATTACK = N_SUBJECTS * len(ATTACK_LABELS) * REPETITIONS * N_CONDITIONS  # 2.430
N_TOTAL = N_BONA_FIDE + N_ATTACK                                       # 3.240
N_PER_SUBJECT = N_TOTAL // N_SUBJECTS                                  # 180
