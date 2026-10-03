/**
 * Asal-usul bacaan lux dan jarak yang dikirim bersama presensi.
 *
 * Nilai hanya dikirim sebagai hasil ukur bila berasal dari sumber langsung:
 * luxmeter/sensor jarak lewat /api/lux|distance/current dengan bacaan paling
 * lama SENSOR_MAX_AGE_S (aturan read_sidecar di capture_session.py), atau
 * estimasi kamera di browser. Preset, angka dari query string, dan bacaan basi
 * tidak pernah menjadi lux_value/distance_cm.
 */

export const SENSOR_MAX_AGE_S = 10;
export const NOT_MEASURED_LABEL = 'Tidak terukur';

export type LuxSource = 'luxmeter' | 'camera';
// camera_calibrated: estimasi browser lewat model kalibrasi jarak (distanceCalibration.ts).
export type CameraDistanceSource = 'camera' | 'camera_calibrated';
export type DistanceSource = 'sensor' | CameraDistanceSource;
export type SensorSource = LuxSource | DistanceSource;

export interface SensorReading<S extends SensorSource = SensorSource> {
    value: number;
    source: S;
    /** Date.now() saat bacaan diterima browser. */
    measuredAt: number;
    /** Hanya untuk lux sumber 'camera': cara perkiraannya dibuat (metode, profil). */
    estimate?: {
        method: string;
        profile: string;
        factor: number;
        offset: number;
        glare_compensated: boolean;
        face_targeted: boolean;
    };
}

/** Bentuk respons GET /api/lux/current dan /api/distance/current. */
export interface CurrentReadingResponse {
    success?: boolean;
    lux?: number | null;
    distance_cm?: number | null;
    source?: string | null;
    device?: string | null;
    seconds_ago?: number | null;
    is_stale?: boolean | null;
    is_measured?: boolean;
    not_measured_reason?: string | null;
    max_age_s?: number | null;
}

export type HardwareRejectReason =
    | 'no_reading'
    | 'stale'
    | 'not_a_measurement'
    | 'sensor_no_data'
    | 'invalid'
    | 'unreachable';

export type HardwareVerdict =
    | { accepted: true; value: number; secondsAgo: number }
    | { accepted: false; reason: HardwareRejectReason };

// Sama dengan penyaring sumber di read_sidecar(): preset dari web/CLI,
// penyetelan +/- (tune), nilai bawaan, dan fallback saat sensor gagal.
const NON_MEASUREMENT_SOURCE = /preset|tune|default|fallback/i;

const SERVER_REASONS: HardwareRejectReason[] = ['no_reading', 'stale', 'not_a_measurement', 'sensor_no_data'];

/**
 * Terima bacaan hardware hanya bila server menandainya is_measured dan umurnya
 * masih dalam batas. Respons server lama (tanpa is_measured) selalu ditolak.
 */
export function evaluateHardwareReading(
    data: CurrentReadingResponse | null | undefined,
    valueKey: 'lux' | 'distance_cm',
): HardwareVerdict {
    if (!data || data.success !== true) {
        return { accepted: false, reason: 'invalid' };
    }

    const raw = data[valueKey];
    if (raw === null || raw === undefined) {
        return { accepted: false, reason: 'no_reading' };
    }
    if (typeof data.source === 'string' && NON_MEASUREMENT_SOURCE.test(data.source)) {
        return { accepted: false, reason: 'not_a_measurement' };
    }
    if (data.is_measured !== true) {
        const reason = SERVER_REASONS.find((r) => r === data.not_measured_reason);
        return { accepted: false, reason: reason ?? 'stale' };
    }

    const maxAge = typeof data.max_age_s === 'number' ? data.max_age_s : SENSOR_MAX_AGE_S;
    if (data.is_stale === true || typeof data.seconds_ago !== 'number' || data.seconds_ago > maxAge) {
        return { accepted: false, reason: 'stale' };
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
        return { accepted: false, reason: 'invalid' };
    }

    return { accepted: true, value, secondsAgo: data.seconds_ago };
}

export function hardwareRejectMessage(reason: HardwareRejectReason): string {
    switch (reason) {
        case 'no_reading':
            return 'Tidak ada bacaan aktif. Skrip pengukur belum mengirim data.';
        case 'stale':
            return `Tidak ada bacaan aktif. Bacaan terakhir lebih dari ${SENSOR_MAX_AGE_S} detik lalu.`;
        case 'not_a_measurement':
            return 'Tidak ada bacaan aktif. Data terakhir berupa preset, bukan hasil ukur.';
        case 'sensor_no_data':
            return 'Tidak ada bacaan aktif. Sensor tidak mengirim angka.';
        case 'unreachable':
            return 'Tidak ada bacaan aktif. Server tidak dapat dihubungi.';
        default:
            return 'Tidak ada bacaan aktif. Respons server tidak valid.';
    }
}

/**
 * Bacaan yang masih segar pada nowMs, atau null. Bacaan yang lebih baru dari
 * nowMs (jam tampilan tertinggal sampai 1 s) tetap dianggap segar.
 */
export function freshReading<S extends SensorSource>(
    reading: SensorReading<S> | null | undefined,
    nowMs: number,
    maxAgeS: number = SENSOR_MAX_AGE_S,
): SensorReading<S> | null {
    if (!reading || !Number.isFinite(reading.value)) {
        return null;
    }
    return nowMs - reading.measuredAt <= maxAgeS * 1000 ? reading : null;
}

/**
 * Angka target skenario dari query string (?lux=, ?distance_cm=). Hanya
 * dipakai sebagai target uji, tidak pernah sebagai hasil ukur.
 */
export function parseTargetParam(raw: string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw.trim() === '') {
        return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
}

export interface SensorSubmission {
    lux: SensorReading<LuxSource> | null;
    distance: SensorReading<DistanceSource> | null;
    luxTarget: number | null;
    distanceTarget: number | null;
    nowMs: number;
}

/**
 * Field form untuk POST /presensi/verify. lux_value/distance_cm hanya ikut bila
 * bacaannya segar, selalu berpasangan dengan sumbernya; target dikirim dengan
 * nama terpisah.
 */
export function sensorFormFields({ lux, distance, luxTarget, distanceTarget, nowMs }: SensorSubmission): Array<[string, string]> {
    const fields: Array<[string, string]> = [];
    const freshLux = freshReading(lux, nowMs);
    const freshDistance = freshReading(distance, nowMs);

    if (freshLux) {
        fields.push(['lux_value', String(Math.round(freshLux.value * 10) / 10)]);
        fields.push(['lux_source', freshLux.source]);
        if (freshLux.source === 'camera' && freshLux.estimate) {
            fields.push(['lux_estimate', JSON.stringify(freshLux.estimate)]);
        }
    }
    if (freshDistance) {
        fields.push(['distance_cm', String(Math.round(freshDistance.value * 10) / 10)]);
        fields.push(['distance_source', freshDistance.source]);
    }
    if (luxTarget !== null && Number.isFinite(luxTarget)) {
        fields.push(['lux_target', String(luxTarget)]);
    }
    if (distanceTarget !== null && Number.isFinite(distanceTarget)) {
        fields.push(['distance_target_cm', String(distanceTarget)]);
    }
    return fields;
}

export function formatMeasured(value: number | null | undefined, unit: string, digits = 0): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return NOT_MEASURED_LABEL;
    }
    return `${value.toFixed(digits)} ${unit}`;
}

/** Label sumber lux; perkiraan kamera tanpa kalibrasi selalu bertanda estimasi. */
export const LUX_ESTIMATE_LABEL = 'Perkiraan kamera (belum dikalibrasi)';

export function luxSourceLabel(source: string | null | undefined): string {
    return source === 'camera' ? LUX_ESTIMATE_LABEL : sourceLabel(source as SensorSource | null | undefined);
}

/** Lux untuk tampilan: perkiraan kamera diberi awalan "~", sama seperti chip pemindai. */
export function formatLux(value: number | null | undefined, source: string | null | undefined, digits = 0): string {
    const text = formatMeasured(value, 'Lux', digits);
    return source === 'camera' && text !== NOT_MEASURED_LABEL ? `~${text}` : text;
}

export function sourceLabel(source: SensorSource | null | undefined): string {
    switch (source) {
        case 'luxmeter':
            return 'Luxmeter';
        case 'sensor':
            return 'Sensor';
        case 'camera':
            return 'Kamera';
        case 'camera_calibrated':
            return 'Kamera terkalibrasi';
        default:
            return '';
    }
}
