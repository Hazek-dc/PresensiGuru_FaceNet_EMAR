# CLAUDE.md: Konstitusi Teknis dan Metodologi PresensiGuru_FaceNet_EMAR

@AGENTS.md

Berkas ini dibaca semua agen Claude Code. Isinya fakta kode yang sudah diperiksa
(audit Tahap 1, 21 Oktober 2026, `docs/audit/2026-10-21-tahap1-prd-orkestrasi.md`)
dan aturan metodologi skripsi. Bila berkas ini bertentangan dengan sumber di bawah,
sumber yang menang dan berkas ini yang diperbaiki.

## 1. Sumber kebenaran

Angka terkunci tersebar di beberapa berkas. Tidak ada satu sumber tunggal.

| Hal | Sumber |
|---|---|
| Ambang naskah (L2, EAR, MAR, alpha, jendela), siklus (`BLINK_CONSEC_FRAMES`, `MOUTH_OPEN_FRAMES`), fusi S3 D1 (`FUSION_D_REF`, `FUSION_THRESHOLD`), liveness D2 (`LIVENESS_THRESHOLD`), `DECISION_VERSION`, kondisi lux/jarak, label, desain | `parameter_penelitian.py` |
| Konstanta mesin yang juga terkunci | `facenet_emar_system.py`: `EMAR_W1`, `EMAR_W2`, `FACENET_MIN_CONFIDENCE`, `FACENET_CANDIDATE_RATIOS`, `FACENET_EARLY_EXIT_DISTANCE`. `D_REF`, `FINAL_THRESHOLD`, `EMAR_LIVENESS_THRESHOLD` diimpor dari `parameter_penelitian.py` |
| Ambang web | `attendance-web/config/biometrics.php`: `facenet_threshold` lewat `ModelSettingController::getActiveSettings()` (bisa diubah admin), blok `fusion` (D1/D2, tanpa env dan tanpa pengaturan admin) dibaca `app/Services/FusionDecision.php` |
| Ambang browser | `Utils/emarGeometry.ts` (`EAR_BLINK_THRESHOLD`, `MAR_OPEN_THRESHOLD`, `CHALLENGE_TIMEOUT_S`), `Utils/distanceCalibration.ts` (rentang jarak), `Utils/fusionDecision.ts` (tampilan S1/S2/S3) |
| Paritas web dan naskah | tes `tests/test_analisis_kalibrasi_dev.py::TestParitasWeb` membandingkan `FusionDecision.php` dan `config/biometrics.php` dengan `parameter_penelitian.py` |
| Aturan metodologi | `docs/specs/THESIS_METHODOLOGY.md`, `docs/specs/DECISION_LOG.md`, `docs/specs/METRIC_DICTIONARY.md`, `.cursor/rules/thesis-methodology.mdc` |
| Pemeriksaan diff | agen `thesis-guard` (`.claude/agents/thesis-guard.md`) |

Jangan menambah salinan angka baru. Kode Python baru mengimpor dari
`parameter_penelitian.py`. Kode web memakai konfigurasi yang sudah ada.

## 2. Arsitektur nyata (bukan rancangan PRD)

- **Web**: `attendance-web/`, Laravel 13 (`laravel/framework ^13.8`), PHP 8.3,
  Inertia v2, React 18.3 + TypeScript, Vite, Pest, Vitest, SQLite bawaan.
  Studio `/presensi` = `resources/js/Pages/Presensi/Index.tsx`. Pemindai =
  `Components/Presensi/FaceScannerContainer.tsx`. MediaPipe FaceLandmarker
  (478 titik, 1 wajah) = `Hooks/useFaceLandmarker.ts`. EAR/MAR dan tantangan
  browser = `Utils/emarGeometry.ts`. Keputusan presensi web =
  `app/Http/Controllers/PresensiController.php::store()`.
- **Mesin**: `biometric-api/main.py` (FastAPI, port 5000). `/verify` ada di
  `biometric-api/routers/attendance.py` dan memanggil
  `facenet_emar_system.verify_video_file`. `biometric-api/app/services/*` hanya
  dipakai tes (mock), bukan jalur produksi. `Dockerfile` di root menjalankan
  Flask (`facenet_emar_system.py api`), bertentangan dengan DECISION_LOG #3.
- **Inti biometrik**: `facenet_emar_system.py`.
  - `FaceNetModule`: MTCNN `image_size=160, margin=20, thresholds=[0.6, 0.7, 0.7]`,
    filter confidence 0,90, tanpa affine alignment. InceptionResnetV1 `vggface2`
    512-D, dinormalisasi L2. Per video paling banyak 9 frame kandidat
    (`FACENET_CANDIDATE_RATIOS`), berhenti bila d <= 0,35
    (`FACENET_EARLY_EXIT_DISTANCE`). Template galeri dibuat dengan MTCNN yang sama.
  - `EMARModule`: dlib 68 titik, EAR < 0,20, MAR >= 0,10,
    `BLINK_CONSEC_FRAMES = 2`, `MOUTH_OPEN_FRAMES = 3`, siklus penuh.
  - `FusionModule`: `decide_s1/s2/s3`. Lihat bagian 4 butir 2 untuk S3.
  - `/verify` juga mengirim telemetri: `landmark_frames`, `frames_total`,
    `emar_series` (EAR/MAR dlib per frame berlandmark), `candidates_evaluated`, dan
    `latency_ms` (`emar_pass`, `facenet_total`, `mtcnn`, `facenet_embedding`,
    `total`, `lock_wait`). Tidak ada keputusan yang membacanya.
- **Perekam desktop**: `capture_session.py` menulis `logs/telemetry.db`
  (`presentation_log`). `live_inference_pad.py` memanggil
  `evaluation_bab5.evaluate_trial` dan menulis `Dataset_Eksperimen_Bab5.csv`.
  d di jalur ini bukan jarak `FaceNetModule` 1:1: ekstraktornya sendiri
  (keras_facenet atau facenet_pytorch tanpa MTCNN, atau pseudo-embedding Sobel),
  jarak minimum 1:N terhadap `DATABASE_IDENTITAS_MASTER.pkl`, d = 1,50 bila tidak
  terukur, dan `participant_id` diisi nama hasil pencocokan. Jangan menggabungkan
  d atau `participant_id` baris desktop dengan baris web.
- **Tidak ada di repo** (jangan dianggap ada): MiniFASNet, detektor objek browser,
  tabel `self_test_trials`, estimator jarak dari iris,
  `scripts/generate_bab5_evaluation.py`.

## 3. Parameter terkunci (sumber tercantum per baris)

| Parameter | Nilai | Sumber |
|---|---|---|
| Identitas | d(x1, x2) <= 0,40, embedding 512-D L2 | `parameter_penelitian.py` |
| Kedip | EAR **<** 0,20 (ketat, bukan <=) | `parameter_penelitian.py`, `emarGeometry.ts` |
| Mulut | MAR >= 0,10, tanpa syarat delta MAR | `parameter_penelitian.py`, `emarGeometry.ts` |
| Siklus | >= 1 siklus kedip DAN >= 1 siklus mulut (dlib, `BLINK_CONSEC_FRAMES` 2, `MOUTH_OPEN_FRAMES` 3) | `parameter_penelitian.py`, `EMARModule` |
| Liveness (D2) | P_live dlib = 0,5 * min(kedip, 1) + 0,5 * min(mulut, 1) >= 1,0 | `parameter_penelitian.py` `LIVENESS_THRESHOLD` |
| S3 (D1) | d <= 0,40 DAN 0,6 * max(0, 1 - d/1,20) + 0,4 * P_live >= 0,50 | `parameter_penelitian.py` `FUSION_D_REF`, `FUSION_THRESHOLD` |
| Bobot fusi | alpha = 0,60 | `parameter_penelitian.py` |
| Jendela | 8,0 s sejak rekaman mulai | `parameter_penelitian.py` |
| Mulai tantangan browser | t >= 1,0 s | `FaceScannerContainer.tsx` |
| Timeout tantangan browser | `CHALLENGE_TIMEOUT_S = 4.0` | `emarGeometry.ts` |
| Lux | redup < 100, normal 100-300, terang > 300. Kunci kode `normal` (label UI boleh "Standar") | `parameter_penelitian.py` |
| Jarak | 30-40, 45-55, 60-70 cm, inklusif. Target 30/45/60 = batas bawah rentang | `parameter_penelitian.py`, `distanceCalibration.ts`, `DistanceModel.php` |
| Label | `bona_fide`, `print_attack`, `screen_attack`, `replay_video` | `SAMPLE_LABELS` (`BONA_FIDE` + `ATTACK_LABELS`). Web: `sample_type` BONA_FIDE/ATTACK + `pai_species` |
| Desain TEST | 18 subjek x 9 kondisi x 4 label x 5 repetisi = 3.240 (180 per subjek) | `parameter_penelitian.py` |
| ID subjek | `S01`-`S18` (embedding_id galeri). `P_DEV_01` = peneliti, satu-satunya partisipan split `calibration_dev` (D12) | naskah, `PresensiController.php` |

`Dataset_Eksperimen_Bab5.csv` bukan dataset TEST yang bersih. Isinya 4 baris demo
`P01`-`P04`, 43 baris akun uji `emb_TEST-QALWANI-001`, 27 baris dengan nilai
pengganti EAR/MAR 0,18/0,40, dan 53 baris 30 cm/300 lux yang bisa jadi nilai
bawaan lama. Saring di analisis, jangan sunting berkasnya.

## 4. Fakta kode yang sering disalahpahami

1. **Liveness web diputuskan dlib mesin (D2).** S2 dan keputusan presensi di
   `PresensiController` memakai P_live dari jawaban `/verify` (`emar_score`, atau
   dari `blink_cycles`/`mouth_cycles`). `landmark_frames = 0` berarti FTA liveness:
   S2/S3 null dan `pad_pred = UNAVAILABLE`. Tantangan browser kini panduan dua
   langkah (kedip lalu buka-tutup mulut, urutan acak) dan `challenge_status` hanya
   telemetri. EAR/MAR dan hitungan siklus browser juga telemetri. Mode simulasi
   tes membaca `blink_cycles`/`mouth_cycles` (atau `ear_blinks`/`mar_mouths`) dari
   request sebagai pengganti mesin.
2. **Satu rumus S3 (D1 = rumus b) di semua jalur.** `FusionModule.decide_s3`,
   `app/Services/FusionDecision.php` (web), `Utils/fusionDecision.ts` (tampilan),
   `evaluation_bab5.evaluate_trial` (salinan mesin mendelegasikan ke sini), dan
   `scripts/analisis_kalibrasi_dev.py`. Paritasnya dikunci tes
   `test_evaluate_trial_sama_dengan_decide_s3`.
   - S3 mencakup S2: setiap presentasi yang diterima S2 juga diterima S3, jadi
     APCER S3 >= APCER S2 dan BPCER S3 <= BPCER S2. S3 menerima presentasi dengan
     satu siklus saja (P_live 0,5, misalnya cut-out bermata asli) untuk setiap
     d <= 0,40, dan tanpa liveness bila d < 0,20 (d = 0,20 tepat ditolak karena
     floating point). Laporkan sebagai sifat rancangan.
   - Data lama memakai rumus (a) 1,5/0,75 dan liveness browser: baris lama
     `Dataset_Eksperimen_Bab5.csv`, riwayat tanpa `evaluation_bab5.decision_version`,
     dan presentasi web sebelum 21-10-2026. Jangan digabung dengan data versi
     `D1b-D2dlib-2026-10-21`. Riwayat lama tanpa `evaluation_bab5` dihitung ulang
     untuk tampilan dengan tanda `recomputed`.
3. **Nilai karangan yang tersisa setelah D10.** `face_detected_pct`, durasi, EAR/MAR,
   PAD, identitas, dan siklus yang tidak tercatat kini null atau sel kosong. Yang
   masih ada dan tidak boleh disalin ke kolom baru: `sample_type ?: 'BONA_FIDE'` di
   CSV Bab 5/Matriks, `ear_blinks`/`mar_mouths` browser `?: 0`, dan kolom
   `PAI_Species` Matriks CSV yang masih tebakan dari hitungan browser.
4. **Jarak** dihitung dari rasio lebar wajah dengan model d = a/r + b (residu
   <= 3,0 cm). Sumber utama: mesin (dlib rahang titik 0-16, koefisien
   `engine_a`/`engine_b`) bila kalibrasi aktif punya model mesin. Cadangan: jarak
   dari klien dengan `distance_source` `sensor` (rangefinder lewat
   `DistanceMeterWidget`), `camera`, atau `camera_calibrated` (estimasi browser dari
   MediaPipe pipi 234/454). Klaim `camera_calibrated` tanpa kalibrasi sah diturunkan
   menjadi `camera`. Lihat `PresensiController::recordedDistance()`.
   Pada serangan, angka itu mengukur wajah di foto/layar, bukan jarak artefak.
   Kondisi jarak serangan = penanda lantai.
5. **`PAI_Species` di `Matriks_Evaluasi_Bab4.csv`** pada jalur TEST diturunkan dari
   hitungan browser, bukan label. Jangan dipakai untuk APCER. Activity log kini
   mencatat label `pai_species` dari request (sebelum 21-10-2026 tertimpa tebakan).

## 5. Aturan data (pelanggaran = data penelitian rusak)

- `gallery/*.pkl` tidak pernah ditulis atau dibuka. Pemeriksaan yang boleh hanya
  `git status --short -- gallery/` atau `md5sum`. Selama `.claude/settings.json`
  masih menolak `Read(gallery/**)`, `md5sum` langsung pada `gallery/` ikut ditolak,
  jadi pakai `git status` atau skill `/cek-semua`. Tes memakai `FACENET_GALLERY_PATH`.
- Hanya boleh ditambah dari pengukuran nyata, tidak boleh dibersihkan, ditulis
  ulang, atau diisi balik: `Dataset_Eksperimen_Bab5.csv`,
  `dataset/video_singkat/Matriks_Evaluasi_Bab4.csv`, `logs/*`, dan tabel
  `activity_log`, `attendance_records`, `distance_logs`, `lighting_logs`,
  `evaluation_matrices`.
- Nilai yang tidak diukur tetap kosong/null. Target skenario bukan hasil ukur.
- **Data sintetis**, jangan dipakai sebagai hasil:
  - `scripts/export_cochran_dataset.py` dan `exports/Dataset_Cochran_Q_ISO30107_6480.csv`.
  - `analisis_tingkat_subjek.py`: membaca CSV sintetis 6.480 baris, mengunci
    matriks konfusi buatan, dan berhenti bila datanya berbeda.
  - Angka hasil di `README.md` (ACER, akurasi, APCER, BPCER).
- **Repo ini publik.** Jangan meng-commit media wajah, nama subjek, template, atau
  deret biometrik BARU (`logs/log_raw_frames_dev.csv` dan `exports/kalibrasi_dev/`
  sudah di-.gitignore). Berkas warisan sudah terlacak di git dan terekspos:
  `dataset/foto_selfie/*` (nama subjek di nama berkas), `dataset/video_singkat/*.mp4`
  dan `*.pkl`, `dataset/frame_hasil/*`, `gallery/*.pkl`, `logs/*.db`, nama/email di
  `attendance-web/database/seeders/TeacherDatasetSeeder.php` dan
  `dataset/subjects.csv`, serta nama peneliti di `dataset/self_qalwani/README.md`.
  Selain README itu, `dataset/self_qalwani/` hanya melacak `.gitkeep`, `.gitignore`,
  dan templat manifest berisi header. Media, template, dan manifest terisi di sana
  diabaikan `.gitignore` lokal dan tidak boleh di-commit. Menghapus berkas warisan
  dari riwayat git adalah keputusan peneliti. Agen tidak menyentuhnya.
- Mengubah input mesin (resolusi, margin/threshold MTCNN, alignment, pemilihan
  frame, jumlah thread) membuat hasil tidak identik. Bila yang berubah adalah
  ekstraksi embedding (MTCNN, alignment, crop), template galeri juga harus
  dibangun ulang, dan itu keputusan peneliti (D8), bukan tindakan agen. Klaim
  "identik" butuh bukti sesuai thesis-guard butir 4.

## 6. Aturan statistik

- FTA dilaporkan terpisah dan tidak masuk penyebut APCER/BPCER.
- APCER dilaporkan per spesies PAI (ISO/IEC 30107-3). ACER bukan metrik normatif
  ISO/IEC 30107-3. Bila dilaporkan, sebutkan definisinya (APCER terburuk atau gabungan).
- Inferensi dilakukan di tingkat subjek (N = 18): Friedman dan Wilcoxon dengan
  Bonferroni. Cochran's Q/McNemar tingkat percobaan melanggar asumsi independensi
  karena repetisi per subjek berkorelasi, jadi hanya deskriptif. Tanpa GEE,
  mixed-effects, atau bootstrap.
- Analisis tingkat subjek dari data terekam ada di
  `attendance-web/app/Services/SubjectLevelAnalysisService.php` (sumber
  `logs/telemetry.db`, rumus S3 (b)). `analisis_tingkat_subjek.py` masih terikat
  data sintetis dan harus ditulis ulang sebelum dipakai.
- CI untuk proporsi (APCER, BPCER, FTA per sel): Wilson, diberi label deskriptif.
- `calibration_dev` (`P_DEV_01`) hanya untuk tabel sensitivitas ambang. Tidak
  digabung dengan TEST dan tidak dipakai untuk inferensi populasi. Grid search
  ambang tidak boleh dijalankan pada data TEST.

## 7. Keputusan peneliti yang masih terbuka

Jangan diimplementasikan sebelum peneliti menyetujui secara eksplisit di
percakapan. Rinciannya di laporan audit. Keputusan yang sudah diambil dicatat di
`docs/specs/DECISION_LOG.md` (butir 5-9).

| Kode | Keputusan |
|---|---|
| D1 | DIPUTUSKAN 21-10-2026: rumus (b) `decide_s3` di semua jalur. |
| D2 | DIPUTUSKAN 21-10-2026: dlib mesin. Tantangan browser hanya panduan dan telemetri. |
| D3 | Timeout tantangan 4,0 s ke 7,0 s (APCER hanya bisa tetap atau naik). |
| D4 | Toleransi jarak +-2 cm (bertentangan dengan rentang Subbab 5.2). |
| D5 | Syarat delta EAR/MAR >= 0,05 (ambang baru). |
| D6 | MiniFASNet atau detektor objek browser (PAD di luar EMAR, perlu ADR). |
| D7 | Aturan FTA baru (< 30% frame berwajah). |
| D8 | MTCNN margin 14, threshold 0,9, atau affine alignment (galeri harus dibangun ulang). |
| D9 | Spesies `cutout_attack` (N_TOTAL menjadi 4.050). |
| D10 | DIPUTUSKAN 21-10-2026: nilai tak terukur null (kestabilan, durasi, EAR/MAR, ekspor). |
| D11 | Jarak meteran manual: hanya boleh sebagai sumber `tape_confirmed` per sesi, bukan salinan otomatis target. |
| D12 | DIPUTUSKAN 21-10-2026: split `calibration_dev` hanya `P_DEV_01`. |

Masih terbuka: D3-D9 dan D11. `sample_type ?: 'BONA_FIDE'` di CSV tetap utang data.

## 8. Agen dan pembagian berkas

| Agen | Wilayah berkas |
|---|---|
| `frontend-mediapipe-agent` | `attendance-web/resources/js/**` |
| `laravel-orchestrator-agent` | `attendance-web/{app,routes,config,database,bootstrap}/**`, `attendance-web/tests/**` (Pest) |
| `vision-preproc-agent` | `biometric-api/main.py`, `biometric-api/routers/{attendance,measure}.py`, `biometric-api/app/**` kecuali `app/evaluation/**`, `biometric-api/tests/*.py` kecuali `test_enroll_*`. Di `facenet_emar_system.py`: `verify_video_file` (dengan `_VERIFY_LOCK`), `_verify_video_file`, `_iter_video_frames`, `_read_frames_at`, `_candidate_indices`, `_ordered_parallel_map`, `_count_video_packets`, `FaceWidthTally`, `face_width_ratio`, `frame_luma_stats`, `measure_*`, `EMAR_WORKERS`, `create_flask_api` |
| `facenet-identity-agent` | `facenet_emar_system.py::FaceNetModule` (termasuk `_init_mtcnn`, `_extract_embedding`), `resolve_gallery_key`, konstanta `FACENET_*` dan `D_REF`, `biometric-api/routers/enrollment.py`, `biometric-api/tests/test_enroll_*`, `daftar_ulang_wajah.py`, `scripts/enroll_qalwani.py`, `scripts/auto_enroll_gallery.py` |
| `emar-pad-fusion-agent` | `facenet_emar_system.py`: `count_full_cycles`, `EMARModule`, `FusionModule`, `FaceEMARSystem.decide_all`, `verify_all_scenarios`, `evaluate_trial`, konstanta `EMAR_*` kecuali `EMAR_WORKERS`, `FINAL_THRESHOLD`, `BLINK_*`, `MOUTH_*`. `telemetry_logger.py`, `capture_session.py`, `active_liveness.py`, `live_inference_pad.py`, `evaluation_bab5.py` |
| `qa-stat-evaluator-agent` | `tests/**` (Python root), `scripts/analisis_*.py`, `analisis_tingkat_subjek.py`, `facenet_emar_system.py`: `compute_iso_metrics`, `compute_iso_by_pai`, `mcnemar_test` (McNemar hanya deskriptif). `biometric-api/app/evaluation/**`, `biometric-api/tests/evaluation/**` |
| `thesis-guard` | baca-saja, wajib setelah perubahan mesin, keputusan, ekspor, log, atau galeri |

Berkas bersama (diubah bersama kedua agen, tidak boleh sepihak):

- Rumus S1/S2/S3: `app/Services/FusionDecision.php` dan pemakainya
  (`PresensiController.php`, `AttendanceHistoryController.php`),
  `Utils/fusionDecision.ts` dan `Bab5ScenarioCard.tsx`: pemilik direktori +
  `emar-pad-fusion-agent`.
- Salinan rumus (b) di `scripts/analisis_kalibrasi_dev.py` (`s3_accept`,
  `implied_l2`, `count_full_cycles`, Tabel 2b/2c): `qa-stat-evaluator-agent` +
  `emar-pad-fusion-agent`. Ikut diubah bersama rumus web, `evaluation_bab5.py`, dan
  `parameter_penelitian.py`.
- Kolom ekspor riwayat (`app/Services/CombinedHistoryExport.php`) adalah kontrak
  `scripts/analisis_kalibrasi_dev.py`: laravel + qa-stat.
- `biometric-api/tests/test_audit_criteria.py` dan `test_e2e_mock_pipeline.py`
  menguji `app/services/*` sekaligus `app/evaluation/evaluate_iso30107.py`:
  `vision-preproc-agent` + `qa-stat-evaluator-agent`.
- Respons `/verify` (`_verify_video_file` dan `AttendanceResponse` di
  `routers/attendance.py`): field telemetri baru dari agen identitas atau EMAR
  ditambahkan bersama `vision-preproc-agent`.
- `Utils/distanceCalibration.ts` dan `app/Services/DistanceModel.php` harus identik
  (rentang, pesan, pembulatan): frontend + Laravel.
- Format `frameSeries` di `FaceScannerContainer.tsx` dan validator
  `PresensiController::appendRawFrames()`: frontend + Laravel.
- Tes Python root milik `qa-stat-evaluator-agent`. Agen lain boleh menambah tes
  untuk kode di wilayahnya sendiri.

Fungsi lain di `facenet_emar_system.py` yang tidak tercantum mengikuti pemilik
fungsi pemanggilnya. Bila tidak ada pemanggil atau pemanggilnya lintas wilayah,
ubah bersama dan periksa dengan `thesis-guard`. `facenet_emar_system.log_to_csv`
adalah kode mati. Penulis `Dataset_Eksperimen_Bab5.csv` yang hidup adalah
`evaluation_bab5.log_to_csv`.

Agen tidak mengubah berkas di luar wilayahnya. Perubahan lintas wilayah dipecah
per agen dan diperiksa `thesis-guard`.

## 9. Perintah verifikasi

- `cd attendance-web && php artisan test --compact`
- `cd attendance-web && npx vitest run --no-file-parallelism --maxWorkers=1 && npm run build`
  (build = `tsc` + Vite). Pastikan baris `Test Files N passed (N)` lengkap.
- `cd attendance-web && vendor/bin/pint --dirty --format agent` setelah mengubah PHP
- `python3 -m pytest tests` dan `cd biometric-api && python3 -m pytest tests`.
  Pytest wajib terpasang. Tanpa pytest, `python3 -m unittest` hanya bisa menjalankan
  `tests.test_active_liveness`, `tests.test_analisis_kalibrasi_dev`,
  `tests.test_evaluation_bab5`, dan (dari `biometric-api/`)
  `tests.evaluation.test_evaluate_iso30107`. Modul lain mengimpor pytest, jadi hasil
  unittest saja tidak berarti suite lulus.
- Galeri: `git status --short -- gallery/` harus kosong (berkas galeri terlacak git).
  `md5sum gallery/face_gallery.pkl` hanya jalan bila deny `Read(gallery/**)` dicabut.
- Di laptop peneliti: skill `/cek-semua` menjalankan semuanya berurutan dan
  memeriksa md5 galeri.
