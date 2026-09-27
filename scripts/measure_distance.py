#!/usr/bin/env python3
"""
=============================================================================
PENGUKURAN JARAK WAJAH KE KAMERA (LIVE SENSOR) — SKRIPSI FACENET + EMAR
Penelitian : "Analisis Kinerja FaceNet dan Eye-Mouth Aspect Ratio (EMAR)
              pada Sistem Face Verification Mitigasi Serangan Spoofing Presensi"
Peneliti   : Qalwani Anugerah — NPM 221220048 — UMP 2026
=============================================================================

Fitur Utama:
1. Pembacaan Sensor Hardware Jarak (ToF Laser VL53L0X / Ultrasonik HC-SR04 via Serial COM).
2. Estimasi Jarak Optik Kamera (OpenCV Face Geometry Pin-hole model D = (W_real * f) / W_pixel).
3. Preset Pengujian Skenario Jarak Skripsi (30 cm: Dekat, 45 cm: Ideal, 60 cm: Jauh).
4. Sinkronisasi Otomatis ke Backend Laravel (storage/app/distance_reading.json & POST /api/distance/update).
5. Visualisasi Real-Time Terminal Gauge & Mode Single-Shot (--once) untuk otomasi eksperimen.
"""

import os
import sys
import time
import json
import re
import argparse
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

# Root Project Directories
BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_FILE = BASE_DIR / "attendance-web" / "storage" / "app" / "distance_reading.json"
DEFAULT_API_URL = "http://127.0.0.1:8000/api/distance/update"

sys.path.insert(0, str(BASE_DIR))
from parameter_penelitian import DISTANCE_BANDS  # noqa: E402

# ANSI Colors for Terminal Dashboard
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"


def categorize_distance(dist_cm: float) -> Tuple[str, str, str, bool, int]:
    """
    Kategori jarak berdasarkan rentang posisi Subbab 5.2 (Uji Cochran's Q Skripsi):
    - Terlalu Dekat : < 30 cm
    - 30 cm (Dekat) : 30 - 40 cm
    - 45 cm (Ideal) : 45 - 55 cm
    - 60 cm (Jauh)  : 60 - 70 cm
    - Terlalu Jauh  : > 70 cm
    Posisi 40 - 45 cm dan 55 - 60 cm di luar rentang, dilaporkan sebagai TOO_CLOSE
    terhadap tingkat terdekat (45 atau 60) karena subjek perlu mundur.
    """
    dekat_lo, dekat_hi = DISTANCE_BANDS[30]
    ideal_lo, ideal_hi = DISTANCE_BANDS[45]
    jauh_lo, jauh_hi = DISTANCE_BANDS[60]
    if dist_cm < dekat_lo:
        return "Terlalu Dekat", "TOO_CLOSE", f"Jarak terlalu dekat (< {dekat_lo:.0f} cm)", False, 30
    elif dist_cm <= dekat_hi:
        return "30 cm (Dekat)", "IDEAL_30", f"Skenario jarak pengujian dekat ({dekat_lo:.0f} - {dekat_hi:.0f} cm)", False, 30
    elif dist_cm < ideal_lo:
        return "Terlalu Dekat", "TOO_CLOSE", f"Di luar rentang posisi, mundur ke {ideal_lo:.0f} - {ideal_hi:.0f} cm", False, 45
    elif dist_cm <= ideal_hi:
        return "45 cm (Ideal)", "MID_45", f"Jarak pengujian ideal ({ideal_lo:.0f} - {ideal_hi:.0f} cm)", True, 45
    elif dist_cm < jauh_lo:
        return "Terlalu Dekat", "TOO_CLOSE", f"Di luar rentang posisi, mundur ke {jauh_lo:.0f} - {jauh_hi:.0f} cm", False, 60
    elif dist_cm <= jauh_hi:
        return "60 cm (Jauh)", "FAR_60", f"Skenario jarak pengujian jauh ({jauh_lo:.0f} - {jauh_hi:.0f} cm)", False, 60
    else:
        return "Terlalu Jauh", "TOO_FAR", f"Jarak terlalu jauh (> {jauh_hi:.0f} cm)", False, 60


def format_distance_bar(dist_cm: float, max_cm: float = 100.0, width: int = 30) -> str:
    """Membuat visualisasi horizontal ruler gauge di terminal."""
    clamped = max(0.0, min(dist_cm, max_cm))
    filled_len = int((clamped / max_cm) * width)
    
    if dist_cm < DISTANCE_BANDS[30][0]:
        color = RED
    elif dist_cm <= DISTANCE_BANDS[30][1]:
        color = GREEN
    elif dist_cm < DISTANCE_BANDS[45][0]:
        color = RED
    elif dist_cm <= DISTANCE_BANDS[45][1]:
        color = BLUE
    elif dist_cm < DISTANCE_BANDS[60][0]:
        color = RED
    elif dist_cm <= DISTANCE_BANDS[60][1]:
        color = MAGENTA
    else:
        color = YELLOW

    bar = "█" * filled_len + "░" * (width - filled_len)
    return f"{color}[{bar}]{RESET} {dist_cm:.1f} cm"


def write_storage_json(data: Dict[str, Any]) -> bool:
    """Menulis hasil pengukuran ke storage/app/distance_reading.json agar langsung terbaca Laravel."""
    try:
        STORAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp_file = STORAGE_FILE.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        temp_file.replace(STORAGE_FILE)
        return True
    except Exception as e:
        print(f"{RED}[WARN] Gagal menulis ke {STORAGE_FILE}: {e}{RESET}", file=sys.stderr)
        return False


def post_to_backend(api_url: str, data: Dict[str, Any]) -> bool:
    """Mengirim data jarak ke endpoint backend Laravel /api/distance/update."""
    try:
        import requests
        resp = requests.post(api_url, json=data, timeout=1.5)
        return resp.status_code == 200
    except Exception:
        return False


# =============================================================================
# 1. HARDWARE SERIAL DISTANCE SENSOR READER (ToF / Ultrasonic)
# =============================================================================
class SerialDistanceSensor:
    def __init__(self, port: str, baudrate: int = 9600, timeout: float = 1.0):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.ser = None
        self._init_serial()

    def _init_serial(self):
        try:
            import serial
            self.ser = serial.Serial(self.port, self.baudrate, timeout=self.timeout)
            time.sleep(1.0)
            print(f"{GREEN}[OK] Terhubung ke sensor hardware jarak pada {self.port} ({self.baudrate} baud){RESET}")
        except Exception as e:
            print(f"{RED}[ERROR] Gagal membuka port serial {self.port}: {e}{RESET}", file=sys.stderr)
            self.ser = None

    def read_distance(self) -> Optional[float]:
        if not self.ser or not self.ser.is_open:
            return None
        try:
            line = self.ser.readline().decode("utf-8", errors="ignore").strip()
            if not line:
                return None
            
            # Format JSON: {"distance_cm": 31.4}
            if "{" in line and "}" in line:
                try:
                    js = json.loads(line)
                    if "distance_cm" in js:
                        return float(js["distance_cm"])
                    elif "distance" in js:
                        return float(js["distance"])
                except Exception:
                    pass
            
            # Format String / Regex: "31.4", "DIST: 31.4 cm", "DIST: 314 mm"
            if "mm" in line.lower():
                matches = re.findall(r"[-+]?(?:\d*\.\d+|\d+)", line)
                if matches:
                    return float(matches[0]) / 10.0 # konversi mm ke cm
            
            matches = re.findall(r"[-+]?(?:\d*\.\d+|\d+)", line)
            if matches:
                val = float(matches[0])
                if 5.0 <= val <= 500.0:
                    return val
        except Exception as e:
            print(f"{YELLOW}[WARN] Error membaca serial: {e}{RESET}", file=sys.stderr)
        return None

    def close(self):
        if self.ser and self.ser.is_open:
            self.ser.close()


def scan_com_ports():
    """Memindai seluruh port COM serial yang tersedia di sistem."""
    try:
        import serial.tools.list_ports
        ports = list(serial.tools.list_ports.comports())
        print(f"\n{BOLD}{CYAN}=== DAFTAR PORT COM SERIAL TERSEDIA ==={RESET}")
        if not ports:
            print("  [INFO] Tidak ada perangkat serial / sensor jarak yang terdeteksi.")
        else:
            for p in ports:
                print(f"  - {BOLD}{p.device}{RESET}: {p.description} (HWID: {p.hwid})")
        print("=========================================\n")
    except ImportError:
        print(f"{RED}[ERROR] Module 'pyserial' belum terpasang. Jalankan: pip install pyserial{RESET}")


# =============================================================================
# 2. CAMERA OPTICAL FACE DISTANCE ESTIMATOR
# =============================================================================
class CameraFaceDistance:
    """
    Estimasi jarak wajah ke kamera menggunakan model pinhole optik antropometri:
    D = (W_real * f) / W_pixel = K / face_ratio
    Rata-rata lebar wajah dewasa: ~14.0 cm, jarak interokular: ~6.3 cm
    K_calibration ~ 12.6 untuk face width pada webcam 65-72 derajat FOV.
    """
    def __init__(self, camera_index: int = 0):
        self.camera_index = camera_index
        self.cap = None
        self.face_cascade = None
        self._init_detector()

    def _init_detector(self):
        try:
            import cv2
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
        except Exception as e:
            print(f"{YELLOW}[WARN] Tidak dapat memuat detector Haar Cascade: {e}{RESET}")

    def open(self) -> bool:
        try:
            import cv2
            self.cap = cv2.VideoCapture(self.camera_index)
            if not self.cap.isOpened():
                return False
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            return True
        except Exception as e:
            print(f"{RED}[ERROR] Gagal membuka kamera {self.camera_index}: {e}{RESET}", file=sys.stderr)
            return False

    def read_distance(self) -> Optional[float]:
        if not self.cap or not self.cap.isOpened() or self.face_cascade is None:
            return None
        ret, frame = self.cap.read()
        if not ret or frame is None:
            return None

        import cv2
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        h, w = frame.shape[:2]

        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(int(w * 0.1), int(h * 0.1))
        )

        if len(faces) == 0:
            return None

        # Pilih wajah terbesar (terdekat dengan kamera)
        faces_sorted = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
        _, _, fw, _ = faces_sorted[0]

        # Rasio lebar wajah terhadap lebar frame
        width_ratio = float(fw) / float(w)
        if width_ratio <= 0.01:
            return None

        # Rumus jarak optik pinhole (K_CALIB ~ 12.6)
        # Pada 30cm: ratio ~ 0.42 -> 12.6 / 0.42 = 30.0 cm
        # Pada 45cm: ratio ~ 0.28 -> 12.6 / 0.28 = 45.0 cm
        # Pada 60cm: ratio ~ 0.21 -> 12.6 / 0.21 = 60.0 cm
        estimated_cm = 12.60 / width_ratio
        clamped = max(15.0, min(120.0, estimated_cm))
        return round(clamped, 1)

    def close(self):
        if self.cap:
            self.cap.release()


# =============================================================================
# 3. PRESETS PENGUJIAN SKRIPSI COCHRAN'S Q (30cm, 45cm, 60cm)
# =============================================================================
RESEARCH_DISTANCE_PRESETS = {
    "30": 30.0,
    "30cm": 30.0,
    "ideal": 45.0,
    "baku": 30.0,
    "45": 45.0,
    "45cm": 45.0,
    "sedang": 45.0,
    "60": 60.0,
    "60cm": 60.0,
    "jauh": 60.0,
}


# =============================================================================
# 4. MAIN RUNNER & CLI INTERFACE
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="Skrip Pengukuran Jarak Wajah ke Kamera (Live Distance Sensor) — FaceNet + EMAR"
    )
    parser.add_argument("--mode", choices=["hardware", "camera", "preset", "set"], default=None,
                        help="Mode pengukuran: hardware (serial port ToF/Ultrasonic), camera (webcam geometri wajah), preset (30/45/60cm), set (nilai tetap)")
    parser.add_argument("--port", type=str, default=None, help="Port COM serial hardware (contoh: COM3, /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=9600, help="Baudrate serial sensor (default: 9600)")
    parser.add_argument("--camera", type=int, default=0, help="Index webcam untuk estimasi optik (default: 0)")
    parser.add_argument("--preset", choices=["30", "30cm", "ideal", "45", "45cm", "sedang", "60", "60cm", "jauh"], default=None,
                        help="Preset jarak baku skripsi: 30cm (Dekat), 45cm/ideal (Ideal), 60cm (Jauh)")
    parser.add_argument("--set", type=float, default=None, help="Atur nilai jarak cm manual secara langsung")
    parser.add_argument("--scan-ports", action="store_true", help="Pindai dan tampilkan daftar port serial yang tersedia")
    parser.add_argument("--sync", action="store_true", default=True, help="Sinkronkan hasil pengukuran ke attendance-web/storage dan API Laravel")
    parser.add_argument("--api-url", type=str, default=DEFAULT_API_URL, help=f"URL endpoint backend Laravel (default: {DEFAULT_API_URL})")
    parser.add_argument("--interval", type=float, default=0.5, help="Interval loop pengukuran dalam detik (default: 0.5s)")
    parser.add_argument("--once", action="store_true", help="Ukur satu kali, simpan, cetak JSON, lalu keluar")
    parser.add_argument("--quiet", action="store_true", help="Jangan tampilkan dashboard interaktif (hanya log)")

    args = parser.parse_args()

    if args.scan_ports:
        scan_com_ports()
        return

    # Tentukan Mode Operasi
    mode = args.mode
    if args.set is not None:
        mode = "set"
    elif args.preset is not None:
        mode = "preset"
    elif args.port is not None:
        mode = "hardware"
    elif mode is None:
        mode = "camera"

    # Setup Provider
    serial_sensor = None
    cam_sensor = None
    source_name = mode
    device_name = "Distance Sensor"

    if mode == "hardware":
        if not args.port:
            print(f"{RED}[ERROR] Mode hardware memerlukan parameter --port (contoh: --port COM3).{RESET}")
            scan_com_ports()
            sys.exit(1)
        serial_sensor = SerialDistanceSensor(args.port, baudrate=args.baud)
        source_name = "hardware_serial"
        device_name = f"Serial Rangefinder ({args.port})"
    elif mode == "camera":
        cam_sensor = CameraFaceDistance(camera_index=args.camera)
        if not cam_sensor.open():
            print(f"{YELLOW}[WARN] Tidak dapat membuka webcam index {args.camera}. Beralih ke preset 30 cm.{RESET}")
            mode = "preset"
            args.preset = "30"
        else:
            source_name = "camera_face_geometry"
            device_name = f"Webcam Face Geometry (Cam {args.camera})"

    if not args.quiet and not args.once:
        print("=" * 65)
        print(f"{BOLD}{CYAN} PENGUKURAN JARAK WAJAH (LIVE SENSOR) — SKRIPSI QALWANI ANUGERAH{RESET}")
        print(f" Mode Sumber      : {BOLD}{source_name.upper()}{RESET}")
        print(f" Perangkat/Sensor : {device_name}")
        print(f" Sinkronisasi     : {GREEN}AKTIF{RESET} -> {STORAGE_FILE.name} & {args.api_url}")
        print(f" Tekan Ctrl+C untuk menghentikan pengukuran.")
        print("=" * 65)

    last_valid_dist = 30.0

    try:
        while True:
            current_dist: Optional[float] = None

            if mode == "set":
                current_dist = float(args.set)
                source_name = "manual_set"
                device_name = "CLI Manual Input"
            elif mode == "preset":
                preset_key = (args.preset or "30").lower()
                current_dist = RESEARCH_DISTANCE_PRESETS.get(preset_key, 30.0)
                source_name = "research_preset"
                device_name = f"ISO/IEC 30107 Preset ({preset_key})"
            elif mode == "hardware" and serial_sensor:
                current_dist = serial_sensor.read_distance()
            elif mode == "camera" and cam_sensor:
                current_dist = cam_sensor.read_distance()

            if current_dist is None:
                current_dist = last_valid_dist
                raw_reading = "NO_FACE_DETECTED"
            else:
                last_valid_dist = current_dist
                raw_reading = current_dist

            condition, code, desc, is_ideal, benchmark = categorize_distance(current_dist)
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z")

            payload = {
                "distance_cm": round(current_dist, 1),
                "condition": condition,
                "condition_code": code,
                "condition_desc": desc,
                "is_ideal": is_ideal,
                "benchmark": benchmark,
                "source": source_name,
                "device": device_name,
                "raw_reading": raw_reading,
                "updated_at": now_iso,
            }

            # 1. Sinkronisasi ke disk storage
            if args.sync:
                write_storage_json(payload)
                # 2. Sinkronisasi ke API Laravel
                post_to_backend(args.api_url, payload)

            # Tampilan Output
            if args.once:
                print(json.dumps(payload, indent=2))
                break

            if not args.quiet:
                status_badge = f"{GREEN}[IDEAL 45CM]{RESET}" if is_ideal else f"{YELLOW}[{code}]{RESET}"
                ruler = format_distance_bar(current_dist)
                
                sys.stdout.write(
                    f"\r\033[K"
                    f"{BOLD}{time.strftime('%H:%M:%S')}{RESET} | "
                    f"Ruler: {ruler} | "
                    f"Status: {BOLD}{condition}{RESET} {status_badge}"
                )
                sys.stdout.flush()

            time.sleep(args.interval)

    except KeyboardInterrupt:
        if not args.quiet and not args.once:
            print(f"\n\n{YELLOW}[INFO] Pengukuran jarak dihentikan oleh pengguna.{RESET}")
    finally:
        if serial_sensor:
            serial_sensor.close()
        if cam_sensor:
            cam_sensor.close()


if __name__ == "__main__":
    main()
