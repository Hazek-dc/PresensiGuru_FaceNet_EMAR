# Workflow Single-Tool Antigravity Pro

- Proyek: Face Verification FaceNet + EMAR untuk Presensi SMK Al-Madani
- Mode kerja: satu AI vibecoding tool, yaitu Antigravity Pro
Tanggal: 15 Juli 2026

## 1. Tujuan dokumen

Dokumen ini menjadi panduan kerja tunggal untuk menggunakan Antigravity Pro pada
seluruh siklus proyek: spesifikasi, implementasi, pengujian, self-audit, E2E,
kalibrasi, dan persiapan rilis.

Karena alat yang menulis kode juga alat yang memeriksanya, hasil pemeriksaan harus
disebut **self-audit berbantuan AI**, bukan audit independen. Bias dikurangi melalui
sesi baru, spesifikasi yang dibekukan, Git checkpoint, pengujian deterministik, dan
persetujuan manual peneliti.

## 2. Konteks proyek yang sudah diketahui

- Formulir memiliki 15 submission yang mewakili 13 identitas unik.
- Baru 11 identitas yang cocok dengan roster/gallery; alasan dua attrition belum
  terdokumentasi secara pasti.
- Skrip `face_verify_blink.py` adalah baseline S2 awal: MTCNN, FaceNet VGGFace2
  512-D, normalisasi L2, cosine similarity, dlib 68 landmark, EAR, dan rule gate.
- Skrip tersebut belum mengimplementasikan MAR/EMAR penuh, weighted fusion,
  evaluator penelitian, database, atau integrasi FastAPI–Laravel.
- Uji yang sudah ada hanya pilot dengan dua bona-fide dan satu screen attack.
  Threshold pernah diubah setelah melihat hasil pilot; angka itu bukan hasil final.
- Proposal masih memiliki perbedaan 128-D vs 512-D, Euclidean vs cosine,
  TensorFlow/Keras vs PyTorch, dan Flask vs FastAPI.

## 3. Pembagian tanggung jawab

### Antigravity Pro

- Menyusun spesifikasi dari keputusan yang sudah disetujui peneliti.
- Mengimplementasikan kode dan test secara bertahap.
- Menjalankan unit, integration, dan E2E test.
- Melakukan self-audit pada sesi baru dalam mode read-only.
- Menulis laporan yang dapat direproduksi dari output test dan manifest.
- Tidak mengubah split, threshold, label, consent, atau eksklusi data tanpa
  persetujuan peneliti.

### Peneliti

- Menentukan tujuan ilmiah, batas klaim, dan desain eksperimen.
- Menyetujui subjek eligible, mapping pseudonim, dan alasan eksklusi.
- Menetapkan dan membekukan split serta threshold.
- Memeriksa diff dan bukti test pada setiap checkpoint.
- Menyetujui interpretasi hasil, keterbatasan, dan rilis final.

## 4. Model kerja satu alat, beberapa sesi

Gunakan satu Antigravity Pro dengan tiga sesi yang tidak berbagi pembelaan atau
rasionalisasi implementasi:

| Sesi | Fungsi | Boleh mengubah kode? | Input utama |
| --- | --- | --- | --- |
| BUILD | Implementasi dan perbaikan | Ya | Spesifikasi beku, issue, test gagal |
| AUDIT | Self-audit fresh-context | Tidak | Requirement, commit hash, diff, output test |
| E2E | Pengujian aplikasi | Hanya test/fixture | OpenAPI, skenario pengguna, build beku |

Sesi AUDIT harus dimulai sebagai percakapan baru. Jangan memberikan alasan mengapa
kode ditulis dengan cara tertentu. Berikan hanya kebutuhan, struktur proyek, commit,
diff, dan bukti test agar reviewer mencari kesalahan dari nol.

## 5. Aturan yang tidak boleh ditawar

1. Verifikasi selalu 1:1 dan API wajib menerima `claimed_subject_id`.
2. Sistem hanya membandingkan probe dengan template milik klaim tersebut; tidak ada
   nearest-neighbor atau fallback 1:N.
3. Gallery dan probe memakai preprocessing serta normalisasi L2 yang sama.
4. Embedding nol, NaN, Inf, atau salah dimensi ditolak sebagai invalid/FTA.
5. `PAD_Pred`, `ID_Pred`, dan `Final_Decision` disimpan terpisah.
6. Final `ACCEPT` hanya jika identity `MATCH` dan PAD `BONA_FIDE`.
7. Invalid claim, no-face, multi-face, landmark invalid, timeout, dan model error
   gagal secara tertutup; tidak boleh menjadi silent non-match atau presensi.
8. FTA dilaporkan terpisah dan tidak dimasukkan ke denominator APCER/BPCER.
9. APCER dihitung per PAI species: PRINT, SCREEN, dan REPLAY.
10. Split DEVELOPMENT, CALIBRATION, dan TEST tidak boleh berbagi sumber
    subject-session-media yang dilarang protokol.
11. Threshold hanya dipilih dari CALIBRATION dan dibekukan sebelum TEST.
12. Frame, video, embedding, nama, NIP/NUPTK, dan tautan media tidak masuk Git,
    prompt, log umum, atau respons API pengguna.
13. Kedipan/EMAR pasif tidak boleh diklaim tahan replay tanpa bukti eksperimen.
14. Semua perubahan kode/model/config/data membatalkan audit lama yang terdampak.

## 6. Struktur repositori yang disarankan

```text
presensi-facenet-emar/
├── biometric-api/                 # FastAPI dan modul biometrik
│   ├── app/
│   │   ├── api/
│   │   ├── services/
│   │   ├── domain/
│   │   ├── schemas/
│   │   └── config/
│   └── tests/
├── attendance-web/                # Laravel, kamera, dan presensi
│   ├── app/
│   ├── resources/
│   └── tests/
├── research/
│   ├── manifests/                 # Hanya schema/contoh sintetis di Git
│   ├── protocols/
│   ├── evaluation/
│   └── reports/
├── docs/
│   ├── specs/
│   ├── decisions/
│   ├── api/
│   └── qa/
├── scripts/
├── tests/
├── .env.example
└── .gitignore
```

Dataset nyata disimpan di luar repositori. `.gitignore` minimal harus memblokir
`dataset/`, `*.jpg`, `*.jpeg`, `*.png`, `*.mp4`, `*.mov`, `*.pkl`, model lokal,
hasil embedding, `.env`, dan export yang mengandung PII.

## 7. Fase 0 — Governance dan inventaris data

### Tugas Antigravity Pro

- Buat schema manifest tanpa mengisi PII nyata.
- Buat validator untuk consent, duplicate submission, subject/session/media hash,
  label attack, kondisi, split, dan alasan eksklusi.
- Buat pemeriksaan overlap dan missing values.
- Buat dry-run; jangan rename, memindahkan, atau menghapus data mentah.

### Kolom manifest minimal

```text
sample_id, subject_id, claimed_subject_id, consent_version,
consent_status, session_id, source_media_id, source_hash,
sample_type, pai_species, lux, distance_cm, device_id,
split, enrollment_role, quality_status, exclusion_reason
```

### Exit gate

- Tiga belas identitas unik telah didedup.
- Dua attrition menuju gallery 11 memiliki alasan yang terdokumentasi.
- Data eligible memiliki consent aktif dan media lengkap.
- Nama/nomor pegawai tidak dipakai sebagai `subject_id`.
- Intersection terlarang antar-split bernilai nol.
- Peneliti menyetujui manifest sebelum pipeline membaca media.

## 8. Fase 1 — Spesifikasi dan kontrak

Antigravity Pro membuat, lalu peneliti menyetujui:

- `PROJECT_CONTRACT.md`
- `THESIS_METHODOLOGY.md`
- `DATA_GOVERNANCE.md`
- `METRIC_DICTIONARY.md`
- `API_CONTRACT.yaml`
- `DECISION_LOG.md`
- `ACCEPTANCE_CRITERIA.md`

### Keputusan yang wajib dibekukan

| Area | Kandidat konsisten dengan baseline saat ini |
| --- | --- |
| Face detector/alignment | MTCNN, crop 160×160 |
| FaceNet | InceptionResnetV1 pretrained VGGFace2 |
| Embedding | 512-D, L2-normalized |
| Identity score | Cosine similarity; threshold dari CALIBRATION |
| Landmark | dlib 68-point |
| Liveness | EAR + MAR temporal, hysteresis, durasi, challenge |
| Fusion | S1 FaceNet; S2 rule gate; S3 weighted fusion |
| API | FastAPI |
| Web/database | Laravel + MySQL |

Tabel di atas adalah kandidat teknis, bukan keputusan final otomatis. Bila dipilih,
proposal dan presentasi harus diubah agar tidak lagi menyebut 128-D/Euclidean/Keras.

### Exit gate

- Setiap requirement memiliki ID dan acceptance test.
- Definisi MATCH, NON_MATCH, BONA_FIDE, ATTACK, FTA, dan INVALID_CLAIM jelas.
- Definisi trial, denominator, dan unit analisis jelas.
- Protokol PRINT, SCREEN, dan REPLAY dibedakan.
- Kontrak API dan kode error disetujui.
- Tidak ada implementasi sebelum peneliti menyetujui kontrak.

## 9. Fase 2 — Bootstrap dan test harness

### Tugas

- Buat struktur repo dan konfigurasi environment.
- Tambahkan lint, format, type checks, unit test runner, dan coverage.
- Buat fixture sintetis; jangan menggunakan biometrik nyata untuk coding awal.
- Buat fake clock dan mock model agar state machine dapat diuji deterministik.
- Buat CI lokal/satu perintah untuk seluruh pemeriksaan.

### Exit gate

- Proyek dapat diinstal dari environment kosong.
- Satu perintah menjalankan lint + type check + unit tests.
- Tidak ada secret, data, atau model besar di Git.
- Test gagal bila kontrak dasar sengaja dilanggar.

## 10. Fase 3 — Implementasi inti biometrik

Urutan implementasi:

1. Validasi `claimed_subject_id` dan gallery 1:1.
2. Deteksi/alignment wajah dan quality gates.
3. Ekstraksi serta normalisasi embedding.
4. Cosine similarity dan keputusan identity.
5. Dlib landmark serta validasi geometri.
6. EAR/MAR sebagai fungsi murni.
7. State machine liveness berbasis waktu.
8. Challenge-response acak.
9. Fusion S1/S2/S3.
10. Struktur hasil dan audit event tanpa PII.

### Unit test wajib

```text
test_verification_is_1to1
test_invalid_claim_not_non_match
test_gallery_probe_l2_normalization
test_zero_nan_inf_embedding_rejected
test_reference_and_probe_preprocessing_identical
test_exactly_one_face_required
test_ear_geometry_and_zero_denominator
test_blink_open_closed_open_once
test_wink_noise_and_long_closure_rejected
test_mar_event_window
test_identity_without_liveness_rejected
test_liveness_without_identity_rejected
test_face_loss_or_track_change_resets_challenge
```

### Exit gate

- Seluruh unit test hijau.
- Fungsi matematis dapat diuji tanpa webcam/model nyata.
- Tidak ada exception biometrik yang disembunyikan dengan `except: pass`.
- Multi-face/no-face/invalid landmark menghasilkan status acquisition yang jelas.

## 11. Fase 4 — FastAPI biometric service

### Kontrak respons minimal

```json
{
  "request_id": "opaque-id",
  "claimed_subject_id": "Sxx",
  "acquisition_status": "OK|FTA|INVALID_CLAIM",
  "identity": {"decision": "MATCH|NON_MATCH|NOT_EVALUATED", "score": 0.0},
  "pad": {"decision": "BONA_FIDE|ATTACK|NOT_EVALUATED"},
  "final_decision": "ACCEPT|REJECT",
  "reasons": [],
  "model_version": "...",
  "config_version": "..."
}
```

### Kontrol

- Validasi MIME, ukuran, durasi, dan resolusi upload.
- Batasi timeout dan concurrency.
- Jangan mengembalikan embedding atau path penyimpanan.
- Gunakan request ID dan idempotency key.
- Tulis log terstruktur tanpa nama/media mentah.
- Endpoint health tidak membeberkan konfigurasi sensitif.

### Integration test wajib

- valid request;
- invalid/unknown claim;
- no-face, multi-face, dan FTA;
- identity mismatch;
- liveness attack/timeout;
- malformed schema/MIME/oversized upload;
- duplicate request;
- model unavailable dan internal timeout.

## 12. Fase 5 — Laravel attendance web

### Tugas

- Implementasikan camera preview dan recorder.
- Upload video melalui route Laravel ke FastAPI.
- Buat `BiometricClient` dengan timeout dan error mapping.
- Catat presensi hanya jika `final_decision=ACCEPT`.
- Gunakan unique biometric request ID untuk mencegah presensi ganda.
- Tampilkan pesan aman tanpa stack trace atau detail identitas.
- Pastikan model Eloquent/migration kompatibel dan Vite build tersedia.

### Exit gate

- Kamera ditolak menghasilkan pesan jelas.
- Blob/video benar-benar dikirim, bukan hanya event frontend.
- FastAPI mati tidak membuat Laravel crash.
- Attack, mismatch, FTA, dan duplicate request ditolak serta diaudit.
- Tidak ada presensi yang tercatat pada respons ambigu atau timeout.

## 13. Fase 6 — E2E dengan sesi Antigravity Pro baru

Jalankan terhadap aplikasi lokal dengan fixture sintetis/mock terkontrol dahulu,
kemudian data DEVELOPMENT yang diizinkan.

### Skenario wajib

1. Izin kamera ditolak.
2. Kamera berhasil dan video ter-upload.
3. MATCH + BONA_FIDE → presensi tercatat sekali.
4. MATCH + ATTACK → ditolak.
5. NON_MATCH + BONA_FIDE → ditolak.
6. FTA → ditolak dan dicatat sebagai gagal akuisisi.
7. Claim kosong/tidak dikenal → invalid claim.
8. Dua wajah → ditolak.
9. Request ID sama → presensi kedua ditolak.
10. FastAPI timeout/down/schema salah → pesan aman, tidak ada presensi.

### Exit gate

- Semua skenario memiliki bukti expected vs actual.
- E2E menguji FastAPI nyata, tidak hanya mock yang meniru bug kedua sisi.
- Screenshot/log bukti bebas PII.

## 14. Fase 7 — Pilot, kalibrasi, dan final test

### DEVELOPMENT

- Gunakan untuk debugging fungsi dan protokol.
- Hasil boleh mengubah kode.
- Tidak boleh dilaporkan sebagai performa final.

### CALIBRATION

- Pilih threshold identity, EAR/MAR, durasi, dan bobot fusion.
- Simpan config, seed, model hash, manifest hash, code commit, dan hasil.
- Bandingkan trade-off keamanan dan usability.
- Setelah dipilih, ubah config menjadi read-only/versioned.

### TEST

- Jalankan hanya setelah calibration freeze.
- Jangan mengubah threshold setelah melihat hasil.
- Perubahan apa pun menghasilkan kandidat eksperimen baru, bukan menimpa run lama.
- Laporkan ukuran sampel, confidence interval, FTA, identity metrics, BPCER, dan
  APCER per PAI species/kondisi.

### Larangan

Konfigurasi pilot `EAR=0,18`, `MAR=0,35`, FaceNet distance `0,98`, dan delapan detik
tidak boleh dianggap final. Nilai itu dipilih setelah melihat dua bona-fide dan satu
screen attack, sehingga hanya merupakan diagnosis awal.

## 15. Fase 8 — Self-audit read-only

Bekukan commit, model, config, dan manifest. Buka sesi Antigravity Pro baru dan
larang sesi tersebut mengedit kode.

### Checklist audit

- Requirement-to-test traceability lengkap.
- Tidak ada jalur 1:N/fallback nearest identity.
- Normalisasi gallery/probe/centroid identik.
- Invalid claim berhenti sebelum inferensi.
- FTA dan denominator metrik dapat direkonsiliasi.
- APCER tersedia per species, `n`, dan interval ketidakpastian.
- Intersection split terlarang = 0 berdasarkan subject/session/hash.
- Threshold/config sama sebelum dan sesudah TEST.
- Log/repo/API bebas PII, media, embedding, dan secret.
- Kontrak FastAPI–Laravel cocok pada implementasi nyata.
- Semua exclusion memiliki alasan sebelum hasil diketahui.
- Klaim laporan tidak melampaui hasil test.

### Format temuan

```text
ID | Severity | Requirement | Evidence | Expected | Actual | Recommendation
```

Setelah audit, kembali ke sesi BUILD untuk perbaikan. Setiap perbaikan wajib memiliki
regression test. Bekukan commit baru lalu ulangi self-audit fresh-context.

## 16. Fase 9 — Rilis dan dokumentasi

Rilis hanya jika:

- tidak ada temuan Critical/High terbuka;
- seluruh test hijau pada commit yang sama dengan artefak rilis;
- model/config/manifest hash tercatat;
- migration dan rollback teruji;
- data governance dan penghapusan diuji;
- laporan menjelaskan keterbatasan replay/deepfake;
- proposal, deck, API, kode, dan hasil memakai definisi yang sama.

Artefak akhir:

- spesifikasi dan decision log;
- OpenAPI contract;
- manifest schema dan validator;
- data/model/config card;
- laporan calibration freeze;
- laporan TEST final;
- laporan self-audit Antigravity Pro;
- hasil E2E;
- deployment/rollback guide;
- limitation statement.

## 17. Prompt siap pakai untuk Antigravity Pro

### A. Memulai sesi BUILD

```text
Anda adalah satu-satunya AI vibecoding tool untuk proyek FaceNet–EMAR ini.
Baca seluruh docs/specs dan decision log sebelum mengubah kode. Kerjakan hanya
requirement [ID]. Jangan mengubah dataset, split, threshold, metric definition,
atau consent. Mulai dengan rencana file-level, implementasikan perubahan terkecil,
tambahkan negative/regression tests, jalankan seluruh test relevan, lalu laporkan
diff, perintah test, hasil, risiko tersisa, dan commit yang perlu saya review.
```

### B. Mengimplementasikan satu fase

```text
Implementasikan fase [NAMA FASE] berdasarkan requirement beku dan API contract.
Pertahankan verifikasi 1:1, normalisasi L2 identik, pemisahan PAD/identity/fusion,
fail-closed, serta larangan PII. Jangan menyembunyikan exception. Gunakan fixture
sintetis untuk test. Berhenti jika keputusan ilmiah belum ditetapkan dan daftar
pilihan yang membutuhkan persetujuan saya.
```

### C. Memulai sesi AUDIT baru

```text
Mode AUDIT-ONLY. Jangan edit file apa pun. Anggap implementasi ini dibuat pihak
lain. Audit commit [HASH] terhadap requirement dan acceptance criteria terlampir.
Cari khusus: 1:N terselubung, invalid-claim fallback, normalisasi tidak simetris,
FTA yang dibuang, APCER pooled, split/data leakage, threshold leakage, exception
tersembunyi, insecure logging, bug kontrak FastAPI–Laravel, race/idempotency,
serta test yang hanya mengonfirmasi implementasi. Jalankan pemeriksaan read-only
yang relevan dan keluarkan tabel temuan dengan evidence serta severity.
```

### D. Memulai sesi E2E baru

```text
Mode E2E. Uji build beku [HASH] terhadap OpenAPI/acceptance criteria, bukan terhadap
asumsi implementasi. Jalankan skenario kamera ditolak, upload sukses, MATCH+BONA_FIDE,
MATCH+ATTACK, NON_MATCH, FTA, invalid claim, multi-face, duplicate request, dan
FastAPI down/timeout/schema salah. Jangan gunakan data biometrik nyata; gunakan
fixture sintetis/mock yang disetujui. Laporkan expected vs actual dan bukti bebas PII.
```

### E. Calibration freeze

```text
Gunakan hanya split CALIBRATION untuk membandingkan threshold dan konfigurasi.
Jangan membaca hasil TEST. Untuk setiap kandidat, simpan code hash, model hash,
manifest hash, config, seed, metric definition, dan output. Tampilkan trade-off,
tetapi jangan memilih konfigurasi atas nama saya. Setelah saya memilih, buat
config versioned read-only dan skrip verifikasi bahwa hash tidak berubah.
```

## 18. Definition of Done

Proyek belum selesai hanya karena demo webcam dapat menerima satu wajah. Proyek
selesai ketika seluruh kondisi berikut terpenuhi:

- kontrak ilmiah, data, dan API telah dibekukan;
- 1:1, L2, invalid claim, FTA, per-species APCER, dan split isolation terbukti test;
- EMAR temporal dan fusion diuji dengan negative cases;
- FastAPI–Laravel E2E berhasil termasuk failure paths;
- calibration dan TEST benar-benar terpisah;
- hasil dapat direproduksi dari manifest dan commit;
- self-audit fresh-context tidak memiliki temuan Critical/High;
- peneliti menyetujui keputusan, keterbatasan, dan klaim akhir.
