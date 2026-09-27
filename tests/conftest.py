"""
Pengaman data asli untuk seluruh tes Python.

Galeri wajah asli (gallery/face_gallery.pkl) tidak punya salinan lain. Tes
yang lupa mengalihkan GALLERY_PATH pernah menimpanya dengan data tiruan, jadi:
1. Sebelum modul mesin dimuat, FACENET_GALLERY_PATH diarahkan ke folder sementara.
2. Sidik md5 + mtime galeri asli dicatat di awal; bila berubah, sesi tes gagal.
"""

import hashlib
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REAL_GALLERY = ROOT / "gallery" / "face_gallery.pkl"

os.environ["FACENET_GALLERY_PATH"] = str(Path(tempfile.mkdtemp(prefix="galeri_tes_")) / "face_gallery.pkl")


def _fingerprint():
    if not REAL_GALLERY.exists():
        return None
    return hashlib.md5(REAL_GALLERY.read_bytes()).hexdigest(), REAL_GALLERY.stat().st_mtime_ns


_BEFORE = _fingerprint()


def pytest_sessionfinish(session, exitstatus):
    if _fingerprint() != _BEFORE:
        print(f"\nGALERI WAJAH ASLI BERUBAH SELAMA TES: {REAL_GALLERY} (sebelum {_BEFORE}, sesudah {_fingerprint()})")
        session.exitstatus = 1
