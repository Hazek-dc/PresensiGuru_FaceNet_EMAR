# Project Contract

**Project Title:** Face Verification FaceNet + EMAR untuk Presensi SMK Al-Madani
**Date:** 15 Juli 2026

## 1. Primary Objectives
Membangun sistem presensi berbasis verifikasi wajah 1:1 dan *Presentation Attack Detection* (PAD) menggunakan EMAR (Eye and Mouth Aspect Ratio). Sistem harus memastikan:
1. Akurasi verifikasi identitas (FaceNet) yang tinggi pada subjek terdaftar.
2. Keamanan dari serangan presentasi sederhana (print, screen, replay) melalui pengujian liveness.
3. Rekaman presensi yang sah, akurat, dan menolak klaim palsu serta serangan.

## 2. Constraints & Limitations
- Sistem beroperasi dalam mode 1:1 (*verification*), **bukan** 1:N (*identification*). Subjek harus mengklaim identitasnya sebelum verifikasi.
- Sistem akan diuji di lapangan secara deterministik. Toleransi kegagalan dan kesalahan metrik ditentukan oleh batas evaluasi ISO 30107-3.
- Akses ke data biometrik nyata (wajah, NIP, metadata PII) sangat dibatasi dan di-hash; tidak boleh ada kebocoran ke repositori kode atau log aplikasi.

## 3. Commitments
- **Peneliti** berkomitmen membekukan konfigurasi (threshold, split, label) sebelum fase TEST dan tidak mengubah data demi hasil yang lebih baik.
- **Pengembang (Antigravity Pro)** berkomitmen memisahkan sesi pembuatan (BUILD) dan pengujian (AUDIT), serta mengikuti spesifikasi teknis tanpa perbaikan terselubung (silent bypasses).
