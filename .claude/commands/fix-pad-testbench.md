---
description: Perbaiki masalah uji PAD di Studio /presensi tanpa mengubah ambang atau rumus keputusan. Argumen = gejala yang dilihat (mis. "timeout tantangan saat uji solo di 60 cm").
---

Gejala yang dilaporkan: $ARGUMENTS

Ikuti CLAUDE.md. Langkah:

1. Reproduksi gejala dari kode: telusuri jalurnya di `FaceScannerContainer.tsx`, `Utils/emarGeometry.ts`,
   `Utils/soloSession.ts`, dan `PresensiController::store()`. Sebutkan penyebab dengan `file:line`.
2. Klasifikasikan penyebabnya:
   - **Cacat UI/alur** (instruksi tidak terdengar, panel tidak menampilkan status, antrean tidak lanjut):
     perbaiki lewat `frontend-mediapipe-agent`.
   - **Cacat alur di `PresensiController::store()`** (validasi, penyimpanan, label) yang tidak mengubah ambang,
     timeout, rumus S1/S2/S3, atau sumber PAD dan tidak menyentuh butir mana pun di CLAUDE.md bagian 7:
     perbaiki lewat `laravel-orchestrator-agent`.
   - **Butuh mengubah ambang, timeout, rentang jarak, rumus S1/S2/S3, sumber PAD, atau butir lain di CLAUDE.md
     bagian 7** (mis. nilai bawaan `face_pct`/EAR/MAR = D10, spesies PAI baru = D9, aturan FTA = D7, validasi split
     `calibration_dev` = D12): berhenti. Laporkan kode keputusannya dari CLAUDE.md bagian 7, dampaknya ke APCER/BPCER, dan
     minta persetujuan peneliti. Jangan mengubah tes untuk meluluskan perubahan semacam itu.
3. Tambah atau perbarui tes yang menangkap gejala. Di laptop peneliti jalankan `/cek-semua vitest tsc build laravel`.
   Di lingkungan lain: `cd attendance-web && npx vitest run --no-file-parallelism --maxWorkers=1 && npm run build
   && php artisan test --compact` (`npm run build` = `tsc` + `vite build`), lalu pastikan baris
   `Test Files N passed (N)` lengkap. Bila PHP berubah, jalankan juga `vendor/bin/pint --dirty --format agent`.
4. Minta agen `thesis-guard` memeriksa diff sebelum menyatakan selesai.
