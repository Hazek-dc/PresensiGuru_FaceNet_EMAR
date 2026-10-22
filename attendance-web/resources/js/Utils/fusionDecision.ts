/**
 * Tampilan keputusan Bab 5 (S1/S2/S3) di browser. Keputusan dibuat server
 * (app/Services/FusionDecision.php = FusionModule.decide_s1/s2/s3 di mesin):
 * D1 = rumus S3 (b), D2 = liveness dlib mesin. Rumus di sini hanya dipakai bila
 * catatan tidak membawa nilai server, dan tidak pernah mengisi EAR/MAR bawaan.
 *
 * Nilai FUSION wajib sama dengan parameter_penelitian.py dan config fusion
 * (dikunci tests/test_analisis_kalibrasi_dev.py::TestParitasWeb).
 */
export const FUSION = {
    version: 'D1b-D2dlib-2026-10-21',
    alpha: 0.6,
    dRef: 1.2,
    threshold: 0.5,
    livenessThreshold: 1.0,
    l2Threshold: 0.4,
} as const;

export interface Bab5Input {
    euclidean_distance?: number | null;
    s1_decision?: number | null;
    s2_decision?: number | null;
    s3_decision?: number | null;
    p_face?: number | null;
    p_live?: number | null;
    s_final?: number | null;
    liveness_valid?: boolean | null;
    landmark_frames?: number | null;
    decision_version?: string | null;
    /** Riwayat lama tanpa evaluation_bab5 yang dihitung ulang server untuk tampilan. */
    recomputed?: boolean | null;
    /** Ambang L2 aktif saat keputusan dibuat (bisa diubah admin). */
    l2_threshold?: number | null;
}

/**
 * current: keputusan tersimpan versi berjalan. recomputed: dihitung ulang dari
 * riwayat lama, bukan keputusan yang pernah dibuat. legacy: keputusan tersimpan
 * dengan definisi lama (rumus a, liveness browser), tidak sebanding.
 */
export type Bab5Version = 'current' | 'recomputed' | 'legacy';

export interface Bab5View {
    s1: 0 | 1 | null;
    s2: 0 | 1 | null;
    s3: 0 | 1 | null;
    pFace: number | null;
    pLive: number | null;
    sFinal: number | null;
    livenessValid: boolean | null;
    /** Liveness tidak terukur (tanpa landmark dlib atau P_live): S2/S3 = FTA. */
    livenessFta: boolean;
    l2Threshold: number;
    version: Bab5Version;
}

const bit = (v: number | null | undefined): 0 | 1 | null =>
    v == null ? null : v === 1 ? 1 : 0;

export function bab5View(data: Bab5Input | null | undefined): Bab5View {
    const d =
        typeof data?.euclidean_distance === 'number' &&
        Number.isFinite(data.euclidean_distance)
            ? data.euclidean_distance
            : null;
    const pLive = data?.p_live ?? null;
    const livenessFta = pLive === null || data?.landmark_frames === 0;
    // Urutan operasi sama dengan Python/PHP agar batas (mis. d = 0,20) identik.
    const pFace =
        data?.p_face ?? (d === null ? null : Math.max(0, 1 - d / FUSION.dRef));
    const sFinal =
        data?.s_final ??
        (pFace === null || livenessFta
            ? null
            : FUSION.alpha * pFace + (1 - FUSION.alpha) * (pLive as number));
    const l2Threshold =
        typeof data?.l2_threshold === 'number'
            ? data.l2_threshold
            : FUSION.l2Threshold;
    const version: Bab5Version = data?.recomputed
        ? 'recomputed'
        : data?.decision_version === FUSION.version
          ? 'current'
          : 'legacy';
    const verified = d === null ? null : d <= l2Threshold;
    const livenessValid =
        data?.liveness_valid ??
        (livenessFta ? null : (pLive as number) >= FUSION.livenessThreshold);

    const s1 =
        data?.s1_decision !== undefined
            ? bit(data.s1_decision)
            : verified === null
              ? null
              : verified
                ? 1
                : 0;
    const s2 =
        data?.s2_decision !== undefined
            ? bit(data.s2_decision)
            : verified === null || livenessFta
              ? null
              : verified && livenessValid
                ? 1
                : 0;
    const s3 =
        data?.s3_decision !== undefined
            ? bit(data.s3_decision)
            : verified === null || sFinal === null
              ? null
              : verified && sFinal >= FUSION.threshold
                ? 1
                : 0;

    return {
        s1,
        s2,
        s3,
        pFace,
        pLive,
        sFinal,
        livenessValid,
        livenessFta,
        l2Threshold,
        version,
    };
}
