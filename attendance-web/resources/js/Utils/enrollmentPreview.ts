import { formatDecimalId, toFiniteNumber } from './faceMatchDisplay';

// Sama dengan validasi ManualEnrollmentController (files min:3|max:5); mesin juga
// menolak pratinjau bila wajah terdeteksi pada kurang dari 3 foto.
export const MIN_ENROLL_SAMPLES = 3;
export const MAX_ENROLL_SAMPLES = 5;

export function canTakeSample(count: number): boolean {
    return count < MAX_ENROLL_SAMPLES;
}

export function canRequestPreview(count: number, isSubmitting: boolean): boolean {
    return !isSubmitting && count >= MIN_ENROLL_SAMPLES && count <= MAX_ENROLL_SAMPLES;
}

export function sampleHint(count: number): string {
    if (count < MIN_ENROLL_SAMPLES) {
        const missing = MIN_ENROLL_SAMPLES - count;
        return `Ambil ${missing} foto lagi (minimal ${MIN_ENROLL_SAMPLES}).`;
    }
    if (count < MAX_ENROLL_SAMPLES) {
        return `Cukup untuk diperiksa. Boleh tambah sampai ${MAX_ENROLL_SAMPLES} foto.`;
    }
    return `Batas ${MAX_ENROLL_SAMPLES} foto tercapai.`;
}

/** "3 dari 5 foto berisi wajah", atau null bila mesin tidak melaporkan angkanya. */
export function facesDetectedText(nFrames: unknown, nUploaded: unknown): string | null {
    const frames = toFiniteNumber(nFrames);
    const uploaded = toFiniteNumber(nUploaded);
    if (frames === null || uploaded === null) return null;
    return `${frames} dari ${uploaded} foto berisi wajah`;
}

/**
 * Jarak L2 template pratinjau ke template yang tersimpan. Hanya informasi,
 * bukan keputusan lolos/gagal. null berarti mesin tidak menemukan template
 * tersimpan yang bisa dibandingkan.
 */
export function distanceToCurrentText(distance: unknown): string {
    const d = toFiniteNumber(distance);
    return d === null ? 'Tidak ada template tersimpan untuk dibandingkan' : formatDecimalId(d, 3);
}

export interface EnrollmentErrorBody {
    message?: unknown;
    engine_message?: unknown;
    engine_error?: unknown;
    errors?: Record<string, unknown>;
}

/**
 * Pesan galat dari respons Laravel. Pesan mesin ikut ditampilkan bila berbeda
 * dari pesan utama, supaya operator melihat alasan aslinya.
 */
export function enrollmentErrorMessage(body: unknown, fallback: string): string {
    if (!body || typeof body !== 'object') return fallback;
    const b = body as EnrollmentErrorBody;

    if (b.errors && typeof b.errors === 'object') {
        const first = Object.values(b.errors)
            .map((v) => (Array.isArray(v) ? v[0] : v))
            .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
        if (first.length > 0) return first.join(' ');
    }

    const message = typeof b.message === 'string' && b.message.trim() !== '' ? b.message : null;
    const engine = typeof b.engine_message === 'string' && b.engine_message.trim() !== '' ? b.engine_message : null;

    if (message && engine && engine !== message) return `${message} (Mesin: ${engine})`;
    return message ?? engine ?? fallback;
}

/** Sama dengan resolve_id di mesin: "S07" dan "emb_S07" menunjuk subjek yang sama. */
export function sameEmbeddingId(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    const strip = (v: string) => (v.startsWith('emb_') ? v.slice(4) : v);
    return strip(a) === strip(b);
}

export interface ReenrollCandidate {
    final_decision?: unknown;
    id_pred?: unknown;
    pad_pred?: unknown;
    subject_id?: unknown;
}

/**
 * Tawarkan daftar ulang wajah hanya pada presensi pribadi pengguna itu sendiri,
 * saat kedipan/mulut lolos tetapi wajah tidak cocok dengan template tersimpan.
 * Di mode kiosk, NON_MATCH bisa berupa penolakan yang benar (uji penyerang).
 */
export function offerReenrollment(
    evaluation: ReenrollCandidate | null | undefined,
    mode: 'personal' | 'kiosk',
    userEmbeddingId: string | null | undefined,
): boolean {
    if (!evaluation || mode !== 'personal') return false;
    return (
        evaluation.final_decision !== 'ACCEPT' &&
        evaluation.id_pred === 'NON_MATCH' &&
        evaluation.pad_pred === 'BONA_FIDE' &&
        typeof evaluation.subject_id === 'string' &&
        sameEmbeddingId(evaluation.subject_id, userEmbeddingId)
    );
}
