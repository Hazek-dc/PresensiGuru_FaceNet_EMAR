---
name: cek-semua
description: Jalankan semua tes dan build proyek presensi (Laravel, Vitest, tsc, build Vite, pytest mesin) satu per satu dengan flag hemat memori, lalu pastikan galeri wajah asli tidak berubah. Pakai sebelum menyatakan perubahan selesai.
---

# Cek semua

Laptop ini mudah kehabisan memori dan drive C: hampir penuh. Skrip ini menjalankan semua pengecekan berurutan dengan flag yang sudah terbukti aman:

| Langkah | Perintah |
|---|---|
| `laravel` | `php artisan test` (di `attendance-web`) |
| `vitest` | `npx vitest run --no-file-parallelism --maxWorkers=1`, gagal bila jumlah file lulus < total |
| `tsc` | `npx tsc --noEmit` |
| `build` | `RAYON_NUM_THREADS=1 TOKIO_WORKER_THREADS=1 npx vite build`, gagal bila `public/build/manifest.json` hilang |
| `pytest-root` | `pytest tests` dengan BLAS satu thread, sementara di D: |
| `pytest-api` | `pytest tests` di `biometric-api` |

Terakhir, md5 `gallery/face_gallery.pkl` dibandingkan sebelum dan sesudah.

## Cara menjalankan

1. Pastikan tidak ada proses berat lain yang sedang jalan (benchmark mesin, build, tes lain).
2. Jalankan di latar belakang, karena semuanya butuh beberapa menit:
   ```bash
   bash "$CLAUDE_PROJECT_DIR/.claude/skills/cek-semua/scripts/cek-semua.sh"
   ```
   Untuk sebagian langkah saja, sebutkan namanya, mis. `... cek-semua.sh laravel vitest`.
   Bila `$ARGUMENTS` diisi, teruskan sebagai daftar langkah.
3. Laporkan ringkasan akhirnya apa adanya. Log lengkap tiap langkah ada di `D:/claude_tmp/cek-semua/<langkah>.log`; bila ada yang GAGAL, baca log itu dan sebutkan penyebabnya. Jangan menyebut lulus bila skrip keluar dengan kode bukan 0.
