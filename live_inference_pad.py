#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
SISTEM PRESENSI REAL-TIME: FACENET + EMAR PRESENTATION ATTACK DETECTION (PAD)
Skripsi Penelitian: Face Verification & Anti-Spoofing Mitigasi Replay Attack
Peneliti          : Qalwani Anugerah
Arsitektur        : Multi-Threaded FaceNet (Non-blocking) + Dlib/MediaPipe 68-Landmark EMAR
Metode Pengujian  : Live Physical Webcam Capture vs. Smartphone Replay Video Attack
=============================================================================

ALUR KERJA DAN SPESIFIKASI SISTEM:
1. Trigger Pengujian (Spacebar):
   - Kamera terus aktif (live preview + reticle panduan wajah).
   - Pengujian dimulai HANYA setelah pengguna menekan tombol SPASI.
2. Time-Window Enforcer (8.0 Detik):
   - Evaluasi berlangsung selama tepat 8.0 detik.
3. Modul PAD (EMAR Liveness):
   - Deteksi 68 facial landmarks.
   - Penghitung Kedipan: EAR < 0.20 selama minimal 3 frame berturut-turut (anti-tremor).
   - Penghitung Mulut Aktif: MAR >= 0.10.
4. Modul FaceNet (Tiap 15 Frame, Non-Blocking Thread):
   - Ekstrak embedding wajah, normalisasi L2.
   - Hitung Jarak Euclidean ke DATABASE_IDENTITAS_MASTER.pkl.
   - Ambang Match: Jarak <= 0.40.
5. Fusi Keputusan Akhir (Dieksekusi pada Detik ke-8.0):
   - Status PAD  : BONA_FIDE jika tantangan acak EMAR aktif lolos (PASS_LIVENESS), selain itu SPOOF.
   - Keputusan   : ACCEPT jika (MATCH dan BONA_FIDE), selain itu REJECT.
6. Kontrol Keyboard:
   - [SPASI] = Mulai Sesi Pengujian 8.0 Detik
   - [R]     = Reset Layar & Siap Uji Ulang
   - [Q]     = Keluar dari Aplikasi
"""

import argparse
import os
import sys
import time
import pickle
import threading
import queue
from pathlib import Path
from typing import Optional, Tuple, Dict, List, Any

import cv2
import numpy as np

# Modul Algoritma Challenge-Response (EMAR Aktif)
from active_liveness import ActiveLivenessEMAR, evaluate_active_trial
from parameter_penelitian import (
    EAR_BLINK_THRESHOLD,
    FACENET_DISTANCE_THRESHOLD,
    MAR_OPEN_THRESHOLD,
    OBSERVATION_WINDOW_S,
)

# =============================================================================
# KONFIGURASI PATH DAN DETEKSI OTOMATIS DATASET
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent
DATASET_VIDEO_DIR = BASE_DIR / "dataset" / "video_singkat"

# =============================================================================
# KONFIGURASI AMBANG DAN PARAMETER PENELITIAN (ISO/IEC 30107-3)
# =============================================================================
TIME_WINDOW_SEC = OBSERVATION_WINDOW_S         # Jendela observasi 8,0 s (Tabel 5.2)
EAR_THRESHOLD = EAR_BLINK_THRESHOLD            # Mata tertutup jika EAR < 0,20 (Tabel 5.2)
EAR_CONSEC_FRAMES = 3          # Minimal frame berturut-turut untuk validasi kedip
MAR_THRESHOLD = MAR_OPEN_THRESHOLD             # Mulut terbuka jika MAR >= 0,10 (Tabel 5.2)
FACE_MATCH_THRESHOLD = FACENET_DISTANCE_THRESHOLD  # Cocok jika jarak <= 0,40 (Tabel 5.2)
FACENET_INTERVAL_FRAMES = 15   # Interval frame ekstraksi FaceNet (tiap 15 frame)
BLACK_FRAME_MEAN_THRESH = 5.0  # Ambang deteksi frame kamera gelap/kosong

# Daftar lokasi pencarian database dan model (Prioritas path absolut BASE_DIR)
DEFAULT_DB_PATHS = [
    str(DATASET_VIDEO_DIR / "DATABASE_IDENTITAS_MASTER.pkl"),
    str(BASE_DIR / "DATABASE_IDENTITAS_MASTER.pkl"),
    str(DATASET_VIDEO_DIR / "DATABASE_IDENTITAS_SMK.pkl"),
    str(BASE_DIR / "dataset" / "DATABASE_IDENTITAS_MASTER.pkl"),
    str(BASE_DIR / "gallery" / "face_gallery.pkl"),
]

DEFAULT_PREDICTOR_PATHS = [
    str(BASE_DIR / "models" / "shape_predictor_68_face_landmarks.dat"),
    str(BASE_DIR / "shape_predictor_68_face_landmarks.dat"),
]

def get_available_dataset_videos() -> List[Path]:
    """Mendeteksi seluruh file video (.mp4, .webm, .avi) di direktori dataset/video_singkat."""
    if not DATASET_VIDEO_DIR.exists():
        return []
    videos = sorted(
        [p for p in DATASET_VIDEO_DIR.glob("*") if p.suffix.lower() in [".mp4", ".webm", ".avi", ".mov", ".mkv"]]
    )
    return videos

# =============================================================================
# 1. MODUL EKSTRAKSI EMBEDDING FACENET (DENGAN FALLBACK AMAN)
# =============================================================================
class FaceNetFeatureExtractor:
    """
    Wrapper ekstraktor fitur FaceNet dengan dukungan:
    - keras_facenet (Keras/TensorFlow)
    - PyTorch InceptionResnetV1 (facenet_pytorch)
    - Fallback mock untuk demonstrasi jika library belum terpasang
    """
    def __init__(self):
        self.backend = None
        self.model = None
        self.embedding_dim = 128
        self._init_model()

    def _init_model(self):
        # 1. Coba keras_facenet (Sesuai spesifikasi utama)
        try:
            from keras_facenet import FaceNet
            print("[INFO] Memuat model FaceNet dari 'keras_facenet'...")
            self.model = FaceNet()
            self.backend = "keras_facenet"
            self.embedding_dim = 512  # keras_facenet secara default 512-D
            print("[INFO] Model FaceNet (keras_facenet) berhasil dimuat.")
            return
        except ImportError:
            pass

        # 2. Coba facenet_pytorch
        try:
            import torch
            from facenet_pytorch import InceptionResnetV1
            print("[INFO] Memuat model FaceNet dari 'facenet_pytorch'...")
            self.model = InceptionResnetV1(pretrained='vggface2').eval()
            self.backend = "facenet_pytorch"
            self.embedding_dim = 512
            print("[INFO] Model FaceNet (facenet_pytorch) berhasil dimuat.")
            return
        except ImportError:
            pass

        print("[WARN] Pustaka 'keras_facenet' / 'facenet_pytorch' tidak ditemukan.")
        print("[WARN] Menggunakan fallback Color/Spatial Feature Extractor untuk demonstrasi.")
        self.backend = "fallback"

    def extract(self, face_bgr: np.ndarray, target_dim: Optional[int] = None) -> np.ndarray:
        """Ekstrak vektor embedding dan normalisasi L2."""
        if face_bgr is None or face_bgr.size == 0:
            return np.zeros((self.embedding_dim,), dtype=np.float32)

        try:
            if self.backend == "keras_facenet":
                rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
                rgb = cv2.resize(rgb, (160, 160))
                emb = self.model.embeddings(np.expand_dims(rgb, axis=0))[0]
                emb = np.asarray(emb, dtype=np.float32).ravel()
            elif self.backend == "facenet_pytorch":
                import torch
                rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
                rgb = cv2.resize(rgb, (160, 160))
                tensor = torch.from_numpy(rgb).permute(2, 0, 1).float().div(255.0).unsqueeze(0)
                tensor = (tensor - 0.5) / 0.5
                with torch.no_grad():
                    emb = self.model(tensor).numpy()[0]
                emb = np.asarray(emb, dtype=np.float32).ravel()
            else:
                # Fallback deterministik berbasis resized RGB hist/gradient
                dim = target_dim or self.embedding_dim or 128
                resized = cv2.resize(face_bgr, (64, 64))
                gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
                # Pseudo-vector 128-D / 512-D
                grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
                grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
                mag = cv2.magnitude(grad_x, grad_y).flatten()
                step = max(1, len(mag) // dim)
                emb = mag[::step][:dim].astype(np.float32)
                if len(emb) < dim:
                    emb = np.pad(emb, (0, dim - len(emb)))

            # Normalisasi L2: ||v|| = 1.0
            norm = np.linalg.norm(emb)
            if norm > 1e-8:
                emb = emb / norm
            return emb
        except Exception as e:
            print(f"[ERROR] Ekstraksi FaceNet gagal: {e}")
            return np.zeros((self.embedding_dim,), dtype=np.float32)


# =============================================================================
# 2. WORKER THREAD UNTUK FACENET (NON-BLOCKING FPS ENFORCER)
# =============================================================================
class FaceNetAsyncWorker:
    """
    Worker thread non-blocking untuk memproses FaceNet tanpa menurunkan FPS UI.
    """
    def __init__(self, extractor: FaceNetFeatureExtractor, database: List[Dict[str, Any]]):
        self.extractor = extractor
        self.database = database
        self.queue = queue.Queue(maxsize=1)
        self.lock = threading.Lock()

        # Shared results
        self.latest_distance: Optional[float] = None
        self.latest_matched_name: str = "Unknown"
        self.latest_is_match: bool = False
        self.is_busy: bool = False
        self.running = True

        self.thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.thread.start()

    def submit_crop(self, face_bgr: np.ndarray):
        """Kirim crop wajah ke background queue tanpa memblokir thread UI."""
        if face_bgr is None or face_bgr.size == 0 or not self.database:
            return
        # Jika queue penuh, buang yang lama dan masukkan yang paling baru
        try:
            self.queue.put_nowait(face_bgr.copy())
        except queue.Full:
            try:
                _ = self.queue.get_nowait()
                self.queue.put_nowait(face_bgr.copy())
            except Exception:
                pass

    def _worker_loop(self):
        while self.running:
            try:
                crop = self.queue.get(timeout=0.2)
            except queue.Empty:
                continue

            with self.lock:
                self.is_busy = True

            try:
                # Dapatkan dimensi target dari database
                db_dim = self.database[0]["Vektor_Wajah"].shape[0] if self.database else 128
                probe = self.extractor.extract(crop, target_dim=db_dim)

                min_dist = float("inf")
                best_name = "Unknown"

                for entry in self.database:
                    gal_vec = entry["Vektor_Wajah"]
                    if gal_vec.shape[0] != probe.shape[0]:
                        # Sesuaikan dimensi jika berbeda
                        min_len = min(gal_vec.shape[0], probe.shape[0])
                        d = float(np.linalg.norm(probe[:min_len] - gal_vec[:min_len]))
                    else:
                        d = float(np.linalg.norm(probe - gal_vec))

                    if d < min_dist:
                        min_dist = d
                        best_name = entry["Nama"]

                is_match = (min_dist <= FACE_MATCH_THRESHOLD) and (best_name != "Unknown")

                with self.lock:
                    self.latest_distance = min_dist
                    self.latest_matched_name = best_name if is_match else f"Unknown ({best_name})"
                    self.latest_is_match = is_match
            except Exception as e:
                print(f"[WARN] Error dalam FaceNet Worker: {e}")
            finally:
                with self.lock:
                    self.is_busy = False
                self.queue.task_done()

    def get_results(self) -> Tuple[Optional[float], str, bool]:
        with self.lock:
            return self.latest_distance, self.latest_matched_name, self.latest_is_match

    def reset(self):
        with self.lock:
            self.latest_distance = None
            self.latest_matched_name = "Unknown"
            self.latest_is_match = False
            while not self.queue.empty():
                try:
                    self.queue.get_nowait()
                except Exception:
                    break

    def stop(self):
        self.running = False


# =============================================================================
# 3. MODUL DETEKSI 68 FACIAL LANDMARK (DLIB + MEDIAPIPE BACKEND)
# =============================================================================
class FacialLandmark68Detector:
    """
    Detektor 68 Facial Landmarks dengan arsitektur Dual-Engine:
    1. Primary: Dlib shape_predictor_68_face_landmarks.dat
    2. Graceful Fallback: MediaPipe FaceLandmarker (monitored standard mapping)
    """
    def __init__(self, predictor_path: Optional[str] = None):
        self.backend = None
        self.dlib_detector = None
        self.dlib_predictor = None
        self.mp_landmarker = None
        self._init_detector(predictor_path)

    def _find_predictor_file(self, custom_path: Optional[str]) -> Optional[str]:
        if custom_path and os.path.exists(custom_path):
            return custom_path
        for p in DEFAULT_PREDICTOR_PATHS:
            full = os.path.abspath(p)
            if os.path.exists(full):
                return full
        return None

    def _init_detector(self, predictor_path: Optional[str]):
        # 1. Coba Dlib
        found_dat = self._find_predictor_file(predictor_path)
        try:
            import dlib
            if found_dat:
                print(f"[INFO] Memuat Dlib 68-Landmark dari: {found_dat}")
                self.dlib_detector = dlib.get_frontal_face_detector()
                self.dlib_predictor = dlib.shape_predictor(found_dat)
                self.backend = "dlib"
                print("[INFO] Dlib 68-Landmark Detector berhasil diinisialisasi.")
                return
            else:
                print("[WARN] File shape_predictor_68_face_landmarks.dat tidak ditemukan.")
        except ImportError:
            print("[INFO] Dlib tidak terpasang di sistem.")

        # 2. Inisialisasi MediaPipe FaceMesh / FaceLandmarker
        try:
            import mediapipe as mp
            print("[INFO] Mengaktifkan MediaPipe FaceLandmarker sebagai backend 68-Landmark...")
            self._init_mediapipe()
            self.backend = "mediapipe"
            print("[INFO] MediaPipe FaceLandmarker Engine berhasil diaktifkan.")
            return
        except Exception as e:
            print(f"[ERROR] Gagal memuat MediaPipe: {e}")

        # 3. Fallback OpenCV Haar
        print("[WARN] Menggunakan OpenCV Haar Cascade Detector sebagai fallback dasar.")
        self.backend = "opencv"
        self.haar = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    def _init_mediapipe(self):
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision

        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "face_landmarker.task")
        if not os.path.exists(model_path):
            import urllib.request
            model_url = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/"
                         "face_landmarker/float16/latest/face_landmarker.task")
            print(f"[INFO] Mengunduh asset MediaPipe FaceLandmarker task ({model_path})...")
            urllib.request.urlretrieve(model_url, model_path)

        options = mp_vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=model_path),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.35,
            min_face_presence_confidence=0.35,
        )
        self.mp_landmarker = mp_vision.FaceLandmarker.create_from_options(options)

    def detect(self, frame_bgr: np.ndarray) -> Tuple[Optional[Tuple[int, int, int, int]], Optional[np.ndarray]]:
        """
        Deteksi wajah dan 68 titik landmark koordinat pixel:
        Output:
            bbox: (x, y, w, h)
            landmarks_68: np.ndarray shape (68, 2)
        """
        h, w = frame_bgr.shape[:2]

        if self.backend == "dlib":
            import dlib
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            rects = self.dlib_detector(gray, 0)
            if len(rects) == 0:
                return None, None

            rect = rects[0]
            x, y, rw, rh = rect.left(), rect.top(), rect.width(), rect.height()
            shape = self.dlib_predictor(gray, rect)
            pts = np.zeros((68, 2), dtype=np.int32)
            for i in range(68):
                pts[i] = (shape.part(i).x, shape.part(i).y)
            return (max(0, x), max(0, y), rw, rh), pts

        elif self.backend == "mediapipe":
            import mediapipe as mp
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            results = self.mp_landmarker.detect(mp_image)

            if not results.face_landmarks or len(results.face_landmarks) == 0:
                return None, None

            lms = results.face_landmarks[0]
            # Mapping 68 landmark Dlib standar dari 478 MediaPipe mesh
            pts = self._map_mediapipe_to_68(lms, w, h)

            xs = pts[:, 0]
            ys = pts[:, 1]
            x_min, x_max = max(0, int(xs.min())), min(w, int(xs.max()))
            y_min, y_max = max(0, int(ys.min())), min(h, int(ys.max()))
            pad_x = int((x_max - x_min) * 0.1)
            pad_y = int((y_max - y_min) * 0.15)
            x1 = max(0, x_min - pad_x)
            y1 = max(0, y_min - pad_y)
            x2 = min(w, x_max + pad_x)
            y2 = min(h, y_max + pad_y)
            return (x1, y1, x2 - x1, y2 - y1), pts

        else:
            # OpenCV fallback
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            faces = self.haar.detectMultiScale(gray, 1.3, 5)
            if len(faces) == 0:
                return None, None
            x, y, fw, fh = faces[0]
            # Generate synthetic 68 landmark box
            pts = np.zeros((68, 2), dtype=np.int32)
            pts[36:42] = [x + int(fw * 0.3), y + int(fh * 0.35)]  # Mata kiri
            pts[42:48] = [x + int(fw * 0.7), y + int(fh * 0.35)]  # Mata kanan
            pts[48:68] = [x + int(fw * 0.5), y + int(fh * 0.75)]  # Mulut
            return (x, y, fw, fh), pts

    def _map_mediapipe_to_68(self, lms, w: int, h: int) -> np.ndarray:
        """Pemetaan indeks MediaPipe Face Mesh ke format 68-landmark standar Dlib."""
        dlib_mp_indices = [
            # Jawline (0-16)
            234, 93, 132, 58, 172, 136, 150, 149, 152, 377, 378, 365, 397, 288, 361, 323, 454,
            # Right eyebrow (17-21)
            70, 63, 105, 66, 107,
            # Left eyebrow (22-26)
            336, 296, 334, 293, 300,
            # Nose bridge & tip (27-35)
            168, 197, 5, 4, 75, 97, 2, 326, 305,
            # Right eye (36-41): outer corner, top1, top2, inner corner, bottom2, bottom1
            33, 160, 158, 133, 153, 144,
            # Left eye (42-47): inner corner, top1, top2, outer corner, bottom2, bottom1
            362, 385, 387, 263, 373, 380,
            # Outer Mouth (48-59)
            61, 39, 37, 0, 267, 269, 291, 405, 314, 17, 84, 181,
            # Inner Mouth (60-67)
            78, 81, 13, 311, 308, 402, 14, 178
        ]
        pts = np.zeros((68, 2), dtype=np.int32)
        for i, idx in enumerate(dlib_mp_indices):
            if idx < len(lms):
                pts[i] = (int(lms[idx].x * w), int(lms[idx].y * h))
        return pts


# =============================================================================
# 4. UTILITAS PERHITUNGAN EMAR (EAR & MAR)
# =============================================================================
def compute_ear_68(landmarks: np.ndarray) -> float:
    """
    Hitung Eye Aspect Ratio (EAR) rata-rata mata kiri dan kanan dari 68 landmark Dlib.
    Titik Mata Kanan: 36 s.d 41
    Titik Mata Kiri : 42 s.d 47
    Formula Soukupova & Cech (2016):
        EAR = (||p2 - p6|| + ||p3 - p5||) / (2.0 * ||p1 - p4||)
    """
    def _single_ear(eye_pts):
        p1, p2, p3, p4, p5, p6 = eye_pts
        v1 = np.linalg.norm(p2 - p6)
        v2 = np.linalg.norm(p3 - p5)
        h = np.linalg.norm(p1 - p4)
        return float((v1 + v2) / (2.0 * h + 1e-6))

    right_eye = landmarks[36:42]
    left_eye = landmarks[42:48]

    ear_r = _single_ear(right_eye)
    ear_l = _single_ear(left_eye)
    return float((ear_r + ear_l) / 2.0)


def compute_mar_68(landmarks: np.ndarray) -> float:
    """
    Hitung Mouth Aspect Ratio (MAR) dari 68 landmark Dlib (Titik Mulut 48 s.d 67).
    Formula:
        MAR = (||p51 - p57|| + ||p50 - p58|| + ||p52 - p56||) / (3.0 * ||p48 - p54||)
    """
    p48 = landmarks[48]
    p54 = landmarks[54]
    p50 = landmarks[50]
    p58 = landmarks[58]
    p51 = landmarks[51]
    p57 = landmarks[57]
    p52 = landmarks[52]
    p56 = landmarks[56]

    v1 = np.linalg.norm(p50 - p58)
    v2 = np.linalg.norm(p51 - p57)
    v3 = np.linalg.norm(p52 - p56)
    h = np.linalg.norm(p48 - p54)

    mar = float((v1 + v2 + v3) / (3.0 * h + 1e-6))
    return mar


# =============================================================================
# 5. PEMBUAT DATABASE IDENTITAS & RESOLVER DATASET
# =============================================================================
def load_identity_database(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Memuat database referensi identitas wajah dari file pickle (.pkl).
    Mendukung format:
    - Pandas DataFrame
    - List of Dict
    - Dict of Embeddings
    """
    target_path = None
    if db_path:
        # Coba path langsung atau di dalam dataset/video_singkat
        candidates = [
            Path(db_path),
            DATASET_VIDEO_DIR / db_path,
            BASE_DIR / db_path
        ]
        for c in candidates:
            if c.exists():
                target_path = str(c.resolve())
                break

    if not target_path:
        for p in DEFAULT_DB_PATHS:
            if os.path.exists(p):
                target_path = str(Path(p).resolve())
                break

    if not target_path:
        print(f"[WARN] Database identitas tidak ditemukan di lokasi standar:")
        for p in DEFAULT_DB_PATHS:
            print(f"       - {p}")
        return []

    print(f"[INFO] Memuat database identitas master dari:\n       -> {target_path}")
    try:
        with open(target_path, "rb") as f:
            raw_data = pickle.load(f)

        db_records: List[Dict[str, Any]] = []

        # 1. Jika DataFrame
        if hasattr(raw_data, "iterrows"):
            for _, row in raw_data.iterrows():
                sub_id = str(row.get("ID_Subjek", row.get("id", "?")))
                nama = str(row.get("Nama", row.get("name", sub_id)))
                vec = np.asarray(row.get("Vektor_Wajah", row.get("embedding", [])), dtype=np.float32).ravel()
                if len(vec) > 0:
                    norm = np.linalg.norm(vec)
                    if norm > 1e-8:
                        vec = vec / norm
                    db_records.append({"ID_Subjek": sub_id, "Nama": nama, "Vektor_Wajah": vec})

        # 2. Jika List of Dicts
        elif isinstance(raw_data, list):
            for item in raw_data:
                if isinstance(item, dict):
                    sub_id = str(item.get("ID_Subjek", item.get("id", "?")))
                    nama = str(item.get("Nama", item.get("name", sub_id)))
                    vec = np.asarray(item.get("Vektor_Wajah", item.get("embedding", [])), dtype=np.float32).ravel()
                    if len(vec) > 0:
                        norm = np.linalg.norm(vec)
                        if norm > 1e-8:
                            vec = vec / norm
                        db_records.append({"ID_Subjek": sub_id, "Nama": nama, "Vektor_Wajah": vec})

        # 3. Jika Dictionary
        elif isinstance(raw_data, dict):
            for key, val in raw_data.items():
                if isinstance(val, dict):
                    nama = val.get("name", val.get("Nama", str(key)))
                    vec = np.asarray(val.get("embedding", val.get("Vektor_Wajah", [])), dtype=np.float32).ravel()
                else:
                    nama = str(key)
                    vec = np.asarray(val, dtype=np.float32).ravel()

                if len(vec) > 0:
                    norm = np.linalg.norm(vec)
                    if norm > 1e-8:
                        vec = vec / norm
                    db_records.append({"ID_Subjek": str(key), "Nama": nama, "Vektor_Wajah": vec})

        dim = db_records[0]["Vektor_Wajah"].shape[0] if db_records else 0
        print(f"[INFO] Berhasil memuat {len(db_records)} subjek terdaftar. Dimensi vektor = {dim}-D.")
        return db_records

    except Exception as e:
        print(f"[ERROR] Gagal membaca file database pickle: {e}")
        return []


def resolve_video_path(video_input: Optional[str]) -> Optional[Path]:
    """Meresolusi path video dari input CLI / indeks dataset."""
    if not video_input:
        return None

    # 1. Cek jika integer index (e.g. '1', '2')
    available = get_available_dataset_videos()
    if video_input.isdigit():
        idx = int(video_input) - 1
        if 0 <= idx < len(available):
            return available[idx]

    # 2. Cek path langsung atau relatif
    p = Path(video_input)
    if p.exists():
        return p.resolve()

    # 3. Cek di dalam dataset/video_singkat
    in_dataset = DATASET_VIDEO_DIR / video_input
    if in_dataset.exists():
        return in_dataset.resolve()

    # 4. Fuzzy match dengan nama file di dataset
    for v in available:
        if video_input.lower() in v.name.lower():
            return v.resolve()

    return None


# =============================================================================
# 6. PEMBUKA WEBCAM CERDAS (AUTO-PROBE MULTI-BACKEND & MULTI-INDEX)
# =============================================================================
def auto_find_working_camera(preferred_idx: int = 0) -> Tuple[Optional[cv2.VideoCapture], int]:
    """
    Memindai dan membuka kamera fisik aktif secara otomatis.
    Mengutamakan DirectShow (CAP_DSHOW) di Windows untuk mencegah error MSMF -1072875772.
    """
    candidate_indices = []
    if preferred_idx is not None:
        candidate_indices.append(preferred_idx)
    # Tambahkan indeks kamera umum yang sering aktif
    for idx in [1, 0, 2, 3]:
        if idx not in candidate_indices:
            candidate_indices.append(idx)

    backends = []
    if os.name == "nt":
        if hasattr(cv2, "CAP_DSHOW"):
            backends.append(("DSHOW", cv2.CAP_DSHOW))
        if hasattr(cv2, "CAP_MSMF"):
            backends.append(("MSMF", cv2.CAP_MSMF))
    backends.append(("ANY", cv2.CAP_ANY))

    for idx in candidate_indices:
        for b_name, backend in backends:
            try:
                cap = cv2.VideoCapture(idx, backend)
                if not cap.isOpened():
                    cap.release()
                    continue

                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

                # Coba baca sample frame
                valid_frame = None
                for _ in range(5):
                    ret, fr = cap.read()
                    if ret and fr is not None and fr.size > 0:
                        valid_frame = fr
                        break
                    time.sleep(0.02)

                if valid_frame is not None and float(valid_frame.mean()) > BLACK_FRAME_MEAN_THRESH:
                    print(f"[INFO] Kamera fisik AKTIF di Index {idx} (Backend: {b_name}, Resolusi: {valid_frame.shape[1]}x{valid_frame.shape[0]}, Kecerahan: {valid_frame.mean():.1f})")
                    return cap, idx

                cap.release()
            except Exception as e:
                pass

    print("[WARN] Tidak ada webcam fisik yang dapat dibuka secara otomatis.")
    return None, -1


# =============================================================================
# 7. KOMPONEN UI OPENCV RESPONSIVE (HUD, RETICLE, GLASS CARD, BANNER)
# =============================================================================
def draw_glass_card(img: np.ndarray, x: int, y: int, w: int, h: int, alpha: float = 0.70, color: Tuple[int, int, int] = (15, 25, 45)):
    """Menggambar panel translucent bergaya glassmorphic dengan boundary clipping aman."""
    h_img, w_img = img.shape[:2]
    x1, y1 = max(0, x), max(0, y)
    x2, y2 = min(w_img, x + w), min(h_img, y + h)
    if x2 <= x1 or y2 <= y1:
        return
    sub = img[y1:y2, x1:x2]
    overlay = np.full_like(sub, color, dtype=np.uint8)
    cv2.addWeighted(overlay, alpha, sub, 1.0 - alpha, 0, sub)
    cv2.rectangle(img, (x1, y1), (x2, y2), (70, 90, 130), 1, cv2.LINE_AA)


def draw_face_reticle(img: np.ndarray, bbox: Optional[Tuple[int, int, int, int]], state_color: Tuple[int, int, int], scale: float = 1.0):
    """Menggambar corner brackets dan reticle penanda area wajah yang responsif terhadap ukuran frame."""
    h_img, w_img = img.shape[:2]
    line_th = max(1, int(2 * scale))
    corner_th = max(2, int(3 * scale))

    if bbox is not None:
        x, y, w, h = bbox
        x2, y2 = min(w_img - 1, x + w), min(h_img - 1, y + h)
        x1, y1 = max(0, x), max(0, y)
        if x2 <= x1 or y2 <= y1:
            return

        cv2.rectangle(img, (x1, y1), (x2, y2), state_color, line_th, cv2.LINE_AA)
        line_len = max(12, min(w, h) // 4)

        # Corner brackets
        cv2.line(img, (x1, y1), (x1 + line_len, y1), state_color, corner_th, cv2.LINE_AA)
        cv2.line(img, (x1, y1), (x1, y1 + line_len), state_color, corner_th, cv2.LINE_AA)
        cv2.line(img, (x2, y1), (x2 - line_len, y1), state_color, corner_th, cv2.LINE_AA)
        cv2.line(img, (x2, y1), (x2, y1 + line_len), state_color, corner_th, cv2.LINE_AA)
        cv2.line(img, (x1, y2), (x1 + line_len, y2), state_color, corner_th, cv2.LINE_AA)
        cv2.line(img, (x1, y2), (x1, y2 - line_len), state_color, corner_th, cv2.LINE_AA)
        cv2.line(img, (x2, y2), (x2 - line_len, y2), state_color, corner_th, cv2.LINE_AA)
        cv2.line(img, (x2, y2), (x2, y2 - line_len), state_color, corner_th, cv2.LINE_AA)
    else:
        # Default guide ellipse jika wajah belum terdeteksi
        cx, cy = w_img // 2, int(h_img * 0.48)
        rx, ry = int(w_img * 0.20), int(h_img * 0.32)
        cv2.ellipse(img, (cx, cy), (rx, ry), 0, 0, 360, (0, 200, 255), line_th, cv2.LINE_AA)
        font_sz = max(0.38, 0.45 * scale)
        cv2.putText(img, "POSISIKAN WAJAH DI SINI", (cx - int(90 * scale), cy + ry + int(24 * scale)),
                    cv2.FONT_HERSHEY_SIMPLEX, font_sz, (0, 200, 255), line_th, cv2.LINE_AA)


# =============================================================================
# 8. PIPELINE UTAMA (STATE MACHINE & REAL-TIME INFERENCE)
# =============================================================================
def run_live_inference(
    cam_index: int = 0,
    video_path: Optional[str] = None,
    db_path: Optional[str] = None,
    predictor_path: Optional[str] = None,
    participant_id: str = "P01",
    jarak: Optional[float] = None,
    lux: Optional[float] = None,
    label_aktual: str = "Bona_Fide",
    csv_path: str = "Dataset_Eksperimen_Bab5.csv"
):
    print("==================================================================")
    print("SISTEM LIVE INFERENCE PAD — FACENET + EMAR (8.0 DETIK WINDOW)")
    print("==================================================================")
    print(f"[INFO] Direktori Proyek   : {BASE_DIR}")
    print(f"[INFO] Direktori Dataset  : {DATASET_VIDEO_DIR}")

    # 1. Deteksi Daftar Video Dataset
    available_videos = get_available_dataset_videos()
    print(f"[INFO] Total Video Terdeteksi di dataset/video_singkat: {len(available_videos)} file")
    if available_videos:
        for idx, v in enumerate(available_videos, start=1):
            print(f"       [{idx:02d}] {v.name}")
    else:
        print("       [WARN] Tidak ada file .mp4 di dataset/video_singkat.")

    # 2. Database
    database = load_identity_database(db_path)

    # 3. FaceNet Extractor & Async Worker
    extractor = FaceNetFeatureExtractor()
    facenet_worker = FaceNetAsyncWorker(extractor, database)

    # 4. Landmark Detector
    landmark_detector = FacialLandmark68Detector(predictor_path)

    # Inisialisasi Sumber Input (Webcam atau Video File)
    current_video_idx = -1  # -1 berarti Webcam Fisik, >= 0 indeks di available_videos
    current_cam_idx = cam_index

    if video_path:
        resolved_file = resolve_video_path(video_path)
        if resolved_file and resolved_file.exists():
            if resolved_file in available_videos:
                current_video_idx = available_videos.index(resolved_file)
            print(f"[INFO] Menggunakan Input File Video: {resolved_file.name}")
        else:
            print(f"[WARN] File video '{video_path}' tidak ditemukan. Mencari webcam...")

    def open_current_source():
        nonlocal current_video_idx, current_cam_idx
        if current_video_idx >= 0 and current_video_idx < len(available_videos):
            target_v = available_videos[current_video_idx]
            v_cap = cv2.VideoCapture(str(target_v))
            if v_cap.isOpened():
                print(f"[INFO] Sumber Aktif: Video [{current_video_idx + 1}/{len(available_videos)}] {target_v.name}")
                return v_cap, f"VIDEO: {target_v.name}"
            print(f"[WARN] Gagal membuka video {target_v.name}. Beralih ke webcam.")
            current_video_idx = -1

        w_cap, actual_idx = auto_find_working_camera(preferred_idx=current_cam_idx)
        if w_cap is not None:
            current_cam_idx = actual_idx
            return w_cap, f"WEBCAM (Cam {actual_idx})"
        return None, "NO_CAMERA"

    cap, source_label = open_current_source()
    if cap is None:
        print("[FATAL] Tidak dapat membuka webcam fisik maupun file video.")
        facenet_worker.stop()
        return

    # Status State Machine
    STATE_IDLE = 0
    STATE_EVALUATING = 1
    STATE_FROZEN_RESULT = 2

    current_state = STATE_IDLE

    # Variabel Metrik & PAD
    start_eval_time = 0.0
    elapsed_eval_time = 0.0

    ear_consec_counter = 0
    total_blinks = 0
    total_mouth_active = 0
    mouth_is_open = False

    frame_counter = 0
    fps_start_time = time.time()
    fps_counter = 0
    current_fps = 0.0

    latest_ear: Optional[float] = None
    latest_mar: Optional[float] = None
    latest_dist: Optional[float] = None
    latest_name: str = "Unknown"
    latest_is_match: bool = False

    # Variabel Hasil Akhir Fusi (Frozen Snapshot) & Evaluasi Bab 5
    frozen_frame: Optional[np.ndarray] = None
    final_pad_status = "UNKNOWN"
    final_decision = "REJECT"
    final_reason = ""
    session_min_ear = 999.0
    session_max_mar = 0.0
    s1_res = 0
    s2_res = 0
    s3_res = 0

    # Modul & State Challenge-Response EMAR Aktif
    active_liveness = ActiveLivenessEMAR(timeout_seconds=4.0)
    challenge_generated = False
    active_challenge_name: Optional[str] = None
    active_prompt_text: str = ""
    active_challenge_status: str = "WAITING_FOR_ACTION"

    print("\n[PETUNJUK OPERASIONAL PENGUJIAN CHALLENGE-RESPONSE]:")
    print("1. Hadapkan wajah ke depan kamera (Fase 1: T=0s Deteksi Wajah Baseline).")
    print("2. Tekan [SPASI] untuk memulai sesi evaluasi EMAR Aktif (T=8s Fusi).")
    print("3. Perhatikan instruksi acak (Fase 2: T=1s Kedip Mata atau Buka Mulut).")
    print("4. Ikuti instruksi dalam jendela waktu 4 detik (Fase 3: T=2s - T=5s).")
    print("5. Tekan [V] untuk mengganti sumber video dataset/webcam.")
    print("6. Tekan [C] untuk mengganti indeks webcam.")
    print("7. Tekan [R] untuk me-reset hasil dan siap uji ulang.")
    print("8. Tekan [Q] untuk mengakhiri program.\n")

    win_name = "FaceNet + EMAR Live PAD (Skripsi Qalwani - UMP)"
    cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win_name, 960, 720)

    try:
        while True:
            # -------------------------------------------------------------
            # A. KONDISI STATE 2: HASIL DIBEKUKAN (FROZEN RESULT)
            # -------------------------------------------------------------
            if current_state == STATE_FROZEN_RESULT:
                display_img = frozen_frame.copy() if frozen_frame is not None else np.zeros((480, 640, 3), dtype=np.uint8)
                h_img, w_img = display_img.shape[:2]
                ui_scale = max(0.55, min(w_img / 720.0, h_img / 540.0))

                # Gambar Banner Keputusan Besar di Tengah Layar (Responsif)
                card_w, card_h = int(w_img * 0.88), int(h_img * 0.68)
                card_x, card_y = (w_img - card_w) // 2, (h_img - card_h) // 2

                if final_decision == "ACCEPT":
                    bg_col = (10, 45, 20)      # Dark Emerald
                    border_col = (0, 230, 115) # Bright Green
                    title_text = "STATUS: ACCEPT (PRESENSI SUKSES)"
                    title_col = (0, 255, 128)
                else:
                    bg_col = (15, 15, 45)      # Dark Crimson
                    border_col = (0, 40, 240)  # Bright Red
                    title_text = "STATUS: REJECT (AKSES DITOLAK)"
                    title_col = (50, 80, 255)

                draw_glass_card(display_img, card_x, card_y, card_w, card_h, alpha=0.88, color=bg_col)
                cv2.rectangle(display_img, (card_x, card_y), (card_x + card_w, card_y + card_h), border_col, max(2, int(3 * ui_scale)), cv2.LINE_AA)

                # Layout Teks Hasil Evaluasi Responsif
                pad_x = int(22 * ui_scale)
                top_y = card_y + int(36 * ui_scale)
                step_y = int(26 * ui_scale)
                f_title = max(0.50, 0.70 * ui_scale)
                f_body = max(0.40, 0.50 * ui_scale)

                cv2.putText(display_img, title_text, (card_x + pad_x, top_y),
                            cv2.FONT_HERSHEY_DUPLEX, f_title, title_col, max(1, int(2 * ui_scale)), cv2.LINE_AA)
                cv2.line(display_img, (card_x + pad_x, top_y + int(12 * ui_scale)),
                         (card_x + card_w - pad_x, top_y + int(12 * ui_scale)), (120, 120, 120), 1)

                dist_str = f"{latest_dist:.3f}" if latest_dist is not None else "N/A"
                cur_y = top_y + int(36 * ui_scale)
                cv2.putText(display_img, f"Sumber Pengujian        : {source_label}", (card_x + pad_x, cur_y),
                            cv2.FONT_HERSHEY_SIMPLEX, f_body, (200, 220, 255), 1, cv2.LINE_AA)
                cur_y += step_y
                cv2.putText(display_img, f"Subjek Teridentifikasi  : {latest_name}", (card_x + pad_x, cur_y),
                            cv2.FONT_HERSHEY_SIMPLEX, f_body, (255, 255, 255), 1, cv2.LINE_AA)
                cur_y += step_y
                cv2.putText(display_img, f"Jarak Euclidean FaceNet : {dist_str} (Ambang Match <= {FACE_MATCH_THRESHOLD:.2f})", (card_x + pad_x, cur_y),
                            cv2.FONT_HERSHEY_SIMPLEX, f_body, (220, 220, 220), 1, cv2.LINE_AA)
                cur_y += step_y
                cv2.putText(display_img, f"Klasifikasi Liveness PAD: {final_pad_status}", (card_x + pad_x, cur_y),
                            cv2.FONT_HERSHEY_SIMPLEX, f_body, (0, 255, 255) if final_pad_status == "BONA_FIDE" else (50, 50, 255), max(1, int(1.5 * ui_scale)), cv2.LINE_AA)
                cur_y += step_y
                ch_label = active_challenge_name if active_challenge_name else "N/A"
                ch_col = (0, 255, 128) if active_challenge_status == "PASS_LIVENESS" else (50, 80, 255)
                cv2.putText(display_img, f"Tantangan Acak EMAR     : {ch_label} [{active_challenge_status}]", (card_x + pad_x, cur_y),
                            cv2.FONT_HERSHEY_SIMPLEX, f_body, ch_col, max(1, int(1.5 * ui_scale)), cv2.LINE_AA)
                cur_y += step_y
                cv2.putText(display_img, f"Metrik EMAR Terdeteksi  : {total_blinks} Kedipan | {total_mouth_active} Gerakan Mulut", (card_x + pad_x, cur_y),
                            cv2.FONT_HERSHEY_SIMPLEX, f_body, (200, 200, 200), 1, cv2.LINE_AA)
                cur_y += step_y
                s_col = (0, 255, 128) if (s1_res == 1 and s2_res == 1 and s3_res == 1) else (0, 220, 255)
                cv2.putText(display_img, f"Skenario Bab 5          : S1={s1_res} | S2={s2_res} | S3={s3_res} (CSV Logged)", (card_x + pad_x, cur_y),
                            cv2.FONT_HERSHEY_SIMPLEX, f_body, s_col, 1, cv2.LINE_AA)

                if final_decision == "REJECT":
                    cur_y += step_y
                    cv2.putText(display_img, f"Alasan Penolakan        : {final_reason}", (card_x + pad_x, cur_y),
                                cv2.FONT_HERSHEY_SIMPLEX, f_body, (0, 180, 255), 1, cv2.LINE_AA)

                # Tombol Instruksi Bawah
                cv2.putText(display_img, "[R] Reset & Uji Ulang   |   [V] Ganti Video/Kamera   |   [Q] Keluar",
                            (card_x + pad_x, card_y + card_h - int(16 * ui_scale)), cv2.FONT_HERSHEY_SIMPLEX, max(0.38, 0.46 * ui_scale), (255, 255, 255), 1, cv2.LINE_AA)

                cv2.imshow(win_name, display_img)
                key = cv2.waitKey(30) & 0xFF
                if key == ord('r') or key == ord('R'):
                    current_state = STATE_IDLE
                    ear_consec_counter = 0
                    total_blinks = 0
                    total_mouth_active = 0
                    mouth_is_open = False
                    latest_ear = None
                    latest_mar = None
                    frozen_frame = None
                    facenet_worker.reset()
                    active_liveness = ActiveLivenessEMAR(timeout_seconds=4.0)
                    challenge_generated = False
                    active_challenge_name = None
                    active_prompt_text = ""
                    active_challenge_status = "WAITING_FOR_ACTION"
                    if current_video_idx >= 0:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    print("[INFO] Sistem di-reset. Menunggu tombol SPASI...")
                elif key == ord('v') or key == ord('V'):
                    if available_videos:
                        current_video_idx = (current_video_idx + 1)
                        if current_video_idx >= len(available_videos):
                            current_video_idx = -1
                        cap.release()
                        cap, source_label = open_current_source()
                        current_state = STATE_IDLE
                        ear_consec_counter = 0
                        total_blinks = 0
                        total_mouth_active = 0
                        mouth_is_open = False
                        latest_ear = None
                        latest_mar = None
                        frozen_frame = None
                        facenet_worker.reset()
                        active_liveness = ActiveLivenessEMAR(timeout_seconds=4.0)
                        challenge_generated = False
                        active_challenge_name = None
                        active_prompt_text = ""
                        active_challenge_status = "WAITING_FOR_ACTION"
                elif key == ord('q') or key == ord('Q') or key == 27:
                    break
                continue

            # -------------------------------------------------------------
            # B. BACA FRAME AKTIF (STATE IDLE / EVALUATING)
            # -------------------------------------------------------------
            ret, frame = cap.read()
            if not ret or frame is None:
                if current_video_idx >= 0:
                    # Loop video jika selesai saat evaluasi
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                if not ret or frame is None:
                    time.sleep(0.03)
                    continue

            # Flip jika menggunakan webcam fisik untuk mirror-mode yang natural
            if current_video_idx < 0:
                frame = cv2.flip(frame, 1)

            h_img, w_img = frame.shape[:2]
            ui_scale = max(0.55, min(w_img / 720.0, h_img / 540.0))
            frame_counter += 1
            fps_counter += 1

            # Hitung FPS
            if time.time() - fps_start_time >= 1.0:
                current_fps = fps_counter / (time.time() - fps_start_time)
                fps_counter = 0
                fps_start_time = time.time()

            # Deteksi Landmark 68
            bbox, landmarks = landmark_detector.detect(frame)

            # Hitung EAR & MAR jika landmark terdeteksi
            if landmarks is not None:
                latest_ear = compute_ear_68(landmarks)
                latest_mar = compute_mar_68(landmarks)

                # Gambar titik landmark halus pada wajah
                for (lx, ly) in landmarks:
                    cv2.circle(frame, (int(lx), int(ly)), max(1, int(1.2 * ui_scale)), (0, 255, 255), -1, cv2.LINE_AA)
            else:
                latest_ear = None
                latest_mar = None

            # -------------------------------------------------------------
            # C. LOGIKA STATE 1: SEDANG EVALUASI (TIME-WINDOW 8.0 DETIK EMAR AKTIF)
            # -------------------------------------------------------------
            if current_state == STATE_EVALUATING:
                elapsed_eval_time = time.time() - start_eval_time

                # 1. Update PAD Liveness & Sensor Landmark
                if latest_ear is not None and latest_mar is not None:
                    session_min_ear = min(session_min_ear, float(latest_ear))
                    session_max_mar = max(session_max_mar, float(latest_mar))

                    # Logika Kedipan (EAR < 0.20)
                    if latest_ear < EAR_THRESHOLD:
                        ear_consec_counter += 1
                        if ear_consec_counter == EAR_CONSEC_FRAMES:
                            total_blinks += 1
                    else:
                        ear_consec_counter = 0

                    # Logika Gerakan Mulut (MAR >= 0.10)
                    if latest_mar >= MAR_THRESHOLD:
                        if not mouth_is_open:
                            total_mouth_active += 1
                            mouth_is_open = True
                    else:
                        mouth_is_open = False

                # 2. Workflow Algoritma Challenge-Response:
                # Fase 2: Random Challenge (T=1s)
                if elapsed_eval_time >= 1.0 and not challenge_generated:
                    active_challenge_name, active_prompt_text = active_liveness.generate_challenge()
                    challenge_generated = True
                    active_challenge_status = "WAITING_FOR_ACTION"
                    print(f"\n[CHALLENGE T=1s] >>> {active_prompt_text} <<<")

                # Fase 3: Jendela Observasi Spesifik (T=2s s.d T=5s)
                if challenge_generated and latest_ear is not None and latest_mar is not None:
                    step_status = active_liveness.evaluate_response(float(latest_ear), float(latest_mar))
                    if step_status != "ALREADY_COMPLETED":
                        active_challenge_status = step_status

                # 3. Modul FaceNet (Tiap 15 Frame)
                if frame_counter % FACENET_INTERVAL_FRAMES == 0 and bbox is not None:
                    bx, by, bw, bh = bbox
                    bx2, by2 = min(w_img, bx + bw), min(h_img, by + bh)
                    if bx2 > bx and by2 > by:
                        crop_face = frame[by:by2, bx:bx2]
                        facenet_worker.submit_crop(crop_face)

                # Ambil hasil FaceNet async terbaru
                latest_dist, latest_name, latest_is_match = facenet_worker.get_results()

                # 4. Time-Window Enforcer (Capai Detik ke-8.0 -> Eksekusi Fusi Keputusan)
                if elapsed_eval_time >= TIME_WINDOW_SEC:
                    current_state = STATE_FROZEN_RESULT
                    frozen_frame = frame.copy()

                    # Evaluasi Fusi Akhir (T=8s)
                    # FaceNet Euclidean <= 0.40 + Tantangan Acak Berhasil (PASS_LIVENESS) = ACCEPT
                    is_challenge_passed = (active_challenge_status == "PASS_LIVENESS")
                    final_pad_status = "BONA_FIDE" if is_challenge_passed else "SPOOF"

                    # Ambil snapshot hasil pengenalan wajah terakhir
                    latest_dist, latest_name, latest_is_match = facenet_worker.get_results()
                    eval_dist = float(latest_dist) if latest_dist is not None else 1.50

                    fusion_text = evaluate_active_trial(eval_dist, is_challenge_passed, threshold_dist=FACE_MATCH_THRESHOLD)

                    if "ACCEPT" in fusion_text and latest_is_match:
                        final_decision = "ACCEPT"
                        final_reason = f"Valid (Bona-Fide Challenge '{active_challenge_name}' Lolos + Wajah Cocok)"
                    else:
                        final_decision = "REJECT"
                        if not is_challenge_passed:
                            if active_challenge_status == "REJECT_WRONG_ACTION":
                                final_reason = f"SPOOF Terdeteksi: Aksi Salah (Wrong Action) untuk '{active_challenge_name}'"
                            elif active_challenge_status == "REJECT_TIMEOUT":
                                final_reason = "SPOOF Terdeteksi: Waktu Respons Habis > 4s (Foto Statis / Replay Video)"
                            else:
                                final_reason = f"SPOOF Terdeteksi: Tantangan '{active_challenge_name}' Gagal Terpenuhi"
                        else:
                            final_reason = f"Identitas Tidak Dikenali (Jarak: {eval_dist:.2f} > {FACE_MATCH_THRESHOLD:.2f})"

                    # Evaluasi Serentak 3 Skenario Bab 5 & Perekaman CSV
                    eval_ear = float(session_min_ear) if session_min_ear < 100.0 else (float(latest_ear) if latest_ear is not None else 0.28)
                    eval_mar = float(session_max_mar) if session_max_mar > 0.0 else (float(latest_mar) if latest_mar is not None else 0.05)

                    try:
                        from evaluation_bab5 import evaluate_trial, log_to_csv, read_live_environment_sensors
                        s1_res, s2_res, s3_res = evaluate_trial(eval_dist, eval_ear, eval_mar)

                        sensor_dist, sensor_lux = read_live_environment_sensors()
                        cur_jarak = jarak if jarak is not None else sensor_dist
                        cur_lux = lux if lux is not None else sensor_lux
                        cur_label = label_aktual
                        cur_pid = latest_name if (latest_name and latest_name != "Unknown") else participant_id

                        log_to_csv(
                            participant_id=cur_pid,
                            jarak=cur_jarak,
                            lux=cur_lux,
                            label_aktual=cur_label,
                            euclidean_dist=eval_dist,
                            ear=eval_ear,
                            mar=eval_mar,
                            s1=s1_res,
                            s2=s2_res,
                            s3=s3_res,
                            filename=csv_path
                        )
                        bab5_status_str = f"S1={s1_res} | S2={s2_res} | S3={s3_res}"
                    except Exception as e:
                        bab5_status_str = f"Error: {e}"

                    print(f"\n=======================================================")
                    print(f"[HASIL AKHIR DETIK KE-{TIME_WINDOW_SEC:.0f} (FUSI)]: {final_decision}")
                    print(f"Sumber Input       : {source_label}")
                    print(f"Tantangan Acak     : {active_challenge_name} -> {active_challenge_status}")
                    print(f"Subjek Dikenali    : {latest_name}")
                    print(f"Jarak FaceNet      : {latest_dist}")
                    print(f"Status PAD Liveness: {final_pad_status}")
                    print(f"Evaluasi Bab 5     : {bab5_status_str}")
                    print(f"File CSV Bab 5     : {csv_path}")
                    print(f"Alasan             : {final_reason}")
                    print(f"=======================================================\n")

            # -------------------------------------------------------------
            # D. RENDERING UI & OVERLAY KORNER RESPONSIVE (HUD)
            # -------------------------------------------------------------
            # Gambar Reticle Bounding Box
            reticle_col = (0, 255, 128) if current_state == STATE_EVALUATING else (0, 200, 255)
            draw_face_reticle(frame, bbox, reticle_col, scale=ui_scale)

            # Panel HUD Kiri Atas Responsif
            hud_w = max(260, int(330 * ui_scale))
            hud_h = max(170, int(210 * ui_scale))
            margin_x = int(14 * ui_scale)
            margin_y = int(14 * ui_scale)
            draw_glass_card(frame, margin_x, margin_y, hud_w, hud_h, alpha=0.78, color=(15, 20, 35))

            # Header Status
            if current_state == STATE_IDLE:
                status_hdr = "[SIAP] TEKAN SPASI UNTUK MULAI"
                hdr_col = (0, 220, 255)
            else:
                status_hdr = f"[EVALUASI AKTIF] {elapsed_eval_time:.1f}s / {TIME_WINDOW_SEC:.1f}s"
                hdr_col = (0, 255, 128)

            f_hud_hdr = max(0.38, 0.44 * ui_scale)
            f_hud_body = max(0.34, 0.39 * ui_scale)
            hud_pad_x = margin_x + int(10 * ui_scale)
            hud_cur_y = margin_y + int(20 * ui_scale)
            hud_step = int(18 * ui_scale)

            cv2.putText(frame, status_hdr, (hud_pad_x, hud_cur_y), cv2.FONT_HERSHEY_DUPLEX, f_hud_hdr, hdr_col, 1, cv2.LINE_AA)

            # Bar Progress Waktu (0.0s s.d 8.0s)
            hud_cur_y += int(8 * ui_scale)
            bar_x, bar_y, bar_w, bar_h = hud_pad_x, hud_cur_y, hud_w - int(20 * ui_scale), max(4, int(5 * ui_scale))
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (60, 60, 80), -1)
            if current_state == STATE_EVALUATING:
                fill_w = int(bar_w * min(1.0, elapsed_eval_time / TIME_WINDOW_SEC))
                cv2.rectangle(frame, (bar_x, bar_y), (bar_x + fill_w, bar_y + bar_h), (0, 230, 115), -1)

            # Sumber Input Label
            hud_cur_y += int(18 * ui_scale)
            cv2.putText(frame, f"Sumber: {source_label[:30]}", (hud_pad_x, hud_cur_y), cv2.FONT_HERSHEY_SIMPLEX, f_hud_body, (180, 220, 255), 1, cv2.LINE_AA)

            # Metrik EAR & MAR
            hud_cur_y += hud_step
            ear_txt = f"EAR : {latest_ear:.3f} (Ambang: < {EAR_THRESHOLD:.2f})" if latest_ear is not None else "EAR : --"
            cv2.putText(frame, ear_txt, (hud_pad_x, hud_cur_y), cv2.FONT_HERSHEY_SIMPLEX, f_hud_body, (230, 230, 230), 1, cv2.LINE_AA)

            hud_cur_y += hud_step
            mar_txt = f"MAR : {latest_mar:.3f} (Ambang: >= {MAR_THRESHOLD:.2f})" if latest_mar is not None else "MAR : --"
            cv2.putText(frame, mar_txt, (hud_pad_x, hud_cur_y), cv2.FONT_HERSHEY_SIMPLEX, f_hud_body, (230, 230, 230), 1, cv2.LINE_AA)

            # Total Kedipan & Mulut
            hud_cur_y += hud_step
            cv2.putText(frame, f"Total Kedipan     : {total_blinks} kali", (hud_pad_x, hud_cur_y), cv2.FONT_HERSHEY_SIMPLEX, f_hud_body,
                        (0, 255, 128) if total_blinks > 0 else (200, 200, 200), 1, cv2.LINE_AA)

            hud_cur_y += hud_step
            cv2.putText(frame, f"Total Mulut Aktif : {total_mouth_active} kali", (hud_pad_x, hud_cur_y), cv2.FONT_HERSHEY_SIMPLEX, f_hud_body,
                        (0, 255, 128) if total_mouth_active > 0 else (200, 200, 200), 1, cv2.LINE_AA)

            # FaceNet Match Info
            hud_cur_y += hud_step
            dist_disp = f"{latest_dist:.3f}" if latest_dist is not None else "--"
            cv2.putText(frame, f"Jarak FaceNet     : {dist_disp} (Match <= {FACE_MATCH_THRESHOLD:.2f})", (hud_pad_x, hud_cur_y),
                        cv2.FONT_HERSHEY_SIMPLEX, f_hud_body, (0, 255, 255) if latest_is_match else (200, 200, 200), 1, cv2.LINE_AA)

            hud_cur_y += hud_step
            cv2.putText(frame, f"Subjek            : {latest_name}", (hud_pad_x, hud_cur_y),
                        cv2.FONT_HERSHEY_SIMPLEX, f_hud_body, (0, 255, 128) if latest_is_match else (150, 150, 255), 1, cv2.LINE_AA)

            # Banner Tantangan Challenge-Response EMAR Aktif di Atas Layar
            if current_state == STATE_EVALUATING:
                ch_w = min(int(w_img * 0.86), int(580 * ui_scale))
                ch_h = max(52, int(64 * ui_scale))
                ch_x = (w_img - ch_w) // 2
                ch_y = margin_y

                if elapsed_eval_time < 1.0:
                    # Fase 1: Deteksi Awal (T=0s)
                    draw_glass_card(frame, ch_x, ch_y, ch_w, ch_h, alpha=0.85, color=(20, 25, 45))
                    cv2.rectangle(frame, (ch_x, ch_y), (ch_x + ch_w, ch_y + ch_h), (0, 200, 255), max(1, int(2 * ui_scale)), cv2.LINE_AA)
                    cv2.putText(frame, "FASE 1: DETEKSI AWAL (MATA MELEK, MULUT DIAM)",
                                (ch_x + int(14 * ui_scale), ch_y + int(26 * ui_scale)),
                                cv2.FONT_HERSHEY_DUPLEX, max(0.38, 0.44 * ui_scale), (0, 230, 255), 1, cv2.LINE_AA)
                    cv2.putText(frame, "Menstabilkan baseline wajah sebelum tantangan acak...",
                                (ch_x + int(14 * ui_scale), ch_y + int(48 * ui_scale)),
                                cv2.FONT_HERSHEY_SIMPLEX, max(0.32, 0.38 * ui_scale), (200, 200, 200), 1, cv2.LINE_AA)
                else:
                    # Fase 2 & 3: Random Challenge & Jendela Observasi (T=1s s.d T=5s)
                    if active_challenge_status == "PASS_LIVENESS":
                        card_col = (10, 45, 20)
                        edge_col = (0, 230, 115)
                        status_label = "[BERHASIL] AKSI SESUAI & VALID (BONA FIDE)"
                        label_col = (0, 255, 128)
                    elif active_challenge_status == "REJECT_WRONG_ACTION":
                        card_col = (15, 15, 45)
                        edge_col = (0, 40, 240)
                        status_label = "[DITOLAK] AKSI SALAH (WRONG ACTION DETECTED)!"
                        label_col = (50, 80, 255)
                    elif active_challenge_status == "REJECT_TIMEOUT":
                        card_col = (15, 15, 45)
                        edge_col = (0, 40, 240)
                        status_label = "[DITOLAK] WAKTU HABIS (TIMEOUT > 4.0s)"
                        label_col = (50, 80, 255)
                    else:
                        card_col = (25, 30, 15)
                        edge_col = (0, 220, 255)
                        status_label = "MENUNGGU RESPONS ANDA (TIMEOUT 4.0s)..."
                        label_col = (0, 230, 255)

                    draw_glass_card(frame, ch_x, ch_y, ch_w, ch_h, alpha=0.88, color=card_col)
                    cv2.rectangle(frame, (ch_x, ch_y), (ch_x + ch_w, ch_y + ch_h), edge_col, max(1, int(2 * ui_scale)), cv2.LINE_AA)
                    cv2.putText(frame, active_prompt_text,
                                (ch_x + int(14 * ui_scale), ch_y + int(26 * ui_scale)),
                                cv2.FONT_HERSHEY_DUPLEX, max(0.40, 0.48 * ui_scale), (255, 255, 255), 1, cv2.LINE_AA)
                    cv2.putText(frame, status_label,
                                (ch_x + int(14 * ui_scale), ch_y + int(48 * ui_scale)),
                                cv2.FONT_HERSHEY_SIMPLEX, max(0.34, 0.40 * ui_scale), label_col, 1, cv2.LINE_AA)

            # Bottom Bar Petunjuk Responsif
            f_bot = max(0.36, 0.40 * ui_scale)
            cv2.putText(frame, f"FPS: {current_fps:.1f} | [SPASI] Mulai ({TIME_WINDOW_SEC:.0f}s) | [V] Video/Cam | [C] Ganti Cam | [R] Reset | [Q] Keluar",
                        (margin_x, h_img - int(12 * ui_scale)), cv2.FONT_HERSHEY_SIMPLEX, f_bot, (255, 255, 255), 1, cv2.LINE_AA)

            cv2.imshow(win_name, frame)

            # -------------------------------------------------------------
            # E. PENANGANAN INPUT KEYBOARD
            # -------------------------------------------------------------
            key = cv2.waitKey(1) & 0xFF
            if key == ord(' ') and current_state == STATE_IDLE:
                current_state = STATE_EVALUATING
                start_eval_time = time.time()
                elapsed_eval_time = 0.0
                ear_consec_counter = 0
                total_blinks = 0
                total_mouth_active = 0
                mouth_is_open = False
                session_min_ear = 999.0
                session_max_mar = 0.0
                s1_res = 0
                s2_res = 0
                s3_res = 0
                active_liveness = ActiveLivenessEMAR(timeout_seconds=4.0)
                challenge_generated = False
                active_challenge_name = None
                active_prompt_text = ""
                active_challenge_status = "WAITING_FOR_ACTION"
                facenet_worker.reset()
                print(f"\n[INFO] >>> SESI PENGUJIAN {TIME_WINDOW_SEC:.1f} DETIK EMAR AKTIF DIMULAI ({source_label}) <<<")
            elif key == ord('v') or key == ord('V'):
                if available_videos:
                    current_video_idx = (current_video_idx + 1)
                    if current_video_idx >= len(available_videos):
                        current_video_idx = -1
                    cap.release()
                    cap, source_label = open_current_source()
                    current_state = STATE_IDLE
                    ear_consec_counter = 0
                    total_blinks = 0
                    total_mouth_active = 0
                    mouth_is_open = False
                    session_min_ear = 999.0
                    session_max_mar = 0.0
                    s1_res = 0
                    s2_res = 0
                    s3_res = 0
                    latest_ear = None
                    latest_mar = None
                    active_liveness = ActiveLivenessEMAR(timeout_seconds=4.0)
                    challenge_generated = False
                    active_challenge_name = None
                    active_prompt_text = ""
                    active_challenge_status = "WAITING_FOR_ACTION"
                    facenet_worker.reset()
            elif key == ord('c') or key == ord('C'):
                # Ganti indeks kamera fisik
                current_video_idx = -1
                current_cam_idx = (current_cam_idx + 1) % 4
                cap.release()
                cap, source_label = open_current_source()
                current_state = STATE_IDLE
                ear_consec_counter = 0
                total_blinks = 0
                total_mouth_active = 0
                mouth_is_open = False
                session_min_ear = 999.0
                session_max_mar = 0.0
                s1_res = 0
                s2_res = 0
                s3_res = 0
                latest_ear = None
                latest_mar = None
                active_liveness = ActiveLivenessEMAR(timeout_seconds=4.0)
                challenge_generated = False
                active_challenge_name = None
                active_prompt_text = ""
                active_challenge_status = "WAITING_FOR_ACTION"
                facenet_worker.reset()
            elif key == ord('l') or key == ord('L'):
                print("\n[DAFTAR VIDEO DI DATASET/VIDEO_SINGKAT]:")
                for i, v in enumerate(available_videos, start=1):
                    prefix = "--> " if (i - 1) == current_video_idx else "    "
                    print(f"{prefix}[{i:02d}] {v.name}")
                print(f"    [00] Webcam Fisik (Cam {current_cam_idx})\n")
            elif key == ord('r') or key == ord('R'):
                current_state = STATE_IDLE
                ear_consec_counter = 0
                total_blinks = 0
                total_mouth_active = 0
                mouth_is_open = False
                session_min_ear = 999.0
                session_max_mar = 0.0
                s1_res = 0
                s2_res = 0
                s3_res = 0
                latest_ear = None
                latest_mar = None
                active_liveness = ActiveLivenessEMAR(timeout_seconds=4.0)
                challenge_generated = False
                active_challenge_name = None
                active_prompt_text = ""
                active_challenge_status = "WAITING_FOR_ACTION"
                facenet_worker.reset()
                if current_video_idx >= 0:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                print("[INFO] Status liveness & timer di-reset.")
            elif key == ord('q') or key == ord('Q') or key == 27:
                break

    finally:
        facenet_worker.stop()
        if cap is not None:
            cap.release()
        cv2.destroyAllWindows()
        print("[INFO] Aplikasi live_inference_pad ditutup dengan aman.")


# =============================================================================
# ENTRY POINT
# =============================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live Inference PAD: FaceNet + EMAR Presentation Attack Detection")
    parser.add_argument("--cam", type=int, default=1, help="Index webcam fisik laptop (default: 1)")
    parser.add_argument("--video", type=str, default=None, help="Nama file video di dataset/video_singkat atau path video kustom")
    parser.add_argument("--list-videos", action="store_true", help="Tampilkan daftar semua video di dataset/video_singkat lalu keluar")
    parser.add_argument("--db", type=str, default=None, help="Path ke DATABASE_IDENTITAS_MASTER.pkl")
    parser.add_argument("--predictor", type=str, default=None, help="Path ke shape_predictor_68_face_landmarks.dat")
    parser.add_argument("--participant", type=str, default="P01", help="ID Partisipan pengujian Bab 5 (default: P01)")
    parser.add_argument("--jarak", type=float, default=None, help="Jarak kamera ke subjek dalam cm (default: auto-detect)")
    parser.add_argument("--lux", type=float, default=None, help="Intensitas pencahayaan ruangan lux (default: auto-detect)")
    parser.add_argument("--label", type=str, default="Bona_Fide",
                        choices=["Bona_Fide", "Print_Attack", "Screen_Attack", "Replay_Video"],
                        help="Label aktual ground truth sampel pengujian (default: Bona_Fide)")
    parser.add_argument("--csv", type=str, default="Dataset_Eksperimen_Bab5.csv", help="Path file CSV data logger Bab 5")
    args = parser.parse_args()

    if args.list_videos:
        videos = get_available_dataset_videos()
        print(f"\n[DAFTAR VIDEO DI DATASET ({DATASET_VIDEO_DIR})]:")
        print(f"Total: {len(videos)} file")
        for i, v in enumerate(videos, start=1):
            print(f" [{i:02d}] {v.name}")
        sys.exit(0)

    run_live_inference(
        cam_index=args.cam,
        video_path=args.video,
        db_path=args.db,
        predictor_path=args.predictor,
        participant_id=args.participant,
        jarak=args.jarak,
        lux=args.lux,
        label_aktual=args.label,
        csv_path=args.csv
    )