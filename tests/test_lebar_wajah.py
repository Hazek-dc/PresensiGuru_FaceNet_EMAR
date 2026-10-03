"""
Rasio lebar wajah untuk kalibrasi jarak kamera: lebar rahang (landmark dlib 0
dan 16) dibagi lebar frame. Nilai ini hanya dicatat; keputusan S1/S2/S3 tidak
memakainya, dan wajah yang tidak terdeteksi memberi null, bukan angka taksiran.
"""

import glob
import math
import sys
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


@pytest.fixture(scope="module")
def emar(fes):
    pytest.importorskip("dlib")
    if not (ROOT / "models" / "shape_predictor_68_face_landmarks.dat").exists() and \
            not (ROOT / "shape_predictor_68_face_landmarks.dat").exists():
        pytest.skip("model landmark dlib tidak ada")
    return fes.EMARModule()


@pytest.fixture(scope="module")
def photo():
    cv2 = pytest.importorskip("cv2")
    photos = sorted(glob.glob(str(ROOT / "dataset" / "foto_selfie" / "*Reynaldi*")))
    if not photos:
        pytest.skip("foto contoh tidak ada")
    img = cv2.imread(photos[0], cv2.IMREAD_REDUCED_COLOR_4)  # foto asli ~60 MB setelah didekode
    h, w = img.shape[:2]
    s = 480 / max(h, w)
    return cv2.resize(img, (int(w * s), int(h * s)))


def _jaw_px(m):
    p0, p16 = m.landmarks.part(0), m.landmarks.part(16)
    return math.hypot(p0.x - p16.x, p0.y - p16.y)


def test_rasio_sama_dengan_lebar_rahang_dibagi_lebar_frame(fes, emar, photo):
    m = emar.measure(photo)
    assert m is not None, "wajah contoh harus terdeteksi"
    assert m.face_width_px == pytest.approx(_jaw_px(m), rel=1e-5)
    assert m.frame_width == photo.shape[1]
    ratio = fes.face_width_ratio(m)
    assert ratio == pytest.approx(_jaw_px(m) / photo.shape[1], rel=1e-5)
    assert 0 < ratio < 1


def test_kanvas_dua_kali_lebih_lebar_memberi_rasio_setengah(fes, emar, photo):
    """Wajah yang sama berukuran px sama; rasio turun karena frame dua kali lebih lebar."""
    h, w = photo.shape[:2]
    canvas = np.zeros((h, 2 * w, 3), np.uint8)
    canvas[:, w // 2: w // 2 + w] = photo
    narrow, wide = emar.measure(photo), emar.measure(canvas)
    assert narrow is not None and wide is not None
    assert wide.frame_width == 2 * w
    assert wide.face_width_px == pytest.approx(narrow.face_width_px, rel=0.05)
    assert fes.face_width_ratio(wide) == pytest.approx(fes.face_width_ratio(narrow) / 2, rel=0.05)


def test_tanpa_wajah_rasio_null(fes, emar):
    frames = [np.full((240, 320, 3), v, np.uint8) for v in (0, 90, 200)]
    out = fes.measure_face_width(emar, frames)
    assert out == {"face_width_ratio": None, "n_frames": 3, "n_frames_with_face": 0,
                   "frame_width": 320, "frame_height": 240}


def test_rasio_pengukuran_tanpa_lebar_adalah_null(fes):
    assert fes.face_width_ratio(None) is None
    assert fes.face_width_ratio(np.zeros((4, 4, 3))) is None       # stub lama mengembalikan frame
    assert fes.face_width_ratio(fes.FrameMeasurement(None, 0.3, 0.3, 0.0)) is None
    assert fes.face_width_ratio(fes.FrameMeasurement(None, 0.3, 0.3, 0.0, 0.0, 640)) is None


class _StubEmar:
    """measure() membaca lebar rahang dari nilai piksel [0,0,0] frame; 0 berarti tanpa wajah."""

    def __init__(self, fes):
        self._fes = fes

    def measure(self, frame):
        px = float(frame[0, 0, 0])
        if px == 0:
            return None
        return self._fes.FrameMeasurement(None, 0.3, 0.3, 0.0, px, int(frame.shape[1]))


@pytest.fixture
def stub_emar(fes):
    return _StubEmar(fes)


def _frame(px, w=640, h=480):
    f = np.zeros((h, w, 3), np.uint8)
    f[0, 0, 0] = px
    return f


def test_median_dibulatkan_lima_desimal_dan_frame_tanpa_wajah_diabaikan(fes, stub_emar):
    frames = [_frame(100), _frame(0), _frame(111), _frame(130), _frame(0)]
    out = fes.measure_face_width(stub_emar, frames)
    assert out["face_width_ratio"] == round(111 / 640, 5)
    assert out["n_frames"] == 5
    assert out["n_frames_with_face"] == 3
    assert (out["frame_width"], out["frame_height"]) == (640, 480)


def test_menerima_sistem_atau_modul_emar(fes, stub_emar):
    system = type("S", (), {"emar": stub_emar})()
    frames = [_frame(64), _frame(64)]
    assert fes.measure_face_width(system, frames)["face_width_ratio"] == 0.1


def test_ukuran_frame_campuran_tidak_dilaporkan(fes, stub_emar):
    """Rasio tetap sah lintas resolusi, tetapi tidak ada satu ukuran frame yang benar."""
    out = fes.measure_face_width(stub_emar, [_frame(64, 640, 480), _frame(192, 1920, 1080)])
    assert out["face_width_ratio"] == 0.1
    assert out["frame_width"] is None and out["frame_height"] is None


def test_verifikasi_video_tidak_mengubah_keputusan(fes, stub_emar, tmp_path):
    """Rasio lebar wajah ikut respons /verify tanpa menyentuh field keputusan."""
    cv2 = pytest.importorskip("cv2")
    video = tmp_path / "lebar.avi"
    vw = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (320, 240))
    for _ in range(20):
        vw.write(np.full((240, 320, 3), 64, np.uint8))
    vw.release()

    pushed = []

    class Emar(_StubEmar):
        def reset_temporal(self):
            pass

        def push_measurement(self, m, timestamp=None):
            pushed.append(m)
            return fes.EMARResult(emar_score=1.0, is_live=True, landmark_count=68,
                                  blink_cycles=1, mouth_cycles=1)

    emar = Emar(fes)

    class FaceNet:
        gallery = {"S01": {"embedding": np.zeros(4)}}
        resolve_id = fes.FaceNetModule.resolve_id

        def refresh_gallery(self):
            pass

        def verify(self, frame, claimed_id):
            return fes.FaceNetResult(embedding=np.zeros(4), distance=0.30, claimed_id=claimed_id,
                                     is_verified=True, s_embed=1 - 0.30 / fes.D_REF)

    system = type("S", (), {})()
    system.emar, system.facenet = emar, FaceNet()
    body = fes.verify_video_file(system, str(video), "S01")

    # MJPG sedikit menggeser nilai piksel, jadi pembanding memakai frame hasil dekode.
    decoded = list(fes._iter_video_frames(str(video)))
    expected = round(float(np.median([f[0, 0, 0] / 320 for f in decoded])), 5)
    assert len(pushed) == 20 and all(m is not None for m in pushed)
    assert body["face_width_ratio"] == expected
    assert body["face_width_frames"] == 20
    assert (body["frame_width"], body["frame_height"]) == (320, 240)
    assert body["status"] == "success"
    assert body["distance"] == pytest.approx(0.30)
    assert body["liveness_passed"] is True
