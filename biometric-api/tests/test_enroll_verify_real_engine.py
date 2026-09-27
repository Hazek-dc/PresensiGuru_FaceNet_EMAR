"""
Pendaftaran ulang lewat /enroll harus langsung dipakai oleh /verify.

Memakai model sungguhan (MTCNN + FaceNet) dan galeri sementara, sehingga
galeri asli tidak tersentuh. Dilewati bila torch/cv2 atau foto contoh tidak ada.
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
PHOTOS = sorted(glob.glob(str(ROOT / "dataset" / "foto_selfie" / "*Reynaldi*")))
pytestmark = pytest.mark.skipif(not PHOTOS, reason="foto contoh tidak ada")


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import facenet_emar_system as fes
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers import attendance, enrollment

    tmp = tmp_path_factory.mktemp("galeri")
    saved_path, saved_engine = fes.GALLERY_PATH, attendance._engine
    fes.GALLERY_PATH = tmp / "face_gallery.pkl"
    attendance._engine = None
    app = FastAPI()
    app.include_router(attendance.router)
    app.include_router(enrollment.router)
    yield TestClient(app), tmp
    fes.GALLERY_PATH, attendance._engine = saved_path, saved_engine


def _photo(scale=640, brightness=0):
    img = cv2.imread(PHOTOS[0])
    h, w = img.shape[:2]
    s = scale / max(h, w)
    img = cv2.resize(img, (int(w * s), int(h * s)))
    return np.clip(img.astype(np.int16) + brightness, 0, 255).astype(np.uint8)


def _jpeg(img):
    return cv2.imencode(".jpg", img)[1].tobytes()


def _video(tmp, img):
    path = tmp / "probe.avi"
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (img.shape[1], img.shape[0]))
    for _ in range(30):
        vw.write(img)
    vw.release()
    return path


def _verify(client, tmp, user_id):
    with open(_video(tmp, _photo()), "rb") as f:
        return client.post("/verify", data={"user_id": user_id},
                           files={"video": ("probe.avi", f, "video/x-msvideo")}).json()


def test_daftar_ulang_langsung_dipakai_verifikasi(client):
    c, tmp = client
    before = _verify(c, tmp, "emb_UJI-01")
    assert before["fta_reason"] == "SUBJECT_NOT_ENROLLED"

    shots = [("files[]", (f"s{i}.jpg", _jpeg(_photo(brightness=b)), "image/jpeg")) for i, b in enumerate((-15, 0, 15))]
    r = c.post("/enroll", data={"subject_id": "emb_UJI-01", "name": "Uji"}, files=shots).json()
    assert r["success"] is True and r["n_frames"] == 3

    after = _verify(c, tmp, "emb_UJI-01")
    assert after["fta_reason"] is None
    assert after["distance"] < 0.40
    assert after["is_verified"] is True


def test_foto_tanpa_wajah_gagal_didaftarkan(client):
    c, _ = client
    blank = [("files[]", ("kosong.jpg", _jpeg(np.full((480, 640, 3), 90, np.uint8)), "image/jpeg"))]
    r = c.post("/enroll", data={"subject_id": "emb_UJI-02"}, files=blank).json()
    assert r["success"] is False
