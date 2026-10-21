---
description: Buat tabel kalibrasi ambang dan APCER per spesies dari data calibration_dev yang terekam (read-only terhadap data mentah). Argumen = path CSV riwayat ekspor dan, opsional, log frame.
---

Masukan: $ARGUMENTS

Ikuti CLAUDE.md bagian 5 dan 6, lewat `qa-stat-evaluator-agent`.

1. Pastikan masukan adalah ekspor riwayat nyata (`Riwayat_Presensi_dan_Log_Aktivitas_*.csv`) dan
   `logs/log_raw_frames_dev.csv`. Tolak `exports/Dataset_Cochran_Q_ISO30107_6480.csv` atau berkas lain
   dari `scripts/export_cochran_dataset.py`: itu data sintetis.
2. Jalankan:
   `python3 scripts/analisis_kalibrasi_dev.py --riwayat <csv> --frames logs/log_raw_frames_dev.csv`
   Keluaran di `exports/kalibrasi_dev/` (tidak di-commit).
3. Laporkan jumlah presentasi terukur, FTA, dan mesin tidak terhubung per sel 3 lux x 3 jarak x 4 label.
   Sebutkan sel yang repetisinya belum lengkap.
4. Sertakan catatan wajib di setiap tabel: satu subjek (`P_DEV_01`), tidak untuk inferensi populasi,
   CI Wilson deskriptif, ambang L2 < 0,35 tidak dilaporkan (early exit mesin), ACER = (APCER terburuk + BPCER) / 2.
5. Tabel latensi per komponen dan uji Friedman/Wilcoxon 18 subjek belum bisa dibuat dari data ini.
   Katakan begitu; jangan mengisi angka.
6. Jangan menyunting CSV masukan, `Dataset_Eksperimen_Bab5.csv`, atau berkas di `logs/`.
