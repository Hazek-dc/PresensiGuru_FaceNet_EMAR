import type { ChallengeStatus, ChallengeType } from './emarGeometry';

/**
 * Panduan liveness di pemindai setelah keputusan D2: liveness diputuskan dlib di
 * mesin dan butuh siklus kedip DAN siklus mulut dalam rekaman 8,0 s. Browser
 * meminta keduanya berurutan (urutan acak). Hasil ChallengeTracker per langkah
 * hanya telemetri, tidak ikut keputusan.
 */
export function challengeOrder(random: number): [ChallengeType, ChallengeType] {
    return random < 0.5 ? ['BLINK', 'OPEN_MOUTH'] : ['OPEN_MOUTH', 'BLINK'];
}

/** Label urutan yang dikirim sebagai active_challenge, mis. "BLINK>OPEN_MOUTH". */
export function challengeLabel(order: readonly ChallengeType[]): string {
    return order.join('>');
}

/**
 * Status gabungan untuk telemetri: PASS_LIVENESS bila semua langkah lolos, selain
 * itu status gagal pertama. Langkah yang belum selesai saat rekaman berhenti
 * dihitung REJECT_TIMEOUT.
 */
export function combineChallengeStatuses(
    results: readonly ChallengeStatus[],
    steps: number,
): ChallengeStatus {
    const done = results.filter((s) => s !== 'WAITING_FOR_ACTION');
    const all = [
        ...done,
        ...Array<ChallengeStatus>(Math.max(0, steps - done.length)).fill(
            'REJECT_TIMEOUT',
        ),
    ];
    return all.find((s) => s !== 'PASS_LIVENESS') ?? 'PASS_LIVENESS';
}

/**
 * Persentase frame berwajah dari semua frame yang diproses selama rekaman (D10).
 * Tanpa frame yang diproses hasilnya null, bukan 100.
 */
export function faceDetectedPercent(
    detected: number,
    total: number,
): number | null {
    if (total <= 0) return null;
    return Math.round((Math.min(detected, total) / total) * 1000) / 10;
}
