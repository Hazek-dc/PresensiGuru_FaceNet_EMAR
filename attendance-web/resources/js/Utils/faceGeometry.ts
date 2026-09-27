/**
 * Normalized Face Geometry & Quality Gate Module
 * TAHAP 13.28 — Dynamic Anatomical Landmarks, Safe Zone, and State Guidance
 */

import { Landmark3D } from '../Hooks/useFaceLandmarker';

/* ------------------------------------------------------------------ */
/*  Central Configuration & Calibration Placeholders                  */
/* ------------------------------------------------------------------ */

export const GEOMETRY_CALIBRATION = {
    /** Minimum interocular ratio (interocular_dist / video_width) for quality crop (supports 30cm, 45cm, and 60cm benchmarks) */
    MIN_INTEROCULAR_RATIO: 0.055, // Calibrated for 30cm (~0.15), 45cm (~0.10), and 60cm (~0.075)
    /** Maximum interocular ratio to prevent extreme close-up chin clipping */
    MAX_INTEROCULAR_RATIO: 0.38,
    /** Target ideal interocular ratio range */
    IDEAL_INTEROCULAR_MIN: 0.065,
    IDEAL_INTEROCULAR_MAX: 0.3,

    /** Max normalized center offset from safe zone before prompting MOVE_LEFT/RIGHT */
    MAX_CENTER_OFFSET_X: 0.35, // TBD_CALIBRATION
    /** Max normalized center offset from safe zone before prompting MOVE_UP/DOWN */
    MAX_CENTER_OFFSET_Y: 0.35, // TBD_CALIBRATION

    /** Minimum margin from frame edges (0.0 to 0.5) to ensure non-clipped landmarks */
    FRAME_CLIP_MARGIN: 0.03, // TBD_CALIBRATION
} as const;

/* ------------------------------------------------------------------ */
/*  Key Anatomical Landmark Indices (MediaPipe 478)                   */
/*  Strictly excludes hair, ears, and back of head                     */
/* ------------------------------------------------------------------ */

export const ANATOMICAL_LANDMARKS = {
    // Eye landmarks
    LEFT_EYE_OUTER: 33,
    LEFT_EYE_INNER: 133,
    LEFT_EYE_TOP: 159,
    LEFT_EYE_BOTTOM: 145,
    RIGHT_EYE_INNER: 362,
    RIGHT_EYE_OUTER: 263,
    RIGHT_EYE_TOP: 386,
    RIGHT_EYE_BOTTOM: 374,

    // Nose
    NOSE_TIP: 1,
    NOSE_BRIDGE: 6,

    // Mouth
    MOUTH_LEFT: 61,
    MOUTH_RIGHT: 291,
    MOUTH_TOP: 0,
    MOUTH_BOTTOM: 17,

    // Jawline and Chin
    CHIN: 152,
    CHEEK_LEFT: 234,
    CHEEK_RIGHT: 454,
    FOREHEAD_CENTER: 10,
} as const;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type GuidanceState =
    | 'SEARCHING'
    | 'MULTIPLE_FACES'
    | 'FACE_CROPPED'
    | 'MOVE_CLOSER'
    | 'MOVE_BACK'
    | 'MOVE_LEFT'
    | 'MOVE_RIGHT'
    | 'MOVE_UP'
    | 'MOVE_DOWN'
    | 'ADJUST_POSE'
    | 'IMPROVE_LIGHTING'
    | 'HOLD_STILL'
    | 'READY';

export interface NormalizedFaceMetrics {
    /** Robust anatomical face bounding box (normalized 0..1) */
    boundingBox: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        width: number;
        height: number;
    };
    /** Face center in normalized coordinates */
    faceCenter: { x: number; y: number };
    /** Distance between left and right eye centers (normalized 0..1) */
    interocularDistance: number;
    /** Ratio of interocular distance to video width */
    interocularRatio: number;
    /** Ratio of anatomical face width to video width */
    faceWidthRatio: number;
    /** Ratio of anatomical face height to video height */
    faceHeightRatio: number;
    /** Center offset X relative to safe zone center (-1.0 to +1.0) */
    offsetX: number;
    /** Center offset Y relative to safe zone center (-1.0 to +1.0) */
    offsetY: number;
    /** Whether all key facial landmarks are safely inside frame boundary */
    areLandmarksVisible: boolean;
}

export interface QualityGateEvaluation {
    isReady: boolean;
    state: GuidanceState;
    message: string;
    metrics: NormalizedFaceMetrics | null;
}

/* ------------------------------------------------------------------ */
/*  Functions                                                          */
/* ------------------------------------------------------------------ */

/**
 * Calculates robust face geometry metrics strictly based on facial anatomical landmarks.
 */
export function computeFaceGeometry(
    landmarks: Landmark3D[] | null,
    safeZoneCenter: { x: number; y: number } = { x: 0.5, y: 0.45 },
    safeZoneRadius: { x: number; y: number } = { x: 0.25, y: 0.35 },
): NormalizedFaceMetrics | null {
    if (!landmarks || landmarks.length < 468) return null;

    const keyIndices = [
        ANATOMICAL_LANDMARKS.LEFT_EYE_OUTER,
        ANATOMICAL_LANDMARKS.LEFT_EYE_INNER,
        ANATOMICAL_LANDMARKS.RIGHT_EYE_INNER,
        ANATOMICAL_LANDMARKS.RIGHT_EYE_OUTER,
        ANATOMICAL_LANDMARKS.NOSE_TIP,
        ANATOMICAL_LANDMARKS.MOUTH_LEFT,
        ANATOMICAL_LANDMARKS.MOUTH_RIGHT,
        ANATOMICAL_LANDMARKS.CHIN,
        ANATOMICAL_LANDMARKS.CHEEK_LEFT,
        ANATOMICAL_LANDMARKS.CHEEK_RIGHT,
        ANATOMICAL_LANDMARKS.FOREHEAD_CENTER,
    ];

    let minX = Infinity,
        maxX = -Infinity;
    let minY = Infinity,
        maxY = -Infinity;
    let isClipped = false;

    const margin = GEOMETRY_CALIBRATION.FRAME_CLIP_MARGIN;

    for (const idx of keyIndices) {
        const lm = landmarks[idx];
        if (!lm) continue;

        if (lm.x < minX) minX = lm.x;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.y < minY) minY = lm.y;
        if (lm.y > maxY) maxY = lm.y;

        if (
            lm.x < margin ||
            lm.x > 1 - margin ||
            lm.y < margin ||
            lm.y > 1 - margin
        ) {
            isClipped = true;
        }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Eye centers
    const leftEyeX =
        (landmarks[ANATOMICAL_LANDMARKS.LEFT_EYE_OUTER].x +
            landmarks[ANATOMICAL_LANDMARKS.LEFT_EYE_INNER].x) /
        2;
    const leftEyeY =
        (landmarks[ANATOMICAL_LANDMARKS.LEFT_EYE_OUTER].y +
            landmarks[ANATOMICAL_LANDMARKS.LEFT_EYE_INNER].y) /
        2;
    const rightEyeX =
        (landmarks[ANATOMICAL_LANDMARKS.RIGHT_EYE_OUTER].x +
            landmarks[ANATOMICAL_LANDMARKS.RIGHT_EYE_INNER].x) /
        2;
    const rightEyeY =
        (landmarks[ANATOMICAL_LANDMARKS.RIGHT_EYE_OUTER].y +
            landmarks[ANATOMICAL_LANDMARKS.RIGHT_EYE_INNER].y) /
        2;

    const interocularDistance = Math.hypot(
        rightEyeX - leftEyeX,
        rightEyeY - leftEyeY,
    );

    const offsetX = (centerX - safeZoneCenter.x) / (safeZoneRadius.x || 0.25);
    const offsetY = (centerY - safeZoneCenter.y) / (safeZoneRadius.y || 0.35);

    return {
        boundingBox: { minX, maxX, minY, maxY, width, height },
        faceCenter: { x: centerX, y: centerY },
        interocularDistance,
        interocularRatio: interocularDistance, // Normalized to 1.0 frame width
        faceWidthRatio: width,
        faceHeightRatio: height,
        offsetX,
        offsetY,
        areLandmarksVisible: !isClipped,
    };
}

/**
 * Evaluates Quality Gate & prioritizes a single actionable guidance state.
 */
export function evaluateQualityGate(
    hasFace: boolean,
    faceCount: number,
    landmarks: Landmark3D[] | null,
    qualityScore: number,
    trackingConfidence: number,
): QualityGateEvaluation {
    if (!hasFace || !landmarks) {
        return {
            isReady: false,
            state: 'SEARCHING',
            message: 'Posisikan wajah Anda di depan kamera.',
            metrics: null,
        };
    }

    if (faceCount > 1) {
        return {
            isReady: false,
            state: 'MULTIPLE_FACES',
            message:
                'Terdeteksi lebih dari satu wajah. Pastikan hanya 1 orang di depan kamera.',
            metrics: null,
        };
    }

    const metrics = computeFaceGeometry(landmarks);
    if (!metrics) {
        return {
            isReady: false,
            state: 'SEARCHING',
            message: 'Mendeteksi fitur wajah...',
            metrics: null,
        };
    }

    // Prioritas 1: Landmark terpotong (clipped at frame boundary)
    if (!metrics.areLandmarksVisible) {
        return {
            isReady: false,
            state: 'FACE_CROPPED',
            message:
                'Wajah terpotong di tepi kamera. Mundur atau posisikan wajah di tengah.',
            metrics,
        };
    }

    // Prioritas 2: Terlalu jauh (interocular ratio terlalu kecil, > 75 cm)
    if (metrics.interocularRatio < GEOMETRY_CALIBRATION.MIN_INTEROCULAR_RATIO) {
        return {
            isReady: false,
            state: 'MOVE_CLOSER',
            message: 'Jarak terlalu jauh (> 75 cm). Maju sedikit ke kamera.',
            metrics,
        };
    }

    // Prioritas 3: Terlalu dekat (interocular ratio / height ratio terlalu besar)
    if (metrics.interocularRatio > GEOMETRY_CALIBRATION.MAX_INTEROCULAR_RATIO) {
        return {
            isReady: false,
            state: 'MOVE_BACK',
            message: 'Mundur sedikit agar wajah tidak terpotong.',
            metrics,
        };
    }

    // Prioritas 4: Posisi offset horizontal
    if (metrics.offsetX < -GEOMETRY_CALIBRATION.MAX_CENTER_OFFSET_X) {
        return {
            isReady: false,
            state: 'MOVE_RIGHT',
            message: 'Geser wajah sedikit ke kanan.',
            metrics,
        };
    }
    if (metrics.offsetX > GEOMETRY_CALIBRATION.MAX_CENTER_OFFSET_X) {
        return {
            isReady: false,
            state: 'MOVE_LEFT',
            message: 'Geser wajah sedikit ke kiri.',
            metrics,
        };
    }

    // Prioritas 5: Posisi offset vertikal
    if (metrics.offsetY < -GEOMETRY_CALIBRATION.MAX_CENTER_OFFSET_Y) {
        return {
            isReady: false,
            state: 'MOVE_DOWN',
            message: 'Geser wajah sedikit ke bawah.',
            metrics,
        };
    }
    if (metrics.offsetY > GEOMETRY_CALIBRATION.MAX_CENTER_OFFSET_Y) {
        return {
            isReady: false,
            state: 'MOVE_UP',
            message: 'Geser wajah sedikit ke atas.',
            metrics,
        };
    }

    // Prioritas 6: Tracking confidence
    if (trackingConfidence < 0.45) {
        return {
            isReady: false,
            state: 'ADJUST_POSE',
            message: 'Hadapkan wajah lurus ke kamera.',
            metrics,
        };
    }

    // Semuanya memenuhi syarat Quality Gate -> READY (Mendukung 30 cm, 45 cm, dan 60 cm)
    return {
        isReady: true,
        state: 'READY',
        message: 'Posisi wajah siap. Tahan posisi Anda.',
        metrics,
    };
}
