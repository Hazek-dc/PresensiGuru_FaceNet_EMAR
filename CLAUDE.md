# CLAUDE.md: Konstitusi Teknis dan Metodologi PresensiGuru_FaceNet_EMAR

@AGENTS.md

Berkas ini dibaca semua agen Claude Code. Isinya fakta kode yang sudah diperiksa
(audit Tahap 1, 21 Oktober 2026, `docs/audit/2026-10-21-tahap1-prd-orkestrasi.md`)
dan aturan metodologi skripsi. Bila berkas ini bertentangan dengan sumber di bawah,
sumber yang menang dan berkas ini yang diperbaiki.

## 1. Sumber kebenaran

| Hal | Sumber tunggal |
|---|---|
| Semua angka ambang, kondisi, desain | `parameter_penelitian.py` |
| Aturan metodologi | `docs/specs/THESIS_METHODOLOGY.md`, `docs/specs/DECISION_LOG.md`, `docs/specs/METRIC_DICTIONARY.md`, `.cursor/rules/thesis-methodology.mdc` |
| Pemeriksaan diff | agen `thesis-guard` (`.claude/agents/thesis-guard.md`) |

Jangan menyalin angka ke tempat baru sebagai sumber kedua. Kode baru mengimpor
dari `parameter_penelitian.py` (Python) atau dari konfigurasi yang sudah ada
(`attendance-web/config/biometrics.php`, `Utils/distanceCalibration.ts`).

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
  - `FusionModule`: `decide_s1/s2/s3`. S3 mesin memakai `D_REF = 1,20`,
    `FINAL_THRESHOLD = 0,50`, dan mensyaratkan `is_verified`.
- **Perekam desktop**: `capture_session.py` menulis `logs/telemetry.db`
  (`presentation_log`).
- **Tidak ada di repo** (jangan dianggap ada): MiniFASNet, detektor objek browser,
  tabel `self_test_trials`, estimator jarak dari iris, kolom latensi per komponen,
  `scripts/generate_bab5_evaluation.py`.

## 3. Parameter terkunci (salinan baca-saja dari `parameter_penelitian.py`)

| Parameter | Nilai | Catatan |
|---|---|---|
| Identitas | d(x1, x2) <= 0,40 | embedding 512-D L2, setara cosine >= 0,92 |
| Kedip | EAR **<** 0,20 | ketat, bukan <= |
| Mulut | MAR >= 0,10 | tidak ada syarat delta MAR |
| Siklus | >= 1 siklus kedip DAN >= 1 siklus mulut | "siklus transisi penuh" |
| Bobot fusi | alpha = 0,60 | |
| Jendela | 8,0 s sejak rekaman mulai | tantangan muncul di t >= 1,0 s |
| Timeout tantangan browser | `CHALLENGE_TIMEOUT_S = 4.0` | `Utils/emarGeometry.ts` |
| Lux | redup < 100, normal 100-300, terang > 300 | kunci kode `normal` (label UI boleh "Standar") |
| Jarak | 30-40, 45-55, 60-70 cm, inklusif | target 30/45/60 = batas bawah rentang |
| Label | `bona_fide`, `print_attack`, `screen_attack`, `replay_video` | `ATTACK_LABELS` |
| Desain TEST | 18 subjek x 9 kondisi x 4 label x 5 repetisi = 3.240 | 180 per subjek |
| ID subjek | `S01`-`S18` (embedding_id galeri) | `P_DEV_01` = peneliti, split `calibration_dev` |

`P01`-`P04` di `Dataset_Eksperimen_Bab5.csv` adalah baris demo/tes, bukan subjek.

## 4. Fakta kode yang sering disalahpahami

1. **Liveness web diputuskan di browser.** S2 dan keputusan final di
   `PresensiController` memakai `challenge_status` dari MediaPipe browser.
   Hasil dlib mesin (`liveness_passed`, `blink_cycles`, `mouth_cycles`) dikirim
   tetapi tidak dibaca. Naskah menyebut dlib.
2. **Ada dua definisi S3.** Web: `0,6 * max(0, 1 - d/1,5) + 0,4 * P_live >= 0,75`
   dengan P_live biner, sehingga S3 = live DAN d <= 0,625. Mesin: skala 1,20,
   ambang 0,50, P_live {0; 0,5; 1}, dengan gerbang `is_verified`. Menambah gerbang
   d <= 0,40 ke S3 web membuat S3 identik dengan S2 (tes
   `test_gerbang_identitas_membuat_s3_sama_dengan_s2`).
3. **Nilai karangan yang masih ada.** `face_detected_pct` selalu 100.
   `ear_val`/`mar_val` bawaan 0,18/0,28 dan 0,40/0,05 bila tidak dikirim.
   `scan_duration_s` dikunci 8,0. `sample_type` kosong menjadi `BONA_FIDE` di CSV
   Bab 5/Matriks. Jangan membangun fitur baru di atas nilai ini.
4. **Jarak** dihitung dari lebar wajah (pipi 234/454, model kalibrasi
   d = a/r + b, residu <= 3,0 cm). Pada serangan, angka itu mengukur wajah di
   foto/layar, bukan jarak artefak. Kondisi jarak serangan = penanda lantai.
5. **`pai_species` di activity log dan `Matriks_Evaluasi_Bab4.csv`** pada jalur
   TEST diturunkan dari prediksi liveness, bukan label. Jangan dipakai untuk APCER.

## 5. Aturan data (pelanggaran = data penelitian rusak)

- `gallery/*.pkl` tidak pernah ditulis atau dibuka, kecuali `md5sum`. Tes memakai
  `FACENET_GALLERY_PATH`.
- `Dataset_Eksperimen_Bab5.csv`, `dataset/video_singkat/Matriks_Evaluasi_Bab4.csv`,
  `logs/*`, `activity_log`, `attendance_records`: hanya boleh ditambah dari
  pengukuran nyata. Tidak boleh dibersihkan, ditulis ulang, atau diisi balik.
- Nilai yang tidak diukur tetap kosong/null. Target skenario bukan hasil ukur.
- **Data sintetis**: `scripts/export_cochran_dataset.py`,
  `exports/Dataset_Cochran_Q_ISO30107_6480.csv`, dan angka hasil di `README.md`
  (ACER, akurasi, APCER, BPCER) bukan pengukuran. Jangan dipakai sebagai hasil.
- Repo ini publik: tidak ada media wajah, nama subjek, atau deret biometrik
  (`logs/log_raw_frames_dev.csv` sudah di-.gitignore) yang di-commit.
- Mengubah input mesin (resolusi, margin MTCNN, alignment, pemilihan frame,
  jumlah thread) membuat hasil tidak identik dan template galeri harus dibangun
  ulang. Klaim "identik" butuh bukti sesuai thesis-guard butir 4.

## 6. Aturan statistik

- FTA dilaporkan terpisah dan tidak masuk penyebut APCER/BPCER.
- APCER dilaporkan per spesies PAI (ISO/IEC 30107-3). ACER bukan metrik normatif
  ISO/IEC 30107-3. Bila dilaporkan, sebutkan definisinya (APCER terburuk atau gabungan).
- Inferensi dilakukan di tingkat subjek (N = 18): Friedman dan Wilcoxon dengan
  Bonferroni. Cochran's Q/McNemar tingkat percobaan melanggar asumsi independensi
  karena repetisi per subjek berkorelasi, jadi hanya deskriptif. Tanpa GEE,
  mixed-effects, atau bootstrap.
- `calibration_dev` (`P_DEV_01`) hanya untuk tabel sensitivitas ambang. Tidak
  digabung dengan TEST dan tidak dipakai untuk inferensi populasi. Grid search
  ambang tidak boleh dijalankan pada data TEST.

## 7. Keputusan peneliti yang masih terbuka

Jangan diimplementasikan sebelum peneliti menyetujui secara eksplisit di
percakapan. Rinciannya di laporan audit.

| Kode | Keputusan |
|---|---|
| D1 | Definisi S3 untuk naskah: S3 web, S3 mesin, atau P_live kontinu. Gerbang d <= 0,40 pada S3 web = S2. |
| D2 | Sumber keputusan PAD: browser MediaPipe (sekarang) atau dlib mesin (sesuai naskah). |
| D3 | Timeout tantangan 4,0 s ke 7,0 s (APCER hanya bisa tetap atau naik). |
| D4 | Toleransi jarak +-2 cm (bertentangan dengan rentang Subbab 5.2). |
| D5 | Syarat delta EAR/MAR >= 0,05 (ambang baru). |
| D6 | MiniFASNet atau detektor objek browser (PAD di luar EMAR, perlu ADR). |
| D7 | Aturan FTA baru (< 30% frame berwajah). |
| D8 | MTCNN margin 14, threshold 0,9, atau affine alignment (galeri harus dibangun ulang). |
| D9 | Spesies `cutout_attack` (N_TOTAL menjadi 4.050). |
| D10 | Memperbaiki `face_detected_pct` dan nilai bawaan EAR/MAR (keputusan lama bisa berubah). |
| D11 | Jarak meteran manual: hanya boleh sebagai sumber `tape_confirmed` per sesi, bukan salinan otomatis target. |

## 8. Agen dan pembagian berkas

| Agen | Wilayah berkas |
|---|---|
| `frontend-mediapipe-agent` | `attendance-web/resources/js/**` |
| `laravel-orchestrator-agent` | `attendance-web/app/**`, `routes/**`, `config/**`, `database/**`, `tests/**` (Pest) |
| `vision-preproc-agent` | `biometric-api/**` (router, I/O video, FTA) |
| `facenet-identity-agent` | `facenet_emar_system.py::FaceNetModule`, galeri, enrollment |
| `emar-pad-fusion-agent` | `facenet_emar_system.py::EMARModule/FusionModule`, `telemetry_logger.py`, `capture_session.py` |
| `qa-stat-evaluator-agent` | `tests/**` (Python), `scripts/analisis_*.py`, `evaluation_bab5.py`, `analisis_tingkat_subjek.py` |
| `thesis-guard` | baca-saja, wajib setelah perubahan mesin, keputusan, ekspor, log, atau galeri |

Agen tidak mengubah berkas di luar wilayahnya. Perubahan lintas wilayah dipecah
per agen dan diperiksa `thesis-guard`.

## 9. Perintah verifikasi

- `cd attendance-web && php artisan test --compact`
- `cd attendance-web && npx vitest run && npm run build` (build = `tsc` + Vite)
- `cd attendance-web && vendor/bin/pint --dirty --format agent` setelah mengubah PHP
- `python3 -m pytest tests` dan `cd biometric-api && python3 -m pytest tests`
  (bila pytest belum terpasang: `python3 -m unittest tests.<nama_modul>`)
- Di laptop peneliti: skill `/cek-semua` menjalankan semuanya berurutan dan
  memeriksa md5 galeri.
