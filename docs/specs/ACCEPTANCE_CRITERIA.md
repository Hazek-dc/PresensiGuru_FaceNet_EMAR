# Acceptance Criteria

Matriks Requirement to Test. Sistem tidak dianggap rilis kecuali kriteria-kriteria ini telah dipenuhi dan teruji.

## C1: Verifikasi 1:1
- [ ] Endpoint biometrik wajib menuntut argumen `claimed_subject_id`.
- [ ] Verifikasi mengkalkulasi distance/similarity hanya terhadap vektor milik `claimed_subject_id`.
- [ ] Memasukkan `claimed_subject_id` yang tidak terdaftar harus membuahkan exception / `INVALID_CLAIM`, bukan *silent scan* pada seluruh galeri.

## C2: Normalisasi dan Preprocessing Identik
- [ ] Vektor probe dan vektor galeri dilewatkan pada fungsi preprocessing/normalisasi L2 yang sama.

## C3: Keamanan Presentasi (PAD/EMAR)
- [ ] Keputusan Identity dan PAD dievaluasi secara terpisah.
- [ ] Jika PAD = ATTACK dan Identity = MATCH, `final_decision` wajib bernilai REJECT.
- [ ] Presensi ganda (Duplicate Biometric Request ID) ditolak oleh *database schema*.

## C4: Failure to Acquire (FTA) dan Exceptions
- [ ] Embedding yang null, NaN, Inf, atau panjangnya tidak sama dengan 512-D langsung dibatalkan (FTA).
- [ ] Invalid landmarks atau gagal deteksi wajah lebih dari X detik menghasilkan FTA.
- [ ] FTA dilaporkan secara terpisah, tidak diam-diam digabung dengan `NON_MATCH`.

## C5: Pemisahan Data & Evaluasi
- [ ] Overlap data antar split DEVELOPMENT, CALIBRATION, dan TEST adalah 0.
- [ ] Tersedia metrik APCER yang dipecah per spesies (PRINT, SCREEN, REPLAY).
- [ ] Aplikasi Laravel tidak akan *crash* saat FastAPI sedang mati (graceful error handling).
