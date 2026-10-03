"""
POST /measure/brightness: luma (Rec.601) untuk kalibrasi lux dengan luxmeter.
Hanya mengukur; tidak memuat model biometrik dan tidak menyentuh galeri.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

pytest.importorskip("torch")
cv2 = pytest.importorskip("cv2")


@pytest.fixture
def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers import measure

    app = FastAPI()
    app.include_router(measure.router)
    app.include_router(measure.router, prefix="/api")
    return TestClient(app)


def _png(img):
    return cv2.imencode(".png", img)[1].tobytes()


def _files(images):
    return [("files[]", (f"f{i}.png", _png(img), "image/png")) for i, img in enumerate(images)]


def test_luma_rec601_dari_bgr():
    import facenet_emar_system as fes
    bgr = np.zeros((10, 10, 3), np.uint8)
    bgr[:] = (30, 150, 200)            # B, G, R
    mean, sat, dark = fes.frame_luma_stats(bgr)
    assert mean == pytest.approx(0.299 * 200 + 0.587 * 150 + 0.114 * 30, abs=1e-3)
    assert (sat, dark) == (0.0, 0.0)


def test_median_dan_fraksi_jenuh(client):
    frames = [np.full((1080, 1920, 3), v, np.uint8) for v in (40, 120, 255)]
    r = client.post("/measure/brightness", files=_files(frames)).json()
    assert r["success"] is True
    assert r["luma"] == pytest.approx(120.0, abs=0.01)
    assert r["n_frames"] == 3
    assert r["saturated_fraction"] == pytest.approx(1 / 3, abs=1e-3)
    assert (r["frame_width"], r["frame_height"]) == (1920, 1080)


def test_ukuran_berbeda_tanpa_ukuran_bingkai(client):
    frames = [np.full((48, 64, 3), 100, np.uint8), np.full((60, 80, 3), 100, np.uint8)]
    r = client.post("/api/measure/brightness", files=_files(frames)).json()
    assert r["luma"] == pytest.approx(100.0, abs=0.01)
    assert (r["frame_width"], r["frame_height"]) == (None, None)


def test_tanpa_berkas_atau_berkas_rusak_ditolak(client):
    assert client.post("/measure/brightness").status_code == 400
    bad = [("files[]", ("x.png", b"bukan gambar", "image/png"))]
    r = client.post("/measure/brightness", files=bad)
    assert r.status_code == 400 and r.json()["error"] == "NO_DECODABLE_FRAME"
