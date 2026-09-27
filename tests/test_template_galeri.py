"""
Template pendaftaran: rumus dipakai bersama oleh enroll() dan pratinjau web,
dan setiap penulisan yang mengganti isi galeri mencadangkan berkas lama dulu.

Ekstraksi embedding diganti tiruan (tanpa model) dan GALLERY_PATH dialihkan
ke folder sementara sebelum ada penulisan apa pun.
"""

import hashlib
import pickle
import re
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BACKUP_NAME = re.compile(r"^backup_\d{8}_\d{6}_\d{6}\.pkl$")


def _vec(*xs):
    v = np.array(xs, dtype=np.float32)
    return v / np.linalg.norm(v)


# Gambar tiruan berupa bilangan bulat; 0 berarti wajah tidak terdeteksi.
VECS = {1: _vec(1, 0, 0, 0), 2: _vec(0, 1, 0, 0), 3: _vec(1, 1, 1, 0), 4: _vec(0, 0, 1, 1)}


@pytest.fixture
def fes():
    pytest.importorskip("torch")
    import facenet_emar_system
    return facenet_emar_system


@pytest.fixture
def m(fes, tmp_path, monkeypatch):
    monkeypatch.setattr(fes, "GALLERY_PATH", tmp_path / "face_gallery.pkl")
    module = fes.FaceNetModule.__new__(fes.FaceNetModule)
    module._load_gallery()
    module._extract_embedding = lambda img: VECS.get(img)
    return module


def _backups(tmp_path):
    return sorted(tmp_path.glob("backup_*.pkl"))


def _saved(fes):
    with open(fes.GALLERY_PATH, "rb") as f:
        return pickle.load(f)


def test_build_template_rata_rata_ternormalisasi_tanpa_menulis(fes, m, tmp_path):
    emb, n = m.build_template([1, 0, 2, 3], "S01")
    expected = np.mean([VECS[1], VECS[2], VECS[3]], axis=0)
    expected = expected / np.linalg.norm(expected)
    assert n == 3
    assert np.array_equal(emb, expected)
    assert emb.dtype == np.float32
    assert m.gallery == {}
    assert not fes.GALLERY_PATH.exists()
    assert _backups(tmp_path) == []


def test_build_template_tanpa_wajah(m):
    assert m.build_template([0, 0], "S01") == (None, 0)


def test_enroll_gagal_tanpa_wajah_tidak_menulis(fes, m):
    res = m.enroll("S01", "x", "y", [0])
    assert res == {"success": False, "msg": "Embedding tidak cukup (0/5)"}
    assert not fes.GALLERY_PATH.exists()


def test_enroll_mencadangkan_setiap_berkas_galeri_yang_ada(fes, m, tmp_path):
    res = m.enroll("S01", "Nama", "Dept", [1, 2], session_tag="uji")
    assert res["success"] is True and res["n_frames"] == 2 and res["backup"] is None  # belum ada berkas
    before = fes.GALLERY_PATH.read_bytes()
    # Kunci baru tetap dicadangkan: galeri di memori bisa berbeda dari berkas
    # (dulu evaluate_dataset mengosongkannya lalu menyimpan tanpa cadangan).
    res2 = m.enroll("S02", "Lain", "Dept", [3])
    assert [b.name for b in _backups(tmp_path)] == [res2["backup"]]
    assert _backups(tmp_path)[0].read_bytes() == before
    rec = _saved(fes)["S01"]
    assert set(rec) == {"subject_id", "name", "dept", "embedding", "session",
                        "n_frames", "enrolled_at", "template_hash"}
    assert (rec["subject_id"], rec["name"], rec["dept"], rec["session"], rec["n_frames"]) == \
        ("S01", "Nama", "Dept", "uji", 2)
    assert rec["template_hash"] == res["template_hash"]


def test_enroll_mengganti_kunci_mencadangkan_galeri_lama(fes, m, tmp_path):
    m.enroll("S01", "x", "y", [1])
    before = fes.GALLERY_PATH.read_bytes()
    res = m.enroll("S01", "x", "y", [2])
    backups = _backups(tmp_path)
    assert [b.name for b in backups] == [res["backup"]]
    assert BACKUP_NAME.match(res["backup"])
    assert backups[0].read_bytes() == before
    assert np.array_equal(_saved(fes)["S01"]["embedding"], VECS[2])


def test_persist_template_kunci_alias_satu_simpan_dan_cadangan(fes, m, tmp_path):
    m.enroll("S09", "Lain", "", [4])
    before = fes.GALLERY_PATH.read_bytes()
    saves = []
    original_save = m.save_gallery
    m.save_gallery = lambda: saves.append(1) or original_save()

    emb, n = m.build_template([1, 2, 3])
    res = m.persist_template("emb_7", "Guru", "IPA", emb, n, "web", aliases=("7", "emb_7"))

    assert saves == [1]
    assert res["keys"] == ["emb_7", "7"]
    assert res["template_hash"] == hashlib.sha256(emb.tobytes()).hexdigest()[:16]
    assert [b.name for b in _backups(tmp_path)] == [res["backup"]]
    assert _backups(tmp_path)[0].read_bytes() == before
    saved = _saved(fes)
    assert set(saved) == {"S09", "emb_7", "7"}
    for key in ("emb_7", "7"):
        assert np.array_equal(saved[key]["embedding"], emb)
        assert saved[key]["session"] == "web" and saved[key]["n_frames"] == 3
        assert saved[key]["template_hash"] == res["template_hash"]


def test_persist_tanpa_berkas_galeri_tidak_membuat_cadangan(fes, m, tmp_path):
    emb, n = m.build_template([1, 2, 3])
    assert m.persist_template("S01", "x", "", emb, n)["backup"] is None
    assert _backups(tmp_path) == []
    assert "S01" in _saved(fes)


def test_persist_menggabung_pendaftaran_proses_lain(fes, m):
    import os
    import time
    with open(fes.GALLERY_PATH, "wb") as f:
        pickle.dump({"S02": {"embedding": VECS[2]}}, f)
    t = time.time() + 5
    os.utime(fes.GALLERY_PATH, (t, t))
    emb, n = m.build_template([1, 3, 4])
    m.persist_template("S01", "x", "", emb, n)
    assert set(_saved(fes)) == {"S01", "S02"}


def test_nama_cadangan_tidak_pernah_dipakai_ulang(fes, m, tmp_path, monkeypatch):
    real_datetime = fes.datetime

    class JamBeku(real_datetime):
        @classmethod
        def now(cls, tz=None):
            return real_datetime(2026, 9, 27, 10, 0, 0, 999999)

    monkeypatch.setattr(fes, "datetime", JamBeku)
    m.enroll("S01", "x", "y", [1])
    first = fes.GALLERY_PATH.read_bytes()
    a = m.enroll("S01", "x", "y", [2])["backup"]
    second = fes.GALLERY_PATH.read_bytes()
    b = m.enroll("S01", "x", "y", [3])["backup"]
    assert (a, b) == ("backup_20260927_100000_999999.pkl", "backup_20260927_100001_000000.pkl")
    assert (tmp_path / a).read_bytes() == first
    assert (tmp_path / b).read_bytes() == second


def test_current_embedding_membaca_alias_tanpa_menulis(fes, m, tmp_path):
    emb, n = m.build_template([1, 2, 3])
    m.persist_template("emb_S05", "x", "", emb, n)
    stat = fes.GALLERY_PATH.stat()
    before = fes.GALLERY_PATH.read_bytes()

    assert np.array_equal(m.current_embedding("S05"), emb)
    assert np.array_equal(m.current_embedding("emb_S05"), emb)
    assert m.current_embedding("S99") is None
    assert fes.GALLERY_PATH.read_bytes() == before
    assert fes.GALLERY_PATH.stat().st_mtime_ns == stat.st_mtime_ns
    assert _backups(tmp_path) == []
