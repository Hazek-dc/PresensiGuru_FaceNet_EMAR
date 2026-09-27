<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Ambang Batas Biometrik Wajah FaceNet & EMAR
    | Standar Parameter Riset Skripsi Qalwani Anugerah (SMK Al-Madani)
    |--------------------------------------------------------------------------
    |
    | File konfigurasi ini memuat parameter ambang batas keputusan biometrik
    | sesuai Bab 3 Metodologi Penelitian:
    | - FaceNet Euclidean Distance Threshold (L2 <= 0.40)
    | - Strategi Fusi Liveness: S2 (Rule-Based Gate)
    | - Eye Aspect Ratio Threshold (EAR < 0.20 untuk kedipan)
    | - Mouth Aspect Ratio Threshold (MAR >= 0.10 untuk bukaan mulut)
    | - Kestabilan Wajah (Face Detection Stability >= 80.0%)
    | - Durasi Pemindaian (Scan Window = 8 detik)
    | - Jarak Akuisisi Biometrik Kamera (30 cm)
    |
    */

    'facenet_threshold' => (float) env('FACENET_THRESHOLD', 0.40),
    'liveness_strategy' => env('LIVENESS_STRATEGY', 'S2'), // 'S1', 'S2', 'S3'
    'ear_threshold' => (float) env('EAR_THRESHOLD', 0.20),
    'mar_threshold' => (float) env('MAR_THRESHOLD', 0.10),
    'stability_threshold' => (float) env('STABILITY_THRESHOLD', 80.0),
    'scan_duration_sec' => (int) env('SCAN_DURATION_SEC', 8),
    'distance_cm' => (int) env('BIOMETRICS_DISTANCE_CM', 30),

    /*
    | Umur maksimum (detik) bacaan luxmeter/sensor jarak yang masih dianggap hasil
    | ukur. Sama dengan read_sidecar() di capture_session.py (10 s). Bacaan lebih
    | tua dari ini ditandai basi dan tidak dikirim sebagai lux/jarak presensi.
    */
    'sensor_max_age_s' => (float) env('BIOMETRICS_SENSOR_MAX_AGE_S', 10),

    /*
    | Batas waktu (detik) menunggu mesin biometrik memproses satu rekaman.
    | Video 1080p 8 s diproses ~15 s di CPU, ~24 s bila model baru dimuat;
    | 30 s terlalu mepet saat komputer sibuk sehingga presensi gagal UNAVAILABLE.
    */
    'verify_timeout' => (int) env('BIOMETRICS_VERIFY_TIMEOUT', 90),

    /*
    | Skor simulasi (euclidean_distance/facenet_score dikirim di request) hanya
    | untuk pengujian otomatis. Di produksi harus false: bila true, klien dapat
    | menentukan sendiri hasil verifikasi identitasnya.
    */
    'allow_simulated_scores' => (bool) env('BIOMETRICS_ALLOW_SIMULATED_SCORES', false),

    /*
    | Basis data telemetry yang ditulis capture_session.py (tabel presentation_log).
    | Sumber tunggal ekspor presentasi berpasangan S1/S2/S3.
    */
    'telemetry_db' => env('BIOMETRICS_TELEMETRY_DB', base_path('../logs/telemetry.db')),

    /*
    | Folder proyek riset (induk attendance-web) tempat dataset/foto_selfie dan
    | dataset/self_qalwani. Tes mengarahkannya ke folder sementara agar tidak
    | menulis foto palsu atau mengubah manifest dataset asli.
    */
    'project_root' => env('BIOMETRICS_PROJECT_ROOT', dirname(base_path())),

    /*
    | Berkas dataset riset yang ditambah setiap presentasi yang diukur mesin
    | biometrik. Presentasi simulasi atau tanpa hasil mesin tidak pernah ditulis.
    */
    'research_csv' => [
        'matriks' => env('BIOMETRICS_RESEARCH_CSV_MATRIKS', base_path('../dataset/video_singkat/Matriks_Evaluasi_Bab4.csv')),
        'bab5' => env('BIOMETRICS_RESEARCH_CSV_BAB5', base_path('../Dataset_Eksperimen_Bab5.csv')),
    ],

    // Rancangan pengujian: 18 subjek x 9 kondisi x 4 label x 5 repetisi.
    'design' => [
        'subjects' => 18,
        'repetitions' => 5,
        'per_subject' => 180,
        'total_presentations' => 3240,
    ],
];
