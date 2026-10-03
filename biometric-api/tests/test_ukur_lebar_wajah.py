"""
POST /measure/face-width untuk kalibrasi jarak kamera.

Endpoint hanya mengukur: tidak menyentuh galeri (FaceNet stub di sini gagal
bila diakses) dan tidak menyimpan apa pun. Wajah yang tidak terdeteksi memberi
face_width_ratio null, bukan angka taksiran.
"""

import glob
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(ROOT))

pytest.importorskip("torch")
cv2 = pytest.importorskip("cv2")
pytest.importorskip("dlib")
PHOTOS = sorted(glob.glob(str(ROOT / "dataset" / "foto_selfie" / "*Reynaldi*")))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from routers import attendance, measure  # noqa: E402


class _NoGallery:
    def __getattr__(self, name):
        raise AssertionError(f"/measure/face-width tidak boleh menyentuh FaceNet/galeri ({name})")


@pytest.fixture(scope="module")
def fes():
    import facenet_emar_system
    return facenet_emar_system


@pytest.fixture(scope="module")
def emar(fes):
    if not (ROOT / "models" / "shape_predictor_68_face_landmarks.dat").exists() and \
            not (ROOT / "shape_predictor_68_face_landmarks.dat").exists():
        pytest.skip("model landmark dlib tidak ada")
    return fes.EMARModule()


@pytest.fixture
def client(emar, monkeypatch):
    system = type("S", (), {})()
    system.emar, system.facenet = emar, _NoGallery()
    monkeypatch.setattr(measure, "get_engine", lambda: (system, None))
    app = FastAPI()
    app.include_router(measure.router)
    app.include_router(measure.router, prefix="/api")
    return TestClient(app)


@pytest.fixture(scope="module")
def photo():
    if not PHOTOS:
        pytest.skip("foto contoh tidak ada")
    img = cv2.imread(PHOTOS[0], cv2.IMREAD_REDUCED_COLOR_4)  # foto asli ~60 MB setelah didekode
    h, w = img.shape[:2]
    s = 480 / max(h, w)
    return cv2.resize(img, (int(w * s), int(h * s)))


def _jpeg(img):
    return cv2.imencode(".jpg", img)[1].tobytes()


def _files(images):
    return [("files[]", (f"f{i}.jpg", _jpeg(img), "image/jpeg")) for i, img in enumerate(images)]


def _expected(fes, emar, images):
    """Rasio yang diharapkan dihitung dari JPEG yang sudah didekode, seperti di server."""
    decoded = [cv2.imdecode(np.frombuffer(_jpeg(img), np.uint8), cv2.IMREAD_COLOR) for img in images]
    ratios = [fes.face_width_ratio(emar.measure(img)) for img in decoded]
    ratios = [r for r in ratios if r is not None]
    return round(float(np.median(ratios)), 5), len(ratios)


def _video(tmp_path, frames, fps=10.0):
    path = tmp_path / "kalibrasi.avi"
    h, w = frames[0].shape[:2]
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    for f in frames:
        vw.write(f)
    vw.release()
    return path


def _shifted(photo, n):
    """Geser sedikit per frame agar landmark tiap frame tidak identik."""
    h, w = photo.shape[:2]
    out = []
    for i in range(n):
        m = np.float32([[1, 0, (i % 5) - 2], [0, 1, (i % 3) - 1]])
        out.append(cv2.warpAffine(photo, m, (w, h)))
    return out


@pytest.mark.parametrize("path", ["/measure/face-width", "/api/measure/face-width"])
def test_gambar_memberi_median_rasio_lebar_wajah(client, fes, emar, photo, path):
    images = _shifted(photo, 3)
    r = client.post(path, files=_files(images))
    assert r.status_code == 200, r.text
    body = r.json()
    ratio, n_face = _expected(fes, emar, images)
    assert body["success"] is True
    assert body["face_width_ratio"] == ratio
    assert 0 < body["face_width_ratio"] < 1
    assert body["n_frames"] == 3 and body["n_frames_with_face"] == n_face == 3
    assert (body["frame_width"], body["frame_height"]) == (photo.shape[1], photo.shape[0])


def test_video_mjpg_pendek(client, fes, emar, photo, tmp_path):
    frames = _shifted(photo, 8)
    video = _video(tmp_path, frames)
    with open(video, "rb") as f:
        r = client.post("/measure/face-width", files={"video": ("kalibrasi.avi", f, "video/x-msvideo")})
    assert r.status_code == 200, r.text
    body = r.json()

    decoded = list(fes._iter_video_frames(str(video)))
    ratios = [fes.face_width_ratio(emar.measure(fr)) for fr in decoded]
    ratios = [x for x in ratios if x is not None]
    assert body["n_frames"] == len(decoded) == 8
    assert body["n_frames_with_face"] == len(ratios) > 0
    assert body["face_width_ratio"] == round(float(np.median(ratios)), 5)
    # MJPG membulatkan lebar ganjil ke genap, jadi pembandingnya frame hasil dekode.
    assert (body["frame_height"], body["frame_width"]) == decoded[0].shape[:2]
    # Frame video yang sama dengan gambar memberi rasio yang hampir sama.
    image_ratio, _ = _expected(fes, emar, frames[:3])
    assert body["face_width_ratio"] == pytest.approx(image_ratio, rel=0.03)


def test_gambar_dan_video_digabung(client, photo, tmp_path):
    video = _video(tmp_path, _shifted(photo, 4))
    with open(video, "rb") as f:
        r = client.post("/measure/face-width",
                        files=_files(_shifted(photo, 2)) + [("video", ("v.avi", f, "video/x-msvideo"))])
    assert r.status_code == 200, r.text
    assert r.json()["n_frames"] == 6


def test_tanpa_wajah_rasio_null(client):
    blank = [np.full((240, 320, 3), v, np.uint8) for v in (20, 128, 230)]
    r = client.post("/measure/face-width", files=_files(blank))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["face_width_ratio"] is None
    assert body["n_frames"] == 3 and body["n_frames_with_face"] == 0
    assert (body["frame_width"], body["frame_height"]) == (320, 240)


def test_berkas_tidak_dapat_didekode_menjadi_400(client):
    r = client.post("/measure/face-width", files=[("files[]", ("x.jpg", b"bukan-gambar", "image/jpeg"))])
    assert r.status_code == 400
    assert r.json()["error"] == "NO_DECODABLE_FRAME"


def test_video_rusak_tanpa_gambar_menjadi_400(client):
    r = client.post("/measure/face-width", files={"video": ("x.webm", b"bukan-video", "video/webm")})
    assert r.status_code == 400
    assert r.json()["error"] == "NO_DECODABLE_FRAME"


def test_tanpa_berkas_menjadi_400(client):
    r = client.post("/measure/face-width", data={"camera_label": "EYESEC"})
    assert r.status_code == 400
    assert r.json()["error"] == "NO_FILES"


def test_lebih_dari_30_gambar_menjadi_400(client):
    tiny = _jpeg(np.zeros((8, 8, 3), np.uint8))
    files = [("files[]", (f"f{i}.jpg", tiny, "image/jpeg")) for i in range(31)]
    r = client.post("/measure/face-width", files=files)
    assert r.status_code == 400
    assert r.json()["error"] == "TOO_MANY_FILES"


def test_berkas_video_sementara_dihapus(client, photo, tmp_path, monkeypatch):
    import tempfile
    made = []
    real_mkstemp = tempfile.mkstemp

    def spy(*a, **kw):
        fd, path = real_mkstemp(*a, dir=str(tmp_path), **kw)
        made.append(path)
        return fd, path

    monkeypatch.setattr(measure.tempfile, "mkstemp", spy)
    video = _video(tmp_path, _shifted(photo, 3))
    with open(video, "rb") as f:
        assert client.post("/measure/face-width",
                           files={"video": ("v.avi", f, "video/x-msvideo")}).status_code == 200
    assert made and not Path(made[0]).exists()


def test_mesin_gagal_dimuat_menjadi_503(monkeypatch):
    def broken():
        raise ImportError("torch tidak ada")

    monkeypatch.setattr(measure, "get_engine", broken)
    app = FastAPI()
    app.include_router(measure.router)
    r = TestClient(app).post("/measure/face-width", files=_files([np.zeros((8, 8, 3), np.uint8)]))
    assert r.status_code == 503
    assert "face_width_ratio" not in r.json()


def test_endpoint_terdaftar_di_root_dan_api():
    import main
    paths = set(main.app.openapi()["paths"])
    assert {"/measure/face-width", "/api/measure/face-width"} <= paths


def test_respons_verify_meneruskan_rasio_lebar_wajah(monkeypatch):
    result = dict(
        status="success", message="Verifikasi berhasil.", facenet_score=0.8,
        distance=0.24, euclidean_distance=0.24, is_verified=True, fta=False,
        fta_reason=None, emar_score=1.0, liveness_passed=True, blink_cycles=1,
        mouth_cycles=1, video_seconds=8.0, face_width_ratio=0.21875,
        face_width_frames=230, frame_width=1920, frame_height=1080, request_id="x",
    )
    monkeypatch.setattr(attendance, "get_engine", lambda: (object(), lambda *_: dict(result)))
    app = FastAPI()
    app.include_router(attendance.router)
    body = TestClient(app).post(
        "/verify", data={"user_id": "S07"},
        files={"video": ("r.webm", b"x", "video/webm")},
    ).json()
    assert body["face_width_ratio"] == 0.21875
    assert body["face_width_frames"] == 230
    assert (body["frame_width"], body["frame_height"]) == (1920, 1080)
    assert body["distance"] == pytest.approx(0.24)
