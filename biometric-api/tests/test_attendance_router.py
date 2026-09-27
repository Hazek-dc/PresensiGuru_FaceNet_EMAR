"""
Router /verify biometric-api tidak boleh mengarang skor.

Versi sebelumnya mengirim jarak 0,12, FaceNet 0,92, EMAR 0,95, dan liveness
lolos setiap kali verifikasi sungguhan gagal (termasuk galeri kosong karena
folder kerja berbeda). Laravel mencatat nilai itu sebagai hasil ukur.
"""

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers import attendance  # noqa: E402


def _client(monkeypatch, verify=None, load_error=None):
    def fake_engine():
        if load_error:
            raise load_error
        return object(), verify

    monkeypatch.setattr(attendance, "get_engine", fake_engine)
    app = FastAPI()
    app.include_router(attendance.router)
    return TestClient(app)


def _post(client, user="S07"):
    return client.post(
        "/verify",
        data={"user_id": user, "attempt_id": "att-uji"},
        files={"video": ("rekaman.webm", b"bukan-video-sungguhan", "video/webm")},
    )


def _result(**over):
    base = dict(
        status="success", message="Verifikasi berhasil.", facenet_score=0.8,
        distance=0.24, euclidean_distance=0.24, is_verified=True, fta=False,
        fta_reason=None, emar_score=1.0, liveness_passed=True, blink_cycles=1,
        mouth_cycles=1, video_seconds=8.0, request_id="x",
    )
    base.update(over)
    return base


def test_hasil_mesin_diteruskan_apa_adanya(monkeypatch):
    seen = {}

    def verify(system, path, user_id):
        seen["user"] = user_id
        seen["path_ada"] = Path(path).exists()
        return _result()

    body = _post(_client(monkeypatch, verify)).json()
    assert seen == {"user": "S07", "path_ada": True}
    assert body["distance"] == pytest.approx(0.24)
    assert body["success"] is True
    assert body["request_id"] == "att-uji"


def test_fta_tidak_diganti_jarak_karangan(monkeypatch):
    verify = lambda *_: _result(
        status="failed", message="Subjek belum terdaftar di galeri wajah.",
        facenet_score=None, distance=None, euclidean_distance=None,
        is_verified=False, fta=True, fta_reason="SUBJECT_NOT_ENROLLED",
        emar_score=0.0, liveness_passed=False,
    )
    body = _post(_client(monkeypatch, verify)).json()
    assert body["distance"] is None
    assert body["fta_reason"] == "SUBJECT_NOT_ENROLLED"
    assert body["success"] is False
    assert body["liveness_passed"] is False


def test_mesin_gagal_dimuat_menjadi_503_tanpa_skor(monkeypatch):
    r = _post(_client(monkeypatch, load_error=ImportError("torch tidak ada")))
    assert r.status_code == 503
    assert "0.12" not in r.text and "0.92" not in r.text


def test_video_rusak_menjadi_400(monkeypatch):
    def verify(*_):
        raise ValueError("Video tidak mengandung frame")

    r = _post(_client(monkeypatch, verify))
    assert r.status_code == 400
    assert "tidak mengandung frame" in r.text
