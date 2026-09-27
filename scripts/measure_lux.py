#!/usr/bin/env python3
"""
=============================================================================
PENGUKURAN INTENSITAS CAHAYA (LUXOMETER) — SKRIPSI FACENET + EMAR
Penelitian : "Analisis Kinerja FaceNet dan Eye-Mouth Aspect Ratio (EMAR)
              pada Sistem Face Verification Mitigasi Serangan Spoofing Presensi"
Peneliti   : Qalwani Anugerah — NPM 221220048 — UMP 2026
=============================================================================

Fitur Utama:
1. Pembacaan Sensor Hardware (Luxmeter Digital via USB/Serial COM port atau Arduino/ESP32 BH1750/TSL2561).
2. Estimasi Fotometri Optik Kamera (OpenCV Frame Luminance Y = 0.2126R + 0.7152G + 0.0722B terkalibrasi ke Lux).
3. Preset Pengujian ISO/IEC 30107-3 & Uji Cochran's Q (Redup: <100 Lux, Standar: 100-300 Lux, Terang: >300 Lux).
4. Sinkronisasi Otomatis ke Backend Laravel (storage/app/lux_reading.json & POST /api/lux/update).
5. Visualisasi Real-Time Terminal Gauge & Mode Single-Shot (--once) untuk otomasi.
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
STORAGE_FILE = BASE_DIR / "attendance-web" / "storage" / "app" / "lux_reading.json"
CALIBRATION_FILE = BASE_DIR / "attendance-web" / "storage" / "app" / "lux_calibration.json"
DEFAULT_API_URL = "http://127.0.0.1:8000/api/lux/update"

sys.path.insert(0, str(BASE_DIR))
from parameter_penelitian import LUX_NORMAL_MAX, LUX_REDUP_MAX  # noqa: E402

def load_calibration() -> Dict[str, float]:
    """Memuat faktor kalibrasi dari storage jika tersedia."""
    try:
        if CALIBRATION_FILE.exists():
            with open(CALIBRATION_FILE, "r", encoding="utf-8") as f:
                d = json.load(f)
                return {
                    "factor": float(d.get("factor", 1.0)),
                    "offset": float(d.get("offset", 0.0)),
                }
    except Exception:
        pass
    return {"factor": 1.0, "offset": 0.0}

def save_calibration(factor: float, offset: float = 0.0, profile: str = "custom") -> bool:
    """Menyimpan faktor kalibrasi kamera secara persisten."""
    try:
        CALIBRATION_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CALIBRATION_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "profile": profile,
                "factor": round(factor, 3),
                "offset": round(offset, 1),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")
            }, f, indent=2)
        return True
    except Exception as e:
        print(f"[WARN] Gagal menyimpan kalibrasi ke {CALIBRATION_FILE}: {e}", file=sys.stderr)
        return False

# ANSI Colors for Terminal Dashboard
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RED = "\033[91m"
CYAN = "\033[96m"


def categorize_lux(lux: float) -> Tuple[str, str, str, bool]:
    """
    Kategori pencahayaan berdasarkan ISO/IEC 30107-3 & Desain Eksperimen Skripsi (Subbab 5.2):
    - Redup   (LOW)    : < 100 Lux
    - Standar (NORMAL) : 100 - 300 Lux, kedua batas inklusif (Kondisi optimal verifikasi biometrik)
    - Terang  (HIGH)   : > 300 Lux
    """
    if lux < LUX_REDUP_MAX:
        return "Redup", "LOW", f"Pencahayaan Rendah (< {LUX_REDUP_MAX:.0f} Lux)", False
    elif lux <= LUX_NORMAL_MAX:
        return "Standar", "NORMAL", f"Pencahayaan Standar Optimal ({LUX_REDUP_MAX:.0f} - {LUX_NORMAL_MAX:.0f} Lux)", True
    else:
        return "Terang", "HIGH", f"Pencahayaan Tinggi (> {LUX_NORMAL_MAX:.0f} Lux)", False


def format_gauge_bar(lux: float, max_val: float = 1000.0, width: int = 30) -> str:
    """Membuat visualisasi horizontal gauge bar di terminal."""
    clamped = max(0.0, min(lux, max_val))
    filled_len = int((clamped / max_val) * width)
    
    if lux < LUX_REDUP_MAX:
        color = YELLOW
    elif lux <= LUX_NORMAL_MAX:
        color = GREEN
    else:
        color = BLUE

    bar = "█" * filled_len + "░" * (width - filled_len)
    return f"{color}[{bar}]{RESET} {lux:.1f} Lux"


def write_storage_json(data: Dict[str, Any]) -> bool:
    """Menulis hasil pengukuran ke storage/app/lux_reading.json agar langsung terbaca Laravel."""
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
    """Mengirim data lux ke endpoint backend Laravel /api/lux/update."""
    try:
        import requests
        resp = requests.post(api_url, json=data, timeout=1.5)
        return resp.status_code == 200
    except Exception:
        return False


# =============================================================================
# 1. HARDWARE SERIAL LUXOMETER READER
# =============================================================================
class SerialLuxMeter:
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
            time.sleep(1.0) # Waktu settling koneksi serial
            print(f"{GREEN}[OK] Terhubung ke sensor hardware luxmeter pada {self.port} ({self.baudrate} baud){RESET}")
        except Exception as e:
            print(f"{RED}[ERROR] Gagal membuka port serial {self.port}: {e}{RESET}", file=sys.stderr)
            self.ser = None

    def read_lux(self) -> Optional[float]:
        if not self.ser or not self.ser.is_open:
            return None
        try:
            line = self.ser.readline().decode("utf-8", errors="ignore").strip()
            if not line:
                return None
            
            # Format JSON: {"lux": 345.2}
            if "{" in line and "}" in line:
                try:
                    js = json.loads(line)
                    if "lux" in js:
                        return float(js["lux"])
                except Exception:
                    pass
            
            # Format Regex: "345.2" atau "LUX: 345.2" atau "345 Lux"
            matches = re.findall(r"[-+]?(?:\d*\.\d+|\d+)", line)
            if matches:
                val = float(matches[0])
                if 0.0 <= val <= 100000.0:
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
            print("  [INFO] Tidak ada perangkat serial / luxmeter yang terdeteksi.")
        else:
            for p in ports:
                print(f"  - {BOLD}{p.device}{RESET}: {p.description} (HWID: {p.hwid})")
        print("=========================================\n")
    except ImportError:
        print(f"{RED}[ERROR] Module 'pyserial' belum terpasang. Jalankan: pip install pyserial{RESET}")


# =============================================================================
# 2. CAMERA OPTICAL PHOTOMETRY LUX ESTIMATOR
class CameraPhotometry:
    """
    Estimasi intensitas cahaya ruangan (Lux) melalui kamera yang mengarah ke objek manusia.
    Fitur Presisi:
    1. Multi-Frame Burst Averaging (eliminasi flicker 50Hz/60Hz AC)
    2. Deteksi Objek Wajah Manusia (Haar Cascade frontal face)
    3. Filter Pendaran Cahaya Layar (Screen Glare Discount) di ruang gelap
    4. Auto-Exposure Control (AEC/AGC) Inversion & Model Reflektansi Kulit Manusia (rho ≈ 0.35)
    5. Hardware Exposure Shutter Query via CAP_PROP_EXPOSURE / CAP_PROP_GAIN jika didukung driver
    """
    def __init__(self, camera_index: int = 0, calib_factor: float = 1.0, calib_offset: float = 0.0):
        self.camera_index = camera_index
        self.calib_factor = calib_factor
        self.calib_offset = calib_offset
        self.cap = None
        self.face_cascade = None

    def open(self) -> bool:
        try:
            import cv2
            self.cap = cv2.VideoCapture(self.camera_index)
            if not self.cap.isOpened():
                return False
            # Atur resolusi sampling cepat
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

            # Inisialisasi Haar Cascade Face Detector untuk mengunci objek manusia
            try:
                cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
                self.face_cascade = cv2.CascadeClassifier(cascade_path)
            except Exception:
                self.face_cascade = None

            return True
        except Exception as e:
            print(f"{RED}[ERROR] Gagal membuka kamera {self.camera_index}: {e}{RESET}", file=sys.stderr)
            return False

    def read_lux(self) -> Optional[float]:
        if not self.cap or not self.cap.isOpened():
            return None

        import cv2
        import numpy as np

        # Multi-frame burst sampling (3 frames) untuk eliminasi flicker lampu listrik 50Hz/60Hz
        frames = []
        for _ in range(3):
            ret, f = self.cap.read()
            if ret and f is not None:
                frames.append(f)
            time.sleep(0.02)

        if not frames:
            return None

        avg_frame = np.mean(frames, axis=0).astype(np.uint8)
        h, w = avg_frame.shape[:2]
        gray_full = cv2.cvtColor(avg_frame, cv2.COLOR_BGR2GRAY)

        # 1. Deteksi Objek Manusia (Wajah) vs Ruangan Sekitar
        cw_start, cw_end = int(w * 0.30), int(w * 0.70)
        ch_start, ch_end = int(h * 0.20), int(h * 0.75)
        center_roi = avg_frame[ch_start:ch_end, cw_start:cw_end]
        gray_center = cv2.cvtColor(center_roi, cv2.COLOR_BGR2GRAY)

        mean_face_y = float(np.mean(gray_center))
        is_face_targeted = False

        if self.face_cascade and not self.face_cascade.empty():
            try:
                faces = self.face_cascade.detectMultiScale(
                    gray_full,
                    scaleFactor=1.1,
                    minNeighbors=4,
                    minSize=(60, 60),
                )
                if len(faces) > 0:
                    # Pilih wajah terbesar di depan kamera
                    fx, fy, fw, fh = max(faces, key=lambda b: b[2] * b[3])
                    # Inset 10% untuk fokus pada kulit dahi/pipi
                    f_roi = avg_frame[fy + int(fh * 0.1):fy + int(fh * 0.9), fx + int(fw * 0.1):fx + int(fw * 0.9)]
                    if f_roi.size > 0:
                        mean_face_y = float(np.mean(cv2.cvtColor(f_roi, cv2.COLOR_BGR2GRAY)))
                        is_face_targeted = True
            except Exception:
                pass

        mean_ambient_y = float(np.mean(gray_full))

        # 2. Filter Eliminasi Pendaran Cahaya Layar (Screen Glare Discount)
        # Jika ruangan gelap (ambient < 35) tetapi wajah menyala akibat layar monitor
        effective_face_y = mean_face_y
        if mean_ambient_y < 65.0 and mean_face_y > mean_ambient_y * 1.4:
            screen_glare_bonus = mean_face_y - mean_ambient_y * 1.2
            effective_face_y = max(mean_ambient_y, mean_face_y - screen_glare_bonus * 0.85)

        # Analisis clipping shadow (<20) dan highlight (>235)
        shadow_clip_ratio = float(np.mean(gray_full < 20))
        highlight_clip_ratio = float(np.mean(gray_full > 235))

        # 3. Periksa hardware exposure value dari driver
        exp_prop = self.cap.get(cv2.CAP_PROP_EXPOSURE)
        gain_prop = self.cap.get(cv2.CAP_PROP_GAIN)

        raw_lux = 300.0
        if exp_prop != 0 and exp_prop != -1 and not np.isnan(exp_prop):
            try:
                t_sec = 2.0 ** exp_prop if exp_prop < 0 else (exp_prop / 1000.0 if exp_prop > 1 else exp_prop)
                iso = max(100.0, gain_prop if gain_prop > 0 else 200.0)
                raw_lux = (250.0 * 4.0 / (t_sec * iso)) * (effective_face_y / 128.0)
            except Exception:
                raw_lux = 300.0
        else:
            # 4. Inversi AEC/AGC Berdasarkan Reflektansi Kulit Wajah & Cahaya Ruangan
            aec_gain_factor = 1.0
            if shadow_clip_ratio > 0.08:
                aec_gain_factor -= min(0.65, (shadow_clip_ratio - 0.08) * 2.2)
            if highlight_clip_ratio > 0.06:
                aec_gain_factor += min(1.8, highlight_clip_ratio * 3.5)

            effective_room_lum = (effective_face_y * 0.65 + mean_ambient_y * 0.35) / 255.0
            base_lux = 850.0 * (max(0.01, effective_room_lum) ** 1.75)
            raw_lux = base_lux * max(0.15, aec_gain_factor)

        # 5. Terapkan faktor kalibrasi dan offset
        calibrated_lux = (raw_lux * self.calib_factor) + self.calib_offset
        return max(5.0, round(calibrated_lux, 1))

    def close(self):
        if self.cap:
            self.cap.release()


# =============================================================================
# 3. PRESETS PENGUJIAN SKRIPSI COCHRAN'S Q & ISO/IEC 30107-3
# =============================================================================
RESEARCH_PRESETS = {
    "low": 75.0,
    "redup": 75.0,
    "normal": 200.0,
    "standar": 200.0,
    "high": 650.0,
    "terang": 650.0,
}


# =============================================================================
# 4. MAIN RUNNER & CLI INTERFACE
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="Skrip Pengukuran Lux (Luxometer) untuk Skripsi FaceNet + EMAR"
    )
    parser.add_argument("--mode", choices=["hardware", "camera", "preset", "set"], default=None,
                        help="Mode pengukuran: hardware (serial port), camera (webcam fotometri), preset (standar penelitian), set (nilai tetap)")
    parser.add_argument("--port", type=str, default=None, help="Port COM serial hardware (contoh: COM3, /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=9600, help="Baudrate serial luxmeter (default: 9600)")
    parser.add_argument("--camera", type=int, default=0, help="Index webcam untuk fotometri optik (default: 0)")
    parser.add_argument("--preset", choices=["redup", "low", "standar", "normal", "terang", "high"], default=None,
                        help="Preset pencahayaan skripsi: redup (75 Lux), standar (200 Lux), terang (650 Lux)")
    parser.add_argument("--set", type=float, default=None, help="Atur nilai Lux manual secara langsung")
    parser.add_argument("--scan-ports", action="store_true", help="Pindai dan tampilkan daftar port serial yang tersedia")
    parser.add_argument("--sync", action="store_true", default=True, help="Sinkronkan hasil pengukuran ke attendance-web/storage dan API Laravel")
    parser.add_argument("--api-url", type=str, default=DEFAULT_API_URL, help=f"URL endpoint backend Laravel (default: {DEFAULT_API_URL})")
    parser.add_argument("--interval", type=float, default=1.0, help="Interval loop pengukuran dalam detik (default: 1.0)")
    parser.add_argument("--calib-factor", type=float, default=None, help="Faktor pengali kalibrasi kamera (default: muat dari storage atau 1.0)")
    parser.add_argument("--calib-offset", type=float, default=None, help="Offset penambahan kalibrasi kamera (default: muat dari storage atau 0.0)")
    parser.add_argument("--calibrate", type=float, default=None,
                        help="Kalibrasi kamera otomatis ke nilai Lux acuan fisik (contoh: --calibrate 300) dan simpan ke lux_calibration.json")
    parser.add_argument("--once", action="store_true", help="Ukur satu kali, simpan, cetak JSON, lalu keluar")
    parser.add_argument("--quiet", action="store_true", help="Jangan tampilkan dashboard interaktif (hanya log)")

    args = parser.parse_args()

    if args.scan_ports:
        scan_com_ports()
        return

    # Mode Kalibrasi Cepat
    if args.calibrate is not None:
        target_lux = float(args.calibrate)
        print(f"\n{BOLD}{CYAN}=== KALIBRASI OTOMATIS KAMERA KE LUXMETER ACUAN ==={RESET}")
        print(f" Target Lux Fisik Acuan : {BOLD}{GREEN}{target_lux} Lux{RESET}")
        print(f" Mengakses webcam (Index {args.camera}) untuk sampling respons sensor...")
        test_cam = CameraPhotometry(camera_index=args.camera, calib_factor=1.0, calib_offset=0.0)
        if not test_cam.open():
            print(f"{RED}[ERROR] Gagal membuka webcam.{RESET}")
            sys.exit(1)

        time.sleep(1.2) # Settling kamera
        samples = []
        for _ in range(5):
            val = test_cam.read_lux()
            if val:
                samples.append(val)
            time.sleep(0.1)
        test_cam.close()

        if not samples:
            print(f"{RED}[ERROR] Gagal membaca data frame dari kamera.{RESET}")
            sys.exit(1)

        raw_avg = sum(samples) / len(samples)
        new_factor = round(target_lux / max(1.0, raw_avg), 3)
        print(f" Pembacaan Mentah Rata-rata : {raw_avg:.1f} Lux")
        print(f" Faktor Kalibrasi Terhitung : {BOLD}{GREEN}{new_factor}x{RESET}")
        save_calibration(new_factor, 0.0, profile="cli_reference_calibrated")
        print(f"{GREEN}[OK] Kalibrasi berhasil disimpan ke {CALIBRATION_FILE.name}{RESET}")
        print(" Seluruh pengukuran berikutnya otomatis menggunakan faktor kalibrasi ini.\n")
        return

    # Muat kalibrasi tersimpan
    stored_calib = load_calibration()
    active_factor = args.calib_factor if args.calib_factor is not None else stored_calib.get("factor", 1.0)
    active_offset = args.calib_offset if args.calib_offset is not None else stored_calib.get("offset", 0.0)

    # Tentukan Mode Operasi
    mode = args.mode
    if args.set is not None:
        mode = "set"
    elif args.preset is not None:
        mode = "preset"
    elif args.port is not None:
        mode = "hardware"
    elif mode is None:
        # Default auto-detect: coba hardware jika ada argumen port, sebaliknya default ke camera
        mode = "camera"

    # Setup Provider
    serial_meter = None
    cam_meter = None
    source_name = mode
    device_name = "Luxometer"

    if mode == "hardware":
        if not args.port:
            print(f"{RED}[ERROR] Mode hardware memerlukan parameter --port (contoh: --port COM3).{RESET}")
            scan_com_ports()
            sys.exit(1)
        serial_meter = SerialLuxMeter(args.port, baudrate=args.baud)
        source_name = "hardware_serial"
        device_name = f"Serial Luxometer ({args.port})"
    elif mode == "camera":
        cam_meter = CameraPhotometry(camera_index=args.camera, calib_factor=active_factor, calib_offset=active_offset)
        if not cam_meter.open():
            print(f"{YELLOW}[WARN] Tidak dapat membuka webcam index {args.camera}. Beralih ke preset Standar (200 Lux).{RESET}")
            mode = "preset"
            args.preset = "standar"
        else:
            source_name = "camera_photometry"
            device_name = f"Webcam Optical Photometry (Cam {args.camera}, Calib: {active_factor}x)"

    if not args.quiet and not args.once:
        print("=" * 65)
        print(f"{BOLD}{CYAN} PENGUKURAN LUX INTENSITAS CAHAYA — SKRIPSI QALWANI ANUGERAH{RESET}")
        print(f" Mode Sumber      : {BOLD}{source_name.upper()}{RESET}")
        print(f" Perangkat/Sensor : {device_name}")
        print(f" Sinkronisasi     : {GREEN}AKTIF{RESET} -> {STORAGE_FILE.name} & {args.api_url}")
        print(f" Tekan Ctrl+C untuk menghentikan pengukuran.")
        print("=" * 65)

    try:
        while True:
            current_lux: Optional[float] = None

            if mode == "set":
                current_lux = float(args.set)
                source_name = "manual_set"
                device_name = "CLI Manual Input"
            elif mode == "preset":
                preset_key = (args.preset or "standar").lower()
                current_lux = RESEARCH_PRESETS.get(preset_key, 200.0)
                source_name = "research_preset"
                device_name = f"ISO/IEC 30107 Preset ({preset_key.upper()})"
            elif mode == "hardware" and serial_meter:
                current_lux = serial_meter.read_lux()
            elif mode == "camera" and cam_meter:
                current_lux = cam_meter.read_lux()

            # Fallback jika sensor hardware belum mengirim data
            if current_lux is None:
                current_lux = 300.0
                raw_reading = "NO_DATA_FALLBACK"
            else:
                raw_reading = current_lux

            condition, code, desc, is_optimal = categorize_lux(current_lux)
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z")

            payload = {
                "lux": round(current_lux, 1),
                "condition": condition,
                "condition_code": code,
                "condition_desc": desc,
                "is_optimal": is_optimal,
                "source": source_name,
                "device": device_name,
                "raw_reading": raw_reading,
                "updated_at": now_iso,
            }

            # 1. Sinkronisasi ke disk storage
            if args.sync:
                write_storage_json(payload)
                # 2. Sinkronisasi ke API Laravel (Background attempt)
                post_to_backend(args.api_url, payload)

            # Tampilan Output
            if args.once:
                print(json.dumps(payload, indent=2))
                break

            if not args.quiet:
                status_badge = f"{GREEN}[OPTIMAL]{RESET}" if is_optimal else f"{YELLOW}[PERHATIAN]{RESET}"
                cond_color = YELLOW if code == "LOW" else (GREEN if code == "NORMAL" else BLUE)
                gauge = format_gauge_bar(current_lux)
                
                # Baris interaktif dengan carriage return
                sys.stdout.write(
                    f"\r\033[K"
                    f"{BOLD}{time.strftime('%H:%M:%S')}{RESET} | "
                    f"Gauge: {gauge} | "
                    f"Kondisi: {cond_color}{BOLD}{condition}{RESET} ({code}) {status_badge}"
                )
                sys.stdout.flush()

            time.sleep(args.interval)

    except KeyboardInterrupt:
        if not args.quiet and not args.once:
            print(f"\n\n{YELLOW}[INFO] Pengukuran Lux dihentikan oleh pengguna.{RESET}")
    finally:
        if serial_meter:
            serial_meter.close()
        if cam_meter:
            cam_meter.close()


if __name__ == "__main__":
    main()
