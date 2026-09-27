"""
Evaluasi offline (scripts/prepare_dataset.py -> evaluate_dataset) tidak boleh
menyentuh galeri wajah asli. Dulu gallery.clear() + enroll() menimpa
gallery/face_gallery.pkl dengan template evaluasi saja, tanpa cadangan.
"""

import csv
import pickle
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="module")
def fes():
    pytest.importorskip("torch")
    import facenet_emar_system
    return facenet_emar_system


def _unit(i):
    v = np.zeros(8)
    v[i] = 1.0
    return v


def test_evaluasi_memakai_galeri_di_memori_saja(fes, tmp_path, monkeypatch):
    cv2 = pytest.importorskip("cv2")
    gallery_path = tmp_path / "face_gallery.pkl"
    monkeypatch.setattr(fes, "GALLERY_PATH", gallery_path)
    real = {"S01": {"embedding": _unit(0), "name": "asli"}, "emb_1": {"embedding": _unit(1), "name": "asli"}}
    gallery_path.write_bytes(pickle.dumps(real))
    before = gallery_path.read_bytes()
    before_mtime = gallery_path.stat().st_mtime_ns

    # Gambar polos; kecerahan menentukan embedding tiruan (tanpa model).
    brightness_to_emb = {40: _unit(2), 200: _unit(3)}
    def img(name, value):
        p = tmp_path / name
        cv2.imwrite(str(p), np.full((32, 32, 3), value, np.uint8))
        return p.name

    rows = [
        # sample_id, subject_id, claimed, session, image, gt
        ("E1", "EV1", "EV1", "enrollment", img("e1.png", 40), 1),
        ("P1", "EV1", "EV1", "test", img("p1.png", 40), 1),     # wajah sama -> d = 0
        ("P2", "EV2", "EV1", "test", img("p2.png", 200), 0),    # orang lain -> d = 1,414
        ("P3", "S01", "S01", "test", img("p3.png", 40), 1),     # S01 hanya ada di galeri asli
    ]
    manifest = tmp_path / "manifest.csv"
    with open(manifest, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sample_id", "subject_id", "claimed_subject_id", "sample_type", "pai_species",
                    "lux_category", "distance_cm", "session", "split", "image_path", "gt_label"])
        for sid, subj, claimed, session, image, gt in rows:
            w.writerow([sid, subj, claimed, "bona_fide", "-", "normal", 30, session, "", image, gt])

    facenet = fes.FaceNetModule.__new__(fes.FaceNetModule)
    facenet._load_gallery()
    facenet._extract_embedding = lambda im: brightness_to_emb[int(im.mean())]

    class Emar:
        def reset_temporal(self): pass
        def process_frame(self, frame, timestamp=None): return fes.EMARResult()

    saved = []
    system = fes.FaceEMARSystem.__new__(fes.FaceEMARSystem)
    system.facenet, system.emar, system.fusion = facenet, Emar(), fes.FusionModule()
    system.db = type("Db", (), {"save_sample": lambda self, s: saved.append(s)})()
    system.reporter = type("R", (), {"generate_full_report": lambda self, m: None})()

    system.evaluate_dataset(str(manifest), str(tmp_path), scenarios=["S1"])

    assert gallery_path.read_bytes() == before
    assert gallery_path.stat().st_mtime_ns == before_mtime
    assert list(tmp_path.glob("backup_*.pkl")) == []
    assert set(facenet.gallery) == set(real)   # galeri di memori mesin juga tidak diganti

    by_id = {s.sample_id: s for s in saved}
    assert by_id["P1"].pred_s1 == 1
    assert by_id["P2"].pred_s1 == 0
    # S01 tidak didaftarkan di manifest: galeri asli tidak boleh ikut dipakai.
    assert by_id["P3"].pred_s1 == 0


def test_verify_against_sama_dengan_verify_tanpa_baca_berkas(fes, tmp_path, monkeypatch):
    monkeypatch.setattr(fes, "GALLERY_PATH", tmp_path / "tidak_ada.pkl")
    m = fes.FaceNetModule.__new__(fes.FaceNetModule)
    m.gallery = {"emb_S07": {"embedding": _unit(0)}}
    probe = _unit(0) * 0.8 + _unit(1) * 0.6
    m._extract_embedding = lambda im: probe
    a = m.verify(None, "S07")
    b = m.verify_against(None, "S07", {"emb_S07": {"embedding": _unit(0)}})
    assert (a.distance, a.is_verified, a.s_embed) == (b.distance, b.is_verified, b.s_embed)
    assert not (tmp_path / "tidak_ada.pkl").exists()


def test_simpan_galeri_atomik_dan_selalu_dicadangkan(fes, tmp_path, monkeypatch):
    gallery_path = tmp_path / "face_gallery.pkl"
    monkeypatch.setattr(fes, "GALLERY_PATH", gallery_path)
    gallery_path.write_bytes(pickle.dumps({"A": {"embedding": _unit(0)}}))
    before = gallery_path.read_bytes()
    m = fes.FaceNetModule.__new__(fes.FaceNetModule)
    m._load_gallery()
    m._extract_embedding = lambda im: _unit(1)
    res = m.enroll("B", "b", "", [object()])      # subjek baru tetap dicadangkan
    assert res["backup"] and (tmp_path / res["backup"]).read_bytes() == before
    assert set(pickle.loads(gallery_path.read_bytes())) == {"A", "B"}
    assert [p.name for p in tmp_path.iterdir() if p.name.endswith(".tmp")] == []
