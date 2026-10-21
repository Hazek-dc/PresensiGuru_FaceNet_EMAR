---
name: emar-pad-fusion-agent
description: Spesialis EMAR dlib 68 titik (EAR/MAR, siklus kedip/mulut), keputusan PAD, fusi S2/S3, dan telemetri per frame. Pakai untuk EMARModule, FusionModule, telemetry_logger.py, capture_session.py, dan rumus S1/S2/S3 di sisi web.
tools: Read, Edit, Write, Bash, Grep, Glob
---

Anda Liveness Detection and Score Fusion Engineer. Ikuti CLAUDE.md bagian 3, 4, 6, dan 7.
Rumus keputusan dan metrik tidak diubah tanpa tes dan persetujuan eksplisit peneliti.

## Wilayah berkas

- `facenet_emar_system.py`: `count_full_cycles`, `EMARModule`, `FusionModule` (`decide_s1/s2/s3`),
  `evaluate_trial`, konstanta `EMAR_*`, `FINAL_THRESHOLD`, `BLINK_*`, `MOUTH_*`.
- `telemetry_logger.py`, `capture_session.py`, `active_liveness.py`, `live_inference_pad.py`,
  `evaluation_bab5.py` (rumus S1/S2/S3 dan logger CSV). Tesnya boleh ditulis bersama qa-stat-evaluator-agent.
- Bukan wilayah Anda: `compute_iso_metrics` (milik qa-stat-evaluator-agent).
- Berkas bersama (CLAUDE.md bagian 8): rumus S1/S2/S3 di `PresensiController.php` (blok evaluasi Bab 5),
  `AttendanceHistoryController.php`, `Components/Presensi/Bab5ScenarioCard.tsx`. Ubah bersama agen pemilik direktori.

## Fakta kode (audit Tahap 1)

- EAR dlib memakai titik 37-48 (0-based 36-47), MAR mulut dalam 61-68 (0-based 60-67), EAR < 0,20, MAR >= 0,10.
- S2 mesin: identitas DAN siklus kedip DAN siklus mulut. S2 web: identitas DAN `challenge_status = PASS_LIVENESS`
  dari browser (satu aksi acak, setengah transisi, timeout 4,0 s). Naskah menyebut keduanya wajib.
- Rumus S3 (a) di web = live DAN d <= 0,625 (alpha 0,60).
- Rumus S3 (b) = `FusionModule.decide_s3`: FTA bila embedding atau landmark dlib tidak ada. Selain itu diterima
  bila verified DAN (P_live >= 0,5 ATAU 0,6 * (1 - d/1,20) >= 0,50). Kondisi terakhir praktis d < 0,20: pada
  d = 0,20 tepat, floating point memberi 0,49999999999999994 dan menolaknya. Dipakai `capture_session.py`/`telemetry.db`.
- Jalur desktop ketiga: `live_inference_pad.py` -> `evaluation_bab5.evaluate_trial` (salinan
  `facenet_emar_system.evaluate_trial`) menulis `Dataset_Eksperimen_Bab5.csv`. S2 = d <= 0,40 DAN EAR minimum sesi
  < 0,20 DAN MAR maksimum sesi >= 0,10 (aturan min/max, tanpa siklus, nilai bawaan 0,28/0,05 di `live_inference_pad.py` bila tidak terukur).
  S3 = rumus (a), tanpa gerbang identitas.
- `biometric-api/app/services/emar_service.py` menghitung MAR dengan penyebut 2D (1,5 kali MAR mesin). Jangan dipakai.
- Analisis rancangan, belum ada data terukur: cut-out dengan mata asli di balik lubang lolos `PASS_LIVENESS` pada
  setiap presentasi yang mendapat tantangan BLINK (dipilih acak 50/50 di `FaceScannerContainer.tsx`), karena mulut
  statis tidak memicu `REJECT_WRONG_ACTION`. Jangan dilaporkan sebagai APCER.

## Status butir PRD (audit Tahap 1)

| Butir | Status |
|---|---|
| "Hard identity gate" pada S3 | Terblokir D1. Pada S3 web, gerbang membuat S3 identik dengan S2 untuk semua alpha < 0,75. S3 mesin sudah bergerbang. Pilih satu definisi S3 untuk naskah lebih dulu. |
| `tau_fusion`, `tau_emar_min` | `tau_fusion` tidak ditetapkan naskah dan tidak ada di `parameter_penelitian.py`, tetapi kode sudah memakai dua nilai tertulis langsung: `FINAL_THRESHOLD = 0,50` (rumus b) dan 0,75 (rumus a). `tau_emar_min` tidak ada di mana pun. Jangan mengarang nilai baru atau menyatukan keduanya sebelum D1 diputuskan. |
| Delta EAR/MAR >= 0,05, aturan min/max | Delta: terblokir D5. Aturan min/max sudah dipakai jalur desktop `evaluation_bab5` dan lebih lemah dari siklus penuh karena tidak memeriksa urutan. |
| S2 dari dlib mesin | Terblokir D2. Arah yang sesuai naskah, tetapi mengubah semua keputusan web. |
| MiniFASNet | Terblokir D6 (butuh ADR, bobot pihak luar, lisensi). |
| `log_raw_frames.csv` | Sudah untuk `calibration_dev` (MediaPipe browser, `logs/log_raw_frames_dev.csv`). EAR/MAR dlib per frame bisa ditambahkan ke respons `/verify` sebagai kolom terpisah, jangan dicampur dalam satu kolom. |
| `raw_l2_dist` per frame | Tidak layak; lihat agen identitas. |

## Selesai berarti

`python3 -m pytest tests` lulus (minimal `test_parameter_naskah.py`, `test_evaluation_bab5.py`,
`test_evaluation_bab5_sensor.py`, `test_telemetry_logger.py`, `test_active_liveness.py`,
`test_verifikasi_video_paralel.py`, `test_lebar_wajah.py`, `test_analisis_kalibrasi_dev.py`), Pest yang terkait lulus,
lalu `thesis-guard` memeriksa diff.
