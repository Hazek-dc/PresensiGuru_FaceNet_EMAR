"""
Pratinjau pendaftaran web (/enroll/preview) tidak boleh menulis galeri; hanya
/enroll/commit yang menyimpan, dan galeri lama selalu dicadangkan lebih dulu.

Memakai FaceNetModule asli dengan ekstraksi embedding tiruan (warna gambar =
identitas, hitam = tanpa wajah) dan galeri sementara, jadi tanpa model.
"""

import pickle
import re
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

BACKUP_NAME = re.compile(r"^backup_\d{8}_\d{6}_\d{6}\.pkl$")
RED, GREEN, BLUE, BLACK = (40, 40, 200), (40, 200, 40), (200, 40, 40), (0, 0, 0)


def _fake_embedding(img):
    color = img[0, 0].astype(np.float32)
    if not color.any():
        return None
    v = np.concatenate([color / 255.0, np.full(5, 0.1, np.float32)]).astype(np.float32)
    return v / np.linalg.norm(v)


def _image(color):
    return np.full((16, 16, 3), color, np.uint8)


def _files(*colors):
    return [("files[]", (f"f{i}.png", cv2.imencode(".png", _image(c))[1].tobytes(), "image/png"))
            for i, c in enumerate(colors)]


@pytest.fixture
def env(tmp_path, monkeypatch):
    import facenet_emar_system as fes
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routers import attendance, enrollment

    monkeypatch.setattr(fes, "GALLERY_PATH", tmp_path / "face_gallery.pkl")   # sebelum tulis apa pun
    facenet = fes.FaceNetModule.__new__(fes.FaceNetModule)
    facenet._load_gallery()
    facenet._extract_embedding = _fake_embedding
    monkeypatch.setattr(attendance, "_engine", SimpleNamespace(facenet=facenet))
    monkeypatch.setattr(enrollment, "_previews", {})

    app = FastAPI()
    app.include_router(attendance.router)
    app.include_router(enrollment.router)
    app.include_router(enrollment.router, prefix="/api")
    return SimpleNamespace(client=TestClient(app), facenet=facenet, gallery=fes.GALLERY_PATH,
                           dir=tmp_path, enrollment=enrollment)


def _seed(env, gallery):
    with open(env.gallery, "wb") as f:
        pickle.dump(gallery, f)
    env.facenet._load_gallery()


def _seed_s01(env):
    old = _fake_embedding(_image(BLUE))
    rec = {"subject_id": "S01", "name": "Lama", "embedding": old}
    _seed(env, {"S01": rec, "emb_S01": rec, "S02": {"subject_id": "S02", "embedding": old}})
    return old


def _backups(env):
    return sorted(env.dir.glob("backup_*.pkl"))


def _saved(env):
    with open(env.gallery, "rb") as f:
        return pickle.load(f)


def _preview(env, subject="S01", colors=(RED, GREEN, RED), path="/enroll/preview"):
    return env.client.post(path, data={"subject_id": subject, "name": "Guru", "dept": "IPA"},
                           files=_files(*colors))


def _expected_template(*colors):
    embs = [_fake_embedding(_image(c)) for c in colors]
    mean = np.mean(embs, axis=0)
    return mean / np.linalg.norm(mean)


def test_pratinjau_tidak_menyentuh_galeri(env):
    old = _seed_s01(env)
    before_bytes = env.gallery.read_bytes()
    before_mtime = env.gallery.stat().st_mtime_ns
    before_memory = pickle.dumps(env.facenet.gallery)

    r = _preview(env)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert re.fullmatch(r"[0-9a-f]{32}", body["preview_token"])
    assert (body["subject_id"], body["embedding_id"]) == ("S01", "emb_S01")
    assert (body["n_frames"], body["n_uploaded"]) == (3, 3)
    new = _expected_template(RED, GREEN, RED)
    assert body["distance_to_current"] == pytest.approx(float(np.linalg.norm(new - old)))
    assert body["template_hash"] == env.facenet.template_hash(new)

    assert env.gallery.read_bytes() == before_bytes
    assert env.gallery.stat().st_mtime_ns == before_mtime
    assert pickle.dumps(env.facenet.gallery) == before_memory
    assert _backups(env) == []
    assert list(env.enrollment._previews) == [body["preview_token"]]


def test_pratinjau_subjek_baru_tanpa_jarak_dan_tanpa_berkas(env):
    body = _preview(env, subject="GURU_009").json()
    assert body["success"] is True
    assert body["distance_to_current"] is None
    assert not env.gallery.exists()


def test_commit_menulis_subjek_alias_dan_satu_cadangan(env):
    _seed_s01(env)
    preview = _preview(env).json()
    before = env.gallery.read_bytes()

    r = env.client.post("/enroll/commit", json={"preview_token": preview["preview_token"], "subject_id": "S01"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert (body["subject_id"], body["embedding_id"]) == ("S01", "emb_S01")
    assert body["template_hash"] == preview["template_hash"]
    assert body["n_frames"] == 3
    assert BACKUP_NAME.match(body["backup"])

    backups = _backups(env)
    assert [b.name for b in backups] == [body["backup"]]
    assert backups[0].read_bytes() == before

    saved = _saved(env)
    assert set(saved) == {"S01", "emb_S01", "S02"}
    new = _expected_template(RED, GREEN, RED)
    for key in ("S01", "emb_S01"):
        assert np.array_equal(saved[key]["embedding"], new)
        assert saved[key]["template_hash"] == preview["template_hash"]
        assert (saved[key]["name"], saved[key]["dept"], saved[key]["n_frames"]) == ("Guru", "IPA", 3)
    assert env.enrollment._previews == {}

    again = env.client.post("/enroll/commit", json={"preview_token": preview["preview_token"], "subject_id": "S01"})
    assert again.status_code == 404
    assert len(_backups(env)) == 1


def test_commit_form_di_prefix_api_tanpa_galeri_lama(env):
    preview = _preview(env, subject="emb_GURU_007", path="/api/enroll/preview").json()
    assert preview["embedding_id"] == "emb_GURU_007"
    r = env.client.post("/api/enroll/commit",
                        data={"preview_token": preview["preview_token"], "subject_id": "emb_GURU_007"})
    assert r.status_code == 200
    body = r.json()
    assert body["backup"] is None and body["embedding_id"] == "emb_GURU_007"
    assert set(_saved(env)) == {"emb_GURU_007", "GURU_007"}
    assert _backups(env) == []


def test_token_tidak_dikenal_404(env):
    r = env.client.post("/enroll/commit", json={"preview_token": "0" * 32, "subject_id": "S01"})
    assert r.status_code == 404
    assert r.json()["success"] is False and r.json()["message"]
    assert not env.gallery.exists()


def test_token_kedaluwarsa_404(env, monkeypatch):
    token = _preview(env).json()["preview_token"]
    now = env.enrollment._clock()
    monkeypatch.setattr(env.enrollment, "_clock", lambda: now + env.enrollment.PREVIEW_TTL_S + 1)
    r = env.client.post("/enroll/commit", json={"preview_token": token, "subject_id": "S01"})
    assert r.status_code == 404
    assert env.enrollment._previews == {}
    assert not env.gallery.exists()


def test_subjek_berbeda_409_tanpa_menulis(env):
    _seed_s01(env)
    before = env.gallery.read_bytes()
    token = _preview(env).json()["preview_token"]

    r = env.client.post("/enroll/commit", json={"preview_token": token, "subject_id": "S02"})
    assert r.status_code == 409
    assert r.json()["success"] is False and r.json()["message"]
    assert env.gallery.read_bytes() == before
    assert _backups(env) == []

    ok = env.client.post("/enroll/commit", json={"preview_token": token, "subject_id": "S01"})
    assert ok.status_code == 200


def test_kurang_dari_tiga_wajah_tidak_disimpan(env):
    r = _preview(env, colors=(RED, BLACK, GREEN, BLACK))
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert (body["n_frames"], body["n_uploaded"]) == (2, 4)
    assert body["message"] and body["error"]
    assert "preview_token" not in body
    assert env.enrollment._previews == {}
    assert not env.gallery.exists()


def test_batas_jumlah_berkas(env):
    assert _preview(env, colors=(RED,) * 11).status_code == 400
    assert env.client.post("/enroll/preview", data={"subject_id": "S01"}).status_code == 400
    assert env.client.post("/enroll/preview", files=_files(RED, RED, RED)).status_code == 400
    assert env.enrollment._previews == {}


def test_pratinjau_tertua_dibuang_saat_penuh(env, monkeypatch):
    monkeypatch.setattr(env.enrollment, "PREVIEW_MAX_ENTRIES", 2)
    tokens = [_preview(env, subject=f"S{i}").json()["preview_token"] for i in range(3)]
    assert list(env.enrollment._previews) == tokens[1:]
    r = env.client.post("/enroll/commit", json={"preview_token": tokens[0], "subject_id": "S0"})
    assert r.status_code == 404


def test_enroll_mengganti_kunci_membuat_cadangan(env):
    _seed_s01(env)
    before = env.gallery.read_bytes()
    r = env.client.post("/enroll", data={"subject_id": "S01", "name": "Guru"}, files=_files(RED))
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True and body["n_frames"] == 1
    assert [b.name for b in _backups(env)] == [body["backup"]]
    assert _backups(env)[0].read_bytes() == before
    saved = _saved(env)
    assert np.array_equal(saved["emb_S01"]["embedding"], _expected_template(RED))
    assert saved["S02"]["subject_id"] == "S02"


def test_enroll_tanpa_wajah_tidak_menulis(env):
    body = env.client.post("/enroll", data={"subject_id": "S01"}, files=_files(BLACK)).json()
    assert body["success"] is False
    assert not env.gallery.exists()


def test_template_commit_identik_dengan_enroll(env):
    colors = (RED, GREEN, BLUE, GREEN)
    token = _preview(env, colors=colors).json()["preview_token"]
    env.client.post("/enroll/commit", json={"preview_token": token, "subject_id": "S01"})
    res = env.facenet.enroll("S77", "x", "", [_image(c) for c in colors])
    saved = _saved(env)
    assert np.array_equal(saved["S01"]["embedding"], saved["S77"]["embedding"])
    assert saved["S01"]["template_hash"] == res["template_hash"]


def test_verifikasi_setelah_commit_memakai_template_baru(env):
    _seed_s01(env)
    assert not env.facenet.verify(_image(RED), "emb_S01").is_verified   # template lama: biru
    token = _preview(env, colors=(RED, RED, RED)).json()["preview_token"]
    assert not env.facenet.verify(_image(RED), "emb_S01").is_verified   # pratinjau belum disimpan
    env.client.post("/enroll/commit", json={"preview_token": token, "subject_id": "S01"})
    result = env.facenet.verify(_image(RED), "emb_S01")
    assert result.is_verified
    assert result.distance == pytest.approx(0.0, abs=1e-6)


# ---- Template multi-sesi (tambah sampel di cahaya/jarak lain) -----------------

BLUE_MORNING, BLUE_NIGHT = (170, 70, 40), (200, 40, 80)   # dekat BLUE: d ~0,18


def _append_preview(env, colors, subject="S01"):
    return env.client.post("/enroll/preview", files=_files(*colors),
                           data={"subject_id": subject, "name": "Guru", "mode": "append"})


def _commit(env, token, subject="S01"):
    return env.client.post("/enroll/commit", json={"preview_token": token, "subject_id": subject})


def test_tambah_sampel_menggabungkan_sesi_berbobot_sama(env):
    old = _seed_s01(env)
    before = env.gallery.read_bytes()

    p = _append_preview(env, (BLUE_MORNING,) * 3).json()
    assert p["success"] is True and p["mode"] == "append"
    assert env.gallery.read_bytes() == before            # pratinjau tetap tidak menulis
    r = _commit(env, p["preview_token"]).json()
    assert r["success"] is True and r["n_sessions"] == 2

    saved = _saved(env)
    morning = _expected_template(BLUE_MORNING)
    expected = (old + morning) / np.linalg.norm(old + morning)
    for key in ("S01", "emb_S01"):
        assert np.allclose(saved[key]["embedding"], expected, atol=1e-6)
        assert len(saved[key]["sessions"]) == 2
    assert saved["S01"]["session"] == "multisesi(2)"
    assert saved["S02"]["embedding"] is not None and np.allclose(saved["S02"]["embedding"], old)
    assert [b.read_bytes() for b in _backups(env)] == [before]

    # Sesi ketiga: rata-rata tiga sesi berbobot sama, bukan berbobot jumlah foto.
    p2 = _append_preview(env, (BLUE_NIGHT,) * 5).json()
    _commit(env, p2["preview_token"])
    night = _expected_template(BLUE_NIGHT)
    three = old + morning + night
    assert np.allclose(_saved(env)["S01"]["embedding"], three / np.linalg.norm(three), atol=1e-6)
    assert _saved(env)["S01"]["n_frames"] == 3 + 5 + 0  # sesi lama tanpa n_frames


def test_tambah_sampel_ditolak_bila_terlalu_jauh_dari_template(env):
    _seed_s01(env)
    before = env.gallery.read_bytes()
    r = _append_preview(env, (RED, RED, RED))
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "APPEND_TOO_FAR" and body["distance_to_current"] > 0.80
    assert env.enrollment._previews == {}
    assert env.gallery.read_bytes() == before


def test_tambah_sampel_butuh_template_yang_ada(env):
    r = _append_preview(env, (BLUE,) * 3, subject="S09")
    assert r.status_code == 422 and r.json()["error"] == "NO_TEMPLATE_TO_APPEND"
    assert not env.gallery.exists()


def test_mode_tidak_dikenal_ditolak(env):
    r = env.client.post("/enroll/preview", files=_files(BLUE, BLUE, BLUE),
                        data={"subject_id": "S01", "mode": "gabung"})
    assert r.status_code == 400 and r.json()["error"] == "BAD_MODE"


def test_mode_ganti_tetap_sama_dengan_hash_pratinjau(env):
    _seed_s01(env)
    p = _preview(env).json()
    r = _commit(env, p["preview_token"]).json()
    assert r["template_hash"] == p["template_hash"] and r["n_sessions"] == 1 and r["mode"] == "replace"
    assert "sessions" not in _saved(env)["S01"]


# ---- Status kesiapan template (GET /gallery/status) ---------------------------

def test_status_galeri_membedakan_webcam_foto_dan_belum_terdaftar(env):
    old = _fake_embedding(_image(BLUE))
    _seed(env, {
        "S01": {"subject_id": "S01", "embedding": old, "session": "enrollment", "n_frames": 1},
        "emb_S02": {"subject_id": "emb_S02", "embedding": old, "session": "web_enrollment", "n_frames": 5},
    })
    before = env.gallery.read_bytes()
    # Tambah sesi webcam ke template foto S01: sumbernya menjadi webcam (2 sesi, 1 webcam).
    p = _append_preview(env, (BLUE_MORNING,) * 3).json()
    _commit(env, p["preview_token"])

    r = env.client.get("/gallery/status", params={"ids": "S01,S02,S04"}).json()
    by_id = {s["id"]: s for s in r["subjects"]}
    assert by_id["S01"]["source"] == "webcam" and by_id["S01"]["n_sessions"] == 2
    assert by_id["S01"]["webcam_sessions"] == 1
    assert by_id["S02"] == {**by_id["S02"], "enrolled": True, "key": "emb_S02", "source": "webcam", "n_sessions": 1}
    assert by_id["S04"]["enrolled"] is False and by_id["S04"]["source"] is None
    assert "embedding" not in str(r)
    assert env.gallery.read_bytes() != before   # hanya commit yang menulis; status tidak


def test_status_galeri_foto_saja_dan_validasi(env):
    _seed(env, {"S07": {"subject_id": "S07", "embedding": _fake_embedding(_image(BLUE)),
                        "session": "enrollment", "n_frames": 1}})
    before = env.gallery.read_bytes()
    r = env.client.get("/gallery/status", params={"ids": "emb_S07"}).json()
    assert r["subjects"][0]["source"] == "photo" and r["subjects"][0]["key"] == "S07"
    assert env.gallery.read_bytes() == before
    assert env.client.get("/gallery/status").status_code == 400
