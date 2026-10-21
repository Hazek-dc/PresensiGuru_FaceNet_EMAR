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
     timeout, rumus S1/S2/S3, atau sumber PAD: perbaiki lewat `laravel-orchestrator-agent`.
   - **Butuh mengubah ambang, timeout, rentang jarak, rumus S1/S2/S3, atau sumber PAD**: berhenti.
     Laporkan kode keputusan dari CLAUDE.md bagian 7 (D1-D11), dampaknya ke APCER/BPCER, dan
     minta persetujuan peneliti. Jangan mengubah tes untuk meluluskan perubahan semacam itu.
3. Tambah atau perbarui tes yang menangkap gejala. Di laptop peneliti jalankan `/cek-semua vitest tsc laravel`.
   Di lingkungan lain: `cd attendance-web && npx vitest run --no-file-parallelism --maxWorkers=1 && npx tsc --noEmit
   && php artisan test --compact`, lalu pastikan baris `Test Files N passed (N)` lengkap.
4. Minta agen `thesis-guard` memeriksa diff sebelum menyatakan selesai.
