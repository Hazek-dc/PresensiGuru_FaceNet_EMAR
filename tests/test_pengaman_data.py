"""Tes tidak boleh bisa menyentuh galeri wajah asli (lihat conftest.py)."""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def test_galeri_saat_tes_bukan_galeri_asli():
    pytest.importorskip("torch")
    import facenet_emar_system as fes

    real = (ROOT / "gallery" / "face_gallery.pkl").resolve()
    assert Path(fes.GALLERY_PATH).resolve() != real
    assert "galeri_tes_" in str(fes.GALLERY_PATH)
