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
   - **Butuh mengubah ambang, timeout, rentang jarak, rumus S1/S2/S3, atau sumber PAD**: berhenti.
     Laporkan kode keputusan dari CLAUDE.md bagian 7 (D1-D11), dampaknya ke APCER/BPCER, dan
     minta persetujuan peneliti. Jangan mengubah tes untuk meluluskan perubahan semacam itu.
3. Tambah atau perbarui tes yang menangkap gejala, lalu jalankan
   `cd attendance-web && npx vitest run && npx tsc --noEmit && php artisan test --compact`.
4. Minta agen `thesis-guard` memeriksa diff sebelum menyatakan selesai.
