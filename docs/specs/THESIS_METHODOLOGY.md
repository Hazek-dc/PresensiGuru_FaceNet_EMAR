# Thesis Methodology

Dokumen ini mendefinisikan aturan saintifik dan metodologi eksperimen biometrik untuk sistem ini.

## 1. Arsitektur Biometrik Inti
- **Mode Sistem:** Verifikasi 1:1 secara ketat. Tidak ada pencarian *nearest-neighbor* atau 1:N fallback.
- **Model Ekstraksi:** FaceNet InceptionResnetV1 (Pretrained VGGFace2).
- **Dimensi Embedding:** 512-D.
- **Preprocessing:** Perbandingan Probe vs Gallery harus menggunakan *L2-Normalization* yang identik sebelum dihitung kesamaannya.
- **Scoring Identity:** Cosine Similarity.
- **Face & Landmark Detection:** MTCNN untuk bounding box; dlib 68-point untuk landmark mata dan mulut.

## 2. Presentation Attack Detection (PAD)
- **Metode Liveness:** EMAR (Eye & Mouth Aspect Ratio) yang berjalan di ruang temporal (video).
- **Rule Engine:** Membutuhkan tantangan acak / temporal thresholding (hysteresis) untuk mendeteksi kedipan (blink) atau bukaan mulut yang valid.
- **Fail-closed:** Jika landmark gagal dideteksi, wajah lebih dari satu, atau timeout habis, sistem harus *fail-closed* (ditolak).

## 3. Aturan Keputusan (Fusion)
- PAD dan Identity dievaluasi secara terpisah dan disimpan secara mandiri (`PAD_Pred`, `ID_Pred`).
- Keputusan Final `ACCEPT` hanya terjadi jika dan hanya jika Identity = `MATCH` dan PAD = `BONA_FIDE`.

## 4. Evaluasi Kinerja (ISO 30107-3)
- Kegagalan sistemik (wajah tak terdeteksi, dimensi embedding salah) diklasifikasikan sebagai **FTA (Failure To Acquire)**.
- FTA tidak dimasukkan dalam denominator saat menghitung *Error Rates*.
- Evaluasi serangan (APCER) dilaporkan terpisah berdasarkan **PAI Species** (contoh: PRINT, SCREEN, REPLAY).
