/**
 * EAR dan MAR geometris dari 478 landmark MediaPipe Face Mesh.
 *
 * Rumus sama dengan Bab II naskah dan mesin Python (dlib 68 titik):
 *   EAR = (|p2 - p6| + |p3 - p5|) / (2 |p1 - p4|)
 *   MAR = (|A| + |B| + |C|) / (3 |D|), tiga pasang titik bibir dalam
 *
 * Sebelumnya browser memakai skor blendshape yang diskalakan
 * (MAR = jawOpen * 0,6). Skala itu berbeda dari MAR geometris, sehingga ambang
 * naskah 0,10 membuat bibir yang sedikit terbuka sudah dianggap "buka mulut".
 */

import type { Landmark3D } from '../Hooks/useFaceLandmarker';

/** Mata tertutup jika EAR < 0,20 (Tabel 5.2). */
export const EAR_BLINK_THRESHOLD = 0.2;
/** Mulut terbuka jika MAR >= 0,10 (Tabel 5.2). */
export const MAR_OPEN_THRESHOLD = 0.1;

// Urutan [p1 sudut, p2 atas, p3 atas, p4 sudut, p5 bawah, p6 bawah]
const EYE_A = [33, 160, 158, 133, 153, 144];
const EYE_B = [362, 385, 387, 263, 373, 380];
// Bibir dalam: [sudut kiri, atas1, atas2, atas3, sudut kanan, bawah3, bawah2, bawah1]
const INNER_MOUTH = [78, 81, 13, 311, 308, 402, 14, 178];

/**
 * Jarak dua landmark dalam piksel. Koordinat MediaPipe dinormalisasi terhadap
 * lebar dan tinggi video secara terpisah; tanpa dikalikan kembali, rasio pada
 * video 4:3 akan terdistorsi.
 */
function dist(a: Landmark3D, b: Landmark3D, width: number, height: number): number {
    return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

function eyeRatio(lms: Landmark3D[], idx: number[], w: number, h: number): number | null {
    const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lms[i]);
    const horizontal = dist(p1, p4, w, h);
    if (horizontal < 1e-6) return null;
    return (dist(p2, p6, w, h) + dist(p3, p5, w, h)) / (2 * horizontal);
}

/** Rata-rata EAR kedua mata, atau null bila landmark tidak lengkap. */
export function eyeAspectRatio(lms: Landmark3D[] | null, width: number, height: number): number | null {
    if (!lms || lms.length < 468 || width <= 0 || height <= 0) return null;
    const a = eyeRatio(lms, EYE_A, width, height);
    const b = eyeRatio(lms, EYE_B, width, height);
    if (a === null || b === null) return null;
    return (a + b) / 2;
}

/** MAR bibir dalam, atau null bila landmark tidak lengkap. */
export function mouthAspectRatio(lms: Landmark3D[] | null, width: number, height: number): number | null {
    if (!lms || lms.length < 468 || width <= 0 || height <= 0) return null;
    const [c1, u1, u2, u3, c2, l3, l2, l1] = INNER_MOUTH.map((i) => lms[i]);
    const horizontal = dist(c1, c2, width, height);
    if (horizontal < 1e-6) return null;
    return (dist(u1, l1, width, height) + dist(u2, l2, width, height) + dist(u3, l3, width, height)) / (3 * horizontal);
}

/**
 * Penghitung siklus transisi penuh: tidak-aktif -> aktif -> tidak-aktif.
 * Citra statis (mata tertutup atau mulut terbuka terus) tidak pernah
 * menghasilkan siklus, sama seperti count_full_cycles di mesin Python.
 */
export class CycleCounter {
    count = 0;
    private active = false;
    private seenInactive = false;

    /** Mengembalikan true pada saat satu siklus selesai. */
    update(isActive: boolean): boolean {
        if (isActive) {
            if (this.seenInactive) this.active = true;
            return false;
        }
        this.seenInactive = true;
        if (this.active) {
            this.active = false;
            this.count++;
            return true;
        }
        return false;
    }

    reset(): void {
        this.count = 0;
        this.active = false;
        this.seenInactive = false;
    }
}

export type ChallengeType = 'BLINK' | 'OPEN_MOUTH';
export type ChallengeStatus = 'WAITING_FOR_ACTION' | 'PASS_LIVENESS' | 'REJECT_WRONG_ACTION' | 'REJECT_TIMEOUT';

/** Batas waktu respons tantangan (detik). */
export const CHALLENGE_TIMEOUT_S = 4.0;
/**
 * Mulut harus terbuka terus selama ini sebelum dianggap aksi salah pada
 * tantangan BLINK. Satu frame bibir terbuka bukan aksi yang disengaja.
 */
export const WRONG_ACTION_HOLD_S = 0.6;

/**
 * Penilai tantangan acak. Lolos bila aksi yang diminta terjadi sebagai
 * transisi setelah tantangan muncul: mata terbuka lalu tertutup (BLINK), atau
 * mulut tertutup lalu terbuka (OPEN_MOUTH). Foto statis tidak pernah lolos.
 *
 * Kedipan saat diminta membuka mulut tidak dihitung sebagai aksi salah:
 * kedip adalah refleks yang tidak bisa ditahan beberapa detik.
 */
export class ChallengeTracker {
    status: ChallengeStatus = 'WAITING_FOR_ACTION';
    private seenEyesOpen = false;
    private seenMouthClosed = false;
    private mouthOpenSince: number | null = null;

    constructor(
        readonly challenge: ChallengeType,
        private readonly startedAtS: number,
    ) {}

    /** Perbarui dengan EAR/MAR geometris pada waktu nowS (detik). */
    update(ear: number | null, mar: number | null, nowS: number): ChallengeStatus {
        if (this.status !== 'WAITING_FOR_ACTION') return this.status;

        if (nowS - this.startedAtS > CHALLENGE_TIMEOUT_S) {
            this.status = 'REJECT_TIMEOUT';
            return this.status;
        }
        if (ear === null || mar === null) return this.status;

        const eyesClosed = ear < EAR_BLINK_THRESHOLD;
        const mouthOpen = mar >= MAR_OPEN_THRESHOLD;

        if (this.challenge === 'BLINK') {
            if (!eyesClosed) this.seenEyesOpen = true;
            else if (this.seenEyesOpen) {
                this.status = 'PASS_LIVENESS';
                return this.status;
            }

            if (mouthOpen) {
                this.mouthOpenSince ??= nowS;
                if (nowS - this.mouthOpenSince >= WRONG_ACTION_HOLD_S) {
                    this.status = 'REJECT_WRONG_ACTION';
                }
            } else {
                this.mouthOpenSince = null;
            }
        } else {
            if (!mouthOpen) this.seenMouthClosed = true;
            else if (this.seenMouthClosed) this.status = 'PASS_LIVENESS';
        }
        return this.status;
    }
}
