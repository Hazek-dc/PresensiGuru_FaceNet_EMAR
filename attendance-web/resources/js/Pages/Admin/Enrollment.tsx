import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface User {
    id: number;
    name: string;
    email: string;
    role?: string;
    embedding_id?: string | null;
}

interface Props {
    teachers: User[];
}

export default function Enrollment({ teachers }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isCameraLoading, setIsCameraLoading] = useState(true);
    const [hasConsent, setHasConsent] = useState(true);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollSuccess, setEnrollSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);

    const { data, setData, post, reset } = useForm({
        teacher_id: '',
        frame: null as File | null,
    });

    const selectedTeacher = teachers.find(
        (t) => t.id.toString() === data.teacher_id,
    );

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStream(null);
    }, []);

    const startCamera = useCallback(async () => {
        try {
            setIsCameraLoading(true);
            setErrorMsg(null);

            // Stop any existing stream first
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }

            let mediaStream: MediaStream;
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });
            } catch (constraintErr) {
                console.warn(
                    'High resolution camera constraints failed, falling back to default:',
                    constraintErr,
                );
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });
            }

            streamRef.current = mediaStream;
            setStream(mediaStream);
            setIsCameraLoading(false);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play().catch(() => {});
            }
        } catch (error: any) {
            console.error('Error accessing camera:', error);
            setIsCameraLoading(false);
            setErrorMsg(
                'Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan pada browser.',
            );
        }
    }, []);

    // Start camera immediately on mount
    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
        };
    }, [startCamera, stopCamera]);

    // Bind stream to video element whenever stream changes or video element mounts
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
        }
    }, [stream]);

    const captureAndEnroll = () => {
        if (!data.teacher_id || !hasConsent || !videoRef.current || !canvasRef.current || isEnrolling)
            return;

        setIsEnrolling(true);
        setErrorMsg(null);
        setProgress(25);

        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            setProgress(60);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const file = new File(
                            [blob],
                            `enroll_${data.teacher_id}_${Date.now()}.jpg`,
                            { type: 'image/jpeg' },
                        );
                        setData('frame', file);
                        setProgress(85);
                        setTimeout(() => submitEnrollment(file), 150);
                    } else {
                        setErrorMsg('Gagal mengambil frame gambar dari kamera.');
                        setIsEnrolling(false);
                        setProgress(0);
                    }
                },
                'image/jpeg',
                0.95,
            );
        } else {
            setErrorMsg('Konteks canvas tidak tersedia.');
            setIsEnrolling(false);
            setProgress(0);
        }
    };

    const submitEnrollment = (frameFile: File) => {
        post(route('admin.enroll.store'), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setProgress(100);
                setIsEnrolling(false);
                setEnrollSuccess(true);
            },
            onError: (err) => {
                console.error(err);
                setErrorMsg(
                    err.frame ||
                        'Terjadi kesalahan saat memproses pendaftaran biometrik.',
                );
                setIsEnrolling(false);
                setProgress(0);
            },
        });
    };

    const resetProcess = () => {
        reset();
        setEnrollSuccess(false);
        setErrorMsg(null);
        setProgress(0);
        if (!stream) {
            startCamera();
        }
    };

    const canStartEnrollment = Boolean(data.teacher_id && hasConsent && stream && !isEnrolling);

    return (
        <AuthenticatedLayout>
            <Head title="Face Enrollment - Presensi Guru" />

            <div className="flex h-full w-full flex-1 flex-col overflow-y-auto bg-background px-margin-mobile py-6 md:px-margin-desktop">
                <div className="mx-auto flex h-full w-full max-w-container-max flex-col gap-8">
                    {/* Top Configuration & Header */}
                    <div className="flex w-full flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary dark:bg-sky-600 text-on-primary shadow-lg shadow-primary/20">
                                    <span
                                        className="material-symbols-outlined"
                                        style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                        face_retouching_natural
                                    </span>
                                </div>
                                <h1 className="text-headline-lg font-bold tracking-tight text-on-surface dark:text-white">
                                    Teacher Enrollment
                                </h1>
                            </div>
                            <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant dark:text-slate-400">
                                Daftarkan data biometrik wajah guru untuk presensi otomatis presisi tinggi. Pastikan pencahayaan cukup dan wajah menghadap langsung ke kamera.
                            </p>
                        </div>

                        {/* Top Controls: Teacher Select + Consent Switch */}
                        <div className="flex w-full flex-col items-center gap-4 sm:flex-row lg:w-auto">
                            {/* Teacher Select */}
                            <div className="relative w-full sm:w-80">
                                <select
                                    id="teacher-select"
                                    className="w-full appearance-none rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-5 py-3.5 text-label-md text-on-surface dark:text-white shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                                    value={data.teacher_id}
                                    onChange={(e) => {
                                        setData('teacher_id', e.target.value);
                                        setEnrollSuccess(false);
                                        setProgress(0);
                                        setErrorMsg(null);
                                    }}
                                    disabled={isEnrolling}
                                >
                                    <option value="" disabled>
                                        Pilih profil guru...
                                    </option>
                                    {teachers.map((teacher) => (
                                        <option key={teacher.id} value={teacher.id}>
                                            {teacher.name} ({teacher.email})
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant dark:text-slate-400">
                                    <span className="material-symbols-outlined">
                                        unfold_more
                                    </span>
                                </div>
                            </div>

                            {/* Biometric Consent Toggle */}
                            <div
                                onClick={() => {
                                    if (!isEnrolling) setHasConsent(!hasConsent);
                                }}
                                className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3.5 shadow-sm transition-all sm:w-auto ${
                                    hasConsent
                                        ? 'border-primary/40 dark:border-sky-500/30 bg-surface-container-low dark:bg-sky-950/40'
                                        : 'border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/60 hover:bg-surface-variant/30'
                                }`}
                            >
                                <span className="whitespace-nowrap text-label-md font-semibold text-on-surface dark:text-white">
                                    Biometric Consent
                                </span>
                                <div
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                                        hasConsent ? 'bg-primary dark:bg-sky-500' : 'bg-outline-variant dark:bg-white/20'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                                            hasConsent ? 'translate-x-5' : 'translate-x-1'
                                        }`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Error Banner */}
                    {errorMsg && (
                        <div className="flex items-center gap-3 rounded-2xl border border-error/30 bg-error-container p-4 text-on-error-container shadow-sm">
                            <span className="material-symbols-outlined shrink-0 text-error">
                                error
                            </span>
                            <span className="text-body-md font-medium">
                                {errorMsg}
                            </span>
                        </div>
                    )}

                    {/* Immersive Camera View & Controls Grid */}
                    <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-8 pb-10 lg:grid-cols-12">
                        {/* Left Column: Camera View (8 cols) */}
                        <div className="relative col-span-1 flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-outline-variant/40 dark:border-white/10 bg-surface dark:bg-slate-950 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] lg:col-span-8 lg:min-h-[520px]">
                            {/* Glassmorphism Header Overlay */}
                            <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between p-6">
                                <div className="flex items-center gap-3 rounded-2xl border border-white/30 dark:border-white/10 bg-surface/80 dark:bg-slate-900/80 px-4 py-2.5 text-on-surface dark:text-white shadow-sm backdrop-blur-xl">
                                    <div
                                        className={`h-2.5 w-2.5 rounded-full ${
                                            stream
                                                ? 'animate-pulse bg-secondary'
                                                : 'bg-outline'
                                        }`}
                                    />
                                    <span className="text-label-md font-semibold">
                                        {stream ? 'Camera Active' : 'Camera Ready'}
                                    </span>
                                </div>

                                {/* In-viewport Liveness Hint */}
                                <div className="hidden w-36 flex-col items-center gap-1.5 rounded-2xl border border-white/30 dark:border-white/10 bg-surface/80 dark:bg-slate-900/80 p-3 shadow-sm backdrop-blur-xl md:flex">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-400">
                                        <span className="material-symbols-outlined text-[20px]">
                                            center_focus_strong
                                        </span>
                                    </div>
                                    <span className="text-center text-[11px] font-medium leading-tight text-on-surface dark:text-slate-300">
                                        Posisikan Wajah Tegak
                                    </span>
                                </div>
                            </div>

                            {/* Camera Area Content */}
                            {enrollSuccess ? (
                                <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
                                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-secondary-container dark:bg-emerald-950/60 text-on-secondary-container dark:text-emerald-300 shadow-lg shadow-secondary/20">
                                        <span
                                            className="material-symbols-outlined text-[48px]"
                                            style={{ fontVariationSettings: "'FILL' 1" }}
                                        >
                                            check_circle
                                        </span>
                                    </div>
                                    <h3 className="text-headline-md font-bold text-on-surface dark:text-white">
                                        Pendaftaran Berhasil!
                                    </h3>
                                    <p className="mt-2 max-w-md text-body-md text-on-surface-variant dark:text-slate-400">
                                        Template biometrik wajah untuk <strong>{selectedTeacher?.name}</strong> telah berhasil diekstraksi dan disimpan ke sistem.
                                    </p>
                                    <div className="mt-6 flex flex-wrap gap-3">
                                        <button
                                            onClick={resetProcess}
                                            className="flex items-center gap-2 rounded-2xl bg-primary dark:bg-sky-600 px-6 py-3 text-label-md font-semibold text-on-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-container"
                                        >
                                            <span className="material-symbols-outlined">
                                                person_add
                                            </span>
                                            Daftarkan Guru Lain
                                        </button>
                                        <Link
                                            href={route('admin.teachers.index')}
                                            className="flex items-center gap-2 rounded-2xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-white/5 px-6 py-3 text-label-md font-semibold text-on-surface dark:text-white transition-all hover:bg-surface-variant dark:hover:bg-white/10"
                                        >
                                            <span className="material-symbols-outlined">
                                                group
                                            </span>
                                            Ke Manajemen Guru
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Video Stream */}
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        onLoadedMetadata={() => {
                                            videoRef.current?.play().catch(() => {});
                                        }}
                                        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                                            stream ? 'opacity-100' : 'opacity-0'
                                        }`}
                                        style={{ transform: 'scaleX(-1)' }}
                                    />

                                    {/* Offline / Standby State */}
                                    {!stream && (
                                        <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center text-on-surface-variant/60 dark:text-slate-400">
                                            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-outline-variant/40 dark:border-white/10 bg-surface-container dark:bg-white/5 text-on-surface-variant dark:text-slate-300">
                                                <span className="material-symbols-outlined text-[42px]">
                                                    {isCameraLoading ? 'sync' : 'videocam_off'}
                                                </span>
                                            </div>
                                            <p className="text-body-lg font-semibold text-on-surface dark:text-white">
                                                {isCameraLoading
                                                    ? 'Menginisialisasi Kamera...'
                                                    : 'Kamera Belum Aktif'}
                                            </p>
                                            <p className="mt-1.5 max-w-sm text-body-sm text-on-surface-variant dark:text-slate-400">
                                                {isCameraLoading
                                                    ? 'Mohon izinkan akses kamera di browser Anda saat diminta.'
                                                    : 'Pastikan izin kamera aktif pada browser Anda, lalu klik tombol di bawah.'}
                                            </p>
                                            {!isCameraLoading && (
                                                <button
                                                    type="button"
                                                    onClick={startCamera}
                                                    className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary dark:bg-sky-600 px-5 py-2.5 text-label-md font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-container"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">
                                                        videocam
                                                    </span>
                                                    Nyalakan Kamera
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Premium Face Guide Frame & Corner Reticles */}
                                    {stream && (
                                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-80 w-64 -translate-x-1/2 -translate-y-1/2 md:h-96 md:w-80">
                                            {/* Corner Brackets */}
                                            <svg
                                                className="absolute inset-0 h-full w-full text-white drop-shadow-md"
                                                fill="none"
                                                viewBox="0 0 320 384"
                                                xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path
                                                    d="M40 0H24C10.7452 0 0 10.7452 0 24V40"
                                                    stroke="currentColor"
                                                    strokeLinecap="round"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    d="M280 0H296C309.255 0 320 10.7452 320 24V40"
                                                    stroke="currentColor"
                                                    strokeLinecap="round"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    d="M40 384H24C10.7452 384 0 373.255 0 360V344"
                                                    stroke="currentColor"
                                                    strokeLinecap="round"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    d="M280 384H296C309.255 384 320 373.255 320 360V344"
                                                    stroke="currentColor"
                                                    strokeLinecap="round"
                                                    strokeWidth="4"
                                                />
                                                <rect
                                                    className={`transition-all duration-300 ${
                                                        isEnrolling
                                                            ? 'stroke-secondary opacity-100'
                                                            : 'opacity-40'
                                                    }`}
                                                    height="380"
                                                    rx="38"
                                                    stroke="currentColor"
                                                    strokeDasharray="10 10"
                                                    strokeWidth="2"
                                                    width="316"
                                                    x="2"
                                                    y="2"
                                                    style={{ fill: 'none' }}
                                                />
                                            </svg>

                                            {/* Center Reticle */}
                                            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60" />

                                            {/* Scanner Laser Line */}
                                            {isEnrolling && (
                                                <div className="scanner-line absolute left-0 right-0 z-10 h-1 bg-gradient-to-r from-transparent via-primary dark:via-sky-400 to-transparent shadow-[0_0_20px_rgba(31,16,142,0.8)]" />
                                            )}
                                        </div>
                                    )}

                                    {/* Bottom Instruction Overlay */}
                                    {stream && (
                                        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 flex w-[90%] max-w-sm -translate-x-1/2 items-center gap-4 rounded-3xl border border-white/20 dark:border-white/10 bg-inverse-surface/85 dark:bg-slate-900/90 px-6 py-4 text-inverse-on-surface dark:text-white shadow-2xl backdrop-blur-xl">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed/25 dark:bg-sky-500/20">
                                                <span className="material-symbols-outlined text-tertiary-fixed dark:text-sky-400">
                                                    face
                                                </span>
                                            </div>
                                            <div>
                                                <h4 className="text-label-md font-semibold">
                                                    {isEnrolling
                                                        ? 'Merekam Fitur Wajah...'
                                                        : 'Posisikan Wajah di Tengah'}
                                                </h4>
                                                <p className="mt-0.5 text-xs text-inverse-on-surface/80 dark:text-slate-300">
                                                    {isEnrolling
                                                        ? 'Sedang mengekstrak embedding 512-dim...'
                                                        : 'Sejajarkan wajah dengan bingkai pemindai.'}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Right Column: Challenges & Actions (4 cols) */}
                        <div className="col-span-1 flex flex-col gap-6 lg:col-span-4">
                            {/* Verification Steps Card */}
                            <div className="flex flex-col gap-5 rounded-3xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-[#0F1B36] p-6 shadow-sm">
                                <h3 className="flex items-center gap-2 text-headline-md font-bold text-on-surface dark:text-white">
                                    <span className="material-symbols-outlined text-primary dark:text-sky-400">
                                        fact_check
                                    </span>
                                    Verification Steps
                                </h3>

                                <div className="flex flex-col gap-3.5">
                                    {/* Step 1 */}
                                    <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-primary/25 dark:border-sky-500/30 bg-surface-container-low dark:bg-white/5 p-3.5 shadow-sm">
                                        <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-primary dark:bg-sky-500" />
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 dark:border-white/10 bg-surface dark:bg-slate-900 text-primary dark:text-sky-400">
                                            <span
                                                className="material-symbols-outlined text-[22px]"
                                                style={{ fontVariationSettings: "'FILL' 1" }}
                                            >
                                                visibility
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-label-md font-semibold text-on-surface dark:text-white">
                                                1. Deteksi Mata & Wajah
                                            </h4>
                                            <p className="text-[11px] text-on-surface-variant dark:text-slate-400">
                                                {stream
                                                    ? 'Wajah terdeteksi di frame'
                                                    : 'Menunggu kamera aktif...'}
                                            </p>
                                        </div>
                                        <div
                                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                                                stream
                                                    ? 'border-secondary bg-secondary text-white'
                                                    : 'border-outline-variant/50 dark:border-white/20 text-outline-variant/50 dark:text-white/20'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[14px]">
                                                {stream ? 'check' : 'more_horiz'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Step 2 */}
                                    <div
                                        className={`flex items-center gap-4 rounded-2xl border p-3.5 transition-opacity ${
                                            isEnrolling || enrollSuccess
                                                ? 'border-primary/25 dark:border-sky-500/30 bg-surface-container-low dark:bg-white/5 opacity-100'
                                                : 'border-transparent opacity-60'
                                        }`}
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 dark:border-white/10 bg-surface dark:bg-slate-900 text-on-surface-variant dark:text-slate-300">
                                            <span className="material-symbols-outlined text-[22px]">
                                                sentiment_satisfied
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-label-md font-semibold text-on-surface dark:text-white">
                                                2. Verifikasi Liveness
                                            </h4>
                                            <p className="text-[11px] text-on-surface-variant dark:text-slate-400">
                                                {enrollSuccess
                                                    ? 'Lolos uji ekspresi & keaslian'
                                                    : isEnrolling
                                                       ? 'Mengevaluasi kualitas...'
                                                       : 'Pending'}
                                            </p>
                                        </div>
                                        <div
                                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                                                enrollSuccess
                                                    ? 'border-secondary bg-secondary text-white'
                                                    : 'border-outline-variant/30 dark:border-white/20'
                                            }`}
                                        >
                                            {enrollSuccess && (
                                                <span className="material-symbols-outlined text-[14px]">
                                                    check
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Step 3 */}
                                    <div
                                        className={`flex items-center gap-4 rounded-2xl border p-3.5 transition-opacity ${
                                            enrollSuccess
                                                ? 'border-primary/25 dark:border-sky-500/30 bg-surface-container-low dark:bg-white/5 opacity-100'
                                                : 'border-transparent opacity-60'
                                        }`}
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 dark:border-white/10 bg-surface dark:bg-slate-900 text-on-surface-variant dark:text-slate-300">
                                            <span className="material-symbols-outlined text-[22px]">
                                                fingerprint
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-label-md font-semibold text-on-surface dark:text-white">
                                                3. Ekstraksi Vektor 512D
                                            </h4>
                                            <p className="text-[11px] text-on-surface-variant dark:text-slate-400">
                                                {enrollSuccess
                                                    ? 'Tersimpan di database'
                                                    : 'Pending'}
                                            </p>
                                        </div>
                                        <div
                                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                                                enrollSuccess
                                                    ? 'border-secondary bg-secondary text-white'
                                                    : 'border-outline-variant/30 dark:border-white/20'
                                            }`}
                                        >
                                            {enrollSuccess && (
                                                <span className="material-symbols-outlined text-[14px]">
                                                    check
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Spacer */}
                            <div className="flex-1" />

                            {/* Progress & Action Card */}
                            <div className="flex flex-col gap-6 rounded-3xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-[#0F1B36] p-6 shadow-sm">
                                <div className="w-full">
                                    <div className="mb-3 flex items-end justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-label-md font-semibold text-on-surface dark:text-white">
                                                Overall Progress
                                            </span>
                                            <span className="text-xs text-on-surface-variant dark:text-slate-400">
                                                {enrollSuccess
                                                    ? 'Enrollment selesai'
                                                    : isEnrolling
                                                       ? 'Memproses pendaftaran...'
                                                       : canStartEnrollment
                                                         ? 'Siap untuk pendaftaran'
                                                         : !data.teacher_id
                                                           ? 'Pilih profil guru di atas'
                                                           : !hasConsent
                                                             ? 'Aktifkan Biometric Consent'
                                                             : 'Menunggu kamera aktif'}
                                            </span>
                                        </div>
                                        <span className="text-2xl font-bold tracking-tighter text-primary dark:text-sky-400">
                                            {progress}%
                                        </span>
                                    </div>
                                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-variant dark:bg-white/10">
                                        <div
                                            className="h-full rounded-full bg-primary dark:bg-sky-500 transition-all duration-500 ease-out"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>

                                <button
                                    id="enroll-btn"
                                    type="button"
                                    onClick={captureAndEnroll}
                                    disabled={!canStartEnrollment}
                                    className={`flex w-full transform items-center justify-center gap-3 rounded-2xl py-4 text-[16px] font-semibold text-on-primary shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
                                        enrollSuccess
                                            ? 'bg-secondary shadow-secondary/20 hover:bg-secondary-container'
                                            : 'bg-primary dark:bg-sky-600 shadow-primary/20 hover:bg-primary-container dark:hover:bg-sky-500'
                                    }`}
                                >
                                    {isEnrolling ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin">
                                                sync
                                            </span>
                                            Memproses Biometrik...
                                        </>
                                    ) : enrollSuccess ? (
                                        <>
                                            <span className="material-symbols-outlined">
                                                check_circle
                                            </span>
                                            Enrollment Selesai
                                        </>
                                    ) : !data.teacher_id ? (
                                        <>
                                            <span className="material-symbols-outlined">
                                                person_search
                                            </span>
                                            Pilih Profil Guru Dahulu
                                        </>
                                    ) : !hasConsent ? (
                                        <>
                                            <span className="material-symbols-outlined">
                                                shield_person
                                            </span>
                                            Aktifkan Persetujuan Biometrik
                                        </>
                                    ) : !stream ? (
                                        <>
                                            <span className="material-symbols-outlined">
                                                videocam_off
                                            </span>
                                            Kamera Belum Aktif
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined">
                                                face_retouching_natural
                                            </span>
                                            Start Enrollment
                                        </>
                                    )}
                                </button>

                                {enrollSuccess && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEnrollSuccess(false);
                                            setProgress(0);
                                            reset('frame', 'teacher_id');
                                            startCamera();
                                        }}
                                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-high dark:bg-white/10 py-3 text-sm font-bold text-deep-navy dark:text-white hover:bg-surface-container-highest dark:hover:bg-white/20 transition-all active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">replay</span>
                                        <span>Ulangi / Daftarkan Guru Lain</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Hidden Canvas for Frame Capture */}
                    <canvas ref={canvasRef} className="hidden" />
                </div>
            </div>

            {/* Laser scanning animation */}
            <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .scanner-line {
                    animation: scan 2s infinite ease-in-out;
                }
            `}</style>
        </AuthenticatedLayout>
    );
}

