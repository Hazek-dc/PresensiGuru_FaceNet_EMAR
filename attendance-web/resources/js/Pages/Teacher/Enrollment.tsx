import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UserData {
    id: number;
    name: string;
    email: string;
    role: string;
    embedding_id: string | null;
    department: string;
    is_active: boolean;
    photo_url: string | null;
}

interface Props {
    user: UserData;
}

// Staggered Container Animation
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.04,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: {
        opacity: 1,
        y: 0,
        transition: {
            type: 'spring' as const,
            damping: 24,
            stiffness: 300,
        },
    },
};

export default function TeacherEnrollment({ user }: Props) {
    const { flash } = (usePage().props as any) || {};

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isCameraLoading, setIsCameraLoading] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isFlashing, setIsFlashing] = useState(false);
    const [inputMode, setInputMode] = useState<'camera' | 'upload'>('camera');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm({
        frame: null as File | null,
    });

    // Cleanup camera stream
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
    }, []);

    // Start camera stream
    const startCamera = useCallback(async () => {
        try {
            setIsCameraLoading(true);
            setCameraError(null);

            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
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
            } catch {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });
            }

            streamRef.current = mediaStream;
            setIsCameraActive(true);
            setIsCameraLoading(false);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play().catch(() => {});
            }
        } catch (err: any) {
            console.error('Gagal mengakses kamera:', err);
            setIsCameraLoading(false);
            setIsCameraActive(false);
            setCameraError(
                'Kamera tidak dapat diakses. Pastikan izin kamera telah diizinkan di browser Anda.',
            );
        }
    }, []);

    // Start camera on mount if in camera mode and no captured preview
    useEffect(() => {
        if (inputMode === 'camera' && !capturedPreview) {
            startCamera();
        }
        return () => {
            stopCamera();
        };
    }, [inputMode, capturedPreview, startCamera, stopCamera]);

    // Handle Countdown and Snapshot capture
    const triggerSnapshotWithCountdown = () => {
        if (countdown !== null || !isCameraActive) return;

        setCountdown(3);
        let count = 3;
        const timer = setInterval(() => {
            count -= 1;
            if (count > 0) {
                setCountdown(count);
            } else {
                clearInterval(timer);
                setCountdown(null);
                takeSnapshot();
            }
        }, 750);
    };

    const takeSnapshot = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        // Visual flash trigger
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 200);

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    const file = new File(
                        [blob],
                        `enroll_face_${user.id}_${Date.now()}.jpg`,
                        { type: 'image/jpeg' },
                    );
                    setData('frame', file);
                    setCapturedPreview(canvas.toDataURL('image/jpeg', 0.94));
                    stopCamera();
                }
            },
            'image/jpeg',
            0.94,
        );
    };

    const handleRetake = () => {
        setCapturedPreview(null);
        setData('frame', null);
        startCamera();
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setData('frame', file);
            const reader = new FileReader();
            reader.onload = (ev) => {
                setCapturedPreview(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
            stopCamera();
        }
    };

    const handleSubmitEnrollment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!data.frame) return;

        post(route('teacher.enrollment.store'), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setCapturedPreview(null);
                reset('frame');
            },
        });
    };

    const handleResetBiometric = () => {
        setIsResetting(true);
        router.delete(route('teacher.enrollment.destroy'), {
            preserveScroll: true,
            onSuccess: () => {
                setShowResetConfirm(false);
                setIsResetting(false);
                setCapturedPreview(null);
                startCamera();
            },
            onError: () => {
                setIsResetting(false);
            },
        });
    };

    // Current Stepper Step (1: Position/Capture, 2: Review, 3: Success)
    const currentStep = flash?.success ? 3 : capturedPreview ? 2 : 1;

    return (
        <AuthenticatedLayout>
            <Head title="Enrollment Wajah Guru - Presensi FaceNet" />

            <div className="mx-auto max-w-6xl px-3.5 py-4 sm:px-6 md:py-8">
                {/* ======================================================== */}
                {/* 1. FLASH SUCCESS BANNER                                  */}
                {/* ======================================================== */}
                <AnimatePresence>
                    {flash?.success && (
                        <motion.div
                            initial={{ opacity: 0, y: -12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -12, scale: 0.98 }}
                            className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:via-teal-500/10 dark:to-transparent p-4 sm:p-5 text-emerald-900 dark:text-emerald-300 shadow-md shadow-emerald-500/5 backdrop-blur-xl"
                        >
                            <div className="flex items-start sm:items-center gap-3.5">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-inner">
                                    <span className="material-symbols-outlined text-[24px]">verified</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                            Selesai
                                        </span>
                                        <h4 className="text-sm font-extrabold text-deep-navy dark:text-white">
                                            Wajah Berhasil Terdaftar!
                                        </h4>
                                    </div>
                                    <p className="text-xs text-emerald-800/80 dark:text-emerald-300/90 mt-1 leading-relaxed">
                                        {flash.success}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={route('presensi')}
                                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/30 hover:brightness-110 active:scale-95 transition-all w-full sm:w-auto shrink-0"
                            >
                                <span>Mulai Presensi Sekarang</span>
                                <span className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-1">
                                    arrow_forward
                                </span>
                            </Link>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ======================================================== */}
                {/* 2. HERO HEADER & STEPPER FLOW                           */}
                {/* ======================================================== */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="mb-6 sm:mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"
                >
                    <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-accent/30 bg-sky-accent/10 dark:bg-sky-accent/15 px-3 py-0.5 text-[11px] font-bold text-royal-blue dark:text-sky-300">
                                <span className="material-symbols-outlined text-[14px]">face</span>
                                Biometric Enrollment
                            </span>
                            <span className="rounded-full bg-surface-container-high dark:bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-on-surface-variant dark:text-slate-300">
                                {user.department || 'Guru Pengajar'}
                            </span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white tracking-tight">
                            Pendaftaran Biometrik Wajah
                        </h2>
                        <p className="text-xs sm:text-sm text-on-surface-variant dark:text-slate-400 max-w-xl">
                            Ambil foto wajah Anda untuk mendaftarkan vektor FaceNet ke database agar sistem mengenali kehadiran Anda.
                        </p>
                    </div>

                    {/* Status Pill & Action */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3">
                        <div
                            className={`flex flex-1 sm:flex-initial items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-xs backdrop-blur-md transition-all ${
                                user.embedding_id
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                    : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                            }`}
                        >
                            <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                    user.embedding_id
                                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse'
                                }`}
                            >
                                <span
                                    className="material-symbols-outlined text-[20px]"
                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                    {user.embedding_id ? 'verified_user' : 'warning'}
                                </span>
                            </div>
                            <div>
                                <div className="text-[9px] font-bold uppercase tracking-wider opacity-75">
                                    Status Biometrik
                                </div>
                                <div className="text-xs font-extrabold truncate max-w-[160px] sm:max-w-[200px]">
                                    {user.embedding_id
                                        ? `Aktif (${user.embedding_id})`
                                        : 'Belum Terdaftar'}
                                </div>
                            </div>
                        </div>

                        {user.embedding_id && (
                            <button
                                type="button"
                                onClick={() => setShowResetConfirm(true)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-red-500/20 bg-red-500/10 dark:bg-red-500/15 px-3.5 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 active:scale-95 transition-all shrink-0 min-h-[44px]"
                                title="Reset data pendaftaran untuk foto ulang"
                            >
                                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                <span>Daftar Ulang</span>
                            </button>
                        )}
                    </div>
                </motion.div>

                {/* ======================================================== */}
                {/* 3. INTERACTIVE 3-STEP PROGRESS STEPPER                   */}
                {/* ======================================================== */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.1 }}
                    className="mb-6 sm:mb-8 flex flex-col sm:grid sm:grid-cols-3 gap-3 sm:gap-4 rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/80 dark:bg-[#112338]/80 p-4 shadow-xs backdrop-blur-xl"
                >
                    {/* Step 1: Posisikan Wajah */}
                    <div className="flex items-center gap-3">
                        <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold transition-all ${
                                currentStep >= 1
                                    ? 'bg-royal-blue text-white shadow-sm shadow-royal-blue/30'
                                    : 'bg-surface-container-high dark:bg-white/10 text-on-surface-variant dark:text-slate-400'
                            }`}
                        >
                            1
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-deep-navy dark:text-white truncate">
                                Posisikan Wajah
                            </div>
                            <div className="text-[10px] text-on-surface-variant dark:text-slate-400 truncate">
                                Panduan oval kamera
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Ambil & Review */}
                    <div className="flex items-center gap-3">
                        <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold transition-all ${
                                currentStep >= 2
                                    ? 'bg-royal-blue text-white shadow-sm shadow-royal-blue/30'
                                    : 'bg-surface-container-high dark:bg-white/10 text-on-surface-variant dark:text-slate-400'
                            }`}
                        >
                            2
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-deep-navy dark:text-white truncate">
                                Ambil Snapshot
                            </div>
                            <div className="text-[10px] text-on-surface-variant dark:text-slate-400 truncate">
                                Tinjau hasil foto
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Verifikasi */}
                    <div className="flex items-center gap-3">
                        <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold transition-all ${
                                currentStep >= 3
                                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                                    : 'bg-surface-container-high dark:bg-white/10 text-on-surface-variant dark:text-slate-400'
                            }`}
                        >
                            3
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-deep-navy dark:text-white truncate">
                                Simpan Biometrik
                            </div>
                            <div className="text-[10px] text-on-surface-variant dark:text-slate-400 truncate">
                                Siap presensi kamera
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ======================================================== */}
                {/* 4. MAIN ENROLLMENT STUDIO GRID (Camera + Guide)          */}
                {/* ======================================================== */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start"
                >
                    {/* LEFT: Live Camera Scanner / Snapshot Review (7 Cols) */}
                    <motion.div variants={itemVariants} className="lg:col-span-7 flex flex-col gap-4">
                        {/* Mode Switcher Animated Tabs */}
                        <div className="relative flex items-center justify-between rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#112338]/90 p-1.5 shadow-xs backdrop-blur-xl">
                            <div className="grid grid-cols-2 gap-1.5 w-full sm:flex sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setInputMode('camera');
                                        setCapturedPreview(null);
                                    }}
                                    className={`relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors min-h-[40px] ${
                                        inputMode === 'camera'
                                            ? 'text-white'
                                            : 'text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-white'
                                    }`}
                                >
                                    {inputMode === 'camera' && (
                                        <motion.div
                                            layoutId="enrollmentTab"
                                            className="absolute inset-0 rounded-xl bg-royal-blue shadow-sm"
                                            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                                        />
                                    )}
                                    <span className="relative z-10 material-symbols-outlined text-[18px]">videocam</span>
                                    <span className="relative z-10 hidden xs:inline sm:hidden">Kamera</span>
                                    <span className="relative z-10 hidden sm:inline">Kamera Laptop / HP</span>
                                    <span className="relative z-10 xs:hidden">Kamera</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setInputMode('upload');
                                        stopCamera();
                                    }}
                                    className={`relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors min-h-[40px] ${
                                        inputMode === 'upload'
                                            ? 'text-white'
                                            : 'text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-white'
                                    }`}
                                >
                                    {inputMode === 'upload' && (
                                        <motion.div
                                            layoutId="enrollmentTab"
                                            className="absolute inset-0 rounded-xl bg-royal-blue shadow-sm"
                                            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                                        />
                                    )}
                                    <span className="relative z-10 material-symbols-outlined text-[18px]">upload_file</span>
                                    <span className="relative z-10 hidden xs:inline sm:hidden">Upload</span>
                                    <span className="relative z-10 hidden sm:inline">Unggah Foto Selfie</span>
                                    <span className="relative z-10 xs:hidden">Upload</span>
                                </button>
                            </div>

                            {inputMode === 'camera' && isCameraActive && (
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant dark:text-slate-400 hover:bg-surface-container-high dark:hover:bg-white/10 transition-colors"
                                    title="Segarkan Kamera"
                                >
                                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                                </button>
                            )}
                        </div>

                        {/* Viewfinder Container Card */}
                        <div className="relative overflow-hidden rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-slate-950 shadow-2xl transition-all">
                            {/* Processing canvas */}
                            <canvas ref={canvasRef} className="hidden" />

                            {/* Camera Mode */}
                            {inputMode === 'camera' && (
                                <div className="relative aspect-[3/4] sm:aspect-[4/3] w-full overflow-hidden bg-slate-950 flex items-center justify-center">
                                    {/* Video Stream */}
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className={`h-full w-full object-cover -scale-x-100 transition-opacity duration-300 ${
                                            isCameraActive && !capturedPreview ? 'opacity-100' : 'opacity-0'
                                        }`}
                                    />

                                    {/* Freeze Frame Preview if taken */}
                                    {capturedPreview && (
                                        <motion.img
                                            initial={{ scale: 1.05, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 0.3, ease: 'easeOut' }}
                                            src={capturedPreview}
                                            alt="Snapshot Preview"
                                            className="absolute inset-0 h-full w-full object-cover -scale-x-100"
                                        />
                                    )}

                                    {/* Flash shutter feedback animation */}
                                    {isFlashing && (
                                        <div className="absolute inset-0 bg-white z-30 animate-ping"></div>
                                    )}

                                    {/* Top Viewfinder HUD Chips */}
                                    {isCameraActive && !capturedPreview && (
                                        <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between z-20 pointer-events-none">
                                            <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold text-emerald-400 backdrop-blur-md border border-emerald-500/30">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                                <span>LIVE CAMERA HD</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold text-sky-300 backdrop-blur-md border border-sky-400/30">
                                                <span className="material-symbols-outlined text-[12px]">biotech</span>
                                                <span>FACENET AI</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Laser Scan Sweeping Line Animation */}
                                    {isCameraActive && !capturedPreview && (
                                        <motion.div
                                            animate={{ y: ['-10%', '110%', '-10%'] }}
                                            transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
                                            className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] opacity-75 z-15"
                                        />
                                    )}

                                    {/* Loading State */}
                                    {isCameraLoading && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90 text-white z-20 p-4">
                                            <div className="h-10 w-10 animate-spin rounded-full border-3 border-sky-400 border-t-transparent"></div>
                                            <p className="text-xs font-semibold text-slate-300 text-center">
                                                Mengaktifkan sensor kamera webcam...
                                            </p>
                                        </div>
                                    )}

                                    {/* Camera Error Message */}
                                    {cameraError && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 text-white z-20">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 mb-3">
                                                <span className="material-symbols-outlined text-[28px]">videocam_off</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-white mb-1">Akses Kamera Terkendala</h4>
                                            <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">{cameraError}</p>
                                            <button
                                                type="button"
                                                onClick={startCamera}
                                                className="inline-flex items-center gap-2 rounded-xl bg-royal-blue px-4 py-2 text-xs font-bold text-white hover:brightness-110 active:scale-95 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">refresh</span>
                                                <span>Coba Lagi</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Real-time Oval Face Reticle Guide Overlay */}
                                    {isCameraActive && !capturedPreview && (
                                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4 z-10">
                                            {/* Oval Reticle Guide */}
                                            <div className="relative h-48 w-36 xs:h-56 xs:w-44 sm:h-64 sm:w-52 md:h-72 md:w-56 rounded-[50%] border-2 border-dashed border-sky-400/80 shadow-[0_0_30px_rgba(56,189,248,0.35)] animate-pulse">
                                                {/* Corner Crosshairs */}
                                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-1 bg-sky-400 rounded-full"></div>
                                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 bg-sky-400 rounded-full"></div>
                                                <div className="absolute top-1/2 -left-2 -translate-y-1/2 h-4 w-1 bg-sky-400 rounded-full"></div>
                                                <div className="absolute top-1/2 -right-2 -translate-y-1/2 h-4 w-1 bg-sky-400 rounded-full"></div>
                                            </div>

                                            {/* Sub-label guide */}
                                            <div className="mt-3.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-sky-200 backdrop-blur-md border border-white/10 text-center max-w-[90%] truncate shadow-lg">
                                                Posisikan wajah Anda tegak di dalam oval
                                            </div>
                                        </div>
                                    )}

                                    {/* Countdown Overlay with Spring Pop */}
                                    <AnimatePresence>
                                        {countdown !== null && (
                                            <motion.div
                                                initial={{ scale: 0.3, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                exit={{ scale: 1.6, opacity: 0 }}
                                                transition={{ type: 'spring', damping: 15, stiffness: 400 }}
                                                className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs z-30"
                                            >
                                                <div className="flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full bg-gradient-to-tr from-royal-blue to-sky-accent border-4 border-white text-4xl sm:text-5xl font-black text-white shadow-2xl">
                                                    {countdown}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* Upload File Mode */}
                            {inputMode === 'upload' && (
                                <div className="relative aspect-[3/4] sm:aspect-[4/3] w-full bg-slate-950 p-4 sm:p-6 flex flex-col items-center justify-center text-center">
                                    {capturedPreview ? (
                                        <div className="relative h-full w-full">
                                            <img
                                                src={capturedPreview}
                                                alt="Preview Upload"
                                                className="h-full w-full object-contain rounded-2xl"
                                            />
                                        </div>
                                    ) : (
                                        <label className="group flex flex-col items-center justify-center w-full h-full border-2 border-dashed border-slate-700 hover:border-sky-400/80 rounded-2xl cursor-pointer bg-slate-900/50 hover:bg-slate-900/80 transition-all p-6">
                                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-royal-blue/20 text-sky-400 group-hover:scale-110 transition-transform mb-3">
                                                <span className="material-symbols-outlined text-[32px]">add_a_photo</span>
                                            </div>
                                            <p className="text-sm font-bold text-white mb-1">
                                                Pilih Foto Selfie Wajah
                                            </p>
                                            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                                                Format JPG, PNG atau JPEG (Maks. 10MB). Pastikan wajah terlihat jelas dan tegak lurus ke kamera.
                                            </p>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleFileUpload}
                                            />
                                        </label>
                                    )}
                                </div>
                            )}

                            {/* Viewfinder Bottom Action Toolbar */}
                            <div className="border-t border-white/10 bg-slate-900/95 p-3.5 sm:p-4 backdrop-blur-xl">
                                {capturedPreview ? (
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={handleRetake}
                                            disabled={processing}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50 min-h-[44px]"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">replay</span>
                                            <span>Foto Ulang</span>
                                        </button>

                                        <form onSubmit={handleSubmitEnrollment} className="w-full sm:w-auto">
                                            <button
                                                type="submit"
                                                disabled={processing}
                                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 min-h-[44px]"
                                            >
                                                {processing ? (
                                                    <>
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                                        <span>Mendaftarkan Vektor Wajah...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-[18px]">verified</span>
                                                        <span>Simpan & Daftarkan Wajah</span>
                                                    </>
                                                )}
                                            </button>
                                        </form>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center w-full">
                                        {inputMode === 'camera' && (
                                            <button
                                                type="button"
                                                onClick={triggerSnapshotWithCountdown}
                                                disabled={!isCameraActive || countdown !== null}
                                                className="w-full sm:w-auto group inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-royal-blue to-deep-navy dark:from-sky-accent dark:to-royal-blue px-7 py-3.5 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-royal-blue/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 min-h-[46px]"
                                            >
                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 group-hover:scale-110 transition-transform">
                                                    <span className="material-symbols-outlined text-[18px] text-white">
                                                        photo_camera
                                                    </span>
                                                </div>
                                                <span>Ambil Foto Wajah (3s)</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {errors.frame && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-600 dark:text-red-400"
                            >
                                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                                <span>{errors.frame}</span>
                            </motion.div>
                        )}
                    </motion.div>

                    {/* RIGHT: Profile Details, Guidelines, and Quick Verification CTA (5 Cols) */}
                    <motion.div variants={itemVariants} className="lg:col-span-5 flex flex-col gap-4">
                        {/* Profile Identity Card */}
                        <div className="rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/85 dark:bg-[#112338]/85 p-5 shadow-xs backdrop-blur-xl">
                            <div className="flex items-center gap-3.5 mb-4 pb-4 border-b border-outline-variant/40 dark:border-white/10">
                                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-royal-blue to-sky-accent text-lg font-bold text-white shadow-sm overflow-hidden ring-2 ring-royal-blue/20">
                                    {user.photo_url ? (
                                        <img
                                            src={user.photo_url}
                                            alt={user.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        user.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-extrabold text-deep-navy dark:text-white truncate">
                                        {user.name}
                                    </h3>
                                    <p className="text-xs text-on-surface-variant dark:text-slate-400 truncate mt-0.5">
                                        {user.email}
                                    </p>
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <span className="inline-block rounded-md bg-sky-accent/15 px-2 py-0.5 text-[10px] font-bold text-royal-blue dark:text-sky-300">
                                            {user.role === 'teacher' ? 'Tenaga Pengajar (Guru)' : user.role}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Biometric Technical Details */}
                            <div className="space-y-2.5 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-on-surface-variant dark:text-slate-400">ID Embedding:</span>
                                    <span className="font-mono font-bold text-deep-navy dark:text-white bg-surface-container-high dark:bg-white/10 px-2 py-0.5 rounded-md">
                                        {user.embedding_id || '- (Belum Ada)'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-on-surface-variant dark:text-slate-400">Model Ekstraksi:</span>
                                    <span className="font-semibold text-royal-blue dark:text-sky-300">
                                        FaceNet (128-D / 512-D)
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-on-surface-variant dark:text-slate-400">Deteksi Liveness:</span>
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                        EMAR Dynamic (EAR + MAR)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Quality Guidelines Card */}
                        <div className="rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/85 dark:bg-[#112338]/85 p-5 shadow-xs backdrop-blur-xl">
                            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-white mb-3.5">
                                <span className="material-symbols-outlined text-[18px] text-royal-blue dark:text-sky-300">
                                    lightbulb
                                </span>
                                Panduan Foto Wajah yang Valid
                            </h4>

                            <ul className="space-y-3 text-xs text-on-surface-variant dark:text-slate-300">
                                <li className="flex items-start gap-3">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold mt-0.5">
                                        1
                                    </div>
                                    <span>
                                        <strong className="text-on-surface dark:text-white">Pencahayaan Terang:</strong> Pastikan cahaya merata di wajah tanpa bayangan gelap atau backlight.
                                    </span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold mt-0.5">
                                        2
                                    </div>
                                    <span>
                                        <strong className="text-on-surface dark:text-white">Posisi Lurus:</strong> Hadapkan wajah tegak lurus ke arah lensa webcam dengan jarak sekitar 40–60 cm.
                                    </span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold mt-0.5">
                                        3
                                    </div>
                                    <span>
                                        <strong className="text-on-surface dark:text-white">Bebas Aksesori:</strong> Lepaskan kacamata hitam, masker, atau topi yang menutupi kontur mata dan mulut.
                                    </span>
                                </li>
                            </ul>
                        </div>

                        {/* Direct Attendance CTA Link */}
                        <div className="rounded-3xl border border-sky-accent/30 bg-gradient-to-br from-royal-blue/10 via-sky-accent/10 to-transparent dark:from-royal-blue/20 dark:via-sky-accent/15 dark:to-transparent p-5 backdrop-blur-xl">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h4 className="text-xs font-extrabold text-royal-blue dark:text-sky-300 uppercase tracking-wider">
                                        Siap Melakukan Presensi?
                                    </h4>
                                    <p className="text-xs text-on-surface-variant dark:text-slate-300 mt-1 leading-relaxed">
                                        Setelah data biometrik tersimpan, Anda dapat langsung melakukan presensi kehadiran melalui kamera.
                                    </p>
                                </div>
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-blue text-white shadow-md shadow-royal-blue/20">
                                    <span className="material-symbols-outlined text-[20px]">document_scanner</span>
                                </div>
                            </div>

                            <Link
                                href={route('presensi')}
                                className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue to-deep-navy dark:from-sky-accent dark:to-royal-blue px-4 py-3 text-xs font-bold text-white shadow-md shadow-royal-blue/20 hover:brightness-110 active:scale-95 transition-all min-h-[44px]"
                            >
                                <span>Buka Halaman Presensi Kamera</span>
                                <span className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-1">
                                    arrow_forward
                                </span>
                            </Link>
                        </div>
                    </motion.div>
                </motion.div>

                {/* ======================================================== */}
                {/* 5. MODAL CONFIRMATION: RESET BIOMETRIC DATA              */}
                {/* ======================================================== */}
                <AnimatePresence>
                    {showResetConfirm && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: 10 }}
                                transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                                className="w-full max-w-md rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest dark:bg-[#112338] p-6 shadow-2xl"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-500 mb-4 shadow-inner">
                                    <span className="material-symbols-outlined text-[28px]">warning</span>
                                </div>
                                <h3 className="text-base font-extrabold text-deep-navy dark:text-white">
                                    Konfirmasi Reset Biometrik
                                </h3>
                                <p className="text-xs text-on-surface-variant dark:text-slate-300 mt-2 leading-relaxed">
                                    Apakah Anda yakin ingin menghapus data biometrik wajah terdaftar Anda? Anda harus melakukan pendaftaran foto wajah baru sebelum dapat presensi kembali.
                                </p>

                                <div className="mt-6 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowResetConfirm(false)}
                                        disabled={isResetting}
                                        className="rounded-2xl border border-outline-variant/60 dark:border-white/10 px-4 py-2.5 text-xs font-bold text-on-surface dark:text-white hover:bg-surface-container-high dark:hover:bg-white/10 transition-colors min-h-[42px]"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleResetBiometric}
                                        disabled={isResetting}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 min-h-[42px]"
                                    >
                                        {isResetting ? (
                                            <>
                                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                                <span>Mereset...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                                <span>Ya, Reset Data</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </AuthenticatedLayout>
    );
}