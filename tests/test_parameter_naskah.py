"""
Tes kesesuaian sistem dengan parameter naskah skripsi.

Setiap tes di sini mengunci satu klaim naskah (Tabel 4.4, Tabel 5.2, Subbab 5.2,
Subbab 5.3) atau satu keputusan peneliti tanggal 25 September 2026. Kalau salah
satu gagal, sistem yang menghasilkan data sudah tidak sama dengan yang
dilaporkan di naskah.
"""

import math
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import parameter_penelitian as P
from telemetry_logger import FrameTelemetryLogger, presentation_decision


@pytest.fixture(scope="module")
def fes():
    pytest.importorskip("torch")
    import facenet_emar_system
    return facenet_emar_system


class TestNilaiNaskah:
    def test_ambang_tabel_5_2(self):
        assert P.FACENET_DISTANCE_THRESHOLD == 0.40
        assert P.EAR_BLINK_THRESHOLD == 0.20
        assert P.MAR_OPEN_THRESHOLD == 0.10
        assert P.ALPHA_DEFAULT == 0.60
        assert P.OBSERVATION_WINDOW_S == 8.0

    def test_jarak_0_40_setara_kesamaan_0_92(self):
        """Tabel 5.2: 'd <= 0,40 (Skor Kesamaan >= 0,92)'."""
        assert P.cosine_from_distance(0.40) == pytest.approx(0.92)

    def test_desain_lima_repetisi(self):
        assert P.REPETITIONS == 5
        assert P.N_CONDITIONS == 9
        assert P.N_BONA_FIDE == 810
        assert P.N_ATTACK == 2430
        assert P.N_TOTAL == 3240
        assert P.N_PER_SUBJECT == 180

    @pytest.mark.parametrize("lux, kategori", [
        (0, "redup"), (80, "redup"), (99.9, "redup"),
        (100, "normal"), (250, "normal"), (300, "normal"),
        (300.1, "terang"), (500, "terang"),
    ])
    def test_batas_kategori_lux(self, lux, kategori):
        assert P.kategori_lux(lux) == kategori

    @pytest.mark.parametrize("cm, tingkat", [
        (30, 30), (35, 30), (40, 30),
        (45, 45), (50, 45), (55, 45),
        (60, 60), (70, 60),
        (29, None), (42, None), (57, None), (71, None),
    ])
    def test_rentang_jarak_subbab_5_2(self, cm, tingkat):
        assert P.tingkat_jarak(cm) == tingkat

    def test_tingkat_jarak_30_45_60(self):
        assert P.DISTANCE_CM == (30, 45, 60)
        assert P.DISTANCE_LABELS[45] == "Ideal"


class TestSiklusTransisi:
    """Subbab 5.3: kedip dan gerakan mulut wajib 'minimal satu siklus transisi penuh'."""

    def test_foto_statis_bermulut_terbuka_tidak_menghasilkan_siklus(self, fes):
        assert fes.count_full_cycles([True] * 50, min_frames=3) == 0

    def test_foto_statis_bermata_tertutup_tidak_menghasilkan_siklus(self, fes):
        assert fes.count_full_cycles([True] * 50, min_frames=2) == 0

    def test_satu_siklus_penuh(self, fes):
        flags = [False, False, True, True, True, False, False]
        assert fes.count_full_cycles(flags, min_frames=3) == 1

    def test_aktif_terlalu_singkat_tidak_dihitung(self, fes):
        flags = [False, True, True, False]
        assert fes.count_full_cycles(flags, min_frames=3) == 0

    def test_deret_yang_dimulai_aktif_menunggu_keadaan_tidak_aktif(self, fes):
        flags = [True, True, True, False, True, True, True, False]
        assert fes.count_full_cycles(flags, min_frames=3) == 1

    @pytest.fixture
    def emar(self, fes):
        m = fes.EMARModule.__new__(fes.EMARModule)
        m.w1, m.w2 = fes.EMAR_W1, fes.EMAR_W2
        m.ear_blink_thresh = fes.EAR_BLINK_THRESHOLD
        m.mar_open_thresh = fes.MAR_OPEN_THRESHOLD
        m.emar_thresh = fes.EMAR_LIVENESS_THRESHOLD
        m._ear_buffer, m._mar_buffer, m._ts_buffer = [], [], []
        return m

    OPEN_EAR, CLOSED_EAR = 0.28, 0.15
    CLOSED_MAR, OPEN_MAR = 0.04, 0.25

    def _blink(self):
        return [self.OPEN_EAR] * 3 + [self.CLOSED_EAR] * 2 + [self.OPEN_EAR] * 3

    def _mouth(self):
        return [self.CLOSED_MAR] * 3 + [self.OPEN_MAR] * 3 + [self.CLOSED_MAR] * 2

    def test_kedip_dan_mulut_keduanya_memberi_p_live_penuh(self, emar):
        live = emar.liveness_from_sequence(self._blink(), self._mouth())
        assert live["blink_count"] == 1
        assert live["mouth_cycles"] == 1
        assert live["p_live"] == 1.0

    def test_kedip_saja_tidak_cukup_untuk_pad(self, emar, fes):
        live = emar.liveness_from_sequence(self._blink(), [self.CLOSED_MAR] * 8)
        assert live["p_live"] == pytest.approx(0.5)
        assert live["p_live"] < fes.EMAR_LIVENESS_THRESHOLD

    def test_mar_tepat_0_10_dihitung_terbuka(self, emar):
        """Tabel 2.3: mulut terbuka jika MAR >= 0,10 (inklusif)."""
        mars = [0.05] * 3 + [0.10] * 3 + [0.05] * 2
        assert emar.liveness_from_sequence([self.OPEN_EAR] * 8, mars)["mouth_cycles"] == 1

    def test_ear_tepat_0_20_bukan_mata_tertutup(self, emar):
        """Tabel 2.3: mata tertutup jika EAR < 0,20 (ketat)."""
        ears = [0.28] * 3 + [0.20] * 2 + [0.28] * 3
        assert emar.liveness_from_sequence(ears, [self.CLOSED_MAR] * 8)["blink_count"] == 0

    def test_jendela_8_detik_berbasis_waktu(self, emar, fes):
        for i in range(20):
            emar._push_sample(0.28, 0.04, now=i * 0.5)   # 2 fps, 9,5 detik
        span = emar._ts_buffer[-1] - emar._ts_buffer[0]
        assert span <= fes.OBSERVATION_WINDOW_S
        assert span >= fes.OBSERVATION_WINDOW_S - 0.5

    def test_jendela_tidak_bergantung_fps(self, emar):
        for i in range(240):
            emar._push_sample(0.28, 0.04, now=i / 30.0)  # 30 fps, 8 detik
        assert len(emar._ts_buffer) == 240


class TestKeputusanFusi:
    def _facenet(self, fes, d):
        return fes.FaceNetResult(
            embedding=np.zeros(4), distance=d, claimed_id="S01",
            matched_id="S01", is_verified=d <= fes.FACENET_DISTANCE_THRESHOLD,
            s_embed=max(0.0, 1.0 - d / fes.D_REF),
        )

    def test_s2_menolak_bila_hanya_satu_sinyal_keaslian(self, fes):
        emar = fes.EMARResult(emar_score=0.5, landmark_count=68)
        r = fes.FusionModule().decide_s2(self._facenet(fes, 0.30), emar)
        assert r.status == fes.VerificationStatus.REJECTED_LIVENESS

    def test_s2_menerima_bila_kedip_dan_mulut_terpenuhi(self, fes):
        emar = fes.EMARResult(emar_score=1.0, landmark_count=68)
        r = fes.FusionModule().decide_s2(self._facenet(fes, 0.30), emar)
        assert r.status == fes.VerificationStatus.ACCEPTED

    def test_alpha_default_0_60(self, fes):
        assert fes.FusionModule().alpha == 0.60

    def _verify_at(self, fes, d):
        m = fes.FaceNetModule.__new__(fes.FaceNetModule)
        gallery = np.array([1.0, 0.0])
        theta = 2 * math.asin(d / 2)
        probe = np.array([math.cos(theta), math.sin(theta)])
        m.gallery = {"S01": {"embedding": gallery, "name": "x"}}
        m._extract_embedding = lambda img: probe
        return m.verify(object(), "S01")

    def test_facenet_menerima_di_bawah_0_40(self, fes):
        assert self._verify_at(fes, 0.399).is_verified

    def test_facenet_menolak_di_atas_0_40(self, fes):
        assert not self._verify_at(fes, 0.401).is_verified

    def test_evaluate_trial_memakai_ambang_naskah(self, fes):
        assert fes.evaluate_trial(0.40, 0.15, 0.10)[:2] == (1, 1)
        assert fes.evaluate_trial(0.41, 0.15, 0.10)[0] == 0
        assert fes.evaluate_trial(0.30, 0.20, 0.10)[1] == 0   # EAR 0,20 bukan kedip
        assert fes.evaluate_trial(0.30, 0.15, 0.099)[1] == 0  # MAR < 0,10 mulut tertutup


class TestKeputusanPresentasi:
    def test_satu_frame_accept_berarti_diterima(self):
        assert presentation_decision(["REJECT"] * 9 + ["ACCEPT"]) == "ACCEPT"

    def test_tanpa_frame_adalah_fta(self):
        assert presentation_decision([]) == "FTA"

    def test_semua_fta_adalah_fta(self):
        assert presentation_decision(["FTA"] * 5) == "FTA"

    def test_campuran_fta_dan_reject_adalah_reject(self):
        assert presentation_decision(["FTA", "REJECT", "FTA"]) == "REJECT"


class TestRepetisiDanKemajuan:
    @pytest.fixture
    def log(self, tmp_path):
        lg = FrameTelemetryLogger(db_path=tmp_path / "t.db",
                                  csv_root=tmp_path / "csv", flush_every=1)
        yield lg
        lg.close()

    def _record(self, log, sid, aborted=False, subject="S01", lux=250.0, cm=45):
        rep = log.next_repetition(subject, "bona_fide", P.kategori_lux(lux), P.tingkat_jarak(cm))
        log.start_session(sid, subject, attack_label="bona_fide", lux_value=lux,
                          camera_distance=cm, repetition=rep)
        log.log_frame(ear_raw=0.28, mar_raw=0.05, emar_score=1.0, face_distance=0.3,
                      s_embed=0.75, lux_value=lux, camera_distance=cm,
                      pred_s1="ACCEPT", pred_s2="ACCEPT", pred_s3="ACCEPT")
        return log.end_session(aborted=aborted)

    def test_repetisi_bertambah_per_sel(self, log):
        assert self._record(log, "a")["repetition"] == 1
        assert self._record(log, "b")["repetition"] == 2

    def test_sesi_batal_tidak_dihitung(self, log):
        self._record(log, "a", aborted=True)
        assert log.next_repetition("S01", "bona_fide", "normal", 45) == 1

    def test_sel_berbeda_dihitung_terpisah(self, log):
        self._record(log, "a", lux=250.0)
        assert log.next_repetition("S01", "bona_fide", "redup", 45) == 1

    def test_kemajuan_terhadap_target_180_per_subjek(self, log):
        for i in range(P.REPETITIONS + 1):
            self._record(log, f"s{i}")
        summary = log.progress_summary(["S01"])
        assert summary["target"] == 180
        assert summary["done"] == P.REPETITIONS
        assert summary["excess"] == 1
        assert len(summary["missing"]) == 4 * 9 - 1

    def test_close_dengan_sesi_terbuka_menandainya_batal(self, tmp_path):
        lg = FrameTelemetryLogger(db_path=tmp_path / "t.db", csv_root=tmp_path / "csv")
        lg.start_session("x", "S01", lux_value=250.0, camera_distance=45, repetition=1)
        lg.close()
        con = sqlite3.connect(tmp_path / "t.db")
        (aborted,) = con.execute("SELECT aborted FROM presentation_log").fetchone()
        con.close()
        assert aborted == 1

    def test_ekspor_tidak_memuat_sesi_batal(self, log, tmp_path):
        self._record(log, "ok")
        self._record(log, "batal", aborted=True)
        out = log.export_presentations_csv(tmp_path / "ekspor.csv")
        text = out.read_text(encoding="utf-8")
        assert "ok" in text.splitlines()[1]
        assert "batal" not in text

    def test_basis_data_versi_lama_dimigrasi_tanpa_kehilangan_data(self, tmp_path):
        db = tmp_path / "lama.db"
        con = sqlite3.connect(db)
        con.execute("""CREATE TABLE presentation_log (
            session_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, claimed_id TEXT,
            attack_label TEXT, lux_value REAL, lux_category TEXT,
            camera_distance INTEGER, n_frames INTEGER, decision_s1 TEXT,
            decision_s2 TEXT, decision_s3 TEXT, ear_mean REAL, mar_mean REAL,
            emar_mean REAL, face_distance_mean REAL, started_at TEXT, ended_at TEXT)""")
        con.execute("INSERT INTO presentation_log (session_id, subject_id) VALUES ('lama', 'S01')")
        con.commit()
        con.close()

        FrameTelemetryLogger(db_path=db, csv_root=tmp_path / "csv").close()

        con = sqlite3.connect(db)
        cols = {r[1] for r in con.execute("PRAGMA table_info(presentation_log)")}
        rows = con.execute("SELECT session_id FROM presentation_log").fetchall()
        con.close()
        assert {"repetition", "distance_level", "aborted"} <= cols
        assert rows == [("lama",)]


class TestFlaskVerify:
    """Endpoint /verify yang dipanggil Laravel (PresensiController)."""

    @pytest.fixture
    def make_client(self, fes, tmp_path, monkeypatch):
        cv2 = pytest.importorskip("cv2")
        monkeypatch.chdir(tmp_path)
        (tmp_path / "results").mkdir()

        video = tmp_path / "uji.avi"
        writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (64, 48))
        for _ in range(30):  # 3 detik pada 10 fps
            writer.write(np.zeros((48, 64, 3), dtype=np.uint8))
        writer.release()

        def build(face_found=True, enrolled=True, live_frames=None):
            calls = {"timestamps": []}

            class StubEmar:
                def reset_temporal(self):
                    calls["timestamps"].clear()

                def measure(self, frame):
                    return frame

                def push_measurement(self, m, timestamp=None):
                    calls["timestamps"].append(timestamp)
                    idx = len(calls["timestamps"]) - 1
                    if live_frames is not None and idx not in live_frames:
                        return fes.EMARResult()          # frame tanpa wajah
                    return fes.EMARResult(emar_score=1.0, is_live=True, landmark_count=68,
                                          blink_cycles=1, mouth_cycles=1)

            class StubFaceNet:
                gallery = {"S01": {"embedding": np.zeros(4), "name": "x"}} if enrolled else {}
                resolve_id = fes.FaceNetModule.resolve_id

                def refresh_gallery(self):
                    pass

                def verify(self, frame, claimed_id):
                    if not face_found:
                        return fes.FaceNetResult(claimed_id=claimed_id)
                    if not enrolled:
                        return fes.FaceNetResult(embedding=np.zeros(4), claimed_id=claimed_id)
                    return fes.FaceNetResult(embedding=np.zeros(4), distance=0.45,
                                             claimed_id=claimed_id, is_verified=False,
                                             s_embed=1 - 0.45 / fes.D_REF)

            system = type("Stub", (), {})()
            system.emar, system.facenet = StubEmar(), StubFaceNet()
            client = fes.create_flask_api(system).test_client()

            def post():
                with video.open("rb") as f:
                    return client.post("/verify", data={"user_id": "S01", "video": (f, "uji.avi")},
                                       content_type="multipart/form-data")
            return post, calls

        return build

    def test_cap_waktu_mengikuti_waktu_video(self, make_client):
        post, calls = make_client()
        r = post()
        assert r.status_code == 200, r.get_json()
        ts = calls["timestamps"]
        assert len(ts) == 30
        assert ts[0] == pytest.approx(0.0)
        assert ts[-1] == pytest.approx(2.9, abs=1e-6)

    def test_respons_memuat_jarak_euclidean_mentah(self, make_client):
        """Tanpa 'distance', Laravel menaksir d = 1 - facenet_score = d/1,2."""
        post, _ = make_client()
        body = post().get_json()
        assert body["distance"] == pytest.approx(0.45)
        assert body["fta"] is False
        assert body["is_verified"] is False
        assert body["status"] == "failed"

    def test_wajah_tidak_terdeteksi_bukan_jarak_terukur(self, make_client):
        """Sentinel 9,99 dari FaceNetResult tidak boleh terkirim sebagai jarak."""
        post, _ = make_client(face_found=False)
        body = post().get_json()
        assert body["distance"] is None
        assert body["euclidean_distance"] is None
        assert body["facenet_score"] is None
        assert body["fta"] is True
        assert body["fta_reason"] == "FACE_NOT_DETECTED"

    def test_subjek_belum_terdaftar_bukan_jarak_terukur(self, make_client):
        post, _ = make_client(enrolled=False)
        body = post().get_json()
        assert body["distance"] is None
        assert body["fta_reason"] == "SUBJECT_NOT_ENROLLED"

    def test_frame_terakhir_tanpa_wajah_tidak_menghapus_liveness(self, make_client):
        post, _ = make_client(live_frames=set(range(10, 20)))
        body = post().get_json()
        assert body["liveness_passed"] is True
        assert body["emar_score"] == pytest.approx(1.0)
        assert body["blink_cycles"] == 1


class TestGaleriBersama:
    """Pendaftaran ulang dari proses lain harus langsung terlihat oleh mesin yang sedang berjalan."""

    def _module(self, fes, tmp_path, monkeypatch):
        monkeypatch.setattr(fes, "GALLERY_PATH", tmp_path / "face_gallery.pkl")
        m = fes.FaceNetModule.__new__(fes.FaceNetModule)
        m._load_gallery()
        return m

    def _write(self, fes, data):
        import os, pickle, time
        with open(fes.GALLERY_PATH, "wb") as f:
            pickle.dump(data, f)
        t = time.time() + 5  # pastikan mtime berubah walau resolusi jam kasar
        os.utime(fes.GALLERY_PATH, (t, t))

    def test_pendaftaran_proses_lain_langsung_terlihat(self, fes, tmp_path, monkeypatch):
        m = self._module(fes, tmp_path, monkeypatch)
        assert m.resolve_id("S01") is None
        self._write(fes, {"S01": {"embedding": np.ones(4)}})
        m.refresh_gallery()
        assert m.resolve_id("S01") == "S01"

    def test_resolve_alias_emb(self, fes, tmp_path, monkeypatch):
        m = self._module(fes, tmp_path, monkeypatch)
        m.gallery = {"emb_S07": {}, "TEST-QALWANI-001": {}}
        assert m.resolve_id("S07") == "emb_S07"
        assert m.resolve_id("emb_TEST-QALWANI-001") == "TEST-QALWANI-001"
        assert m.resolve_id("S99") is None

    def test_presensi_langsung_memakai_daftar_ulang_proses_lain(self, fes, tmp_path, monkeypatch):
        """
        Mesin sedang berjalan dengan galeri lama yang hanya berisi kunci tanpa
        prefiks. daftar_ulang_wajah.py lalu menulis kunci emb_ yang persis sama
        dengan users.embedding_id. Presensi berikutnya harus memakai template baru,
        bukan alias lama yang ditentukan dari galeri di memori.
        """
        cv2 = pytest.importorskip("cv2")
        probe = np.array([1.0, 0.0, 0.0, 0.0])
        old = np.array([0.0, 1.0, 0.0, 0.0])          # jarak ke probe 1,414
        m = self._module(fes, tmp_path, monkeypatch)   # alihkan GALLERY_PATH lebih dulu
        self._write(fes, {"TEST-QALWANI-001": {"embedding": old}})
        m.refresh_gallery()
        m._extract_embedding = lambda img: probe

        class Emar:
            def reset_temporal(self): pass
            def measure(self, frame): return None
            def push_measurement(self, meas, timestamp=None): return fes.EMARResult()

        system = type("S", (), {})()
        system.emar, system.facenet = Emar(), m
        video = tmp_path / "p.avi"
        vw = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (32, 24))
        for _ in range(10):
            vw.write(np.zeros((24, 32, 3), np.uint8))
        vw.release()

        self._write(fes, {"TEST-QALWANI-001": {"embedding": old},
                          "emb_TEST-QALWANI-001": {"embedding": probe}})   # proses lain
        body = fes.verify_video_file(system, str(video), "emb_TEST-QALWANI-001")
        assert body["fta_reason"] is None
        assert body["distance"] == pytest.approx(0.0)
        assert body["is_verified"] is True

    def test_simpan_tidak_menimpa_pendaftaran_proses_lain(self, fes, tmp_path, monkeypatch):
        import pickle
        m = self._module(fes, tmp_path, monkeypatch)
        self._write(fes, {"S02": {"embedding": np.ones(4)}})   # proses lain
        emb = np.array([1.0, 0.0, 0.0, 0.0])
        m._extract_embedding = lambda img: emb
        assert m.enroll("S01", "x", "y", [object()])["success"]
        saved = pickle.load(open(fes.GALLERY_PATH, "rb"))
        assert set(saved) == {"S01", "S02"}
