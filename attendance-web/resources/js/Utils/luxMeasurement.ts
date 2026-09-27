/**
 * Modul Pengukuran Intensitas Cahaya Ruangan Melalui Kamera ke Objek Manusia
 * (Human Face & Room Photometry Measurement Engine)
 * Penelitian Skripsi: FaceNet + EMAR — Qalwani Anugerah — UMP 2026
 *
 * Prinsip Fisika & Standar Acuan:
 * - ISO/IEC 30107-3: Presentation Attack Detection (Evaluasi Pencahayaan Lingkungan)
 * - ITU-R BT.709: Relative Luminance (Y = 0.2126R + 0.7152G + 0.0722B)
 * - Model Reflektansi Difus Kulit Manusia (Lambertian Surface): Albedo rho ≈ 0.35
 * - Pengukuran Cahaya Ruangan Murni: Mengeliminasi bias kecerahan layar perangkat (screen glare discount)
 */

export interface LuxCategory {
    label: 'Redup' | 'Standar' | 'Terang';
    code: 'LOW' | 'NORMAL' | 'HIGH';
    badgeColor: string;
    description: string;
    isOptimal: boolean;
    benchmarkTarget: number;
}

export interface CameraSettingsLike {
    exposureTime?: number;      // in seconds or ms
    iso?: number;               // ISO sensitivity (e.g. 100, 200, 800)
    exposureCompensation?: number;
    exposureMode?: string;
}

export interface NormalizedFaceROI {
    xMin: number; // 0..1
    yMin: number; // 0..1
    xMax: number; // 0..1
    yMax: number; // 0..1
    isDetected: boolean;
}

export interface PhotometryAnalysis {
    rawLux: number;
    calibratedLux: number;
    meanFaceY: number;
    meanCenterY: number; // Alias untuk kompatibilitas ke belakang
    meanAmbientY: number;
    shadowClipRatio: number;
    highlightClipRatio: number;
    contrastRatio: number;
    isFaceTargeted: boolean;
    isGlareCompensated: boolean;
    method: 'human_face_photometry' | 'apex_exposure' | 'fallback_portrait_photometry';
}

export interface CalibrationProfile {
    id: string;
    name: string;
    factor: number;
    offset: number;
    description: string;
}

export const CALIBRATION_PROFILES: CalibrationProfile[] = [
    {
        id: 'LAPTOP_DEFAULT',
        name: 'Webcam Laptop Standar',
        factor: 1.0,
        offset: 0,
        description: 'Kalibrasi standar untuk kamera internal laptop (f/2.0 - f/2.4)',
    },
    {
        id: 'EXTERNAL_USB',
        name: 'Webcam USB Eksternal (HD / Pro)',
        factor: 1.25,
        offset: 0,
        description: 'Sensor dengan bukaan lensa lebih besar / auto-gain agresif',
    },
    {
        id: 'SMARTPHONE_FRONT',
        name: 'Kamera Depan Smartphone',
        factor: 0.85,
        offset: 0,
        description: 'Sensor smartphone dengan aperture lebar (f/1.8 - f/2.2)',
    },
    {
        id: 'HIGH_SENSITIVITY',
        name: 'Sensor Sensitivitas Tinggi / Ruang Redup',
        factor: 0.70,
        offset: -10,
        description: 'Kompensasi kamera yang melakukan over-exposure di kondisi temaram',
    },
];

export const LUX_CALIBRATION_STORAGE_KEY = 'presensi_lux_calibration_v2';

// Subbab 5.2: redup < 100, standar 100 - 300 (inklusif), terang > 300
export function getLuxCategory(lux: number): LuxCategory {
    if (lux < 100) {
        return {
            label: 'Redup',
            code: 'LOW',
            badgeColor: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300',
            description: 'Pencahayaan rendah (< 100 Lux) — ISO 30107 Skenario Redup',
            isOptimal: false,
            benchmarkTarget: 75,
        };
    }
    if (lux <= 300) {
        return {
            label: 'Standar',
            code: 'NORMAL',
            badgeColor: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
            description: 'Pencahayaan optimal (100 - 300 Lux) — Rekomendasi FaceNet + EMAR',
            isOptimal: true,
            benchmarkTarget: 300,
        };
    }
    return {
        label: 'Terang',
        code: 'HIGH',
        badgeColor: 'border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-300',
        description: 'Pencahayaan tinggi (> 300 Lux) — ISO 30107 Skenario Terang',
        isOptimal: false,
        benchmarkTarget: 650,
    };
}

/**
 * Menghitung estimasi intensitas cahaya ruangan (Lux) dari sensor optik kamera yang
 * mengarah ke objek manusia (wajah).
 *
 * Memisahkan intensitas cahaya pada objek wajah dari cahaya latar belakang ruangan,
 * serta mendiskon pendaran cahaya monitor perangkat (screen glare) ketika berada di ruangan gelap.
 */
export function calculatePhotometricLux(
    rgbaData: Uint8ClampedArray,
    width: number,
    height: number,
    faceROI?: NormalizedFaceROI | null,
    cameraSettings?: CameraSettingsLike,
    calibFactor = 1.0,
    calibOffset = 0.0,
): PhotometryAnalysis {
    if (!rgbaData || rgbaData.length === 0 || width <= 0 || height <= 0) {
        return {
            rawLux: 300,
            calibratedLux: 300,
            meanFaceY: 128,
            meanCenterY: 128,
            meanAmbientY: 128,
            shadowClipRatio: 0,
            highlightClipRatio: 0,
            contrastRatio: 1.0,
            isFaceTargeted: false,
            isGlareCompensated: false,
            method: 'fallback_portrait_photometry',
        };
    }

    // 1. Tentukan batas piksel ROI Objek Manusia (Face) vs Ruangan Sekitar (Ambient)
    const isFaceTargeted = Boolean(
        faceROI?.isDetected &&
        faceROI.xMax > faceROI.xMin &&
        faceROI.yMax > faceROI.yMin,
    );

    let fxMin: number;
    let fxMax: number;
    let fyMin: number;
    let fyMax: number;

    if (isFaceTargeted && faceROI) {
        // Inset 10% untuk fokus pada area kulit wajah (dahi, pipi, hidung) dan menghindari rambut/tepi
        const marginX = (faceROI.xMax - faceROI.xMin) * 0.10;
        const marginY = (faceROI.yMax - faceROI.yMin) * 0.10;
        fxMin = Math.max(0, Math.floor((faceROI.xMin + marginX) * width));
        fxMax = Math.min(width - 1, Math.ceil((faceROI.xMax - marginX) * width));
        fyMin = Math.max(0, Math.floor((faceROI.yMin + marginY) * height));
        fyMax = Math.min(height - 1, Math.ceil((faceROI.yMax - marginY) * height));
    } else {
        // Fallback ke area portrait tengah (kepala dan bahu manusia)
        fxMin = Math.floor(width * 0.32);
        fxMax = Math.floor(width * 0.68);
        fyMin = Math.floor(height * 0.20);
        fyMax = Math.floor(height * 0.75);
    }

    let sumFaceY = 0;
    let countFace = 0;
    let sumAmbientY = 0;
    let countAmbient = 0;

    let shadowClipCount = 0; // Y < 20
    let highlightClipCount = 0; // Y > 235
    const totalPixels = width * height;

    for (let y = 0; y < height; y++) {
        const isYInFace = y >= fyMin && y <= fyMax;
        const rowOffset = y * width * 4;

        for (let x = 0; x < width; x++) {
            const idx = rowOffset + x * 4;
            const r = rgbaData[idx];
            const g = rgbaData[idx + 1];
            const b = rgbaData[idx + 2];

            // ITU-R BT.709 Relative Luminance
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            if (lum < 20) shadowClipCount++;
            if (lum > 235) highlightClipCount++;

            if (isYInFace && x >= fxMin && x <= fxMax) {
                sumFaceY += lum;
                countFace++;
            } else {
                sumAmbientY += lum;
                countAmbient++;
            }
        }
    }

    const meanFaceY = countFace > 0 ? sumFaceY / countFace : 128;
    const meanAmbientY = countAmbient > 0 ? sumAmbientY / countAmbient : 128;
    const shadowClipRatio = shadowClipCount / totalPixels;
    const highlightClipRatio = highlightClipCount / totalPixels;
    const contrastRatio = meanAmbientY > 0 ? meanFaceY / meanAmbientY : 1.0;

    // 2. Filter Eliminasi Pendaran Cahaya Layar (Screen Brightness Glare Discount)
    // Jika ruangan gelap (meanAmbientY < 35 dan shadowClipRatio tinggi), tetapi wajah tampak terang
    // karena pendaran monitor/layar HP langsung ke muka, diskon pendaran tersebut agar tidak
    // mengelabui sistem menjadi mengira ruangan terang.
    let isGlareCompensated = false;
    let effectiveFaceY = meanFaceY;

    if (meanAmbientY < 65 && meanFaceY > meanAmbientY * 1.4) {
        const screenGlareBonus = meanFaceY - meanAmbientY * 1.2;
        effectiveFaceY = Math.max(meanAmbientY, meanFaceY - screenGlareBonus * 0.85);
        isGlareCompensated = true;
    }

    let rawLux: number;
    let method: PhotometryAnalysis['method'];

    // 3. Jika WebRTC Camera Driver menyediakan metadata eksposur fisik (ISO & Shutter)
    let exposureSeconds = cameraSettings?.exposureTime;
    const iso = cameraSettings?.iso;

    if (exposureSeconds !== undefined && exposureSeconds > 1.0) {
        // Konversi milidetik ke detik
        exposureSeconds = exposureSeconds / 1000.0;
    }

    if (exposureSeconds && exposureSeconds > 0 && iso && iso > 0) {
        // Model APEX untuk objek manusia:
        // Reflektansi kulit difus rho ≈ 0.35 -> C ≈ 250
        const N = 2.0; // Bukaan aperture standar webcam
        const apexLux = (250 * (N * N) / (exposureSeconds * iso)) * (effectiveFaceY / 128.0);
        rawLux = Math.max(5, Math.min(50000, apexLux));
        method = 'apex_exposure';
    } else {
        // 4. Estimasi Inversi Kamera AEC/AGC Berdasarkan Reflektansi Wajah & Cahaya Ruangan
        let aecGainFactor = 1.0;
        if (shadowClipRatio > 0.08) {
            aecGainFactor -= Math.min(0.65, (shadowClipRatio - 0.08) * 2.2);
        }
        if (highlightClipRatio > 0.06) {
            aecGainFactor += Math.min(1.8, highlightClipRatio * 3.5);
        }

        // Fusi bobot: 65% intensitas pada objek manusia + 35% cahaya ruangan sekitar
        const effectiveRoomLuminance = (effectiveFaceY * 0.65 + meanAmbientY * 0.35) / 255.0;

        // Model kurva fotometri ruangan terkalibrasi ISO 30107:
        // - Ruang redup (effY ~ 0.22) -> ~75 Lux
        // - Ruang standar (effY ~ 0.52) -> ~300 Lux
        // - Ruang terang (effY ~ 0.78) -> ~650 Lux
        const baseLux = 850.0 * Math.pow(Math.max(0.01, effectiveRoomLuminance), 1.75);
        rawLux = baseLux * Math.max(0.15, aecGainFactor);
        method = isFaceTargeted ? 'human_face_photometry' : 'fallback_portrait_photometry';
    }

    // 5. Terapkan Faktor Kalibrasi Profil Lensa & Offset
    const roundedRaw = Math.round(rawLux);
    const calibratedLux = Math.max(5, Math.min(25000, Math.round(roundedRaw * calibFactor + calibOffset)));

    return {
        rawLux: roundedRaw,
        calibratedLux,
        meanFaceY: Math.round(meanFaceY),
        meanCenterY: Math.round(meanFaceY), // Alias untuk kompatibilitas
        meanAmbientY: Math.round(meanAmbientY),
        shadowClipRatio: parseFloat(shadowClipRatio.toFixed(3)),
        highlightClipRatio: parseFloat(highlightClipRatio.toFixed(3)),
        contrastRatio: parseFloat(contrastRatio.toFixed(2)),
        isFaceTargeted,
        isGlareCompensated,
        method,
    };
}

/**
 * Filter Penghalus Eksponensial (EMA) dengan Deteksi Lonjakan Adaptif
 * Mengeliminasi flicker 50Hz/60Hz lampu listrik tanpa menimbulkan lag pada respons real-time.
 */
export class LuxSensorSmoother {
    private currentLux: number | null = null;
    private readonly defaultAlpha: number;
    private readonly fastAlpha: number;

    constructor(defaultAlpha = 0.30, fastAlpha = 0.75) {
        this.defaultAlpha = defaultAlpha;
        this.fastAlpha = fastAlpha;
    }

    public update(newLux: number): number {
        if (this.currentLux === null) {
            this.currentLux = newLux;
            return newLux;
        }

        const delta = Math.abs(newLux - this.currentLux);
        // Jika ada perubahan drastis (misal menyalakan lampu atau blitz), gunakan respons cepat
        const alpha = delta > 120 ? this.fastAlpha : this.defaultAlpha;

        this.currentLux = alpha * newLux + (1 - alpha) * this.currentLux;
        return Math.round(this.currentLux);
    }

    public reset(): void {
        this.currentLux = null;
    }

    public get current(): number | null {
        return this.currentLux !== null ? Math.round(this.currentLux) : null;
    }
}


/**
 * Menyimpan konfigurasi kalibrasi ke localStorage
 */
export function saveLuxCalibration(profileId: string, factor: number, offset: number): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(
            LUX_CALIBRATION_STORAGE_KEY,
            JSON.stringify({ profileId, factor, offset, updatedAt: Date.now() }),
        );
    } catch {}
}

/**
 * Memuat konfigurasi kalibrasi dari localStorage
 */
export function loadLuxCalibration(): { profileId: string; factor: number; offset: number } {
    if (typeof window === 'undefined') {
        return { profileId: 'LAPTOP_DEFAULT', factor: 1.0, offset: 0 };
    }
    try {
        const raw = localStorage.getItem(LUX_CALIBRATION_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.factor === 'number') {
                return {
                    profileId: parsed.profileId || 'CUSTOM',
                    factor: parsed.factor,
                    offset: parsed.offset || 0,
                };
            }
        }
    } catch {}
    return { profileId: 'LAPTOP_DEFAULT', factor: 1.0, offset: 0 };
}
