import { DrawingUtils, FaceLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef } from 'react';
import { Landmark3D } from './useFaceLandmarker';

/* ------------------------------------------------------------------ */
/*  Public Types                                                       */
/* ------------------------------------------------------------------ */

export type ScannerVisualState =
    | 'INITIALIZING'
    | 'REQUESTING_CAMERA'
    | 'SEARCHING_FACE'
    | 'ALIGNING_FACE'
    | 'CHECKING_QUALITY'
    | 'READY'
    | 'LIVENESS_CHALLENGE'
    | 'CAPTURING'
    | 'VERIFYING_IDENTITY'
    | 'SUCCESS'
    | 'FAILED';

export interface UseThreeFaceMeshOptions {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    landmarks: Landmark3D[] | null;
    visualState: ScannerVisualState;
    livenessStage?: 'NONE' | 'BLINK' | 'MOUTH' | 'COUNTDOWN' | 'SCANNING_8S' | 'COMPLETED';
    isMirrored?: boolean;
    reducedMotion?: boolean;
    /** Optional ref to latest landmarks (bypasses React re-render) */
    landmarksRef?: React.RefObject<Landmark3D[] | null>;
}

/* ------------------------------------------------------------------ */
/*  Hook Implementation                                                */
/* ------------------------------------------------------------------ */

export function useThreeFaceMesh({
    canvasRef,
    videoRef,
    landmarks,
    visualState,
    livenessStage = 'NONE',
    isMirrored = true,
    reducedMotion = false,
    landmarksRef: externalLandmarksRef,
}: UseThreeFaceMeshOptions): void {
    // Canvas context and DrawingUtils ref
    const drawingUtilsRef = useRef<DrawingUtils | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    // Pre-allocated landmark coordinate buffers for zero per-frame allocation
    const mappedPoolRef = useRef<
        Array<{ x: number; y: number; z: number; visibility: number }>
    >(
        Array.from({ length: 478 }, () => ({
            x: 0,
            y: 0,
            z: 0,
            visibility: 1,
        })),
    );
    const faceBoundsRef = useRef({ minY: 0, maxY: 1 });

    // Dynamic state refs (read in RAF loop without hook recreation)
    const visualStateRef = useRef<ScannerVisualState>(visualState);
    const livenessStageRef = useRef<
        'NONE' | 'BLINK' | 'MOUTH' | 'COUNTDOWN' | 'SCANNING_8S' | 'COMPLETED'
    >(livenessStage);
    const reducedMotionRef = useRef(reducedMotion);
    const isMirroredRef = useRef(isMirrored);
    const landmarksInternalRef = useRef<Landmark3D[] | null>(landmarks);

    // Animation & RAF
    const rafId = useRef<number | null>(null);
    const isHiddenRef = useRef(false);
    const meshOpacityRef = useRef(0);

    // Sync props to refs
    useEffect(() => {
        visualStateRef.current = visualState;
    }, [visualState]);

    useEffect(() => {
        livenessStageRef.current = livenessStage;
    }, [livenessStage]);

    useEffect(() => {
        reducedMotionRef.current = reducedMotion;
    }, [reducedMotion]);

    useEffect(() => {
        isMirroredRef.current = isMirrored;
    }, [isMirrored]);

    useEffect(() => {
        landmarksInternalRef.current = landmarks;
    }, [landmarks]);

    /* ---- Tab Visibility Handler ---- */
    useEffect(() => {
        const handler = () => {
            isHiddenRef.current = document.hidden;
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    /* ---- High-Performance Real-Time Render Loop ---- */
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;
        ctxRef.current = ctx;
        drawingUtilsRef.current = new DrawingUtils(ctx);

        let lastTime = performance.now();

        const render = (time: number) => {
            rafId.current = requestAnimationFrame(render);

            if (isHiddenRef.current) {
                lastTime = time;
                return;
            }

            const delta = Math.min(64, time - lastTime);
            lastTime = time;

            const video = videoRef.current;
            const container = canvas.parentElement;
            if (!container || !video) return;

            const rect = container.getBoundingClientRect();
            const width = Math.floor(rect.width);
            const height = Math.floor(rect.height);
            if (width === 0 || height === 0) return;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const isWidescreen = width >= 640;

            // Pin canvas buffer to crisp 1080p (1920x1080) minimum on desktop/tablet,
            // or high-DPR scaled buffer matching container proportions
            let targetW = Math.floor(width * dpr);
            let targetH = Math.floor(height * dpr);

            if (isWidescreen) {
                targetW = Math.max(1920, targetW);
                targetH = Math.max(1080, targetH);
            }

            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
            }

            // Clear canvas using identity transform so DrawingUtils draws directly in physical pixels
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, targetW, targetH);

            const lms =
                externalLandmarksRef?.current ?? landmarksInternalRef.current;
            const state = visualStateRef.current;
            const liveness = livenessStageRef.current;
            const isReduced = reducedMotionRef.current;
            const isMirrored = isMirroredRef.current;

            // Opacity transition
            const targetOpacity =
                state === 'INITIALIZING' ||
                state === 'REQUESTING_CAMERA' ||
                state === 'SEARCHING_FACE'
                    ? 0
                    : 1;

            meshOpacityRef.current +=
                (targetOpacity - meshOpacityRef.current) *
                Math.min(1.0, (delta / 1000) * 12);

            if (
                lms &&
                lms.length >= 468 &&
                video.videoWidth > 0 &&
                meshOpacityRef.current > 0.01
            ) {
                const vW = video.videoWidth;
                const vH = video.videoHeight;
                const scale = Math.max(width / vW, height / vH);
                const renderedW = vW * scale;
                const renderedH = vH * scale;
                const offsetX = (width - renderedW) / 2;
                const offsetY = (height - renderedH) / 2;

                const mappedPool = mappedPoolRef.current;

                let localMinY = 1;
                let localMaxY = 0;

                for (let i = 0; i < lms.length; i++) {
                    const lm = lms[i];
                    const vx = isMirrored ? 1 - lm.x : lm.x;
                    const vy = lm.y;

                    // Direct 1:1 screen-space normalized coordinate calculation
                    const normX = (offsetX + vx * renderedW) / width;
                    const normY = (offsetY + vy * renderedH) / height;

                    mappedPool[i].x = normX;
                    mappedPool[i].y = normY;
                    mappedPool[i].z = lm.z;
                    mappedPool[i].visibility = 1;

                    if (normY < localMinY) localMinY = normY;
                    if (normY > localMaxY) localMaxY = normY;
                }

                faceBoundsRef.current.minY = localMinY;
                faceBoundsRef.current.maxY = localMaxY;

                // Setup drawing context
                ctx.globalAlpha = meshOpacityRef.current;
                const drawingUtils = drawingUtilsRef.current;

                // Color configuration matching modern tech UI
                const isSuccess = state === 'SUCCESS';
                const isFailed = state === 'FAILED';
                const isLivenessChallenge = state === 'LIVENESS_CHALLENGE';

                let tessellationColor = 'rgba(192, 192, 192, 0.42)';
                let eyeColor = '#06B6D4'; // Cyan for a modern high-tech look
                let ovalColor = '#E0E0E0';
                let lipsColor = '#EF4444'; // Red for mouth/lips landmark contour

                if (isSuccess) {
                    tessellationColor = 'rgba(16, 185, 129, 0.5)';
                    eyeColor = '#10B981';
                    ovalColor = '#10B981';
                    lipsColor = '#10B981';
                } else if (isFailed) {
                    tessellationColor = 'rgba(239, 68, 68, 0.5)';
                    eyeColor = '#EF4444';
                    ovalColor = '#EF4444';
                    lipsColor = '#EF4444';
                } else if (isLivenessChallenge) {
                    const pulse = 0.5 + 0.5 * Math.sin(time / 140);
                    const livenessColor = `rgba(192, 132, 252, ${0.75 + 0.25 * pulse})`;
                    if (liveness === 'BLINK') {
                        eyeColor = livenessColor;
                    } else if (liveness === 'MOUTH') {
                        lipsColor = `rgba(239, 68, 68, ${0.75 + 0.25 * pulse})`;
                    }
                }

                if (drawingUtils) {
                    const strokeScale = Math.max(dpr, targetW / width);

                    // 1. Draw Tessellation (Silver Wireframe Triangles)
                    if (FaceLandmarker.FACE_LANDMARKS_TESSELATION) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                            { color: tessellationColor, lineWidth: 1 * strokeScale },
                        );
                    }

                    // 2. Draw Eyes, Eyebrows & Iris (Uniform Cyan Color)
                    if (FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                            { color: eyeColor, lineWidth: 1.5 * strokeScale },
                        );
                    }
                    if (FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
                            { color: eyeColor, lineWidth: 1.5 * strokeScale },
                        );
                    }
                    if (FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
                            { color: eyeColor, lineWidth: 1.5 * strokeScale },
                        );
                    }

                    if (FaceLandmarker.FACE_LANDMARKS_LEFT_EYE) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                            { color: eyeColor, lineWidth: 1.5 * strokeScale },
                        );
                    }
                    if (FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
                            { color: eyeColor, lineWidth: 1.5 * strokeScale },
                        );
                    }
                    if (FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
                            { color: eyeColor, lineWidth: 1.5 * strokeScale },
                        );
                    }

                    // 3. Draw Face Oval (Crisp White Boundary)
                    if (FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                            { color: ovalColor, lineWidth: 2 * strokeScale },
                        );
                    }

                    // 4. Draw Lips (Vibrant Red Mouth/Lips Contour)
                    if (FaceLandmarker.FACE_LANDMARKS_LIPS) {
                        drawingUtils.drawConnectors(
                            mappedPool,
                            FaceLandmarker.FACE_LANDMARKS_LIPS,
                            { color: lipsColor, lineWidth: 2 * strokeScale },
                        );
                    }
                }

                // 5. Draw Subtle Futuristic Scan Line Sweep
                if (
                    !isReduced &&
                    (state === 'READY' ||
                        state === 'CAPTURING' ||
                        state === 'VERIFYING_IDENTITY')
                ) {
                    const strokeScale = Math.max(dpr, targetW / width);
                    const scanT = (time % 1800) / 1800;
                    const topY = faceBoundsRef.current.minY * targetH;
                    const botY = faceBoundsRef.current.maxY * targetH;
                    const scanY = topY + scanT * (botY - topY);

                    ctx.save();
                    const scanGrad = ctx.createLinearGradient(
                        0,
                        scanY - 3 * strokeScale,
                        0,
                        scanY + 3 * strokeScale,
                    );
                    scanGrad.addColorStop(0, 'rgba(6, 182, 212, 0)');
                    scanGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.7)');
                    scanGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');

                    ctx.fillStyle = scanGrad;
                    ctx.fillRect(
                        targetW * 0.15,
                        scanY - 3 * strokeScale,
                        targetW * 0.7,
                        6 * strokeScale,
                    );
                    ctx.restore();
                }
            }

            ctx.restore();
        };

        rafId.current = requestAnimationFrame(render);

        return () => {
            if (rafId.current) cancelAnimationFrame(rafId.current);
        };
    }, [canvasRef, videoRef, externalLandmarksRef]);
}
