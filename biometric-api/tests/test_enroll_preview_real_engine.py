"""
Alur pratinjau -> commit dengan model sungguhan (MTCNN + FaceNet): pratinjau
tidak mendaftarkan apa pun, template hasil commit langsung dipakai /verify dan
identik dengan enroll() pada gambar yang sama.

Galeri memakai berkas sementara dan database log diganti tiruan, sehingga data
asli tidak tersentuh. Dilewati bila torch/cv2 atau foto contoh tidak ada.
"""

import glob
import pickle
import sys
from pathlib import Path
from types import SimpleNamespace

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
    saved = fes.GALLERY_PATH, fes.AttendanceDatabase, attendance._engine
    fes.GALLERY_PATH = tmp / "face_gallery.pkl"
    fes.AttendanceDatabase = lambda *a, **k: SimpleNamespace()   # jangan buka logs/attendance.db
    attendance._engine = None
    enrollment._previews.clear()
    app = FastAPI()
    app.include_router(attendance.router)
    app.include_router(enrollment.router, prefix="/api")
    yield TestClient(app), tmp, attendance
    fes.GALLERY_PATH, fes.AttendanceDatabase, attendance._engine = saved
    enrollment._previews.clear()


def _photo(brightness=0):
    img = cv2.imread(PHOTOS[0], cv2.IMREAD_REDUCED_COLOR_4)
    h, w = img.shape[:2]
    s = 640 / max(h, w)
    img = cv2.resize(img, (int(w * s), int(h * s)))
    return np.clip(img.astype(np.int16) + brightness, 0, 255).astype(np.uint8)


def _jpeg(img):
    return cv2.imencode(".jpg", img)[1].tobytes()


def _verify(client, tmp, user_id):
    path = tmp / "probe.avi"
    img = _photo()
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (img.shape[1], img.shape[0]))
    for _ in range(30):
        vw.write(img)
    vw.release()
    with open(path, "rb") as f:
        return client.post("/verify", data={"user_id": user_id},
                           files={"video": ("probe.avi", f, "video/x-msvideo")}).json()


def test_pratinjau_commit_dipakai_verifikasi_dan_identik_dengan_enroll(client):
    c, tmp, attendance = client
    gallery = tmp / "face_gallery.pkl"
    jpegs = [_jpeg(_photo(brightness=b)) for b in (-15, 0, 15)]
    files = [("files[]", (f"s{i}.jpg", b, "image/jpeg")) for i, b in enumerate(jpegs)]

    p = c.post("/api/enroll/preview", data={"subject_id": "emb_UJI-03", "name": "Uji"}, files=files).json()
    assert p["success"] is True, p
    assert (p["n_frames"], p["n_uploaded"]) == (3, 3)
    assert p["distance_to_current"] is None
    assert not gallery.exists()
    assert _verify(c, tmp, "emb_UJI-03")["fta_reason"] == "SUBJECT_NOT_ENROLLED"

    r = c.post("/api/enroll/commit", json={"preview_token": p["preview_token"], "subject_id": "emb_UJI-03"}).json()
    assert r["success"] is True, r
    assert r["template_hash"] == p["template_hash"]
    assert r["backup"] is None

    after = _verify(c, tmp, "emb_UJI-03")
    assert after["fta_reason"] is None
    assert after["distance"] < 0.40
    assert after["is_verified"] is True

    system, _ = attendance.get_engine()
    decoded = [cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR) for b in jpegs]
    before = gallery.read_bytes()
    res = system.facenet.enroll("UJI-PEMBANDING", "Uji", "", decoded)
    # Berkas galeri sudah ada, jadi selalu dicadangkan walau kuncinya baru.
    assert res["backup"] and (gallery.parent / res["backup"]).read_bytes() == before
    with open(gallery, "rb") as f:
        saved = pickle.load(f)
    assert np.array_equal(saved["UJI-PEMBANDING"]["embedding"], saved["emb_UJI-03"]["embedding"])
    assert res["template_hash"] == p["template_hash"]

    # Pratinjau ulang untuk subjek terdaftar melaporkan jarak ke template tersimpan.
    again = c.post("/api/enroll/preview", data={"subject_id": "UJI-03"}, files=files).json()
    assert again["success"] is True
    assert again["distance_to_current"] == pytest.approx(0.0, abs=1e-5)
