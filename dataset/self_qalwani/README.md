# Dataset Pribadi Qalwani Anugerah (Pilot & Research Validation)

## 1. Identitas Subjek & Penelitian
- **Subject ID Canonical**: `TEST-QALWANI-001`
- **Account Admin ID**: `ADM-QA-001`
- **Pemilik Dataset**: Qalwani Anugerah (Peneliti dan Pembuat Sistem Verifikasi Wajah)
- **Institusi**: Universitas Muhammadiyah Pontianak (2026)
- **Tujuan Dataset**: `research_validation` (Pilot, debugging, dan validasi pipeline verifikasi biometrik 1:1 + EMAR Liveness Detection).
- **Status Data**: `is_test_data = true`, `is_official_attendance = false` (Bukan data presensi resmi).

---

## 2. Struktur Pembagian Sesi & Split (Anti-Leakage Protocol)

Untuk mencegah kebocoran data (*data leakage*), dataset dibagi secara ketat berdasarkan **sesi perekaman terpisah**:

1. **`raw/enrollment/session_e/` (SESSION-E)**:
   - Digunakan **khusus** untuk ekstraksi vektor embedding 512-D FaceNet (template galeri).
   - **Dilarang keras** digunakan sebagai data kalibrasi atau data pengujian.

2. **`raw/calibration/session_c/` (SESSION-C)**:
   - Digunakan untuk penentuan/kalibrasi threshold FaceNet & EMAR Liveness.
   - Terdiri dari subfolder `bona_fide/` serta `attacks/` (`printed_photo`, `screen_photo`, `replay_video`).
   - **Dilarang keras** digunakan sebagai data pengujian akhir (*final test*).

3. **`raw/test/session_t/` (SESSION-T)**:
   - Digunakan sebagai data pengujian akhir (*final self-test*).
   - Terdiri dari subfolder `bona_fide/` serta `attacks/` (`printed_photo`, `screen_photo`, `replay_video`).
   - **Dilarang keras** digunakan untuk enrollment atau tuning threshold.

---

## 3. Aturan Penggunaan & Validator

- **Validator Manifest**: Sebelum evaluasi dijalankan, manifest harus divalidasi menggunakan script validator.
- **Pemeriksaan Galeri Wajib**: Evaluator akan memeriksa bahwa `TEST-QALWANI-001` terdaftar di galeri. Evaluasi akan **dihentikan (exit code non-zero)** apabila subjek tidak ditemukan di galeri.
- **Pencampuran Split**: File atau hash yang sama **dilarang** muncul di lebih dari satu split (`enrollment`, `calibration`, `test`).

---

## 4. Kebijakan Privasi & Consent

- Data biometrik mentah (foto, video, frame, embedding) disimpan secara lokal pada `dataset/self_qalwani/` dan **diabaikan dari Git tracking** via `.gitignore`.
- Subjek berhak mencabut consent kapan saja, yang akan menghapus template dan sampel terkait bertanda `is_test_data = true`.
