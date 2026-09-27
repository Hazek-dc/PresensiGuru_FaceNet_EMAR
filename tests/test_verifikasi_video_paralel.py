"""
Verifikasi video presensi dipercepat dengan EMAR paralel dan pembacaan frame
bertahap. Percepatan ini tidak boleh mengubah angka: EAR/MAR, siklus kedip dan
mulut, serta frame kandidat FaceNet harus sama dengan pemrosesan berurutan.
"""

import glob
import random
import sys
import threading
import time
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="module")
def fes():
    pytest.importorskip("torch")
    import facenet_emar_system
    return facenet_emar_system


def test_urutan_hasil_paralel_sama_dengan_urutan_input(fes):
    rng = random.Random(7)
    delays = [rng.uniform(0, 0.01) for _ in range(60)]

    def work(i):
        time.sleep(delays[i])
        return i * i

    out = list(fes._ordered_parallel_map(work, range(60), workers=6, max_in_flight=12))
    assert out == [i * i for i in range(60)]


def test_jumlah_frame_tertunda_dibatasi(fes):
    """Frame 1080p ~6 MB; tanpa batas, seluruh video menumpuk di memori."""
    lock = threading.Lock()
    state = {"pulled": 0, "done": 0, "max_gap": 0}

    def items():
        for i in range(100):
            with lock:
                state["pulled"] += 1
                state["max_gap"] = max(state["max_gap"], state["pulled"] - state["done"])
            yield i

    for _ in fes._ordered_parallel_map(lambda i: i, items(), workers=4, max_in_flight=8):
        with lock:
            state["done"] += 1
    assert state["max_gap"] <= 8


def _write_video(path, frames, fps=10.0):
    import cv2
    h, w = frames[0].shape[:2]
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    for f in frames:
        vw.write(f)
    vw.release()


def _stub_system(fes, emar, seen_frames):
    class StubFaceNet:
        gallery = {"S01": {"embedding": np.zeros(4)}}
        resolve_id = fes.FaceNetModule.resolve_id

        def refresh_gallery(self):
            pass

        def verify(self, frame, claimed_id):
            seen_frames.append(frame)
            return fes.FaceNetResult(embedding=np.zeros(4), distance=0.5, claimed_id=claimed_id,
                                     is_verified=False, s_embed=0.0)

    system = type("Stub", (), {})()
    system.emar, system.facenet = emar, StubFaceNet()
    return system


def test_frame_kandidat_facenet_sama_dengan_indeks_rasio(fes, tmp_path):
    """Pembacaan kedua harus mengambil frame ke-int(n*r), bukan frame lain."""
    pytest.importorskip("cv2")
    n = 50
    frames = [np.full((48, 64, 3), 4 * i, np.uint8) for i in range(n)]
    video = tmp_path / "indeks.avi"
    _write_video(video, frames)

    class StubEmar:
        def reset_temporal(self):
            pass

        def measure(self, frame):
            return None

        def push_measurement(self, m, timestamp=None):
            return fes.EMARResult()

    seen = []
    body = fes.verify_video_file(_stub_system(fes, StubEmar(), seen), str(video), "S01")
    got = [int(round(float(f.mean()) / 4)) for f in seen]
    ratios = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90]
    assert got == [int(n * r) for r in ratios]
    assert body["video_seconds"] == pytest.approx(5.0)


@pytest.fixture(scope="module")
def emar_module(fes):
    pytest.importorskip("dlib")
    if not (ROOT / "models" / "shape_predictor_68_face_landmarks.dat").exists() and \
            not (ROOT / "shape_predictor_68_face_landmarks.dat").exists():
        pytest.skip("model landmark dlib tidak ada")
    return fes.EMARModule()


@pytest.fixture(scope="module")
def face_video(tmp_path_factory):
    cv2 = pytest.importorskip("cv2")
    photos = sorted(glob.glob(str(ROOT / "dataset" / "foto_selfie" / "*Reynaldi*")))
    if not photos:
        pytest.skip("foto contoh tidak ada")
    img = cv2.imread(photos[0], cv2.IMREAD_REDUCED_COLOR_4)  # foto asli ~60 MB setelah didekode
    h, w = img.shape[:2]
    s = 480 / max(h, w)
    img = cv2.resize(img, (int(w * s), int(h * s)))
    frames = []
    for i in range(36):  # geser dan skala berbeda agar landmark tiap frame berbeda
        k = 1.0 + 0.01 * (i % 6)
        m = np.float32([[k, 0, (i % 7) - 3], [0, k, (i % 5) - 2]])
        frames.append(cv2.warpAffine(img, m, (img.shape[1], img.shape[0])))
    path = tmp_path_factory.mktemp("video") / "wajah.avi"
    _write_video(path, frames, fps=12.0)
    return path


def test_emar_paralel_identik_dengan_berurutan(fes, emar_module, face_video):
    decoded = list(fes._iter_video_frames(str(face_video)))
    seq = [emar_module.measure(f) for f in decoded]
    par = list(fes._ordered_parallel_map(emar_module.measure, decoded, workers=6, max_in_flight=12))
    assert sum(m is not None for m in seq) >= len(seq) // 2, "wajah contoh harus terdeteksi"
    for a, b in zip(seq, par):
        assert (a is None) == (b is None)
        if a is not None:
            assert (a.ear_left, a.ear_right, a.mar) == (b.ear_left, b.ear_right, b.mar)
            assert [(p.x, p.y) for p in a.landmarks.parts()] == [(p.x, p.y) for p in b.landmarks.parts()]


def test_hasil_verifikasi_sama_dengan_process_frame_berurutan(fes, emar_module, face_video):
    decoded = list(fes._iter_video_frames(str(face_video)))
    emar_module.reset_temporal()
    ref = fes.EMARResult()
    for i, f in enumerate(decoded):
        r = emar_module.process_frame(f, timestamp=i / 12.0)
        if r.landmark_count > 0:
            ref = r

    body = fes.verify_video_file(_stub_system(fes, emar_module, []), str(face_video), "S01")
    assert body["emar_score"] == ref.emar_score
    assert body["blink_cycles"] == ref.blink_cycles
    assert body["mouth_cycles"] == ref.mouth_cycles
    assert body["liveness_passed"] == ref.is_live
    assert body["video_seconds"] == pytest.approx(len(decoded) / 12.0, abs=1e-3)
