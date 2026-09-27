/**
 * Estimasi Jarak Wajah ke Kamera (Live Distance Sensor)
 * Penelitian: FaceNet + EMAR — Qalwani Anugerah — UMP 2026
 *
 * Prinsip Optik & Geometri Wajah Antropometri:
 * - Jarak Interokular Rata-rata Dewasa (IPD): ~6.3 cm
 * - Lebar Wajah Bizigomatik Rata-rata: ~14.0 cm
 * - Hubungan Pin-hole Kamera: D = (W_real * f) / W_pixel = K / Ratio
 *   - Pada 30 cm (Dekat Skripsi): Rasio interokular ~0.15, Lebar wajah ~0.42
 *   - Pada 45 cm (Ideal Skripsi): Rasio interokular ~0.10, Lebar wajah ~0.28
 *   - Pada 60 cm (Jauh Skripsi): Rasio interokular ~0.075, Lebar wajah ~0.21
 */

import { Landmark3D } from '../Hooks/useFaceLandmarker';

export const DISTANCE_BENCHMARKS = {
    CLOSE_30: 30, // 30 cm (Kondisi Baku Operasional & Cochran Skenario 1)
    MID_45: 45,   // 45 cm (Cochran Skenario 2)
    FAR_60: 60,   // 60 cm (Cochran Skenario 3)
} as const;

export interface DistanceCategory {
    label: string;
    code: 'TOO_CLOSE' | 'IDEAL_30' | 'MID_45' | 'FAR_60' | 'TOO_FAR';
    badgeColor: string;
    guidanceMessage: string;
    isIdeal: boolean;
    isValidDistance: boolean;
    benchmarkTarget: number;
}

// Rentang posisi Subbab 5.2: 30-40 (Dekat), 45-55 (Ideal), 60-70 (Jauh). Posisi di antara
// rentang tidak sah dan diarahkan ke tingkat terdekat, sama dengan DistanceController.php.
export function getDistanceCategory(distanceCm: number): DistanceCategory {
    if (distanceCm < 30) {
        return {
            label: 'Terlalu Dekat',
            code: 'TOO_CLOSE',
            badgeColor: 'border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-300',
            guidanceMessage: 'Mundur sedikit dari kamera (< 30 cm)',
            isIdeal: false,
            isValidDistance: false,
            benchmarkTarget: 30,
        };
    }
    if (distanceCm <= 40) {
        return {
            label: '30 cm (Dekat)',
            code: 'IDEAL_30',
            badgeColor: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
            guidanceMessage: 'Jarak dekat valid (30 - 40 cm) - Skenario pengujian 30 cm',
            isIdeal: false,
            isValidDistance: true,
            benchmarkTarget: 30,
        };
    }
    if (distanceCm < 45) {
        return {
            label: 'Terlalu Dekat',
            code: 'TOO_CLOSE',
            badgeColor: 'border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-300',
            guidanceMessage: 'Di luar rentang posisi, mundur ke 45 - 55 cm',
            isIdeal: false,
            isValidDistance: false,
            benchmarkTarget: 45,
        };
    }
    if (distanceCm <= 55) {
        return {
            label: '45 cm (Ideal)',
            code: 'MID_45',
            badgeColor: 'border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-300',
            guidanceMessage: 'Jarak ideal valid (45 - 55 cm) - Skenario pengujian 45 cm',
            isIdeal: true,
            isValidDistance: true,
            benchmarkTarget: 45,
        };
    }
    if (distanceCm < 60) {
        return {
            label: 'Terlalu Dekat',
            code: 'TOO_CLOSE',
            badgeColor: 'border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-300',
            guidanceMessage: 'Di luar rentang posisi, mundur ke 60 - 70 cm',
            isIdeal: false,
            isValidDistance: false,
            benchmarkTarget: 60,
        };
    }
    if (distanceCm <= 70) {
        return {
            label: '60 cm (Jauh)',
            code: 'FAR_60',
            badgeColor: 'border-purple-500/40 bg-purple-500/15 text-purple-800 dark:text-purple-300',
            guidanceMessage: 'Jarak jauh valid (60 - 70 cm) - Skenario pengujian 60 cm',
            isIdeal: false,
            isValidDistance: true,
            benchmarkTarget: 60,
        };
    }
    return {
        label: 'Terlalu Jauh',
        code: 'TOO_FAR',
        badgeColor: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300',
        guidanceMessage: 'Maju lebih dekat ke kamera (> 70 cm)',
        isIdeal: false,
        isValidDistance: false,
        benchmarkTarget: 60,
    };
}

// Kalibrasi konstan antropometri berdasarkan rasio frame
const K_INTEROCULAR = 4.55; // 30cm * 0.1517 iod ratio
const K_FACE_WIDTH = 12.60;  // 30cm * 0.4200 face width ratio

/**
 * Menghitung estimasi jarak kamera ke wajah secara live dalam centimeter (cm)
 * Menggunakan fusi jarak interokular (mata kiri ke kanan) dan lebar anatomi pipi.
 */
export function estimateFaceDistance(landmarks: Landmark3D[] | null): number | null {
    if (!landmarks || landmarks.length < 468) {
        return null;
    }

    try {
        // MediaPipe Landmark Index:
        // Mata Kiri: 33 (outer), 133 (inner) -> pusat mata kiri
        // Mata Kanan: 263 (outer), 362 (inner) -> pusat mata kanan
        // Tulang Pipi: 234 (kiri), 454 (kanan)
        const leftEyeX = (landmarks[33].x + landmarks[133].x) / 2;
        const leftEyeY = (landmarks[33].y + landmarks[133].y) / 2;
        const rightEyeX = (landmarks[263].x + landmarks[362].x) / 2;
        const rightEyeY = (landmarks[263].y + landmarks[362].y) / 2;

        const iodRatio = Math.hypot(rightEyeX - leftEyeX, rightEyeY - leftEyeY);

        const cheekLeftX = landmarks[234].x;
        const cheekRightX = landmarks[454].x;
        const faceWidthRatio = Math.abs(cheekRightX - cheekLeftX);

        if (iodRatio < 0.02 || faceWidthRatio < 0.05) {
            return null;
        }

        // Estimasi jarak optik
        const distFromIod = K_INTEROCULAR / iodRatio;
        const distFromWidth = K_FACE_WIDTH / faceWidthRatio;

        // Fusi berbobot: 70% IOD (sangat stabil) + 30% Cheek width
        const rawDistanceCm = (distFromIod * 0.70) + (distFromWidth * 0.30);

        // Batasi rentang realistis kamera presensi (15 cm s.d. 120 cm)
        const clamped = Math.max(15, Math.min(120, rawDistanceCm));
        return Math.round(clamped * 10) / 10;
    } catch {
        return null;
    }
}

/**
 * Filter Smoothing Exponential Moving Average (EMA) untuk menstabilkan pembacaan live sensor
 */
export class DistanceSensorSmoother {
    private currentDistance: number | null = null;
    private alpha: number;

    constructor(alpha: number = 0.25) {
        this.alpha = alpha;
    }

    public update(rawDistance: number | null): number | null {
        if (rawDistance === null) {
            return this.currentDistance;
        }

        if (this.currentDistance === null) {
            this.currentDistance = rawDistance;
            return this.currentDistance;
        }

        // Jika perubahan jarak sangat drastis (subjek berpindah posisi), tingkatkan responsivitas
        const delta = Math.abs(rawDistance - this.currentDistance);
        const dynamicAlpha = delta > 15 ? 0.6 : this.alpha;

        this.currentDistance = (rawDistance * dynamicAlpha) + (this.currentDistance * (1 - dynamicAlpha));
        return Math.round(this.currentDistance * 10) / 10;
    }

    public reset(): void {
        this.currentDistance = null;
    }
}
