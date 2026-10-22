---
description: Buat tabel kalibrasi ambang dan APCER per spesies dari data calibration_dev yang terekam (read-only terhadap data mentah). Argumen = path CSV riwayat ekspor dan, opsional, log frame.
---

Masukan: $ARGUMENTS

Ikuti CLAUDE.md bagian 5 dan 6, lewat `qa-stat-evaluator-agent`.

1. Pastikan CSV riwayat adalah ekspor nyata (`Riwayat_Presensi_dan_Log_Aktivitas_*.csv`). Log frame opsional
   (bawaan `logs/log_raw_frames_dev.csv`). Cek berkasnya ada sebelum dipakai. Tolak `exports/Dataset_Cochran_Q_ISO30107_6480.csv` atau berkas lain
   dari `scripts/export_cochran_dataset.py`: itu data sintetis.
2. Jalankan `python3 scripts/analisis_kalibrasi_dev.py --riwayat <csv>` dan tambahkan `--frames <path frame>`
   hanya bila berkasnya ada. Tanpa frame, Tabel 2b dilewati, dan sebutkan itu. Tabel 2b memakai deret dlib mesin
   (sumber keputusan D2). `--frame-source browser_mediapipe` hanya untuk tabel pembanding terpisah.
   Keluaran di `exports/kalibrasi_dev/` (tidak di-commit). Presentasi dengan versi keputusan lama dikeluarkan
   otomatis; laporkan jumlahnya.
3. Laporkan jumlah presentasi terukur, FTA, mesin tidak terhubung, dan tanpa landmark dlib (FTA liveness) per sel
   3 lux x 3 jarak x 4 label.
   Sebutkan sel yang repetisinya belum lengkap.
4. Sertakan catatan wajib di setiap tabel: satu subjek (`P_DEV_01`), tidak untuk inferensi populasi,
   CI Wilson deskriptif, ambang L2 < 0,35 tidak dilaporkan (early exit mesin), ACER = (APCER terburuk + BPCER) / 2,
   S3 memakai rumus (b) keputusan D1 dan liveness dlib keputusan D2 (CLAUDE.md bagian 4 butir 1-2), dan S3 mencakup
   S2 sehingga APCER S3 >= APCER S2.
5. Tabel 1 latensi (`tabel1_latensi_komponen.csv`) deskriptif per presentasi: median, p90, maks. Jangan menulis klaim
   "< 200 ms per frame": pass EMAR paralel, jadi ms/frame hanya rata-rata teramortisasi. Uji Friedman/Wilcoxon
   18 subjek belum bisa dibuat dari data ini. Jangan menjalankan `analisis_tingkat_subjek.py` (terikat data sintetis).
6. Jangan menyunting CSV masukan, `Dataset_Eksperimen_Bab5.csv`, atau berkas di `logs/`.
