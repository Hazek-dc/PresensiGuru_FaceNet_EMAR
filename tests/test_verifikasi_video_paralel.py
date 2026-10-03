"""
Verifikasi video presensi dipercepat dengan EMAR paralel dan pembacaan frame
bertahap. Percepatan ini tidak boleh mengubah angka: EAR/MAR, siklus kedip dan
mulut, serta frame kandidat FaceNet harus sama dengan pemrosesan berurutan.
"""

import glob
import random
import sys
import threading
import time
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="module")
def fes():
    pytest.importorskip("torch")
    import facenet_emar_system
    return facenet_emar_system


def test_urutan_hasil_paralel_sama_dengan_urutan_input(fes):
    rng = random.Random(7)
    delays = [rng.uniform(0, 0.01) for _ in range(60)]

    def work(i):
        time.sleep(delays[i])
        return i * i

    out = list(fes._ordered_parallel_map(work, range(60), workers=6, max_in_flight=12))
    assert out == [i * i for i in range(60)]


def test_jumlah_frame_tertunda_dibatasi(fes):
    """Frame 1080p ~6 MB; tanpa batas, seluruh video menumpuk di memori."""
    lock = threading.Lock()
    state = {"pulled": 0, "done": 0, "max_gap": 0}

    def items():
        for i in range(100):
            with lock:
                state["pulled"] += 1
                state["max_gap"] = max(state["max_gap"], state["pulled"] - state["done"])
            yield i

    for _ in fes._ordered_parallel_map(lambda i: i, items(), workers=4, max_in_flight=8):
        with lock:
            state["done"] += 1
    assert state["max_gap"] <= 8


def _write_video(path, frames, fps=10.0):
    import cv2
    h, w = frames[0].shape[:2]
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    for f in frames:
        vw.write(f)
    vw.release()


def _stub_system(fes, emar, seen_frames):
    class StubFaceNet:
        gallery = {"S01": {"embedding": np.zeros(4)}}
        resolve_id = fes.FaceNetModule.resolve_id

        def refresh_gallery(self):
            pass

        def verify(self, frame, claimed_id):
            seen_frames.append(frame)
            return fes.FaceNetResult(embedding=np.zeros(4), distance=0.5, claimed_id=claimed_id,
                                     is_verified=False, s_embed=0.0)

    system = type("Stub", (), {})()
    system.emar, system.facenet = emar, StubFaceNet()
    return system


def test_frame_kandidat_facenet_sama_dengan_indeks_rasio(fes, tmp_path):
    """Pembacaan kedua harus mengambil frame ke-int(n*r), bukan frame lain."""
    pytest.importorskip("cv2")
    n = 50
    frames = [np.full((48, 64, 3), 4 * i, np.uint8) for i in range(n)]
    video = tmp_path / "indeks.avi"
    _write_video(video, frames)

    class StubEmar:
        def reset_temporal(self):
            pass

        def measure(self, frame):
            return None

        def push_measurement(self, m, timestamp=None):
            return fes.EMARResult()

    seen = []
    body = fes.verify_video_file(_stub_system(fes, StubEmar(), seen), str(video), "S01")
    got = [int(round(float(f.mean()) / 4)) for f in seen]
    ratios = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90]
    assert got == [int(n * r) for r in ratios]
    assert body["video_seconds"] == pytest.approx(5.0)
    assert body["face_width_ratio"] is None and body["face_width_frames"] == 0


def _no_face_emar(fes):
    class NoFaceEmar:
        def reset_temporal(self):
            pass

        def measure(self, frame):
            return None

        def push_measurement(self, m, timestamp=None):
            return fes.EMARResult()

    return NoFaceEmar()


def _graded_frames(n):
    """
    Frame ke-i: kanal biru 4*i, hijau 200-4*i, merah hanya di separuh kiri. Indeks
    terbaca ulang dari kanal biru, dan isinya tidak seragam dan tidak simetris antar
    kanal, sehingga salinan yang kanalnya tertukar atau terpotong tidak lolos.
    """
    frames = []
    for i in range(n):
        f = np.zeros((48, 64, 3), np.uint8)
        f[..., 0] = 4 * i
        f[..., 1] = 200 - 4 * i
        f[:, :32, 2] = 4 * i
        frames.append(f)
    return frames


def _graded_video(tmp_path, n=50, name="kandidat.avi"):
    video = tmp_path / name
    _write_video(video, _graded_frames(n))
    return video


def _frame_index(frame):
    return int(round(float(frame[..., 0].mean()) / 4))


class _CountingCapture:
    """cv2.VideoCapture yang mencatat grab/retrieve/read/set per instance."""

    def __init__(self, real_cls, log):
        self._real_cls, self._log = real_cls, log

    def __call__(self, *args):
        calls = {"grab": 0, "retrieve": 0, "read": 0, "set": []}
        self._log.append(calls)
        return _CountedCap(self._real_cls(*args), calls)


class _CountedCap:
    def __init__(self, cap, calls):
        self._cap, self._calls = cap, calls

    def grab(self):
        self._calls["grab"] += 1
        return self._cap.grab()

    def retrieve(self, *args):
        self._calls["retrieve"] += 1
        return self._cap.retrieve(*args)

    def read(self, *args):
        self._calls["read"] += 1
        return self._cap.read(*args)

    def set(self, prop, value):
        self._calls["set"].append((prop, value))
        return self._cap.set(prop, value)

    def __getattr__(self, name):
        return getattr(self._cap, name)


def test_indeks_frame_terbaca_ulang_dari_isi_video(fes, tmp_path):
    pytest.importorskip("cv2")
    video = _graded_video(tmp_path, 50)
    assert [_frame_index(f) for f in fes._iter_video_frames(str(video))] == list(range(50))


def test_kandidat_cocok_tidak_mendekode_video_dua_kali(fes, tmp_path, monkeypatch):
    """Jarak <= 0,35 di kandidat pertama: kandidat lain tidak dievaluasi, dan frame
    kandidat adalah objek frame dari pass EMAR, sehingga video hanya didekode sekali."""
    cv2 = pytest.importorskip("cv2")
    n = 50
    video = _graded_video(tmp_path, n, "awal.avi")
    fresh = list(fes._iter_video_frames(str(video)))

    pass_frames = []
    real_iter = fes._iter_video_frames

    def recording_iter(path):
        frames = []
        pass_frames.append(frames)
        for f in real_iter(path):
            frames.append(f)
            yield f

    caps = []
    monkeypatch.setattr(fes, "_iter_video_frames", recording_iter)
    monkeypatch.setattr(fes, "_read_frames_at", lambda *a: pytest.fail("video didekode ulang"))
    monkeypatch.setattr(fes.cv2, "VideoCapture", _CountingCapture(cv2.VideoCapture, caps))
    seen = []
    system = _stub_system(fes, _no_face_emar(fes), seen)
    system.facenet.verify = lambda frame, cid: (seen.append(frame), fes.FaceNetResult(
        embedding=np.zeros(4), distance=0.2, claimed_id=cid, is_verified=True, s_embed=0.8))[1]

    body = fes.verify_video_file(system, str(video), "S01")
    assert body["distance"] == 0.2
    assert len(pass_frames) == 1 and len(pass_frames[0]) == n
    assert len(seen) == 1
    assert seen[0] is pass_frames[0][int(n * 0.10)]
    assert np.array_equal(seen[0], fresh[int(n * 0.10)])
    # Probe: hanya mode mentah + grab (tanpa dekode warna); pass EMAR: read() saja.
    probe, emar_pass = caps
    assert probe["set"] == [(cv2.CAP_PROP_FORMAT, -1)]
    assert (probe["read"], probe["retrieve"], probe["grab"]) == (0, 0, n + 1)
    assert (emar_pass["read"], emar_pass["retrieve"], emar_pass["grab"]) == (n + 1, 0, 0)
    assert emar_pass["set"] == []


@pytest.mark.parametrize("exit_at, grabs, retrieves", [(20, 21, 4), (None, 46, 9)])
def test_tanpa_jumlah_paket_dibaca_ulang_hanya_sampai_kandidat(fes, tmp_path, monkeypatch,
                                                                 exit_at, grabs, retrieves):
    """Tanpa jumlah paket, frame kandidat dibaca ulang: frame lain hanya di-grab, dan
    pembacaan berhenti di kandidat yang memenuhi ambang atau di kandidat terakhir."""
    cv2 = pytest.importorskip("cv2")
    n = 50
    video = _graded_video(tmp_path, n, "ulang.avi")
    fresh = list(fes._iter_video_frames(str(video)))
    monkeypatch.setattr(fes, "_count_video_packets", lambda cap: None)
    caps = []
    monkeypatch.setattr(fes.cv2, "VideoCapture", _CountingCapture(cv2.VideoCapture, caps))
    seen = []
    system = _stub_system(fes, _no_face_emar(fes), seen)

    def verify(frame, cid):
        seen.append(frame)
        idx = _frame_index(frame)
        d = 0.2 if exit_at is not None and idx >= exit_at else 0.6
        return fes.FaceNetResult(embedding=np.zeros(4), distance=d, claimed_id=cid,
                                 is_verified=d <= 0.4, s_embed=0.8)

    system.facenet.verify = verify
    body = fes.verify_video_file(system, str(video), "S01")
    expected = [5, 10, 15, 20] if exit_at else [5, 10, 15, 20, 25, 30, 35, 40, 45]
    assert [_frame_index(f) for f in seen] == expected
    for f, i in zip(seen, expected):
        assert np.array_equal(f, fresh[i])
    reread = caps[-1]
    assert (reread["grab"], reread["retrieve"], reread["read"], reread["set"]) == (grabs, retrieves, 0, [])
    assert body["distance"] == (0.2 if exit_at else 0.6)


def test_jarak_tepat_035_menghentikan_evaluasi(fes, tmp_path):
    pytest.importorskip("cv2")
    video = _graded_video(tmp_path, 50, "batas.avi")
    seen = []
    system = _stub_system(fes, _no_face_emar(fes), seen)
    system.facenet.verify = lambda frame, cid: (seen.append(frame), fes.FaceNetResult(
        embedding=np.zeros(4), distance=0.35, claimed_id=cid, is_verified=True, s_embed=0.7))[1]
    fes.verify_video_file(system, str(video), "S01")
    assert len(seen) == 1


def test_kandidat_dan_ambang_berhenti_tidak_berubah(fes):
    assert fes.FACENET_CANDIDATE_RATIOS == tuple(RATIOS)
    assert fes.FACENET_EARLY_EXIT_DISTANCE == 0.35
    for n in range(1, 2000):
        indices = fes._candidate_indices(n)
        assert indices == _legacy_candidate_indices(n)
        # Hasil frame tengah dipakai ulang bila tidak ada kandidat berwajah.
        assert n // 2 in indices


class _FakeCap:
    def __init__(self, set_ok=True, frames=3, grab_raises=False):
        self.calls, self._set_ok, self._left, self._raises = [], set_ok, frames, grab_raises

    def set(self, prop, value):
        self.calls.append(("set", prop, value))
        return self._set_ok

    def grab(self):
        self.calls.append(("grab",))
        if self._raises:
            raise RuntimeError("dekoder rusak")
        self._left -= 1
        return self._left >= 0


def test_hitung_paket_memakai_mode_mentah_dan_aman_bila_gagal(fes):
    cv2 = pytest.importorskip("cv2")
    cap = _FakeCap(frames=3)
    assert fes._count_video_packets(cap) == 3
    assert cap.calls[0] == ("set", cv2.CAP_PROP_FORMAT, -1)

    cap = _FakeCap(set_ok=False)
    assert fes._count_video_packets(cap) is None
    assert [c[0] for c in cap.calls] == ["set"]

    assert fes._count_video_packets(_FakeCap(grab_raises=True)) is None


def _write_intercoded(path, fourcc, n=40):
    """Video dengan prediksi antar-frame (derau + kotak bergerak); None bila codec tidak ada."""
    import cv2
    rng = np.random.default_rng(3)
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), 15.0, (64, 48))
    if not vw.isOpened():
        return None
    base = rng.integers(0, 255, (48, 64, 3), dtype=np.uint8)
    for i in range(n):
        f = base.copy()
        f[10:26, i % 48:(i % 48) + 16] = (40, 200, 90)
        vw.write(f)
    vw.release()
    return path


@pytest.mark.parametrize("fourcc, ext", [("MJPG", "avi"), ("VP80", "webm"), ("mp4v", "mp4")])
def test_paket_dan_pembacaan_ulang_sama_dengan_read(fes, tmp_path, fourcc, ext):
    """Jumlah paket mentah = frame hasil dekode, dan _read_frames_at = read(), juga untuk
    codec antar-frame seperti VP8 (format rekaman MediaRecorder)."""
    cv2 = pytest.importorskip("cv2")
    video = _write_intercoded(tmp_path / f"antar.{ext}", fourcc)
    if video is None:
        pytest.skip(f"codec {fourcc} tidak tersedia")
    decoded = list(fes._iter_video_frames(str(video)))
    assert decoded, "video uji harus terbaca"
    cap = cv2.VideoCapture(str(video))
    try:
        assert fes._count_video_packets(cap) == len(decoded)
    finally:
        cap.release()
    wanted = [3, 17, len(decoded) - 1, 17]
    got = list(fes._read_frames_at(str(video), wanted))
    assert [i for i, _ in got] == sorted(set(wanted))
    for i, frame in got:
        assert np.array_equal(frame, decoded[i])


RATIOS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90]


def _legacy_candidate_indices(n):
    candidates = []
    for r in RATIOS:
        idx = int(n * r)
        if 0 <= idx < n and idx not in candidates:
            candidates.append(idx)
    return candidates or [n // 2]


def _legacy_facenet_result(facenet, frames, claim):
    """Pemilihan kandidat sebelum frame disimpan dari pass EMAR: semua kandidat
    dievaluasi berurutan sampai jarak <= 0,35, lalu frame tengah diverifikasi ulang
    bila tidak ada kandidat berwajah."""
    n = len(frames)
    best, min_dist = None, float("inf")
    for idx in _legacy_candidate_indices(n):
        res = facenet.verify(frames[idx], claim)
        if res.embedding is not None and res.distance < min_dist:
            min_dist, best = res.distance, res
            if min_dist <= 0.35:
                break
    return best if best is not None else facenet.verify(frames[n // 2], claim)


def _unit(angle):
    return np.array([np.cos(angle), np.sin(angle), 0.0, 0.0])


# Jarak tiap frame kandidat (n = 50: indeks 5, 10, ..., 45) ke template S01.
# None = wajah tidak terdeteksi.
SKENARIO = {
    "cocok_di_kandidat_ketiga": {5: 0.62, 10: 0.48, 15: 0.31, 20: 0.10},
    "tidak_ada_yang_di_bawah_035": {5: 0.62, 10: 0.48, 15: 0.41, 20: 0.39, 25: 0.44,
                                    30: 0.52, 35: 0.37, 40: 0.90, 45: 0.58},
    "wajah_baru_muncul_belakangan": {30: 0.45, 35: 0.38, 40: 0.33},
    "tidak_cocok": {5: 0.62, 10: 0.45, 15: 0.51, 20: 0.47, 25: 0.70, 30: 0.58, 35: 0.66, 40: 0.49, 45: 0.53},
    "tidak_ada_wajah": {},
}

# Perkiraan jumlah paket -> jalur yang diharapkan untuk video 50 frame.
PAKET = {
    "sesuai": (None, False),          # jumlah paket asli = 50
    "sama_kandidat": (51, False),     # salah, tetapi semua indeks kandidat 50 frame tersimpan
    "tidak_ada": ("none", True),
    "berbeda": (57, True),
    "kurang": (43, True),
}


def _distance_facenet(fes, distances, calls):
    """FaceNetModule asli (verify/_match tidak diganti); hanya ekstraksi embedding yang
    dipalsukan: jarak d ke template [1,0,0,0] berarti sudut 2*asin(d/2)."""
    m = fes.FaceNetModule.__new__(fes.FaceNetModule)
    m.gallery = {"S01": {"embedding": _unit(0.0)}}

    def extract(img):
        idx = _frame_index(img)
        calls.append(idx)
        d = distances.get(idx)
        return None if d is None else _unit(2 * np.arcsin(d / 2))

    m._extract_embedding = extract
    return m


@pytest.mark.parametrize("paket", sorted(PAKET))
@pytest.mark.parametrize("klaim", ["S01", "S99"])
@pytest.mark.parametrize("skenario", sorted(SKENARIO))
def test_hasil_facenet_identik_dengan_pemilihan_lama(fes, tmp_path, monkeypatch, skenario, klaim, paket):
    pytest.importorskip("cv2")
    video = _graded_video(tmp_path, 50)
    count, expect_reread = PAKET[paket]
    if count is not None:
        monkeypatch.setattr(fes, "_count_video_packets", lambda cap: None if count == "none" else count)
    reread = []
    real_read = fes._read_frames_at
    monkeypatch.setattr(fes, "_read_frames_at", lambda path, idx: (reread.append(list(idx)), real_read(path, idx))[1])
    distances = SKENARIO[skenario]

    legacy_calls = []
    frames = list(fes._iter_video_frames(str(video)))
    ref = _legacy_facenet_result(_distance_facenet(fes, distances, legacy_calls), frames, klaim)
    if ref.embedding is None:
        fta = "FACE_NOT_DETECTED"
    elif klaim != "S01":
        fta = "SUBJECT_NOT_ENROLLED"
    else:
        fta = None

    calls = []
    system = type("S", (), {})()
    system.emar, system.facenet = _no_face_emar(fes), _distance_facenet(fes, distances, calls)
    body = fes.verify_video_file(system, str(video), klaim)

    assert bool(reread) == expect_reread
    assert body["fta_reason"] == fta
    assert body["fta"] == (fta is not None)
    assert body["is_verified"] == bool(ref.is_verified)
    assert body["distance"] == (None if fta else float(ref.distance))
    assert body["euclidean_distance"] == body["distance"]
    assert body["facenet_score"] == (None if fta else ref.s_embed)
    # EMAR tiruan tidak pernah live: wajah cocok berakhir "invalid", selain itu "failed".
    assert body["status"] == ("invalid" if fta is None and ref.is_verified else "failed")
    # Ekstraksi yang dilewati hanya yang hasilnya pasti tidak dipakai:
    # verifikasi ulang frame tengah (tanpa wajah) dan kandidat setelah subjek
    # diketahui belum terdaftar.
    assert calls == legacy_calls[:len(calls)]
    if fta == "FACE_NOT_DETECTED":
        assert legacy_calls == calls + [25]
    elif fta == "SUBJECT_NOT_ENROLLED":
        first_face = next(i for i in calls if distances.get(i) is not None)
        assert calls[-1] == first_face
    else:
        assert calls == legacy_calls


@pytest.mark.parametrize("paket", ["sesuai", "tidak_ada"])
@pytest.mark.parametrize("n", [1, 2, 3, 7, 11])
def test_video_pendek_identik_dengan_pemilihan_lama(fes, tmp_path, monkeypatch, n, paket):
    """Video sangat pendek: indeks kandidat berulang dan dideduplikasi."""
    pytest.importorskip("cv2")
    video = _graded_video(tmp_path, n, f"pendek{n}.avi")
    if paket == "tidak_ada":
        monkeypatch.setattr(fes, "_count_video_packets", lambda cap: None)
    distances = {i: 0.36 + 0.01 * ((i * 7) % 5) for i in range(n)}
    legacy_calls, calls = [], []
    frames = list(fes._iter_video_frames(str(video)))
    ref = _legacy_facenet_result(_distance_facenet(fes, distances, legacy_calls), frames, "S01")
    system = type("S", (), {})()
    system.emar, system.facenet = _no_face_emar(fes), _distance_facenet(fes, distances, calls)
    body = fes.verify_video_file(system, str(video), "S01")
    assert body["distance"] == float(ref.distance)
    assert calls == legacy_calls


@pytest.fixture(scope="module")
def emar_module(fes):
    pytest.importorskip("dlib")
    if not (ROOT / "models" / "shape_predictor_68_face_landmarks.dat").exists() and \
            not (ROOT / "shape_predictor_68_face_landmarks.dat").exists():
        pytest.skip("model landmark dlib tidak ada")
    return fes.EMARModule()


@pytest.fixture(scope="module")
def face_video(tmp_path_factory):
    cv2 = pytest.importorskip("cv2")
    photos = sorted(glob.glob(str(ROOT / "dataset" / "foto_selfie" / "*Reynaldi*")))
    if not photos:
        pytest.skip("foto contoh tidak ada")
    img = cv2.imread(photos[0], cv2.IMREAD_REDUCED_COLOR_4)  # foto asli ~60 MB setelah didekode
    h, w = img.shape[:2]
    s = 480 / max(h, w)
    img = cv2.resize(img, (int(w * s), int(h * s)))
    frames = []
    for i in range(36):  # geser dan skala berbeda agar landmark tiap frame berbeda
        k = 1.0 + 0.01 * (i % 6)
        m = np.float32([[k, 0, (i % 7) - 3], [0, k, (i % 5) - 2]])
        frames.append(cv2.warpAffine(img, m, (img.shape[1], img.shape[0])))
    path = tmp_path_factory.mktemp("video") / "wajah.avi"
    _write_video(path, frames, fps=12.0)
    return path


def test_emar_paralel_identik_dengan_berurutan(fes, emar_module, face_video):
    decoded = list(fes._iter_video_frames(str(face_video)))
    seq = [emar_module.measure(f) for f in decoded]
    par = list(fes._ordered_parallel_map(emar_module.measure, decoded, workers=6, max_in_flight=12))
    assert sum(m is not None for m in seq) >= len(seq) // 2, "wajah contoh harus terdeteksi"
    for a, b in zip(seq, par):
        assert (a is None) == (b is None)
        if a is not None:
            assert (a.ear_left, a.ear_right, a.mar) == (b.ear_left, b.ear_right, b.mar)
            assert [(p.x, p.y) for p in a.landmarks.parts()] == [(p.x, p.y) for p in b.landmarks.parts()]


def test_hasil_verifikasi_sama_dengan_process_frame_berurutan(fes, emar_module, face_video):
    decoded = list(fes._iter_video_frames(str(face_video)))
    emar_module.reset_temporal()
    ref = fes.EMARResult()
    for i, f in enumerate(decoded):
        r = emar_module.process_frame(f, timestamp=i / 12.0)
        if r.landmark_count > 0:
            ref = r

    seen = []
    body = fes.verify_video_file(_stub_system(fes, emar_module, seen), str(face_video), "S01")
    assert body["emar_score"] == ref.emar_score
    assert body["blink_cycles"] == ref.blink_cycles
    assert body["mouth_cycles"] == ref.mouth_cycles
    assert body["liveness_passed"] == ref.is_live
    assert body["video_seconds"] == pytest.approx(len(decoded) / 12.0, abs=1e-3)
    # Frame yang diterima FaceNet setelah pass EMAR paralel (dlib asli) sama dengan hasil dekode.
    candidates = fes._candidate_indices(len(decoded))
    assert len(seen) == len(candidates)
    assert all(np.array_equal(s, decoded[i]) for s, i in zip(seen, candidates))


def test_rasio_lebar_wajah_paralel_sama_dengan_berurutan(fes, emar_module, face_video):
    decoded = list(fes._iter_video_frames(str(face_video)))
    ratios = [fes.face_width_ratio(emar_module.measure(f)) for f in decoded]
    ratios = [r for r in ratios if r is not None]
    assert ratios, "wajah contoh harus terdeteksi"

    body = fes.verify_video_file(_stub_system(fes, emar_module, []), str(face_video), "S01")
    assert body["face_width_ratio"] == round(float(np.median(ratios)), 5)
    assert body["face_width_frames"] == len(ratios)
    assert (body["frame_height"], body["frame_width"]) == decoded[0].shape[:2]
