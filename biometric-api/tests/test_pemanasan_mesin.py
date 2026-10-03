"""
Mesin biometrik dimuat di latar saat server menyala, bukan saat presensi
pertama (memuat FaceNet + dlib ~30-40 s). BIOMETRIC_WARMUP=0 mematikannya.
"""

import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from routers import attendance  # noqa: E402


@pytest.fixture
def engine_calls(monkeypatch):
    called = threading.Event()
    monkeypatch.setattr(attendance, "get_engine", lambda: called.set() or (object(), None))
    return called


def test_mesin_dimuat_saat_server_menyala(monkeypatch, engine_calls):
    monkeypatch.setenv("BIOMETRIC_WARMUP", "1")
    with TestClient(main.app):
        assert engine_calls.wait(timeout=5), "get_engine() harus dipanggil saat startup"


def test_pemanasan_dapat_dimatikan(monkeypatch, engine_calls):
    monkeypatch.setenv("BIOMETRIC_WARMUP", "0")
    with TestClient(main.app) as client:
        assert client.get("/").status_code == 200
    assert not engine_calls.wait(timeout=0.5)


def test_pemanasan_gagal_tidak_menghentikan_server(monkeypatch):
    def broken():
        raise RuntimeError("model tidak ada")

    monkeypatch.setattr(attendance, "get_engine", broken)
    monkeypatch.setenv("BIOMETRIC_WARMUP", "1")
    with TestClient(main.app) as client:
        assert client.get("/").status_code == 200
