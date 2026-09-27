"""
Tes untuk telemetry_logger dan pemasangan (pairing) keputusan S1/S2/S3.

Tes pairing di bawah adalah yang paling penting untuk keabsahan skripsi:
uji McNemar/Cochran/Friedman mengasumsikan ketiga metode menilai bukti yang
sama persis. Kalau FaceNet dan EMAR dijalankan ulang per skenario, asumsi itu
gugur dan seluruh uji statistik jadi tidak sah.
"""

import csv
import json
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from telemetry_logger import FrameTelemetryLogger, lux_bucket


@pytest.fixture
def logger(tmp_path):
    lg = FrameTelemetryLogger(
        db_path=tmp_path / "telemetry.db",
        csv_root=tmp_path / "testing_logs",
        flush_every=2,
    )
    yield lg
    lg.close()


def _frame(lg, **over):
    payload = dict(
        ear_raw=0.285, mar_raw=0.045, emar_score=0.0, face_distance=0.18,
        s_embed=0.81, lux_value=250.0, camera_distance=45, landmark_count=68,
        pred_s1="ACCEPT", pred_s2="REJECT", pred_s3="REJECT", processing_ms=12.5,
    )
    payload.update(over)
    return lg.log_frame(**payload)


class TestSessionAndFrames:
    def test_frame_number_starts_at_one_and_increments(self, logger):
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=250.0, camera_distance=45)
        assert _frame(logger) == 1
        assert _frame(logger) == 2
        assert _frame(logger) == 3

    def test_logging_without_session_is_rejected(self, logger):
        with pytest.raises(RuntimeError, match="start_session"):
            _frame(logger)

    def test_rows_persist_with_raw_ear_mar(self, logger, tmp_path):
        logger.start_session("TEST001", "S01", attack_label="print_attack",
                             lux_value=80.0, camera_distance=30)
        _frame(logger, ear_raw=0.190, mar_raw=0.120,
               lux_value=80.0, camera_distance=30)
        logger.flush()

        con = sqlite3.connect(tmp_path / "telemetry.db")
        con.row_factory = sqlite3.Row
        row = con.execute("SELECT * FROM presence_logs").fetchone()
        con.close()

        assert row["session_id"] == "TEST001"
        assert row["subject_id"] == "S01"
        assert row["attack_label"] == "print_attack"
        assert row["ear_raw"] == pytest.approx(0.190)
        assert row["mar_raw"] == pytest.approx(0.120)
        assert row["camera_distance"] == 30
        assert row["lux_value"] == pytest.approx(80.0)
        assert row["timestamp"]

    def test_all_three_decisions_stored_on_one_row(self, logger, tmp_path):
        """Tanpa ketiganya dalam satu baris, data tidak bisa dipasangkan."""
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=250.0, camera_distance=45)
        _frame(logger, pred_s1="ACCEPT", pred_s2="REJECT", pred_s3="ACCEPT")
        logger.flush()

        con = sqlite3.connect(tmp_path / "telemetry.db")
        row = con.execute(
            "SELECT pred_s1, pred_s2, pred_s3 FROM presence_logs"
        ).fetchone()
        con.close()
        assert row == ("ACCEPT", "REJECT", "ACCEPT")

    def test_buffer_holds_rows_until_threshold(self, logger, tmp_path):
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=250.0, camera_distance=45)
        _frame(logger)
        con = sqlite3.connect(tmp_path / "telemetry.db")
        assert con.execute("SELECT COUNT(*) FROM presence_logs").fetchone()[0] == 0

        _frame(logger)  # flush_every=2 -> tertulis di sini
        assert con.execute("SELECT COUNT(*) FROM presence_logs").fetchone()[0] == 2
        con.close()


class TestCsvOutput:
    def test_csv_lands_in_lux_and_distance_folder(self, logger, tmp_path):
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=80.0, camera_distance=30)
        _frame(logger)
        logger.close()

        path = tmp_path / "testing_logs" / "lux_low" / "distance_30" / "TEST001.csv"
        assert path.exists()

        rows = list(csv.DictReader(path.open(encoding="utf-8")))
        assert rows[0]["frame_number"] == "1"
        assert rows[0]["ear_raw"] == "0.285"

    def test_lux_buckets_follow_prd_ranges(self):
        assert lux_bucket(80) == "lux_low"
        assert lux_bucket(99.9) == "lux_low"
        assert lux_bucket(100) == "lux_medium"
        assert lux_bucket(300) == "lux_medium"
        assert lux_bucket(300.1) == "lux_high"
        assert lux_bucket(400) == "lux_high"


class TestSessionSummary:
    def test_late_liveness_evidence_still_accepts(self, logger):
        """
        Bukti keaslian terkumpul seiring waktu. Subjek yang berkedip di akhir
        jendela tetap diterima; suara mayoritas akan menolaknya.
        """
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=250.0, camera_distance=45)
        _frame(logger, pred_s1="ACCEPT", pred_s2="REJECT", pred_s3="REJECT")
        _frame(logger, pred_s1="ACCEPT", pred_s2="REJECT", pred_s3="REJECT")
        _frame(logger, pred_s1="ACCEPT", pred_s2="REJECT", pred_s3="ACCEPT")
        summary = logger.end_session()

        assert summary["n_frames"] == 3
        assert summary["decision_s1"] == "ACCEPT"
        assert summary["decision_s2"] == "REJECT"   # tidak pernah memenuhi kriteria
        assert summary["decision_s3"] == "ACCEPT"   # 1/3 frame, tetap diterima
        assert summary["ear_mean"] == pytest.approx(0.285)

    def test_summary_row_persisted(self, logger, tmp_path):
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=250.0, camera_distance=45)
        _frame(logger)
        logger.end_session()

        con = sqlite3.connect(tmp_path / "telemetry.db")
        con.row_factory = sqlite3.Row
        row = con.execute("SELECT * FROM presentation_log").fetchone()
        con.close()
        assert row["session_id"] == "TEST001"
        assert row["n_frames"] == 1

    def test_session_with_no_frames_is_marked_fta(self, logger):
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=250.0, camera_distance=45)
        summary = logger.end_session()
        assert summary["n_frames"] == 0
        assert summary["decision_s1"] == "FTA"


class TestFrameTanpaPengukuran:
    """Frame tanpa wajah/landmark dicatat NULL dan tidak menggeser rata-rata."""

    def test_nilai_tidak_terukur_tidak_ikut_rata_rata(self, logger, tmp_path):
        logger.start_session("TEST001", "S01", attack_label="bona_fide",
                             lux_value=250.0, camera_distance=45)
        _frame(logger, face_distance=0.30, ear_raw=0.28, mar_raw=0.05)
        _frame(logger, face_distance=None, s_embed=None, ear_raw=None, mar_raw=None,
               pred_s1="FTA", pred_s2="FTA", pred_s3="FTA")
        _frame(logger, face_distance=0.32, ear_raw=0.26, mar_raw=0.07)
        summary = logger.end_session()

        assert summary["n_frames"] == 3
        assert summary["face_distance_mean"] == pytest.approx(0.31)
        assert summary["ear_mean"] == pytest.approx(0.27)
        assert summary["mar_mean"] == pytest.approx(0.06)

        con = sqlite3.connect(tmp_path / "telemetry.db")
        row = con.execute(
            "SELECT face_distance, ear_raw, mar_raw FROM presence_logs WHERE frame_number = 2"
        ).fetchone()
        con.close()
        assert row == (None, None, None)

    def test_sesi_tanpa_satu_pun_wajah_rata_ratanya_null(self, logger):
        logger.start_session("TEST001", "S01", attack_label="print_attack",
                             lux_value=250.0, camera_distance=45)
        _frame(logger, face_distance=None, s_embed=None, ear_raw=None, mar_raw=None,
               pred_s1="FTA", pred_s2="FTA", pred_s3="FTA")
        summary = logger.end_session()
        assert summary["face_distance_mean"] is None
        assert summary["ear_mean"] is None
        assert summary["decision_s1"] == "FTA"


class TestSidecarSensors:
    """capture_session membaca lux/jarak dari sidecar JSON milik measure_*.py."""

    def _write(self, path, payload):
        path.write_text(json.dumps(payload), encoding="utf-8")

    def test_reads_fresh_value(self, tmp_path):
        pytest.importorskip("cv2")
        from capture_session import read_sidecar

        p = tmp_path / "lux_reading.json"
        self._write(p, {"lux": 243.5,
                        "updated_at": datetime.now().astimezone().isoformat()})
        assert read_sidecar(p, "lux") == pytest.approx(243.5)

    def test_stale_value_is_ignored(self, tmp_path):
        pytest.importorskip("cv2")
        from capture_session import read_sidecar

        p = tmp_path / "lux_reading.json"
        stale = (datetime.now().astimezone() - timedelta(minutes=5)).isoformat()
        self._write(p, {"lux": 243.5, "updated_at": stale})
        assert read_sidecar(p, "lux") is None

    def test_missing_or_broken_file_returns_none(self, tmp_path):
        pytest.importorskip("cv2")
        from capture_session import read_sidecar

        assert read_sidecar(tmp_path / "tidak_ada.json", "lux") is None
        broken = tmp_path / "rusak.json"
        broken.write_text("{bukan json", encoding="utf-8")
        assert read_sidecar(broken, "lux") is None

    @pytest.mark.parametrize("payload", [
        {"lux": 300.0, "raw_reading": "NO_DATA_FALLBACK"},
        {"distance_cm": 30.0, "raw_reading": "NO_FACE_DETECTED"},
        {"lux": 200.0, "source": "research_preset", "raw_reading": 200.0},
        {"lux": 300.0, "source": "manual_preset"},
        {"lux": 325.0, "source": "manual_tune"},
        {"distance_cm": 45.0, "source": "manual_preset"},
        {"lux": 300.0, "source": "default"},
    ])
    def test_nilai_cadangan_sensor_bukan_pengukuran(self, tmp_path, payload):
        pytest.importorskip("cv2")
        from capture_session import read_sidecar

        p = tmp_path / "sidecar.json"
        payload = dict(payload, updated_at=datetime.now().astimezone().isoformat())
        self._write(p, payload)
        key = "lux" if "lux" in payload else "distance_cm"
        assert read_sidecar(p, key) is None

    def test_nilai_manual_operator_diterima(self, tmp_path):
        pytest.importorskip("cv2")
        from capture_session import read_sidecar

        p = tmp_path / "lux.json"
        self._write(p, {"lux": 85.0, "source": "manual_set", "raw_reading": 85.0,
                        "updated_at": datetime.now().astimezone().isoformat()})
        assert read_sidecar(p, "lux") == pytest.approx(85.0)

    def test_missing_conditions_stops_the_run(self):
        pytest.importorskip("cv2")
        from capture_session import parse_args, resolve_conditions

        args = parse_args(["--subject", "S01"])
        with pytest.raises(SystemExit, match="wajib diisi"):
            resolve_conditions(args)


class TestPairedEvidence:
    """
    verify_all_scenarios harus menilai SATU hasil inferensi untuk ketiga
    skenario. Versi lama memanggil verify_frame tiga kali, sehingga
    EMARModule.process_frame ikut jalan tiga kali dan menggeser buffer
    temporalnya -- S2 dan S3 jadi melihat P_live yang berbeda dari frame
    yang sama.
    """

    def test_inference_runs_once_for_three_scenarios(self):
        torch = pytest.importorskip("torch")
        from facenet_emar_system import (
            EMARResult, FaceEMARSystem, FaceNetResult, FusionModule,
        )

        calls = {"facenet": 0, "emar": 0}

        class StubFaceNet:
            gallery = {}

            def verify(self, img, claimed_id):
                calls["facenet"] += 1
                return FaceNetResult(
                    embedding=object(), distance=0.35,
                    claimed_id=claimed_id, matched_id=claimed_id,
                    is_verified=True, s_embed=0.80,
                )

        class StubEmar:
            def process_frame(self, img):
                calls["emar"] += 1
                # P_live naik tiap panggilan, meniru buffer temporal yang bergeser
                return EMARResult(
                    ear_avg=0.28, mar=0.10,
                    emar_score=0.40 + 0.20 * calls["emar"],
                    landmark_count=68,
                )

        class StubDb:
            def log_attendance(self, *a, **k):
                return "stub"

        system = FaceEMARSystem.__new__(FaceEMARSystem)
        system.facenet = StubFaceNet()
        system.emar = StubEmar()
        system.fusion = FusionModule()
        system.db = StubDb()

        results = system.verify_all_scenarios(object(), "S01")

        assert calls["facenet"] == 1, "FaceNet harus dijalankan sekali saja"
        assert calls["emar"] == 1, "EMAR harus dijalankan sekali saja"

        scores = {k: r.emar.emar_score for k, r in results.items()}
        assert len(set(scores.values())) == 1, (
            f"S1/S2/S3 menilai skor liveness berbeda: {scores}"
        )
