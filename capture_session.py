"""
Perekam satu presentasi uji: jendela observasi 8,0 detik, telemetry per frame.

Menjalankan S1, S2, dan S3 atas satu hasil inferensi yang sama untuk tiap frame,
lalu mencatat EAR/MAR mentah, lux, jarak, dan ketiga keputusan lewat
FrameTelemetryLogger. Ini alat pengambilan data untuk Prioritas 3 pada PRD.

Sel desain (kategori lux x tingkat jarak) diturunkan dari nilai terukur, dan
nomor repetisi diberikan otomatis sampai 5 per sel (parameter_penelitian).

Contoh:

    # satu presentasi bona-fide, lux dan jarak diisi manual
    python capture_session.py --subject S01 --lux 250 --distance 45

    # ambil lux/jarak dari sidecar JSON yang ditulis measure_lux.py / measure_distance.py
    python capture_session.py --subject S01 --live-sensors

    # presentasi serangan
    python capture_session.py --subject S01 --attack print_attack --lux 80 --distance 30

    # kemajuan pengambilan data terhadap desain 3.240 presentasi
    python capture_session.py --progress

Jalankan dengan interpreter venv (.venv/Scripts/python.exe) -- torch, dlib, dan
cv2 tidak terpasang di Python sistem.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from parameter_penelitian import (
    DISTANCE_BANDS,
    DISTANCE_LABELS,
    N_PER_SUBJECT,
    OBSERVATION_WINDOW_S,
    REPETITIONS,
    SAMPLE_LABELS,
    kategori_lux,
    tingkat_jarak,
    tingkat_jarak_terdekat,
)

BASE_DIR = Path(__file__).resolve().parent
LUX_SIDECAR = BASE_DIR / "attendance-web" / "storage" / "app" / "lux_reading.json"
DISTANCE_SIDECAR = BASE_DIR / "attendance-web" / "storage" / "app" / "distance_reading.json"
SUBJECTS_CSV = BASE_DIR / "dataset" / "subjects.csv"

# FaceNet (~156 ms) jauh lebih lambat dari EMAR (~83 ms). Menjalankannya tiap
# frame menurunkan pipeline ke ~4 fps, dan kedipan 100-250 ms hampir selalu
# lolos dari syarat 2 frame tertutup berturut-turut. Identitas tidak berubah
# dalam satu presentasi 8 detik, jadi FaceNet cukup diulang tiap N frame.
FACENET_EVERY_N_FRAMES = 10


def decision_of(result) -> str:
    """Peta status verifikasi ke tiga nilai yang dicatat log."""
    from facenet_emar_system import VerificationStatus

    if result.status == VerificationStatus.FTA:
        return "FTA"
    return "ACCEPT" if result.is_accepted else "REJECT"


def read_sidecar(path: Path, key: str, max_age_s: float = 10.0) -> Optional[float]:
    """
    Baca satu nilai dari sidecar JSON sensor.

    Mengembalikan None kalau berkas tidak ada, rusak, sudah basi, atau berisi
    nilai yang bukan hasil ukur -- lebih baik perekaman menolak mulai daripada
    mencatat kondisi uji yang tidak pernah diukur.

    Yang diabaikan: angka yang ditulis saat sensor gagal (raw_reading
    "NO_DATA_FALLBACK" / "NO_FACE_DETECTED"), preset tanpa pengukuran
    (source "research_preset", "manual_preset" dari tombol web), penyetelan
    +/- di web ("manual_tune"), dan nilai bawaan Laravel ("default").
    """
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(raw, dict):
        return None

    # Preset, penyetelan manual di web (manual_preset / manual_tune), dan nilai
    # bawaan bukan pengukuran. manual_set (angka lux meter yang diketik
    # operator) tetap diterima.
    source = str(raw.get("source") or "").lower()
    if any(tag in source for tag in ("preset", "tune", "default", "fallback")):
        return None
    reading = raw.get("raw_reading")
    if isinstance(reading, str) and reading.strip().upper().startswith("NO_"):
        return None

    updated = raw.get("updated_at")
    if updated:
        try:
            age = (datetime.now().astimezone()
                   - datetime.fromisoformat(updated).astimezone()).total_seconds()
            if age > max_age_s:
                return None
        except ValueError:
            pass
    value = raw.get(key)
    return float(value) if isinstance(value, (int, float)) else None


def load_subject_ids() -> List[str]:
    """ID subjek dari dataset/subjects.csv, kosong bila berkas tidak ada."""
    try:
        with SUBJECTS_CSV.open(encoding="utf-8") as f:
            return [row["subject_id"] for row in csv.DictReader(f) if row.get("subject_id")]
    except (OSError, KeyError):
        return []


def draw_telemetry(frame, facenet, emar, lux: float, distance: int,
                   elapsed: float, window_s: float, decisions: dict):
    """Panel sensor di atas frame, cermin dari Telemetry Panel pada PRD."""
    import cv2

    detected = emar.landmark_count > 0
    lines = [
        f"Face Detection  {'OK' if detected else '-'}",
        f"Lux             {lux:.0f} ({kategori_lux(lux)})",
        f"Distance        {distance} cm",
        f"EAR             {emar.ear_avg:.3f}",
        f"MAR             {emar.mar:.3f}",
        f"Kedip / Mulut   {emar.blink_cycles} / {emar.mouth_cycles}",
        f"Liveness        {emar.emar_score:.2f}",
        f"Face distance   {facenet.distance:.3f}",
        f"S1/S2/S3        {decisions['s1'][0]}/{decisions['s2'][0]}/{decisions['s3'][0]}",
        f"Sisa            {max(0.0, window_s - elapsed):.1f}s",
    ]

    overlay = frame.copy()
    cv2.rectangle(overlay, (8, 8), (320, 20 + 22 * len(lines)), (18, 18, 18), -1)
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

    for i, text in enumerate(lines):
        cv2.putText(frame, text, (18, 32 + 22 * i),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 235, 235), 1, cv2.LINE_AA)
    return frame


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Rekam satu presentasi uji dengan telemetry per frame."
    )
    p.add_argument("--subject", help="ID subjek terdaftar, mis. S01")
    p.add_argument("--claimed", default="", help="ID yang diklaim (default: sama dengan --subject)")
    p.add_argument("--attack", default="bona_fide", choices=SAMPLE_LABELS,
                   help="Label kebenaran presentasi ini")
    p.add_argument("--lux", type=float, default=None, help="Lux terukur")
    p.add_argument("--distance", type=float, default=None, help="Jarak kamera-subjek terukur (cm)")
    p.add_argument("--live-sensors", action="store_true",
                   help="Ambil lux/jarak dari sidecar JSON tiap frame")
    p.add_argument("--duration", type=float, default=OBSERVATION_WINDOW_S,
                   help=f"Panjang jendela observasi, detik (naskah: {OBSERVATION_WINDOW_S})")
    p.add_argument("--camera", type=int, default=0, help="Indeks kamera")
    p.add_argument("--no-preview", action="store_true", help="Jalan tanpa jendela pratinjau")
    p.add_argument("--db", default=str(BASE_DIR / "logs" / "telemetry.db"),
                   help="Berkas SQLite telemetry")
    p.add_argument("--progress", action="store_true",
                   help="Tampilkan kemajuan pengambilan data lalu keluar")
    args = p.parse_args(argv)
    if not args.progress and not args.subject:
        p.error("--subject wajib diisi (kecuali dengan --progress)")
    return args


def resolve_conditions(args) -> tuple[float, float]:
    """Tentukan lux dan jarak awal dari sidecar atau argumen manual."""
    lux = args.lux
    distance = args.distance

    if args.live_sensors:
        if lux is None:
            lux = read_sidecar(LUX_SIDECAR, "lux")
        if distance is None:
            distance = read_sidecar(DISTANCE_SIDECAR, "distance_cm")

    if lux is None or distance is None:
        raise SystemExit(
            "Lux dan jarak wajib diisi. Beri --lux dan --distance, atau jalankan\n"
            "  scripts/measure_lux.py --sync  dan  scripts/measure_distance.py --sync\n"
            "lebih dulu lalu pakai --live-sensors."
        )
    return float(lux), float(distance)


def resolve_distance_level(distance_cm: float) -> int:
    """
    Tingkat jarak (30/45/60) untuk posisi terukur.

    Posisi di luar rentang naskah (mis. 42 cm) ditolak: mencatatnya sebagai
    salah satu tingkat akan membuat kondisi yang dilaporkan tidak sesuai
    kondisi yang benar-benar diuji.
    """
    level = tingkat_jarak(distance_cm)
    if level is None:
        nearest = tingkat_jarak_terdekat(distance_cm)
        lo, hi = DISTANCE_BANDS[nearest]
        raise SystemExit(
            f"Jarak {distance_cm:.0f} cm berada di luar rentang uji. Posisikan subjek pada "
            f"{lo:.0f}-{hi:.0f} cm ({DISTANCE_LABELS[nearest]}, tingkat {nearest} cm) "
            f"atau rentang lain di Subbab 5.2."
        )
    return level


def print_progress(telemetry, subjects: List[str]) -> None:
    summary = telemetry.progress_summary(subjects or None)
    target = summary["target"]
    done = summary["done"]
    pct = (done / target * 100) if target else 0.0
    print(f"Kemajuan: {done} / {target} presentasi ({pct:.1f}%)")
    print(f"Target per subjek: {N_PER_SUBJECT} ({REPETITIONS} repetisi x 9 kondisi x 4 label)")
    if summary["excess"]:
        print(f"Repetisi berlebih (di atas {REPETITIONS} per sel): {summary['excess']}")

    by_subject = {}
    for subj, label, lux_cat, level, remaining in summary["missing"]:
        by_subject.setdefault(subj, 0)
        by_subject[subj] += remaining
    for subj in (subjects or summary["subjects_seen"]):
        remaining = by_subject.get(subj, 0)
        print(f"  {subj}: {N_PER_SUBJECT - remaining:>3} / {N_PER_SUBJECT}")


def main(argv=None) -> int:
    args = parse_args(argv)

    from telemetry_logger import FrameTelemetryLogger

    telemetry = FrameTelemetryLogger(db_path=args.db)
    if args.progress:
        print_progress(telemetry, load_subject_ids())
        telemetry.close()
        return 0

    lux, distance = resolve_conditions(args)
    distance_level = resolve_distance_level(distance)
    lux_category = kategori_lux(lux)
    claimed_id = args.claimed or args.subject

    repetition = telemetry.next_repetition(args.subject, args.attack, lux_category, distance_level)
    if repetition > REPETITIONS:
        telemetry.close()
        print(f"Sel {args.subject} / {args.attack} / {lux_category} / {distance_level} cm "
              f"sudah lengkap ({REPETITIONS}/{REPETITIONS} repetisi). Tidak ada yang direkam.")
        return 3

    session_id = (f"{args.subject}_{args.attack}_{lux_category}_{distance_level}cm"
                  f"_r{repetition}_{datetime.now():%Y%m%d_%H%M%S}")

    import cv2
    from facenet_emar_system import FaceEMARSystem, robust_open_webcam

    cap = robust_open_webcam(args.camera)
    if not cap or not cap.isOpened():
        telemetry.close()
        print(f"Kamera {args.camera} tidak dapat dibuka.", file=sys.stderr)
        return 1

    print(f"Memuat model... (sesi {session_id})")
    system = FaceEMARSystem()
    if claimed_id not in system.facenet.gallery:
        cap.release()
        telemetry.close()
        print(f"Subjek {claimed_id} belum terdaftar di galeri wajah. Daftarkan dulu; "
              "tanpa template, semua frame hanya menjadi FTA.", file=sys.stderr)
        return 5
    system.emar.reset_temporal()

    telemetry.start_session(
        session_id=session_id,
        subject_id=args.subject,
        attack_label=args.attack,
        lux_value=lux,
        camera_distance=int(round(distance)),
        claimed_id=claimed_id,
        repetition=repetition,
        distance_level=distance_level,
    )

    print(f"Repetisi {repetition}/{REPETITIONS} | {lux:.0f} lux ({lux_category}) | "
          f"{distance:.0f} cm (tingkat {distance_level}) | {args.attack}")
    print(f"Merekam {args.duration:.1f} detik. Tekan 'q' untuk batal.")

    start = time.perf_counter()
    aborted = False
    facenet_result = None
    frames_since_facenet = FACENET_EVERY_N_FRAMES

    try:
        while True:
            elapsed = time.perf_counter() - start
            if elapsed >= args.duration:
                break

            ok, frame = cap.read()
            if not ok:
                print("Frame gagal dibaca, presentasi dibatalkan.", file=sys.stderr)
                aborted = True
                break

            if args.live_sensors:
                lux = read_sidecar(LUX_SIDECAR, "lux") or lux
                live_distance = read_sidecar(DISTANCE_SIDECAR, "distance_cm")
                if live_distance is not None:
                    distance = live_distance

            t_frame = time.perf_counter()
            fresh = (
                facenet_result is None
                or facenet_result.embedding is None
                or frames_since_facenet >= FACENET_EVERY_N_FRAMES
            )
            if fresh:
                facenet_result = system.facenet.verify(frame, claimed_id)
                frames_since_facenet = 0
            frames_since_facenet += 1

            emar_result = system.emar.process_frame(frame, timestamp=time.monotonic())
            results = system.decide_all(facenet_result, emar_result)
            frame_ms = (time.perf_counter() - t_frame) * 1000

            decisions = {
                "s1": decision_of(results["S1"]),
                "s2": decision_of(results["S2"]),
                "s3": decision_of(results["S3"]),
            }

            # Frame tanpa wajah/landmark dicatat None, bukan sentinel 9,99 / 0,0.
            face_measured = facenet_result.embedding is not None
            landmarks_measured = emar_result.landmark_count > 0
            telemetry.log_frame(
                ear_raw=emar_result.ear_avg if landmarks_measured else None,
                mar_raw=emar_result.mar if landmarks_measured else None,
                emar_score=emar_result.emar_score,
                face_distance=facenet_result.distance if face_measured else None,
                s_embed=facenet_result.s_embed if face_measured else None,
                lux_value=lux,
                camera_distance=int(round(distance)),
                landmark_count=emar_result.landmark_count,
                pred_s1=decisions["s1"],
                pred_s2=decisions["s2"],
                pred_s3=decisions["s3"],
                processing_ms=frame_ms,
                blink_cycles=emar_result.blink_cycles,
                mouth_cycles=emar_result.mouth_cycles,
                facenet_fresh=fresh,
            )

            if not args.no_preview:
                view = draw_telemetry(frame.copy(), facenet_result, emar_result,
                                      lux, int(round(distance)), elapsed,
                                      args.duration, decisions)
                cv2.imshow("Perekaman Presentasi", view)
                if (cv2.waitKey(1) & 0xFF) == ord("q"):
                    aborted = True
                    break
    except KeyboardInterrupt:
        aborted = True
    finally:
        cap.release()
        if not args.no_preview:
            cv2.destroyAllWindows()
        summary = telemetry.end_session(aborted=aborted)
        telemetry.close()

    n = summary["n_frames"]
    fps = n / max(args.duration, 1e-6)
    print()
    print(f"Sesi          : {summary['session_id']}{'  (DIBATALKAN, tidak dihitung)' if aborted else ''}")
    print(f"Subjek        : {summary['subject_id']}  |  label: {summary['attack_label']}")
    print(f"Kondisi       : {summary['lux_value']:.0f} lux ({summary['lux_category']}), "
          f"tingkat {summary['distance_level']} cm")
    print(f"Frame terekam : {n}  (~{fps:.1f} fps)")
    if n:
        print(f"EAR rata-rata : {summary['ear_mean']:.4f}")
        print(f"MAR rata-rata : {summary['mar_mean']:.4f}")
        print(f"Siklus        : kedip {summary['max_blink_cycles']}, mulut {summary['max_mouth_cycles']}")
    print(f"Keputusan     : S1={summary['decision_s1']}  "
          f"S2={summary['decision_s2']}  S3={summary['decision_s3']}")

    if aborted:
        return 4
    if n == 0:
        print("\nTidak ada frame terekam -- presentasi ini dicatat sebagai FTA.")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
