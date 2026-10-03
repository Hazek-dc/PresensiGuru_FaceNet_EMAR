import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Landmark3D, useFaceLandmarker } from '../../Hooks/useFaceLandmarker';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import {
    ActiveCalibration,
    CALIBRATION_TARGETS,
    CalibrationTarget,
    calibrationAppliesTo,
    CameraInfo,
    cameraInfoFromTrack,
    captureVideoJpeg,
    categoryLabel,
    classifyDistance,
    DEFAULT_MAX_RESIDUAL_CM,
    DISTANCE_BANDS,
    DistanceBand,
    estimateFromRatio,
    faceWidthRatio,
    fitInverseModel,
    formatFps,
    formatResolution,
    InverseModel,
    median,
    parseCalibration,
} from '../../Utils/distanceCalibration';

interface Props {
    calibration?: unknown;
    bands?: unknown;
    /** Draf titik di cache server (60 menit), dari perekaman sebelumnya. */
    draft?: { points_done?: unknown } | null;
    max_residual_cm?: unknown;
}

// Perekaman satu titik: ~2 s rasio lebar wajah dan 5 frame JPEG untuk engine.
const RECORD_MS = 2000;
const FRAME_COUNT = 5;
const JPEG_QUALITY = 0.9;
const MIN_SAMPLES = 10;
const MIN_FACE_SHARE = 0.8;
const UNKNOWN = 'Tidak diketahui';

interface RecordedPoint {
    target: CalibrationTarget;
    browserRatio: number;
    browserSamples: number;
    engineRatio: number | null;
    engineFrames: number | null;
    engineError: string | null;
    framesSent: number;
}

type Notice = { tone: 'error' | 'warn' | 'ok'; text: string };

function toNumber(value: unknown): number | null {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function parseBands(raw: unknown): readonly DistanceBand[] {
    if (!Array.isArray(raw)) return DISTANCE_BANDS;
    const parsed = DISTANCE_BANDS.map((fallback) => {
        const match = raw.find(
            (b) => b && typeof b === 'object' && (b.category === fallback.category || toNumber(b.target_cm) === fallback.target_cm),
        );
        const min = toNumber(match?.min_cm ?? match?.min);
        const max = toNumber(match?.max_cm ?? match?.max);
        return min !== null && max !== null ? { ...fallback, min_cm: min, max_cm: max } : null;
    });
    return parsed.every(Boolean) ? (parsed as DistanceBand[]) : DISTANCE_BANDS;
}

function parsePointsDone(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((p) => (p && typeof p === 'object' ? toNumber((p as Record<string, unknown>).target_cm) : toNumber(p)))
        .filter((n): n is number => n !== null);
}

function serverMessage(err: unknown, fallback: string): string {
    if (!axios.isAxiosError(err)) return fallback;
    const status = err.response?.status;
    const data = err.response?.data as Record<string, unknown> | undefined;
    const message = typeof data?.message === 'string' ? data.message : typeof data?.reason === 'string' ? data.reason : null;
    if (!err.response) return 'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.';
    if (status === 401 || status === 403) return 'Hanya admin atau peneliti yang dapat menyimpan kalibrasi.';
    if (status === 419) return 'Sesi login kedaluwarsa. Muat ulang halaman lalu coba lagi.';
    if (status === 502 || status === 503 || status === 504) {
        return message ?? 'Engine biometrik tidak dapat dihubungi. Pastikan engine di port 5000 berjalan.';
    }
    return message ?? `${fallback} (HTTP ${status})`;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const captureJpeg = (video: HTMLVideoElement) => captureVideoJpeg(video, JPEG_QUALITY);

const fmtRatio = (r: number | null | undefined) => (typeof r === 'number' && Number.isFinite(r) ? r.toFixed(4) : UNKNOWN);
const fmtCm = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} cm` : UNKNOWN);

function ModelTable({ title, model, points }: { title: string; model: InverseModel | null; points: Array<{ target: number; ratio: number | null }> }) {
    return (
        <div className="rounded-2xl border border-outline-variant/40 dark:border-white/10 p-3.5">
            <p className="text-xs font-bold text-deep-navy dark:text-white">{title}</p>
            {model ? (
                <>
                    <p className="mt-1 font-mono text-xs text-on-surface-variant dark:text-slate-300">
                        d = {model.a.toFixed(3)} / r {model.b >= 0 ? '+' : '-'} {Math.abs(model.b).toFixed(2)}
                    </p>
                    <table className="mt-2 w-full text-left text-xs">
                        <thead className="text-on-surface-variant dark:text-slate-400">
                            <tr>
                                <th className="py-1 pr-2 font-semibold">Meteran</th>
                                <th className="py-1 pr-2 font-semibold">Rasio</th>
                                <th className="py-1 pr-2 font-semibold">Model</th>
                                <th className="py-1 font-semibold">Selisih</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono text-deep-navy dark:text-white">
                            {points.map(({ target, ratio }) => {
                                const fitted = estimateFromRatio(ratio, model);
                                return (
                                    <tr key={target} className="border-t border-outline-variant/30 dark:border-white/10">
                                        <td className="py-1 pr-2">{target} cm</td>
                                        <td className="py-1 pr-2">{fmtRatio(ratio)}</td>
                                        <td className="py-1 pr-2">{fmtCm(fitted)}</td>
                                        <td className="py-1">{fitted === null ? UNKNOWN : `${(target - fitted).toFixed(1)} cm`}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="mt-2 text-xs text-on-surface-variant dark:text-slate-300">
                        Selisih terbesar: <strong className="font-mono">{fmtCm(model.max_residual_cm)}</strong>
                    </p>
                </>
            ) : (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Tidak ada model. Engine tidak mengukur ketiga titik, jadi jarak dari video presensi belum bisa dihitung.
                </p>
            )}
        </div>
    );
}

export default function DistanceCalibration({
    calibration: initialCalibration,
    bands: rawBands,
    draft,
    max_residual_cm: rawMaxResidual,
}: Props) {
    const bands = useMemo(() => parseBands(rawBands), [rawBands]);
    const maxResidualCm = toNumber(rawMaxResidual) ?? DEFAULT_MAX_RESIDUAL_CM;
    const [activeCalibration, setActiveCalibration] = useState<ActiveCalibration | null>(() => parseCalibration(initialCalibration));

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const frameCallbackRef = useRef<number | null>(null);
    const [camera, setCamera] = useState<CameraInfo | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [deviceId, setDeviceId] = useState<string | null>(null);

    const recordingRef = useRef<{ ratios: number[]; frames: number } | null>(null);
    const [recordingTarget, setRecordingTarget] = useState<CalibrationTarget | null>(null);
    const [recordProgress, setRecordProgress] = useState(0);
    const [sendingTarget, setSendingTarget] = useState<CalibrationTarget | null>(null);
    const [points, setPoints] = useState<Partial<Record<CalibrationTarget, RecordedPoint>>>({});
    const [serverPointsDone, setServerPointsDone] = useState<number[]>(() => parsePointsDone(draft?.points_done));
    const [notice, setNotice] = useState<Notice | null>(null);
    const [committing, setCommitting] = useState(false);
    const [committed, setCommitted] = useState<ActiveCalibration | null>(null);

    const handleResults = useCallback((_result: unknown, landmarks: Landmark3D[]) => {
        const rec = recordingRef.current;
        if (!rec) return;
        const ratio = faceWidthRatio(landmarks);
        if (ratio !== null) rec.ratios.push(ratio);
    }, []);

    const {
        isLoaded,
        isLoading,
        error: landmarkerError,
        hasFace,
        landmarks,
        processFrame,
        resetSmoothing,
    } = useFaceLandmarker({ active: camera !== null && !cameraError, onResults: handleResults });

    const startCamera = useCallback(
        async (targetDeviceId: string | null) => {
            setCameraError(null);
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraError('Browser tidak mendukung akses kamera. Buka halaman ini lewat localhost atau HTTPS di Chrome atau Edge.');
                return;
            }
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setCamera(null);

            const ideal = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
            const attempts: MediaStreamConstraints[] = targetDeviceId
                ? [{ video: { deviceId: { exact: targetDeviceId }, ...ideal }, audio: false }]
                : [
                      { video: { ...ideal }, audio: false },
                      { video: true, audio: false },
                  ];
            let stream: MediaStream | null = null;
            let lastErr: unknown = null;
            for (const constraints of attempts) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia(constraints);
                    break;
                } catch (err) {
                    lastErr = err;
                }
            }
            if (!stream) {
                const name = lastErr instanceof DOMException ? lastErr.name : '';
                setCameraError(
                    name === 'NotAllowedError'
                        ? 'Izin kamera ditolak. Izinkan kamera lewat ikon gembok di bilah alamat.'
                        : name === 'NotReadableError'
                          ? 'Kamera sedang dipakai aplikasi lain. Tutup halaman presensi atau aplikasi kamera lain lalu coba lagi.'
                          : name === 'NotFoundError' || name === 'OverconstrainedError'
                            ? 'Kamera yang dipilih tidak ditemukan. Periksa kabel USB lalu pilih ulang.'
                            : 'Kamera gagal dibuka.',
                );
                return;
            }

            streamRef.current = stream;
            resetSmoothing();
            const track = stream.getVideoTracks()[0];
            const info = cameraInfoFromTrack(track);
            setCamera(info);
            if (info?.deviceId) setDeviceId(info.deviceId);
            try {
                const all = await navigator.mediaDevices.enumerateDevices();
                setDevices(all.filter((d) => d.kind === 'videoinput'));
            } catch {
                setDevices([]);
            }
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(() => {});
            }
        },
        [resetSmoothing],
    );

    useEffect(() => {
        void startCamera(null);
        return () => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, [startCamera]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isLoaded) return;
        const v = video as HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: (now: number) => void) => number;
            cancelVideoFrameCallback?: (id: number) => void;
        };
        const schedule = (cb: (now: number) => void) =>
            typeof v.requestVideoFrameCallback === 'function' ? v.requestVideoFrameCallback(cb) : requestAnimationFrame(cb);
        const onFrame = (now: number) => {
            if (video.readyState >= 2) {
                if (recordingRef.current) recordingRef.current.frames += 1;
                processFrame(video, now);
            }
            frameCallbackRef.current = schedule(onFrame);
        };
        frameCallbackRef.current = schedule(onFrame);
        return () => {
            if (frameCallbackRef.current === null) return;
            if (typeof v.cancelVideoFrameCallback === 'function') v.cancelVideoFrameCallback(frameCallbackRef.current);
            else cancelAnimationFrame(frameCallbackRef.current);
            frameCallbackRef.current = null;
        };
    }, [isLoaded, processFrame]);

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (!video?.videoWidth || !video.videoHeight) return;
        setCamera((prev) =>
            prev && (prev.width === null || prev.height === null) ? { ...prev, width: video.videoWidth, height: video.videoHeight } : prev,
        );
    };

    const liveRatio = hasFace ? faceWidthRatio(landmarks) : null;
    const activeMatch = calibrationAppliesTo(activeCalibration, camera);
    const liveEstimate = activeMatch.applies && activeCalibration ? estimateFromRatio(liveRatio, activeCalibration.browser) : null;
    const liveClass = liveEstimate === null ? null : classifyDistance(liveEstimate, hasFace);

    const busy = recordingTarget !== null || sendingTarget !== null || committing;
    const canRecord = isLoaded && camera !== null && !cameraError && !busy;

    const recordPoint = async (target: CalibrationTarget) => {
        const video = videoRef.current;
        if (!video || !canRecord) return;
        setNotice(null);
        setRecordingTarget(target);
        setRecordProgress(0);
        recordingRef.current = { ratios: [], frames: 0 };

        const started = performance.now();
        const progressTimer = setInterval(() => {
            setRecordProgress(Math.min(1, (performance.now() - started) / RECORD_MS));
        }, 100);
        const blobs: Blob[] = [];
        try {
            for (let i = 0; i < FRAME_COUNT; i++) {
                await wait(RECORD_MS / FRAME_COUNT / (i === 0 ? 2 : 1));
                const blob = await captureJpeg(video);
                if (blob) blobs.push(blob);
            }
            await wait(Math.max(0, RECORD_MS - (performance.now() - started)));
        } finally {
            clearInterval(progressTimer);
            setRecordProgress(1);
        }
        const rec = recordingRef.current;
        recordingRef.current = null;
        setRecordingTarget(null);

        const samples = rec?.ratios.length ?? 0;
        const frames = rec?.frames ?? 0;
        if (samples < MIN_SAMPLES || samples < frames * MIN_FACE_SHARE) {
            setNotice({
                tone: 'error',
                text: `Wajah hanya terdeteksi pada ${samples} dari ${frames} frame. Pastikan seluruh wajah terlihat dan diam, lalu rekam ulang titik ${target} cm.`,
            });
            return;
        }
        if (blobs.length < 3) {
            setNotice({ tone: 'error', text: `Hanya ${blobs.length} frame JPEG yang tertangkap. Rekam ulang titik ${target} cm.` });
            return;
        }
        const browserRatio = median(rec?.ratios ?? []);
        if (browserRatio === null) {
            setNotice({ tone: 'error', text: `Rasio lebar wajah tidak terukur. Rekam ulang titik ${target} cm.` });
            return;
        }

        const form = new FormData();
        form.append('target_cm', String(target));
        form.append('browser_ratio', String(browserRatio));
        form.append('browser_samples', String(samples));
        if (camera?.label) form.append('camera_label', camera.label);
        // Server mewajibkan resolusi. Bila getSettings() tidak melaporkannya, ukuran
        // frame JPEG yang baru ditangkap adalah resolusi yang benar-benar dipakai.
        form.append('resolution_w', String(camera?.width ?? video.videoWidth));
        form.append('resolution_h', String(camera?.height ?? video.videoHeight));
        blobs.forEach((blob, i) => form.append('frames[]', blob, `titik_${target}cm_${i + 1}.jpg`));

        setSendingTarget(target);
        try {
            const resp = await axios.post('/api/biometric/calibration/point', form, {
                headers: { 'Content-Type': 'multipart/form-data', Accept: 'application/json' },
            });
            const data = (resp.data ?? {}) as Record<string, unknown>;
            const point: RecordedPoint = {
                target,
                browserRatio: toNumber(data.browser_ratio) ?? browserRatio,
                browserSamples: samples,
                engineRatio: toNumber(data.engine_ratio),
                engineFrames: toNumber(data.engine_frames),
                engineError: typeof data.engine_error === 'string' && data.engine_error !== '' ? data.engine_error : null,
                framesSent: blobs.length,
            };
            const done = parsePointsDone(data.points_done);
            // Server membuang draf bila kamera atau resolusi berganti; titik lokal ikut draf server.
            setPoints((prev) => {
                const next: Partial<Record<CalibrationTarget, RecordedPoint>> = { [target]: point };
                for (const t of CALIBRATION_TARGETS) {
                    if (t !== target && prev[t] && (done.length === 0 || done.includes(t))) next[t] = prev[t];
                }
                return next;
            });
            setServerPointsDone(done);
            const resetNote = data.draft_reset === true ? ' Titik sebelumnya dari kamera atau resolusi lain dibuang.' : '';
            setNotice(
                point.engineRatio === null
                    ? {
                          tone: 'warn',
                          text: `Titik ${target} cm tersimpan sementara tanpa rasio engine. ${point.engineError ?? 'Engine tidak menemukan wajah pada frame yang dikirim.'} Model engine hanya dibuat bila ketiga titik terukur engine.${resetNote}`,
                      }
                    : { tone: 'ok', text: `Titik ${target} cm tersimpan sementara. Belum berlaku sebelum Simpan kalibrasi.${resetNote}` },
            );
        } catch (err) {
            setNotice({ tone: 'error', text: `Titik ${target} cm belum tersimpan. ${serverMessage(err, 'Server menolak titik ini.')}` });
        } finally {
            setSendingTarget(null);
        }
    };

    const recordedTargets = CALIBRATION_TARGETS.filter((t) => points[t]);
    const allRecorded = recordedTargets.length === CALIBRATION_TARGETS.length;
    const staleServerPoints = serverPointsDone.filter((t) => !recordedTargets.some((r) => r === t));
    const preview = useMemo(
        () =>
            fitInverseModel(
                CALIBRATION_TARGETS.map((t) => ({ target_cm: t, ratio: points[t]?.browserRatio ?? null })),
                maxResidualCm,
            ),
        [points, maxResidualCm],
    );

    const commit = async () => {
        if (!allRecorded || busy) return;
        setNotice(null);
        setCommitting(true);
        try {
            const resp = await axios.post('/api/biometric/calibration/commit', {}, { headers: { Accept: 'application/json' } });
            const data = resp.data as Record<string, unknown> | null;
            const saved = parseCalibration(data?.calibration ?? data);
            if (saved) {
                setActiveCalibration(saved);
                setCommitted(saved);
                setPoints({});
                setServerPointsDone([]);
                const warning = typeof data?.warning === 'string' && data.warning !== '' ? ` ${data.warning}` : '';
                setNotice({
                    tone: warning ? 'warn' : 'ok',
                    text: `Kalibrasi #${saved.id} aktif. Muat ulang halaman presensi agar pemindai memakainya.${warning}`,
                });
            } else {
                setNotice({ tone: 'warn', text: 'Server menerima kalibrasi, tetapi responsnya tidak lengkap. Muat ulang halaman untuk melihat kalibrasi aktif.' });
            }
        } catch (err) {
            setNotice({ tone: 'error', text: `Kalibrasi tidak disimpan. ${serverMessage(err, 'Server menolak kalibrasi.')}` });
        } finally {
            setCommitting(false);
        }
    };

    const cameraRows: Array<[string, string | null]> = [
        ['Perangkat', camera?.label ?? null],
        ['Resolusi', formatResolution(camera)],
        ['Frame rate', formatFps(camera?.fps)],
    ];

    const cardClass =
        'rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-6 shadow-sm';
    const primaryButton =
        'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-deep-navy disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500';

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-bold leading-tight text-deep-navy dark:text-white">Kalibrasi Jarak Kamera</h2>
                    <p className="mt-1 max-w-3xl text-sm text-on-surface-variant dark:text-slate-400">
                        Rekam rasio lebar wajah pada 30, 45 dan 60 cm yang diukur dengan meteran. Model yang dihasilkan menghitung jarak
                        sebelum pemindaian 8 detik dan dari video presensi. Pemindaian hanya mulai pada{' '}
                        {bands.map((b) => `${b.min_cm}-${b.max_cm} cm`).join(', ')}.
                    </p>
                </div>
            }
        >
            <Head title="Kalibrasi Jarak Kamera" />

            <div className="py-6 sm:py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <section className={cardClass} aria-label="Kalibrasi aktif">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-base font-bold text-deep-navy dark:text-white">Kalibrasi aktif</h3>
                            <Link href="/presensi" className="text-sm font-semibold text-royal-blue hover:underline dark:text-sky-400">
                                Buka halaman presensi
                            </Link>
                        </div>
                        {activeCalibration ? (
                            <div className="mt-2 space-y-3 text-sm text-on-surface-variant dark:text-slate-300">
                                <p>
                                    #{activeCalibration.id}
                                    {activeCalibration.created_at && `, dibuat ${new Date(activeCalibration.created_at).toLocaleString('id-ID')}`}
                                    {`, kamera ${activeCalibration.camera_label ?? UNKNOWN}`}
                                    {activeCalibration.resolution_w && activeCalibration.resolution_h
                                        ? `, ${activeCalibration.resolution_w}x${activeCalibration.resolution_h}`
                                        : ''}
                                    .
                                </p>
                                {camera && !activeMatch.applies && (
                                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
                                        {activeMatch.reason}. Kamera yang sedang terbuka tidak memakai kalibrasi ini.
                                    </p>
                                )}
                                <div className="grid gap-3 md:grid-cols-2">
                                    <ModelTable
                                        title="Model browser (MediaPipe, pipi 234-454)"
                                        model={activeCalibration.browser}
                                        points={activeCalibration.points.map((p) => ({ target: p.target_cm, ratio: p.browser_ratio }))}
                                    />
                                    <ModelTable
                                        title="Model engine (dlib, rahang 0-16)"
                                        model={activeCalibration.engine}
                                        points={activeCalibration.points.map((p) => ({ target: p.target_cm, ratio: p.engine_ratio }))}
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-on-surface-variant dark:text-slate-300">
                                Belum ada kalibrasi. Presensi tetap berjalan dengan estimasi jarak kasar yang tidak menahan pemindaian.
                            </p>
                        )}
                    </section>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                        <section className={`${cardClass} lg:col-span-3`} aria-label="Pratinjau kamera">
                            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-950">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    onLoadedMetadata={handleLoadedMetadata}
                                    className="h-full w-full object-cover"
                                    style={{ transform: 'scaleX(-1)' }}
                                />
                                <div className="absolute left-3 top-3 rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-xs font-semibold text-white">
                                    {cameraError
                                        ? 'Kamera tidak aktif'
                                        : isLoading
                                          ? 'Memuat model deteksi wajah...'
                                          : liveRatio !== null
                                            ? `Rasio lebar wajah ${liveRatio.toFixed(4)}`
                                            : 'Wajah belum terdeteksi'}
                                </div>
                                {recordingTarget !== null && (
                                    <div className="absolute inset-x-3 bottom-3 rounded-lg bg-slate-950/85 p-2.5 text-xs font-semibold text-white">
                                        <p>Merekam titik {recordingTarget} cm. Tetap diam.</p>
                                        <div
                                            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20"
                                            role="progressbar"
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={Math.round(recordProgress * 100)}
                                        >
                                            <div className="h-full bg-emerald-400" style={{ width: `${recordProgress * 100}%` }} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {cameraError && (
                                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-300">
                                    <span className="min-w-0 flex-1">{cameraError}</span>
                                    <button type="button" className={primaryButton} onClick={() => void startCamera(deviceId)}>
                                        Coba lagi
                                    </button>
                                </div>
                            )}
                            {landmarkerError && (
                                <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-300">
                                    Model deteksi wajah gagal dimuat: {landmarkerError}
                                </p>
                            )}

                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                                    {cameraRows.map(([label, value]) => (
                                        <div key={label} className="contents">
                                            <dt className="text-on-surface-variant dark:text-slate-400">{label}</dt>
                                            <dd
                                                className={`break-words font-semibold ${
                                                    value ? 'text-deep-navy dark:text-white' : 'text-on-surface-variant dark:text-slate-400'
                                                }`}
                                            >
                                                {value ?? UNKNOWN}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                <div className="space-y-2 text-sm">
                                    {devices.length > 1 && (
                                        <label className="block">
                                            <span className="text-on-surface-variant dark:text-slate-400">Kamera</span>
                                            <select
                                                value={deviceId ?? ''}
                                                disabled={busy}
                                                onChange={(e) => {
                                                    setDeviceId(e.target.value);
                                                    void startCamera(e.target.value);
                                                }}
                                                className="mt-1 block w-full rounded-xl border-outline-variant/60 bg-white text-sm text-deep-navy dark:border-white/10 dark:bg-slate-900 dark:text-white"
                                            >
                                                {devices.map((d, i) => (
                                                    <option key={d.deviceId || i} value={d.deviceId}>
                                                        {d.label || `Kamera ${i + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                    <p className="text-on-surface-variant dark:text-slate-300">
                                        Pakai kamera dan resolusi yang sama dengan presensi. Kalibrasi tidak berlaku untuk kamera lain.
                                    </p>
                                    {activeCalibration && activeMatch.applies && (
                                        <p className="rounded-xl border border-outline-variant/40 px-3 py-2 dark:border-white/10" aria-live="polite">
                                            Uji kalibrasi aktif:{' '}
                                            <strong className="font-mono text-deep-navy dark:text-white">{fmtCm(liveEstimate)}</strong>
                                            {liveClass && <> · {liveClass.allow_verification ? categoryLabel(liveClass.category) : liveClass.message}</>}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>

                        <section className={`${cardClass} lg:col-span-2`} aria-label="Titik kalibrasi">
                            <h3 className="text-base font-bold text-deep-navy dark:text-white">Titik kalibrasi</h3>
                            <p className="mt-1 text-sm text-on-surface-variant dark:text-slate-300">
                                Tiap titik merekam sekitar 2 detik. Titik disimpan sementara di server selama 60 menit dan baru berlaku
                                setelah Simpan kalibrasi.
                            </p>

                            <ol className="mt-4 space-y-3">
                                {CALIBRATION_TARGETS.map((target) => {
                                    const point = points[target];
                                    const isRecording = recordingTarget === target;
                                    const isSending = sendingTarget === target;
                                    return (
                                        <li key={target} className="rounded-2xl border border-outline-variant/40 p-3.5 dark:border-white/10">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-deep-navy dark:text-white">{target} cm</p>
                                                    <p className="mt-0.5 text-sm text-on-surface-variant dark:text-slate-300">
                                                        Duduk di kursi. Ukur jarak dari lensa kamera ke pangkal hidung dengan meteran: {target} cm.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={primaryButton}
                                                    disabled={!canRecord}
                                                    onClick={() => void recordPoint(target)}
                                                >
                                                    {isRecording ? 'Merekam...' : isSending ? 'Mengirim...' : point ? 'Rekam ulang' : 'Rekam titik'}
                                                </button>
                                            </div>
                                            {point && (
                                                <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                                                    <dt className="text-on-surface-variant dark:text-slate-400">Browser</dt>
                                                    <dd className="font-mono text-deep-navy dark:text-white">
                                                        {fmtRatio(point.browserRatio)} (median {point.browserSamples} frame)
                                                    </dd>
                                                    <dt className="text-on-surface-variant dark:text-slate-400">Engine</dt>
                                                    <dd
                                                        className={`font-mono ${
                                                            point.engineRatio === null ? 'text-amber-700 dark:text-amber-300' : 'text-deep-navy dark:text-white'
                                                        }`}
                                                    >
                                                        {point.engineRatio === null ? 'Tidak terukur' : fmtRatio(point.engineRatio)}
                                                        {point.engineFrames !== null && ` (${point.engineFrames} dari ${point.framesSent} frame)`}
                                                        {point.engineRatio === null && point.engineError && (
                                                            <span className="block font-sans">{point.engineError}</span>
                                                        )}
                                                    </dd>
                                                </dl>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>

                            {staleServerPoints.length > 0 && (
                                <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">
                                    Server masih menyimpan titik {staleServerPoints.join(', ')} cm dari perekaman sebelumnya. Rekam ulang titik
                                    tersebut agar semua titik berasal dari sesi ini.
                                </p>
                            )}

                            {recordedTargets.length > 0 && (
                                <div className="mt-4 text-sm">
                                    <p className="font-bold text-deep-navy dark:text-white">Pratinjau model browser</p>
                                    {preview.ok && preview.model ? (
                                        <p className="mt-1 text-on-surface-variant dark:text-slate-300">
                                            d = {preview.model.a.toFixed(3)} / r {preview.model.b >= 0 ? '+' : '-'}{' '}
                                            {Math.abs(preview.model.b).toFixed(2)}, selisih terbesar {fmtCm(preview.model.max_residual_cm)}. Server
                                            menghitung ulang saat disimpan.
                                        </p>
                                    ) : (
                                        <p className="mt-1 text-amber-800 dark:text-amber-300">{preview.message}</p>
                                    )}
                                </div>
                            )}

                            {notice && (
                                <p
                                    role={notice.tone === 'error' ? 'alert' : 'status'}
                                    className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                                        notice.tone === 'error'
                                            ? 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                                            : notice.tone === 'warn'
                                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                    }`}
                                >
                                    {notice.text}
                                </p>
                            )}

                            <button
                                type="button"
                                className={`${primaryButton} mt-4 w-full`}
                                disabled={!allRecorded || busy}
                                onClick={() => void commit()}
                            >
                                {committing ? 'Menyimpan...' : 'Simpan kalibrasi'}
                            </button>
                            {!allRecorded && (
                                <p className="mt-2 text-xs text-on-surface-variant dark:text-slate-400">
                                    Rekam ketiga titik di halaman ini sebelum menyimpan.
                                </p>
                            )}

                            {committed && (
                                <div className="mt-4 space-y-3">
                                    <p className="text-sm font-bold text-deep-navy dark:text-white">Hasil kalibrasi #{committed.id}</p>
                                    <ModelTable
                                        title="Model browser"
                                        model={committed.browser}
                                        points={committed.points.map((p) => ({ target: p.target_cm, ratio: p.browser_ratio }))}
                                    />
                                    <ModelTable
                                        title="Model engine"
                                        model={committed.engine}
                                        points={committed.points.map((p) => ({ target: p.target_cm, ratio: p.engine_ratio }))}
                                    />
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
