/**
 * Pencahayaan terkalibrasi luxmeter (PRD Lux Lighting Control).
 *
 * Kembaran app/Services/LightingModel.php (kategori, pesan, estimasi) dan
 * measure_brightness() di facenet_emar_system.py (luma Rec.601 pada salinan
 * selebar 320 px). Kategori hanya dicatat dan ditampilkan; tidak pernah
 * menahan pemindaian atau mengubah keputusan.
 */

export const LUMA_SAMPLE_WIDTH = 320;
export const LUMA_SATURATED = 250;
export const LUMA_DARK = 5;

export type LightingCategory = 'LOW' | 'STANDARD' | 'OPTIMAL' | 'HIGH';
export type LightingStatus = 'WARNING' | 'VALID' | 'READY' | 'MONITOR';

export interface LightingClassification {
    lux: number | null;
    category: LightingCategory | null;
    status: LightingStatus | null;
    message: string;
    kategoriNaskah: 'redup' | 'normal' | 'terang' | null;
}

/** Urutan PRD bagian 8: LOW, OPTIMAL (200-300 inklusif), STANDARD, selain itu HIGH. */
export function classifyLighting(lux: number | null | undefined): LightingClassification {
    if (lux === null || lux === undefined || !Number.isFinite(lux) || lux < 0) {
        return { lux: null, category: null, status: null, message: 'Pencahayaan belum terukur', kategoriNaskah: null };
    }
    const v = Math.round(lux * 10) / 10;
    let category: LightingCategory;
    let status: LightingStatus;
    let message: string;
    if (v < 100) {
        [category, status, message] = ['LOW', 'WARNING', 'Pencahayaan terlalu rendah'];
    } else if (v >= 200 && v <= 300) {
        [category, status, message] = ['OPTIMAL', 'READY', 'Pencahayaan optimal'];
    } else if (v >= 100 && v < 200) {
        [category, status, message] = ['STANDARD', 'VALID', 'Pencahayaan cukup'];
    } else {
        [category, status, message] = ['HIGH', 'MONITOR', 'Pencahayaan tinggi, pantau silau'];
    }
    return { lux: v, category, status, message, kategoriNaskah: v < 100 ? 'redup' : v <= 300 ? 'normal' : 'terang' };
}

export interface LuxModel {
    a: number;
    b: number;
}

/** lux = 10^(a + b * log10(luma / 255)), dibulatkan 0,1; null bila tidak dapat dihitung. */
export function estimateLux(luma: number | null | undefined, model: LuxModel | null | undefined): number | null {
    if (luma === null || luma === undefined || !model || !Number.isFinite(luma) || luma <= 0) return null;
    const lux = 10 ** (model.a + model.b * Math.log10(luma / 255));
    return Number.isFinite(lux) ? Math.round(lux * 10) / 10 : null;
}

export interface LumaStats {
    mean: number;
    saturated: number;
    dark: number;
}

/** Luma Rec.601 dari data RGBA (sudah diperkecil ke lebar 320 px). */
export function lumaStats(data: Uint8ClampedArray | number[]): LumaStats {
    let sum = 0;
    let sat = 0;
    let dark = 0;
    const n = Math.floor(data.length / 4);
    for (let i = 0; i < n; i++) {
        const y = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        sum += y;
        if (y >= LUMA_SATURATED) sat++;
        if (y <= LUMA_DARK) dark++;
    }
    return n === 0 ? { mean: 0, saturated: 0, dark: 0 } : { mean: sum / n, saturated: sat / n, dark: dark / n };
}

export function median(values: number[]): number | null {
    const v = values.filter(Number.isFinite).sort((x, y) => x - y);
    if (v.length === 0) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Gambar bingkai video ke kanvas selebar 320 px dan hitung lumanya. */
export function sampleVideoLuma(video: HTMLVideoElement, canvas: HTMLCanvasElement): LumaStats | null {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const cw = Math.min(LUMA_SAMPLE_WIDTH, w);
    const ch = Math.max(1, Math.round((h * cw) / w));
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);
    return lumaStats(ctx.getImageData(0, 0, cw, ch).data);
}

export function canvasJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

// ---- Eksposur -------------------------------------------------------------

type ExposureCapabilities = MediaTrackCapabilities & { exposureMode?: string[]; exposureTime?: { min: number; max: number } };
type ExposureSettings = MediaTrackSettings & { exposureMode?: string; exposureTime?: number };

/** true bila kamera mengizinkan eksposur manual lewat constraints browser. */
export function supportsExposureLock(track: MediaStreamTrack | null | undefined): boolean {
    if (!track || typeof track.getCapabilities !== 'function') return false;
    const caps = track.getCapabilities() as ExposureCapabilities;
    return Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual') && !!caps.exposureTime;
}

export function currentExposureTime(track: MediaStreamTrack | null | undefined): number | null {
    if (!track || typeof track.getSettings !== 'function') return null;
    const t = (track.getSettings() as ExposureSettings).exposureTime;
    return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

/** Kunci eksposur pada nilai tertentu. false bila kamera menolak. */
export async function lockExposure(track: MediaStreamTrack, exposureTime: number): Promise<boolean> {
    try {
        await track.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime } as MediaTrackConstraintSet] });
        return true;
    } catch {
        return false;
    }
}

export async function unlockExposure(track: MediaStreamTrack): Promise<void> {
    try {
        await track.applyConstraints({ advanced: [{ exposureMode: 'continuous' } as MediaTrackConstraintSet] });
    } catch {
        // Kamera tanpa kontrol eksposur memang selalu otomatis.
    }
}

// ---- Kontrak server -------------------------------------------------------

export interface LuxCalibrationContract {
    id: number;
    camera_label: string | null;
    resolution_w: number;
    resolution_h: number;
    exposure_locked: boolean;
    exposure_time: number | null;
    browser: { a: number; b: number; max_rel_error: number };
    engine: { a: number; b: number; max_rel_error: number } | null;
    points: Array<{ lux: number; browser_luma: number | null; engine_luma: number | null }>;
    reference_device?: ReferenceDevice | null;
    created_at: string | null;
}

/** Alat acuan pembacaan lux saat kalibrasi. */
export type ReferenceDevice = 'luxmeter' | 'luxmeter_app';

export const REFERENCE_DEVICE_LABEL: Record<ReferenceDevice, string> = {
    luxmeter: 'Luxmeter fisik',
    luxmeter_app: 'Aplikasi luxmeter HP',
};

export interface LuxCalibrationDraftPoint {
    lux: number;
    browser_luma: number | null;
    engine_luma: number | null;
    engine_error: string | null;
}

export interface LuxCalibrationDraft {
    camera_label: string | null;
    exposure_locked: boolean | null;
    reference_device?: ReferenceDevice | null;
    points: LuxCalibrationDraftPoint[];
}

/** Batas dan draf kalibrasi dari server (LuxCalibrationDraft::setupProps). */
export interface LuxCalibrationSetup {
    migration_pending: boolean;
    bands: Array<{ category: string; status: string; label: string }>;
    max_rel_error: number;
    min_points: number;
    max_points: number;
    draft: LuxCalibrationDraft;
}

export interface LuxProbeResult {
    lux: number | null;
    luma: number | null;
    exposureLocked: boolean;
    frames: Blob[];
    calibrationId: number | null;
    measuredAt: number;
    /** Alasan lux tidak dihitung di browser (mis. eksposur tidak dapat dikunci). */
    note: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sampel cahaya pra-pemindaian (~1 detik): kunci eksposur sesuai kalibrasi,
 * ambil luma beberapa bingkai dan 3 JPEG untuk diukur ulang mesin, lalu
 * kembalikan eksposur otomatis sebelum perekaman 8 detik dimulai.
 */
export async function runLuxProbe(
    video: HTMLVideoElement,
    track: MediaStreamTrack | null,
    calibration: LuxCalibrationContract,
    now: () => number = () => Date.now(),
): Promise<LuxProbeResult> {
    const canvas = document.createElement('canvas');
    let locked = false;
    if (calibration.exposure_locked && track && calibration.exposure_time) {
        locked = await lockExposure(track, calibration.exposure_time);
        await sleep(300);
    }
    const lumas: number[] = [];
    const frames: Blob[] = [];
    try {
        for (let i = 0; i < 12; i++) {
            const stats = sampleVideoLuma(video, canvas);
            if (stats) {
                lumas.push(stats.mean);
                if (i % 4 === 0) {
                    const blob = await canvasJpeg(canvas);
                    if (blob) frames.push(blob);
                }
            }
            await sleep(40);
        }
    } finally {
        if (locked && track) await unlockExposure(track);
    }

    const luma = median(lumas);
    let note: string | null = null;
    let lux: number | null = null;
    if (calibration.exposure_locked && !locked) {
        note = 'Eksposur kamera tidak dapat dikunci seperti saat kalibrasi';
    } else if (luma === null) {
        note = 'Bingkai kamera belum tersedia';
    } else if (luma <= LUMA_DARK || luma >= LUMA_SATURATED) {
        note = luma >= LUMA_SATURATED ? 'Gambar jenuh (terlalu terang)' : 'Gambar terlalu gelap';
    } else {
        lux = estimateLux(luma, calibration.browser);
    }
    return {
        lux,
        luma: luma === null ? null : Math.round(luma * 1000) / 1000,
        exposureLocked: locked,
        frames,
        calibrationId: calibration.id,
        measuredAt: now(),
        note,
    };
}

/** Umur maksimum sampel cahaya yang masih dikirim bersama presensi. */
export const LUX_PROBE_MAX_AGE_MS = 60_000;

/**
 * Bacaan panel luxometer yang dikirim bersama presensi. Perkiraan kamera tanpa
 * kalibrasi (sumber 'camera') tidak boleh menggeser lux dari sampel kamera
 * terkalibrasi; bacaan luxmeter tetap didahulukan.
 */
export function luxReadingForSubmit<T extends { source: string }>(
    reading: T | null,
    probe: LuxProbeResult | null,
    nowMs: number,
): T | null {
    const calibratedProbe = !!probe && probe.lux !== null && probe.calibrationId !== null
        && nowMs - probe.measuredAt <= LUX_PROBE_MAX_AGE_MS;
    return reading && reading.source === 'camera' && calibratedProbe ? null : reading;
}

/**
 * Field formulir presensi dari sampel cahaya. lux_value hanya diisi bila belum
 * ada bacaan lain (mis. luxmeter di panel Riset), karena luxmeter didahulukan.
 */
export function luxProbeFormFields(
    probe: LuxProbeResult | null,
    hasOtherLux: boolean,
    nowMs: number,
): Array<[string, string | Blob, string?]> {
    if (!probe || nowMs - probe.measuredAt > LUX_PROBE_MAX_AGE_MS) return [];
    const fields: Array<[string, string | Blob, string?]> = [
        ['lux_exposure_locked', probe.exposureLocked ? '1' : '0'],
    ];
    if (probe.luma !== null) fields.push(['lux_browser_luma', String(probe.luma)]);
    probe.frames.forEach((blob, i) => fields.push(['lux_probe_frames[]', blob, `lux_${i}.jpg`]));
    if (!hasOtherLux && probe.lux !== null && probe.calibrationId !== null) {
        fields.push(['lux_value', String(probe.lux)]);
        fields.push(['lux_source', 'camera_calibrated']);
        fields.push(['lux_calibration_id', String(probe.calibrationId)]);
    }
    return fields;
}
