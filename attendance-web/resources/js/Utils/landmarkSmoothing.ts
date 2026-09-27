/**
 * One Euro Filter & Multi-Band Adaptive Landmark Smoothing
 * Biometric Face Tracking & EMAR Liveness Module
 *
 * Provides frame-rate independent jitter suppression when stationary
 * while preserving zero-latency response for active liveness (blinks, mouth open).
 */

export interface Point3D {
    x: number;
    y: number;
    z: number;
    visibility?: number;
}

export interface SmoothingConfig {
    /** Minimum cutoff frequency for rigid/pose landmarks (Hz) - lower = zero jitter */
    rigidMinCutoff: number;
    /** Speed coefficient for rigid landmarks (higher = faster adaptation) */
    rigidBeta: number;
    /** Derivative cutoff frequency for rigid landmarks (Hz) */
    rigidDCutoff: number;

    /** Minimum cutoff frequency for expression landmarks (eyes, mouth) (Hz) */
    expressionMinCutoff: number;
    /** Speed coefficient for expression landmarks */
    expressionBeta: number;
    /** Derivative cutoff frequency for expression landmarks (Hz) */
    expressionDCutoff: number;

    /** Minimum cutoff frequency for iris/pupil landmarks (Hz) */
    irisMinCutoff: number;
    /** Speed coefficient for iris landmarks */
    irisBeta: number;
    /** Derivative cutoff frequency for iris landmarks (Hz) */
    irisDCutoff: number;

    /** Max allowable position delta per frame before clamping outlier spikes */
    maxOutlierDelta: number;
    /** Landmark count (default: 478) */
    landmarkCount: number;
}

export const DEFAULT_SMOOTHING_CONFIG: Readonly<SmoothingConfig> = {
    rigidMinCutoff: 1.0,
    rigidBeta: 0.05,
    rigidDCutoff: 1.0,

    expressionMinCutoff: 1.2,
    expressionBeta: 0.06,
    expressionDCutoff: 1.2,

    irisMinCutoff: 1.0,
    irisBeta: 0.05,
    irisDCutoff: 1.0,

    maxOutlierDelta: 0.8,
    landmarkCount: 478,
};

/**
 * Expression Landmark Indices (Eye contours, lips outer & inner, mouth opening).
 * High-speed dynamic cutoff for responsive EAR/MAR liveness detection.
 */
export const EXPRESSION_INDEX_SET: ReadonlySet<number> = new Set([
    // Left eye contour
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
    // Right eye contour
    362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384,
    398,
    // Lips outer & inner
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 185, 40, 39, 37, 0, 267,
    269, 270, 409, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 191, 80,
    81, 82, 13, 312, 311, 310, 415,
    // Jaw tip
    14, 152, 176, 148, 150,
]);

/**
 * Iris Landmark Indices (Left & Right Iris center and perimeter)
 */
export const IRIS_INDEX_SET: ReadonlySet<number> = new Set([
    // Left iris
    468, 469, 470, 471, 472,
    // Right iris
    473, 474, 475, 476, 477,
]);

/**
 * Eye Landmark Indices specifically for Eye Blink Challenge Highlighting
 */
export const EYE_LANDMARK_INDICES: ReadonlyArray<number> = [
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
    362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384,
    398,
];

/**
 * Mouth Landmark Indices specifically for Mouth Open Challenge Highlighting
 */
export const MOUTH_LANDMARK_INDICES: ReadonlyArray<number> = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 185, 40, 39, 37, 0, 267,
    269, 270, 409, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 191, 80,
    81, 82, 13, 312, 311, 310, 415,
];

export class LandmarkSmoother {
    private config: SmoothingConfig;
    private prevX: Float32Array;
    private prevY: Float32Array;
    private prevZ: Float32Array;
    private dx: Float32Array;
    private dy: Float32Array;
    private dz: Float32Array;
    private lastTimestamp: number | null = null;

    constructor(customConfig?: Partial<SmoothingConfig>) {
        this.config = { ...DEFAULT_SMOOTHING_CONFIG, ...customConfig };
        const n = this.config.landmarkCount;
        this.prevX = new Float32Array(n);
        this.prevY = new Float32Array(n);
        this.prevZ = new Float32Array(n);
        this.dx = new Float32Array(n);
        this.dy = new Float32Array(n);
        this.dz = new Float32Array(n);
    }

    public reset(): void {
        this.prevX.fill(0);
        this.prevY.fill(0);
        this.prevZ.fill(0);
        this.dx.fill(0);
        this.dy.fill(0);
        this.dz.fill(0);
        this.lastTimestamp = null;
    }

    public filter(
        rawLandmarks: Point3D[],
        outTargetPool: Point3D[],
        timestampMs: number,
    ): Point3D[] {
        if (!rawLandmarks || rawLandmarks.length === 0) {
            this.reset();
            return outTargetPool;
        }

        const count = Math.min(rawLandmarks.length, this.config.landmarkCount);

        if (this.lastTimestamp === null) {
            this.lastTimestamp = timestampMs;
            for (let i = 0; i < count; i++) {
                const pt = rawLandmarks[i];
                this.prevX[i] = pt.x;
                this.prevY[i] = pt.y;
                this.prevZ[i] = pt.z;
                this.dx[i] = 0;
                this.dy[i] = 0;
                this.dz[i] = 0;
                outTargetPool[i].x = pt.x;
                outTargetPool[i].y = pt.y;
                outTargetPool[i].z = pt.z;
                outTargetPool[i].visibility = pt.visibility ?? 1;
            }
            return outTargetPool;
        }

        // Frame interval delta in seconds (clamped to prevent instabilities on frame drops)
        const dt = Math.min(
            0.1,
            Math.max(0.001, (timestampMs - this.lastTimestamp) / 1000),
        );
        this.lastTimestamp = timestampMs;

        const {
            rigidMinCutoff,
            rigidBeta,
            rigidDCutoff,
            expressionMinCutoff,
            expressionBeta,
            expressionDCutoff,
            irisMinCutoff,
            irisBeta,
            irisDCutoff,
            maxOutlierDelta,
        } = this.config;

        const twoPiDt = 2 * Math.PI * dt;

        // Precompute derivative alphas for different bands
        const rigidDAlpha =
            (twoPiDt * rigidDCutoff) / (twoPiDt * rigidDCutoff + 1);
        const exprDAlpha =
            (twoPiDt * expressionDCutoff) / (twoPiDt * expressionDCutoff + 1);
        const irisDAlpha =
            (twoPiDt * irisDCutoff) / (twoPiDt * irisDCutoff + 1);

        for (let i = 0; i < count; i++) {
            const raw = rawLandmarks[i];
            let rawX = raw.x;
            let rawY = raw.y;
            let rawZ = raw.z;

            // Outlier clamping to prevent unphysical spikes
            const distFromPrev = Math.sqrt(
                (rawX - this.prevX[i]) ** 2 +
                    (rawY - this.prevY[i]) ** 2 +
                    (rawZ - this.prevZ[i]) ** 2,
            );

            if (distFromPrev > maxOutlierDelta) {
                const ratio = maxOutlierDelta / distFromPrev;
                rawX = this.prevX[i] + (rawX - this.prevX[i]) * ratio;
                rawY = this.prevY[i] + (rawY - this.prevY[i]) * ratio;
                rawZ = this.prevZ[i] + (rawZ - this.prevZ[i]) * ratio;
            }

            // Raw velocity
            const rDx = (rawX - this.prevX[i]) / dt;
            const rDy = (rawY - this.prevY[i]) / dt;
            const rDz = (rawZ - this.prevZ[i]) / dt;

            // Determine frequency band
            let dAlpha: number;
            let minCutoff: number;
            let beta: number;

            if (IRIS_INDEX_SET.has(i)) {
                dAlpha = irisDAlpha;
                minCutoff = irisMinCutoff;
                beta = irisBeta;
            } else if (EXPRESSION_INDEX_SET.has(i)) {
                dAlpha = exprDAlpha;
                minCutoff = expressionMinCutoff;
                beta = expressionBeta;
            } else {
                dAlpha = rigidDAlpha;
                minCutoff = rigidMinCutoff;
                beta = rigidBeta;
            }

            // Filtered velocity (EMA on derivative)
            this.dx[i] = dAlpha * rDx + (1 - dAlpha) * this.dx[i];
            this.dy[i] = dAlpha * rDy + (1 - dAlpha) * this.dy[i];
            this.dz[i] = dAlpha * rDz + (1 - dAlpha) * this.dz[i];

            const speed = Math.sqrt(
                this.dx[i] * this.dx[i] +
                    this.dy[i] * this.dy[i] +
                    this.dz[i] * this.dz[i],
            );

            // Dynamic cutoff frequency
            const cutoff = minCutoff + beta * speed;
            const alpha = (twoPiDt * cutoff) / (twoPiDt * cutoff + 1);

            // Position filtering
            this.prevX[i] = alpha * rawX + (1 - alpha) * this.prevX[i];
            this.prevY[i] = alpha * rawY + (1 - alpha) * this.prevY[i];
            this.prevZ[i] = alpha * rawZ + (1 - alpha) * this.prevZ[i];

            outTargetPool[i].x = this.prevX[i];
            outTargetPool[i].y = this.prevY[i];
            outTargetPool[i].z = this.prevZ[i];
            outTargetPool[i].visibility = raw.visibility ?? 1;
        }

        return outTargetPool;
    }
}

