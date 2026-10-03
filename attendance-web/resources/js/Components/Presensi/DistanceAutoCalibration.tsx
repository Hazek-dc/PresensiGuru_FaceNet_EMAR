import axios from 'axios';
import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
    COUNTDOWN_S,
    FACE_STABLE_MS,
    FACE_STABLE_SPREAD,
    POSITIONING_MS,
    StabilityTracker,
} from '../../Utils/autoCalibration';
import {
    ActiveCalibration,
    CALIBRATION_TARGETS,
    CalibrationTarget,
    CameraInfo,
    captureVideoJpeg,
    median,
    parseCalibration,
} from '../../Utils/distanceCalibration';

/** Rasio lebar wajah terakhir dari pemindai Studio (null = tanpa wajah) dan waktunya. */
export interface FaceRatioSample {
    ratio: number | null;
    t: number;
}

type Phase = 'positioning' | 'waiting' | 'countdown' | 'recording' | 'sending' | 'committing' | 'done' | 'error';

interface DistanceAutoCalibrationProps {
    videoRef: RefObject<HTMLVideoElement | null>;
    ratioRef: MutableRefObject<FaceRatioSample>;
    camera: CameraInfo | null;
    speak: (text: string) => void;
    onCalibrated: (calibration: ActiveCalibration) => void;
}

// Sama dengan halaman Kalibrasi Jarak: rasio ~2 detik dan 5 JPEG untuk engine.
const RECORD_MS = 2000;
const FRAME_COUNT = 5;
const MIN_SAMPLES = 10;
const MIN_FACE_SHARE = 0.8;
const POLL_MS = 50;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function serverMessage(err: unknown, fallback: string): string {
    if (!axios.isAxiosError(err)) return fallback;
    const data = err.response?.data as { message?: unknown; reason?: unknown } | undefined;
    const msg = typeof data?.message === 'string' ? data.message : typeof data?.reason === 'string' ? data.reason : null;
    return msg ?? `${fallback} (HTTP ${err.response?.status ?? '?'})`;
}

/**
 * Kalibrasi jarak semi-otomatis: operator duduk di 30, 45, lalu 60 cm (diukur
 * dengan meteran); sistem menunggu wajah diam, menghitung mundur, merekam,
 * mengirim, dan menyimpan model sendiri. Jaraknya tetap dari meteran operator.
 */
export function DistanceAutoCalibration({ videoRef, ratioRef, camera, speak, onCalibrated }: DistanceAutoCalibrationProps) {
    const [phase, setPhase] = useState<Phase>('positioning');
    const [targetIndex, setTargetIndex] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [faceVisible, setFaceVisible] = useState(false);
    const [done, setDone] = useState<CalibrationTarget[]>([]);
    const [notes, setNotes] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState<ActiveCalibration | null>(null);
    const runIdRef = useRef(0);

    const recordTarget = useCallback(
        async (target: CalibrationTarget, runId: number): Promise<boolean> => {
            const alive = () => runIdRef.current === runId;
            const video = videoRef.current;
            if (!video) {
                setError('Video kamera belum siap.');
                return false;
            }

            setPhase('positioning');
            speak(`Duduk di jarak ${target} sentimeter dari lensa kamera. Ukur dengan meteran, lalu tatap kamera dan diam.`);
            for (let left = POSITIONING_MS; left > 0; left -= 1000) {
                if (!alive()) return false;
                setSecondsLeft(Math.ceil(left / 1000));
                await sleep(1000);
            }

            setPhase('waiting');
            setSecondsLeft(null);
            const tracker = new StabilityTracker(FACE_STABLE_MS, FACE_STABLE_SPREAD);
            let lastT = -1;
            for (;;) {
                if (!alive()) return false;
                const s = ratioRef.current;
                if (s.t !== lastT) {
                    tracker.push(s.ratio, s.t);
                    lastT = s.t;
                }
                const now = performance.now();
                setFaceVisible(s.ratio !== null && now - s.t < 500);
                if (tracker.isStable(now)) break;
                await sleep(POLL_MS);
            }

            setPhase('countdown');
            speak('Tahan posisi.');
            for (let n = COUNTDOWN_S; n > 0; n--) {
                if (!alive()) return false;
                setSecondsLeft(n);
                await sleep(1000);
            }

            setPhase('recording');
            setSecondsLeft(null);
            const ratios: number[] = [];
            const blobs: Blob[] = [];
            let ticks = 0;
            lastT = -1;
            const started = performance.now();
            let nextShot = started + RECORD_MS / FRAME_COUNT / 2;
            while (performance.now() - started < RECORD_MS) {
                if (!alive()) return false;
                const s = ratioRef.current;
                if (s.t !== lastT) {
                    lastT = s.t;
                    ticks += 1;
                    if (s.ratio !== null) ratios.push(s.ratio);
                }
                if (performance.now() >= nextShot && blobs.length < FRAME_COUNT) {
                    const blob = await captureVideoJpeg(video);
                    if (blob) blobs.push(blob);
                    nextShot += RECORD_MS / FRAME_COUNT;
                }
                await sleep(POLL_MS);
            }

            if (ratios.length < MIN_SAMPLES || ratios.length < ticks * MIN_FACE_SHARE) {
                setError(`Wajah hanya terdeteksi pada ${ratios.length} dari ${ticks} bingkai di ${target} cm. Pastikan seluruh wajah terlihat dan diam.`);
                return false;
            }
            const browserRatio = median(ratios);
            if (browserRatio === null || blobs.length < 3) {
                setError(`Rekaman ${target} cm tidak lengkap (${blobs.length} foto). Ulangi titik ini.`);
                return false;
            }

            setPhase('sending');
            const form = new FormData();
            form.append('target_cm', String(target));
            form.append('browser_ratio', String(browserRatio));
            form.append('browser_samples', String(ratios.length));
            if (camera?.label) form.append('camera_label', camera.label);
            form.append('resolution_w', String(camera?.width ?? video.videoWidth));
            form.append('resolution_h', String(camera?.height ?? video.videoHeight));
            blobs.forEach((blob, i) => form.append('frames[]', blob, `titik_${target}cm_${i + 1}.jpg`));
            try {
                const resp = await axios.post('/api/biometric/calibration/point', form, {
                    headers: { 'Content-Type': 'multipart/form-data', Accept: 'application/json' },
                });
                const data = (resp.data ?? {}) as Record<string, unknown>;
                if (data.engine_ratio == null) {
                    setNotes((n) => [
                        ...n,
                        `${target} cm: mesin tidak mengukur rasio (${typeof data.engine_error === 'string' ? data.engine_error : 'wajah tidak ditemukan'}); model mesin tidak dibuat.`,
                    ]);
                }
            } catch (err) {
                setError(`Titik ${target} cm belum tersimpan. ${serverMessage(err, 'Server menolak titik ini.')}`);
                return false;
            }
            if (!alive()) return false;
            setDone((d) => [...d.filter((t) => t !== target), target]);
            speak(`Titik ${target} sentimeter tersimpan.`);
            return true;
        },
        [videoRef, ratioRef, camera, speak],
    );

    const run = useCallback(
        async (fromIndex: number) => {
            const runId = ++runIdRef.current;
            setError(null);
            for (let i = fromIndex; i < CALIBRATION_TARGETS.length; i++) {
                setTargetIndex(i);
                const ok = await recordTarget(CALIBRATION_TARGETS[i], runId);
                if (runIdRef.current !== runId) return;
                if (!ok) {
                    setPhase('error');
                    speak('Titik ini gagal direkam. Baca keterangan di layar.');
                    return;
                }
            }
            setPhase('committing');
            try {
                const resp = await axios.post('/api/biometric/calibration/commit', {}, { headers: { Accept: 'application/json' } });
                const data = resp.data as Record<string, unknown> | null;
                const calibration = parseCalibration(data?.calibration ?? data);
                if (!calibration) throw new Error('Respons server tidak lengkap.');
                if (runIdRef.current !== runId) return;
                setSaved(calibration);
                setPhase('done');
                speak('Kalibrasi jarak disimpan.');
                onCalibrated(calibration);
            } catch (err) {
                if (runIdRef.current !== runId) return;
                setError(`Kalibrasi jarak ditolak. ${serverMessage(err, err instanceof Error ? err.message : 'Server menolak kalibrasi.')} Ulangi ketiga titik dengan jarak meteran yang tepat.`);
                setTargetIndex(0);
                setPhase('error');
                speak('Kalibrasi jarak ditolak. Baca keterangan di layar.');
            }
        },
        [recordTarget, onCalibrated, speak],
    );

    // Mulai begitu bagian ini tampil; berhenti bila jendela ditutup.
    useEffect(() => {
        void run(0);
        return () => {
            runIdRef.current += 1;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const target = CALIBRATION_TARGETS[targetIndex];
    const status: Record<Phase, string> = {
        positioning: `Duduk di ${target} cm dari lensa kamera (ukur dengan meteran), tatap kamera. Mulai dalam ${secondsLeft ?? 0} detik.`,
        waiting: faceVisible ? 'Tahan diam, menunggu wajah stabil...' : 'Wajah belum terlihat penuh di kamera.',
        countdown: `Merekam dalam ${secondsLeft ?? 0}...`,
        recording: 'Merekam, tetap diam...',
        sending: 'Mengirim ke mesin untuk diukur ulang...',
        committing: 'Menyimpan kalibrasi jarak...',
        done: saved ? `Kalibrasi jarak #${saved.id} disimpan dan langsung dipakai pemindai.` : 'Kalibrasi jarak disimpan.',
        error: error ?? 'Terjadi kesalahan.',
    };

    return (
        <div className="space-y-3 text-sm">
            <ol className="flex flex-wrap gap-2">
                {CALIBRATION_TARGETS.map((t, i) => {
                    const isDone = done.includes(t);
                    const isActive = i === targetIndex && phase !== 'done';
                    return (
                        <li
                            key={t}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
                                isDone
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                    : isActive
                                      ? 'border-royal-blue/50 bg-royal-blue/10 text-royal-blue dark:border-sky-400/50 dark:text-sky-300'
                                      : 'border-outline-variant/50 text-on-surface-variant dark:border-white/10 dark:text-slate-400'
                            }`}
                        >
                            {isDone ? '✓ ' : ''}
                            {t} cm
                        </li>
                    );
                })}
            </ol>

            <p
                role="status"
                aria-live="polite"
                className={`rounded-xl p-3 font-semibold ${
                    phase === 'error'
                        ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300'
                        : phase === 'done'
                          ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                          : 'bg-surface-container-low text-deep-navy dark:bg-white/5 dark:text-white'
                }`}
            >
                {status[phase]}
            </p>

            {notes.map((n) => (
                <p key={n} className="text-xs text-amber-800 dark:text-amber-300">
                    {n}
                </p>
            ))}

            {phase === 'error' && (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void run(targetIndex)}
                        className="inline-flex min-h-[44px] items-center rounded-xl bg-royal-blue px-4 py-2 text-sm font-bold text-white hover:bg-deep-navy dark:bg-sky-600 dark:hover:bg-sky-500"
                    >
                        Ulangi dari {CALIBRATION_TARGETS[targetIndex]} cm
                    </button>
                </div>
            )}
        </div>
    );
}
