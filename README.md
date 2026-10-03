# 👨‍🏫 PresensiGuru FaceNet-EMAR
## AI-Based Teacher Attendance System with Face Verification & Anti-Spoofing

<p align="center">
  <img src="https://img.shields.io/badge/AI-Computer%20Vision-blue">
  <img src="https://img.shields.io/badge/Deep%20Learning-FaceNet-green">
  <img src="https://img.shields.io/badge/Liveness%20Detection-EMAR-orange">
  <img src="https://img.shields.io/badge/Standard-ISO%2FIEC%2030107--3-red">
</p>


## 📌 Overview

**PresensiGuru FaceNet-EMAR** merupakan sistem presensi guru berbasis Artificial Intelligence yang menggunakan teknologi **Face Verification** dan **Presentation Attack Detection (PAD)** untuk meningkatkan keamanan absensi biometrik.

Sistem mengintegrasikan:

- **FaceNet** → Verifikasi identitas wajah menggunakan face embedding
- **Eye-Mouth Aspect Ratio (EMAR)** → Deteksi keaslian wajah (*liveness detection*)
- **Fusion Decision Model** → Pengambilan keputusan berdasarkan identitas dan vitalitas wajah

Tujuan utama sistem ini adalah mengurangi risiko manipulasi presensi seperti:

- Print Attack (foto cetak)
- Screen Attack (foto pada layar perangkat)
- Replay Video Attack

---

# 🎓 Research Background

Project ini dikembangkan berdasarkan penelitian:

> **"Analisis Kinerja FaceNet dan Eye-Mouth Aspect Ratio (EMAR) pada Sistem Face Verification Mitigasi Serangan Spoofing Presensi"**

Program Studi Teknik Informatika  
Universitas Muhammadiyah Pontianak  
2026

Penelitian menggunakan pendekatan eksperimental untuk mengevaluasi integrasi FaceNet dan EMAR pada sistem presensi guru dan staf. :chatgpt-content-reference{index="1"}


---

# 🚀 Main Features


## 👤 Face Verification

Menggunakan model:

- FaceNet Inception-ResNet-V1
- 512-dimensional face embedding
- Euclidean Distance Matching

Pipeline:


Camera
  |
  ↓
Face Detection
  |
  ↓
Face Alignment
  |
  ↓
FaceNet Embedding
  |
  ↓
Identity Verification


---

## 👁️ Liveness Detection with EMAR

EMAR menggabungkan:

### Eye Aspect Ratio (EAR)

Mendeteksi aktivitas kedipan mata.


### Mouth Aspect Ratio (MAR)

Mendeteksi pergerakan mulut.


Flow:


Facial Landmark Detection
          |
          ↓
    EAR Calculation
          |
          ↓
    MAR Calculation
          |
          ↓
    Liveness Score


---

# 🛡️ Anti Spoofing Protection


Sistem mampu mendeteksi:

| Attack Type | Detection |
|-|-|
| Print Attack | ✅ |
| Screen Attack | ✅ |
| Replay Video Attack | ✅ |
| 3D Mask Attack | ❌ Outside Scope |


Evaluasi keamanan menggunakan standar:


ISO/IEC 30107-3:2023

dengan metrik:

- APCER
- BPCER
- ACER


---

# 🏗️ System Architecture



             Webcam

                |
                ↓

      Face Processing Engine

                |
    -------------------------
    |                       |

 FaceNet                 EMAR

 Identity Verification    Liveness Detection
    |                       |

    -------- Fusion --------

                |

        Attendance Decision

                |

          Database System



Arsitektur sistem menggunakan pendekatan **decoupled architecture**:


Python AI Engine
        |
        |
 REST API
        |
        |
Laravel Web Application
        |
        |
MySQL Database


---

# 🧠 Technology Stack


## Artificial Intelligence

| Technology | Purpose |
|-|-|
| FaceNet | Face embedding |
| Inception-ResNet-V1 | Feature extraction |
| Dlib 68 Landmark | Facial landmark |
| EMAR | Liveness detection |


## Backend

- Python 3.10+
- Flask API
- TensorFlow / Keras
- OpenCV
- NumPy


## Web Application

- Laravel 11
- PHP 8.2+
- Tailwind CSS
- MySQL


---

# 📊 Experimental Dataset


Dataset penelitian:

| Category | Amount |
|-|-:|
| Bona-fide Image | 1,620 |
| Print Attack | 1,620 |
| Screen Attack | 1,620 |
| Replay Video Attack | 1,620 |
| Total Dataset | **6,480 images** |


Dataset berasal dari:

- 18 guru dan staf
- SMK Al-Madani Pontianak
- 27 kondisi eksperimen

:chatgpt-content-reference{index="2"}


---

# 📈 Performance Result


Hasil evaluasi sistem:


| Method | Accuracy | F1 Score | ACER |
|-|-:|-:|-:|
| FaceNet Only | - | - | 49.81% |
| FaceNet + EMAR Rule | 99.00% | 98.01% | 1.14% |
| **FaceNet + EMAR Weighted Fusion** | **99.74%** | **99.48%** | **0.22%** |


Konfigurasi weighted fusion menghasilkan performa terbaik:

- Accuracy: **99.74%**
- F1-score: **99.48%**
- APCER: **0.31%**
- BPCER: **0.12%**
- ACER: **0.22%**

:chatgpt-content-reference{index="3"}


---

# 📂 Project Structure



PresensiGuru_FaceNet_EMAR/
│
├── AI_ENGINE/
│   ├── facenet/
│   ├── emar/
│   ├── detection/
│   └── inference/
│
├── backend/
│   ├── flask_api/
│   └── database/
│
├── frontend/
│   └── laravel_app/
│
├── dataset/
│
├── models/
│
├── requirements.txt
│
└── README.md


---

# ⚙️ Installation


## Clone Repository


```bash
git clone https://github.com/Hazek-dc/PresensiGuru_FaceNet_EMAR.git

cd PresensiGuru_FaceNet_EMAR

Install Python Dependencies
pip install -r requirements.txt

Run AI Engine
python app.py

Run Laravel Application
composer install

php artisan serve

🎥 System Workflow
Registration
1. User melakukan enrollment wajah
2. Kamera mengambil citra wajah
3. FaceNet menghasilkan embedding
4. Template wajah disimpan
Attendance
1. Kamera membaca wajah
2. FaceNet melakukan verification
3. EMAR melakukan liveness detection
4. Fusion model menentukan keputusan
5. Sistem menyimpan log presensi
🔐 Security Features
✅ Biometric verification
✅ Liveness detection
✅ Anti photo spoofing
✅ Anti screen spoofing
✅ Anti replay attack
✅ Biometric embedding storage  
🛣️ Future Development
Version 2.0
- Mobile attendance application
- Real-time dashboard
- Cloud deployment
- Notification system
Version 3.0
- Active challenge-response liveness
- Infrared camera support
- Deepfake attack detection
👨‍💻 Author
Hazek-dc
AI Engineer | Computer Vision Developer
⭐ Support
Jika project ini membantu penelitian atau pengembangan Anda:
Berikan ⭐ pada repository ini.

---

README ini sudah lebih cocok untuk:
- ✅ GitHub portfolio
- ✅ Tugas akhir / skripsi showcase
- ✅ Research project
- ✅ Presentasi dosen/penguji
- ✅ Portofolio AI Engineer

Saya juga menyarankan menambahkan:
1. **Banner cover AI face recognition**
2. **Screenshot dashboard & kamera presensi**
3. **GIF demo real-time recognition**
4. **Diagram Mermaid architecture**
5. **GitHub Actions + badge build**

agar repository terlihat seperti proyek AI profesional.
