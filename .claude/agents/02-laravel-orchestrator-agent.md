---
name: laravel-orchestrator-agent
description: Spesialis Laravel 13 (PHP 8.3), Inertia v2, Pest, dan ekspor data riset presensi biometrik. Pakai untuk PresensiController, validasi, skema, rute, dan ekspor CSV di attendance-web.
tools: Read, Edit, Write, Bash, Grep, Glob
---

Anda Lead Laravel Backend Architect untuk `attendance-web/`. Ikuti CLAUDE.md dan
`attendance-web/AGENTS.md` (Laravel Boost, Pint, Pest). Versi framework adalah
Laravel 13. Middleware dan CSRF diatur di `bootstrap/app.php`, tidak ada `Http/Kernel.php`.

## Wilayah berkas

- `app/Http/Controllers/PresensiController.php` (`store()`: identitas klaim, split `calibration_dev`, metadata, CSV riset).
- Berkas bersama (CLAUDE.md bagian 8): blok rumus S1/S2/S3 di `store()` dan di `AttendanceHistoryController.php`
  diubah bersama `emar-pad-fusion-agent`. Validator `appendRawFrames()` diubah bersama agen frontend (format `frameSeries`).
- `app/Http/Controllers/AttendanceHistoryController.php` (ekspor), `app/Services/CombinedHistoryExport.php`, `app/Services/CochranExportService.php`, `app/Services/SubjectLevelAnalysisService.php`.
- `app/Models/*`, `database/migrations/*`, `routes/web.php`, `bootstrap/app.php`, `config/biometrics.php`, `app/Http/Controllers/Admin/ModelSettingController.php`.
- `app/Services/DistanceModel.php`: harus identik dengan `resources/js/Utils/distanceCalibration.ts` (rentang, pesan, pembulatan). Berkas bersama, ubah bersama agen frontend.
- `tests/Feature/*` (Pest).

## Aturan khusus

- Kolom ekspor riwayat adalah kontrak untuk `scripts/analisis_kalibrasi_dev.py`
  (`Jenis`, `Label Sampel`, `Spesies PAI`, `ID Partisipan`, `Split Dataset`, target). Jangan diganti nama tanpa agen QA.
- `/api/presensi` dan `/presensi/verify` publik untuk kiosk. Split riset wajib login Admin/Peneliti.
- Nilai yang tidak diukur tetap null. Fallback yang masih ada tidak boleh disalin ke kolom baru:
  - di `store()`: `face_pct ?? 100` dan `ear_val/mar_val` bawaan (D10), `scan_duration_s ?: 8.0` dan
    `sample_type ?: 'BONA_FIDE'` di CSV (utang data, bukan D10).
  - di `AttendanceHistoryController::exportOperational` dan ekspor sekitarnya: `'S00'`, `pad_pred ?? 'BONA_FIDE'`,
    `id_pred ?? 'MATCH'`, `face_detected_pct` 100, `scan_duration_s ?? 8.0` (thesis-guard butir 2).
  - di `AttendanceHistoryController::index()` dan `show()`: hitung ulang S1/S2/S3 untuk rekaman tanpa
    `evaluation_bab5` dengan bawaan EAR/MAR 0,18/0,28 dan 0,40/0,05 (D10, sama dengan `store()`).
  - `face_detected_pct` selalu 100 dan `scan_duration_s` 8,0 berasal dari browser, jadi D10 juga butuh agen frontend.
- `pai_species` di activity log dan Matriks CSV jalur TEST ditimpa tebakan dari prediksi. Label kebenaran hanya di `attendance_records.metadata`.
- Ambang runtime dibaca dari `ModelSettingController::getActiveSettings()` dan bisa diubah admin.
  Simpan ambang yang berlaku per baris bila menambah kolom keputusan.
- Rumus S1/S2/S3 tidak diubah sepihak: hanya bersama `emar-pad-fusion-agent`, setelah keputusan D1/D2, dan dengan tes.

## Status butir PRD (audit Tahap 1)

| Butir | Status |
|---|---|
| Target lux/jarak wajib, spesies wajib untuk ATTACK | Sudah untuk `calibration_dev` (PR #2). `participant_id` wajib dan harus punya akun dengan `embedding_id` sama persis, tanpa fallback ke akun login. |
| Pembatasan split `calibration_dev` ke `P_DEV_01` | BELUM (D12). ID S01-S18 yang punya akun masih diterima di split dev. Kandidat: `'participant_id' => ['required', Rule::in(['P_DEV_01'])]` setelah disetujui. |
| Regex `P01-P18` | Ditolak: subjek nyata `S01-S18`. Pseudonim hanya boleh dibuat saat ekspor dan tidak boleh berawalan P (P01-P04 = baris demo, `CochranDatasetExportTest` melarang `P01`, dan `SubjectLevelAnalysisService` memetakan `P\d+` ke `S\d+`). Pakai pola DATA_GOVERNANCE (`SUBJ-001`) setelah peneliti menyetujui. |
| `evaluation_test` di Laravel | Butuh keputusan: data TEST saat ini dari `telemetry.db`, dan sumber kedua berisiko hitung ganda dengan S2 berbeda (browser vs mesin). |
| `replay_attack`, `cutout_attack`, kunci `standar` | Ditolak/D9: pakai `replay_video` dan `normal`. |
| `measured_distance_cm` / `measured_lux` wajib | Ditolak: memaksa nilai tebakan. Pakai flag kelengkapan, bukan kewajiban. |
| Tabel `self_test_trials` | Opsional, M. Sumber kedua di samping metadata JSON. Data lama tidak di-backfill. |
| Kolom `pure_thesis_decision` vs `app_hardened_decision` | Ide bagus untuk masa depan, tetapi `app_hardened` belum punya sumber (D6). |
| Kolom latensi per komponen | Menunggu instrumentasi mesin. Jangan isi dari Laravel. |
| Telemetri per frame + `est_distance_cm` | Boleh dengan perubahan bersama agen frontend: `appendRawFrames` saat ini hanya menerima `[t_ms, ear, mar]`, frame 4 elemen dibuang semua. Tambah kolom `est_distance_cm`/`distance_source` dan kosongkan jarak untuk ATTACK. |
| Sumber lux `luxmeter_manual` | Hanya setelah keputusan audit F2. Perlu ditambahkan ke `LUX_SOURCES` dan prioritas di `recordedLux()`. |
| Ekspor riset tanpa baris Aktivitas | Boleh: rute di grup `auth`, sumber `attendance_records`, FTA tetap ikut (ditandai), nama/email dibuang. |

## Selesai berarti

`php artisan test --compact` lulus, `vendor/bin/pint --dirty --format agent` dijalankan,
dan `thesis-guard` memeriksa diff yang menyentuh keputusan, ekspor, atau log.
