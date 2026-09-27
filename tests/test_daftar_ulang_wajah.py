import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from daftar_ulang_wajah import collect_face_frames, summarize


def _stream(n, fps=10.0, faces=None):
    for i in range(n):
        yield i / fps, np.full((2, 2), i)


def test_hanya_frame_berwajah_yang_diambil():
    no_face = {0, 1, 2, 5}
    picked = collect_face_frames(_stream(40), lambda f: int(f[0, 0]) not in no_face,
                                 count=5, min_interval_s=0.0, timeout_s=10)
    assert [int(f[0, 0]) for f in picked] == [3, 4, 6, 7, 8]


def test_jarak_antarframe_dihormati():
    picked = collect_face_frames(_stream(40), lambda f: True, count=4, min_interval_s=0.2, timeout_s=10)
    assert [int(f[0, 0]) for f in picked] == [0, 2, 4, 6]


def test_berhenti_saat_batas_waktu():
    picked = collect_face_frames(_stream(100), lambda f: False, count=5, min_interval_s=0.0, timeout_s=1.0)
    assert picked == []


def test_ringkasan_jarak_terhadap_ambang_naskah():
    s = summarize([0.31, 0.38, 0.40, 0.45])
    assert s["n"] == 4
    assert s["lolos"] == 3          # 0,40 inklusif
    assert s["median"] == pytest.approx(0.39)
    assert summarize([]) == {"n": 0}


class _Cap:
    """Kamera palsu: gagal dibuka `busy` kali pertama (dipakai tab presensi)."""
    opened = 0

    def __init__(self, busy):
        self.busy, self.props = busy, {}

    def isOpened(self):
        _Cap.opened += 1
        return _Cap.opened > self.busy

    def set(self, prop, value):
        self.props[prop] = value
        return True

    def read(self):
        return True, np.zeros((4, 4, 3), np.uint8)

    def release(self):
        pass


def test_kamera_sibuk_ditunggu_lalu_dipakai_dengan_resolusi_presensi(monkeypatch):
    cv2 = pytest.importorskip("cv2")
    import daftar_ulang_wajah as dw

    _Cap.opened = 0
    caps = []
    monkeypatch.setattr(cv2, "VideoCapture", lambda *a: caps.append(_Cap(busy=2)) or caps[-1])
    monkeypatch.setattr(dw.time, "sleep", lambda s: None)
    cap = dw.open_camera(0, 1920, 1080, wait_s=60, preview=False)
    assert cap is caps[-1] and len(caps) == 3
    assert cap.props == {cv2.CAP_PROP_FRAME_WIDTH: 1920, cv2.CAP_PROP_FRAME_HEIGHT: 1080}


def test_kamera_tetap_sibuk_menyerah_tanpa_rekam(monkeypatch):
    cv2 = pytest.importorskip("cv2")
    import daftar_ulang_wajah as dw

    _Cap.opened = 0
    monkeypatch.setattr(cv2, "VideoCapture", lambda *a: _Cap(busy=10 ** 6))
    assert dw.open_camera(0, 1920, 1080, wait_s=0, preview=False) is None


@pytest.mark.parametrize("key,started", [(" ", True), ("q", False)])
def test_rekam_hanya_dimulai_setelah_spasi(monkeypatch, key, started):
    cv2 = pytest.importorskip("cv2")
    import daftar_ulang_wajah as dw

    shown = []
    monkeypatch.setattr(cv2, "imshow", lambda name, img: shown.append(name))
    monkeypatch.setattr(cv2, "waitKey", lambda ms: ord(key))
    _Cap.opened = 0
    assert dw.wait_for_start(_Cap(busy=0), preview=True, timeout_s=5) is started
    assert shown  # subjek melihat pratinjau sebelum memutuskan


def test_skrip_utuh_dengan_model_sungguhan(tmp_path, monkeypatch, capsys):
    """Kamera palsu mengirim foto contoh terus-menerus; galeri memakai berkas sementara."""
    pytest.importorskip("torch")
    cv2 = pytest.importorskip("cv2")
    import glob
    import facenet_emar_system as fes
    import daftar_ulang_wajah as dw

    photos = sorted(glob.glob(str(Path(fes.BASE_DIR) / "dataset" / "foto_selfie" / "*Reynaldi*")))
    if not photos:
        pytest.skip("foto contoh tidak ada")
    img = cv2.imread(photos[0])
    h, w = img.shape[:2]
    s = 640 / max(h, w)
    img = cv2.resize(img, (int(w * s), int(h * s)))

    class FakeCap:
        def __init__(self, *a, **k):
            pass

        def isOpened(self):
            return True

        def read(self):
            return True, img.copy()

        def set(self, *a):
            return True

        def release(self):
            pass

    monkeypatch.setattr(fes, "GALLERY_PATH", tmp_path / "face_gallery.pkl")
    monkeypatch.setattr(cv2, "VideoCapture", FakeCap)

    code = dw.main(["--id", "emb_UJI", "--id", "UJI", "--id", "emb_UJI", "--name", "Uji",
                    "--shots", "4", "--checks", "3", "--no-preview"])
    out = capsys.readouterr().out
    assert code == 0, out
    assert "Template emb_UJI diganti (4 frame" in out
    assert "lolos <= 0.4: 3/3" in out
    backups = list(tmp_path.glob("backup_*.pkl"))
    assert backups == []  # galeri baru: belum ada yang perlu dicadangkan

    # Semua alias memakai template yang sama; verifikasi membaca kunci persis lebih dulu.
    import pickle
    saved = pickle.load(open(fes.GALLERY_PATH, "rb"))
    assert set(saved) == {"emb_UJI", "UJI"}
    assert np.array_equal(saved["emb_UJI"]["embedding"], saved["UJI"]["embedding"])
    assert saved["UJI"]["subject_id"] == "UJI"
    assert saved["UJI"]["session"] == "kiosk_webcam"
