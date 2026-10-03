/**
 * Kalibrasi jarak kamera ke wajah dan pra-cek posisi sebelum pemindaian 8 s.
 *
 * Rasio lebar wajah r = lebar wajah (px) / lebar frame (px). Di browser r diambil
 * dari landmark MediaPipe 234 dan 454 (titik pipi yang juga dipakai
 * estimateFaceDistance). Engine memakai rahang dlib 0-16, jadi kedua ukuran punya
 * model sendiri: d_cm = a / r + b, dicocokkan dengan kuadrat terkecil pada titik
 * 30/45/60 cm yang diukur operator dengan meteran.
 *
 * Harus identik dengan app/Services/DistanceModel.php: rentang, pesan,
 * pembulatan, dan aturan validasi kalibrasi dipakai bersama.
 */

import type { Landmark3D } from '../Hooks/useFaceLandmarker';

export type DistanceBandCategory = 'DEKAT' | 'IDEAL' | 'JAUH';
export type DistanceCategoryCode = DistanceBandCategory | 'INVALID';
export type CalibrationTarget = 30 | 45 | 60;

export interface DistanceBand {
    category: DistanceBandCategory;
    target_cm: CalibrationTarget;
    min_cm: number;
    max_cm: number;
    label: string;
}

// Sama dengan DISTANCE_BANDS di parameter_penelitian.py; batas inklusif.
export const DISTANCE_BANDS: readonly DistanceBand[] = [
    { category: 'DEKAT', target_cm: 30, min_cm: 30, max_cm: 40, label: 'Dekat' },
    { category: 'IDEAL', target_cm: 45, min_cm: 45, max_cm: 55, label: 'Ideal' },
    { category: 'JAUH', target_cm: 60, min_cm: 60, max_cm: 70, label: 'Jauh' },
];

export const CALIBRATION_TARGETS: readonly CalibrationTarget[] = [30, 45, 60];
export const DEFAULT_MAX_RESIDUAL_CM = 3.0;

export const DISTANCE_MESSAGES = {
    DEKAT: 'Posisi dekat (30-40 cm)',
    IDEAL: 'Posisi sesuai (45-55 cm)',
    JAUH: 'Posisi jauh (60-70 cm)',
    NO_FACE: 'Wajah belum terdeteksi',
    NOT_MEASURED: 'Jarak belum terukur',
} as const;

const CHEEK_LEFT = 234;
const CHEEK_RIGHT = 454;

/**
 * round() PHP 8.3: setengah menjauhi nol, dengan pra-pembulatan 15 digit agar
 * 40.05 menjadi 40.1 seperti yang ditulis, bukan 40.0 akibat representasi biner.
 */
export function phpRound(value: number, places: number): number {
    if (!Number.isFinite(value)) {
        return value;
    }
    const factor = 10 ** places;
    const scaled = Number((Math.abs(value) * factor).toPrecision(15));
    return (Math.sign(value) * Math.round(scaled)) / factor;
}

export const round1 = (value: number): number => phpRound(value, 1);

/** DistanceModel::fmt(): angka dengan paling banyak `places` desimal, nol di belakang dibuang. */
export function phpFmt(value: number, places = 1): string {
    const fixed = phpRound(value, places).toFixed(places);
    return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

export function faceWidthRatio(landmarks: ReadonlyArray<Pick<Landmark3D, 'x'>> | null | undefined): number | null {
    if (!landmarks || landmarks.length <= CHEEK_RIGHT) {
        return null;
    }
    const left = landmarks[CHEEK_LEFT]?.x;
    const right = landmarks[CHEEK_RIGHT]?.x;
    if (typeof left !== 'number' || typeof right !== 'number') {
        return null;
    }
    const ratio = Math.abs(right - left);
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** Median nilai berhingga; null bila tidak ada satu pun. */
export function median(values: ReadonlyArray<number | null | undefined>): number | null {
    const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (finite.length === 0) {
        return null;
    }
    const sorted = [...finite].sort((p, q) => p - q);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface InverseModel {
    a: number;
    b: number;
    max_residual_cm: number | null;
}

export function isUsableModel(model: Partial<InverseModel> | null | undefined): model is InverseModel {
    return (
        !!model &&
        typeof model.a === 'number' &&
        typeof model.b === 'number' &&
        Number.isFinite(model.a) &&
        Number.isFinite(model.b) &&
        model.a > 0
    );
}

/** Jarak (cm, 0,1) dari rasio lebar wajah; null tanpa rasio atau model yang sah. */
export function estimateFromRatio(ratio: number | null | undefined, model: Partial<InverseModel> | null | undefined): number | null {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || !isUsableModel(model)) {
        return null;
    }
    const estimate = model.a / ratio + model.b;
    return Number.isFinite(estimate) ? round1(estimate) : null;
}

export interface CalibrationPointInput {
    target_cm: number;
    ratio: number | null | undefined;
}

export interface FittedPoint {
    target_cm: CalibrationTarget;
    ratio: number;
    fitted_cm: number;
    residual_cm: number;
}

export type FitFailure = 'missing_points' | 'ratios_not_decreasing' | 'non_positive_slope' | 'residual_too_large';

export interface FitResult {
    ok: boolean;
    reason: FitFailure | null;
    message: string | null;
    /** Ada juga saat residu melewati batas, supaya operator melihat angkanya. */
    model: InverseModel | null;
    points: FittedPoint[];
}

function fitFailure(reason: FitFailure, message: string, model: InverseModel | null = null, points: FittedPoint[] = []): FitResult {
    return { ok: false, reason, message, model, points };
}

/**
 * Kuadrat terkecil d = a * (1/r) + b atas titik 30, 45 dan 60 cm, sama dengan
 * DistanceModel::fit() termasuk teks alasannya: rasio harus di (0, 1], residu
 * dibulatkan 0,01 cm sebelum dibandingkan dengan batas. Titik ganda untuk target
 * yang sama: yang terakhir dipakai.
 */
export function fitInverseModel(
    points: ReadonlyArray<CalibrationPointInput>,
    maxResidualCm: number = DEFAULT_MAX_RESIDUAL_CM,
): FitResult {
    const byTarget = new Map<CalibrationTarget, number>();
    for (const point of points) {
        const target = CALIBRATION_TARGETS.find((t) => t === Number(point.target_cm));
        const ratio = point.ratio;
        if (target !== undefined && typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 && ratio <= 1) {
            byTarget.set(target, ratio);
        }
    }

    const missing = CALIBRATION_TARGETS.filter((t) => !byTarget.has(t));
    if (missing.length > 0) {
        return fitFailure(
            'missing_points',
            `Titik kalibrasi belum lengkap: ${missing.map((t) => `${t} cm`).join(', ')} belum terekam.`,
        );
    }

    const ordered = CALIBRATION_TARGETS.map((t) => ({ target_cm: t, ratio: byTarget.get(t) as number }));
    for (let i = 1; i < ordered.length; i++) {
        const [near, far] = [ordered[i - 1], ordered[i]];
        if (!(near.ratio > far.ratio)) {
            return fitFailure(
                'ratios_not_decreasing',
                `Rasio lebar wajah tidak mengecil dari ${near.target_cm} cm ke ${far.target_cm} cm ` +
                    `(${near.ratio.toFixed(4)} lalu ${far.ratio.toFixed(4)}). Ulangi perekaman dengan jarak yang diukur meteran.`,
            );
        }
    }

    const xs = ordered.map((p) => 1 / p.ratio);
    const ds = ordered.map((p) => p.target_cm);
    const n = ordered.length;
    const meanX = xs.reduce((s, v) => s + v, 0) / n;
    const meanD = ds.reduce((s, v) => s + v, 0) / n;
    let sxx = 0;
    let sxd = 0;
    for (let i = 0; i < n; i++) {
        sxx += (xs[i] - meanX) ** 2;
        sxd += (xs[i] - meanX) * (ds[i] - meanD);
    }
    const a = sxx > 0 ? sxd / sxx : 0;
    const b = meanD - a * meanX;

    if (!(a > 0)) {
        return fitFailure('non_positive_slope', 'Model jarak tidak sah: koefisien a tidak positif. Ulangi perekaman ketiga titik.');
    }

    const fitted: FittedPoint[] = ordered.map((p, i) => {
        const fittedCm = a * xs[i] + b;
        return { target_cm: p.target_cm, ratio: p.ratio, fitted_cm: fittedCm, residual_cm: phpRound(p.target_cm - fittedCm, 2) };
    });
    const maxResidual = Math.max(...fitted.map((p) => Math.abs(p.residual_cm)));
    const model: InverseModel = { a, b, max_residual_cm: maxResidual };

    if (maxResidual > maxResidualCm) {
        return fitFailure(
            'residual_too_large',
            `Sisa model ${phpFmt(maxResidual, 2)} cm melebihi batas ${phpFmt(maxResidualCm, 2)} cm. Ulangi perekaman titik yang meleset.`,
            model,
            fitted,
        );
    }
    return { ok: true, reason: null, message: null, model, points: fitted };
}

export interface DistanceClassification {
    distance_cm: number | null;
    category: DistanceCategoryCode;
    allow_verification: boolean;
    message: string;
}

function bandRange(band: DistanceBand): string {
    return `${band.min_cm}-${band.max_cm} cm`;
}

/**
 * Arahan ke tepi rentang terdekat. Jarak celah dibulatkan 0,01 dan seri dimenangi
 * rentang yang lebih jauh (42,5 -> mundur ke 45-55), seperti DistanceModel::guidance().
 */
function guidanceOutsideBands(cm: number): string {
    let nearest = DISTANCE_BANDS[0];
    let nearestGap = Number.POSITIVE_INFINITY;
    for (const band of DISTANCE_BANDS) {
        const gap = phpRound(cm < band.min_cm ? band.min_cm - cm : cm - band.max_cm, 2);
        if (gap <= nearestGap) {
            nearest = band;
            nearestGap = gap;
        }
    }
    return `${cm < nearest.min_cm ? 'Mundur' : 'Maju'} ke ${bandRange(nearest)}`;
}

/**
 * Kategori posisi (Subbab 7 PRD, keputusan D1). Ketiga rentang boleh lanjut di
 * semua mode; di luar rentang atau tanpa wajah tidak boleh. Jarak dibulatkan
 * 0,1 cm sebelum dibandingkan, sama dengan DistanceModel::classify().
 */
export function classifyDistance(distanceCm: number | null | undefined, faceDetected: boolean): DistanceClassification {
    if (!faceDetected) {
        return { distance_cm: null, category: 'INVALID', allow_verification: false, message: DISTANCE_MESSAGES.NO_FACE };
    }
    const cm = typeof distanceCm === 'number' && Number.isFinite(distanceCm) ? round1(distanceCm) : null;
    if (cm === null) {
        return { distance_cm: null, category: 'INVALID', allow_verification: false, message: DISTANCE_MESSAGES.NOT_MEASURED };
    }
    const band = DISTANCE_BANDS.find((b) => cm >= b.min_cm && cm <= b.max_cm);
    if (band) {
        return { distance_cm: cm, category: band.category, allow_verification: true, message: DISTANCE_MESSAGES[band.category] };
    }
    return { distance_cm: cm, category: 'INVALID', allow_verification: false, message: guidanceOutsideBands(cm) };
}

export function categoryLabel(category: string | null | undefined): string | null {
    const band = DISTANCE_BANDS.find((b) => b.category === category);
    if (band) {
        return `${band.label} (${bandRange(band)})`;
    }
    return category === 'INVALID' ? 'Di luar rentang' : null;
}

export interface DistanceGateInput {
    calibrated: boolean;
    distanceCm: number | null | undefined;
    faceDetected: boolean;
}

export interface DistanceGateDecision {
    blocked: boolean;
    classification: DistanceClassification;
    /** Pesan arahan saat posisi di luar rentang, juga bila tidak memblokir. */
    guidance: string | null;
}

/**
 * Pra-cek D2: hitung mundur 8 s hanya boleh mulai bila posisi sah. Sebelum ada
 * kalibrasi, estimasi kamera terlalu kasar untuk menolak orang, jadi arahan
 * tetap ditampilkan tanpa memblokir presensi.
 */
export function distancePrecheck({ calibrated, distanceCm, faceDetected }: DistanceGateInput): DistanceGateDecision {
    const classification = classifyDistance(distanceCm, faceDetected);
    return {
        blocked: calibrated && !classification.allow_verification,
        classification,
        guidance: classification.allow_verification ? null : classification.message,
    };
}

export interface CalibrationPointDto {
    target_cm: number;
    browser_ratio: number | null;
    engine_ratio: number | null;
}

export interface ActiveCalibration {
    id: number;
    camera_label: string | null;
    resolution_w: number | null;
    resolution_h: number | null;
    browser: InverseModel;
    engine: InverseModel | null;
    points: CalibrationPointDto[];
    created_at: string | null;
}

function numberOrNull(value: unknown): number | null {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function parseModel(raw: unknown): InverseModel | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const r = raw as Record<string, unknown>;
    const model = { a: numberOrNull(r.a), b: numberOrNull(r.b), max_residual_cm: numberOrNull(r.max_residual_cm) };
    if (model.a === null || model.b === null) {
        return null;
    }
    const parsed: InverseModel = { a: model.a, b: model.b, max_residual_cm: model.max_residual_cm };
    return isUsableModel(parsed) ? parsed : null;
}

/** Objek kalibrasi dari server, atau null bila bentuknya tidak bisa dipakai. */
export function parseCalibration(raw: unknown): ActiveCalibration | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const c = raw as Record<string, unknown>;
    const id = numberOrNull(c.id);
    const browser = parseModel(c.browser);
    if (id === null || browser === null) {
        return null;
    }
    const points = Array.isArray(c.points)
        ? c.points
              .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
              .map((p) => ({
                  target_cm: numberOrNull(p.target_cm) ?? Number.NaN,
                  browser_ratio: numberOrNull(p.browser_ratio),
                  engine_ratio: numberOrNull(p.engine_ratio),
              }))
              .filter((p) => Number.isFinite(p.target_cm))
        : [];
    return {
        id,
        camera_label: typeof c.camera_label === 'string' && c.camera_label.trim() !== '' ? c.camera_label : null,
        resolution_w: numberOrNull(c.resolution_w),
        resolution_h: numberOrNull(c.resolution_h),
        browser,
        engine: parseModel(c.engine),
        points,
        created_at: typeof c.created_at === 'string' ? c.created_at : null,
    };
}

/** Respons GET /api/biometric/calibration/current. */
export function parseCurrentCalibration(data: unknown): ActiveCalibration | null {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const d = data as Record<string, unknown>;
    return d.calibrated === true ? parseCalibration(d.calibration) : null;
}

export interface CameraInfo {
    label: string | null;
    deviceId: string | null;
    width: number | null;
    height: number | null;
    fps: number | null;
}

type TrackLike = {
    label?: string;
    getSettings?: () => MediaTrackSettings;
};

function positiveOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Nilai asli dari track kamera; yang tidak dilaporkan browser tetap null. */
export function cameraInfoFromTrack(track: TrackLike | null | undefined): CameraInfo | null {
    if (!track) {
        return null;
    }
    let settings: MediaTrackSettings = {};
    try {
        settings = track.getSettings?.() ?? {};
    } catch {
        settings = {};
    }
    const label = typeof track.label === 'string' && track.label.trim() !== '' ? track.label.trim() : null;
    const fps = positiveOrNull(settings.frameRate);
    return {
        label,
        deviceId: typeof settings.deviceId === 'string' && settings.deviceId !== '' ? settings.deviceId : null,
        width: positiveOrNull(settings.width),
        height: positiveOrNull(settings.height),
        fps: fps === null ? null : Math.round(fps * 100) / 100,
    };
}

export function formatResolution(info: Pick<CameraInfo, 'width' | 'height'> | null | undefined): string | null {
    return info && info.width && info.height ? `${info.width}x${info.height}` : null;
}

export function formatFps(fps: number | null | undefined): string | null {
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
        return null;
    }
    return `${Number.isInteger(fps) ? fps : fps.toFixed(1)} fps`;
}

// Sama dengan strcasecmp(trim(...)) di PresensiController::recordedDistance().
function normalizeLabel(label: string): string {
    return label.trim().toLowerCase();
}

export interface CalibrationMatch {
    applies: boolean;
    reason: string | null;
}

/**
 * Model hanya berlaku untuk kamera dan rasio aspek tempat ia diukur: kamera
 * lain punya sudut pandang lain, dan aspek berbeda memotong sisi frame sehingga
 * rasio lebar wajah bergeser. Label yang tidak dilaporkan browser tidak bisa
 * dibandingkan dan dianggap cocok.
 */
export function calibrationAppliesTo(
    calibration: ActiveCalibration | null | undefined,
    camera: CameraInfo | null | undefined,
): CalibrationMatch {
    if (!calibration) {
        return { applies: false, reason: 'Belum ada kalibrasi aktif' };
    }
    if (!camera) {
        return { applies: false, reason: 'Kamera belum aktif' };
    }
    if (calibration.camera_label && camera.label && normalizeLabel(calibration.camera_label) !== normalizeLabel(camera.label)) {
        return { applies: false, reason: `Kalibrasi aktif dibuat untuk kamera ${calibration.camera_label}` };
    }
    if (calibration.resolution_w && calibration.resolution_h && camera.width && camera.height) {
        // Toleransi 2 % seperti DistanceModel::sameAspect().
        const calibrated = calibration.resolution_w / calibration.resolution_h;
        const current = camera.width / camera.height;
        if (Math.abs(current - calibrated) / calibrated > 0.02) {
            return {
                applies: false,
                reason: `Kalibrasi aktif dibuat pada ${calibration.resolution_w}x${calibration.resolution_h}, kamera sekarang ${camera.width}x${camera.height}`,
            };
        }
    }
    return { applies: true, reason: null };
}

/** Field kamera untuk POST presensi; nilai yang tidak diketahui tidak dikirim. */
export function cameraFormFields(camera: CameraInfo | null | undefined, calibrationId: number | null | undefined): Array<[string, string]> {
    const fields: Array<[string, string]> = [];
    if (camera?.label) {
        fields.push(['camera_label', camera.label]);
    }
    const resolution = formatResolution(camera);
    if (resolution) {
        fields.push(['camera_resolution', resolution]);
    }
    if (camera?.fps) {
        fields.push(['camera_fps', String(camera.fps)]);
    }
    if (typeof calibrationId === 'number' && Number.isFinite(calibrationId)) {
        fields.push(['calibration_id', String(calibrationId)]);
    }
    return fields;
}

export const UNCALIBRATED_NOTE = 'estimasi, belum dikalibrasi';

export function distanceSourceLabel(source: string | null | undefined): string | null {
    switch (source) {
        case 'engine':
            return 'Engine, dari video (terkalibrasi)';
        case 'camera_calibrated':
            return 'Kamera terkalibrasi';
        case 'camera':
            return `Kamera (${UNCALIBRATED_NOTE})`;
        case 'sensor':
            return 'Sensor jarak';
        case null:
        case undefined:
        case '':
            return null;
        default:
            return source;
    }
}

const ENGINE_NOTES: Record<string, string> = {
    engine_no_face_width: 'engine tidak mengukur lebar wajah pada video',
    calibration_table_missing: 'tabel kalibrasi belum dimigrasi',
    no_calibration: 'belum ada kalibrasi aktif',
    calibration_without_engine_model: 'kalibrasi aktif tanpa model engine',
    camera_label_mismatch: 'kalibrasi aktif untuk kamera lain',
    aspect_mismatch: 'aspek video berbeda dari kalibrasi',
};

/** Alasan jarak engine kosong (engine_distance_note di metadata presensi). */
export function engineDistanceNoteLabel(note: unknown): string | null {
    if (typeof note !== 'string' || note === '') {
        return null;
    }
    return ENGINE_NOTES[note] ?? note;
}

export interface RecordedDistance {
    distanceCm: number | null;
    category: string | null;
    source: string | null;
}

/**
 * Jarak tercatat pada metadata presensi. Catatan lama tanpa distance_category
 * diberi kategori dari distance_cm yang tersimpan; tanpa jarak tidak ada kategori.
 */
export function recordedDistance(meta: Record<string, unknown> | null | undefined): RecordedDistance {
    const distanceCm = numberOrNull(meta?.distance_cm);
    const stored = typeof meta?.distance_category === 'string' ? meta.distance_category : null;
    const category = distanceCm === null ? null : categoryLabel(stored) ?? categoryLabel(classifyDistance(distanceCm, true).category);
    const source = distanceSourceLabel(typeof meta?.distance_source === 'string' ? meta.distance_source : null);
    return { distanceCm, category, source };
}

/**
 * Satu bingkai kamera sebagai JPEG ukuran asli, tanpa cermin: engine mengukur
 * lebar rahang pada gambar kamera apa adanya.
 */
export function captureVideoJpeg(video: HTMLVideoElement, quality = 0.9): Promise<Blob | null> {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return Promise.resolve(null);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}
