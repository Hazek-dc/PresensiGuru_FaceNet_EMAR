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
