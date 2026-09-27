/**
 * Konfigurasi Kalibrasi Jarak Wajah & Lingkaran Panduan (Guide Circle)
 * Sistem Presensi Biometrik FaceNet + EMAR
 */

export interface FaceDistanceConfig {
    /** Rasio minimum lebar wajah terhadap lebar frame (terlalu jauh jika di bawah nilai ini) */
    MIN_DISTANCE_RATIO: number;
    /** Rasio maksimum lebar wajah terhadap lebar frame (terlalu dekat jika di atas nilai ini) */
    MAX_DISTANCE_RATIO: number;
    /** Durasi stabilisasi posisi ideal dalam milidetik sebelum dianggap 'Jarak OK' */
    STABILIZE_MS: number;
    /** Rasio diameter lingkaran panduan terhadap lebar frame (0.5 = 50%) */
    GUIDE_CIRCLE_RATIO: number;
    /** Toleransi histeresis (±5%) agar status jarak tidak mudah flicker */
    HYSTERESIS_TOLERANCE: number;
    /** Margin aman batas luar frame untuk mencegah landmark terpotong */
    FRAME_CLIP_MARGIN: number;
}

export const FACE_DISTANCE_CONFIG: Readonly<FaceDistanceConfig> = {
    MIN_DISTANCE_RATIO: 0.18, // Accommodates 60cm (~0.21), 45cm (~0.28), and 30cm (~0.42)
    MAX_DISTANCE_RATIO: 0.60,
    STABILIZE_MS: 1500,
    GUIDE_CIRCLE_RATIO: 0.50,
    HYSTERESIS_TOLERANCE: 0.05,
    FRAME_CLIP_MARGIN: 0.03,
};
