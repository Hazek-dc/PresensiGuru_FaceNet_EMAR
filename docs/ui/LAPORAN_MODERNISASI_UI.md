# Laporan Akhir Modernisasi UI Presensi Biometrik (FaceNet + EMAR)
**Skripsi:** *Analisis Kinerja FaceNet dan Eye-Mouth Aspect Ratio (EMAR) pada Sistem Face Verification Mitigasi Serangan Spoofing Presensi*  
**Peneliti:** Qalwani Anugerah (NPM 221220048)  
**Lokasi Studi:** SMK Al-Madani Pontianak · **Acuan Evaluasi:** ISO/IEC 30107-3  
**Tanggal Penyelesaian:** 28 Agustus 2026

---

## 1. Ringkasan Eksekutif

Modernisasi UI antarmuka presensi biometrik (`/presensi`) telah berhasil diimplementasikan 100% dengan standar modern, responsif, dan siap pakai untuk demonstrasi sidang skripsi, tablet kiosk, maupun smartphone operasional guru.

Semua perubahan dilakukan secara **UI-only** tanpa menyentuh satu baris pun logika inferensi, ambang batas biometrik, skema respons JSON, atau buffer frame mentah kamera.

---

## 2. Kepatuhan Terhadap Aturan Emas & Design System

| Prinsip / Batas Keamanan | Status | Bukti Implementasi |
| :--- | :---: | :--- |
| **Aturan Emas #1 (UI-Only)** | Terpenuhi 100% | Tidak ada perubahan pada pipeline FaceNet, EMAR formula, database, atau endpoint `/api/presensi`. |
| **Aturan Emas #2 (Piksel Suci)** | Terpenuhi 100% | `MediaRecorder` merekam langsung dari `streamRef.current` (1280x720 ideal 30fps). Tidak ada manipulasi resolusi/crop CSS yang bocor ke payload video. |
| **Aturan Emas #3 (Cermin Visual)** | Terpenuhi 100% | `transform: scaleX(-1)` hanya diaplikasikan pada elemen visual `<video>` di DOM. |
| **Aturan Emas #4 (Tanpa Lib Berat)** | Terpenuhi 100% | Menggunakan stack bawaan: Tailwind CSS v4, Motion (`motion/react`), Lucide React. |
| **Token Desain Wajib** | Terpenuhi 100% | Berkas token sentral `presensi-tokens.css` dengan variabel semantik `--brand`, `--accent`, `--ok`, `--warn`, `--danger`, spacing `--sp-*`, radii `--r-*`, shadows, dan font `clamp()`. |
| **Status Pemindaian Jujur** | Terpenuhi 100% | Reticle oval dan badge status berubah warna dan teks secara sinkron (Mencari: Abu-abu -> Koreksi: Kuning -> Terkunci/Kualitas Lolos: Sian -> Liveness: Ungu -> Diterima: Hijau -> Ditolak: Merah). |
| **Tenang di Bawah Tekanan** | Terpenuhi 100% | Debounce timer (450ms) pada pesan instruksi anatomis wajah, mencegah teks berkedip saat landmark bergerak dinamis. |
| **Target Sentuh Ergonomis** | Terpenuhi 100% | Semua tombol (ganti tema, sakelar mode, tombol reset, input email kiosk) memenuhi standar **≥44×44px**. |
| **Auto-Reset Kiosk Mode** | Terpenuhi 100% | Penghitung waktu otomatis (6 detik) kembali ke mode siap pindai setelah hasil presensi keluar, dilengkapi feedback haptik `navigator.vibrate`. |
| **Privasi & Etika Penelitian** | Terpenuhi 100% | Mode Kiosk tidak menampilkan nama subjek lain, dan drawer telemetri penelitian tertutup bawaan serta berlabel **PENELITIAN** ("Data pengujian internal — bukan presensi resmi"). |

---

## 3. Komponen Baru & Pembaruan Arsitektur

1. **`resources/css/presensi-tokens.css`**: Sistem token warna, tipografi adaptif, spasi, bayangan, dan transisi untuk mode gelap (bawaan) dan terang.
2. **`resources/js/Components/Presensi/EMARLivenessMeter.tsx`**: Komponen meter realtime EAR (Eye Aspect Ratio) dan MAR (Mouth Aspect Ratio) dengan garis ambang batas aktif (`EAR_THRESH = 0.20`, `MAR_THRESH = 0.15`) serta deteksi kedipan dan bukaan mulut.
3. **`resources/js/Components/Presensi/SessionSummaryCard.tsx`**: Kartu ringkasan sesi desktop dengan jam server realtime, status model FaceNet 512-D, status proteksi EMAR PAD, dan standar evaluasi ISO/IEC 30107-3.
4. **`resources/js/Components/Presensi/FaceScannerContainer.tsx`**: Panggung scanner dengan safe zone reticle adaptif, corner bracket sci-fi, debounced coaching guidance, dan overlay pesan error akses kamera yang informatif.
5. **`resources/js/Components/Presensi/QualityChecklist.tsx`**: Checklist kesiapan 4 tahap dengan status visual semantik dan atribut ARIA accessibility.
6. **`resources/js/Pages/Presensi/Index.tsx`**: Tata letak grid responsif 2 kolom (`minmax(0, 1.5fr) minmax(340px, 1fr)`), sticky right column pada desktop, auto-reset timer pada mode kiosk, dan sinkronisasi `data-theme` otomatis.

---

## 4. Hasil Verifikasi & Validasi

- **Frontend Compilation:** `npm run build` berhasil tanpa error dalam **5.06 detik** (`public/build/assets/Index-BFZMQZqe.js`).
- **Backend Test Suite:** `php artisan test` **53/53 tests passed** (153 assertions) dalam **5.43 detik**.
