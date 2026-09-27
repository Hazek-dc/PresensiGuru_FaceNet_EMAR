# Data Governance

Aturan penanganan dataset dan privasi data (PII) selama fase penelitian.

## 1. Larangan PII di Repositori
- Tidak boleh ada data PII (wajah, foto, video, nomor handphone, NIP, nama asli) di-commit ke Git.
- `subject_id` harus diubah ke bentuk pseudonim (contoh: `SUBJ-001`) sebelum disimpan di manifest.
- Tidak boleh me-log identitas, embedding (vector data), maupun link foto asli di log server.

## 2. Data Splits (Pemisahan Data)
Dataset wajib dibagi menjadi 3 bagian yang terisolasi ketat:
1. **DEVELOPMENT:** Digunakan untuk debugging dan pembuatan fungsi, boleh diekspos saat fase *coding*.
2. **CALIBRATION:** Digunakan untuk memilih *threshold* identity, nilai EAR/MAR, dan durasi liveness.
3. **TEST:** Hanya dieksekusi setelah model dan *threshold* dibekukan (Calibration Freeze). Dilarang keras men-tuning model atau threshold berdasarkan hasil dari split TEST.

## 3. Data Leakage & Overlap
- Intersection / overlap antar split (DEV, CAL, TEST) baik dari *subject_id* atau *session_id* harus 0 (disjoint).

## 4. Pelacakan Data (Manifest)
- Semua metadata presensi (pseudonim, PAI species, kualitas, dan split) harus di-track melalui JSON/CSV manifest, diverifikasi melalui script `validate_manifest.py`.
- Subjek harus memiliki `consent_status` = "active". Data dengan status "revoked" masuk ke split "EXCLUDED" dan alasan eksklusinya harus jelas terdokumentasi.
