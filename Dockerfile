# ============================================================
# Dockerfile — Microservice Biometrik Python
# FaceNet + EMAR Liveness Detection API
# Sesuai arsitektur: Browser → Backend Laravel → Microservice Python
# ============================================================
FROM python:3.11-slim

# Install dependensi sistem (diperlukan dlib + OpenCV)
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    build-essential \
    libopenblas-dev \
    liblapack-dev \
    libx11-6 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    wget \
    bzip2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Salin file dependensi terlebih dahulu (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Unduh model Dlib 68-point landmark
RUN mkdir -p models && \
    wget -q http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2 -O models/model.bz2 && \
    bzip2 -d models/model.bz2 && \
    mv models/model models/shape_predictor_68_face_landmarks.dat

# Salin kode aplikasi
COPY . .

# Buat direktori log dan galeri
RUN mkdir -p logs gallery results exports

# Expose port Flask API
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:5000/health || exit 1

# Jalankan Flask API
CMD ["python", "facenet_emar_system.py", "api", "--host", "0.0.0.0", "--port", "5000"]
