"""
Daftar ulang template wajah dari webcam kiosk, lalu langsung ukur jaraknya.

Template yang dibuat dari kamera lain (mis. video ponsel) menghasilkan jarak
FaceNet 0,50-0,75 untuk wajah asli di webcam kiosk, di atas ambang naskah 0,40.
Skrip ini membuat template dari kamera yang sama dengan kamera presensi dan
menampilkan jarak wajah Anda terhadap template baru, agar hasilnya bisa
dinilai seketika, bukan lewat percobaan presensi berulang.

Pemakaian (tutup dulu tab presensi di browser agar kamera tidak sedang dipakai):

    .venv/Scripts/python.exe daftar_ulang_wajah.py --name "Qalwani Anugerah" \
        --id emb_TEST-QALWANI-001 --id TEST-QALWANI-001 --id emb_1 --id 1

Jendela pratinjau terbuka; perekaman baru dimulai setelah SPASI ditekan (Q = batal).
Hanya kunci --id yang diganti, semuanya dengan template yang sama. Galeri
dicadangkan dulu ke gallery/backup_*.pkl.
Mesin biometric-api yang sedang berjalan memuat ulang galeri secara otomatis.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from datetime import datetime
from typing import Callable, Iterable, List, Optional, Tuple

import numpy as np

from parameter_penelitian import FACENET_DISTANCE_THRESHOLD


def collect_face_frames(
    frames: Iterable[Tuple[float, np.ndarray]],
    has_face: Callable[[np.ndarray], bool],
    count: int,
    min_interval_s: float,
    timeout_s: float,
) -> List[np.ndarray]:
    """
    Ambil `count` frame berwajah, berjarak minimal `min_interval_s` detik,
    dalam `timeout_s` detik. Frame tanpa wajah dilewati, bukan disimpan.
    """
    picked: List[np.ndarray] = []
    start: Optional[float] = None
    last = -1e9
    for t, frame in frames:
        if start is None:
            start = t
        if t - start > timeout_s or len(picked) >= count:
            break
        if t - last < min_interval_s - 1e-9:  # toleransi pembulatan timestamp
            continue
        if has_face(frame):
            picked.append(frame)
            last = t
    return picked


def summarize(distances: List[float], threshold: float = FACENET_DISTANCE_THRESHOLD) -> dict:
    """Ringkasan jarak uji terhadap template baru."""
    if not distances:
        return {"n": 0}
    arr = np.asarray(distances)
    return {
        "n": len(arr),
        "min": float(arr.min()),
        "median": float(np.median(arr)),
        "max": float(arr.max()),
        "lolos": int((arr <= threshold).sum()),
    }


def open_camera(index: int, width: int, height: int, wait_s: float, preview: bool):
    """
    Buka kamera dengan resolusi yang sama dengan halaman presensi. Bila kamera
    sedang dipakai (tab presensi masih terbuka), tunggu sampai `wait_s` detik.
    """
    import cv2

    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    deadline = time.monotonic() + wait_s
    told = False
    while True:
        cap = cv2.VideoCapture(index, backend)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            ok, frame = cap.read()
            if ok and frame is not None:
                return cap
        cap.release()
        if time.monotonic() >= deadline:
            return None
        if not told:
            print(f"Kamera {index} sedang dipakai aplikasi lain. Tutup tab presensi di browser; "
                  f"menunggu hingga {wait_s:.0f} detik...")
            told = True
        if preview:
            msg = np.full((200, 640, 3), 30, np.uint8)
            cv2.putText(msg, "Kamera dipakai aplikasi lain.", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (60, 200, 255), 2)
            cv2.putText(msg, "Tutup tab presensi di browser.", (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            cv2.imshow("Daftar ulang wajah", msg)
            if (cv2.waitKey(2000) & 0xFF) in (ord("q"), 27):
                return None
        else:
            time.sleep(2.0)


def wait_for_start(cap, preview: bool, timeout_s: float) -> bool:
    """
    Tanpa pratinjau: hitung mundur 3 detik. Dengan pratinjau: tunggu SPASI agar
    perekaman hanya dimulai saat subjek sudah siap di depan kamera.
    """
    import cv2

    if not preview:
        for sec in (3, 2, 1):
            print(f"  mulai dalam {sec}...")
            deadline = time.monotonic() + 1.0
            for t, _ in _camera_frames(cap, False, ""):
                if t >= deadline:
                    break
        return True

    print("Jendela 'Daftar ulang wajah' terbuka: tekan SPASI saat wajah siap, Q untuk batal.")
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        ok, frame = cap.read()
        if not ok or frame is None:
            return False
        view = frame.copy()
        cv2.putText(view, "SPASI = mulai rekam template   Q = batal", (12, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (40, 220, 40), 2)
        cv2.putText(view, "Posisi seperti saat presensi, lurus, mulut tertutup", (12, 62),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.imshow("Daftar ulang wajah", view)
        key = cv2.waitKey(1) & 0xFF
        if key == ord(" "):
            return True
        if key in (ord("q"), 27):
            return False
    return False


def _camera_frames(cap, preview: bool, label: str):
    import cv2

    while True:
        ok, frame = cap.read()
        if not ok or frame is None:
            return
        if preview:
            view = frame.copy()
            cv2.putText(view, label, (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (40, 220, 40), 2)
            cv2.imshow("Daftar ulang wajah", view)
            if (cv2.waitKey(1) & 0xFF) == ord("q"):
                return
        yield time.monotonic(), frame


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Daftar ulang wajah dari webcam kiosk dan ukur jaraknya.")
    # Verifikasi membaca kunci yang persis sama dengan users.embedding_id lebih dulu,
    # jadi semua alias subjek diganti bersamaan agar tidak ada yang tertinggal
    # memakai template lama.
    p.add_argument("--id", action="append", required=True,
                   help="Kunci galeri; ulangi untuk setiap alias/akun subjek, "
                        "mis. --id emb_TEST-QALWANI-001 --id TEST-QALWANI-001")
    p.add_argument("--name", default="", help="Nama subjek")
    p.add_argument("--dept", default="", help="Departemen")
    p.add_argument("--camera", type=int, default=0, help="Indeks kamera presensi")
    p.add_argument("--shots", type=int, default=15, help="Jumlah frame template")
    p.add_argument("--checks", type=int, default=10, help="Jumlah frame uji setelah daftar")
    p.add_argument("--no-preview", action="store_true", help="Tanpa jendela pratinjau (mulai dengan hitung mundur)")
    # Halaman presensi merekam 1920x1080 (naskah: webcam 1080p 30 FPS); template
    # dibuat dari resolusi yang sama agar kondisi daftar dan verifikasi setara.
    p.add_argument("--width", type=int, default=1920, help="Lebar frame kamera")
    p.add_argument("--height", type=int, default=1080, help="Tinggi frame kamera")
    p.add_argument("--wait-camera", type=float, default=180.0,
                   help="Detik menunggu bila kamera sedang dipakai aplikasi lain")
    p.add_argument("--wait-start", type=float, default=600.0,
                   help="Detik menunggu tombol SPASI sebelum batal (mode pratinjau)")
    args = p.parse_args(argv)

    import cv2
    import facenet_emar_system as fes

    print("Memuat model FaceNet...")
    facenet = fes.FaceNetModule()

    preview = not args.no_preview
    cap = open_camera(args.camera, args.width, args.height, args.wait_camera, preview)
    if cap is None:
        print(f"Kamera {args.camera} tidak dapat dibuka. Tutup tab presensi di browser lalu coba lagi. "
              "Template TIDAK diubah.", file=sys.stderr)
        if preview:
            cv2.destroyAllWindows()
        return 1

    try:
        ok, first = cap.read()
        if ok and first is not None:
            print(f"Resolusi kamera: {first.shape[1]}x{first.shape[0]}")
        print("Posisikan wajah seperti saat presensi (±30 cm, lurus, mulut tertutup).")
        if not wait_for_start(cap, preview, args.wait_start):
            print("Dibatalkan sebelum perekaman. Template TIDAK diubah.")
            return 4

        has_face = lambda f: facenet._extract_embedding(f) is not None
        print(f"Mengambil {args.shots} frame berwajah...")
        shots = collect_face_frames(_camera_frames(cap, preview, "Merekam template..."),
                                    has_face, args.shots, min_interval_s=0.2, timeout_s=20.0)
        if len(shots) < max(3, args.shots // 2):
            print(f"Hanya {len(shots)} frame berwajah yang terdeteksi. Template TIDAK diubah. "
                  "Periksa cahaya dan posisi wajah, atau kamera yang dipakai (--camera).", file=sys.stderr)
            return 2

        backup = fes.GALLERY_PATH.with_name(f"backup_{datetime.now():%Y%m%d_%H%M%S}.pkl")
        if fes.GALLERY_PATH.exists():
            shutil.copy2(fes.GALLERY_PATH, backup)
            print(f"Galeri dicadangkan ke {backup}")

        ids = list(dict.fromkeys(args.id))
        primary = ids[0]
        old = facenet.gallery.get(primary, {}).get("embedding")
        res = facenet.enroll(primary, args.name or primary, args.dept, shots, session_tag="kiosk_webcam")
        if not res.get("success"):
            print(f"Pendaftaran gagal: {res.get('msg')}", file=sys.stderr)
            return 3
        new = facenet.gallery[primary]["embedding"]
        print(f"Template {primary} diganti ({res['n_frames']} frame, hash {res['template_hash']}).")
        if old is not None:
            print(f"  Jarak template lama -> baru: {np.linalg.norm(np.asarray(old) - new):.3f}")
        if len(ids) > 1:
            for alias in ids[1:]:
                facenet.gallery[alias] = {**facenet.gallery[primary], "subject_id": alias}
            facenet.save_gallery()
            print(f"  Template yang sama disimpan juga di: {', '.join(ids[1:])}")

        print(f"Uji {args.checks} frame baru terhadap template (ambang {FACENET_DISTANCE_THRESHOLD})...")
        checks = collect_face_frames(_camera_frames(cap, preview, "Mengukur jarak..."),
                                     has_face, args.checks, min_interval_s=0.3, timeout_s=20.0)
        distances = [facenet.verify(f, primary).distance for f in checks]
        s = summarize(distances)
        if s["n"]:
            print(f"  jarak min {s['min']:.3f} | median {s['median']:.3f} | maks {s['max']:.3f} | "
                  f"lolos <= {FACENET_DISTANCE_THRESHOLD}: {s['lolos']}/{s['n']}")
            # Frame uji diambil langsung dari kamera sesaat setelah daftar, tanpa
            # kompresi webm browser; hasilnya cenderung lebih baik dari presensi.
            print("  Ini uji awal. Ukuran sebenarnya: jarak L2 pada presensi di /presensi.")
        else:
            print("  Tidak ada frame uji berwajah.")
    finally:
        cap.release()
        if preview:
            cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
