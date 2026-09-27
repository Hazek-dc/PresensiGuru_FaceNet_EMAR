/**
 * Evaluator Liveness EMAR & FaceNet Sesuai Metodologi Bab 3 Skripsi
 * Lokasi Penelitian: SMK Al-Madani Pontianak (18 Subjek, Jarak 30 cm)
 * Skenario S2: Rule-Based Gate (WAJIB Konjungtif: Kedipan >= 1x && Mulut >= 1x)
 */

export interface PresensiEvaluationInput {
    claimedId: string;
    euclideanDistance: number;
    blinkCount: number;
    mouthOpenCount: number;
    faceStabilityPercent: number;
    sessionDurationSec?: number;
}

export interface PresensiEvaluationResult {
    claimedId: string;
    idPrediction: 'MATCH' | 'NON_MATCH';
    padPrediction: 'BONA_FIDE' | 'ATTACK';
    euclideanDistance: number;
    blinkCount: number;
    mouthOpenCount: number;
    faceStabilityPercent: number;
    sessionDurationSec: number;
    finalDecision: 'ACCEPT' | 'REJECT';
    statusMessage: string;
    isIdMatch: boolean;
    isBlinkValid: boolean;
    isMouthValid: boolean;
    isStabilityValid: boolean;
    isLivenessValid: boolean;
}

export function evaluatePresensiResult({
    claimedId,
    euclideanDistance,
    blinkCount,
    mouthOpenCount,
    faceStabilityPercent,
    sessionDurationSec = 8.0,
}: PresensiEvaluationInput): PresensiEvaluationResult {
    // 1. Ambang Batas Metodologi Skripsi
    const THRESHOLD_DISTANCE = 0.40; // L2 Distance <= 0.40
    const MIN_BLINK = 1;             // Kedipan EAR >= 1x
    const MIN_MOUTH = 1;             // Gerakan Mulut MAR >= 1x
    const MIN_STABILITY = 80.0;      // Kestabilan Wajah >= 80.0%

    // 2. Evaluasi Komponen Mandiri
    const isIdMatch = euclideanDistance <= THRESHOLD_DISTANCE;
    const isBlinkValid = blinkCount >= MIN_BLINK;
    const isMouthValid = mouthOpenCount >= MIN_MOUTH;
    const isStabilityValid = faceStabilityPercent >= MIN_STABILITY;

    // 3. Evaluasi Liveness EMAR (Skenario S2: Rule-Based Gate)
    // WAJIB: Kedua sinyal biologis aktif untuk menangkal Cut-Out Photo Attack
    const isLivenessValid = isBlinkValid && isMouthValid;

    // 4. Klasifikasi PAD & Prediksi Identitas
    const padPrediction: 'BONA_FIDE' | 'ATTACK' = isLivenessValid ? 'BONA_FIDE' : 'ATTACK';
    const idPrediction: 'MATCH' | 'NON_MATCH' = isIdMatch ? 'MATCH' : 'NON_MATCH';

    // 5. Keputusan Terminal (ACCEPT / REJECT)
    let finalDecision: 'ACCEPT' | 'REJECT' = 'REJECT';
    let statusMessage = '';

    if (isIdMatch && isLivenessValid && isStabilityValid) {
        finalDecision = 'ACCEPT';
        statusMessage = 'Verifikasi Wajah & Liveness EMAR 8 Detik Berhasil Memenuhi Standar';
    } else {
        finalDecision = 'REJECT';
        if (!isLivenessValid && !isIdMatch) {
            statusMessage = 'Gagal: Identitas Wajah Tidak Cocok dan Liveness EMAR Tidak Terpenuhi';
        } else if (!isLivenessValid) {
            if (!isBlinkValid && !isMouthValid) {
                statusMessage = 'Gagal Liveness: Tidak Terdeteksi Kedipan dan Gerakan Mulut (Foto Statis)';
            } else if (!isMouthValid) {
                statusMessage = 'Gagal Liveness: Gerakan Mulut 0x (Terindikasi Cut-Out/Lubang Foto)';
            } else {
                statusMessage = 'Gagal Liveness: Kedipan Mata 0x';
            }
        } else if (!isIdMatch) {
            statusMessage = `Gagal Identifikasi: Jarak Euclidean (${euclideanDistance.toFixed(2)}) Melebihi Batas`;
        } else {
            statusMessage = 'Gagal: Posisi Wajah Kurang Stabil (<80%)';
        }
    }

    return {
        claimedId,
        idPrediction,
        padPrediction,
        euclideanDistance,
        blinkCount,
        mouthOpenCount,
        faceStabilityPercent,
        sessionDurationSec,
        finalDecision,
        statusMessage,
        isIdMatch,
        isBlinkValid,
        isMouthValid,
        isStabilityValid,
        isLivenessValid,
    };
}
