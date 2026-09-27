import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ManifestSample {
    frame_id?: string;
    sample_id?: string;
    subject_id?: string;
    session_split?: string;
    split?: string;
    sample_type?: string;
    ground_truth?: string;
    pai_species?: string;
    lux_level?: string;
    lux_measured?: string | number;
    distance_level?: string;
    distance_measured_cm?: string | number;
    annot_eye_state?: string;
    annot_mouth_state?: string;
    filename?: string;
    relative_path?: string;
    sha256?: string;
    captured_at?: string;
    qc_status?: string;
    notes?: string;
}

interface Props {
    stats: {
        subject_id: string;
        owner_name: string;
        npm: string;
        role: string;
        study_program: string;
        location: string;
        standard: string;
        total_samples: number;
        targets: {
            session_e: number;
            session_c: number;
            session_t: number;
            total: number;
        };
        counts: {
            session_e: number;
            session_c: number;
            session_t: number;
            total: number;
        };
        consent: any;
    };
    recent_samples: ManifestSample[];
}

export default function ResearchDataset({ stats, recent_samples = [] }: Props) {
    const { flash } = usePage().props as any;
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [flashEffect, setFlashEffect] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [activeTabSplit, setActiveTabSplit] = useState<string>('ALL');
    const [searchTable, setSearchTable] = useState<string>('');

    // Delete Modal States
    const [sampleToDelete, setSampleToDelete] = useState<ManifestSample | null>(null);
    const [showResetModal, setShowResetModal] = useState<boolean>(false);
    const [confirmResetCheck, setConfirmResetCheck] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    const { data, setData, post, processing, reset } = useForm({
        split: 'SESSION-E' as 'SESSION-E' | 'SESSION-C' | 'SESSION-T',
        sample_type: 'BF' as 'BF' | 'PP' | 'PS' | 'PR',
        pai_species: '',
        lux_level: 'NRM' as 'LOW' | 'NRM' | 'HIGH',
        lux_measured: '200',
        distance_level: 'D30' as 'D30' | 'D45' | 'D60',
        distance_measured_cm: '30',
        annot_eye_state: 'OPEN' as 'OPEN' | 'CLOSED' | 'NA',
        annot_mouth_state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'NA',
        notes: '',
        media_file: null as File | null,
    });

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
            setCameraError(null);

            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }

            let mediaStream: MediaStream;
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
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

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play().catch(() => {});
            }
        } catch (err) {
            console.error('Camera access error:', err);
            setCameraError('Kamera tidak dapat diakses. Mohon izinkan akses kamera di browser.');
        }
    }, []);

    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
        };
    }, [startCamera, stopCamera]);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
        }
    }, [stream]);

    // Update defaults when split changes
    const handleSplitChange = (split: 'SESSION-E' | 'SESSION-C' | 'SESSION-T') => {
        setData((prev) => {
            if (split === 'SESSION-E') {
                return {
                    ...prev,
                    split,
                    sample_type: 'BF',
                    lux_level: 'NRM',
                    lux_measured: '200',
                    distance_level: 'D30',
                    distance_measured_cm: '30',
                    annot_eye_state: 'OPEN',
                    annot_mouth_state: 'CLOSED',
                    notes: 'Frontal netral baseline',
                };
            }
            if (split === 'SESSION-C') {
                return {
                    ...prev,
                    split,
                    sample_type: 'BF',
                    lux_level: 'NRM',
                    lux_measured: '200',
                    distance_level: 'D60',
                    distance_measured_cm: '60',
                    annot_eye_state: 'OPEN',
                    annot_mouth_state: 'CLOSED',
                    notes: 'Kalibrasi EAR/MAR',
                };
            }
            return {
                ...prev,
                split,
                sample_type: 'BF',
                lux_level: 'NRM',
                lux_measured: '200',
                distance_level: 'D60',
                distance_measured_cm: '60',
                annot_eye_state: 'NA',
                annot_mouth_state: 'NA',
                notes: 'Uji held-out test',
            };
        });
    };

    // Update defaults when lux level changes
    const handleLuxChange = (lux_level: 'LOW' | 'NRM' | 'HIGH') => {
        const measured = lux_level === 'LOW' ? '75' : lux_level === 'NRM' ? '200' : '620';
        setData((prev) => ({ ...prev, lux_level, lux_measured: measured }));
    };

    // Update defaults when distance level changes
    const handleDistanceChange = (distance_level: 'D30' | 'D45' | 'D60') => {
        const measured = distance_level === 'D30' ? '30' : distance_level === 'D45' ? '45' : '60';
        setData((prev) => ({ ...prev, distance_level, distance_measured_cm: measured }));
    };

    const captureFrame = () => {
        if (!videoRef.current) return;

        setFlashEffect(true);
        setTimeout(() => setFlashEffect(false), 200);

        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 1280;
        canvas.height = videoRef.current.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const file = new File(
                            [blob],
                            `capture_${data.split}_${Date.now()}.jpg`,
                            { type: 'image/jpeg' },
                        );
                        setData('media_file', file);
                        setPreviewUrl(URL.createObjectURL(blob));
                    }
                },
                'image/jpeg',
                0.95,
            );
        }
    };

    const submitSample = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('admin.research-dataset.store'), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setPreviewUrl(null);
                setData('media_file', null);
            },
        });
    };

    const handleDeleteSingle = (sample: ManifestSample) => {
        setSampleToDelete(sample);
    };

    const confirmDeleteSingle = () => {
        if (!sampleToDelete) return;
        const targetId = sampleToDelete.frame_id || sampleToDelete.sample_id || sampleToDelete.filename;
        if (!targetId) return;

        setIsDeleting(true);
        router.delete(route('admin.research-dataset.destroy-sample', { id: targetId }), {
            preserveScroll: true,
            onSuccess: () => {
                setSampleToDelete(null);
                setIsDeleting(false);
            },
            onError: () => {
                setIsDeleting(false);
            },
            onFinish: () => {
                setIsDeleting(false);
            },
        });
    };

    const confirmDeleteAll = () => {
        setIsDeleting(true);
        router.delete(route('admin.research-dataset.destroy-all'), {
            preserveScroll: true,
            onSuccess: () => {
                setShowResetModal(false);
                setConfirmResetCheck(false);
                setIsDeleting(false);
            },
            onError: () => {
                setIsDeleting(false);
            },
            onFinish: () => {
                setIsDeleting(false);
            },
        });
    };

    const totalTarget = stats.targets.total;
    const overallPercentage = Math.min(
        100,
        Math.round((stats.counts.total / totalTarget) * 100),
    );

    const splitInfo = {
        'SESSION-E': {
            label: 'SESSION-E: Enrollment',
            desc: 'Membentuk template referensi FaceNet (Mean Vektor 512-D) kondisi baseline NRM + D30',
            badgeColor: 'bg-primary/10 text-primary border-primary/20',
            target: stats.targets.session_e,
            count: stats.counts.session_e,
            quotaPlan: '10 Frame: 4 Frontal Netral, 2 Senyum Ringan, 2 Yaw ±15°, 2 Pitch ±10°',
        },
        'SESSION-C': {
            label: 'SESSION-C: Calibration',
            desc: 'Tuning EAR_THRESH, MAR_THRESH, FACE_DISTANCE_THRESH & bobot fusi α',
            badgeColor: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
            target: stats.targets.session_c,
            count: stats.counts.session_c,
            quotaPlan: '15 Frame: 4 BF Mata Buka, 3 BF Mata Tutup, 3 BF Mulut Buka, 2 PP, 2 PR, 1 BF Ekstrem',
        },
        'SESSION-T': {
            label: 'SESSION-T: Test Set',
            desc: 'Evaluasi ketahanan held-out final untuk matriks APCER, BPCER, ACER (ISO/IEC 30107-3)',
            badgeColor: 'bg-secondary/10 text-secondary border-secondary/20',
            target: stats.targets.session_t,
            count: stats.counts.session_t,
            quotaPlan: '30 Frame: 9 BF (3x3), 9 PP (3x3), 6 PS (3x2), 6 PR (3x2)',
        },
    }[data.split];

    // Filter samples for history table
    const filteredSamples = recent_samples.filter((s) => {
        const splitVal = s.session_split || s.split || '';
        const matchesTab =
            activeTabSplit === 'ALL' ||
            splitVal === activeTabSplit ||
            splitVal.includes(activeTabSplit);

        const searchLower = searchTable.toLowerCase();
        const matchesSearch =
            !searchTable ||
            (s.frame_id && s.frame_id.toLowerCase().includes(searchLower)) ||
            (s.sample_type && s.sample_type.toLowerCase().includes(searchLower)) ||
            (s.filename && s.filename.toLowerCase().includes(searchLower)) ||
            (s.notes && s.notes.toLowerCase().includes(searchLower));

        return matchesTab && matchesSearch;
    });

    return (
        <AuthenticatedLayout>
            <Head title="Dataset Penelitian PAD: Qalwani Anugerah" />

            <div className="flex h-full w-full flex-1 flex-col overflow-y-auto bg-background dark:bg-[#071026] px-4 py-5 sm:px-margin-mobile sm:py-6 md:px-margin-desktop">
                <div className="mx-auto flex h-full w-full max-w-container-max flex-col gap-5 sm:gap-6">
                    {/* Header Section */}
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col gap-4 border-b border-outline-variant/40 dark:border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary dark:bg-sky-600 text-on-primary shadow-lg shadow-primary/25">
                                    <span
                                        className="material-symbols-outlined text-[22px]"
                                        style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                        science
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <h1 className="truncate text-lg font-bold tracking-tight text-on-surface dark:text-white sm:text-xl md:text-headline-lg">
                                        Dataset Penelitian: Modul Akuisisi PAD
                                    </h1>
                                    <p className="text-[11px] font-medium text-on-surface-variant dark:text-slate-400 sm:text-xs">
                                        {stats.study_program} · {stats.location}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-2.5 text-body-sm text-on-surface-variant dark:text-slate-400 sm:text-body-md">
                                Peneliti:{' '}
                                <strong className="font-semibold text-on-surface dark:text-white">
                                    {stats.owner_name} (NPM {stats.npm})
                                </strong>{' '}
                                · Subject ID:{' '}
                                <strong className="font-mono font-semibold text-primary dark:text-sky-400">
                                    {stats.subject_id}
                                </strong>
                            </p>
                        </div>

                        {/* Status Badges & Actions */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 lg:shrink-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/30 dark:border-sky-500/30 bg-secondary/10 dark:bg-sky-950/40 px-3 py-1.5 text-[11px] font-semibold text-secondary dark:text-sky-300 shadow-sm sm:px-3.5 sm:text-label-sm">
                                <span
                                    className="material-symbols-outlined text-sm"
                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                    verified_user
                                </span>
                                Consent IC-2026-001
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 dark:border-white/10 bg-primary-container/40 dark:bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-primary dark:text-white shadow-sm sm:px-3.5 sm:text-label-sm">
                                <span className="material-symbols-outlined text-sm">
                                    folder_zip
                                </span>
                                {stats.counts.total}/{stats.targets.total} Frame ({overallPercentage}%)
                            </span>
                            <a
                                href={route('admin.research-dataset.download-manifest')}
                                className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant dark:border-white/10 bg-surface dark:bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-on-surface dark:text-white shadow-sm transition-colors duration-200 hover:bg-surface-variant dark:hover:bg-white/10 active:scale-[0.97] sm:px-3.5 sm:text-label-sm"
                            >
                                <span className="material-symbols-outlined text-sm text-primary dark:text-sky-400">
                                    download
                                </span>
                                <span className="hidden sm:inline">Unduh</span> MANIFEST.csv
                            </a>
                        </div>
                    </motion.div>

                    {/* Flash Toast / Banner */}
                    <AnimatePresence>
                        {flash?.message && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-center gap-3 rounded-2xl border border-secondary/30 dark:border-emerald-500/30 bg-secondary-container/40 dark:bg-emerald-950/40 p-4 text-on-secondary-container dark:text-emerald-300 shadow-sm"
                            >
                                <span className="material-symbols-outlined text-secondary dark:text-emerald-400">
                                    check_circle
                                </span>
                                <span className="text-body-md font-medium">
                                    {flash.message}
                                </span>
                            </motion.div>
                        )}
                        {flash?.error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-center gap-3 rounded-2xl border border-error/30 dark:border-rose-500/30 bg-error-container/40 dark:bg-rose-950/40 p-4 text-on-error-container dark:text-rose-300 shadow-sm"
                            >
                                <span className="material-symbols-outlined text-error dark:text-rose-400">
                                    error
                                </span>
                                <span className="text-body-md font-medium">
                                    {flash.error}
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Protocol Notice Box */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: 0.05 }}
                        className="flex items-start gap-3 rounded-2xl border border-amber-400/40 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-on-surface dark:text-amber-100 shadow-sm backdrop-blur-sm sm:gap-3.5 sm:p-4"
                    >
                        <span className="material-symbols-outlined shrink-0 text-xl text-amber-600 dark:text-amber-400 sm:text-2xl">
                            shield_lock
                        </span>
                        <div className="text-[11px] leading-relaxed sm:text-body-sm">
                            <strong className="font-semibold text-amber-900 dark:text-amber-300">
                                Prinsip Penelitian (ISO/IEC 30107-3):
                            </strong>{' '}
                            Seluruh frame ditandai{' '}
                            <code className="rounded bg-amber-200/60 dark:bg-amber-900/60 px-1 py-0.5 font-mono text-[10px] text-amber-950 dark:text-amber-200 sm:px-1.5 sm:text-xs">
                                is_test_data = true
                            </code>{' '}
                            dan diisolasi di{' '}
                            <code className="rounded bg-amber-200/60 dark:bg-amber-900/60 px-1 py-0.5 font-mono text-[10px] text-amber-950 dark:text-amber-200 sm:px-1.5 sm:text-xs">
                                dataset/self_qalwani/
                            </code>
                            <span className="hidden sm:inline">. Artefak serangan (Print/Screen/Replay) hanya dibangkitkan dari wajah peneliti sendiri demi etika.</span>
                        </div>
                    </motion.div>

                    {/* Target Overview Cards */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
                        {/* Overall Progress */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col gap-2.5 rounded-2xl border border-outline-variant/50 dark:border-white/10 bg-surface dark:bg-[#0F1B36] p-4 shadow-sm transition-shadow duration-300 hover:shadow-md"
                        >
                            <div className="flex items-center justify-between text-label-sm text-on-surface-variant dark:text-slate-400">
                                <span className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] text-primary dark:text-sky-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                                        pie_chart
                                    </span>
                                    Total Progres
                                </span>
                                <span className="font-bold text-primary dark:text-sky-400">
                                    {overallPercentage}%
                                </span>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold tracking-tight text-on-surface dark:text-white sm:text-3xl">
                                    {stats.counts.total}
                                </span>
                                <span className="text-xs text-on-surface-variant dark:text-slate-400">
                                    / {stats.targets.total} target
                                </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant dark:bg-white/10">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${overallPercentage}%` }}
                                    transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                    className="h-full rounded-full bg-gradient-to-r from-primary dark:from-sky-500 to-primary/70 dark:to-sky-400"
                                />
                            </div>
                        </motion.div>

                        {/* Split E */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => handleSplitChange('SESSION-E')}
                            className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] ${
                                data.split === 'SESSION-E'
                                    ? 'border-primary dark:border-sky-500 bg-primary-container/20 dark:bg-sky-950/40 ring-2 ring-primary/30 dark:ring-sky-500/30'
                                    : 'border-outline-variant/50 dark:border-white/10 bg-surface dark:bg-[#0F1B36]'
                            }`}
                        >
                            <div className="flex items-center justify-between text-label-sm text-on-surface-variant dark:text-slate-400">
                                <span className="font-bold text-on-surface dark:text-white">Session-E</span>
                                <span className="font-semibold text-primary dark:text-sky-400">
                                    {stats.counts.session_e}/{stats.targets.session_e}
                                </span>
                            </div>
                            <span className="text-base font-bold text-on-surface dark:text-white sm:text-lg">
                                Template FaceNet
                            </span>
                            <span className="text-[10px] text-on-surface-variant dark:text-slate-400 sm:text-[11px]">
                                Mean Vektor 512-D (NRM + D30)
                            </span>
                            <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-surface-variant dark:bg-white/10">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, Math.round((stats.counts.session_e / stats.targets.session_e) * 100))}%` }}
                                    transition={{ duration: 1, delay: 0.5 }}
                                    className="h-full rounded-full bg-primary dark:bg-sky-500"
                                />
                            </div>
                        </motion.div>

                        {/* Split C */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => handleSplitChange('SESSION-C')}
                            className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] ${
                                data.split === 'SESSION-C'
                                    ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-950/40 ring-2 ring-amber-500/30'
                                    : 'border-outline-variant/50 dark:border-white/10 bg-surface dark:bg-[#0F1B36]'
                            }`}
                        >
                            <div className="flex items-center justify-between text-label-sm text-on-surface-variant dark:text-slate-400">
                                <span className="font-bold text-on-surface dark:text-white">Session-C</span>
                                <span className="font-semibold text-amber-600 dark:text-amber-400">
                                    {stats.counts.session_c}/{stats.targets.session_c}
                                </span>
                            </div>
                            <span className="text-base font-bold text-on-surface dark:text-white sm:text-lg">
                                Tuning EMAR/PAD
                            </span>
                            <span className="text-[10px] text-on-surface-variant dark:text-slate-400 sm:text-[11px]">
                                EAR, MAR &amp; Threshold Fusi
                            </span>
                            <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-surface-variant dark:bg-white/10">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, Math.round((stats.counts.session_c / stats.targets.session_c) * 100))}%` }}
                                    transition={{ duration: 1, delay: 0.6 }}
                                    className="h-full rounded-full bg-amber-500"
                                />
                            </div>
                        </motion.div>

                        {/* Split T */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => handleSplitChange('SESSION-T')}
                            className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] ${
                                data.split === 'SESSION-T'
                                    ? 'border-secondary dark:border-indigo-500 bg-secondary/10 dark:bg-indigo-950/40 ring-2 ring-secondary/30 dark:ring-indigo-500/30'
                                    : 'border-outline-variant/50 dark:border-white/10 bg-surface dark:bg-[#0F1B36]'
                            }`}
                        >
                            <div className="flex items-center justify-between text-label-sm text-on-surface-variant dark:text-slate-400">
                                <span className="font-bold text-on-surface dark:text-white">Session-T</span>
                                <span className="font-semibold text-secondary dark:text-indigo-400">
                                    {stats.counts.session_t}/{stats.targets.session_t}
                                </span>
                            </div>
                            <span className="text-base font-bold text-on-surface dark:text-white sm:text-lg">
                                Uji Evaluasi Tersegel
                            </span>
                            <span className="text-[10px] text-on-surface-variant dark:text-slate-400 sm:text-[11px]">
                                APCER, BPCER, ACER (30 Frame)
                            </span>
                            <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-surface-variant dark:bg-white/10">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, Math.round((stats.counts.session_t / stats.targets.session_t) * 100))}%` }}
                                    transition={{ duration: 1, delay: 0.7 }}
                                    className="h-full rounded-full bg-secondary dark:bg-indigo-500"
                                />
                            </div>
                        </motion.div>
                    </div>

                    {/* Split Quick Plan Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: 0.3 }}
                        className="flex flex-col gap-2 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-[#13203F] px-4 py-3 text-xs text-on-surface dark:text-white sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                        <div className="flex items-start gap-2 sm:items-center">
                            <span className="material-symbols-outlined mt-0.5 text-[18px] text-primary dark:text-sky-400 sm:mt-0">
                                assignment
                            </span>
                            <div>
                                <strong className="block sm:inline">Rencana Alokasi {data.split}:</strong>
                                <span className="block text-[10px] text-on-surface-variant dark:text-slate-300 sm:ml-1 sm:inline sm:text-xs">{splitInfo.quotaPlan}</span>
                            </div>
                        </div>
                        <span className="self-end font-semibold text-primary dark:text-sky-400 sm:self-auto">
                            Tercapai: {splitInfo.count}/{splitInfo.target} Frame
                        </span>
                    </motion.div>

                    {/* Main Content Layout */}
                    <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-12 lg:gap-8">
                        {/* Left Column: Camera Studio */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                            className="relative col-span-1 flex min-h-[360px] flex-col overflow-hidden rounded-3xl border border-outline-variant/40 dark:border-white/10 bg-surface dark:bg-[#0F1B36] p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] sm:min-h-[440px] sm:p-6 lg:col-span-7 lg:min-h-[540px]"
                        >
                            {/* Studio Header Bar */}
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/40 dark:border-white/10 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-400">
                                        <span className="material-symbols-outlined text-[20px]">
                                            videocam
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="text-label-md font-bold text-on-surface dark:text-white">
                                            Kamera Studio Akuisisi
                                        </h3>
                                        <span className="text-[11px] text-on-surface-variant dark:text-slate-400">
                                            Format Standard: 1280x720 (User-Facing)
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                            stream
                                                ? 'border-secondary/30 dark:border-sky-500/30 bg-secondary/10 dark:bg-sky-950/40 text-secondary dark:text-sky-300'
                                                : 'border-outline-variant dark:border-white/10 bg-surface-variant/40 dark:bg-white/5 text-on-surface-variant dark:text-slate-400'
                                        }`}
                                    >
                                        <span
                                            className={`h-2 w-2 rounded-full ${
                                                stream
                                                    ? 'animate-pulse bg-secondary dark:bg-sky-400'
                                                    : 'bg-outline dark:bg-slate-500'
                                            }`}
                                        />
                                        {stream ? 'Live Active' : 'Camera Off'}
                                    </span>
                                </div>
                            </div>

                            {/* Camera Viewport Container */}
                            <div className="relative flex flex-1 aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl border border-outline dark:border-white/10 bg-black shadow-inner sm:aspect-[4/3] md:aspect-video">
                                {cameraError ? (
                                    <div className="flex flex-col items-center justify-center p-6 text-center text-error">
                                        <span className="material-symbols-outlined mb-2 text-[48px]">
                                            videocam_off
                                        </span>
                                        <p className="text-body-md font-semibold">
                                            {cameraError}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={startCamera}
                                            className="mt-4 rounded-xl bg-primary dark:bg-sky-600 px-4 py-2 text-label-md font-semibold text-on-primary"
                                        >
                                            Coba Lagi
                                        </button>
                                    </div>
                                ) : previewUrl ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="relative h-full w-full"
                                    >
                                        <img
                                            src={previewUrl}
                                            alt="Captured preview"
                                            className="h-full w-full object-cover"
                                            style={{ transform: 'scaleX(-1)' }}
                                        />
                                        <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/60 px-3.5 py-1.5 text-label-sm font-semibold text-white backdrop-blur-md">
                                            ✓ Frame Terambil ({data.split} - {data.sample_type})
                                        </div>
                                    </motion.div>
                                ) : (
                                    <>
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="absolute inset-0 h-full w-full object-cover"
                                            style={{ transform: 'scaleX(-1)' }}
                                        />

                                        {/* Face Guide Reticle & Corner Brackets */}
                                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                                            <div className="relative h-56 w-44 sm:h-72 sm:w-56 md:h-80 md:w-64">
                                                <svg
                                                    className="absolute inset-0 h-full w-full text-white/80 drop-shadow-md"
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
                                                        className="opacity-30"
                                                        height="380"
                                                        rx="38"
                                                        stroke="currentColor"
                                                        strokeDasharray="10 10"
                                                        strokeWidth="2"
                                                        width="316"
                                                        x="2"
                                                        y="2"
                                                    />
                                                </svg>
                                                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60" />
                                            </div>

                                            <div className="absolute bottom-3 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[10px] font-medium text-white backdrop-blur-md sm:bottom-5 sm:px-4 sm:py-1.5 sm:text-label-sm">
                                                {data.split} · {data.sample_type} · {data.distance_level} <span className="hidden sm:inline">({data.distance_measured_cm}cm)</span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Flash Capture Effect */}
                                <AnimatePresence>
                                    {flashEffect && (
                                        <motion.div
                                            initial={{ opacity: 0.9 }}
                                            animate={{ opacity: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="pointer-events-none absolute inset-0 z-40 bg-white"
                                        />
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Camera Action Controls */}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sm:mt-4 sm:gap-3">
                                {previewUrl ? (
                                    <div className="flex w-full items-center justify-between gap-2 sm:gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPreviewUrl(null);
                                                setData('media_file', null);
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-white/10 px-3 py-2.5 text-[11px] font-semibold text-on-surface dark:text-slate-200 transition-colors duration-200 hover:bg-surface-variant dark:hover:bg-white/20 sm:gap-2 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-label-md"
                                        >
                                            <span className="material-symbols-outlined text-[18px] sm:text-[22px]">
                                                refresh
                                            </span>
                                            <span className="hidden sm:inline">Ambil Ulang</span> Frame
                                        </button>
                                        <span className="text-[10px] text-secondary dark:text-sky-400 font-medium sm:text-xs">
                                            ✓ Siap diunggah ke manifest
                                        </span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={captureFrame}
                                        disabled={!stream}
                                        className="inline-flex w-full transform items-center justify-center gap-2 rounded-xl bg-primary dark:bg-sky-600 py-3 text-[12px] font-bold text-on-primary shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary-container dark:hover:bg-sky-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2.5 sm:rounded-2xl sm:py-3.5 sm:text-label-md"
                                    >
                                        <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                                            photo_camera
                                        </span>
                                        AMBIL SAMPEL FRAME
                                    </button>
                                )}
                            </div>
                        </motion.div>

                        {/* Right Column: Acquisition Parameters Form */}
                        <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            className="col-span-1 flex flex-col gap-4 rounded-3xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-[#0F1B36] p-4 shadow-sm sm:gap-5 sm:p-6 lg:col-span-5"
                        >
                            <div className="border-b border-outline-variant/40 dark:border-white/10 pb-3">
                                <h3 className="text-base font-bold text-on-surface dark:text-white sm:text-headline-md">
                                    Parameter Akuisisi
                                </h3>
                                <p className="mt-0.5 text-[10px] text-on-surface-variant dark:text-slate-400 sm:text-xs">
                                    Metadata ISO/IEC 30107-3 untuk log manifest CSV
                                </p>
                            </div>

                            <form onSubmit={submitSample} className="flex flex-col gap-3 sm:gap-4">
                                {/* Subject ID Pseudonym */}
                                <div>
                                    <label className="mb-1.5 block text-label-sm font-semibold text-on-surface dark:text-slate-300">
                                        Subject ID (Pseudonim Terkunci)
                                    </label>
                                    <div className="flex items-center justify-between rounded-xl border border-outline-variant dark:border-white/10 bg-surface-container-low dark:bg-slate-900/80 px-3.5 py-2.5">
                                        <span className="font-mono text-sm font-semibold text-primary dark:text-sky-400">
                                            {stats.subject_id}
                                        </span>
                                        <span className="text-xs text-on-surface-variant dark:text-slate-400">
                                            Anonim Terkunci
                                        </span>
                                    </div>
                                </div>

                                {/* Split Selection */}
                                <div>
                                    <label className="mb-1.5 block text-label-sm font-semibold text-on-surface dark:text-slate-300">
                                        Split Perekaman
                                    </label>
                                    <select
                                        value={data.split}
                                        onChange={(e) => handleSplitChange(e.target.value as any)}
                                        className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-3.5 py-2.5 text-sm text-on-surface dark:text-white shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                                    >
                                        <option value="SESSION-E">
                                            SESSION-E: Enrollment Reference (10 Frame)
                                        </option>
                                        <option value="SESSION-C">
                                            SESSION-C: Calibration &amp; Threshold Tuning (15 Frame)
                                        </option>
                                        <option value="SESSION-T">
                                            SESSION-T: Final Test Evaluation (30 Frame)
                                        </option>
                                    </select>
                                </div>

                                {/* Sample Type (Presentation Trial) */}
                                <div>
                                    <label className="mb-1.5 block text-label-sm font-semibold text-on-surface dark:text-slate-300">
                                        Jenis Sampel: Presentation Trial (ISO/IEC 30107-3)
                                    </label>
                                    <select
                                        value={data.sample_type}
                                        onChange={(e) => setData('sample_type', e.target.value as any)}
                                        className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-3.5 py-2.5 text-sm text-on-surface dark:text-white shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="BF">
                                            BF: Bona Fide (Wajah Asli Manusia)
                                        </option>
                                        <option value="PP">
                                            PP: Print Attack (Foto Cetak Kertas)
                                        </option>
                                        <option value="PS">
                                            PS: Screen Attack (Foto Layar Ponsel/Laptop)
                                        </option>
                                        <option value="PR">
                                            PR: Replay Attack (Video Dinamis Layar Ponsel)
                                        </option>
                                    </select>
                                </div>

                                {/* PAI Species detail if Attack */}
                                {data.sample_type !== 'BF' && (
                                    <div>
                                        <label className="mb-1.5 block text-label-sm font-semibold text-on-surface dark:text-slate-300">
                                            PAI Species (Spesifikasi Artefak)
                                        </label>
                                        <input
                                            type="text"
                                            value={data.pai_species}
                                            onChange={(e) => setData('pai_species', e.target.value)}
                                            placeholder={
                                                data.sample_type === 'PP'
                                                    ? 'PRINT_A4_GLOSSY atau PRINT_HVS_80GSM'
                                                    : data.sample_type === 'PS'
                                                      ? 'SCREEN_STATIC_MOBILE (OLED)'
                                                      : 'REPLAY_VIDEO_MOBILE (1080p 30fps)'
                                            }
                                            className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-3.5 py-2 text-sm text-on-surface dark:text-white shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
                                        />
                                    </div>
                                )}

                                {/* Environmental Variables: Lighting & Distance */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Lighting */}
                                    <div>
                                        <label className="mb-1.5 block text-label-sm font-semibold text-on-surface dark:text-slate-300">
                                            Pencahayaan (Lux)
                                        </label>
                                        <select
                                            value={data.lux_level}
                                            onChange={(e) => handleLuxChange(e.target.value as any)}
                                            className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-3 py-2 text-sm text-on-surface dark:text-white shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="NRM">NRM: Normal (100-300 lux)</option>
                                            <option value="LOW">LOW: Redup (&lt; 100 lux)</option>
                                            <option value="HIGH">HIGH: Terang (&gt; 300 lux)</option>
                                        </select>
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            <span className="text-[11px] text-on-surface-variant dark:text-slate-400">Ukur:</span>
                                            <input
                                                type="number"
                                                value={data.lux_measured}
                                                onChange={(e) => setData('lux_measured', e.target.value)}
                                                className="w-20 rounded-lg border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-2 py-1 text-xs text-on-surface dark:text-white"
                                                placeholder="Lux"
                                            />
                                            <span className="text-[11px] text-on-surface-variant dark:text-slate-400">lux</span>
                                        </div>
                                    </div>

                                    {/* Distance */}
                                    <div>
                                        <label className="mb-1.5 block text-label-sm font-semibold text-on-surface dark:text-slate-300">
                                            Jarak Kamera
                                        </label>
                                        <select
                                            value={data.distance_level}
                                            onChange={(e) => handleDistanceChange(e.target.value as any)}
                                            className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-3 py-2 text-sm text-on-surface dark:text-white shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="D30">D30: Dekat (30 cm)</option>
                                            <option value="D45">D45: Ideal (45 cm)</option>
                                            <option value="D60">D60: Jauh (60 cm)</option>
                                        </select>
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            <span className="text-[11px] text-on-surface-variant dark:text-slate-400">Ukur:</span>
                                            <input
                                                type="number"
                                                value={data.distance_measured_cm}
                                                onChange={(e) => setData('distance_measured_cm', e.target.value)}
                                                className="w-20 rounded-lg border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-2 py-1 text-xs text-on-surface dark:text-white"
                                                placeholder="cm"
                                            />
                                            <span className="text-[11px] text-on-surface-variant dark:text-slate-400">cm</span>
                                        </div>
                                    </div>
                                </div>

                                {/* EMAR Ground Truth Annotations (Crucial for Session-C) */}
                                <div className="rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-3.5">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-label-sm font-bold text-on-surface dark:text-white">
                                            Anotasi Ground-Truth EMAR
                                        </span>
                                        <span className="text-[10px] rounded bg-primary/10 dark:bg-sky-500/20 px-2 py-0.5 font-medium text-primary dark:text-sky-300">
                                            {data.split === 'SESSION-C' ? 'Wajib untuk Kalibrasi' : 'Opsional'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold text-on-surface-variant dark:text-slate-300">
                                                Status Mata (EAR)
                                            </label>
                                            <select
                                                value={data.annot_eye_state}
                                                onChange={(e) => setData('annot_eye_state', e.target.value as any)}
                                                className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-2.5 py-1.5 text-xs text-on-surface dark:text-white shadow-sm"
                                            >
                                                <option value="OPEN">OPEN (Mata Terbuka)</option>
                                                <option value="CLOSED">CLOSED (Mata Tertutup/Kedip)</option>
                                                <option value="NA">NA (Tidak Dinilai)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold text-on-surface-variant dark:text-slate-300">
                                                Status Mulut (MAR)
                                            </label>
                                            <select
                                                value={data.annot_mouth_state}
                                                onChange={(e) => setData('annot_mouth_state', e.target.value as any)}
                                                className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-2.5 py-1.5 text-xs text-on-surface dark:text-white shadow-sm"
                                            >
                                                <option value="CLOSED">CLOSED (Mulut Tertutup)</option>
                                                <option value="OPEN">OPEN (Mulut Terbuka/Bicara)</option>
                                                <option value="NA">NA (Tidak Dinilai)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes Input */}
                                <div>
                                    <label className="mb-1.5 block text-label-sm font-semibold text-on-surface dark:text-slate-300">
                                        Catatan / Variasi Pose
                                    </label>
                                    <input
                                        type="text"
                                        value={data.notes}
                                        onChange={(e) => setData('notes', e.target.value)}
                                        placeholder="misal: Frontal netral, Senyum ringan, Yaw +15°"
                                        className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-3.5 py-2 text-sm text-on-surface dark:text-white shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                {/* Submit Button */}
                                <div className="pt-1 sm:pt-2">
                                    <button
                                        type="submit"
                                        disabled={processing || !data.media_file}
                                        className="flex w-full transform items-center justify-center gap-2 rounded-xl bg-secondary dark:bg-sky-600 py-3 text-[12px] font-semibold text-on-secondary shadow-md shadow-secondary/20 transition-all duration-200 hover:bg-secondary-container dark:hover:bg-sky-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:rounded-2xl sm:py-3.5 sm:text-label-md"
                                    >
                                        {processing ? (
                                            <>
                                                <span className="material-symbols-outlined animate-spin text-[18px]">
                                                    sync
                                                </span>
                                                Menyimpan...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[18px]">
                                                    save
                                                </span>
                                                SIMPAN KE MANIFEST CSV
                                            </>
                                        )}
                                    </button>
                                    {!data.media_file && (
                                        <p className="mt-1.5 text-center text-[10px] text-on-surface-variant dark:text-slate-400 sm:mt-2 sm:text-[11px]">
                                            * Ambil sampel frame terlebih dahulu
                                        </p>
                                    )}
                                </div>
                            </form>
                        </motion.div>
                    </div>

                    {/* Bottom Section: Manifest Logbook History Table */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col gap-3 rounded-3xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-[#0F1B36] p-4 shadow-sm sm:gap-4 sm:p-6"
                    >
                        <div className="flex flex-col gap-3 border-b border-outline-variant/40 dark:border-white/10 pb-3 sm:pb-4 md:flex-row md:items-center md:justify-between md:gap-4">
                            <div className="min-w-0">
                                <h3 className="flex items-center gap-2 text-base font-bold text-on-surface dark:text-white sm:text-headline-md">
                                    <span className="material-symbols-outlined text-[20px] text-primary dark:text-sky-400 sm:text-[24px]">
                                        table_chart
                                    </span>
                                    <span className="truncate">Manifest Logbook</span>
                                </h3>
                                <p className="mt-0.5 text-[10px] text-on-surface-variant dark:text-slate-400 sm:text-xs">
                                    {filteredSamples.length} baris dari {stats.counts.total} sampel terdaftar
                                </p>
                            </div>

                            {/* Split Filter Tabs, Search & Reset Button */}
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
                                <div className="inline-flex overflow-x-auto rounded-xl border border-outline-variant dark:border-white/10 bg-surface-container-low dark:bg-slate-900/80 p-1 text-[10px] scrollbar-none sm:text-xs">
                                    {['ALL', 'SESSION-E', 'SESSION-C', 'SESSION-T'].map((tab) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            onClick={() => setActiveTabSplit(tab)}
                                            className={`shrink-0 rounded-lg px-2.5 py-1.5 font-semibold transition-colors duration-150 sm:px-3 ${
                                                activeTabSplit === tab
                                                    ? 'bg-primary dark:bg-sky-600 text-on-primary shadow-sm'
                                                    : 'text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-white'
                                            }`}
                                        >
                                            {tab === 'ALL' ? 'Semua' : tab.replace('SESSION-', 'S-')}
                                        </button>
                                    ))}
                                </div>

                                <input
                                    type="text"
                                    value={searchTable}
                                    onChange={(e) => setSearchTable(e.target.value)}
                                    placeholder="Cari frame ID / jenis..."
                                    className="w-full rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-slate-900/80 px-3 py-1.5 text-xs text-on-surface dark:text-white transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-36 md:w-44"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowResetModal(true)}
                                    disabled={recent_samples.length === 0 || isDeleting}
                                    className="group relative inline-flex items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-error/20 bg-error/10 px-3 py-1.5 text-[11px] font-bold text-error transition-all duration-300 hover:border-error/40 hover:bg-error hover:text-white hover:shadow-[0_0_16px_rgba(220,38,38,0.3)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                                    title="Hapus seluruh sampel dan reset manifest"
                                >
                                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-error/30 to-transparent transition-all duration-700 group-hover:translate-x-full"></div>
                                    <span className="material-symbols-outlined relative z-10 text-[16px] transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
                                        delete_sweep
                                    </span>
                                    <span className="relative z-10">Hapus Semua</span>
                                </button>
                            </div>
                        </div>

                        {/* Samples Table — Desktop */}
                        <div className="hidden overflow-x-auto sm:block">
                            <table className="w-full text-left text-xs text-on-surface dark:text-slate-200">
                                <thead className="border-b border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-black/30 text-[10px] uppercase tracking-wider text-on-surface-variant dark:text-slate-400 sm:text-[11px]">
                                    <tr>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">Frame ID</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">Split</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">Jenis</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">Ground Truth</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">Lux / Jarak</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">EMAR</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">QC</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">Waktu</th>
                                        <th className="px-3 py-2.5 sm:px-3.5 sm:py-3">Catatan</th>
                                        <th className="px-3 py-2.5 text-center sm:px-3.5 sm:py-3">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant/30 dark:divide-white/10 font-mono">
                                    {filteredSamples.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="py-8 text-center text-on-surface-variant dark:text-slate-400 font-sans">
                                                Belum ada sampel untuk filter ini.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSamples.map((sample, idx) => {
                                            const sType = sample.sample_type || '';
                                            const isBf = sType === 'BF' || sType === 'bona_fide';
                                            const splitVal = sample.session_split || sample.split || '-';
                                            return (
                                                <tr key={idx} className="transition-colors duration-100 hover:bg-surface-variant/20 dark:hover:bg-white/5">
                                                    <td className="px-3 py-2 font-bold text-primary dark:text-sky-400 sm:px-3.5 sm:py-2.5">
                                                        {sample.frame_id || sample.sample_id || `ST-${idx + 1}`}
                                                    </td>
                                                    <td className="px-3 py-2 font-sans sm:px-3.5 sm:py-2.5">
                                                        <span
                                                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                                                splitVal.includes('SESSION-E') || splitVal.includes('SE')
                                                                    ? 'bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300'
                                                                    : splitVal.includes('SESSION-C') || splitVal.includes('SC')
                                                                      ? 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                                                      : 'bg-secondary/10 dark:bg-indigo-500/20 text-secondary dark:text-indigo-300'
                                                            }`}
                                                        >
                                                            {splitVal}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 font-sans sm:px-3.5 sm:py-2.5">
                                                        <span
                                                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                                                isBf
                                                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                                                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                                            }`}
                                                        >
                                                            {sType}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 font-sans text-[11px] sm:px-3.5 sm:py-2.5">
                                                        {isBf ? 'BONA_FIDE' : 'ATTACK'}
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px] sm:px-3.5 sm:py-2.5">
                                                        {sample.lux_measured || '200'} lx · {sample.distance_measured_cm || '60'} cm
                                                    </td>
                                                    <td className="px-3 py-2 text-[10px] sm:px-3.5 sm:py-2.5">
                                                        Mata: {sample.annot_eye_state || 'NA'} · Mulut: {sample.annot_mouth_state || 'NA'}
                                                    </td>
                                                    <td className="px-3 py-2 font-sans sm:px-3.5 sm:py-2.5">
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                                            ✓ {sample.qc_status || 'PASSED'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 font-sans text-[10px] text-on-surface-variant dark:text-slate-400 sm:px-3.5 sm:py-2.5">
                                                        {sample.captured_at ? sample.captured_at.slice(0, 19).replace('T', ' ') : '-'}
                                                    </td>
                                                    <td className="max-w-xs truncate px-3 py-2 font-sans text-[11px] text-on-surface-variant dark:text-slate-400 sm:px-3.5 sm:py-2.5">
                                                        {sample.notes || '-'}
                                                    </td>
                                                    <td className="px-2 py-2 text-center font-sans">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteSingle(sample)}
                                                            className="group relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-surface-container-highest dark:bg-white/10 text-on-surface-variant dark:text-slate-300 transition-all duration-300 hover:bg-error hover:text-white hover:shadow-lg hover:shadow-error/30 active:scale-90 mx-auto"
                                                            title={`Hapus sampel ${sample.frame_id || sample.sample_id}`}
                                                        >
                                                            <div className="absolute inset-0 scale-0 rounded-xl bg-error transition-transform duration-300 group-hover:scale-100"></div>
                                                            <span className="material-symbols-outlined relative z-10 text-[18px] transition-transform duration-300 group-hover:scale-110">
                                                                delete_outline
                                                            </span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Samples Cards — Mobile */}
                        <div className="flex flex-col gap-2.5 sm:hidden">
                            {filteredSamples.length === 0 ? (
                                <div className="py-8 text-center text-xs text-on-surface-variant dark:text-slate-400">
                                    Belum ada sampel untuk filter ini.
                                </div>
                            ) : (
                                filteredSamples.map((sample, idx) => {
                                    const sType = sample.sample_type || '';
                                    const isBf = sType === 'BF' || sType === 'bona_fide';
                                    const splitVal = sample.session_split || sample.split || '-';
                                    return (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.25, delay: idx * 0.03 }}
                                            className="rounded-xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/70 p-3"
                                        >
                                            <div className="mb-2 flex items-center justify-between">
                                                <span className="font-mono text-xs font-bold text-primary dark:text-sky-400">
                                                    {sample.frame_id || sample.sample_id || `ST-${idx + 1}`}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                                                            splitVal.includes('SESSION-E') || splitVal.includes('SE')
                                                                ? 'bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300'
                                                                : splitVal.includes('SESSION-C') || splitVal.includes('SC')
                                                                  ? 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                                                  : 'bg-secondary/10 dark:bg-indigo-500/20 text-secondary dark:text-indigo-300'
                                                        }`}
                                                    >
                                                        {splitVal.replace('SESSION-', 'S-')}
                                                    </span>
                                                    <span
                                                        className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                                                            isBf ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                                        }`}
                                                    >
                                                        {sType}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteSingle(sample)}
                                                        className="group relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-surface-container-highest dark:bg-white/10 text-on-surface-variant dark:text-slate-300 transition-all duration-300 hover:bg-error hover:text-white hover:shadow-md hover:shadow-error/30 active:scale-90 ml-1"
                                                        title="Hapus sampel ini"
                                                    >
                                                        <div className="absolute inset-0 scale-0 rounded-lg bg-error transition-transform duration-300 group-hover:scale-100"></div>
                                                        <span className="material-symbols-outlined relative z-10 text-[16px] transition-transform duration-300 group-hover:scale-110">
                                                            delete_outline
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                                                <div>
                                                    <span className="text-on-surface-variant dark:text-slate-400">Lux/Jarak: </span>
                                                    <span className="font-mono text-on-surface dark:text-white">{sample.lux_measured || '200'} lx · {sample.distance_measured_cm || '60'} cm</span>
                                                </div>
                                                <div>
                                                    <span className="text-on-surface-variant dark:text-slate-400">EMAR: </span>
                                                    <span className="font-mono text-on-surface dark:text-white">{sample.annot_eye_state || 'NA'}/{sample.annot_mouth_state || 'NA'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-on-surface-variant dark:text-slate-400">Waktu: </span>
                                                    <span className="text-on-surface dark:text-slate-200">{sample.captured_at ? sample.captured_at.slice(0, 16).replace('T', ' ') : '-'}</span>
                                                </div>
                                                <div>
                                                    <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                                                        ✓ {sample.qc_status || 'PASSED'}
                                                    </span>
                                                </div>
                                            </div>
                                            {sample.notes && (
                                                <p className="mt-1.5 truncate text-[10px] text-on-surface-variant dark:text-slate-400">
                                                    📝 {sample.notes}
                                                </p>
                                            )}
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Single Sample Delete Modal */}
            <AnimatePresence>
                {sampleToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isDeleting && setSampleToDelete(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-error/20 bg-surface dark:bg-[#0F1B36] p-5 sm:p-6 shadow-[0_20px_40px_-15px_rgba(220,38,38,0.15)]"
                        >
                            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-error/10 blur-3xl pointer-events-none"></div>
                            
                            <div className="flex items-start gap-3 sm:gap-4">
                                <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-error/10 text-error shadow-sm overflow-hidden">
                                    <div className="absolute inset-0 bg-error/20 animate-[pulse_2s_ease-in-out_infinite]"></div>
                                    <span className="material-symbols-outlined relative z-10 text-[24px] sm:text-[26px]">
                                        delete_outline
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1 relative z-10">
                                    <h3 className="text-base font-bold text-on-surface dark:text-white sm:text-lg">
                                        Hapus Sampel Penelitian?
                                    </h3>
                                    <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant dark:text-slate-400 sm:text-xs">
                                        Sampel{' '}
                                        <strong className="font-mono font-bold text-primary dark:text-sky-400">
                                            {sampleToDelete.frame_id || sampleToDelete.sample_id}
                                        </strong>{' '}
                                        ({sampleToDelete.session_split || sampleToDelete.split} · {sampleToDelete.sample_type}) akan dihapus secara permanen dari manifest CSV dan penyimpanan.
                                    </p>
                                </div>
                            </div>

                            {/* Metadata Details Card */}
                            <div className="mt-4 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-3 sm:p-3.5 text-xs">
                                <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-[11px]">
                                    <div className="col-span-2">
                                        <span className="text-on-surface-variant dark:text-slate-400">Berkas: </span>
                                        <span className="font-mono text-on-surface dark:text-white truncate block" title={sampleToDelete.filename || sampleToDelete.relative_path}>
                                            {sampleToDelete.filename || sampleToDelete.relative_path || '-'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-on-surface-variant dark:text-slate-400">Kondisi: </span>
                                        <span className="font-medium text-on-surface dark:text-white block">
                                            {sampleToDelete.lux_measured || '200'} lx · {sampleToDelete.distance_measured_cm || '60'} cm
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-on-surface-variant dark:text-slate-400">Anotasi EMAR: </span>
                                        <span className="font-medium text-on-surface dark:text-white block">
                                            {sampleToDelete.annot_eye_state || 'NA'} / {sampleToDelete.annot_mouth_state || 'NA'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="mt-5 flex items-center justify-end gap-2.5 sm:mt-6 sm:gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSampleToDelete(null)}
                                    disabled={isDeleting}
                                    className="rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-white/10 px-3.5 py-2 text-xs font-semibold text-on-surface dark:text-slate-200 transition-colors hover:bg-surface-variant dark:hover:bg-white/20 active:scale-95 disabled:opacity-50 sm:px-4 sm:py-2.5"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDeleteSingle}
                                    disabled={isDeleting}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-error px-3.5 py-2 text-xs font-bold text-on-error shadow-lg shadow-error/20 transition-all hover:bg-error/90 active:scale-95 disabled:opacity-50 sm:px-4 sm:py-2.5"
                                >
                                    {isDeleting ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin text-[16px]">
                                                sync
                                            </span>
                                            Menghapus...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">
                                                delete
                                            </span>
                                            Ya, Hapus Sampel
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Bulk Reset All Manifest Modal */}
            <AnimatePresence>
                {showResetModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isDeleting && setShowResetModal(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-error/30 bg-surface dark:bg-[#0F1B36] p-5 sm:p-6 shadow-[0_20px_40px_-15px_rgba(220,38,38,0.2)]"
                        >
                            <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-error/15 blur-[40px] pointer-events-none"></div>

                            <div className="flex items-start gap-3 sm:gap-4">
                                <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-error/15 text-error shadow-sm ring-4 ring-error/10 overflow-hidden">
                                    <div className="absolute inset-0 bg-error/30 animate-[pulse_1.5s_ease-in-out_infinite]"></div>
                                    <span className="material-symbols-outlined relative z-10 text-[26px] sm:text-[28px]">
                                        delete_forever
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1 relative z-10">
                                    <h3 className="text-base font-bold text-on-surface dark:text-white sm:text-lg">
                                        Reset Seluruh Dataset Manifest?
                                    </h3>
                                    <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant dark:text-slate-400 sm:text-xs">
                                        Tindakan ini akan menghapus permanen seluruh (<strong>{stats.counts.total} sampel frame</strong>) dari manifest CSV dan menghapus berkas citra terkait di penyimpanan.
                                    </p>
                                </div>
                            </div>

                            {/* Critical Warning Box */}
                            <div className="mt-4 rounded-2xl border border-error/30 dark:border-rose-500/30 bg-error-container/30 dark:bg-rose-950/40 p-3 sm:p-3.5 text-xs text-on-error-container dark:text-rose-300">
                                <div className="flex items-start gap-2.5">
                                    <span className="material-symbols-outlined text-[18px] text-error dark:text-rose-400 shrink-0 mt-0.5">
                                        warning
                                    </span>
                                    <p className="leading-relaxed text-[11px] sm:text-xs">
                                        <strong>Peringatan Penting:</strong> Tindakan ini tidak dapat dibatalkan. Berkas <code className="rounded bg-error-container dark:bg-rose-900/60 px-1 py-0.5 font-mono text-[10px] sm:text-[11px]">MANIFEST_QALWANI.csv</code> akan direset ke kondisi awal.
                                    </p>
                                </div>
                            </div>

                            {/* Confirmation Checkbox */}
                            <div className="mt-4">
                                <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-2.5 sm:p-3 text-xs text-on-surface dark:text-slate-200 transition-colors hover:bg-surface-container dark:hover:bg-slate-900/90">
                                    <input
                                        type="checkbox"
                                        checked={confirmResetCheck}
                                        onChange={(e) => setConfirmResetCheck(e.target.checked)}
                                        className="h-4 w-4 mt-0.5 rounded border-outline text-error focus:ring-error"
                                    />
                                    <span className="font-medium text-[10px] sm:text-xs leading-snug">
                                        Saya memahami risiko dan setuju menghapus seluruh {stats.counts.total} sampel frame.
                                    </span>
                                </label>
                            </div>

                            {/* Modal Actions */}
                            <div className="mt-5 flex items-center justify-end gap-2.5 sm:mt-6 sm:gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowResetModal(false);
                                        setConfirmResetCheck(false);
                                    }}
                                    disabled={isDeleting}
                                    className="rounded-xl border border-outline-variant dark:border-white/10 bg-surface dark:bg-white/10 px-3.5 py-2 text-xs font-semibold text-on-surface dark:text-slate-200 transition-colors hover:bg-surface-variant dark:hover:bg-white/20 active:scale-95 disabled:opacity-50 sm:px-4 sm:py-2.5"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDeleteAll}
                                    disabled={!confirmResetCheck || isDeleting}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-error px-3.5 py-2 text-xs font-bold text-on-error shadow-lg shadow-error/25 transition-all hover:bg-error/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:py-2.5"
                                >
                                    {isDeleting ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin text-[16px]">
                                                sync
                                            </span>
                                            Mereset Dataset...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">
                                                delete_forever
                                            </span>
                                            Hapus Semua &amp; Reset Manifest
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </AuthenticatedLayout>
    );
}
