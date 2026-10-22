# Decision Log

Log keputusan arsitektur dan teknis (Architectural Decision Records / ADR) proyek FaceNet-EMAR.

## 1. Arsitektur Model Biometrik
- **Kandidat:** MTCNN + FaceNet (InceptionResnetV1) pretrained VGGFace2 (PyTorch)
- **Keputusan:** Diadopsi.
- **Alasan:** Proposal sebelumnya menyebut 128-D Euclidean/Keras, namun skrip *baseline* (`face_verify_blink.py`) telah menggunakan InceptionResnetV1 dengan 512-D L2-normalized Cosine. Kita membekukan keputusan pada baseline ini (512-D) untuk kestabilan dan kemudahan reproduksi.

## 2. Arsitektur Liveness
- **Kandidat:** EMAR (Eye & Mouth Aspect Ratio) dengan dlib 68-point landmarks.
- **Keputusan:** Diadopsi.
- **Alasan:** Temporal EMAR pasif dan challenge (blink/smile) adalah fokus skripsi ini. Tidak akan menggunakan model CNN 3D untuk liveness.

## 3. Web & Backend Stack
- **Biometric API:** FastAPI (Python). Alasan: Support untuk async, OpenCV, PyTorch, dan standar *type hints* yang kuat. (Menolak Flask).
- **Web App:** Laravel (PHP) + SQLite/MySQL. Alasan: Digunakan untuk menangani UI kamera, database rekaman presensi, dan *routing* non-biometrik.

## 4. Evaluasi & Metrik
- **Standar:** ISO 30107-3.
- **Keputusan:** FTA dilaporkan terpisah, bukan digabung dalam klasifikasi. APCER dihitung per jenis PAI. Mengurangi bias presentasi.

## 5. Definisi S3 (D1, 21 Oktober 2026)
- **Kandidat:** (a) `0,6 * max(0, 1 - d/1,5) + 0,4 * P_live >= 0,75`, P_live biner, tanpa gerbang identitas. (b) `FusionModule.decide_s3`. (c) P_live kontinu baru.
- **Keputusan:** (b) di semua jalur: S3 diterima bila d <= 0,40 DAN `0,6 * max(0, 1 - d/1,20) + 0,4 * P_live >= 0,50`, dengan P_live in {0; 0,5; 1}. FTA bila landmark dlib tidak ada. Konstanta di `parameter_penelitian.py` (`FUSION_D_REF`, `FUSION_THRESHOLD`).
- **Alasan:** Data TEST 18 subjek di `logs/telemetry.db` sudah memakai (b). Rumus (a) tanpa gerbang menerima wajah tidak cocok (d <= 0,625), dan bila diberi gerbang identik dengan S2.
- **Konsekuensi untuk naskah:** di kedua rumus, setiap presentasi yang diterima S2 juga diterima S3, jadi APCER S3 >= APCER S2 dan BPCER S3 <= BPCER S2. Rumus (b) juga menerima presentasi tanpa liveness bila d < 0,20. Keduanya harus dilaporkan sebagai sifat rancangan.

## 6. Sumber keputusan PAD (D2, 21 Oktober 2026)
- **Kandidat:** tantangan acak MediaPipe di browser (sebelumnya) atau siklus dlib 68 titik di mesin (sesuai naskah).
- **Keputusan:** dlib mesin. S2 dan keputusan presensi web = identitas DAN P_live dlib >= 1,0 (siklus kedip DAN siklus mulut). Tantangan browser menjadi panduan dua langkah (kedip lalu buka-tutup mulut, urutan acak) dan hanya telemetri.
- **Konsekuensi:** presentasi web sebelum keputusan ini memakai sumber PAD lain dan ditandai lewat `evaluation_bab5.decision_version`. Video dihapus setelah verifikasi, jadi presentasi lama tidak bisa dinilai ulang.

## 7. Nilai tak terukur (D10, 21 Oktober 2026)
- **Keputusan:** `face_detected_pct` dihitung dari semua frame yang diproses browser, durasi rekaman diukur, dan EAR/MAR, kestabilan, durasi, PAD, identitas, serta hitungan browser `ear_blinks`/`mar_mouths` yang tidak tercatat disimpan null atau sel kosong, bukan 100 %, 8,0 s, 0,18/0,40, 0, BONA_FIDE, atau MATCH. Jalur desktop (`live_inference_pad.py`, CLI `evaluation_bab5.py`) juga tidak lagi mengisi d = 1,50, EAR 0,28/0,18, atau MAR 0,05/0,40.
- **Sisa utang:** `sample_type ?: 'BONA_FIDE'`, subjek bawaan `'S01'`, DEFAULT skema `evaluation_matrices`, dan `PAI_Species` tebakan di Matriks CSV (CLAUDE.md bagian 4 butir 3).

## 8. Split calibration_dev (D12, 21 Oktober 2026)
- **Keputusan:** split `calibration_dev` hanya menerima `participant_id = P_DEV_01`. Subjek TEST S01-S18 ditolak (422).

## 9. Telemetri latensi mesin (21 Oktober 2026)
- **Keputusan:** `/verify` mengirim `latency_ms` per tahap (pass EMAR, FaceNet total, MTCNN, embedding, total, tunggu antrean), `landmark_frames`, `frames_total`, dan deret EAR/MAR dlib. Hanya `landmark_frames` yang dibaca keputusan (0 = FTA liveness). Tahap yang tidak berjalan dilaporkan null. Dekode video dan pass EMAR paralel sehingga tercatat sebagai satu tahap.

## 10. CSV riset dipisah per versi keputusan (22 Oktober 2026)
- **Masalah:** setelah D1/D2, baris baru `Dataset_Eksperimen_Bab5.csv` dan `Matriks_Evaluasi_Bab4.csv` memakai definisi S2/S3, EAR/MAR, dan siklus yang lain dari baris lama, tanpa kolom pembeda. Berkas itu tidak boleh ditulis ulang.
- **Keputusan:** berkas lama dibekukan. Penulis web dan desktop menulis ke berkas bernama versi (`Dataset_Eksperimen_Bab5_<versi>.csv`, `..._desktop_<versi>.csv`, `Matriks_Evaluasi_Bab4_<versi>.csv`) dengan kolom versi keputusan dan sumber liveness, dan menolak menambah baris ke berkas berheader lain. Berkas berversi diabaikan git. `evaluation_bab5` dan metadata presensi juga menyimpan `l2_threshold` aktif.
- **Konsekuensi:** skrip yang membaca CSV Bab 5 harus memilih berkas per versi. `DECISION_VERSION` dikunci tes ke nilai konstanta keputusan, jadi mengubah konstanta tanpa menaikkan versi membuat tes gagal.
