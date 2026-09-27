import {
    AlertTriangle,
    Camera,
    CheckCircle2,
    Eye,
    Loader2,
    Move,
    RefreshCw,
    Search,
    ShieldCheck,
    Smile,
    Sun,
    SwitchCamera,
    Video,
    Volume2,
    VolumeX,
    XCircle,
    Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFaceLandmarker } from '../../Hooks/useFaceLandmarker';
import {
    ChallengeTracker,
    CycleCounter,
    EAR_BLINK_THRESHOLD,
    MAR_OPEN_THRESHOLD,
} from '../../Utils/emarGeometry';
import {
    ScannerVisualState,
    useThreeFaceMesh,
} from '../../Hooks/useThreeFaceMesh';
import { evaluateQualityGate } from '../../Utils/faceGeometry';
import {
    DistanceSensorSmoother,
    estimateFaceDistance,
    getDistanceCategory,
} from '../../Utils/faceDistance';
import { NormalizedFaceROI } from '../../Utils/luxMeasurement';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ScenarioParams {
    subject_id?: string;
    distance_cm?: number;
    lux?: number;
    session_type?: string;
    sample_type?: string;
}

export type ActiveChallengeType = 'BLINK' | 'OPEN_MOUTH';
export type ActiveChallengeStatus =
    | 'WAITING_FOR_ACTION'
    | 'PASS_LIVENESS'
    | 'REJECT_WRONG_ACTION'
    | 'REJECT_TIMEOUT';

export interface ScanMetrics {
    earBlinks: number;
    marMouths: number;
    facePct: number;
    durationS: number;
    earVal?: number;
    marVal?: number;
    activeChallenge?: ActiveChallengeType;
    challengeStatus?: ActiveChallengeStatus;
}

interface FaceScannerContainerProps {
    onVerificationSubmit: (videoBlob: Blob, metrics: ScanMetrics) => void;
    isVerifying: boolean;
    verificationResult?: 'success' | 'failed' | null;
    isResearchMode?: boolean;
    scenarioParams?: ScenarioParams;
    onMetricsUpdate?: (metrics: {
        ear: number;
        mar: number;
        quality: number;
    }) => void;
    onResetScan?: () => void;
    resetKey?: number;
    onVideoRefReady?: (video: HTMLVideoElement | null) => void;
    onDistanceUpdate?: (distanceCm: number, isIdeal: boolean, category: string) => void;
    onFaceROIUpdate?: (roi: NormalizedFaceROI) => void;
    // true selama modal pendaftaran wajah terbuka: wajah yang sedang didaftarkan
    // tidak boleh ikut terekam dan terkirim sebagai presensi.
    paused?: boolean;
}

type LivenessStage = 'NONE' | 'COUNTDOWN' | 'SCANNING_8S' | 'COMPLETED';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const QUALITY_HOLD_MS = 600; // Hold quality check before countdown
const COUNTDOWN_TOTAL_SEC = 3; // 3 seconds pre-scan countdown
const SCAN_DURATION_MS = 8000; // Jendela observasi pasif 8,0 s (Tabel 5.2)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FaceScannerContainer({
    onVerificationSubmit,
    isVerifying,
    verificationResult,
    isResearchMode = false,
    scenarioParams,
    onMetricsUpdate,
    onResetScan,
    resetKey,
    onVideoRefReady,
    onDistanceUpdate,
    onFaceROIUpdate,
    paused = false,
}: FaceScannerContainerProps) {
    /* Refs */
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const distanceSmootherRef = useRef<DistanceSensorSmoother>(new DistanceSensorSmoother(0.25));

    /* Live Distance Sensor State */
    const [liveDistanceCm, setLiveDistanceCm] = useState<number | null>(null);

    useEffect(() => {
        if (videoRef.current) {
            onVideoRefReady?.(videoRef.current);
        }
        return () => {
            onVideoRefReady?.(null);
        };
    }, [onVideoRefReady]);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    const qualityStartRef = useRef<number | null>(null);
    const challengeStartRef = useRef<number | null>(null);
    const frameCallbackIdRef = useRef<number | null>(null);

    /* State */
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [visualState, setVisualState] =
        useState<ScannerVisualState>('INITIALIZING');
    const [statusMessage, setStatusMessage] = useState(
        'Memuat sistem scanner...',
    );
    const [challengeText, setChallengeText] = useState('');
    const [livenessStage, setLivenessStage] = useState<LivenessStage>('NONE');
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const [streamResolution, setStreamResolution] = useState<{ width: number; height: number } | null>(null);
    const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    /* Mobile Viewport Detection for Viewfinder Aspect-Ratio Compensation */
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth < 640;
        }
        return false;
    });

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    /* Camera Direction State (Front / Selfie vs Back / Environment) */
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

    /* Audio Voice Guidance State (Indonesian Web Speech API) */
    const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('presensi_voice_guidance') === 'true';
        }
        return false;
    });

    const toggleVoice = useCallback(() => {
        setIsVoiceEnabled((prev) => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('presensi_voice_guidance', String(next));
                if (next && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const utt = new SpeechSynthesisUtterance('Panduan suara aktif.');
                    utt.lang = 'id-ID';
                    window.speechSynthesis.speak(utt);
                }
            }
            return next;
        });
    }, []);

    const lastSpokenRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

    const speakGuidance = useCallback(
        (text: string, force = false) => {
            if (!isVoiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
            const now = Date.now();
            if (!force && lastSpokenRef.current.text === text && now - lastSpokenRef.current.time < 3500) {
                return;
            }
            lastSpokenRef.current = { text, time: now };
            try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'id-ID';
                utterance.rate = 1.05;
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                console.warn('Speech synthesis error:', e);
            }
        },
        [isVoiceEnabled],
    );

    /* MediaPipe Hook */
    const {
        isLoaded,
        isLoading,
        error: landmarkerError,
        hasFace,
        faceCount,
        landmarks,
        blendshapes,
        qualityScore,
        trackingConfidence,
        ear: geometricEar,
        mar: geometricMar,
        processFrame,
        resetSmoothing,
        landmarksRef,
    } = useFaceLandmarker({ active: !cameraError });

    /* Three.js Hook */
    useThreeFaceMesh({
        canvasRef,
        videoRef,
        landmarks,
        visualState,
        livenessStage,
        isMirrored: facingMode === 'user',
        reducedMotion: prefersReducedMotion,
        landmarksRef,
    });

    /* ---- Reduced Motion ---- */
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReducedMotion(mq.matches);
        const handler = (e: MediaQueryListEvent) =>
            setPrefersReducedMotion(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    /* ---- Camera Start ---- */
    const startCamera = useCallback(async (
        currentFacing: 'user' | 'environment' = facingMode,
        deviceId?: string | null
    ) => {
        try {
            setCameraError(null);
            resetSmoothing(); // Reset filter history on camera retry
            setVisualState('REQUESTING_CAMERA');
            setStatusMessage('Meminta akses kamera...');

            // Check if secure context / mediaDevices is supported
            if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const isSecure = typeof window !== 'undefined' && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                if (!isSecure) {
                    throw new Error('SECURE_CONTEXT_REQUIRED');
                }
                throw new Error('MEDIA_DEVICES_NOT_SUPPORTED');
            }

            // Stop any existing tracks first to avoid camera lock on Windows / mobile
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }

            // Build progressive constraints ladder
            const targetDeviceId = deviceId !== undefined ? deviceId : selectedDeviceId;
            const constraintsLadder: MediaStreamConstraints[] = [];

            if (targetDeviceId) {
                constraintsLadder.push(
                    {
                        video: {
                            deviceId: { exact: targetDeviceId },
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            frameRate: { ideal: 30 },
                        },
                        audio: false,
                    },
                    {
                        video: {
                            deviceId: { exact: targetDeviceId },
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                        },
                        audio: false,
                    },
                    {
                        video: { deviceId: { exact: targetDeviceId } },
                        audio: false,
                    }
                );
            }

            // 1. Primary: 1080p FHD with facingMode
            constraintsLadder.push({
                video: {
                    facingMode: currentFacing,
                    width: { ideal: 1920, min: 1280 },
                    height: { ideal: 1080, min: 720 },
                    frameRate: { ideal: 30 },
                },
                audio: false,
            });

            // 2. 720p HD with facingMode
            constraintsLadder.push({
                video: {
                    facingMode: currentFacing,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                },
                audio: false,
            });

            // 3. Any resolution with facingMode
            constraintsLadder.push({
                video: { facingMode: currentFacing },
                audio: false,
            });

            // 4. HD 720p without facingMode (for desktop / USB webcams on Windows)
            constraintsLadder.push({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                },
                audio: false,
            });

            // 5. Bare minimum fallback: any video stream available
            constraintsLadder.push({
                video: true,
                audio: false,
            });

            let mediaStream: MediaStream | null = null;
            let lastErr: unknown = null;

            for (let i = 0; i < constraintsLadder.length; i++) {
                try {
                    mediaStream = await navigator.mediaDevices.getUserMedia(constraintsLadder[i]);
                    if (mediaStream) break;
                } catch (tryErr) {
                    lastErr = tryErr;
                    console.warn(`Camera constraint attempt ${i + 1}/${constraintsLadder.length} failed:`, tryErr);
                }
            }

            if (!mediaStream) {
                throw lastErr || new Error('Tidak dapat memulai aliran video.');
            }

            streamRef.current = mediaStream;

            // Enumerate video devices for camera switching
            try {
                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
                setAvailableDevices(videoDevices);
            } catch (_enumErr) {
                // Ignore enumeration failure
            }

            // Track active stream resolution
            const videoTrack = mediaStream.getVideoTracks()[0];
            if (videoTrack) {
                const settings = videoTrack.getSettings();
                if (settings.deviceId && !selectedDeviceId) {
                    setSelectedDeviceId(settings.deviceId);
                }
                if (settings.width && settings.height) {
                    setStreamResolution({
                        width: settings.width,
                        height: settings.height,
                    });
                }
            }

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play().catch((playErr) => {
                    console.warn('video.play() was deferred:', playErr);
                });
                onVideoRefReady?.(videoRef.current);
            }

            setVisualState('SEARCHING_FACE');
            setStatusMessage('Posisikan wajah di tengah kamera.');
        } catch (err: unknown) {
            console.error('Camera access failed:', err);
            let msg = 'Gagal mengakses kamera. Pastikan izin kamera diberikan pada browser.';

            if (err instanceof Error && err.message === 'SECURE_CONTEXT_REQUIRED') {
                msg = 'Akses kamera diblokir browser karena koneksi tidak aman (HTTP). Silakan buka sistem melalui http://localhost:8000 atau protokol HTTPS.';
            } else if (err instanceof Error && err.message === 'MEDIA_DEVICES_NOT_SUPPORTED') {
                msg = 'Browser Anda tidak mendukung WebRTC Camera API. Harap gunakan Chrome, Edge, Firefox, atau Safari modern.';
            } else if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
                if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    msg = 'Kamera sedang digunakan aplikasi lain (misal script Python OpenCV atau Windows Camera). Tutup aplikasi tersebut lalu klik Ulangi.';
                } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    msg = 'Izin akses kamera ditolak. Harap izinkan akses kamera pada ikon gembok di bilah alamat browser.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    msg = 'Perangkat kamera tidak ditemukan. Pastikan webcam terhubung dengan benar ke komputer.';
                } else if (err.name === 'OverconstrainedError') {
                    msg = 'Kamera tidak mendukung konfigurasi resolusi/facingMode yang diminta.';
                } else {
                    msg = `Kamera gagal diakses (${err.name}): ${err.message}`;
                }
            }
            setCameraError(msg);
            setStatusMessage(msg);
            setVisualState('FAILED');
        }
    }, [resetSmoothing, facingMode, selectedDeviceId, onVideoRefReady]);

    /* Toggle Front / Back Camera or Cycle through Devices */
    const toggleCameraFacing = useCallback(() => {
        if (availableDevices.length > 1) {
            const currentIndex = availableDevices.findIndex((d) => d.deviceId === selectedDeviceId);
            const nextIndex = (currentIndex + 1) % availableDevices.length;
            const nextDevice = availableDevices[nextIndex];
            setSelectedDeviceId(nextDevice.deviceId);
            startCamera(facingMode, nextDevice.deviceId);
        } else {
            const nextFacing = facingMode === 'user' ? 'environment' : 'user';
            setFacingMode(nextFacing);
            startCamera(nextFacing);
        }
    }, [availableDevices, selectedDeviceId, facingMode, startCamera]);

    /* ---- Camera Lifecycle ---- */
    // Start camera immediately on mount (do not block on ML model loading)
    useEffect(() => {
        startCamera(facingMode);
    }, [startCamera]);

    // Update message/state based on model status without disabling camera preview
    useEffect(() => {
        if (isLoading && visualState === 'INITIALIZING') {
            setStatusMessage('Memuat model face scanner...');
        } else if (landmarkerError) {
            console.warn('FaceLandmarker non-blocking warning:', landmarkerError);
            if (cameraError) {
                setStatusMessage(`Error: ${landmarkerError}`);
            }
        }
    }, [isLoading, landmarkerError, cameraError, visualState]);

    // Ensure stream is attached if videoRef mounts after startCamera completes
    useEffect(() => {
        if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
            onVideoRefReady?.(videoRef.current);
        }
    });

    /* ---- Cleanup on Unmount ---- */
    useEffect(() => {
        const currentVideo = videoRef.current;
        return () => {
            // Stop all camera tracks
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            // Abort pending backend request
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
            // Stop recording
            if (mediaRecorderRef.current?.state === 'recording') {
                try {
                    mediaRecorderRef.current.stop();
                } catch (_) {
                    /* ignore */
                }
            }
            // Cancel frame callback
            if (frameCallbackIdRef.current !== null && currentVideo) {
                const videoWithCallback = currentVideo as unknown as {
                    cancelVideoFrameCallback?: (id: number) => void;
                };
                if (
                    typeof videoWithCallback.cancelVideoFrameCallback ===
                    'function'
                ) {
                    videoWithCallback.cancelVideoFrameCallback(
                        frameCallbackIdRef.current,
                    );
                } else {
                    cancelAnimationFrame(frameCallbackIdRef.current);
                }
            }
        };
    }, []);

    /* ---- Tab Visibility ---- */
    useEffect(() => {
        const handler = () => {
            if (document.hidden) {
                videoRef.current?.pause();
            } else if (streamRef.current) {
                videoRef.current?.play().catch(() => {});
            }
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    /* State for Countdown & 8s Scan */
    const [countdownNum, setCountdownNum] = useState<number | null>(null);
    const [scanProgressPct, setScanProgressPct] = useState<number>(0);
    const [scanElapsedSec, setScanElapsedSec] = useState<number>(0);
    const [isDistanceIdeal, setIsDistanceIdeal] = useState<boolean>(false);
    const [earBlinksCount, setEarBlinksCount] = useState<number>(0);
    const [marMouthsCount, setMarMouthsCount] = useState<number>(0);
    const [faceDetectedPct, setFaceDetectedPct] = useState<number>(100);

    /* Challenge-Response EMAR Aktif State */
    const [activeChallenge, setActiveChallenge] = useState<ActiveChallengeType | null>(null);
    const [activeChallengeStatus, setActiveChallengeStatus] = useState<ActiveChallengeStatus>('WAITING_FOR_ACTION');
    const activeChallengeRef = useRef<ActiveChallengeType | null>(null);
    const activeChallengeStatusRef = useRef<ActiveChallengeStatus>('WAITING_FOR_ACTION');
    const challengeStartTimeRef = useRef<number | null>(null);
    const challengeTrackerRef = useRef<ChallengeTracker | null>(null);

    /* Refs for accumulation */
    const blinkCycleRef = useRef(new CycleCounter());
    const mouthCycleRef = useRef(new CycleCounter());
    const blinksCountRef = useRef<number>(0);
    const mouthsCountRef = useRef<number>(0);
    const detectedFramesRef = useRef<number>(0);
    const totalFramesRef = useRef<number>(0);
    const minEarRef = useRef<number>(0.30);
    const maxMarRef = useRef<number>(0.05);
    const scanTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pausedRef = useRef(paused);

    /* ---- EAR / MAR Metrics & 8s Frame Accumulator ---- */
    useEffect(() => {
        if (!hasFace) return;
        // EAR/MAR geometris dari landmark (rumus Bab II), bukan skor blendshape.
        if (geometricEar === null || geometricMar === null) return;
        const ear = geometricEar;
        const mar = geometricMar;

        onMetricsUpdate?.({
            ear: parseFloat(ear.toFixed(3)),
            mar: parseFloat(mar.toFixed(3)),
            quality: parseFloat(qualityScore.toFixed(2)),
        });

        // Track live counters during 8-second scan
        if (livenessStage === 'SCANNING_8S') {
            totalFramesRef.current++;
            detectedFramesRef.current++;

            // Accumulate min EAR (deepest blink) and max MAR (widest mouth open)
            if (ear < minEarRef.current) minEarRef.current = ear;
            if (mar > maxMarRef.current) maxMarRef.current = mar;

            // Siklus penuh kedip (EAR < 0,20) dan buka-tutup mulut (MAR >= 0,10), Tabel 5.2
            if (blinkCycleRef.current.update(ear < EAR_BLINK_THRESHOLD)) {
                blinksCountRef.current = blinkCycleRef.current.count;
                setEarBlinksCount(blinksCountRef.current);
            }
            if (mouthCycleRef.current.update(mar >= MAR_OPEN_THRESHOLD)) {
                mouthsCountRef.current = mouthCycleRef.current.count;
                setMarMouthsCount(mouthsCountRef.current);
            }

            // Evaluasi respons terhadap tantangan acak (EMAR aktif)
            const tracker = challengeTrackerRef.current;
            if (tracker && activeChallengeStatusRef.current === 'WAITING_FOR_ACTION') {
                const verdict = tracker.update(ear, mar, performance.now() / 1000);
                if (verdict !== 'WAITING_FOR_ACTION') {
                    activeChallengeStatusRef.current = verdict;
                    setActiveChallengeStatus(verdict);
                    if (verdict === 'PASS_LIVENESS') {
                        const msg = tracker.challenge === 'BLINK'
                            ? 'Tantangan kedip valid (Bona Fide) ✓'
                            : 'Tantangan buka mulut valid (Bona Fide) ✓';
                        setStatusMessage(msg);
                        speakGuidance(tracker.challenge === 'BLINK'
                            ? 'Bagus, kedipan mata valid!'
                            : 'Bagus, gerakan mulut valid!');
                    } else if (verdict === 'REJECT_WRONG_ACTION') {
                        setStatusMessage('Aksi salah terdeteksi! Diminta kedip tetapi mulut terus terbuka.');
                        speakGuidance('Aksi salah terdeteksi.');
                    } else {
                        setStatusMessage('Waktu respons habis (> 4 detik). Akses ditolak.');
                        speakGuidance('Waktu respons habis.');
                    }
                }
            }

            // Distance indicator fallback if live sensor not yet estimating
            if (liveDistanceCm === null) {
                setIsDistanceIdeal(qualityScore >= 0.35);
            }
        }
    }, [geometricEar, geometricMar, hasFace, qualityScore, livenessStage, onMetricsUpdate, liveDistanceCm, speakGuidance]);

    /* ---- Live Metric Distance Sensor & Human Face ROI for Photometry ---- */
    useEffect(() => {
        if (!hasFace || !landmarks || landmarks.length === 0) {
            setLiveDistanceCm(null);
            distanceSmootherRef.current.reset();
            onFaceROIUpdate?.({
                xMin: 0.32,
                yMin: 0.20,
                xMax: 0.68,
                yMax: 0.75,
                isDetected: false,
            });
            return;
        }

        // 1. Live Distance Sensor via Facial Geometry
        const rawDist = estimateFaceDistance(landmarks);
        if (rawDist !== null) {
            const smoothed = distanceSmootherRef.current.update(rawDist);
            if (smoothed !== null) {
                setLiveDistanceCm(smoothed);
                const cat = getDistanceCategory(smoothed);
                const valid = cat.isValidDistance || cat.isIdeal;
                setIsDistanceIdeal(valid);
                onDistanceUpdate?.(smoothed, valid, cat.label);
            }
        }

        // 2. Ekstraksi Bounding Box Objek Manusia untuk Fotometri Cahaya Ruangan
        let minX = 1;
        let maxX = 0;
        let minY = 1;
        let maxY = 0;
        for (let i = 0; i < landmarks.length; i++) {
            const pt = landmarks[i];
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }

        onFaceROIUpdate?.({
            xMin: Math.max(0, minX),
            yMin: Math.max(0, minY),
            xMax: Math.min(1, maxX),
            yMax: Math.min(1, maxY),
            isDetected: true,
        });
    }, [landmarks, hasFace, onDistanceUpdate, onFaceROIUpdate]);

    /* ---- Verification Result Handling ---- */
    useEffect(() => {
        if (verificationResult === 'success') {
            setVisualState('SUCCESS');
            setStatusMessage('Verifikasi berhasil. Presensi tercatat.');
            speakGuidance('Verifikasi berhasil! Presensi Anda tercatat.', true);
        } else if (verificationResult === 'failed') {
            setVisualState('FAILED');
            setStatusMessage('Verifikasi belum berhasil, silakan ulangi.');
            speakGuidance('Verifikasi belum berhasil, silakan ulangi sesi.', true);
        }
    }, [verificationResult, speakGuidance]);

    /* ---- 8-Second Scan & Video Recorder Execution ---- */
    const start8SecondScan = useCallback(() => {
        const stream = streamRef.current;
        if (!stream || mediaRecorderRef.current?.state === 'recording') return;

        try {
            // Reset counters
            blinksCountRef.current = 0;
            mouthsCountRef.current = 0;
            detectedFramesRef.current = 0;
            totalFramesRef.current = 0;
            minEarRef.current = 0.30;
            maxMarRef.current = 0.05;
            blinkCycleRef.current.reset();
            mouthCycleRef.current.reset();
            setEarBlinksCount(0);
            setMarMouthsCount(0);
            setScanProgressPct(0);
            setScanElapsedSec(0);

            // Reset Challenge-Response EMAR Aktif State
            activeChallengeRef.current = null;
            activeChallengeStatusRef.current = 'WAITING_FOR_ACTION';
            challengeStartTimeRef.current = null;
            challengeTrackerRef.current = null;
            setActiveChallenge(null);
            setActiveChallengeStatus('WAITING_FOR_ACTION');

            setLivenessStage('SCANNING_8S');
            setVisualState('CAPTURING');
            setStatusMessage('Fase 1: Deteksi Awal Wajah & Menyiapkan Tantangan...');
            speakGuidance('Mulai pemindaian. Hadapkan wajah ke kamera.', true);

            chunksRef.current = [];
            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm',
            });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data?.size > 0) chunksRef.current.push(e.data);
            };

            const startTime = performance.now();

            // Progress bar interval
            if (scanTimerIntervalRef.current) clearInterval(scanTimerIntervalRef.current);
            scanTimerIntervalRef.current = setInterval(() => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(100, (elapsed / SCAN_DURATION_MS) * 100);
                const elapsedSec = Math.min(8.0, elapsed / 1000);
                setScanProgressPct(progress);
                setScanElapsedSec(parseFloat(elapsedSec.toFixed(1)));

                // Fase 2: Trigger Random Challenge at T >= 1.0s
                if (elapsedSec >= 1.0 && !activeChallengeRef.current) {
                    const ch: ActiveChallengeType = Math.random() < 0.5 ? 'BLINK' : 'OPEN_MOUTH';
                    activeChallengeRef.current = ch;
                    setActiveChallenge(ch);
                    activeChallengeStatusRef.current = 'WAITING_FOR_ACTION';
                    setActiveChallengeStatus('WAITING_FOR_ACTION');
                    challengeStartTimeRef.current = performance.now();
                    challengeTrackerRef.current = new ChallengeTracker(ch, performance.now() / 1000);

                    if (ch === 'BLINK') {
                        setStatusMessage('INSTRUKSI: KEDIPKAN MATA ANDA SEKARANG!');
                        speakGuidance('Instruksi: Kedipkan mata Anda sekarang!', true);
                    } else {
                        setStatusMessage('INSTRUKSI: BUKA MULUT ANDA SEKARANG!');
                        speakGuidance('Instruksi: Buka mulut Anda sekarang!', true);
                    }
                }
            }, 50);

            recorder.onstop = () => {
                if (scanTimerIntervalRef.current) {
                    clearInterval(scanTimerIntervalRef.current);
                    scanTimerIntervalRef.current = null;
                }
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                const facePct = totalFramesRef.current > 0
                    ? parseFloat(((detectedFramesRef.current / totalFramesRef.current) * 100).toFixed(1))
                    : 100.0;
                setFaceDetectedPct(facePct);

                setLivenessStage('COMPLETED');
                setVisualState('VERIFYING_IDENTITY');
                setStatusMessage('Menganalisis vektor biometrik FaceNet & liveness EMAR...');
                speakGuidance('Menganalisis biometrik wajah...');

                const finalStatus =
                    activeChallengeStatusRef.current === 'WAITING_FOR_ACTION'
                        ? 'REJECT_TIMEOUT'
                        : activeChallengeStatusRef.current;

                onVerificationSubmit(blob, {
                    earBlinks: blinksCountRef.current,
                    marMouths: mouthsCountRef.current,
                    facePct,
                    durationS: 8.0,
                    earVal: parseFloat(minEarRef.current.toFixed(3)),
                    marVal: parseFloat(maxMarRef.current.toFixed(3)),
                    activeChallenge: activeChallengeRef.current || 'BLINK',
                    challengeStatus: finalStatus,
                });
            };

            recorder.start();

            // Stop recording after exactly 8 seconds (8000 ms)
            setTimeout(() => {
                if (recorder.state === 'recording') recorder.stop();
            }, SCAN_DURATION_MS);

        } catch (err) {
            console.error('8-second scan recording failed:', err);
            setVisualState('FAILED');
            setStatusMessage('Gagal memulai perekaman scanner.');
        }
    }, [onVerificationSubmit, speakGuidance]);

    /* ---- 3-Second Pre-Scan Countdown ---- */
    const startCountdown = useCallback(() => {
        setLivenessStage('COUNTDOWN');
        setCountdownNum(COUNTDOWN_TOTAL_SEC);
        setStatusMessage('Bersiap: Memulai pemindaian dalam 3 detik...');
        speakGuidance('Wajah terdeteksi. Bersiap dalam tiga detik...', true);

        let currentCount = COUNTDOWN_TOTAL_SEC;
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

        countdownTimerRef.current = setInterval(() => {
            currentCount--;
            if (currentCount > 0) {
                setCountdownNum(currentCount);
                setStatusMessage(`Bersiap: ${currentCount}...`);
            } else {
                if (countdownTimerRef.current) {
                    clearInterval(countdownTimerRef.current);
                    countdownTimerRef.current = null;
                }
                setCountdownNum(null);
                if (pausedRef.current) {
                    setLivenessStage('NONE');
                    return;
                }
                start8SecondScan();
            }
        }, 1000);
    }, [start8SecondScan]);

    /* ---- State Machine Controller ---- */
    useEffect(() => {
        // Don't override terminal or active scanning states
        if (isVerifying) {
            setVisualState('VERIFYING_IDENTITY');
            setStatusMessage('Memeriksa identitas biometrik...');
            return;
        }
        if (verificationResult === 'success' || verificationResult === 'failed') return;
        if (visualState === 'INITIALIZING' || visualState === 'REQUESTING_CAMERA') return;
        if (livenessStage === 'COUNTDOWN' || livenessStage === 'SCANNING_8S' || livenessStage === 'COMPLETED') return;

        if (paused) {
            qualityStartRef.current = null;
            setVisualState('SEARCHING_FACE');
            setStatusMessage('Pemindaian presensi dijeda selama pendaftaran wajah.');
            return;
        }

        const now = performance.now();

        /* Evaluate Quality Gate & Anatomical Guidance */
        const gate = evaluateQualityGate(
            hasFace,
            faceCount,
            landmarks,
            qualityScore,
            trackingConfidence,
        );

        if (!gate.isReady) {
            qualityStartRef.current = null;
            if (gate.state === 'SEARCHING' || gate.state === 'MULTIPLE_FACES') {
                setVisualState('SEARCHING_FACE');
            } else {
                setVisualState('ALIGNING_FACE');
            }
            setStatusMessage(gate.message);
            return;
        }

        /* Quality check hold -> Start 3-second countdown */
        if (livenessStage === 'NONE') {
            if (qualityStartRef.current === null) {
                qualityStartRef.current = now;
                setVisualState('CHECKING_QUALITY');
                setStatusMessage('Memeriksa posisi wajah & jarak (30 / 45 / 60 cm)...');
                return;
            }
            if (now - qualityStartRef.current < QUALITY_HOLD_MS) {
                setVisualState('CHECKING_QUALITY');
                return;
            }
            // Quality hold passed -> start 3s countdown!
            startCountdown();
        }
    }, [
        hasFace,
        faceCount,
        qualityScore,
        trackingConfidence,
        landmarks,
        isVerifying,
        verificationResult,
        livenessStage,
        visualState,
        startCountdown,
        paused,
    ]);

    /* ---- Frame Processing Loop ---- */
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isLoaded) return;

        const videoWithCallback = video as unknown as {
            requestVideoFrameCallback?: (
                cb: (now: DOMHighResTimeStamp) => void,
            ) => number;
            cancelVideoFrameCallback?: (id: number) => void;
        };

        const onFrame = (now: DOMHighResTimeStamp) => {
            if (video.readyState >= 2) {
                processFrame(video, now);
            }
            if (
                typeof videoWithCallback.requestVideoFrameCallback ===
                'function'
            ) {
                frameCallbackIdRef.current =
                    videoWithCallback.requestVideoFrameCallback(onFrame);
            } else {
                frameCallbackIdRef.current = requestAnimationFrame(onFrame);
            }
        };

        if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
            frameCallbackIdRef.current =
                videoWithCallback.requestVideoFrameCallback(onFrame);
        } else {
            frameCallbackIdRef.current = requestAnimationFrame(onFrame);
        }

        return () => {
            if (frameCallbackIdRef.current !== null) {
                if (
                    typeof videoWithCallback.cancelVideoFrameCallback ===
                    'function'
                ) {
                    videoWithCallback.cancelVideoFrameCallback(
                        frameCallbackIdRef.current,
                    );
                } else {
                    cancelAnimationFrame(frameCallbackIdRef.current);
                }
                frameCallbackIdRef.current = null;
            }
        };
    }, [processFrame, isLoaded]);

    /* ---- Reset Scanner Session Thoroughly ---- */
    const handleReset = useCallback(() => {
        // 1. Clear any active countdown timers
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
        // 2. Clear any active 8-second scan intervals
        if (scanTimerIntervalRef.current) {
            clearInterval(scanTimerIntervalRef.current);
            scanTimerIntervalRef.current = null;
        }
        // 3. Stop recorder if still running
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            try {
                mediaRecorderRef.current.stop();
            } catch (_) {
                /* ignore */
            }
        }
        chunksRef.current = [];

        // 4. Reset metric accumulation refs & states
        blinksCountRef.current = 0;
        mouthsCountRef.current = 0;
        detectedFramesRef.current = 0;
        totalFramesRef.current = 0;
        blinkCycleRef.current.reset();
        mouthCycleRef.current.reset();

        setEarBlinksCount(0);
        setMarMouthsCount(0);
        setFaceDetectedPct(100);
        setScanProgressPct(0);
        setScanElapsedSec(0);
        setCountdownNum(null);

        // Reset Challenge-Response EMAR Aktif State
        activeChallengeRef.current = null;
        activeChallengeStatusRef.current = 'WAITING_FOR_ACTION';
        challengeStartTimeRef.current = null;
        challengeTrackerRef.current = null;
        setActiveChallenge(null);
        setActiveChallengeStatus('WAITING_FOR_ACTION');

        // 5. Reset quality gates and state machine
        qualityStartRef.current = null;
        challengeStartRef.current = null;
        setLivenessStage('NONE');
        resetSmoothing();

        // 6. Reset visual state and messages
        if (cameraError) {
            startCamera();
        } else {
            setVisualState('SEARCHING_FACE');
            setStatusMessage('Posisikan wajah di tengah kamera.');
        }
    }, [resetSmoothing, cameraError, startCamera]);

    /* Watch resetKey prop from parent for instant full reset */
    useEffect(() => {
        if (resetKey !== undefined && resetKey > 0) {
            handleReset();
        }
    }, [resetKey, handleReset]);

    /* Jeda dari induk: batalkan hitung mundur dan buang rekaman yang sedang berjalan */
    useEffect(() => {
        pausedRef.current = paused;
        if (!paused) return;
        const recorder = mediaRecorderRef.current;
        const isRecording = recorder?.state === 'recording';
        if (countdownTimerRef.current === null && !isRecording) return;
        // handleReset menghentikan recorder; tanpa ini onstop tetap mengirim
        // potongan video sebagai presensi.
        if (recorder && isRecording) recorder.onstop = null;
        handleReset();
    }, [paused, handleReset]);

    /* Watch verificationResult transitions to null while idle */
    const prevVerifResultRef = useRef(verificationResult);
    useEffect(() => {
        if (prevVerifResultRef.current !== null && verificationResult === null && !isVerifying) {
            handleReset();
        }
        prevVerifResultRef.current = verificationResult;
    }, [verificationResult, isVerifying, handleReset]);

    /* ---- Status Icon ---- */
    const StatusIcon = () => {
        switch (visualState) {
            case 'INITIALIZING':
                return (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                );
            case 'REQUESTING_CAMERA':
                return (
                    <Camera className="h-4 w-4 animate-pulse text-cyan-400" />
                );
            case 'SEARCHING_FACE':
                return <Search className="h-4 w-4 text-slate-400" />;
            case 'ALIGNING_FACE':
                return <Move className="h-4 w-4 text-amber-400" />;
            case 'CHECKING_QUALITY':
                return <ShieldCheck className="h-4 w-4 text-amber-400" />;
            case 'LIVENESS_CHALLENGE':
            case 'CAPTURING':
                return (
                    <Video className="h-4 w-4 animate-pulse text-sky-400" />
                );
            case 'VERIFYING_IDENTITY':
                return (
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
                );
            case 'SUCCESS':
                return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
            case 'FAILED':
                return <XCircle className="h-4 w-4 text-rose-400" />;
            default:
                return <Camera className="h-4 w-4 text-cyan-400" />;
        }
    };

    /* ---- Oval Guide Color & Responsive Radii ---- */
    const ovalColor =
        visualState === 'SUCCESS'
            ? '#10b981'
            : visualState === 'FAILED'
              ? '#ef4444'
              : livenessStage === 'SCANNING_8S'
                ? isDistanceIdeal
                    ? '#10b981' // Vibrant Emerald Green on Ideal 30cm Distance
                    : '#f59e0b' // Amber when adjusting
                : livenessStage === 'COUNTDOWN'
                  ? '#38bdf8' // Sky Blue during countdown
                  : visualState === 'VERIFYING_IDENTITY' || visualState === 'CAPTURING'
                    ? '#3b82f6'
                    : visualState === 'CHECKING_QUALITY'
                      ? '#06b6d4'
                      : hasFace
                        ? '#06b6d4'
                        : '#6b7280';

    /* Responsive Oval Radii: For 16:9 widescreen (1080p) vs 3:4 portrait mobile */
    const guideRx = isMobile ? 32 : 17;
    const guideRy = isMobile ? 31 : 37;

    /* ---- Render ---- */
    return (
        <div className="flex w-full flex-col items-center">
            {/* Scanner Container: 16:9 Full HD 1080p on desktop/tablet */}
            <div
                className="relative aspect-[3/4] sm:aspect-[16/9] min-h-[320px] sm:min-h-[380px] md:min-h-[420px] max-h-[56vh] sm:max-h-[68vh] md:max-h-[72vh] lg:max-h-[76vh] w-full overflow-hidden rounded-3xl border border-cyan-500/30 bg-slate-950 shadow-2xl shadow-cyan-950/40 ring-1 ring-cyan-500/20"
                role="img"
                aria-label="Area Scanner Wajah 3D 1080p"
            >
                {/* Layer 0: Video */}
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    onLoadedMetadata={() => {
                        resetSmoothing();
                        if (videoRef.current) {
                            const w = videoRef.current.videoWidth;
                            const h = videoRef.current.videoHeight;
                            if (w > 0 && h > 0) {
                                setStreamResolution({ width: w, height: h });
                            }
                        }
                    }}
                    className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />

                {/* Layer 1: WebGL Canvas (Native 1080p Full HD Buffer) */}
                <canvas
                    ref={canvasRef}
                    width={1920}
                    height={1080}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{ zIndex: 10 }}
                />

                {/* Layer 2: Transparent Safe Zone Ring Guide (Smooth Apple FaceID Reticle) */}
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ zIndex: 20 }}
                >
                    <svg
                        className="h-full w-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                    >
                        <defs>
                            <mask id="face-guide-mask">
                                <rect width="100" height="100" fill="white" />
                                <ellipse
                                    cx="50"
                                    cy="48"
                                    rx={guideRx}
                                    ry={guideRy}
                                    fill="black"
                                />
                            </mask>
                            {/* Ambient Glow Filter */}
                            <filter id="reticle-glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="0.6" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* Darkened Vignette Overlay Outside Oval */}
                        <rect
                            width="100"
                            height="100"
                            fill="rgba(2, 6, 23, 0.40)"
                            mask="url(#face-guide-mask)"
                        />

                        {/* Subtle Outer Glow Ring */}
                        <ellipse
                            cx="50"
                            cy="48"
                            rx={guideRx}
                            ry={guideRy}
                            fill="none"
                            stroke={ovalColor}
                            strokeWidth="1.6"
                            opacity="0.3"
                            filter="url(#reticle-glow)"
                        />

                        {/* Sharp Clean Reticle Ring */}
                        <ellipse
                            cx="50"
                            cy="48"
                            rx={guideRx}
                            ry={guideRy}
                            fill="none"
                            stroke={ovalColor}
                            strokeWidth={livenessStage === 'SCANNING_8S' && isDistanceIdeal ? '1.4' : '0.9'}
                            opacity={hasFace ? 0.95 : 0.6}
                            style={{
                                transition: 'stroke 0.3s ease, stroke-width 0.3s ease, rx 0.3s ease, ry 0.3s ease, opacity 0.3s ease',
                            }}
                        />

                        {/* Cardinal Reticle Alignment Notches */}
                        <line
                            x1="50"
                            y1={48 - guideRy - 1.8}
                            x2="50"
                            y2={48 - guideRy + 1.8}
                            stroke={ovalColor}
                            strokeWidth="0.8"
                            opacity="0.75"
                        />
                        <line
                            x1="50"
                            y1={48 + guideRy - 1.8}
                            x2="50"
                            y2={48 + guideRy + 1.8}
                            stroke={ovalColor}
                            strokeWidth="0.8"
                            opacity="0.75"
                        />
                        <line
                            x1={50 - guideRx - 1.8}
                            y1="48"
                            x2={50 - guideRx + 1.8}
                            y2="48"
                            stroke={ovalColor}
                            strokeWidth="0.8"
                            opacity="0.75"
                        />
                        <line
                            x1={50 + guideRx - 1.8}
                            y1="48"
                            x2={50 + guideRx + 1.8}
                            y2="48"
                            stroke={ovalColor}
                            strokeWidth="0.8"
                            opacity="0.75"
                        />
                    </svg>

                    {/* Viewfinder Scanning Guide Line (Active during 8s scan) */}
                    {livenessStage === 'SCANNING_8S' && (
                        <div className="pointer-events-none absolute inset-x-6 sm:inset-x-8 top-1/4 bottom-1/4 overflow-hidden">
                            <div className="relative h-full w-full">
                                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-laser-sweep" />
                            </div>
                        </div>
                    )}

                    {/* Viewfinder Corner Framing Brackets */}
                    <div
                        className="absolute left-3 sm:left-5 top-3 sm:top-5 h-5 w-5 sm:h-6 sm:w-6 border-l-2 border-t-2 rounded-tl-lg transition-all duration-300"
                        style={{ borderColor: ovalColor, opacity: hasFace ? 0.9 : 0.45 }}
                    />
                    <div
                        className="absolute right-3 sm:right-5 top-3 sm:top-5 h-5 w-5 sm:h-6 sm:w-6 border-r-2 border-t-2 rounded-tr-lg transition-all duration-300"
                        style={{ borderColor: ovalColor, opacity: hasFace ? 0.9 : 0.45 }}
                    />
                    <div
                        className="absolute bottom-16 sm:bottom-20 left-3 sm:left-5 h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-l-2 rounded-bl-lg transition-all duration-300"
                        style={{ borderColor: ovalColor, opacity: hasFace ? 0.9 : 0.45 }}
                    />
                    <div
                        className="absolute bottom-16 sm:bottom-20 right-3 sm:right-5 h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-r-2 rounded-br-lg transition-all duration-300"
                        style={{ borderColor: ovalColor, opacity: hasFace ? 0.9 : 0.45 }}
                    />
                </div>

                {/* Layer 3: Streamlined HUD Header Strip (No Redundant Duplicate Badges) */}
                <div
                    className="pointer-events-none absolute left-2.5 sm:left-4 right-2.5 sm:right-4 top-2.5 sm:top-3.5 flex items-center justify-between gap-2"
                    style={{ zIndex: 30 }}
                >
                    {/* Left Badges: Subject ID & Resolution */}
                    <div className="flex items-center gap-1.5 min-w-0">
                        {/* Subject Badge */}
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/35 bg-slate-900/85 px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-sky-200 shadow-sm backdrop-blur-md">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping"></span>
                            <span className="font-mono">{scenarioParams?.subject_id || 'S01'}</span>
                        </span>

                        {/* 1080p FHD Badge */}
                        <span
                            className="inline-flex items-center gap-1 rounded-full border border-cyan-400/35 bg-slate-900/85 px-2.5 py-1 text-[10px] sm:text-[11px] font-mono font-bold text-cyan-300 shadow-sm backdrop-blur-md"
                            title={
                                streamResolution
                                    ? `Resolusi Kamera: ${streamResolution.width}×${streamResolution.height} px`
                                    : 'Resolusi Kamera: 1080p Full HD (1920×1080)'
                            }
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                            <span>
                                {streamResolution
                                    ? streamResolution.height >= 1080
                                        ? '1080p FHD'
                                        : `${streamResolution.height}p`
                                    : '1080p FHD'}
                            </span>
                        </span>

                        {/* Session Type Pill (Desktop) */}
                        <span className="hidden md:inline-flex items-center rounded-full bg-royal-blue/20 border border-royal-blue/40 px-2 py-0.5 text-[10px] font-bold text-sky-300 backdrop-blur-md uppercase">
                            {scenarioParams?.session_type === 'ENROLLMENT' ? 'Session-E' : 'Session-T'}
                        </span>
                    </div>

                    {/* Right Controls: Single Consolidated Distance + Lux + Voice + Switch */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Single Unified Distance Pill (No Duplicates) */}
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-bold shadow-sm backdrop-blur-md transition-all duration-300 ${
                                isDistanceIdeal
                                    ? 'border-emerald-400/50 bg-emerald-950/85 text-emerald-300 ring-1 ring-emerald-400/20'
                                    : 'border-amber-400/40 bg-amber-950/80 text-amber-300'
                            }`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${isDistanceIdeal ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                            <span className="hidden xs:inline">
                                {liveDistanceCm != null
                                    ? `${Math.round(liveDistanceCm)} cm • ${getDistanceCategory(liveDistanceCm).label}`
                                    : (isDistanceIdeal ? '30 - 60 cm • Sesuai' : 'Sesuaikan Jarak (30 - 60 cm)')}
                            </span>
                            <span className="xs:hidden">
                                {liveDistanceCm != null ? `${Math.round(liveDistanceCm)}cm` : (isDistanceIdeal ? 'Siap ✓' : '~30-60cm')}
                            </span>
                        </span>

                        {/* Single Luxmeter Pill */}
                        {scenarioParams?.lux != null && (
                            <span
                                className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur-md transition-all ${
                                    scenarioParams.lux < 100
                                        ? 'border-amber-400/40 bg-amber-950/80 text-amber-300'
                                        : scenarioParams.lux <= 300
                                          ? 'border-emerald-400/50 bg-emerald-950/85 text-emerald-300'
                                          : 'border-sky-400/40 bg-sky-950/80 text-sky-300'
                                }`}
                                title={`Intensitas Cahaya: ${Math.round(scenarioParams.lux)} Lux`}
                            >
                                <Sun className="h-3 w-3 text-amber-400 shrink-0" />
                                <span className="font-mono">{Math.round(scenarioParams.lux)} Lux</span>
                            </span>
                        )}

                        {/* Audio Voice Guidance Toggle */}
                        <button
                            type="button"
                            onClick={toggleVoice}
                            className={`pointer-events-auto flex h-8 w-8 sm:h-8.5 sm:w-8.5 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition active:scale-95 cursor-pointer touch-manipulation ${
                                isVoiceEnabled
                                    ? 'border-sky-400/60 bg-sky-500/25 text-sky-300 shadow-sky-500/20 ring-1 ring-sky-400/30'
                                    : 'border-slate-700/60 bg-slate-900/80 text-slate-400 hover:text-slate-200'
                            }`}
                            title={isVoiceEnabled ? 'Nonaktifkan Panduan Suara' : 'Aktifkan Panduan Suara (Indonesia)'}
                            aria-label="Toggle Panduan Suara"
                        >
                            {isVoiceEnabled ? (
                                <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-400 animate-pulse" />
                            ) : (
                                <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            )}
                        </button>

                        {/* Flip Camera (Front / Back) Toggle */}
                        <button
                            type="button"
                            onClick={toggleCameraFacing}
                            className="pointer-events-auto flex h-8 w-8 sm:h-8.5 sm:w-8.5 items-center justify-center rounded-full border border-slate-700/60 bg-slate-900/80 text-slate-300 shadow-sm backdrop-blur-md hover:text-white hover:border-slate-500 transition active:scale-95 cursor-pointer touch-manipulation"
                            title={
                                availableDevices.length > 1
                                    ? `Ganti Kamera (${availableDevices.length} perangkat terdeteksi)`
                                    : `Ganti Kamera (${facingMode === 'user' ? 'Kamera Belakang' : 'Kamera Depan'})`
                            }
                            aria-label="Ganti Kamera"
                        >
                            <SwitchCamera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                    </div>
                </div>

                {/* Layer 3: High-End 3-Second Circular Countdown Ring */}
                <AnimatePresence>
                    {livenessStage === 'COUNTDOWN' && countdownNum !== null && (
                        <motion.div
                            key={countdownNum}
                            initial={{ opacity: 0, scale: 0.7 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.4 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                            style={{ zIndex: 40 }}
                        >
                            <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center">
                                {/* SVG Countdown Ring */}
                                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="none"
                                        stroke="rgba(14, 165, 233, 0.2)"
                                        strokeWidth="6"
                                    />
                                    <motion.circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="none"
                                        stroke="#38bdf8"
                                        strokeWidth="6"
                                        strokeLinecap="round"
                                        strokeDasharray="264"
                                        initial={{ strokeDashoffset: 0 }}
                                        animate={{ strokeDashoffset: (3 - countdownNum) * (264 / 3) }}
                                        transition={{ duration: 0.9, ease: 'easeInOut' }}
                                        style={{ filter: 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.8))' }}
                                    />
                                </svg>

                                <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-slate-950/90 text-5xl sm:text-6xl font-black text-sky-300 shadow-2xl backdrop-blur-xl">
                                    <motion.span
                                        key={countdownNum}
                                        initial={{ scale: 0.6, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 1.3, opacity: 0 }}
                                        transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                                    >
                                        {countdownNum}
                                    </motion.span>
                                </div>
                            </div>
                            <span className="mt-3 sm:mt-4 rounded-full bg-slate-900/90 px-3.5 sm:px-4 py-1 sm:py-1.5 font-mono text-[11px] sm:text-xs font-bold text-sky-200 border border-sky-400/40 shadow-lg backdrop-blur-md">
                                Mulai pemindaian dalam {countdownNum}s
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Layer 3: Dynamic Challenge-Response EMAR Aktif Interactive Banner */}
                <AnimatePresence>
                    {livenessStage === 'SCANNING_8S' && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            className="pointer-events-none absolute inset-x-3 sm:inset-x-6 top-13 sm:top-15 flex justify-center"
                            style={{ zIndex: 38 }}
                        >
                            {activeChallenge ? (
                                <div
                                    className={`flex items-center gap-2.5 sm:gap-3 rounded-2xl border px-3.5 sm:px-5 py-2 sm:py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-300 max-w-[95%] sm:max-w-[85%] ${
                                        activeChallengeStatus === 'PASS_LIVENESS'
                                            ? 'border-emerald-500/70 bg-emerald-950/90 text-emerald-200 ring-2 ring-emerald-500/40'
                                            : activeChallengeStatus === 'REJECT_WRONG_ACTION' || activeChallengeStatus === 'REJECT_TIMEOUT'
                                              ? 'border-rose-500/70 bg-rose-950/90 text-rose-200 ring-2 ring-rose-500/40'
                                              : 'border-amber-400/60 bg-slate-900/90 text-amber-200 ring-1 ring-amber-400/30'
                                    }`}
                                >
                                    <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                                        {activeChallenge === 'BLINK' ? (
                                            <Eye className={`h-4 w-4 sm:h-5 sm:w-5 ${activeChallengeStatus === 'PASS_LIVENESS' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
                                        ) : (
                                            <Smile className={`h-4 w-4 sm:h-5 sm:w-5 ${activeChallengeStatus === 'PASS_LIVENESS' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] sm:text-xs font-black tracking-wide uppercase text-white drop-shadow">
                                            {activeChallenge === 'BLINK'
                                                ? 'INSTRUKSI: KEDIPKAN MATA ANDA SEKARANG!'
                                                : 'INSTRUKSI: BUKA MULUT ANDA SEKARANG!'}
                                        </p>
                                        <div className="text-[10px] sm:text-[11px] font-semibold flex items-center gap-1.5 mt-0.5">
                                            {activeChallengeStatus === 'PASS_LIVENESS' && (
                                                <span className="text-emerald-300 font-bold flex items-center gap-1">
                                                    <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                                    <span>Tantangan Berhasil (Bona Fide)</span>
                                                </span>
                                            )}
                                            {activeChallengeStatus === 'REJECT_WRONG_ACTION' && (
                                                <span className="text-rose-300 font-bold flex items-center gap-1">
                                                    <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                                    <span>Aksi Salah Terdeteksi!</span>
                                                </span>
                                            )}
                                            {activeChallengeStatus === 'REJECT_TIMEOUT' && (
                                                <span className="text-rose-300 font-bold flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                                    <span>Waktu Respons Habis ({'>'}4 Detik)</span>
                                                </span>
                                            )}
                                            {activeChallengeStatus === 'WAITING_FOR_ACTION' && (
                                                <span className="text-amber-300 flex items-center gap-1">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                                                    <span>Menunggu Respons (Batas Waktu 4s)</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 rounded-full border border-sky-400/40 bg-slate-900/85 px-3.5 py-1.5 text-[10px] sm:text-[11px] font-semibold text-sky-200 shadow-lg backdrop-blur-md">
                                    <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                                    <span>Fase 1: Deteksi Awal Wajah & Verifikasi Baseline Normal</span>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Layer 3: 8-Second Scanning Progress Bar & Live Counters HUD */}
                <AnimatePresence>
                    {livenessStage === 'SCANNING_8S' && (
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="pointer-events-none absolute inset-x-2.5 sm:inset-x-3 bottom-12 sm:bottom-14 flex flex-col gap-1.5 sm:gap-2"
                            style={{ zIndex: 35 }}
                        >
                            {/* Live Liveness Metrics Floating Pills */}
                            <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                                <motion.span
                                    key={`ear-${earBlinksCount}`}
                                    animate={{ scale: [1, 1.15, 1] }}
                                    transition={{ duration: 0.25 }}
                                    className="inline-flex items-center gap-1 rounded-xl border border-purple-400/50 bg-purple-950/90 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-purple-200 shadow-lg backdrop-blur-md"
                                >
                                    <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-purple-400" />
                                    <span>Kedip: <strong className="font-mono text-white">{earBlinksCount}x</strong></span>
                                </motion.span>
                                <motion.span
                                    key={`mar-${marMouthsCount}`}
                                    animate={{ scale: [1, 1.15, 1] }}
                                    transition={{ duration: 0.25 }}
                                    className="inline-flex items-center gap-1 rounded-xl border border-sky-400/50 bg-sky-950/90 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-sky-200 shadow-lg backdrop-blur-md"
                                >
                                    <Smile className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-sky-400" />
                                    <span>Mulut: <strong className="font-mono text-white">{marMouthsCount}x</strong></span>
                                </motion.span>
                                <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/50 bg-emerald-950/90 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-emerald-200 shadow-lg backdrop-blur-md font-mono">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                    <span>⏱️ {scanElapsedSec.toFixed(1)}s / 8.0s</span>
                                </span>
                            </div>

                            {/* 8-Second Visual Progress Bar with Glow Particle */}
                            <div className="relative h-2 sm:h-2.5 w-full overflow-hidden rounded-full bg-slate-900/90 border border-cyan-500/40 shadow-inner backdrop-blur-md">
                                <motion.div
                                    className="relative h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 shadow-sm"
                                    style={{ width: `${scanProgressPct}%` }}
                                    transition={{ ease: 'linear', duration: 0.05 }}
                                >
                                    {/* Leading Edge Sparkle */}
                                    <div className="absolute right-0 top-0 bottom-0 w-2 bg-white blur-[2px]"></div>
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Layer 3: Floating Bottom Status Pill */}
                <div
                    className="pointer-events-none absolute inset-x-2.5 sm:inset-x-3 bottom-2.5 sm:bottom-3 flex justify-center"
                    style={{ zIndex: 30 }}
                >
                    <motion.div
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="pointer-events-auto inline-flex max-w-[96%] sm:max-w-[92%] items-center justify-between gap-2 rounded-full border border-slate-700/60 bg-slate-900/90 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md ring-1 ring-white/10"
                        role="status"
                        aria-live="polite"
                    >
                        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                            <StatusIcon />
                            <span className="truncate">{statusMessage}</span>
                        </div>

                        {(cameraError || visualState === 'FAILED' || verificationResult === 'failed') && (
                            <button
                                onClick={
                                    cameraError ? () => { void startCamera(); } : (onResetScan || handleReset)
                                }
                                type="button"
                                className="inline-flex flex-shrink-0 cursor-pointer items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-950/90 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-cyan-200 transition-colors hover:bg-cyan-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            >
                                <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                <span>Ulangi</span>
                            </button>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
