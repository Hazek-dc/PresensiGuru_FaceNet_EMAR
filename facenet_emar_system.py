#!/usr/bin/env python3
"""
=============================================================================
SISTEM FACE VERIFICATION + EMAR LIVENESS DETECTION
Penelitian: "Analisis Kinerja FaceNet dan Eye-Mouth Aspect Ratio (EMAR)
            pada Sistem Face Verification Mitigasi Serangan Spoofing Presensi"
Peneliti  : Qalwani Anugerah — NPM 221220048
Institusi : Universitas Muhammadiyah Pontianak, 2026
Standar   : ISO/IEC 30107-3:2023 (APCER, BPCER, ACER)
=============================================================================

ARSITEKTUR PIPELINE:
  Frame Kamera
    → MTCNN (Deteksi + Alignment Wajah)
    → InceptionResnetV1 (FaceNet Embedding 512-D)
    → Dlib 68-Landmark (EAR + MAR → EMAR)
    → Fusion (Rule-based Gate / Weighted Fusion)
    → Keputusan: BONA-FIDE / SPOOF
    → MySQL / Log Kehadiran

SKENARIO EKSPERIMEN:
  S1 = FaceNet Stand-alone
  S2 = FaceNet + EMAR (Rule-based Gate)
  S3 = FaceNet + EMAR (Weighted Fusion, optimasi alpha)

TIGA JENIS SERANGAN:
  - Print Attack (foto cetak)
  - Screen Attack (layar ponsel/laptop)
  - Replay Video Attack

VARIABEL KONTROL:
  - Intensitas cahaya: Redup (<200 lux), Normal (200–500 lux), Terang (>500 lux)
  - Jarak kamera-subjek: 30 cm, 60 cm, 100 cm

METRIK EVALUASI (ISO/IEC 30107-3):
  APCER = N_PA→BF / N_PA_total  (Attack Presentation Classification Error Rate)
  BPCER = N_BF→PA / N_BF_total  (Bona-fide Presentation Classification Error Rate)
  ACER  = (APCER + BPCER) / 2    (Average Classification Error Rate)
"""

# ==============================================================================
# BAGIAN 1: IMPOR PUSTAKA
# ==============================================================================
import os
import sys
import cv2
import time
import json
import uuid
import logging
import hashlib
import threading
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pickle
import sqlite3
import csv
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, NamedTuple, Optional, Tuple, Dict, List
from dataclasses import dataclass, field, asdict
from enum import Enum
from datetime import datetime, date, timedelta

# PyTorch / FaceNet
import torch
from facenet_pytorch import MTCNN, InceptionResnetV1

# Flask API
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import io

# Evaluasi metrik
from sklearn.metrics import (
    confusion_matrix, accuracy_score, precision_score,
    recall_score, f1_score, roc_curve, auc
)
from statsmodels.stats.contingency_tables import mcnemar

# Visualisasi
import matplotlib
import matplotlib.pyplot as plt

def robust_open_webcam(camera_index=0):
    """Buka webcam dengan fallback aman (DSHOW diutamakan di Windows) dan auto-probe index multi-kamera."""
    import time
    candidate_indices = []
    if camera_index is not None:
        candidate_indices.append(camera_index)
    for idx in [0, 1, 2, 3]:
        if idx not in candidate_indices:
            candidate_indices.append(idx)

    backends = []
    if sys.platform == "win32" or os.name == "nt":
        if hasattr(cv2, "CAP_DSHOW"):
            backends.append(("DSHOW", cv2.CAP_DSHOW))
        if hasattr(cv2, "CAP_MSMF"):
            backends.append(("MSMF", cv2.CAP_MSMF))
    backends.append(("ANY", cv2.CAP_ANY))
    
    for idx in candidate_indices:
        for b_name, backend in backends:
            cap = None
            try:
                cap = cv2.VideoCapture(idx, backend)
                if not cap.isOpened():
                    cap.release()
                    continue
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                
                # Baca beberapa frame awal untuk memastikan stream aktif dan tidak hitam
                valid_frame = None
                for _ in range(5):
                    ok, fr = cap.read()
                    if ok and fr is not None and fr.size > 0:
                        valid_frame = fr
                        break
                    time.sleep(0.02)

                if valid_frame is not None and float(valid_frame.mean()) > 5.0:
                    print(f"[INFO] Webcam AKTIF di Index {idx} (Backend: {b_name}, Resolusi: {valid_frame.shape[1]}x{valid_frame.shape[0]})")
                    return cap
                cap.release()
            except Exception:
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass
                continue

    # Fallback darurat
    fallback_cap = cv2.VideoCapture(camera_index)
    return fallback_cap

import matplotlib.patches as mpatches

# ==============================================================================
# BAGIAN 2: KONFIGURASI SISTEM
# ==============================================================================

# Semua path relatif terhadap folder modul ini, bukan folder kerja proses.
# Dulu biometric-api (dijalankan dari biometric-api/) membuat gallery/ kosong
# sendiri, sehingga setiap verifikasi gagal menemukan template wajah.
BASE_DIR = Path(__file__).resolve().parent
for _sub in ("logs", "models", "gallery", "results", "exports"):
    (BASE_DIR / _sub).mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(BASE_DIR / "logs" / "system.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("FaceEMARSystem")

# Ambang keputusan, kondisi uji, dan jendela pengamatan dikunci naskah
# (Tabel 4.4, Tabel 5.2, Subbab 5.2) dan didefinisikan di parameter_penelitian.
# Jangan menulis ulang angkanya di sini.
from parameter_penelitian import (  # noqa: E402
    ALPHA_DEFAULT,
    DISTANCE_CM,
    EAR_BLINK_THRESHOLD,
    FACENET_DISTANCE_THRESHOLD,
    LUX_CATEGORIES,
    MAR_OPEN_THRESHOLD,
    MIN_BLINK_CYCLES,
    MIN_MOUTH_CYCLES,
    OBSERVATION_WINDOW_S,
)

# ---- Parameter FaceNet -------------------------------------------------------
FACENET_EMBEDDING_SIZE     = 512    # InceptionResnetV1 → 512-D
FACENET_MIN_FACE_SIZE      = 40     # px minimum untuk MTCNN
FACENET_MIN_CONFIDENCE     = 0.90   # Confidence minimum MTCNN detection
D_REF                      = 1.20   # Jarak referensi untuk skor P_face [0,1]
# FACENET_GALLERY_PATH dipakai tes agar tidak pernah menulis galeri asli.
GALLERY_PATH               = Path(os.environ.get("FACENET_GALLERY_PATH") or BASE_DIR / "gallery" / "face_gallery.pkl")
DEVICE                     = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ---- Parameter EMAR ----------------------------------------------------------
EMAR_W1             = 0.50          # Bobot komponen mata pada skor EMAR (w1)
EMAR_W2             = 0.50          # Bobot komponen mulut pada skor EMAR (w2), w1+w2=1
BLINK_REF           = MIN_BLINK_CYCLES   # Siklus kedip untuk evidence mata 1.0
MOUTH_REF           = MIN_MOUTH_CYCLES   # Siklus buka-tutup mulut untuk evidence mulut 1.0

# Naskah mewajibkan kedipan DAN gerakan mulut masing-masing minimal satu siklus.
# Karena P_live = w1*evidence_mata + w2*evidence_mulut dengan w1 + w2 = 1,
# P_live mencapai 1,0 hanya bila kedua evidence penuh -- maka ambangnya 1,0.
EMAR_LIVENESS_THRESHOLD = 1.0       # TAU_LIVE: ambang P_live untuk keputusan PAD

# ---- Parameter Fusion --------------------------------------------------------
#  S2: Rule-based Gate  → liveness lolos DAN identitas cocok
#  S3: Weighted Fusion  → S_final = alpha * P_face + (1-alpha) * P_live >= TAU_FUSION
# TAU_FUSION tidak ditetapkan naskah. Dengan alpha 0,60, serangan statis
# (P_live = 0) tetap diterima S3 bila P_face >= 0,833, yaitu d <= 0,20.
FINAL_THRESHOLD     = 0.50          # TAU_FUSION: ambang keputusan S3

# ---- Parameter Liveness Temporal --------------------------------------------
# Durasi minimum dihitung dalam frame, sehingga bergantung pada fps pipeline.
# Pada ~12 fps (EMAR saja), 2 frame = ~167 ms; kedipan yang lebih singkat lolos.
BLINK_CONSEC_FRAMES  = 2            # Frame berturut-turut mata tertutup → kedipan
MOUTH_OPEN_FRAMES    = 3            # Frame berturut-turut mulut terbuka → satu siklus
EMAR_BUFFER_MAX_FRAMES = 1024       # Batas pengaman buffer, jauh di atas 8 s × fps

# ---- Runtime -----------------------------------------------------------------
# Deteksi wajah dlib pada frame 1080p ~200 ms/frame; video presensi 8 s (240 frame)
# butuh ~50 s bila berurutan, melewati batas waktu Laravel. Deteksi dan landmark
# per frame saling bebas, jadi dijalankan paralel; hasilnya identik dengan urutan.
EMAR_WORKERS           = max(1, min(6, (os.cpu_count() or 2) - 2))
FACENET_FRAME_INTERVAL = 10         # Jalankan FaceNet tiap N frame (demo real-time)
MAX_FRAMES             = 30         # Frame maksimum per video (evaluasi offline)

# ---- Database ----------------------------------------------------------------
DB_PATH = BASE_DIR / "logs" / "attendance.db"


# ==============================================================================
# BAGIAN 3: DATA CLASSES & ENUM
# ==============================================================================

class SpoofingType(str, Enum):
    BONA_FIDE    = "bona_fide"
    PRINT_ATTACK = "print_attack"
    SCREEN_ATTACK = "screen_attack"
    REPLAY_VIDEO  = "replay_video"

class ScenarioMode(str, Enum):
    S1_FACENET_ONLY  = "S1"
    S2_RULE_BASED    = "S2"
    S3_WEIGHTED      = "S3"

class VerificationStatus(str, Enum):
    ACCEPTED = "ACCEPTED"
    REJECTED_IDENTITY  = "REJECTED_IDENTITY"
    REJECTED_LIVENESS  = "REJECTED_LIVENESS"
    REJECTED_FUSION    = "REJECTED_FUSION"
    FTA = "FTA"          # Failure to Acquire

@dataclass
class EMARResult:
    """Hasil kalkulasi EMAR dari satu frame."""
    ear_left:    float = 0.0
    ear_right:   float = 0.0
    ear_avg:     float = 0.0
    mar:         float = 0.0
    emar_score:  float = 0.0       # S_liveness = w1*EAR + w2*MAR
    is_blink:    bool  = False
    is_mouth_open: bool = False
    is_live:     bool  = False     # Keputusan PAD berbasis EMAR
    landmark_count: int = 0        # 0 = landmark tidak terdeteksi
    blink_cycles: int  = 0         # Siklus kedip dalam jendela pengamatan
    mouth_cycles: int  = 0         # Siklus buka-tutup mulut dalam jendela pengamatan


class FrameMeasurement(NamedTuple):
    """Landmark dan EAR/MAR satu frame, sebelum digabung ke state temporal."""
    landmarks: Any
    ear_left:  float
    ear_right: float
    mar:       float
    # Lebar rahang (landmark 0-16) dan lebar frame dalam px, untuk jarak kamera.
    face_width_px: Optional[float] = None
    frame_width:   Optional[int] = None

@dataclass
class FaceNetResult:
    """Hasil verifikasi FaceNet untuk satu frame."""
    embedding:        Optional[np.ndarray] = None
    distance:         float = 9.99
    claimed_id:       str   = ""
    matched_id:       str   = ""
    is_verified:      bool  = False
    s_embed:          float = 0.0   # Skor kemiripan normal: 1 - (dist / threshold)

@dataclass
class FusionResult:
    """Hasil keputusan akhir setelah fusion."""
    scenario:         ScenarioMode = ScenarioMode.S1_FACENET_ONLY
    facenet:          FaceNetResult = field(default_factory=FaceNetResult)
    emar:             EMARResult    = field(default_factory=EMARResult)
    alpha:            float = ALPHA_DEFAULT
    s_final:          float = 0.0
    status:           VerificationStatus = VerificationStatus.FTA
    is_accepted:      bool  = False
    processing_ms:    float = 0.0
    timestamp:        str   = field(default_factory=lambda: datetime.now().isoformat())

@dataclass
class ExperimentSample:
    """Satu sampel data untuk eksperimen ISO/IEC 30107-3."""
    sample_id:      str
    subject_id:     str
    sample_type:    SpoofingType
    pai_species:    str            # print / screen_phone / screen_laptop / replay
    lux_category:   str
    distance_cm:    int
    session:        str            # enrollment / probe
    image_path:     str
    gt_label:       int            # 1 = bona-fide, 0 = attack
    split:          str = ""       # TRAIN / CALIBRATION / TEST
    claimed_subject_id: str = ""
    pred_s1:        Optional[int] = None  # Prediksi S1
    pred_s2:        Optional[int] = None  # Prediksi S2
    pred_s3:        Optional[int] = None  # Prediksi S3
    score_embed:    Optional[float] = None
    score_liveness: Optional[float] = None
    score_final:    Optional[float] = None

@dataclass
class ISOMetrics:
    """Metrik ISO/IEC 30107-3 + metrik pelengkap."""
    scenario:       str
    condition:      str            # e.g. "normal_60cm" atau "all"
    # ISO/IEC 30107-3
    apcer:          float = 0.0   # Attack Presentation Classification Error Rate
    bpcer:          float = 0.0   # Bona-fide Presentation Classification Error Rate
    acer:           float = 0.0   # Average Classification Error Rate
    # Metrik pelengkap
    accuracy:       float = 0.0
    precision:      float = 0.0
    recall:         float = 0.0
    f1:             float = 0.0
    far:            float = 0.0   # False Acceptance Rate
    frr:            float = 0.0   # False Rejection Rate
    fta:            float = 0.0   # Failure to Acquire Rate
    # Ukuran sampel
    n_bona_fide:    int = 0
    n_attack:       int = 0
    n_total:        int = 0


# ==============================================================================
# BAGIAN 4: MODUL FACENET — Embedding & Verifikasi
# ==============================================================================

# biometric-api menjalankan enroll/commit di threadpool; tanpa kunci, dua urutan
# refresh -> ubah -> simpan yang tumpang tindih saling menimpa template.
_GALLERY_WRITE_LOCK = threading.RLock()


def resolve_gallery_key(gallery: Dict[str, Dict], claimed_id: str) -> Optional[str]:
    """Kunci galeri untuk ID yang diklaim, termasuk alias berawalan emb_."""
    if claimed_id in gallery:
        return claimed_id
    if claimed_id.startswith("emb_") and claimed_id[4:] in gallery:
        return claimed_id[4:]
    if f"emb_{claimed_id}" in gallery:
        return f"emb_{claimed_id}"
    return None


class FaceNetModule:
    """
    Wrapper FaceNet menggunakan timesler/facenet-pytorch.
    Mengimplementasikan pipeline:
      Frame → MTCNN (deteksi+alignment) → InceptionResnetV1 → 512-D Embedding

    Rumus verifikasi (Persamaan 1 & 2 Proposal):
      d(x1,x2) = ||f(x1) - f(x2)||_2
      Keputusan: cocok jika d <= T_embed
    """

    def __init__(self, device: torch.device = DEVICE):
        self.device = device
        logger.info(f"Menginisialisasi FaceNet pada device: {device}")
        self._init_mtcnn()
        self._init_resnet()
        self.gallery: Dict[str, Dict] = {}
        self._load_gallery()

    def _init_mtcnn(self):
        """Inisialisasi MTCNN untuk deteksi dan alignment wajah."""
        self.mtcnn = MTCNN(
            image_size       = 160,
            margin           = 20,
            min_face_size    = FACENET_MIN_FACE_SIZE,
            thresholds       = [0.6, 0.7, 0.7],
            factor           = 0.709,
            post_process     = True,
            keep_all         = False,
            device           = self.device
        )
        logger.info("MTCNN diinisialisasi (image_size=160, margin=20)")

    def _init_resnet(self):
        """Inisialisasi InceptionResnetV1 pretrained VGGFace2."""
        self.resnet = InceptionResnetV1(
            pretrained = "vggface2",
            classify   = False
        ).to(self.device).eval()
        logger.info("InceptionResnetV1 (VGGFace2) dimuat ke device")

    # ---------- Gallery Management ----------

    @staticmethod
    def _gallery_mtime() -> Optional[int]:
        try:
            return GALLERY_PATH.stat().st_mtime_ns
        except OSError:
            return None

    def refresh_gallery(self) -> None:
        """
        Muat ulang galeri bila berkasnya diubah proses lain.

        biometric-api menyimpan satu instance mesin di memori; tanpa ini,
        pendaftaran ulang wajah lewat proses lain tidak terlihat sampai restart,
        dan save_gallery() berikutnya dapat menimpa pendaftaran tersebut.
        Instance yang galerinya tidak dimuat dari disk (mis. stub tes) dilewati.
        """
        if not hasattr(self, "_gallery_loaded_mtime"):
            return
        with _GALLERY_WRITE_LOCK:
            if self._gallery_mtime() != self._gallery_loaded_mtime:
                self._load_gallery()

    def resolve_id(self, claimed_id: str) -> Optional[str]:
        """Kunci galeri untuk ID yang diklaim, termasuk alias berawalan emb_."""
        return resolve_gallery_key(self.gallery, claimed_id)

    def _load_gallery(self):
        """Muat galeri embedding dari disk."""
        with _GALLERY_WRITE_LOCK:
            self._gallery_loaded_mtime = self._gallery_mtime()
            if GALLERY_PATH.exists():
                with open(GALLERY_PATH, "rb") as f:
                    self.gallery = pickle.load(f)
                logger.info(f"Galeri dimuat: {len(self.gallery)} subjek")
            else:
                self.gallery = {}
                logger.info("Galeri kosong — mulai enrollment baru")

    def save_gallery(self):
        """
        Simpan galeri ke disk secara atomik: tulis berkas sementara lalu ganti.
        Menulis langsung ke berkas memotongnya dulu, sehingga pembaca yang
        membuka di tengah penulisan mendapat galeri kosong/rusak.
        """
        with _GALLERY_WRITE_LOCK:
            tmp = GALLERY_PATH.with_name(f".{GALLERY_PATH.name}.{os.getpid()}.tmp")
            with open(tmp, "wb") as f:
                pickle.dump(self.gallery, f)
            # Windows menolak os.replace selama proses lain sedang membaca berkas.
            for attempt in range(20):
                try:
                    os.replace(tmp, GALLERY_PATH)
                    break
                except PermissionError:
                    if attempt == 19:
                        raise
                    time.sleep(0.05)
            self._gallery_loaded_mtime = self._gallery_mtime()
        logger.info(f"Galeri disimpan: {len(self.gallery)} subjek")

    def enroll(
        self,
        subject_id: str,
        name: str,
        dept: str,
        images: List[np.ndarray],
        session_tag: str = "enrollment"
    ) -> Dict:
        """
        Registrasi wajah subjek baru.
        Mengambil rata-rata embedding dari beberapa gambar.

        Args:
            subject_id: ID unik subjek (e.g. "GURU001")
            name      : Nama subjek
            dept      : Departemen
            images    : Daftar frame BGR dari kamera
            session_tag: Tag sesi ("enrollment") untuk cegah leakage

        Returns:
            Dict berisi status, hash template, dan nama berkas cadangan (atau None)
        """
        mean_emb, n_frames = self.build_template(images, subject_id)
        if mean_emb is None:
            return {"success": False, "msg": f"Embedding tidak cukup ({n_frames}/5)"}

        record = self._template_record(subject_id, name, dept, mean_emb, n_frames, session_tag)
        backup = self._store_record(record, [subject_id])
        logger.info(f"Enrollment berhasil: {subject_id} ({name}) — {n_frames} frames")
        return {
            "success": True,
            "subject_id": subject_id,
            "n_frames": n_frames,
            "template_hash": record["template_hash"],
            "backup": backup,
        }

    def build_template(
        self, images: List[np.ndarray], subject_id: str = ""
    ) -> Tuple[Optional[np.ndarray], int]:
        """
        Template = rata-rata embedding frame berwajah, dinormalisasi L2.
        Tidak menyentuh galeri, sehingga aman untuk pratinjau pendaftaran.

        Returns:
            (embedding atau None bila tidak ada wajah, jumlah frame berwajah)
        """
        embeddings = []
        for idx, img in enumerate(images):
            emb = self._extract_embedding(img)
            if emb is not None:
                embeddings.append(emb)
            else:
                logger.warning(f"Enrollment [{subject_id}] frame {idx}: wajah tidak terdeteksi")

        if not embeddings:
            return None, 0

        mean_emb = np.mean(embeddings, axis=0)
        mean_emb = mean_emb / np.linalg.norm(mean_emb)   # L2-normalize
        return mean_emb, len(embeddings)

    @staticmethod
    def template_hash(embedding: np.ndarray) -> str:
        """Hash template untuk audit (etika data biometrik)."""
        return hashlib.sha256(embedding.tobytes()).hexdigest()[:16]

    @classmethod
    def _template_record(
        cls, subject_id: str, name: str, dept: str,
        embedding: np.ndarray, n_frames: int, session_tag: str,
    ) -> Dict:
        return {
            "subject_id":  subject_id,
            "name":        name,
            "dept":        dept,
            "embedding":   embedding,
            "session":     session_tag,
            "n_frames":    n_frames,
            "enrolled_at": datetime.now().isoformat(),
            "template_hash": cls.template_hash(embedding),
        }

    def persist_template(
        self,
        subject_id: str,
        name: str,
        dept: str,
        embedding: np.ndarray,
        n_frames: int,
        session_tag: str = "enrollment",
        aliases: Iterable[str] = (),
        append: bool = False,
    ) -> Dict:
        """
        Simpan template yang sudah dihitung di bawah subject_id dan setiap alias.
        Berkas galeri lama selalu dicadangkan lebih dulu bila ada.

        append=True menambahkan embedding ini sebagai sesi baru ke template yang
        ada (mis. cahaya pagi/malam). Template = rata-rata sesi berbobot sama lalu
        dinormalisasi L2, sehingga satu sesi dengan banyak foto tidak mendominasi.

        Returns:
            Dict berisi subject_id, keys, n_frames, n_sessions, template_hash, backup
        """
        keys = list(dict.fromkeys([subject_id, *aliases]))
        with _GALLERY_WRITE_LOCK:
            self.refresh_gallery()
            sessions = []
            if append:
                existing_key = self.resolve_id(subject_id)
                if existing_key is None:
                    raise ValueError(f"Belum ada template untuk {subject_id}; tidak ada yang bisa ditambah.")
                existing = self.gallery[existing_key]
                sessions = [dict(s) for s in existing.get("sessions") or [{
                    "embedding": np.asarray(existing["embedding"]),
                    "n_frames": existing.get("n_frames"),
                    "session": existing.get("session"),
                    "enrolled_at": existing.get("enrolled_at"),
                }]]
            sessions.append({
                "embedding": np.asarray(embedding),
                "n_frames": n_frames,
                "session": session_tag,
                "enrolled_at": datetime.now().isoformat(),
            })
            if len(sessions) == 1:
                # Mode ganti: template persis hasil pratinjau (hash sama dengan pratinjau).
                record = self._template_record(subject_id, name, dept, embedding, n_frames, session_tag)
                total_frames = n_frames
            else:
                merged = np.mean([s["embedding"] for s in sessions], axis=0)
                merged = merged / np.linalg.norm(merged)
                total_frames = sum(int(s["n_frames"] or 0) for s in sessions)
                record = self._template_record(subject_id, name, dept, merged, total_frames,
                                               f"multisesi({len(sessions)})")
                record["sessions"] = sessions
            backup = self._store_record(record, keys)
        logger.info(f"Template disimpan: {', '.join(keys)} ({name}) — {len(sessions)} sesi, {total_frames} frames")
        return {
            "success": True,
            "subject_id": subject_id,
            "keys": keys,
            "n_frames": total_frames,
            "n_sessions": len(sessions),
            "template_hash": record["template_hash"],
            "backup": backup,
        }

    def current_embedding(self, subject_id: str) -> Optional[np.ndarray]:
        """Template tersimpan untuk subject_id (termasuk alias emb_); galeri tidak diubah."""
        with _GALLERY_WRITE_LOCK:
            self.refresh_gallery()
            key = self.resolve_id(subject_id)
            emb = None if key is None else self.gallery[key].get("embedding")
        return None if emb is None else np.array(emb)

    def _store_record(self, record: Dict, keys: List[str]) -> Optional[str]:
        with _GALLERY_WRITE_LOCK:
            # Gabung dengan isi berkas terbaru agar pendaftaran proses lain tidak tertimpa.
            self.refresh_gallery()
            # Selalu cadangkan berkas yang ada: galeri di memori bisa saja sudah
            # berbeda dari berkas (mis. dikosongkan), bukan hanya kuncinya diganti.
            backup = self._backup_gallery()
            for key in keys:
                self.gallery[key] = record
            self.save_gallery()
        return backup

    @staticmethod
    def _backup_gallery() -> Optional[str]:
        """
        Salin galeri ke backup_<YYYYmmdd_HHMMSS_ffffff>.pkl di foldernya.
        Berkas dibuat eksklusif; bila nama sudah terpakai (jam kasar), waktu
        digeser 1 µs agar cadangan sebelumnya tidak pernah tertimpa.
        """
        if not GALLERY_PATH.exists():
            return None
        data = GALLERY_PATH.read_bytes()
        stamp = datetime.now()
        while True:
            backup = GALLERY_PATH.parent / f"backup_{stamp:%Y%m%d_%H%M%S_%f}.pkl"
            try:
                with open(backup, "xb") as f:
                    f.write(data)
            except FileExistsError:
                stamp += timedelta(microseconds=1)
                continue
            logger.info(f"Galeri dicadangkan ke {backup.name}")
            return backup.name

    # ---------- Embedding Extraction ----------

    def _extract_embedding(self, img_bgr: np.ndarray) -> Optional[np.ndarray]:
        """
        Ekstraksi embedding 512-D dari gambar BGR.
        Pipeline: BGR → RGB → MTCNN (deteksi+conf filter) → InceptionResnetV1

        Returns:
            np.ndarray 512-D atau None jika wajah tidak terdeteksi / confidence rendah
        """
        try:
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            # Deteksi wajah dengan confidence filtering (min_conf)
            boxes, probs, points = self.mtcnn.detect(img_rgb, landmarks=True)
            if (boxes is None or len(boxes) == 0
                    or probs is None or probs[0] is None
                    or float(probs[0]) < FACENET_MIN_CONFIDENCE):
                return None
            # Sama dengan self.mtcnn(img_rgb) (MTCNN.forward), tetapi memakai
            # hasil deteksi di atas: deteksi kedua pada frame 1080p makan ~0,3 s.
            boxes, probs, points = self.mtcnn.select_boxes(
                boxes, probs, points, img_rgb, method=self.mtcnn.selection_method)
            face_tensor = self.mtcnn.extract(img_rgb, boxes, None)
            if face_tensor is None:
                return None
            face_tensor = face_tensor.unsqueeze(0).to(self.device)
            with torch.no_grad():
                emb = self.resnet(face_tensor).cpu().numpy()[0]
            emb = emb / (np.linalg.norm(emb) + 1e-10)
            return emb
        except Exception as e:
            logger.debug(f"Ekstraksi embedding gagal: {e}")
            return None

    # ---------- Verification ----------

    def verify(self, img_bgr: np.ndarray, claimed_id: str) -> FaceNetResult:
        """
        Verifikasi 1:1 — cocokkan wajah probe dengan template galeri subjek.

        Rumus (Persamaan 1 & 2 Proposal):
          d(x1, x2) = ||f(x1) - f(x2)||_2
          Keputusan: cocok jika d <= T_embed (= 0,40; Tabel 5.2)

        Args:
            img_bgr   : Frame kamera BGR
            claimed_id: ID subjek yang diklaim

        Returns:
            FaceNetResult dengan distance, is_verified, dan s_embed
        """
        result = FaceNetResult(claimed_id=claimed_id)
        probe_emb = self._extract_embedding(img_bgr)

        if probe_emb is None:
            logger.debug(f"verify({claimed_id}): wajah tidak terdeteksi → FTA")
            return result

        result.embedding = probe_emb

        with _GALLERY_WRITE_LOCK:
            self.refresh_gallery()
            if self.resolve_id(claimed_id) is None and hasattr(self, "_gallery_loaded_mtime"):
                self._load_gallery()
            gallery = self.gallery
        return self._match(result, probe_emb, gallery)

    def verify_against(
        self, img_bgr: np.ndarray, claimed_id: str, gallery: Dict[str, Dict]
    ) -> FaceNetResult:
        """
        verify() terhadap galeri di memori (evaluasi offline). Berkas galeri
        tidak dibaca ulang dan tidak ditulis.
        """
        result = FaceNetResult(claimed_id=claimed_id)
        probe_emb = self._extract_embedding(img_bgr)
        if probe_emb is None:
            return result
        result.embedding = probe_emb
        return self._match(result, probe_emb, gallery)

    def _match(
        self, result: FaceNetResult, probe_emb: np.ndarray, gallery: Dict[str, Dict]
    ) -> FaceNetResult:
        claimed_id = result.claimed_id
        # Resolusi alias identitas (dukung format dengan atau tanpa prefiks emb_)
        actual_id = resolve_gallery_key(gallery, claimed_id)

        if actual_id is None:
            logger.warning(f"verify({claimed_id}): subjek tidak ditemukan di galeri")
            return result

        gallery_emb = gallery[actual_id]["embedding"]
        dist = float(np.linalg.norm(probe_emb - gallery_emb))   # Jarak Euclidean L2
        result.distance    = dist
        result.is_verified = dist <= FACENET_DISTANCE_THRESHOLD
        result.matched_id  = claimed_id if result.is_verified else ""

        # Skor kemiripan P_face = max(0, 1 - dist/D_REF) — terpisah dari T_embed
        result.s_embed = float(max(0.0, 1.0 - dist / D_REF))

        logger.debug(
            f"verify({claimed_id}): dist={dist:.4f}, "
            f"threshold={FACENET_DISTANCE_THRESHOLD}, "
            f"verified={result.is_verified}, s_embed={result.s_embed:.4f}"
        )
        return result

    def get_gallery_info(self) -> List[Dict]:
        """Kembalikan daftar info subjek terdaftar."""
        self._load_gallery()
        return [
            {k: v for k, v in s.items() if k != "embedding"}
            for s in self.gallery.values()
        ]

    @staticmethod
    def score_face(dist: float, d_ref: float = D_REF) -> float:
        """Petakan jarak Euclidean → skor kemiripan P_face dalam [0,1] (untuk S3)."""
        return float(max(0.0, 1.0 - dist / max(d_ref, 1e-6)))

    def delete_template(self, subject_id: str) -> bool:
        """Hapus template subjek (etika: hapus setelah penelitian)."""
        if subject_id in self.gallery:
            del self.gallery[subject_id]
            self.save_gallery()
            logger.info(f"Template {subject_id} dihapus dari galeri")
            return True
        return False


# ==============================================================================
# BAGIAN 5: MODUL EMAR — Eye-Mouth Aspect Ratio Liveness Detection
# ==============================================================================

def count_full_cycles(active: List[bool], min_frames: int) -> int:
    """
    Hitung siklus transisi penuh: tidak-aktif → aktif (≥ min_frames) → tidak-aktif.

    Naskah mensyaratkan "minimal satu siklus transisi penuh" untuk kedipan dan
    gerakan mulut. Dengan definisi ini, citra statis tidak pernah menghasilkan
    siklus: foto bermata tertutup atau bermulut terbuka memang aktif terus,
    tetapi tidak pernah berganti keadaan. Deret yang dimulai dalam keadaan
    aktif juga tidak dihitung sampai terlihat keadaan tidak-aktif lebih dulu.
    """
    cycles, run, seen_inactive = 0, 0, False
    for is_active in active:
        if is_active:
            if seen_inactive:
                run += 1
        else:
            if run >= min_frames:
                cycles += 1
            run = 0
            seen_inactive = True
    return cycles


class EMARModule:
    """
    Kalkulasi EMAR menggunakan MediaPipe FaceMesh (478 landmark).

    EMAR = fusi EAR (kedip) + MAR (gerak mulut) menjadi satu skor liveness P_live.
    Menggabungkan dua rasio geometris menutup kelemahan EAR-tunggal terhadap
    foto cut-out.

    Rumus EAR (Eye Aspect Ratio):
      EAR = (||P_atas1-P_bawah1|| + ||P_atas2-P_bawah2||) / (2 * ||P_kiri-P_kanan||)

    Rumus MAR (Mouth Aspect Ratio, 3-pair inner mouth):
      MAR = (||A|| + ||B|| + ||C||) / (3 * ||D||)

    Skor Liveness EMAR (akumulasi bukti dalam jendela 8,0 detik):
      P_live = W_EAR * min(siklus_kedip/BLINK_REF, 1) + W_MAR * min(siklus_mulut/MOUTH_REF, 1)
      Kedip   : EAR < 0,20 (siklus penuh buka → tutup → buka)
      Mulut   : MAR >= 0,10 (siklus penuh tutup → buka → tutup)

    Keputusan PAD:
      PAD(x) = bona-fide  jika P_live >= TAU_LIVE
               spoof       jika P_live <  TAU_LIVE

    CATATAN JUJUR: liveness berbasis gerakan TIDAK mengalahkan serangan REPLAY
    (video subjek sah memuat kedipan/gerak mulut asli). Laporkan sebagai keterbatasan.
    """

    # Indeks Landmark MediaPipe FaceMesh ─────────────────────────────────
    # Indeks Landmark dlib 68 ─────────────────────────────────
    LEFT_EYE   = [36, 37, 38, 39, 40, 41]   # [kiri, atas1, atas2, kanan, bawah2, bawah1]
    RIGHT_EYE  = [42, 43, 44, 45, 46, 47]   # [kiri, atas1, atas2, kanan, bawah2, bawah1]
    INNER_MOUTH = [60, 61, 62, 63, 64, 65, 66, 67] # 8 titik inner mouth
    JAW_OUTER  = (0, 16)                    # ujung rahang kiri dan kanan

    def __init__(
        self,
        w1: float = EMAR_W1,
        w2: float = EMAR_W2,
        ear_blink_thresh: float = EAR_BLINK_THRESHOLD,
        mar_open_thresh:  float = MAR_OPEN_THRESHOLD,
        emar_thresh:      float = EMAR_LIVENESS_THRESHOLD
    ):
        assert abs(w1 + w2 - 1.0) < 1e-6, "w1 + w2 harus = 1"
        self.w1 = w1
        self.w2 = w2
        self.ear_blink_thresh = ear_blink_thresh
        self.mar_open_thresh  = mar_open_thresh
        self.emar_thresh      = emar_thresh

        import dlib
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "shape_predictor_68_face_landmarks.dat")
        if not os.path.exists(model_path):
            model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shape_predictor_68_face_landmarks.dat")

        self._detector = dlib.get_frontal_face_detector()
        self._predictor = dlib.shape_predictor(model_path)
        # Objek detektor dlib menyimpan keadaan internal: dipakai beberapa thread
        # sekaligus, hasilnya berubah. Tiap thread memakai detektornya sendiri.
        self._tls = threading.local()
        self._tls.detector = self._detector
        logger.info(f"dlib 68-Landmark Predictor diinisialisasi ({model_path})")

        # State temporal untuk deteksi kedipan dan liveness sequence
        self._blink_counter   = 0
        self._blink_total     = 0
        self._mouth_counter   = 0
        self._ear_buffer: List[float] = []   # Riwayat EAR dalam jendela pengamatan
        self._mar_buffer: List[float] = []   # Riwayat MAR dalam jendela pengamatan
        self._ts_buffer:  List[float] = []   # Waktu (detik) tiap entri buffer
        self._last_face_landmarks = None     # Untuk draw_landmarks

    # ---------- Helper ----------

    @staticmethod
    def _pt(landmarks, idx) -> np.ndarray:
        """Ambil koordinat (x, y) dari landmark dlib 68."""
        pt = landmarks.part(idx)
        return np.array([pt.x, pt.y], dtype=np.float32)

    # ---------- EAR Calculation ----------

    def compute_ear(self, eye_indices: list, landmarks) -> float:
        """
        Hitung Eye Aspect Ratio dari indeks landmark dlib (6 titik per mata).

        EAR = (||P_p2 - P_p6|| + ||P_p3 - P_p5||) / (2 * ||P_p1 - P_p4||)
        """
        p1 = self._pt(landmarks, eye_indices[0])
        p2 = self._pt(landmarks, eye_indices[1])
        p3 = self._pt(landmarks, eye_indices[2])
        p4 = self._pt(landmarks, eye_indices[3])
        p5 = self._pt(landmarks, eye_indices[4])
        p6 = self._pt(landmarks, eye_indices[5])

        A = float(np.linalg.norm(p2 - p6))
        B = float(np.linalg.norm(p3 - p5))
        C = float(np.linalg.norm(p1 - p4))
        return (A + B) / (2.0 * C + 1e-6)

    # ---------- MAR Calculation (3-pair, inner mouth) ----------

    def compute_mar(self, mouth_indices: list, landmarks) -> float:
        """
        Hitung Mouth Aspect Ratio dari 8 titik inner mouth dlib 68 (titik 60..67).

        MAR = (||P61 - P67|| + ||P62 - P66|| + ||P63 - P65||) / (3 * ||P60 - P64||)
        """
        p60 = self._pt(landmarks, mouth_indices[0])
        p61 = self._pt(landmarks, mouth_indices[1])
        p62 = self._pt(landmarks, mouth_indices[2])
        p63 = self._pt(landmarks, mouth_indices[3])
        p64 = self._pt(landmarks, mouth_indices[4])
        p65 = self._pt(landmarks, mouth_indices[5])
        p66 = self._pt(landmarks, mouth_indices[6])
        p67 = self._pt(landmarks, mouth_indices[7])

        A = float(np.linalg.norm(p61 - p67))
        B = float(np.linalg.norm(p62 - p66))
        C = float(np.linalg.norm(p63 - p65))
        D = float(np.linalg.norm(p60 - p64))
        return (A + B + C) / (3.0 * D + 1e-6)

    # ---------- Sequence-based Liveness ----------

    def liveness_from_sequence(
        self,
        ears: List[float],
        mars: List[float]
    ) -> dict:
        """
        Hitung skor liveness EMAR dari urutan EAR/MAR (video/sesi).
        """
        blink_count = count_full_cycles(
            [e < self.ear_blink_thresh for e in ears], BLINK_CONSEC_FRAMES
        )
        mouth_cycles = count_full_cycles(
            [m >= self.mar_open_thresh for m in mars], MOUTH_OPEN_FRAMES
        )
        mouth_active = int(sum(1 for m in mars if m >= self.mar_open_thresh))

        blink_ev = min(blink_count / max(BLINK_REF, 1), 1.0)
        mouth_ev = min(mouth_cycles / max(MOUTH_REF, 1), 1.0)
        # Dibulatkan agar evidence penuh selalu tepat 1,0 dan lolos
        # EMAR_LIVENESS_THRESHOLD = 1,0 meski w1 + w2 tidak persis 1 di float.
        p_live = round(min(self.w1 * blink_ev + self.w2 * mouth_ev, 1.0), 6)

        return {
            "blink_count": blink_count,
            "mouth_cycles": mouth_cycles,
            "mouth_active": mouth_active,
            "p_live": float(p_live),
            "n_frames": len(ears),
        }

    # ---------- Frame Processing ----------

    def _push_sample(self, ear: float, mar: float, now: float) -> None:
        """
        Tambahkan satu sampel EAR/MAR ke buffer dan buang yang lebih tua dari
        OBSERVATION_WINDOW_S. Batasnya waktu, bukan jumlah frame, supaya jendela
        8,0 detik naskah berlaku sama pada 4 fps maupun 30 fps.
        """
        self._ear_buffer.append(ear)
        self._mar_buffer.append(mar)
        self._ts_buffer.append(now)
        while self._ts_buffer and (
            now - self._ts_buffer[0] > OBSERVATION_WINDOW_S
            or len(self._ts_buffer) > EMAR_BUFFER_MAX_FRAMES
        ):
            self._ts_buffer.pop(0)
            self._ear_buffer.pop(0)
            self._mar_buffer.pop(0)

    def process_frame(
        self,
        img_bgr: np.ndarray,
        timestamp: Optional[float] = None
    ) -> EMARResult:
        """
        Proses satu frame kamera — kalkulasi EAR, MAR, liveness sequence, keputusan PAD.

        Args:
            timestamp: Waktu frame dalam detik (monotonik). Default: time.monotonic().
                       Bukti kedip/mulut yang lebih tua dari OBSERVATION_WINDOW_S dibuang.
        """
        now = time.monotonic() if timestamp is None else float(timestamp)
        if img_bgr is None or img_bgr.size == 0:
            return EMARResult()
        return self.push_measurement(self.measure(img_bgr), now)

    def _thread_detector(self):
        det = getattr(self._tls, "detector", None)
        if det is None:
            import dlib
            det = self._tls.detector = dlib.get_frontal_face_detector()
        return det

    def measure(self, img_bgr: np.ndarray) -> Optional[FrameMeasurement]:
        """
        Deteksi wajah, landmark, dan EAR/MAR satu frame tanpa menyentuh state
        temporal, sehingga aman dipanggil paralel dari beberapa thread.
        None bila tidak ada wajah.
        """
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        faces = self._thread_detector()(gray)
        if not faces or len(faces) == 0:
            return None
        landmarks = self._predictor(gray, faces[0])
        jaw_left, jaw_right = self.JAW_OUTER
        return FrameMeasurement(
            landmarks=landmarks,
            ear_left=self.compute_ear(self.LEFT_EYE, landmarks),
            ear_right=self.compute_ear(self.RIGHT_EYE, landmarks),
            mar=self.compute_mar(self.INNER_MOUTH, landmarks),
            face_width_px=float(np.linalg.norm(
                self._pt(landmarks, jaw_left) - self._pt(landmarks, jaw_right))),
            frame_width=int(img_bgr.shape[1]),
        )

    def push_measurement(
        self,
        m: Optional[FrameMeasurement],
        timestamp: Optional[float] = None
    ) -> EMARResult:
        """
        Gabungkan hasil measure() ke state temporal (kedip, mulut, P_live).
        Harus dipanggil berurutan sesuai urutan frame.
        """
        now = time.monotonic() if timestamp is None else float(timestamp)
        result = EMARResult()
        if m is None:
            result.landmark_count = 0
            self._last_face_landmarks = None
            return result

        landmarks = m.landmarks
        result.landmark_count = landmarks.num_parts  # 68
        self._last_face_landmarks = landmarks

        result.ear_left  = m.ear_left
        result.ear_right = m.ear_right
        result.ear_avg   = (result.ear_left + result.ear_right) / 2.0

        # MAR (3-pair inner mouth)
        result.mar = m.mar

        self._push_sample(result.ear_avg, result.mar, now)

        # Deteksi kedipan temporal
        result.is_blink = result.ear_avg < self.ear_blink_thresh
        if result.is_blink:
            self._blink_counter += 1
        else:
            if self._blink_counter >= BLINK_CONSEC_FRAMES:
                self._blink_total += 1
            self._blink_counter = 0

        # Deteksi mulut terbuka (naskah: MAR >= 0,10)
        result.is_mouth_open = result.mar >= self.mar_open_thresh
        if result.is_mouth_open:
            self._mouth_counter += 1
        else:
            self._mouth_counter = 0

        # Hitung P_live dari sequence (akumulasi bukti temporal)
        live_data = self.liveness_from_sequence(self._ear_buffer, self._mar_buffer)
        result.emar_score   = live_data["p_live"]
        result.blink_cycles = live_data["blink_count"]
        result.mouth_cycles = live_data["mouth_cycles"]

        # Keputusan PAD: PAD(x) = bona-fide jika P_live >= TAU_LIVE
        result.is_live = result.emar_score >= self.emar_thresh

        logger.debug(
            f"EMAR | EAR={result.ear_avg:.3f}, MAR={result.mar:.3f}, "
            f"P_live={result.emar_score:.3f}, live={result.is_live}, "
            f"blinks={self._blink_total}"
        )
        return result

    def reset_temporal(self):
        """Reset state temporal untuk sesi verifikasi baru."""
        self._blink_counter = 0
        self._blink_total   = 0
        self._mouth_counter = 0
        self._ear_buffer    = []
        self._mar_buffer    = []
        self._ts_buffer     = []
        self._last_face_landmarks = None

    def get_blink_count(self) -> int:
        """Kembalikan jumlah kedipan yang terdeteksi dalam sesi ini."""
        return self._blink_total

    def close(self):
        """Tutup dlib predictor dan lepaskan resource."""
        logger.info("dlib 68-Landmark predictor ditutup")

    # ---------- Visualisasi Landmark ----------

    def draw_landmarks(
        self,
        img_bgr: np.ndarray,
        emar_result: EMARResult
    ) -> np.ndarray:
        """
        Gambar overlay landmark dlib 68 + EAR/MAR/P_live pada frame.
        """
        vis = img_bgr.copy()
        if emar_result.landmark_count == 0:
            cv2.putText(vis, "LANDMARK TIDAK TERDETEKSI", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            return vis

        # Gambar landmark titik-titik dlib 68 pada wajah
        if self._last_face_landmarks is not None:
            for i in range(self._last_face_landmarks.num_parts):
                pt = self._last_face_landmarks.part(i)
                cv2.circle(vis, (pt.x, pt.y), 1, (0, 255, 0), -1)

        # HUD overlay
        live_color = (0, 255, 0) if emar_result.is_live else (0, 0, 255)
        cv2.putText(vis, f"EAR: {emar_result.ear_avg:.3f}", (10, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        cv2.putText(vis, f"MAR: {emar_result.mar:.3f}", (10, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        cv2.putText(vis, f"P_live: {emar_result.emar_score:.3f}", (10, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        cv2.putText(vis, f"Kedip: {emar_result.blink_cycles}  Mulut: {emar_result.mouth_cycles}",
                    (10, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 1)
        status = "LIVE" if emar_result.is_live else "SPOOF"
        cv2.putText(vis, status, (10, 115),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, live_color, 2)
        return vis


# ==============================================================================
# BAGIAN 6: MODUL FUSION — Strategi Fusi S2 & S3
# ==============================================================================

class FusionModule:
    """
    Menggabungkan skor FaceNet (S_embed) dan EMAR (S_liveness)
    menggunakan dua strategi fusion:

    S2 — Rule-based Gate (Gerbang Logika):
      accepted = (S_embed >= T_embed_norm) AND (S_liveness >= T_EMAR)
      Sederhana dan transparan, tapi kaku pada kondisi marginal.

    S3 — Weighted Fusion (Fusi Terbobot):
      S_final = alpha * S_embed + (1 - alpha) * S_liveness
      accepted = S_final >= T_final
      Adaptif, trade-off APCER vs BPCER bisa dioptimasi via alpha.
    """

    def __init__(
        self,
        alpha:           float = ALPHA_DEFAULT,
        embed_threshold: float = 0.50,    # T_embed dinormalisasi (s_embed >= 0.5 → cocok)
        emar_threshold:  float = EMAR_LIVENESS_THRESHOLD,
        final_threshold: float = FINAL_THRESHOLD
    ):
        self.alpha           = alpha
        self.embed_threshold = embed_threshold
        self.emar_threshold  = emar_threshold
        self.final_threshold = final_threshold

    # ---------- Skenario S1: FaceNet Stand-alone ----------

    def decide_s1(
        self,
        facenet_result: FaceNetResult,
        emar_result:    EMARResult
    ) -> FusionResult:
        """
        S1: Keputusan hanya berdasarkan FaceNet — EMAR diabaikan.
        Digunakan sebagai baseline pembanding.
        """
        t0 = time.perf_counter()
        fusion = FusionResult(
            scenario = ScenarioMode.S1_FACENET_ONLY,
            facenet  = facenet_result,
            emar     = emar_result,
            alpha    = 1.0,
            s_final  = facenet_result.s_embed
        )
        if facenet_result.embedding is None:
            fusion.status      = VerificationStatus.FTA
            fusion.is_accepted = False
        elif facenet_result.is_verified:
            fusion.status      = VerificationStatus.ACCEPTED
            fusion.is_accepted = True
        else:
            fusion.status      = VerificationStatus.REJECTED_IDENTITY
            fusion.is_accepted = False
        fusion.processing_ms = (time.perf_counter() - t0) * 1000
        return fusion

    # ---------- Skenario S2: Rule-based Gate ----------

    def decide_s2(
        self,
        facenet_result: FaceNetResult,
        emar_result:    EMARResult
    ) -> FusionResult:
        """
        S2: Gerbang sekuensial — KEDUA kondisi harus terpenuhi.
          Gate 1: s_embed >= embed_threshold
          Gate 2: s_liveness >= emar_threshold

        Keunggulan: Transparan dan mudah diaudit.
        Kelemahan : Kaku — jika satu gate gagal, langsung ditolak.
        """
        t0 = time.perf_counter()
        fusion = FusionResult(
            scenario = ScenarioMode.S2_RULE_BASED,
            facenet  = facenet_result,
            emar     = emar_result,
            alpha    = 1.0,
            s_final  = min(facenet_result.s_embed, emar_result.emar_score)
        )
        if facenet_result.embedding is None or emar_result.landmark_count == 0:
            fusion.status      = VerificationStatus.FTA
            fusion.is_accepted = False
        elif not facenet_result.is_verified:
            fusion.status      = VerificationStatus.REJECTED_IDENTITY
            fusion.is_accepted = False
        elif emar_result.emar_score < self.emar_threshold:
            fusion.status      = VerificationStatus.REJECTED_LIVENESS
            fusion.is_accepted = False
        else:
            fusion.status      = VerificationStatus.ACCEPTED
            fusion.is_accepted = True
        fusion.processing_ms = (time.perf_counter() - t0) * 1000
        return fusion

    # ---------- Skenario S3: Weighted Fusion ----------

    def decide_s3(
        self,
        facenet_result: FaceNetResult,
        emar_result:    EMARResult,
        alpha: Optional[float] = None
    ) -> FusionResult:
        """
        S3: Fusi linier terbobot.

        S_final = alpha * S_embed + (1 - alpha) * S_liveness
        Diterima jika S_final >= T_final

        Args:
            alpha: Override koefisien (None = gunakan self.alpha)

        Rumus (Persamaan 2.7 Proposal):
          S_final = α * S_embed + (1-α) * S_liveness
        """
        t0  = time.perf_counter()
        a   = alpha if alpha is not None else self.alpha
        s_embed    = facenet_result.s_embed
        s_liveness = emar_result.emar_score if emar_result.landmark_count > 0 else 0.0
        s_final    = a * s_embed + (1.0 - a) * s_liveness

        fusion = FusionResult(
            scenario = ScenarioMode.S3_WEIGHTED,
            facenet  = facenet_result,
            emar     = emar_result,
            alpha    = a,
            s_final  = s_final
        )
        if facenet_result.embedding is None:
            fusion.status      = VerificationStatus.FTA
            fusion.is_accepted = False
        elif emar_result.landmark_count == 0:
            fusion.status      = VerificationStatus.FTA
            fusion.is_accepted = False
        elif s_final >= self.final_threshold and facenet_result.is_verified:
            fusion.status      = VerificationStatus.ACCEPTED
            fusion.is_accepted = True
        elif not facenet_result.is_verified:
            fusion.status      = VerificationStatus.REJECTED_IDENTITY
            fusion.is_accepted = False
        else:
            fusion.status      = VerificationStatus.REJECTED_FUSION
            fusion.is_accepted = False
        fusion.processing_ms = (time.perf_counter() - t0) * 1000
        return fusion

    # ---------- Alpha Tuning (Grid Search) ----------

    def tune_alpha(
        self,
        samples:    List[ExperimentSample],
        alpha_range: List[float] = None
    ) -> Dict:
        """
        Grid search untuk mencari alpha optimal yang meminimasi ACER.

        Args:
            samples    : Dataset eksperimen dengan skor terisi
            alpha_range: Kandidat nilai alpha

        Returns:
            Dict: {"best_alpha": float, "best_acer": float, "history": list}
        """
        if alpha_range is None:
            alpha_range = [round(x * 0.05, 2) for x in range(1, 20)]  # 0.05..0.95

        history   = []
        best_alpha = self.alpha
        best_acer  = 1.0

        for a in alpha_range:
            gt_labels   = []
            pred_labels = []
            for s in samples:
                if s.score_embed is None or s.score_liveness is None:
                    continue
                s_final = a * s.score_embed + (1.0 - a) * s.score_liveness
                pred    = 1 if s_final >= self.final_threshold else 0
                gt_labels.append(s.gt_label)
                pred_labels.append(pred)

            if len(gt_labels) == 0:
                continue

            metrics = compute_iso_metrics(gt_labels, pred_labels, scenario=f"alpha={a}", condition="tuning")
            history.append({"alpha": a, "acer": metrics.acer, "apcer": metrics.apcer, "bpcer": metrics.bpcer})

            if metrics.acer < best_acer:
                best_acer  = metrics.acer
                best_alpha = a

        self.alpha = best_alpha
        logger.info(f"Alpha tuning selesai -> best_alpha={best_alpha:.2f}, best_ACER={best_acer:.4f}")
        return {"best_alpha": best_alpha, "best_acer": best_acer, "history": history}


# ==============================================================================
# WORKFLOW ALGORITMA PENCATATAN 3 SKENARIO (UNTUK EKSPOR CSV BAB 5)
# ==============================================================================

def evaluate_trial(euclidean_dist, ear, mar, alpha=ALPHA_DEFAULT, threshold_s3=0.75):
    # ==========================================
    # SKENARIO 1 (S1): FaceNet Stand-alone
    # Mengabaikan liveness, hanya melihat kemiripan wajah
    # ==========================================
    if euclidean_dist <= FACENET_DISTANCE_THRESHOLD:
        s1_decision = 1  # 1 = ACCEPT (Bona-fide)
    else:
        s1_decision = 0  # 0 = REJECT (Spoof/Unrecognized)

    # ==========================================
    # SKENARIO 2 (S2): Rule-Based Gate (FaceNet + EMAR)
    # Wajib Lolos Wajah DAN Lolos Kedipan/Mulut
    # ==========================================
    liveness_valid = (ear < EAR_BLINK_THRESHOLD) and (mar >= MAR_OPEN_THRESHOLD)
    
    if (s1_decision == 1) and liveness_valid:
        s2_decision = 1
    else:
        s2_decision = 0

    # ==========================================
    # SKENARIO 3 (S3): Weighted Fusion (FaceNet + EMAR)
    # Menghitung probabilitas fusi menggunakan bobot alpha
    # ==========================================
    # Mengubah Euclidean L2 menjadi probabilitas (P_face) 
    # (Asumsi: Jarak 0 = 100% mirip, Jarak 1.5 = 0% mirip)
    p_face = max(0.0, 1.0 - (euclidean_dist / 1.5)) 
    
    # Probabilitas Liveness (P_live)
    p_live = 1.0 if liveness_valid else 0.0
    
    # Kalkulasi Skor Fusi: S_final = a(P_face) + (1-a)(P_live)
    s_final = (alpha * p_face) + ((1.0 - alpha) * p_live)
    
    if s_final >= threshold_s3:
        s3_decision = 1
    else:
        s3_decision = 0

    return s1_decision, s2_decision, s3_decision


def log_to_csv(participant_id, jarak, lux, label_aktual, euclidean_dist, ear, mar, s1, s2, s3, filename='Dataset_Eksperimen_Bab5.csv'):
    file_exists = os.path.isfile(filename)
    
    with open(filename, mode='a', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        # Tulis Header jika file baru dibuat
        if not file_exists:
            writer.writerow(['participant_id', 'jarak_cm', 'lux', 'label_aktual', 
                             'euclidean_dist', 'ear', 'mar', 'keputusan_S1', 'keputusan_S2', 'keputusan_S3'])
        
        # Tulis baris data pengujian
        writer.writerow([participant_id, jarak, lux, label_aktual, 
                         round(euclidean_dist, 3), round(ear, 3), round(mar, 3), s1, s2, s3])


# ==============================================================================
# BAGIAN 7: KALKULASI METRIK ISO/IEC 30107-3
# ==============================================================================

def compute_iso_metrics(
    gt_labels:   List[int],
    pred_labels: List[int],
    scenario:    str = "",
    condition:   str = "all"
) -> ISOMetrics:
    """
    Kalkulasi lengkap metrik ISO/IEC 30107-3 + metrik pelengkap.

    Konvensi label:
      1 = bona-fide (positif)
      0 = serangan/spoof (negatif)

    Rumus ISO (Persamaan 2.6 Proposal):
      APCER = N_PA→BF / N_PA_total
      BPCER = N_BF→PA / N_BF_total
      ACER  = (APCER + BPCER) / 2

    Args:
        gt_labels  : Label ground truth (List[int])
        pred_labels: Prediksi sistem (List[int])
        scenario   : Nama skenario (S1/S2/S3)
        condition  : Kondisi kontrol (e.g. "normal_60cm")

    Returns:
        ISOMetrics lengkap
    """
    gt   = np.array(gt_labels)
    pred = np.array(pred_labels)
    m    = ISOMetrics(scenario=scenario, condition=condition)

    m.n_bona_fide = int(np.sum(gt == 1))
    m.n_attack    = int(np.sum(gt == 0))
    m.n_total     = len(gt)

    if m.n_total == 0:
        return m

    # Confusion matrix: TP, TN, FP, FN
    tn, fp, fn, tp = confusion_matrix(gt, pred, labels=[0, 1]).ravel()

    # ISO/IEC 30107-3 Metrik
    # APCER: persentase serangan yang salah diklasifikasikan sebagai bona-fide
    m.apcer  = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    # BPCER: persentase bona-fide yang salah diklasifikasikan sebagai serangan
    m.bpcer  = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0
    m.acer   = (m.apcer + m.bpcer) / 2.0

    # Metrik pelengkap
    m.accuracy  = float(accuracy_score(gt, pred))
    m.precision = float(precision_score(gt, pred, zero_division=0))
    m.recall    = float(recall_score(gt, pred, zero_division=0))
    m.f1        = float(f1_score(gt, pred, zero_division=0))
    m.far        = m.apcer   # FAR = APCER dalam konteks ini
    m.frr        = m.bpcer   # FRR = BPCER dalam konteks ini

    logger.info(
        f"[{scenario}|{condition}] "
        f"APCER={m.apcer:.4f}, BPCER={m.bpcer:.4f}, ACER={m.acer:.4f}, "
        f"Acc={m.accuracy:.4f}, F1={m.f1:.4f}"
    )
    return m


def compute_iso_by_pai(
    samples:  List[ExperimentSample],
    scenario: str = "S1"
) -> Dict[str, ISOMetrics]:
    """
    Kalkulasi APCER per jenis PAI (print/screen/replay) sesuai ISO.

    Setiap PAI dihitung secara terpisah karena APCER bisa berbeda
    untuk setiap jenis serangan.

    Returns:
        Dict: {pai_species: ISOMetrics}
    """
    pred_key = {"S1": "pred_s1", "S2": "pred_s2", "S3": "pred_s3"}.get(scenario, "pred_s1")
    results  = {}

    # Kelompokkan per jenis PAI
    pai_groups = {}
    for s in samples:
        if getattr(s, pred_key) is None:
            continue
        if s.pai_species not in pai_groups:
            pai_groups[s.pai_species] = {"gt": [], "pred": []}
        pai_groups[s.pai_species]["gt"].append(s.gt_label)
        pai_groups[s.pai_species]["pred"].append(getattr(s, pred_key))

    for pai, data in pai_groups.items():
        results[pai] = compute_iso_metrics(
            data["gt"], data["pred"],
            scenario=scenario, condition=f"PAI:{pai}"
        )
    return results


def mcnemar_test(
    pred_s1: List[int],
    pred_s2: List[int],
    gt:      List[int]
) -> Dict:
    """
    Uji McNemar untuk membandingkan dua skenario berpasangan.

    H0: Tidak ada perbedaan kinerja signifikan antar skenario.
    H1: Terdapat perbedaan signifikan.
    Taraf signifikansi: α = 0.05

    Returns:
        Dict: {"statistic": float, "p_value": float, "significant": bool}
    """
    gt   = np.array(gt)
    p_s1 = np.array(pred_s1)
    p_s2 = np.array(pred_s2)

    # Hitung sel tabel kontingensi 2x2
    # b = S1 benar, S2 salah; c = S1 salah, S2 benar
    b = int(np.sum((p_s1 == gt) & (p_s2 != gt)))
    c = int(np.sum((p_s1 != gt) & (p_s2 == gt)))
    table = [[int(np.sum((p_s1 == gt) & (p_s2 == gt))), b],
             [c, int(np.sum((p_s1 != gt) & (p_s2 != gt)))]]

    res = mcnemar(table, exact=True)
    return {
        "statistic":   float(res.statistic),
        "p_value":     float(res.pvalue),
        "significant": res.pvalue < 0.05,
        "b": b, "c": c
    }


# ==============================================================================
# BAGIAN 8: DATABASE KEHADIRAN (SQLite)
# ==============================================================================

class AttendanceDatabase:
    """
    Manajemen log kehadiran menggunakan SQLite.
    (Dapat diganti MySQL pada produksi — query kompatibel)
    """

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS attendance_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id          TEXT UNIQUE NOT NULL,
        subject_id      TEXT NOT NULL,
        name            TEXT,
        scenario        TEXT,
        status          TEXT,
        s_embed         REAL,
        s_liveness      REAL,
        s_final         REAL,
        ear_avg         REAL,
        mar             REAL,
        lux_category    TEXT,
        distance_cm     INTEGER,
        sample_type     TEXT DEFAULT 'bona_fide',
        processing_ms   REAL,
        timestamp       TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS experiment_samples (
        sample_id       TEXT PRIMARY KEY,
        subject_id      TEXT,
        sample_type     TEXT,
        pai_species     TEXT,
        lux_category    TEXT,
        distance_cm     INTEGER,
        session         TEXT,
        image_path      TEXT,
        gt_label        INTEGER,
        pred_s1         INTEGER,
        pred_s2         INTEGER,
        pred_s3         INTEGER,
        score_embed     REAL,
        score_liveness  REAL,
        score_final     REAL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_subject ON attendance_log(subject_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_log(date(timestamp));
    CREATE INDEX IF NOT EXISTS idx_samples_type ON experiment_samples(sample_type);
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(exist_ok=True)
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            conn.executescript(self.SCHEMA)
        logger.info(f"Database siap: {self.db_path}")

    def log_attendance(
        self,
        fusion_result:  FusionResult,
        subject_id:     str,
        name:           str = "",
        lux_category:   str = "normal",
        distance_cm:    int = 60,
        sample_type:    str = "bona_fide"
    ) -> str:
        """
        Simpan log presensi ke database.

        Returns:
            log_id (UUID) dari rekaman yang tersimpan
        """
        log_id = str(uuid.uuid4())[:8]
        sql = """
            INSERT OR IGNORE INTO attendance_log
            (log_id, subject_id, name, scenario, status,
             s_embed, s_liveness, s_final, ear_avg, mar,
             lux_category, distance_cm, sample_type,
             processing_ms, timestamp)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """
        params = (
            log_id, subject_id, name,
            fusion_result.scenario.value if isinstance(fusion_result.scenario, ScenarioMode) else fusion_result.scenario,
            fusion_result.status.value if isinstance(fusion_result.status, VerificationStatus) else fusion_result.status,
            fusion_result.facenet.s_embed,
            fusion_result.emar.emar_score,
            fusion_result.s_final,
            fusion_result.emar.ear_avg,
            fusion_result.emar.mar,
            lux_category, distance_cm, sample_type,
            fusion_result.processing_ms,
            fusion_result.timestamp
        )
        with self._get_conn() as conn:
            conn.execute(sql, params)
        return log_id

    def get_today_attendance(self) -> List[Dict]:
        """Kembalikan log kehadiran hari ini."""
        sql = """
            SELECT * FROM attendance_log
            WHERE date(timestamp) = date('now', 'localtime')
            ORDER BY timestamp DESC
        """
        with self._get_conn() as conn:
            rows = conn.execute(sql).fetchall()
        return [dict(r) for r in rows]

    def export_csv(self, output_path: str = str(BASE_DIR / "exports" / "attendance.csv")) -> str:
        """Ekspor semua log kehadiran ke CSV."""
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM attendance_log ORDER BY timestamp").fetchall()
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            if rows:
                writer = csv.DictWriter(f, fieldnames=dict(rows[0]).keys())
                writer.writeheader()
                writer.writerows([dict(r) for r in rows])
        logger.info(f"Export CSV: {output_path} ({len(rows)} records)")
        return output_path

    def save_sample(self, sample: ExperimentSample):
        """Simpan sampel eksperimen ke database."""
        sql = """
            INSERT OR REPLACE INTO experiment_samples
            (sample_id, subject_id, sample_type, pai_species, lux_category,
             distance_cm, session, image_path, gt_label, pred_s1, pred_s2, pred_s3,
             score_embed, score_liveness, score_final)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """
        d = asdict(sample)
        with self._get_conn() as conn:
            conn.execute(sql, (
                d["sample_id"], d["subject_id"], d["sample_type"], d["pai_species"],
                d["lux_category"], d["distance_cm"], d["session"], d["image_path"],
                d["gt_label"], d["pred_s1"], d["pred_s2"], d["pred_s3"],
                d["score_embed"], d["score_liveness"], d["score_final"]
            ))

    def load_samples(self) -> List[ExperimentSample]:
        """Muat semua sampel eksperimen dari database."""
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM experiment_samples").fetchall()
        from dataclasses import fields
        valid_keys = {f.name for f in fields(ExperimentSample)}
        samples = []
        for r in rows:
            d = {k: v for k, v in dict(r).items() if k in valid_keys}
            samples.append(ExperimentSample(**d))
        return samples


# ==============================================================================
# BAGIAN 9: EVALUASI HASIL — Visualisasi & Laporan
# ==============================================================================

class EvaluationReporter:
    """
    Pembuat laporan evaluasi lengkap sesuai ISO/IEC 30107-3.
    Menghasilkan tabel, kurva ROC, kurva DET, histogram kesalahan,
    dan perbandingan skenario S1 vs S2 vs S3.
    """

    RANDOM_SEED = 42   # Untuk reprodusibilitas (Subbab 3.4.3 Proposal)

    def __init__(self, output_dir: str = str(BASE_DIR / "results")):
        np.random.seed(self.RANDOM_SEED)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def plot_scenario_comparison(
        self,
        metrics_s1: ISOMetrics,
        metrics_s2: ISOMetrics,
        metrics_s3: ISOMetrics,
        condition:  str = "all"
    ) -> str:
        """
        Bar chart perbandingan APCER, BPCER, ACER untuk S1 vs S2 vs S3.
        Sesuai tujuan penelitian Rumusan Masalah 3 (Subbab 1.2 Proposal).
        """
        scenarios = ["S1\n(FaceNet Only)", "S2\n(Rule-based)", "S3\n(Weighted)"]
        metrics_list = [metrics_s1, metrics_s2, metrics_s3]

        apcer_vals = [m.apcer * 100 for m in metrics_list]
        bpcer_vals = [m.bpcer * 100 for m in metrics_list]
        acer_vals  = [m.acer  * 100 for m in metrics_list]
        acc_vals   = [m.accuracy * 100 for m in metrics_list]

        x       = np.arange(len(scenarios))
        width   = 0.2
        fig, ax = plt.subplots(figsize=(10, 6))
        ax.bar(x - 1.5*width, apcer_vals, width, label="APCER (%)", color="#e74c3c", alpha=0.85)
        ax.bar(x - 0.5*width, bpcer_vals, width, label="BPCER (%)", color="#f39c12", alpha=0.85)
        ax.bar(x + 0.5*width, acer_vals,  width, label="ACER (%)",  color="#8e44ad", alpha=0.85)
        ax.bar(x + 1.5*width, acc_vals,   width, label="Accuracy (%)", color="#27ae60", alpha=0.85)

        ax.set_xticks(x)
        ax.set_xticklabels(scenarios, fontsize=11)
        ax.set_ylabel("Persentase (%)", fontsize=11)
        ax.set_title(
            f"Perbandingan Kinerja Skenario S1 vs S2 vs S3\nKondisi: {condition}\n"
            "Standar ISO/IEC 30107-3:2023",
            fontsize=12, fontweight="bold"
        )
        ax.legend(fontsize=10)
        ax.set_ylim(0, 105)
        ax.grid(axis="y", alpha=0.4)
        ax.axhline(y=50, color="gray", linestyle="--", alpha=0.4, label="50% baseline")

        all_val_groups = [apcer_vals, bpcer_vals, acer_vals, acc_vals]
        for bar_group, vals in zip(
            [x - 1.5*width, x - 0.5*width, x + 0.5*width, x + 1.5*width],
            all_val_groups
        ):
            for xp, v in zip(bar_group, vals):
                ax.text(xp, v + 1, f"{v:.1f}", ha="center", va="bottom", fontsize=8)

        plt.tight_layout()
        path = str(self.output_dir / f"scenario_comparison_{condition}.png")
        plt.savefig(path, dpi=150, bbox_inches="tight")
        plt.close()
        logger.info(f"Plot disimpan: {path}")
        return path

    def plot_roc_det(
        self,
        scores_bf:     List[float],
        scores_attack: List[float],
        scenario:      str = "S3"
    ) -> str:
        """
        Kurva ROC dan DET (Detection Error Tradeoff) untuk satu skenario.
        Standar evaluasi ISO/IEC 30107-3.
        """
        all_scores = scores_bf + scores_attack
        all_labels = [1] * len(scores_bf) + [0] * len(scores_attack)

        fpr, tpr, thresholds = roc_curve(all_labels, all_scores)
        roc_auc = auc(fpr, tpr)

        # DET curve: FRR vs FAR pada skala normal
        far_vals = fpr
        frr_vals = 1.0 - tpr

        fig, axes = plt.subplots(1, 2, figsize=(13, 5))

        # ROC Curve
        axes[0].plot(fpr, tpr, color="#2980b9", lw=2, label=f"AUC = {roc_auc:.3f}")
        axes[0].plot([0, 1], [0, 1], "k--", alpha=0.5)
        axes[0].set_xlabel("False Positive Rate (FAR)", fontsize=10)
        axes[0].set_ylabel("True Positive Rate (1-FRR)", fontsize=10)
        axes[0].set_title(f"Kurva ROC — Skenario {scenario}", fontsize=11, fontweight="bold")
        axes[0].legend(fontsize=10)
        axes[0].grid(alpha=0.4)

        # DET Curve
        eps   = 1e-6
        far_c = np.clip(far_vals, eps, 1 - eps)
        frr_c = np.clip(frr_vals, eps, 1 - eps)
        axes[1].plot(far_c * 100, frr_c * 100, color="#e74c3c", lw=2, label=f"Skenario {scenario}")
        axes[1].set_xscale("log")
        axes[1].set_yscale("log")
        axes[1].set_xlabel("FAR (%)", fontsize=10)
        axes[1].set_ylabel("FRR (%)", fontsize=10)
        axes[1].set_title(f"Kurva DET — Skenario {scenario}", fontsize=11, fontweight="bold")
        axes[1].legend(fontsize=10)
        axes[1].grid(alpha=0.4, which="both")

        plt.suptitle("Evaluasi ISO/IEC 30107-3:2023", fontsize=13, fontweight="bold")
        plt.tight_layout()
        path = str(self.output_dir / f"roc_det_{scenario}.png")
        plt.savefig(path, dpi=150, bbox_inches="tight")
        plt.close()
        return path

    def plot_confusion_matrix(
        self,
        gt_labels:   List[int],
        pred_labels: List[int],
        scenario:    str = "S3",
        condition:   str = "all"
    ) -> str:
        """Gambar confusion matrix."""
        cm = confusion_matrix(gt_labels, pred_labels, labels=[0, 1])
        fig, ax = plt.subplots(figsize=(6, 5))
        im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
        plt.colorbar(im)
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(["Prediksi: Serangan", "Prediksi: Bona-fide"], rotation=30, ha="right")
        ax.set_yticklabels(["GT: Serangan", "GT: Bona-fide"])
        ax.set_title(f"Confusion Matrix — {scenario} | {condition}", fontweight="bold")
        for i in range(2):
            for j in range(2):
                ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                        color="white" if cm[i, j] > cm.max() / 2 else "black",
                        fontsize=16, fontweight="bold")
        plt.tight_layout()
        path = str(self.output_dir / f"confusion_{scenario}_{condition}.png")
        plt.savefig(path, dpi=150, bbox_inches="tight")
        plt.close()
        return path

    def generate_full_report(
        self,
        all_metrics: List[ISOMetrics],
        mcnemar_results: Dict = None
    ) -> str:
        """
        Buat laporan teks lengkap semua metrik untuk semua skenario dan kondisi.
        Sesuai format pelaporan ISO/IEC 30107-3.
        """
        lines = [
            "=" * 80,
            "LAPORAN EVALUASI ISO/IEC 30107-3:2023",
            "Analisis Kinerja FaceNet dan EMAR pada Sistem Face Verification",
            "Mitigasi Serangan Spoofing Presensi",
            f"Peneliti : Qalwani Anugerah — NPM 221220048",
            f"Institusi: Universitas Muhammadiyah Pontianak",
            f"Tanggal  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "=" * 80,
            "",
            f"{'Skenario':<8} {'Kondisi':<22} {'APCER':>8} {'BPCER':>8} {'ACER':>8} "
            f"{'Acc':>8} {'F1':>8} {'N_BF':>6} {'N_ATK':>6}",
            "-" * 90,
        ]
        for m in all_metrics:
            lines.append(
                f"{m.scenario:<8} {m.condition:<22} "
                f"{m.apcer*100:>7.2f}% {m.bpcer*100:>7.2f}% {m.acer*100:>7.2f}% "
                f"{m.accuracy*100:>7.2f}% {m.f1*100:>7.2f}% "
                f"{m.n_bona_fide:>6} {m.n_attack:>6}"
            )

        if mcnemar_results:
            lines += [
                "",
                "=" * 80,
                "UJI MCNEMAR — Perbandingan Skenario Berpasangan (α=0.05)",
                "-" * 80,
            ]
            for pair, result in mcnemar_results.items():
                sig = "SIGNIFIKAN ✓" if result["significant"] else "tidak signifikan"
                lines.append(
                    f"{pair}: p={result['p_value']:.4f}, χ²={result['statistic']:.4f} → {sig}"
                )
        lines.append("=" * 80)
        report_text = "\n".join(lines)

        path = str(self.output_dir / "evaluation_report.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(report_text)
        logger.info(f"Laporan evaluasi disimpan: {path}")
        return path

# ==============================================================================
# BAGIAN 10: UTILITAS FRAME SAMPLING
# ==============================================================================

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp"}
VID_EXT = {".mp4", ".avi", ".mov", ".mkv"}


def sample_frames(path: str, max_frames: int = MAX_FRAMES) -> List[np.ndarray]:
    """
    Ambil frame dari file gambar atau video.

    Untuk gambar: kembalikan satu frame.
    Untuk video: ambil hingga max_frames frame yang tersebar merata.

    Sesuai desain experiment_runner.py referensi — memastikan EMAR
    mendapat dimensi waktu dari video (kedipan + gerak mulut).

    Args:
        path       : Path ke file gambar/video
        max_frames : Jumlah frame maksimum yang diambil

    Returns:
        List[np.ndarray]: Daftar frame BGR
    """
    ext = os.path.splitext(path)[1].lower()

    # Gambar statis → satu frame
    if ext in IMG_EXT:
        img = cv2.imread(path)
        return [img] if img is not None else []

    # Video → ambil frame merata
    if ext in VID_EXT:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            return []
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frames: List[np.ndarray] = []

        if total and total > 0:
            # Ambil frame yang tersebar merata sepanjang video
            want = set(int(i) for i in np.linspace(0, total - 1, min(max_frames, total)))
            idx = 0
            while True:
                ok, fr = cap.read()
                if not ok:
                    break
                if idx in want:
                    frames.append(fr)
                idx += 1
        else:
            # Fallback: ambil frame berurutan
            while len(frames) < max_frames:
                ok, fr = cap.read()
                if not ok:
                    break
                frames.append(fr)

        cap.release()
        return frames

    # Format tidak dikenal → coba baca sebagai gambar
    img = cv2.imread(path)
    return [img] if img is not None else []


# ==============================================================================
# BAGIAN 11: SISTEM UTAMA — Integrasi Semua Modul
# ==============================================================================

class FaceEMARSystem:
    """
    Sistem terintegrasi FaceNet + EMAR sesuai arsitektur microservice.
    Meng-orkestrasi:
      - MTCNN + FaceNet (modul verifikasi identitas)
      - MediaPipe FaceMesh EMAR (modul liveness / PAD)
      - Fusion S1/S2/S3
      - Database log
      - Evaluasi ISO/IEC 30107-3
    """

    def __init__(self):
        logger.info("Menginisialisasi FaceEMARSystem...")
        self.facenet   = FaceNetModule(device=DEVICE)
        self.emar      = EMARModule()
        self.fusion    = FusionModule()
        self.db        = AttendanceDatabase()
        self.reporter  = EvaluationReporter()
        logger.info("FaceEMARSystem siap.")

    def verify_frame(
        self,
        img_bgr:      np.ndarray,
        claimed_id:   str,
        scenario:     ScenarioMode = ScenarioMode.S3_WEIGHTED,
        lux_category: str = "normal",
        distance_cm:  int = 60,
        sample_type:  str = "bona_fide"
    ) -> FusionResult:
        """
        Proses satu frame untuk verifikasi presensi lengkap.

        Pipeline:
          Frame → FaceNet.verify() → EMAR.process_frame() → Fusion.decide_SX()

        Args:
            img_bgr    : Frame BGR dari kamera
            claimed_id : ID subjek yang diklaim
            scenario   : S1 / S2 / S3
            lux_category: Kategori cahaya (redup/normal/terang)
            distance_cm: Jarak kamera-subjek (cm)
            sample_type: "bona_fide" / "print_attack" / dll

        Returns:
            FusionResult dengan semua skor dan status keputusan
        """
        t_start = time.perf_counter()

        # Langkah 1: FaceNet — Verifikasi Identitas
        facenet_result = self.facenet.verify(img_bgr, claimed_id)

        # Langkah 2: EMAR — Liveness Detection
        emar_result = self.emar.process_frame(img_bgr)

        # Langkah 3: Fusion — Keputusan Akhir
        if scenario == ScenarioMode.S1_FACENET_ONLY:
            fusion_result = self.fusion.decide_s1(facenet_result, emar_result)
        elif scenario == ScenarioMode.S2_RULE_BASED:
            fusion_result = self.fusion.decide_s2(facenet_result, emar_result)
        else:
            fusion_result = self.fusion.decide_s3(facenet_result, emar_result)

        fusion_result.processing_ms = (time.perf_counter() - t_start) * 1000

        # Langkah 4: Simpan log ke database
        name = self.facenet.gallery.get(claimed_id, {}).get("name", "")
        self.db.log_attendance(
            fusion_result, claimed_id, name,
            lux_category, distance_cm, sample_type
        )

        return fusion_result

    def decide_all(
        self,
        facenet_result: FaceNetResult,
        emar_result:    EMARResult
    ) -> Dict[str, FusionResult]:
        """
        Keputusan S1, S2, dan S3 atas SATU pasang hasil inferensi.

        Satu-satunya jalur yang boleh dipakai untuk data berpasangan: ketiga
        skenario dijamin menilai objek FaceNetResult dan EMARResult yang sama.
        """
        return {
            "S1": self.fusion.decide_s1(facenet_result, emar_result),
            "S2": self.fusion.decide_s2(facenet_result, emar_result),
            "S3": self.fusion.decide_s3(facenet_result, emar_result),
        }

    def verify_all_scenarios(
        self,
        img_bgr:     np.ndarray,
        claimed_id:  str,
        lux_category: str = "normal",
        distance_cm:  int = 60,
        sample_type:  str = "bona_fide",
        log:          bool = True
    ) -> Dict[str, FusionResult]:
        """
        Jalankan semua tiga skenario (S1, S2, S3) pada frame yang sama.

        FaceNet dan EMAR dijalankan SEKALI, lalu hasilnya diumpankan ke ketiga
        fungsi keputusan. Ini wajib, bukan sekadar optimasi: EMARModule.process_frame
        menyimpan state temporal (buffer EAR/MAR, hitungan kedip), sehingga
        memanggilnya per skenario membuat S2 dan S3 menilai P_live yang berbeda
        dari frame yang sama. Uji McNemar/Cochran/Friedman mengasumsikan ketiga
        metode menilai bukti identik -- kalau tidak, hasil ujinya tidak sah.

        Args:
            log: False untuk melewati penulisan ke attendance_log (mis. saat
                 telemetry per frame sudah dicatat FrameTelemetryLogger).
        """
        t_start = time.perf_counter()
        facenet_result = self.facenet.verify(img_bgr, claimed_id)
        emar_result    = self.emar.process_frame(img_bgr)
        shared_ms      = (time.perf_counter() - t_start) * 1000

        results = self.decide_all(facenet_result, emar_result)

        name = self.facenet.gallery.get(claimed_id, {}).get("name", "")
        for result in results.values():
            result.processing_ms += shared_ms
            if log:
                self.db.log_attendance(
                    result, claimed_id, name,
                    lux_category, distance_cm, sample_type
                )
        return results

    def run_realtime(
        self,
        claimed_id:   str,
        scenario:     ScenarioMode = ScenarioMode.S3_WEIGHTED,
        camera_index: int = 0,
        lux_category: str = "normal",
        distance_cm:  int = 60
    ):
        """
        Loop real-time presensi via webcam.

        Alur (Subbab 6.4 Proposal):
          Capture → MTCNN → EMAR → FaceNet 1:1 → Keputusan → Display → Log

        Tekan 'q' untuk keluar, 'r' untuk reset EMAR temporal state.
        """
        cap = robust_open_webcam(camera_index)

        if not cap.isOpened():
            logger.error(f"Kamera {camera_index} tidak dapat dibuka")
            return

        logger.info(f"Loop real-time dimulai — Skenario: {scenario.value}, Subjek: {claimed_id}")
        self.emar.reset_temporal()

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Proses frame
            result = self.verify_frame(
                frame, claimed_id, scenario, lux_category, distance_cm
            )

            # Gambar overlay EMAR
            vis_frame = self.emar.draw_landmarks(frame, result.emar)

            # Overlay keputusan akhir
            color  = (0, 255, 0) if result.is_accepted else (0, 0, 255)
            status = f"{result.status.value} [{result.s_final:.3f}]"
            cv2.putText(vis_frame, status, (10, vis_frame.shape[0] - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.putText(vis_frame, f"ID: {claimed_id} | {scenario.value}",
                        (10, vis_frame.shape[0] - 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

            cv2.imshow("FaceNet + EMAR Presensi", vis_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("r"):
                self.emar.reset_temporal()
                logger.info("EMAR temporal state di-reset")

        cap.release()
        cv2.destroyAllWindows()
        logger.info("Loop real-time selesai")

    def evaluate_dataset(
        self,
        manifest_csv:    str,
        image_base_dir:  str = ".",
        scenarios:       List[str] = None
    ) -> List[ISOMetrics]:
        """
        Evaluasi offline pipeline pada dataset eksperimen.

        Mendukung file gambar dan video. Untuk video, frame diambil merata
        (sample_frames) dan liveness dihitung dari sequence EAR/MAR.
        FaceNet embedding diambil dari frame tengah.

        Args:
            manifest_csv  : Path ke MANIFEST_UJI.csv
            image_base_dir: Direktori root gambar/video
            scenarios     : List skenario yang diuji (["S1","S2","S3"])

        Returns:
            List ISOMetrics untuk setiap skenario dan kondisi
        """
        if scenarios is None:
            scenarios = ["S1", "S2", "S3"]

        # Baca manifest
        samples: List[ExperimentSample] = []
        with open(manifest_csv, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                samples.append(ExperimentSample(
                    sample_id    = row["sample_id"],
                    subject_id   = row["subject_id"],
                    claimed_subject_id = row.get("claimed_subject_id", row["subject_id"]),
                    sample_type  = SpoofingType(row["sample_type"]),
                    pai_species  = row["pai_species"],
                    lux_category = row["lux_category"],
                    distance_cm  = int(row["distance_cm"]),
                    session      = row["session"],
                    split        = row.get("split", ""),
                    image_path   = row["image_path"],
                    gt_label     = int(row["gt_label"])
                ))

        logger.info(f"Evaluasi dataset: {len(samples)} sampel dari {manifest_csv}")
        all_metrics: List[ISOMetrics] = []

        # Langkah 0: galeri evaluasi hanya di memori. Dulu gallery.clear() lalu
        # enroll() menimpa gallery/face_gallery.pkl asli dengan template evaluasi,
        # dan verify() memuat ulang galeri asli saat ID klaim tidak ditemukan.
        eval_gallery: Dict[str, Dict] = {}
        enroll_count = 0
        for sample in samples:
            if sample.session == "enrollment":
                file_path = os.path.join(image_base_dir, sample.image_path)
                if os.path.exists(file_path):
                    frames = sample_frames(file_path, 1)
                    if frames:
                        emb, n = self.facenet.build_template(frames, sample.subject_id)
                        if emb is not None:
                            eval_gallery[sample.subject_id] = self.facenet._template_record(
                                sample.subject_id, sample.subject_id, "EVAL", emb, n, "enrollment")
                            enroll_count += 1

        logger.info(f"Galeri dievaluasi dengan {enroll_count} template enrollment.")
        
        eval_count = 0
        for sample in samples:
            if sample.session == "enrollment":
                continue  # Lewati sampel enrollment saat probing

            file_path = os.path.join(image_base_dir, sample.image_path)
            if not os.path.exists(file_path):
                logger.warning(f"File tidak ditemukan: {file_path}")
                continue

            # Ambil frame dari gambar/video
            frames = sample_frames(file_path, MAX_FRAMES)
            if not frames:
                logger.warning(f"Tidak ada frame valid dari: {file_path}")
                continue

            # Langkah 1: Ekstraksi EAR/MAR dari semua frame (liveness sequence)
            ears, mars = [], []
            self.emar.reset_temporal()
            for fr in frames:
                emar_r = self.emar.process_frame(fr)
                if emar_r.landmark_count > 0:
                    ears.append(emar_r.ear_avg)
                    mars.append(emar_r.mar)

            # Hitung P_live dari sequence
            live_data = self.emar.liveness_from_sequence(ears, mars) if ears else {
                "p_live": 0.0, "blink_count": 0, "mouth_active": 0}
            p_live = live_data["p_live"]

            # Langkah 2: FaceNet embedding dari frame tengah (menggunakan claimed_subject_id)
            mid_frame = frames[len(frames) // 2]
            target_id = sample.claimed_subject_id if sample.claimed_subject_id else sample.subject_id
            facenet_result = self.facenet.verify_against(mid_frame, target_id, eval_gallery)
            detected = (facenet_result.embedding is not None) and (len(ears) > 0)

            # Buat EMARResult dengan P_live dari sequence
            emar_result = EMARResult(
                ear_avg=ears[-1] if ears else 0.0,
                mar=mars[-1] if mars else 0.0,
                emar_score=p_live,
                is_live=p_live >= EMAR_LIVENESS_THRESHOLD,
                landmark_count=478 if ears else 0
            )

            # Langkah 3: Fusion untuk setiap skenario
            results = {}
            for sc_name in scenarios:
                scenario_mode = {"S1": ScenarioMode.S1_FACENET_ONLY,
                                 "S2": ScenarioMode.S2_RULE_BASED,
                                 "S3": ScenarioMode.S3_WEIGHTED}[sc_name]
                if scenario_mode == ScenarioMode.S1_FACENET_ONLY:
                    results[sc_name] = self.fusion.decide_s1(facenet_result, emar_result)
                elif scenario_mode == ScenarioMode.S2_RULE_BASED:
                    results[sc_name] = self.fusion.decide_s2(facenet_result, emar_result)
                else:
                    results[sc_name] = self.fusion.decide_s3(facenet_result, emar_result)

            for sc, res in results.items():
                if sc == "S1":
                    sample.pred_s1 = 1 if res.is_accepted else 0
                elif sc == "S2":
                    sample.pred_s2 = 1 if res.is_accepted else 0
                elif sc == "S3":
                    sample.pred_s3 = 1 if res.is_accepted else 0

            sample.score_embed    = facenet_result.s_embed
            sample.score_liveness = p_live
            sample.score_final    = results.get("S3", results.get("S1")).s_final
            # Simpan ke experiment_samples (TIDAK menyentuh attendance_log)
            self.db.save_sample(sample)
            eval_count += 1
            
        logger.info(f"Evaluasi probe selesai: {eval_count} trial dieksekusi.")
    
        # Hitung metrik per skenario
        for sc in scenarios:
            pred_key = f"pred_{sc.lower()}"
            valid = [s for s in samples if getattr(s, pred_key) is not None and s.session != "enrollment"]
            if not valid:
                continue
            gt_all   = [s.gt_label for s in valid]
            pred_all = [getattr(s, pred_key) for s in valid]
            all_metrics.append(compute_iso_metrics(gt_all, pred_all, scenario=sc, condition="all"))

            # Metrik per kondisi (27 kombinasi: 3 konfig × 3 lux × 3 jarak)
            for lux in ["redup", "normal", "terang"]:
                for dist in DISTANCE_CM:
                    cond_samples = [s for s in valid
                                    if s.lux_category == lux and s.distance_cm == dist]
                    if cond_samples:
                        gt_c   = [s.gt_label for s in cond_samples]
                        pred_c = [getattr(s, pred_key) for s in cond_samples]
                        cond   = f"{lux}_{dist}cm"
                        all_metrics.append(compute_iso_metrics(gt_c, pred_c, scenario=sc, condition=cond))

        # Hasilkan laporan
        self.reporter.generate_full_report(all_metrics)
        return all_metrics


# ==============================================================================
# BAGIAN 11: FLASK REST API
# ==============================================================================

# EMARModule menyimpan state temporal; dua verifikasi bersamaan akan saling
# mengacaukan buffer kedip/mulut. Verifikasi video dijalankan satu per satu.
_VERIFY_LOCK = threading.Lock()


def _iter_video_frames(video_path: str) -> Iterator[np.ndarray]:
    """
    Frame video satu per satu. Video 1080p 8 s berisi ~1,5 GB piksel; menampung
    semuanya sekaligus membuat pemrosesan lambat atau gagal alokasi memori.
    """
    try:
        cap = cv2.VideoCapture(video_path)
    except Exception as e:
        raise ValueError(f"Gagal membaca video: {e}") from e
    try:
        while cap.isOpened():
            try:
                ret, frame = cap.read()
            except Exception as e:
                raise ValueError(f"Gagal membaca video: {e}") from e
            if not ret:
                break
            yield frame
    finally:
        cap.release()


def _ordered_parallel_map(
    fn: Callable[[Any], Any],
    items: Iterable[Any],
    workers: int,
    max_in_flight: int,
) -> Iterator[Any]:
    """
    fn(item) dijalankan paralel, hasil keluar sesuai urutan item. Paling banyak
    max_in_flight item yang menunggu, sehingga memori tidak tumbuh bersama video.
    """
    if workers <= 1:
        for item in items:
            yield fn(item)
        return
    with ThreadPoolExecutor(max_workers=workers) as ex:
        pending: deque = deque()
        for item in items:
            pending.append(ex.submit(fn, item))
            if len(pending) >= max_in_flight:
                yield pending.popleft().result()
        while pending:
            yield pending.popleft().result()


def face_width_ratio(m: Any) -> Optional[float]:
    """
    Lebar rahang dibagi lebar frame (0..1), sehingga tidak bergantung resolusi.
    Jarak dalam cm dihitung Laravel dari rasio ini dengan model kalibrasi kamera;
    mesin tidak menaksir cm. None bila frame tanpa wajah.
    """
    width_px = getattr(m, "face_width_px", None)
    frame_w = getattr(m, "frame_width", None)
    if width_px is None or frame_w is None or width_px <= 0 or frame_w <= 0:
        return None
    return float(width_px) / float(frame_w)


class FaceWidthTally:
    """
    Kumpulkan rasio lebar wajah dari hasil EMARModule.measure() yang sudah ada,
    agar /verify tidak mendeteksi wajah dua kali.
    """

    def __init__(self) -> None:
        self.ratios: List[float] = []
        self.n_frames = 0
        self._sizes: set = set()

    def frames(self, frames: Iterable[np.ndarray]) -> Iterator[np.ndarray]:
        for frame in frames:
            self.n_frames += 1
            self._sizes.add(tuple(frame.shape[:2]))
            yield frame

    def add(self, m: Any) -> None:
        ratio = face_width_ratio(m)
        if ratio is not None:
            self.ratios.append(ratio)

    def summary(self) -> Dict[str, Any]:
        # Ukuran frame hanya dilaporkan bila seragam; gambar kiriman bisa
        # beragam ukurannya dan tidak ada satu angka yang benar untuk semuanya.
        height, width = next(iter(self._sizes)) if len(self._sizes) == 1 else (None, None)
        return {
            "face_width_ratio": round(float(np.median(self.ratios)), 5) if self.ratios else None,
            "face_width_frames": len(self.ratios),
            "frame_width": width,
            "frame_height": height,
        }


# Kecerahan dihitung pada salinan selebar 320 px, sama dengan
# attendance-web/resources/js/Utils/luxCalibration.ts, agar murah dan tidak
# bergantung pada resolusi kamera.
LUMA_SAMPLE_WIDTH = 320
LUMA_SATURATED = 250.0
LUMA_DARK = 5.0


def frame_luma_stats(img_bgr: np.ndarray) -> Tuple[float, float, float]:
    """(rata-rata luma Rec.601 0-255, fraksi piksel jenuh, fraksi piksel gelap) satu bingkai."""
    h, w = img_bgr.shape[:2]
    if w > LUMA_SAMPLE_WIDTH:
        img_bgr = cv2.resize(img_bgr, (LUMA_SAMPLE_WIDTH, max(1, round(h * LUMA_SAMPLE_WIDTH / w))),
                             interpolation=cv2.INTER_AREA)
    b, g, r = cv2.split(img_bgr.astype(np.float32))
    y = 0.299 * r + 0.587 * g + 0.114 * b
    return float(y.mean()), float((y >= LUMA_SATURATED).mean()), float((y <= LUMA_DARK).mean())


def measure_brightness(frames: Iterable[np.ndarray]) -> Dict[str, Any]:
    """
    Kecerahan bingkai untuk estimasi lux terkalibrasi: median luma rata-rata per
    bingkai. Tanpa model biometrik dan tanpa galeri. Konversi ke lux dilakukan
    Laravel dengan model kalibrasi luxmeter; di sini tidak ada angka lux.
    """
    lumas, saturated, dark, sizes = [], [], [], set()
    for frame in frames:
        if frame is None or frame.size == 0:
            continue
        mean, sat, drk = frame_luma_stats(frame)
        lumas.append(mean)
        saturated.append(sat)
        dark.append(drk)
        sizes.add((int(frame.shape[1]), int(frame.shape[0])))
    size = next(iter(sizes)) if len(sizes) == 1 else (None, None)
    return {
        "luma": round(float(np.median(lumas)), 3) if lumas else None,
        "saturated_fraction": round(float(np.mean(saturated)), 4) if saturated else None,
        "dark_fraction": round(float(np.mean(dark)), 4) if dark else None,
        "n_frames": len(lumas),
        "frame_width": size[0],
        "frame_height": size[1],
    }


def measure_face_width(system_or_emar: Any, frames: Iterable[np.ndarray]) -> Dict[str, Any]:
    """
    Median rasio lebar wajah dari sekumpulan frame, untuk kalibrasi jarak kamera.
    Hanya memanggil EMARModule.measure(): state temporal EMAR dan galeri tidak
    tersentuh, jadi aman berjalan bersamaan dengan verifikasi.
    """
    emar = getattr(system_or_emar, "emar", system_or_emar)
    tally = FaceWidthTally()
    for m in _ordered_parallel_map(emar.measure, tally.frames(frames),
                                   workers=EMAR_WORKERS, max_in_flight=2 * EMAR_WORKERS):
        tally.add(m)
    summary = tally.summary()
    return {
        "face_width_ratio": summary["face_width_ratio"],
        "n_frames": tally.n_frames,
        "n_frames_with_face": summary["face_width_frames"],
        "frame_width": summary["frame_width"],
        "frame_height": summary["frame_height"],
    }


# Posisi frame kandidat FaceNet di sepanjang video. Selama tantangan liveness
# (kedip/buka mulut) ekspresi di tengah video bisa terdistorsi dan menaikkan
# jarak Euclidean (> 0,40), jadi beberapa frame dievaluasi dan dipilih jarak
# terendah (wajah paling netral/frontal). 0,50 harus tetap ada: hasil frame
# tengah dipakai bila tidak ada kandidat yang memuat wajah.
FACENET_CANDIDATE_RATIOS = (0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90)
# Kandidat dengan jarak <= nilai ini sudah memenuhi ambang kecocokan frontal
# (<= 0,40); kandidat berikutnya tidak dievaluasi.
FACENET_EARLY_EXIT_DISTANCE = 0.35


def _candidate_indices(n_frames: int) -> List[int]:
    """Indeks frame kandidat FaceNet untuk video n_frames frame, naik tanpa duplikat."""
    indices: List[int] = []
    for r in FACENET_CANDIDATE_RATIOS:
        idx = int(n_frames * r)
        if 0 <= idx < n_frames and idx not in indices:
            indices.append(idx)
    return indices or [n_frames // 2]


def _count_video_packets(cap: Any) -> Optional[int]:
    """
    Jumlah paket video tanpa mendekode (mode mentah FFmpeg), None bila tidak
    didukung. Rekaman MediaRecorder tidak menyimpan durasi, dan
    CAP_PROP_FRAME_COUNT-nya tidak bermakna (terukur 7903 untuk 154 frame).
    Hanya perkiraan: indeks kandidat tetap dihitung dari frame hasil dekode.
    """
    try:
        if not cap.set(cv2.CAP_PROP_FORMAT, -1):
            return None
        n = 0
        while cap.grab():
            n += 1
        return n
    except Exception:
        return None


def _read_frames_at(video_path: str, indices: Iterable[int]) -> Iterator[Tuple[int, np.ndarray]]:
    """
    (indeks, frame) untuk indeks yang diminta, urut naik. Frame lain hanya
    di-grab tanpa konversi warna, dan pembacaan berhenti setelah indeks
    terakhir. Frame yang dikembalikan sama dengan cap.read() pada indeks itu,
    karena read() adalah grab() lalu retrieve().
    """
    wanted = set(indices)
    if not wanted:
        return
    last = max(wanted)
    try:
        cap = cv2.VideoCapture(video_path)
    except Exception as e:
        raise ValueError(f"Gagal membaca video: {e}") from e
    try:
        for idx in range(last + 1):
            ok, frame = True, None
            try:
                if not cap.grab():
                    return
                if idx in wanted:
                    ok, frame = cap.retrieve()
            except Exception as e:
                raise ValueError(f"Gagal membaca video: {e}") from e
            if not ok:
                return
            if frame is not None:
                yield idx, frame
    finally:
        cap.release()


def verify_video_file(system: "FaceEMARSystem", video_path: str, user_id: str) -> Dict[str, Any]:
    """
    Verifikasi satu rekaman presensi: FaceNet 1:1 + liveness EMAR 8 detik.

    Dipakai Flask /verify dan biometric-api /verify agar keduanya menjalankan
    logika yang sama. Tidak pernah mengisi nilai pengganti: bila wajah tidak
    terdeteksi atau subjek belum terdaftar, "distance" bernilai None dan
    "fta_reason" menjelaskan sebabnya. "face_width_ratio" adalah median rasio
    lebar wajah atas frame yang memuat landmark, None bila tidak ada.

    Raises:
        ValueError: video tidak dapat dibaca atau tidak memuat frame.
    """
    with _VERIFY_LOCK:
        return _verify_video_file(system, video_path, user_id)


def _verify_video_file(system: "FaceEMARSystem", video_path: str, user_id: str) -> Dict[str, Any]:
    try:
        cap = cv2.VideoCapture(video_path)
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        predicted_frames = _count_video_packets(cap)
        cap.release()
    except Exception as e:
        raise ValueError(f"Gagal membaca video: {e}") from e

    # Cap waktu diambil dari waktu video, bukan jam dinding: pemrosesan
    # lebih lambat dari 30 fps, sehingga jendela 8,0 detik berbasis jam
    # dinding akan membuang bukti dari awal video.
    fps = video_fps if 1.0 <= video_fps <= 240.0 else 30.0
    system.emar.reset_temporal()
    # Bukti liveness terkumpul di buffer EMAR, tetapi frame tanpa wajah memberi
    # hasil kosong. Maka dipakai hasil terakhir yang memuat landmark, bukan
    # frame terakhir video.
    res_emar = EMARResult()
    n_frames = 0
    face_width = FaceWidthTally()
    # Frame di indeks kandidat (menurut jumlah paket) disimpan selama pass EMAR,
    # paling banyak 9 frame (~56 MB pada 1080p), agar video tidak perlu
    # didekode ulang untuk FaceNet.
    keep = set(_candidate_indices(predicted_frames)) if predicted_frames else set()
    kept: Dict[int, np.ndarray] = {}

    def frames_keeping_candidates() -> Iterator[np.ndarray]:
        for idx, frame in enumerate(_iter_video_frames(video_path)):
            if idx in keep:
                kept[idx] = frame
            yield frame

    measurements = _ordered_parallel_map(
        system.emar.measure, face_width.frames(frames_keeping_candidates()),
        workers=EMAR_WORKERS, max_in_flight=2 * EMAR_WORKERS,
    )
    try:
        for idx, m in enumerate(measurements):
            res = system.emar.push_measurement(m, timestamp=idx / fps)
            face_width.add(m)
            if res.landmark_count > 0:
                res_emar = res
            n_frames += 1
    except BaseException:
        # Traceback menahan frame fungsi ini; frame tersimpan dilepas lebih dulu.
        kept.clear()
        raise
    if n_frames == 0:
        raise ValueError("Video tidak mengandung frame")

    # Resolusi alias identitas (dengan atau tanpa prefiks emb_). Galeri dimuat
    # ulang lebih dulu: tanpa itu, pendaftaran ulang dari proses lain belum
    # terlihat di sini dan cek "belum terdaftar" di bawah memakai galeri lama.
    system.facenet.refresh_gallery()
    actual_user_id = system.facenet.resolve_id(user_id) or user_id

    # Evaluasi FaceNet multi-frame (lihat FACENET_CANDIDATE_RATIOS): kandidat
    # dievaluasi urut indeks naik, dan jarak <= FACENET_EARLY_EXIT_DISTANCE
    # menghentikan evaluasi. Indeks dihitung dari jumlah frame hasil dekode;
    # frame yang tersimpan dari pass EMAR identik dengan hasil dekode ulang.
    candidate_indices = _candidate_indices(n_frames)
    if all(idx in kept for idx in candidate_indices):
        candidate_frames = ((idx, kept[idx]) for idx in candidate_indices)
    else:
        # Jumlah paket tidak tersedia atau berbeda: baca ulang hanya sampai kandidat.
        kept.clear()
        candidate_frames = _read_frames_at(video_path, candidate_indices)

    best_facenet_res = None
    mid_res = None
    min_dist = float("inf")
    try:
        for idx, frame in candidate_frames:
            res_c = system.facenet.verify(frame, actual_user_id)
            if idx == n_frames // 2:
                mid_res = res_c
            if res_c.embedding is not None and res_c.distance < min_dist:
                min_dist = res_c.distance
                best_facenet_res = res_c
                if min_dist <= FACENET_EARLY_EXIT_DISTANCE:
                    break
            if res_c.embedding is not None and system.facenet.resolve_id(actual_user_id) is None:
                # Subjek belum terdaftar: selama galeri tidak berubah di tengah
                # permintaan ini, kandidat lain tidak bisa mengubah hasil
                # (SUBJECT_NOT_ENROLLED dari kandidat berwajah pertama ini).
                break
    finally:
        candidate_frames.close()
        kept.clear()

    if best_facenet_res is not None:
        facenet_res = best_facenet_res
    elif mid_res is not None:
        # Tidak ada kandidat berwajah. Frame tengah selalu kandidat
        # (int(n * 0,5) == n // 2), jadi hasil verify()-nya dipakai lagi.
        facenet_res = mid_res
    else:
        facenet_res = FaceNetResult(claimed_id=actual_user_id)

    # FaceNetResult memakai distance 9,99 sebagai nilai bawaan saat wajah tidak
    # terdeteksi atau subjek belum terdaftar. Itu bukan jarak terukur.
    if facenet_res.embedding is None:
        fta_reason = "FACE_NOT_DETECTED"
    elif actual_user_id not in system.facenet.gallery:
        fta_reason = "SUBJECT_NOT_ENROLLED"
    else:
        fta_reason = None
    distance = None if fta_reason else float(facenet_res.distance)
    is_live = bool(res_emar.is_live)

    if fta_reason == "FACE_NOT_DETECTED":
        status, message = "failed", "Wajah tidak terdeteksi pada rekaman (FTA)."
    elif fta_reason == "SUBJECT_NOT_ENROLLED":
        status, message = "failed", "Subjek belum terdaftar di galeri wajah."
    elif not facenet_res.is_verified:
        status, message = "failed", "Wajah tidak dikenali atau tidak cocok dengan ID."
    elif not is_live:
        status, message = "invalid", "Aktivitas kehidupan (liveness) tidak terdeteksi (kemungkinan spoofing)."
    else:
        status, message = "success", "Verifikasi berhasil."

    # "distance" wajib dikirim: tanpanya Laravel menaksir jarak sebagai
    # 1 - facenet_score = d/1,2, sehingga ambang 0,40 tidak lagi sama dengan Tabel 5.2.
    return {
        "status": status,
        "message": message,
        "facenet_score": None if fta_reason else facenet_res.s_embed,
        "distance": distance,
        "euclidean_distance": distance,
        "is_verified": bool(facenet_res.is_verified),
        "fta": fta_reason is not None,
        "fta_reason": fta_reason,
        "emar_score": res_emar.emar_score,
        "liveness_passed": is_live,
        "blink_cycles": res_emar.blink_cycles,
        "mouth_cycles": res_emar.mouth_cycles,
        "video_seconds": round(n_frames / fps, 3),
        # Jarak kamera hanya dicatat; S1/S2/S3 di atas tidak memakainya.
        **face_width.summary(),
        "request_id": str(uuid.uuid4()),
    }


def create_flask_api(system: "FaceEMARSystem") -> Flask:
    """
    Buat Flask REST API untuk integrasi dengan Laravel/Next.js backend.

    Endpoint:
      POST /verify        — Verifikasi presensi (upload frame)
      POST /enroll        — Daftarkan wajah baru (upload beberapa frame)
      GET  /subjects      — Daftar subjek terdaftar
      DELETE /subjects/<id> — Hapus template (etika)
      GET  /attendance/today — Log kehadiran hari ini
      GET  /attendance/export — Ekspor CSV
      GET  /metrics        — Metrik ISO hari ini
      GET  /health         — Health check (status koneksi dari Laravel)
    """
    app = Flask(__name__)
    CORS(app)   # Izinkan request cross-origin dari Laravel/Next.js

    # ── /health ───────────────────────────────────────────────────────────────
    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "online",
            "device": str(DEVICE),
            "gallery_size": len(system.facenet.gallery),
            "mediapipe_ready": getattr(system.emar, '_predictor', None) is not None or getattr(system.emar, '_detector', None) is not None or getattr(system.emar, '_mesh', None) is not None,
            "timestamp": datetime.now().isoformat()
        })

    # ── /enroll ───────────────────────────────────────────────────────────────
    @app.route("/enroll", methods=["POST"])
    def enroll():
        """
        Daftarkan wajah subjek baru.
        Body (multipart/form-data):
          subject_id, name, dept + file[]: beberapa gambar wajah
        """
        data = request.form
        subject_id = data.get("subject_id") or data.get("teacher_id") or data.get("user_id")
        name       = data.get("name", "")
        dept       = data.get("dept", "")
        if not subject_id:
            return jsonify({"error": "subject_id diperlukan"}), 400

        files = request.files.getlist("files[]")
        if not files:
            # Also support 'frame' from the earlier implementation
            f = request.files.get("frame")
            if f:
                files = [f]

        images = []
        for f in files:
            buf = np.frombuffer(f.read(), np.uint8)
            img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
            if img is not None:
                images.append(img)

        if len(images) < 1:
            return jsonify({"error": f"Minimal 1 gambar diperlukan, diterima: {len(images)}"}), 400

        result = system.facenet.enroll(subject_id, name, dept, images)
        return jsonify(result), 200 if result["success"] else 400

    # ── /verify ───────────────────────────────────────────────────────────────
    @app.route("/verify", methods=["POST"])
    def verify():
        """
        Verifikasi presensi — menerima video (WebM/MP4).
        Mengekstrak frame dari video, menghitung liveness EMAR dari seluruh sequence,
        lalu mencocokkan wajah FaceNet menggunakan frame di tengah.
        Body (multipart/form-data):
          user_id (str)
          video (file)
        """
        user_id = request.form.get("user_id") or request.form.get("teacher_id") or request.form.get("subject_id")
        
        if not user_id:
            return jsonify({"error": "user_id diperlukan", "status": "failed"}), 400

        file = request.files.get("video")
        if not file:
            return jsonify({"error": "File video diperlukan", "status": "failed"}), 400

        # Simpan video ke file sementara
        temp_video_path = str(BASE_DIR / "results" / f"temp_{uuid.uuid4().hex}_{os.path.basename(file.filename or 'video')}")
        file.save(temp_video_path)
        try:
            return jsonify(verify_video_file(system, temp_video_path, user_id))
        except ValueError as e:
            return jsonify({"error": str(e), "status": "failed"}), 400
        finally:
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)

    # ── /subjects ─────────────────────────────────────────────────────────────
    @app.route("/subjects", methods=["GET"])
    def get_subjects():
        return jsonify(system.facenet.get_gallery_info())

    @app.route("/subjects/<subject_id>", methods=["DELETE"])
    def delete_subject(subject_id):
        success = system.facenet.delete_template(subject_id)
        if success:
            return jsonify({"message": f"Template {subject_id} dihapus"}), 200
        return jsonify({"error": "Subjek tidak ditemukan"}), 404

    # ── /attendance ───────────────────────────────────────────────────────────
    @app.route("/attendance/today", methods=["GET"])
    def attendance_today():
        return jsonify(system.db.get_today_attendance())

    @app.route("/attendance/export", methods=["GET"])
    def attendance_export():
        path = system.db.export_csv()
        return send_file(path, as_attachment=True, download_name="attendance.csv")

    # ── /metrics ──────────────────────────────────────────────────────────────
    @app.route("/metrics", methods=["GET"])
    def get_metrics():
        samples = system.db.load_samples()
        if not samples:
            return jsonify({"message": "Belum ada data eksperimen"}), 200

        results = {}
        for sc in ["S1", "S2", "S3"]:
            pred_key = f"pred_{sc.lower()}"
            valid    = [s for s in samples if getattr(s, pred_key) is not None]
            if valid:
                gt_all   = [s.gt_label for s in valid]
                pred_all = [getattr(s, pred_key) for s in valid]
                m = compute_iso_metrics(gt_all, pred_all, scenario=sc)
                results[sc] = {
                    "apcer":    round(m.apcer * 100, 2),
                    "bpcer":    round(m.bpcer * 100, 2),
                    "acer":     round(m.acer  * 100, 2),
                    "accuracy": round(m.accuracy * 100, 2),
                    "f1":       round(m.f1 * 100, 2),
                    "n_total":  m.n_total
                }
        return jsonify(results)

    # ── /tune-alpha ───────────────────────────────────────────────────────────
    @app.route("/tune-alpha", methods=["POST"])
    def tune_alpha():
        """Grid search alpha optimal untuk skenario S3."""
        samples = system.db.load_samples()
        result  = system.fusion.tune_alpha(samples)
        return jsonify(result)

    return app


# ==============================================================================
# BAGIAN 12: ENTRY POINT CLI
# ==============================================================================

def main():
    """Entry point CLI dengan sub-perintah."""
    import argparse

    parser = argparse.ArgumentParser(
        description="FaceNet + EMAR Liveness Detection System — Skripsi Qalwani Anugerah 2026"
    )
    subparsers = parser.add_subparsers(dest="command")

    # Subcommand: enroll
    p_enroll = subparsers.add_parser("enroll", help="Daftarkan wajah dari webcam")
    p_enroll.add_argument("--id",   required=True, help="ID subjek, misal: GURU001")
    p_enroll.add_argument("--name", default="",    help="Nama subjek")
    p_enroll.add_argument("--dept", default="",    help="Departemen")
    p_enroll.add_argument("--frames", type=int, default=5, help="Jumlah frame yang diambil")

    # Subcommand: run
    p_run = subparsers.add_parser("run", help="Jalankan loop real-time presensi")
    p_run.add_argument("--id",       required=True,    help="ID subjek yang diklaim")
    p_run.add_argument("--scenario", default="S3",     choices=["S1","S2","S3"])
    p_run.add_argument("--lux",      default="normal", choices=["redup","normal","terang"])
    p_run.add_argument("--dist",     type=int, default=60, help="Jarak kamera-subjek (cm)")
    p_run.add_argument("--cam",      type=int, default=0,  help="Indeks kamera")

    # Subcommand: api
    p_api = subparsers.add_parser("api", help="Jalankan Flask REST API")
    p_api.add_argument("--host", default="0.0.0.0")
    p_api.add_argument("--port", type=int, default=5000)
    p_api.add_argument("--debug", action="store_true")

    # Subcommand: evaluate
    p_eval = subparsers.add_parser("evaluate", help="Evaluasi dataset ISO/IEC 30107-3")
    p_eval.add_argument("--manifest", required=True, help="Path ke MANIFEST_UJI.csv")
    p_eval.add_argument("--imgdir",   default=".",   help="Direktori root gambar")

    # Subcommand: tune
    subparsers.add_parser("tune", help="Grid search alpha optimal untuk S3")

    args = parser.parse_args()

    # Inisialisasi sistem
    system = FaceEMARSystem()

    if args.command == "enroll":
        cap = robust_open_webcam(0)

        frames = []
        logger.info(f"Enrollment {args.id}: tekan SPASI untuk capture, 'q' untuk selesai")
        while len(frames) < args.frames:
            ret, frame = cap.read()
            if not ret:
                break
            cv2.imshow("Enrollment — Tekan SPASI untuk capture", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord(" "):
                frames.append(frame)
                logger.info(f"Frame {len(frames)}/{args.frames} di-capture")
            elif key == ord("q"):
                break
        cap.release()
        cv2.destroyAllWindows()
        if frames:
            result = system.facenet.enroll(args.id, args.name, args.dept, frames)
            print(json.dumps(result, indent=2))

    elif args.command == "run":
        scenario_map = {
            "S1": ScenarioMode.S1_FACENET_ONLY,
            "S2": ScenarioMode.S2_RULE_BASED,
            "S3": ScenarioMode.S3_WEIGHTED
        }
        system.run_realtime(
            claimed_id   = args.id,
            scenario     = scenario_map[args.scenario],
            camera_index = args.cam,
            lux_category = args.lux,
            distance_cm  = args.dist
        )

    elif args.command == "api":
        app = create_flask_api(system)
        logger.info(f"Flask API berjalan di http://{args.host}:{args.port}")
        app.run(host=args.host, port=args.port, debug=args.debug)

    elif args.command == "evaluate":
        metrics = system.evaluate_dataset(args.manifest, args.imgdir)
        for m in metrics:
            logger.info(f"[{m.scenario}|{m.condition}] ACER={m.acer:.4f}")

    elif args.command == "tune":
        samples = system.db.load_samples()
        if not samples:
            logger.warning("Tidak ada data sampel untuk tuning alpha")
        else:
            result = system.fusion.tune_alpha(samples)
            print(json.dumps(result, indent=2))

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
