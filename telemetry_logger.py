"""
Logger telemetry per-frame untuk pengujian FaceNet + EMAR.

Menjawab requirement P0 pada PRD: setiap frame menghasilkan satu rekaman berisi
EAR mentah, MAR mentah, lux, jarak kamera, dan keputusan sistem. Tanpa nilai
mentah per frame, tabel pencarian ambang EAR/MAR tidak bisa disusun dari data
aktual -- log "Terima/Tolak" saja tidak cukup untuk kalibrasi.

Satu baris memuat keputusan S1, S2, dan S3 sekaligus. Ini bukan kemewahan:
uji Friedman/Wilcoxon/McNemar pada skripsi ini mengasumsikan ketiga metode
menilai bukti yang sama persis. Kalau tiap skenario dicatat di baris terpisah,
data tidak bisa dipasangkan dan seluruh uji statistik gugur.

Keluaran ganda:
  - SQLite  : logs/telemetry.db, tabel presence_logs + presentation_log
  - CSV     : testing_logs/<bucket_lux>/distance_<cm>/<session_id>.csv

Satu sesi = satu presentasi = satu sel desain (subjek x label x lux x jarak)
pada satu repetisi. Desain mengikuti parameter_penelitian: 5 repetisi per sel,
3.240 presentasi total.

Pemakaian:

    log = FrameTelemetryLogger()
    log.start_session("S01_bona_fide_normal_45cm_r1", "S01",
                      attack_label="bona_fide", lux_value=250.0,
                      camera_distance=45, repetition=1)
    for frame in stream:
        ...
        log.log_frame(ear_raw=e, mar_raw=m, emar_score=p, face_distance=d,
                      s_embed=s, lux_value=lux, camera_distance=45,
                      landmark_count=68, pred_s1=..., pred_s2=..., pred_s3=...)
    ringkasan = log.end_session()
    log.close()
"""

from __future__ import annotations

import csv
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from parameter_penelitian import (
    DISTANCE_CM,
    LUX_CATEGORIES,
    N_PER_SUBJECT,
    REPETITIONS,
    SAMPLE_LABELS,
    kategori_lux,
    tingkat_jarak,
)

# Relatif terhadap folder modul, agar capture_session dan ekspor Laravel
# (config biometrics.telemetry_db) membaca berkas yang sama dari folder mana pun.
_BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = _BASE_DIR / "logs" / "telemetry.db"
DEFAULT_CSV_ROOT = _BASE_DIR / "testing_logs"
DEFAULT_FLUSH_EVERY = 30

ACCEPT = "ACCEPT"
REJECT = "REJECT"
FTA = "FTA"

# Nama folder mengikuti struktur /testing_logs pada PRD bagian 8.
LUX_FOLDER = {"redup": "lux_low", "normal": "lux_medium", "terang": "lux_high"}

FRAME_FIELDS = [
    "frame_number", "timestamp", "ear_raw", "mar_raw", "emar_score",
    "blink_cycles", "mouth_cycles", "face_distance", "s_embed",
    "facenet_fresh", "lux_value", "camera_distance", "landmark_count",
    "pred_s1", "pred_s2", "pred_s3",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS presence_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    frame_uid       TEXT    UNIQUE NOT NULL,
    session_id      TEXT    NOT NULL,
    subject_id      TEXT    NOT NULL,
    claimed_id      TEXT,
    frame_number    INTEGER NOT NULL,
    timestamp       TEXT    NOT NULL,
    ear_raw         REAL,
    mar_raw         REAL,
    emar_score      REAL,
    face_distance   REAL,
    s_embed         REAL,
    lux_value       REAL,
    camera_distance INTEGER,
    landmark_count  INTEGER,
    pred_s1         TEXT,
    pred_s2         TEXT,
    pred_s3         TEXT,
    attack_label    TEXT,
    processing_ms   REAL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, frame_number)
);

CREATE TABLE IF NOT EXISTS presentation_log (
    session_id      TEXT PRIMARY KEY,
    subject_id      TEXT NOT NULL,
    claimed_id      TEXT,
    attack_label    TEXT,
    lux_value       REAL,
    lux_category    TEXT,
    camera_distance INTEGER,
    n_frames        INTEGER,
    decision_s1     TEXT,
    decision_s2     TEXT,
    decision_s3     TEXT,
    ear_mean        REAL,
    mar_mean        REAL,
    emar_mean       REAL,
    face_distance_mean REAL,
    started_at      TEXT,
    ended_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_presence_session ON presence_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_presence_subject ON presence_logs(subject_id);
CREATE INDEX IF NOT EXISTS idx_presentation_subject ON presentation_log(subject_id);
"""

# Kolom yang ditambahkan setelah versi pertama. Basis data lama dimigrasi
# dengan ALTER TABLE, tidak dibuat ulang, agar data yang sudah terekam aman.
ADDED_COLUMNS = {
    "presence_logs": {
        "blink_cycles": "INTEGER",
        "mouth_cycles": "INTEGER",
        "facenet_fresh": "INTEGER",
    },
    "presentation_log": {
        "repetition": "INTEGER",
        "distance_level": "INTEGER",
        "aborted": "INTEGER DEFAULT 0",
        "max_blink_cycles": "INTEGER",
        "max_mouth_cycles": "INTEGER",
    },
}


def lux_bucket(lux: float) -> str:
    """Nama folder CSV untuk satu nilai lux (rentang dari parameter_penelitian)."""
    return LUX_FOLDER[kategori_lux(lux)]


def presentation_decision(decisions: List[str]) -> str:
    """
    Keputusan satu presentasi dari keputusan tiap frame.

    Sistem presensi menerima presentasi pada frame pertama yang memenuhi
    kriteria di dalam jendela 8,0 detik (Subbab 4.3.2), jadi satu frame ACCEPT
    sudah berarti presentasi diterima. Suara mayoritas keliru di sini: bukti
    keaslian terkumpul seiring waktu, sehingga subjek yang berkedip di detik
    ke-6 akan kalah suara oleh frame-frame awal yang belum punya bukti.

    FTA hanya bila tidak ada satu frame pun yang berhasil dinilai.
    """
    if not decisions:
        return FTA
    if ACCEPT in decisions:
        return ACCEPT
    if all(d == FTA for d in decisions):
        return FTA
    return REJECT


def _mean(values: List[Optional[float]]) -> Optional[float]:
    measured = [v for v in values if v is not None]
    return sum(measured) / len(measured) if measured else None


@dataclass
class _Session:
    session_id: str
    subject_id: str
    claimed_id: str
    attack_label: str
    lux_value: float
    camera_distance: int
    distance_level: Optional[int]
    repetition: Optional[int]
    started_at: str
    frame_count: int = 0
    csv_path: Optional[Path] = None
    ear: List[float] = field(default_factory=list)
    mar: List[float] = field(default_factory=list)
    emar: List[float] = field(default_factory=list)
    face_distance: List[float] = field(default_factory=list)
    s1: List[str] = field(default_factory=list)
    s2: List[str] = field(default_factory=list)
    s3: List[str] = field(default_factory=list)
    max_blink: int = 0
    max_mouth: int = 0


class FrameTelemetryLogger:
    """
    Pencatat telemetry per frame ke SQLite dan CSV.

    Penulisan di-buffer (`flush_every`) supaya loop kamera tidak menunggu disk
    tiap frame. Sisa buffer ditulis saat end_session() atau close(); mematikan
    proses secara paksa akan kehilangan sisa itu.
    """

    def __init__(
        self,
        db_path: Path | str = DEFAULT_DB_PATH,
        csv_root: Path | str = DEFAULT_CSV_ROOT,
        flush_every: int = DEFAULT_FLUSH_EVERY,
    ):
        self.db_path = Path(db_path)
        self.csv_root = Path(csv_root)
        self.flush_every = max(1, int(flush_every))

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path))
        self._conn.executescript(SCHEMA)
        self._migrate()
        self._conn.commit()

        self._session: Optional[_Session] = None
        self._buffer: List[tuple] = []
        self._csv_buffer: List[Dict[str, Any]] = []
        self._closed = False

    def _migrate(self):
        for table, columns in ADDED_COLUMNS.items():
            existing = {row[1] for row in self._conn.execute(f"PRAGMA table_info({table})")}
            for name, decl in columns.items():
                if name not in existing:
                    self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")

    def next_repetition(
        self, subject_id: str, attack_label: str, lux_category: str, distance_level: int
    ) -> int:
        """Nomor repetisi berikutnya untuk satu sel desain (sesi batal tidak dihitung)."""
        (done,) = self._conn.execute(
            """SELECT COUNT(*) FROM presentation_log
               WHERE subject_id = ? AND attack_label = ? AND lux_category = ?
                 AND distance_level = ? AND COALESCE(aborted, 0) = 0""",
            (subject_id, attack_label, lux_category, int(distance_level)),
        ).fetchone()
        return int(done) + 1

    def start_session(
        self,
        session_id: str,
        subject_id: str,
        attack_label: str = "bona_fide",
        lux_value: float = 0.0,
        camera_distance: int = 60,
        claimed_id: str = "",
        repetition: Optional[int] = None,
        distance_level: Optional[int] = None,
    ) -> str:
        """Buka sesi baru. Sesi yang masih terbuka ditutup lebih dulu."""
        if self._session is not None:
            self.end_session()

        level = distance_level if distance_level is not None else tingkat_jarak(camera_distance)
        self._session = _Session(
            session_id=session_id,
            subject_id=subject_id,
            claimed_id=claimed_id or subject_id,
            attack_label=attack_label,
            lux_value=float(lux_value),
            camera_distance=int(camera_distance),
            distance_level=level,
            repetition=repetition,
            started_at=datetime.now().isoformat(),
        )
        self._session.csv_path = self._prepare_csv(self._session)
        return session_id

    def _prepare_csv(self, session: _Session) -> Path:
        folder_cm = session.distance_level or session.camera_distance
        folder = (self.csv_root / lux_bucket(session.lux_value)
                  / f"distance_{folder_cm}")
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{session.session_id}.csv"
        if not path.exists():
            with path.open("w", newline="", encoding="utf-8") as f:
                csv.DictWriter(f, fieldnames=FRAME_FIELDS).writeheader()
        return path

    def log_frame(
        self,
        ear_raw: Optional[float],
        mar_raw: Optional[float],
        emar_score: float,
        face_distance: Optional[float],
        s_embed: Optional[float],
        lux_value: float,
        camera_distance: int,
        pred_s1: str,
        pred_s2: str,
        pred_s3: str,
        landmark_count: int = 0,
        processing_ms: float = 0.0,
        blink_cycles: int = 0,
        mouth_cycles: int = 0,
        facenet_fresh: bool = True,
    ) -> int:
        """
        Catat satu frame. Mengembalikan nomor frame dalam sesi ini.

        facenet_fresh=False menandai frame yang memakai ulang hasil FaceNet
        dari frame sebelumnya, supaya face_distance yang berulang tidak dibaca
        sebagai pengukuran baru.

        None berarti tidak terukur pada frame ini (wajah atau landmark tidak
        terdeteksi). Nilai itu disimpan NULL dan tidak ikut rata-rata sesi;
        mengisinya dengan sentinel (jarak 9,99, EAR 0,0) akan menggeser
        rata-rata yang diekspor.
        """
        if self._session is None:
            raise RuntimeError(
                "Tidak ada sesi aktif -- panggil start_session() lebih dulu."
            )

        s = self._session
        s.frame_count += 1
        timestamp = datetime.now().isoformat()

        s.ear.append(ear_raw)
        s.mar.append(mar_raw)
        s.emar.append(emar_score)
        s.face_distance.append(face_distance)
        s.s1.append(pred_s1)
        s.s2.append(pred_s2)
        s.s3.append(pred_s3)
        s.max_blink = max(s.max_blink, int(blink_cycles))
        s.max_mouth = max(s.max_mouth, int(mouth_cycles))

        self._buffer.append((
            uuid.uuid4().hex[:12], s.session_id, s.subject_id, s.claimed_id,
            s.frame_count, timestamp, ear_raw, mar_raw, emar_score,
            face_distance, s_embed, lux_value, int(camera_distance),
            int(landmark_count), pred_s1, pred_s2, pred_s3,
            s.attack_label, processing_ms,
            int(blink_cycles), int(mouth_cycles), int(bool(facenet_fresh)),
        ))
        self._csv_buffer.append({
            "frame_number": s.frame_count, "timestamp": timestamp,
            "ear_raw": ear_raw, "mar_raw": mar_raw, "emar_score": emar_score,
            "blink_cycles": int(blink_cycles), "mouth_cycles": int(mouth_cycles),
            "face_distance": face_distance, "s_embed": s_embed,
            "facenet_fresh": int(bool(facenet_fresh)),
            "lux_value": lux_value, "camera_distance": int(camera_distance),
            "landmark_count": int(landmark_count),
            "pred_s1": pred_s1, "pred_s2": pred_s2, "pred_s3": pred_s3,
        })

        if len(self._buffer) >= self.flush_every:
            self.flush()
        return s.frame_count

    def flush(self) -> int:
        """Tulis buffer ke SQLite dan CSV. Mengembalikan jumlah baris tertulis."""
        if not self._buffer:
            return 0

        n = len(self._buffer)
        self._conn.executemany(
            """INSERT OR IGNORE INTO presence_logs
               (frame_uid, session_id, subject_id, claimed_id, frame_number,
                timestamp, ear_raw, mar_raw, emar_score, face_distance,
                s_embed, lux_value, camera_distance, landmark_count,
                pred_s1, pred_s2, pred_s3, attack_label, processing_ms,
                blink_cycles, mouth_cycles, facenet_fresh)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            self._buffer,
        )
        self._conn.commit()
        self._buffer.clear()

        if self._session is not None and self._session.csv_path and self._csv_buffer:
            with self._session.csv_path.open("a", newline="", encoding="utf-8") as f:
                csv.DictWriter(f, fieldnames=FRAME_FIELDS).writerows(self._csv_buffer)
        self._csv_buffer.clear()
        return n

    def end_session(self, aborted: bool = False) -> Dict[str, Any]:
        """
        Tutup sesi aktif dan simpan ringkasan tingkat presentasi.

        aborted=True menandai sesi yang dibatalkan operator. Datanya tetap
        disimpan, tetapi tidak dihitung sebagai repetisi dan tidak ikut ekspor.
        """
        if self._session is None:
            raise RuntimeError("Tidak ada sesi aktif untuk ditutup.")

        self.flush()
        s = self._session
        summary = {
            "session_id": s.session_id,
            "subject_id": s.subject_id,
            "claimed_id": s.claimed_id,
            "attack_label": s.attack_label,
            "lux_value": s.lux_value,
            "lux_category": kategori_lux(s.lux_value),
            "camera_distance": s.camera_distance,
            "distance_level": s.distance_level,
            "repetition": s.repetition,
            "n_frames": s.frame_count,
            "decision_s1": presentation_decision(s.s1),
            "decision_s2": presentation_decision(s.s2),
            "decision_s3": presentation_decision(s.s3),
            "ear_mean": _mean(s.ear),
            "mar_mean": _mean(s.mar),
            "emar_mean": _mean(s.emar),
            "face_distance_mean": _mean(s.face_distance),
            "max_blink_cycles": s.max_blink,
            "max_mouth_cycles": s.max_mouth,
            "aborted": int(bool(aborted)),
            "started_at": s.started_at,
            "ended_at": datetime.now().isoformat(),
        }

        columns = list(summary.keys())
        self._conn.execute(
            f"""INSERT OR REPLACE INTO presentation_log ({", ".join(columns)})
                VALUES ({", ".join("?" for _ in columns)})""",
            tuple(summary[c] for c in columns),
        )
        self._conn.commit()
        self._session = None
        return summary

    def progress(self) -> Dict[Tuple[str, str, str, int], int]:
        """Jumlah repetisi sah per sel (subjek, label, kategori lux, tingkat jarak)."""
        rows = self._conn.execute(
            """SELECT subject_id, attack_label, lux_category, distance_level, COUNT(*)
               FROM presentation_log
               WHERE COALESCE(aborted, 0) = 0 AND distance_level IS NOT NULL
               GROUP BY subject_id, attack_label, lux_category, distance_level"""
        ).fetchall()
        return {(r[0], r[1], r[2], int(r[3])): int(r[4]) for r in rows}

    def progress_summary(self, subjects: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Ringkasan kemajuan terhadap desain 3.240 presentasi.

        Repetisi di atas target per sel dilaporkan sebagai kelebihan, bukan
        dibuang, agar keputusan memakai atau tidak memakainya tetap di tangan
        peneliti.
        """
        counts = self.progress()
        seen_subjects = sorted({k[0] for k in counts})
        subjects = subjects or seen_subjects

        done = 0
        excess = 0
        missing: List[Tuple[str, str, str, int, int]] = []
        for subj in subjects:
            for label in SAMPLE_LABELS:
                for lux_cat in LUX_CATEGORIES:
                    for level in DISTANCE_CM:
                        n = counts.get((subj, label, lux_cat, level), 0)
                        done += min(n, REPETITIONS)
                        excess += max(0, n - REPETITIONS)
                        if n < REPETITIONS:
                            missing.append((subj, label, lux_cat, level, REPETITIONS - n))

        return {
            "subjects_seen": seen_subjects,
            "done": done,
            "target": len(subjects) * N_PER_SUBJECT,
            "excess": excess,
            "missing": missing,
        }

    def export_presentations_csv(
        self,
        output_path: Path | str = "exports/presentasi_berpasangan.csv",
        include_aborted: bool = False,
    ) -> Path:
        """
        Ekspor presentation_log ke CSV -- inilah masukan untuk analisis
        tingkat subjek (satu baris per presentasi, tiga keputusan berpasangan).
        """
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        where = "" if include_aborted else "WHERE COALESCE(aborted, 0) = 0"
        self._conn.row_factory = sqlite3.Row
        rows = self._conn.execute(
            f"""SELECT * FROM presentation_log {where}
                ORDER BY subject_id, attack_label, lux_category,
                         distance_level, repetition, started_at"""
        ).fetchall()
        self._conn.row_factory = None

        with out.open("w", newline="", encoding="utf-8") as f:
            if rows:
                w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                w.writeheader()
                w.writerows([dict(r) for r in rows])
        return out

    def close(self):
        """
        Tulis sisa buffer dan tutup koneksi. Aman dipanggil berkali-kali.

        Sesi yang belum ditutup lewat end_session() dianggap tidak selesai dan
        ditandai batal, supaya tidak terhitung sebagai repetisi sah.
        """
        if self._closed:
            return
        try:
            if self._session is not None:
                self.end_session(aborted=True)
            else:
                self.flush()
        finally:
            self._conn.close()
            self._closed = True

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False
