import {
    FaceLandmarker,
    FaceLandmarkerResult,
    FilesetResolver,
} from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LandmarkSmoother } from '../Utils/landmarkSmoothing';
import {
    EAR_BLINK_THRESHOLD,
    MAR_OPEN_THRESHOLD,
    eyeAspectRatio,
    mouthAspectRatio,
} from '../Utils/emarGeometry';

/* ------------------------------------------------------------------ */
/*  Public Types                                                       */
/* ------------------------------------------------------------------ */

export interface Landmark3D {
    x: number;
    y: number;
    z: number;
    visibility?: number;
}

export interface LandmarkerState {
    isLoaded: boolean;
    isLoading: boolean;
    error: string | null;
    landmarks: Landmark3D[] | null;
    blendshapes: Record<string, number> | null;
    matrix: number[] | null;
    hasFace: boolean;
    faceCount: number;
    qualityScore: number;
    trackingConfidence: number;
    /** EAR geometris (rata-rata kedua mata) frame terakhir, rumus Bab II. */
    ear: number | null;
    /** MAR geometris bibir dalam frame terakhir, rumus Bab II. */
    mar: number | null;
}

interface UseFaceLandmarkerOptions {
    active: boolean;
    onResults?: (
        result: FaceLandmarkerResult,
        smoothedLandmarks: Landmark3D[],
    ) => void;
}

/* ------------------------------------------------------------------ */
/*  Filter Configuration                                               */
/* ------------------------------------------------------------------ */

const FILTER_CONFIG = {
    /** Milliseconds face must be missing before resetting smoothing history */
    faceLostResetMs: 400,
    /** Minimum change in qualityScore to trigger a React state update */
    qualityChangeThreshold: 0.02,
    /** Total number of MediaPipe face landmarks */
    landmarkCount: 478,
} as const;

/* ------------------------------------------------------------------ */
/*  Hook Implementation                                                */
/* ------------------------------------------------------------------ */

export function useFaceLandmarker({
    active,
    onResults,
}: UseFaceLandmarkerOptions) {
    const [state, setState] = useState<LandmarkerState>({
        isLoaded: false,
        isLoading: true,
        error: null,
        landmarks: null,
        blendshapes: null,
        matrix: null,
        hasFace: false,
        faceCount: 0,
        qualityScore: 0,
        trackingConfidence: 0,
        ear: null,
        mar: null,
    });

    const landmarkerRef = useRef<FaceLandmarker | null>(null);

    // Multi-band One Euro Filter smoother instance
    const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother());

    // Persistent Landmark3D array — reuse objects instead of creating new ones
    const landmarkPool = useRef<Landmark3D[]>(
        Array.from({ length: FILTER_CONFIG.landmarkCount }, () => ({
            x: 0,
            y: 0,
            z: 0,
            visibility: 0,
        })),
    );

    const faceLostTimestampRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number>(0);

    // Ref-based output for Three.js hook (bypasses React re-render cycle)
    const landmarksRef = useRef<Landmark3D[] | null>(null);
    const blendshapesRef = useRef<Record<string, number> | null>(null);

    // Previous values for batched setState (only update when meaningful change)
    const prevHasFaceRef = useRef(false);
    const prevQualityRef = useRef(0);
    const prevFaceCountRef = useRef(0);
    const prevIsBlinkingRef = useRef(false);
    const prevIsJawOpenRef = useRef(false);
    const prevEyesClosedRef = useRef(false);
    const prevMouthOpenRef = useRef(false);
    const lastStateUpdateRef = useRef(0);

    /* ---- Initialize MediaPipe FaceLandmarker ---- */
    useEffect(() => {
        let isMounted = true;

        async function initLandmarker() {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));

                let vision: any;
                try {
                    vision = await FilesetResolver.forVisionTasks('/wasm');
                } catch (localWasmErr) {
                    console.warn('Local /wasm path failed, attempting CDN fallback:', localWasmErr);
                    vision = await FilesetResolver.forVisionTasks(
                        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
                    );
                }
                if (!isMounted) return;

                const modelCandidates = [
                    '/models/face_landmarker.task',
                    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                ];

                let landmarker: FaceLandmarker | null = null;
                let lastInitErr: unknown = null;

                for (const modelPath of modelCandidates) {
                    try {
                        try {
                            landmarker = await FaceLandmarker.createFromOptions(
                                vision,
                                {
                                    baseOptions: {
                                        modelAssetPath: modelPath,
                                        delegate: 'GPU',
                                    },
                                    runningMode: 'VIDEO',
                                    numFaces: 1,
                                    outputFaceBlendshapes: true,
                                    outputFacialTransformationMatrixes: true,
                                    minFaceDetectionConfidence: 0.5,
                                    minFacePresenceConfidence: 0.5,
                                    minTrackingConfidence: 0.5,
                                },
                            );
                            break;
                        } catch (gpuErr) {
                            console.warn(
                                `GPU delegate failed for ${modelPath}, falling back to CPU delegate:`,
                                gpuErr,
                            );
                            landmarker = await FaceLandmarker.createFromOptions(
                                vision,
                                {
                                    baseOptions: {
                                        modelAssetPath: modelPath,
                                        delegate: 'CPU',
                                    },
                                    runningMode: 'VIDEO',
                                    numFaces: 1,
                                    outputFaceBlendshapes: true,
                                    outputFacialTransformationMatrixes: true,
                                    minFaceDetectionConfidence: 0.5,
                                    minFacePresenceConfidence: 0.5,
                                    minTrackingConfidence: 0.5,
                                },
                            );
                            break;
                        }
                    } catch (modelErr) {
                        lastInitErr = modelErr;
                        console.warn(`Failed loading model from ${modelPath}:`, modelErr);
                    }
                }

                if (!landmarker) {
                    throw lastInitErr || new Error('Gagal memuat model face landmarker.');
                }

                if (!isMounted) {
                    landmarker.close();
                    return;
                }

                landmarkerRef.current = landmarker;
                setState((prev) => ({
                    ...prev,
                    isLoaded: true,
                    isLoading: false,
                    error: null,
                }));
            } catch (err: unknown) {
                console.error(
                    'Gagal menginisialisasi MediaPipe FaceLandmarker:',
                    err,
                );
                if (isMounted) {
                    const errorMessage =
                        err instanceof Error
                            ? err.message
                            : 'Gagal memuat MediaPipe Face Landmarker lokal.';
                    setState((prev) => ({
                        ...prev,
                        isLoaded: false,
                        isLoading: false,
                        error: errorMessage,
                    }));
                }
            }
        }

        initLandmarker();

        return () => {
            isMounted = false;
            if (landmarkerRef.current) {
                try {
                    landmarkerRef.current.close();
                } catch (_e) {
                    // Ignore disposal errors
                }
                landmarkerRef.current = null;
            }
        };
    }, []);

    /* ---- Process a single video frame ---- */
    const processFrame = useCallback(
        (videoElement: HTMLVideoElement, timestamp: number) => {
            if (
                !landmarkerRef.current ||
                !active ||
                videoElement.paused ||
                videoElement.ended
            ) {
                return;
            }

            try {
                // Ensure strictly monotonic timestamp for MediaPipe & filter
                const now = Math.max(
                    lastTimestampRef.current + 1,
                    timestamp || performance.now(),
                );
                lastTimestampRef.current = now;

                const results = landmarkerRef.current.detectForVideo(
                    videoElement,
                    now,
                );
                const faceCount = results.faceLandmarks?.length ?? 0;

                if (faceCount > 0) {
                    // Reset face-lost timer
                    faceLostTimestampRef.current = null;

                    const rawLms = results.faceLandmarks[0] as Landmark3D[];

                    // Map blendshapes to key-value Record
                    const blendshapesRecord: Record<string, number> = {};
                    if (
                        results.faceBlendshapes &&
                        results.faceBlendshapes.length > 0
                    ) {
                        for (const cat of results.faceBlendshapes[0]
                            .categories) {
                            blendshapesRecord[cat.categoryName] = cat.score;
                        }
                    }

                    // Extract transformation matrix
                    let matrixArray: number[] | null = null;
                    if (
                        results.facialTransformationMatrixes &&
                        results.facialTransformationMatrixes.length > 0
                    ) {
                        const matObj = results.facialTransformationMatrixes[0];
                        matrixArray = matObj.data
                            ? Array.from(matObj.data)
                            : null;
                    }

                    // Single-pass min/max for quality (zero array allocation)
                    let minX = Infinity,
                        maxX = -Infinity;
                    let minY = Infinity,
                        maxY = -Infinity;
                    for (let i = 0; i < rawLms.length; i++) {
                        const { x, y } = rawLms[i];
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                    const faceArea = (maxX - minX) * (maxY - minY);
                    const quality = Math.min(
                        1.0,
                        Math.max(0.0, faceArea / 0.15),
                    );

                    // Tracking confidence from face center proximity
                    const centerX = (maxX + minX) / 2;
                    const centerY = (maxY + minY) / 2;
                    const distFromCenter = Math.sqrt(
                        (centerX - 0.5) ** 2 + (centerY - 0.45) ** 2,
                    );
                    const confidence = Math.max(0, 1 - distFromCenter * 3);

                    // EAR/MAR geometris dihitung tiap frame deteksi, dalam piksel video.
                    const vw = videoElement.videoWidth || 0;
                    const vh = videoElement.videoHeight || 0;
                    const ear = eyeAspectRatio(rawLms, vw, vh);
                    const mar = mouthAspectRatio(rawLms, vw, vh);

                    // Update refs for Canvas/Three rendering (instant zero-delay update)
                    landmarksRef.current = rawLms;
                    blendshapesRef.current = blendshapesRecord;

                    // Batched state: only call setState when values change meaningfully or on liveness triggers
                    const hasFaceChanged = !prevHasFaceRef.current;
                    const faceCountChanged =
                        prevFaceCountRef.current !== faceCount;
                    const qualityChanged =
                        Math.abs(quality - prevQualityRef.current) >
                        FILTER_CONFIG.qualityChangeThreshold;

                    // Liveness trigger state change detection (instant response for blinks/mouth)
                    const isBlinking =
                        (blendshapesRecord['eyeBlinkLeft'] || 0) > 0.35 ||
                        (blendshapesRecord['eyeBlinkRight'] || 0) > 0.35;
                    const isJawOpen = (blendshapesRecord['jawOpen'] || 0) > 0.2;
                    const blinkTriggered =
                        isBlinking !== prevIsBlinkingRef.current;
                    const jawTriggered =
                        isJawOpen !== prevIsJawOpenRef.current;

                    // Setiap kali EAR/MAR melewati ambang naskah, state diperbarui saat itu
                    // juga, supaya kedipan singkat di antara pembaruan 120 ms tidak terlewat.
                    const eyesClosed = ear !== null && ear < EAR_BLINK_THRESHOLD;
                    const mouthOpen = mar !== null && mar >= MAR_OPEN_THRESHOLD;
                    const eyesTriggered = eyesClosed !== prevEyesClosedRef.current;
                    const mouthTriggered = mouthOpen !== prevMouthOpenRef.current;
                    prevEyesClosedRef.current = eyesClosed;
                    prevMouthOpenRef.current = mouthOpen;

                    prevHasFaceRef.current = true;
                    prevFaceCountRef.current = faceCount;
                    if (qualityChanged) prevQualityRef.current = quality;
                    if (blinkTriggered)
                        prevIsBlinkingRef.current = isBlinking;
                    if (jawTriggered) prevIsJawOpenRef.current = isJawOpen;

                    const nowTime = performance.now();
                    const shouldPeriodicUpdate =
                        nowTime - lastStateUpdateRef.current > 120;

                    if (
                        hasFaceChanged ||
                        faceCountChanged ||
                        qualityChanged ||
                        blinkTriggered ||
                        jawTriggered ||
                        eyesTriggered ||
                        mouthTriggered ||
                        shouldPeriodicUpdate
                    ) {
                        lastStateUpdateRef.current = nowTime;
                        setState((prev) => ({
                            ...prev,
                            hasFace: true,
                            faceCount,
                            landmarks: rawLms,
                            blendshapes: blendshapesRecord,
                            matrix: matrixArray,
                            qualityScore: quality,
                            trackingConfidence: confidence,
                            ear,
                            mar,
                        }));
                    }

                    if (onResults) onResults(results, rawLms);
                } else {
                    // Face lost
                    const nowLost = performance.now();
                    if (faceLostTimestampRef.current === null) {
                        faceLostTimestampRef.current = nowLost;
                    }

                    // Reset smoothing after face gone for grace period
                    if (
                        nowLost - faceLostTimestampRef.current >
                        FILTER_CONFIG.faceLostResetMs
                    ) {
                        smootherRef.current.reset();
                    }

                    // Only update state once when face disappears
                    if (prevHasFaceRef.current) {
                        prevHasFaceRef.current = false;
                        prevFaceCountRef.current = 0;
                        prevQualityRef.current = 0;
                        landmarksRef.current = null;
                        blendshapesRef.current = null;

                        setState((prev) => ({
                            ...prev,
                            hasFace: false,
                            faceCount: 0,
                            landmarks: null,
                            blendshapes: null,
                            matrix: null,
                            qualityScore: 0,
                            trackingConfidence: 0,
                            ear: null,
                            mar: null,
                        }));
                    }
                }
            } catch (err) {
                console.error(
                    'Error processing video frame in FaceLandmarker:',
                    err,
                );
            }
        },
        [active, onResults],
    );

    /* ---- Reset smoothing (call on retry, camera change, session change) ---- */
    const resetSmoothing = useCallback(() => {
        smootherRef.current.reset();
        faceLostTimestampRef.current = null;
        landmarksRef.current = null;
        blendshapesRef.current = null;
    }, []);

    return {
        ...state,
        processFrame,
        resetSmoothing,
        /** Ref to latest smoothed landmarks — use in RAF loops to avoid re-render */
        landmarksRef,
        /** Ref to latest blendshapes — use in RAF loops to avoid re-render */
        blendshapesRef,
    };
}
