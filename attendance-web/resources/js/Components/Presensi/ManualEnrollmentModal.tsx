import axios from 'axios';
import {
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    Camera,
    Check,
    CheckCircle2,
    ChevronRight,
    FileText,
    Info,
    Lock,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
    canRequestPreview,
    canTakeSample,
    distanceToCurrentText,
    enrollmentErrorMessage,
    facesDetectedText,
    MAX_ENROLL_SAMPLES,
    MIN_ENROLL_SAMPLES,
    sameEmbeddingId,
    sampleHint,
} from '../../Utils/enrollmentPreview';

interface Subject {
    id: number;
    name: string;
    email: string;
    role: string;
    department?: string;
    embedding_id?: string | null;
    is_test_data?: boolean;
}

interface PreviewData {
    subject_id: number;
    engine_subject_id?: string;
    name: string;
    embedding_id: string;
    template_hash: string | null;
    n_frames: number | null;
    n_uploaded: number | null;
    distance_to_current: number | null;
    has_existing_template: boolean;
    existing_embedding_id?: string | null;
}

interface CommitResult {
    embedding_id: string;
    template_hash: string | null;
    backup: string | null;
}

interface Sample {
    blob: Blob;
    url: string;
}

interface ManualEnrollmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    currentUserId: number;
    currentUserRole: string;
    /** Pilih otomatis subjek ini (embedding_id), mis. dari hasil presensi yang gagal. */
    preselectEmbeddingId?: string | null;
}

type Step =
    'SUBJECT_SELECT' | 'CONSENT' | 'CAPTURING' | 'PREVIEW_REPLACE' | 'SUCCESS';

const STEPS: { key: Step; label: string }[] = [
    { key: 'SUBJECT_SELECT', label: 'Subjek' },
    { key: 'CONSENT', label: 'Consent' },
    { key: 'CAPTURING', label: 'Sampel' },
    { key: 'PREVIEW_REPLACE', label: 'Pratinjau' },
    { key: 'SUCCESS', label: 'Selesai' },
];

export function ManualEnrollmentModal({
    isOpen,
    onClose,
    onSuccess,
    currentUserId,
    currentUserRole,
    preselectEmbeddingId = null,
}: ManualEnrollmentModalProps) {
    const [step, setStep] = useState<Step>('SUBJECT_SELECT');
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(
        null,
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingSubjects, setLoadingSubjects] = useState(false);

    // Consent State
    const [consentChecked, setConsentChecked] = useState(false);
    const consentVersion = 'v1.0-2026-BIOMETRIC-EMAR';

    // Camera & Capture State
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [samples, setSamples] = useState<Sample[]>([]);
    // canvas.toBlob asinkron: klik cepat berturut-turut bisa melewati batas 5 foto.
    const pendingCapturesRef = useRef(0);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Preview & Commit State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewToken, setPreviewToken] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [replaceConfirmed, setReplaceConfirmed] = useState(false);
    const [commitResult, setCommitResult] = useState<CommitResult | null>(
        null,
    );

    const samplesRef = useRef<Sample[]>([]);
    samplesRef.current = samples;

    const clearSamples = () => {
        samplesRef.current.forEach((s) => URL.revokeObjectURL(s.url));
        setSamples([]);
    };

    const clearPreview = () => {
        setPreviewToken(null);
        setPreviewData(null);
        setReplaceConfirmed(false);
    };

    // Reset state on open/close
    useEffect(() => {
        if (isOpen) {
            setStep('SUBJECT_SELECT');
            setSelectedSubject(null);
            setConsentChecked(false);
            clearSamples();
            setErrorMsg(null);
            clearPreview();
            setCommitResult(null);
            fetchSubjects();
        } else {
            stopCamera();
        }
    }, [isOpen]);

    useEffect(() => {
        return () => {
            samplesRef.current.forEach((s) => URL.revokeObjectURL(s.url));
        };
    }, []);

    // Handle camera lifecycle
    useEffect(() => {
        if (step === 'CAPTURING' && isOpen) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => {
            stopCamera();
        };
    }, [step, isOpen]);

    const fetchSubjects = async () => {
        setLoadingSubjects(true);
        try {
            const res = await axios.get('/api/presensi/enroll/subjects');
            if (res.data.status === 'success') {
                const list: Subject[] = res.data.subjects || [];
                setSubjects(list);
                // Admin melihat semua akun, termasuk dua akun bernama sama; subjek
                // yang baru gagal presensi dipilih lewat embedding_id-nya.
                const wanted = preselectEmbeddingId
                    ? list.find((s) => sameEmbeddingId(s.embedding_id, preselectEmbeddingId))
                    : undefined;
                if (wanted) {
                    setSelectedSubject(wanted);
                } else if (list.length === 1) {
                    setSelectedSubject(list[0]);
                }
            }
        } catch (err: any) {
            setErrorMsg('Gagal memuat daftar subjek yang diotorisasi.');
        } finally {
            setLoadingSubjects(false);
        }
    };

    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = async () => {
        setCameraError(null);
        try {
            if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const isSecure = typeof window !== 'undefined' && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                if (!isSecure) {
                    throw new Error('SECURE_CONTEXT_REQUIRED');
                }
                throw new Error('MEDIA_DEVICES_NOT_SUPPORTED');
            }

            // Stop any existing stream first
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }

            const constraintsLadder: MediaStreamConstraints[] = [
                // 1. FHD 1080p with facingMode
                {
                    video: {
                        width: { ideal: 1920, min: 1280 },
                        height: { ideal: 1080, min: 720 },
                        facingMode: 'user',
                    },
                    audio: false,
                },
                // 2. HD 720p with facingMode
                {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
                    },
                    audio: false,
                },
                // 3. Any resolution with facingMode
                {
                    video: { facingMode: 'user' },
                    audio: false,
                },
                // 4. HD 720p without facingMode (for desktop/USB webcams)
                {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                },
                // 5. Bare minimum video stream
                {
                    video: true,
                    audio: false,
                },
            ];

            let mediaStream: MediaStream | null = null;
            let lastErr: unknown = null;

            for (let i = 0; i < constraintsLadder.length; i++) {
                try {
                    mediaStream = await navigator.mediaDevices.getUserMedia(constraintsLadder[i]);
                    if (mediaStream) break;
                } catch (tryErr) {
                    lastErr = tryErr;
                    console.warn(`Manual enrollment camera attempt ${i + 1} failed:`, tryErr);
                }
            }

            if (!mediaStream) {
                throw lastErr || new Error('Tidak dapat memulai kamera.');
            }

            streamRef.current = mediaStream;
            setStream(mediaStream);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play().catch(() => {});
            }
        } catch (err: any) {
            console.error('Manual enrollment camera access error:', err);
            let msg = 'Gagal mengakses kamera. Pastikan izin kamera telah diberikan di browser.';

            if (err instanceof Error && err.message === 'SECURE_CONTEXT_REQUIRED') {
                msg = 'Akses kamera diblokir karena koneksi tidak aman (HTTP). Buka melalui http://localhost:8000 atau protokol HTTPS.';
            } else if (err instanceof Error && err.message === 'MEDIA_DEVICES_NOT_SUPPORTED') {
                msg = 'Browser tidak mendukung WebRTC Camera API.';
            } else if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
                if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    msg = 'Kamera sedang digunakan oleh aplikasi lain (misal script Python atau Windows Camera). Tutup aplikasi tersebut lalu coba lagi.';
                } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    msg = 'Izin kamera ditolak. Harap izinkan akses kamera di pengaturan browser.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    msg = 'Kamera tidak ditemukan. Pastikan webcam terpasang.';
                }
            }
            setCameraError(msg);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStream(null);
    };

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
        }
    }, [stream]);

    const handleTakeSample = () => {
        if (
            !videoRef.current ||
            !canvasRef.current ||
            !canTakeSample(samples.length + pendingCapturesRef.current)
        )
            return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            pendingCapturesRef.current += 1;
            canvas.toBlob(
                (blob) => {
                    pendingCapturesRef.current -= 1;
                    if (blob) {
                        setSamples((prev) => [
                            ...prev,
                            { blob, url: URL.createObjectURL(blob) },
                        ]);
                    }
                },
                'image/jpeg',
                0.9,
            );
        }
    };

    const handleRemoveSample = (index: number) => {
        setSamples((prev) => {
            const removed = prev[index];
            if (removed) URL.revokeObjectURL(removed.url);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmitPreview = async () => {
        if (!selectedSubject || !canRequestPreview(samples.length, isSubmitting)) return;
        setIsSubmitting(true);
        setErrorMsg(null);
        clearPreview();

        try {
            const formData = new FormData();
            formData.append('subject_id', String(selectedSubject.id));
            formData.append('consent_checked', consentChecked ? '1' : '0');
            formData.append('consent_version', consentVersion);

            samples.forEach((sample, idx) => {
                formData.append('files[]', sample.blob, `sample_${idx + 1}.jpg`);
            });

            const res = await axios.post(
                '/api/presensi/enroll/preview',
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                },
            );

            if (res.data.status === 'success') {
                setPreviewToken(res.data.preview_token);
                setPreviewData(res.data.preview_data);
                setStep('PREVIEW_REPLACE');
            }
        } catch (err: any) {
            setErrorMsg(
                enrollmentErrorMessage(
                    err.response?.data,
                    'Gagal memproses sampel wajah. Silakan ulangi pengambilan sampel yang lebih jelas.',
                ),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCommit = async () => {
        if (!previewToken || !selectedSubject || !previewData) return;
        if (previewData.has_existing_template && !replaceConfirmed) {
            setErrorMsg(
                'Anda wajib mengonfirmasi penggantian template lama sebelum melanjutkan.',
            );
            return;
        }

        setIsSubmitting(true);
        setErrorMsg(null);

        try {
            const res = await axios.post('/api/presensi/enroll/commit', {
                preview_token: previewToken,
                subject_id: selectedSubject.id,
                consent_checked: consentChecked,
                consent_version: consentVersion,
                replace_confirmed: replaceConfirmed,
            });

            if (res.data.status === 'success') {
                setCommitResult({
                    embedding_id: res.data.embedding_id,
                    template_hash: res.data.template_hash ?? null,
                    backup: res.data.backup ?? null,
                });
                clearSamples();
                setStep('SUCCESS');
            }
        } catch (err: any) {
            const data = err.response?.data;
            // Server menemukan template lama yang tidak terlihat di pratinjau:
            // tampilkan kotak konfirmasi penggantian.
            if (err.response?.status === 409 && data?.requires_replacement_confirmation) {
                setPreviewData((prev) =>
                    prev ? { ...prev, has_existing_template: true } : prev,
                );
            }
            setErrorMsg(
                enrollmentErrorMessage(
                    data,
                    'Gagal menyimpan template biometrik. Belum ada yang berubah.',
                ),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForAnotherSubject = () => {
        setStep('SUBJECT_SELECT');
        setSelectedSubject(null);
        clearSamples();
        setErrorMsg(null);
        clearPreview();
        setCommitResult(null);
        fetchSubjects();
    };

    if (!isOpen) return null;

    const filteredSubjects = subjects.filter(
        (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.department &&
                s.department.toLowerCase().includes(searchQuery.toLowerCase())),
    );

    const facesText = previewData
        ? facesDetectedText(previewData.n_frames, previewData.n_uploaded)
        : null;
    const existingKey =
        previewData?.existing_embedding_id ||
        previewData?.engine_subject_id ||
        previewData?.embedding_id;

    return (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="manual-enrollment-title"
                className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl"
            >
                {/* Header & Step Indicator */}
                <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/50 px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <h3
                                id="manual-enrollment-title"
                                className="font-semibold tracking-tight text-white"
                            >
                                Face Enrollment Manual
                            </h3>
                            <p className="text-xs text-slate-400">
                                Pendaftaran Vektor Biometrik Wajah Warga Sekolah
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Tutup pendaftaran wajah"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Progress Steps Bar */}
                <ol className="flex items-center justify-between border-b border-slate-800/60 bg-slate-950/40 px-4 py-3 text-xs font-medium text-slate-400 sm:px-8">
                    {STEPS.map((s, idx) => (
                        <li key={s.key} className="flex items-center gap-1.5">
                            {idx > 0 && (
                                <ChevronRight className="mr-1.5 h-3 w-3 text-slate-600" />
                            )}
                            <span
                                aria-current={step === s.key ? 'step' : undefined}
                                className={`flex items-center gap-1.5 ${
                                    step === s.key
                                        ? s.key === 'SUCCESS'
                                            ? 'font-semibold text-emerald-400'
                                            : 'font-semibold text-indigo-400'
                                        : ''
                                }`}
                            >
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800">
                                    {idx + 1}
                                </span>
                                <span
                                    className={
                                        step === s.key ? 'inline' : 'hidden sm:inline'
                                    }
                                >
                                    {s.label}
                                </span>
                            </span>
                        </li>
                    ))}
                </ol>

                {/* Body Content */}
                <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
                    {errorMsg && (
                        <div
                            role="alert"
                            className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-sm text-rose-300"
                        >
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                            <div className="flex-1">
                                <p className="font-semibold">
                                    Terjadi Kesalahan
                                </p>
                                <p className="mt-0.5 break-words text-xs text-rose-200">
                                    {errorMsg}
                                </p>
                            </div>
                            <button
                                onClick={() => setErrorMsg(null)}
                                aria-label="Tutup pesan kesalahan"
                                className="text-rose-400 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* STEP 1: SUBJECT SELECT */}
                    {step === 'SUBJECT_SELECT' && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="text-sm font-medium text-slate-200">
                                    Pilih Warga Sekolah untuk Didaftarkan
                                </label>
                                {selectedSubject && (
                                    <span className="rounded-full border border-indigo-500/30 bg-indigo-500/20 px-2.5 py-1 text-xs text-indigo-300">
                                        Terpilih: {selectedSubject.name}
                                    </span>
                                )}
                            </div>

                            {loadingSubjects ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
                                    <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
                                    <p className="text-sm">
                                        Memuat daftar subjek...
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {subjects.length > 1 && (
                                        <div className="relative">
                                            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                                            <input
                                                type="text"
                                                placeholder="Cari berdasarkan nama, email, atau departemen..."
                                                value={searchQuery}
                                                onChange={(e) =>
                                                    setSearchQuery(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                                            />
                                        </div>
                                    )}

                                    <div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1">
                                        {filteredSubjects.map((sub) => {
                                            const isSelected =
                                                selectedSubject?.id === sub.id;
                                            return (
                                                <div
                                                    key={sub.id}
                                                    onClick={() =>
                                                        setSelectedSubject(sub)
                                                    }
                                                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3.5 transition-all ${
                                                        isSelected
                                                            ? 'border-indigo-500/50 bg-indigo-600/15 shadow-sm shadow-indigo-500/5'
                                                            : 'border-slate-800/80 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/40'
                                                    }`}
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div
                                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                                                                isSelected
                                                                    ? 'bg-indigo-500 text-white'
                                                                    : 'bg-slate-800 text-slate-300'
                                                            }`}
                                                        >
                                                            {sub.name
                                                                .charAt(0)
                                                                .toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="truncate text-sm font-semibold text-white">
                                                                    {sub.name}
                                                                </h4>
                                                                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                                                                    {sub.role}
                                                                </span>
                                                            </div>
                                                            <p className="truncate text-xs text-slate-400">
                                                                {sub.email}{' '}
                                                                {sub.department
                                                                    ? `• ${sub.department}`
                                                                    : ''}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex shrink-0 items-center gap-2">
                                                        {sub.embedding_id ? (
                                                            <span className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
                                                                <Check className="h-3 w-3" />{' '}
                                                                Aktif
                                                            </span>
                                                        ) : (
                                                            <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                                                                Belum Terdaftar
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    disabled={!selectedSubject}
                                    onClick={() => setStep('CONSENT')}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <span>Lanjut ke Persetujuan (Consent)</span>
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: EXPLICIT CONSENT */}
                    {step === 'CONSENT' && selectedSubject && (
                        <div className="space-y-4">
                            <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-indigo-400">
                                        <FileText className="h-4 w-4" />
                                        <span>
                                            Dokumen Persetujuan Biometrik Wajah
                                        </span>
                                    </div>
                                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">
                                        {consentVersion}
                                    </span>
                                </div>

                                <div className="space-y-2.5 text-xs leading-relaxed text-slate-300">
                                    <p>
                                        Anda sedang melakukan pendaftaran
                                        identitas biometrik wajah untuk subjek:{' '}
                                        <strong className="font-semibold text-white">
                                            {selectedSubject.name}
                                        </strong>{' '}
                                        ({selectedSubject.email}).
                                    </p>
                                    <div className="space-y-1.5 rounded-lg border border-indigo-500/10 bg-indigo-500/5 p-3">
                                        <p className="flex items-center gap-1.5 font-semibold text-indigo-300">
                                            <Lock className="h-3.5 w-3.5" />{' '}
                                            Jaminan Keamanan & Privasi Data
                                        </p>
                                        <ul className="list-inside list-disc space-y-1 pl-1 text-slate-300">
                                            <li>
                                                <strong>
                                                    Tanpa Penyimpanan Foto
                                                    Mentah:
                                                </strong>{' '}
                                                Frame kamera Anda hanya diproses
                                                sementara di RAM server untuk
                                                menghasilkan vektor numerik
                                                (512-d embedding) dan langsung
                                                dimusnahkan.
                                            </li>
                                            <li>
                                                <strong>
                                                    Enkripsi Vektor:
                                                </strong>{' '}
                                                Template biometrik disimpan
                                                dengan enkripsi standar industri
                                                di dalam database sekolah.
                                            </li>
                                            <li>
                                                <strong>
                                                    Tujuan Eksklusif:
                                                </strong>{' '}
                                                Vektor hanya digunakan untuk
                                                verifikasi presensi fisik dan
                                                deteksi anti-spoofing (EMAR).
                                            </li>
                                            <li>
                                                <strong>Hak Pencabutan:</strong>{' '}
                                                Anda berhak mencabut persetujuan
                                                ini dan menghapus vektor
                                                biometrik Anda sewaktu-waktu
                                                melalui sistem atau
                                                administrator.
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3.5 transition-colors hover:bg-slate-800/70">
                                <input
                                    type="checkbox"
                                    checked={consentChecked}
                                    onChange={(e) =>
                                        setConsentChecked(e.target.checked)
                                    }
                                    className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                                />
                                <span className="text-xs font-medium leading-normal text-slate-200">
                                    Saya telah membaca, memahami, dan memberikan
                                    persetujuan eksplisit (consent) untuk
                                    pemrosesan dan penyimpanan template
                                    biometrik wajah sesuai dengan ketentuan di
                                    atas.
                                </span>
                            </label>

                            <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <button
                                    type="button"
                                    onClick={() => setStep('SUBJECT_SELECT')}
                                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    <span>Kembali</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={!consentChecked}
                                    onClick={() => setStep('CAPTURING')}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <Camera className="h-4 w-4" />
                                    <span>Setuju & Aktifkan Kamera</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: CAPTURING SAMPLES */}
                    {step === 'CAPTURING' && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-4 md:flex-row">
                                {/* Camera Stream Preview */}
                                <div className="relative flex aspect-video flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                                    {cameraError ? (
                                        <div className="space-y-2 p-6 text-center text-rose-400">
                                            <AlertTriangle className="mx-auto h-8 w-8" />
                                            <p className="text-xs font-medium">
                                                {cameraError}
                                            </p>
                                            <button
                                                onClick={startCamera}
                                                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                                            >
                                                Coba Lagi
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className="h-full w-full -scale-x-100 transform object-cover"
                                            />
                                            {/* Oval Guide Overlay */}
                                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                <div className="flex h-[80%] aspect-[3/4] items-center justify-center rounded-full border-2 border-dashed border-indigo-400/60 shadow-[0_0_0_9999px_rgba(2,6,23,0.5)]">
                                                    <div className="h-[94%] w-[94%] animate-pulse rounded-full border border-indigo-500/30 motion-reduce:animate-none" />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <canvas
                                        ref={canvasRef}
                                        className="hidden"
                                    />
                                </div>

                                {/* Samples Sidebar */}
                                <div className="flex w-full flex-col justify-between space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 md:w-56">
                                    <div>
                                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                            Sampel Wajah ({samples.length}/
                                            {MAX_ENROLL_SAMPLES})
                                        </h4>
                                        <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                                            Ambil {MIN_ENROLL_SAMPLES}–
                                            {MAX_ENROLL_SAMPLES} foto dengan
                                            sudut sedikit berbeda (depan,
                                            sedikit senyum, tegap) di
                                            pencahayaan terang.
                                        </p>

                                        <div className="grid grid-cols-5 gap-2 md:grid-cols-3">
                                            {Array.from(
                                                { length: MAX_ENROLL_SAMPLES },
                                                (_, idx) => idx,
                                            ).map((idx) => {
                                                const sample = samples[idx];
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-slate-900 ${
                                                            idx < MIN_ENROLL_SAMPLES
                                                                ? 'border-slate-700'
                                                                : 'border-dashed border-slate-800'
                                                        }`}
                                                    >
                                                        {sample ? (
                                                            <>
                                                                <img
                                                                    src={
                                                                        sample.url
                                                                    }
                                                                    alt={`Sampel ${idx + 1}`}
                                                                    className="h-full w-full -scale-x-100 transform object-cover"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Hapus sampel ${idx + 1}`}
                                                                    onClick={() =>
                                                                        handleRemoveSample(
                                                                            idx,
                                                                        )
                                                                    }
                                                                    className="absolute right-0.5 top-0.5 rounded-full bg-rose-600/90 p-1 text-white transition-colors hover:bg-rose-600"
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs font-bold text-slate-500">
                                                                {idx + 1}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p
                                            aria-live="polite"
                                            className="mt-2 text-[11px] text-slate-400"
                                        >
                                            {sampleHint(samples.length)}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={
                                            !canTakeSample(samples.length) ||
                                            !!cameraError ||
                                            isSubmitting
                                        }
                                        onClick={handleTakeSample}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                                    >
                                        <Camera className="h-3.5 w-3.5 text-indigo-400" />
                                        <span>
                                            Jepret Foto ({samples.length}/
                                            {MAX_ENROLL_SAMPLES})
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <p className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-[11px] leading-relaxed text-slate-300">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                                <span>
                                    Pemeriksaan hanya membuat pratinjau
                                    template. Belum ada yang disimpan sampai
                                    Anda menekan <strong>Simpan</strong> di
                                    langkah berikutnya.
                                </span>
                            </p>

                            <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => setStep('CONSENT')}
                                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    <span>Kembali</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        !canRequestPreview(
                                            samples.length,
                                            isSubmitting,
                                        )
                                    }
                                    onClick={handleSubmitPreview}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            <span>Mengekstrak Vektor...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Periksa Sampel</span>
                                            <ChevronRight className="h-4 w-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: PREVIEW & REPLACE CONFIRMATION */}
                    {step === 'PREVIEW_REPLACE' &&
                        previewData &&
                        selectedSubject && (
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-indigo-200">
                                            Pratinjau template siap, belum
                                            disimpan
                                        </h4>
                                        <p className="mt-0.5 text-xs leading-relaxed text-indigo-100/90">
                                            Galeri wajah dan data pengguna
                                            belum berubah. Template baru baru
                                            dipakai untuk presensi setelah Anda
                                            menekan <strong>Simpan</strong>.
                                            Pratinjau berlaku 15 menit.
                                        </p>
                                    </div>
                                </div>

                                <dl className="space-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
                                    <div className="flex flex-wrap justify-between gap-x-3 border-b border-slate-800 py-1.5">
                                        <dt className="text-slate-400">
                                            Subjek Pendaftaran
                                        </dt>
                                        <dd className="font-semibold text-white">
                                            {previewData.name} (ID:{' '}
                                            {previewData.subject_id})
                                        </dd>
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-x-3 border-b border-slate-800 py-1.5">
                                        <dt className="text-slate-400">
                                            Kunci Galeri (Embedding ID)
                                        </dt>
                                        <dd className="break-all font-mono font-semibold text-indigo-300">
                                            {previewData.embedding_id}
                                        </dd>
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-x-3 border-b border-slate-800 py-1.5">
                                        <dt className="text-slate-400">
                                            Wajah Terdeteksi
                                        </dt>
                                        <dd className="font-semibold text-white">
                                            {facesText ?? 'Tidak dilaporkan mesin'}
                                        </dd>
                                    </div>
                                    <div className="border-b border-slate-800 py-1.5">
                                        <div className="flex flex-wrap justify-between gap-x-3">
                                            <dt className="text-slate-400">
                                                Jarak L2 ke Template Tersimpan
                                            </dt>
                                            <dd className="font-mono text-slate-200">
                                                {distanceToCurrentText(
                                                    previewData.distance_to_current,
                                                )}
                                            </dd>
                                        </div>
                                        {previewData.distance_to_current !=
                                            null && (
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                Informasi saja, bukan penilaian
                                                lolos atau gagal.
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-x-3 py-1.5">
                                        <dt className="text-slate-400">
                                            Template Integrity Hash
                                        </dt>
                                        <dd className="break-all font-mono text-slate-300">
                                            {previewData.template_hash ?? '—'}
                                        </dd>
                                    </div>
                                </dl>

                                {previewData.has_existing_template && (
                                    <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                                        <div className="flex items-start gap-2.5 text-amber-300">
                                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                                            <div>
                                                <h5 className="text-sm font-semibold">
                                                    Peringatan Penggantian
                                                    Template Lama
                                                </h5>
                                                <p className="mt-1 text-xs leading-relaxed text-amber-200">
                                                    Subjek ini sudah memiliki
                                                    template biometrik (
                                                    <code className="break-all rounded bg-amber-500/20 px-1 py-0.5 font-mono text-amber-100">
                                                        {existingKey}
                                                    </code>
                                                    ). Menyimpan akan
                                                    mengganti template itu di
                                                    galeri mesin; mesin
                                                    mencadangkan galeri lama
                                                    lebih dulu.
                                                </p>
                                            </div>
                                        </div>

                                        <label className="flex cursor-pointer items-start gap-2.5 border-t border-amber-500/20 pt-2">
                                            <input
                                                type="checkbox"
                                                checked={replaceConfirmed}
                                                onChange={(e) =>
                                                    setReplaceConfirmed(
                                                        e.target.checked,
                                                    )
                                                }
                                                className="mt-0.5 h-4 w-4 rounded border-amber-500/50 bg-slate-900 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
                                            />
                                            <span className="text-xs font-semibold text-amber-200">
                                                Saya mengonfirmasi untuk
                                                mengganti template biometrik
                                                lama dengan template baru ini.
                                            </span>
                                        </label>
                                    </div>
                                )}

                                <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => {
                                            clearPreview();
                                            setErrorMsg(null);
                                            setStep('CAPTURING');
                                        }}
                                        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        <span>Ambil Ulang Sampel</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={
                                            isSubmitting ||
                                            (previewData.has_existing_template &&
                                                !replaceConfirmed)
                                        }
                                        onClick={handleCommit}
                                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-50"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                <span>Menyimpan...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Check className="h-4 w-4" />
                                                <span>Simpan</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                    {/* STEP 5: SUCCESS */}
                    {step === 'SUCCESS' && (
                        <div className="animate-fade-in space-y-4 py-8 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-lg shadow-emerald-500/10">
                                <CheckCircle2 className="h-8 w-8" />
                            </div>
                            <div>
                                <h4 className="text-lg font-bold tracking-tight text-white">
                                    Template Wajah Tersimpan
                                </h4>
                                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                                    Template wajah untuk{' '}
                                    <strong className="text-white">
                                        {selectedSubject?.name}
                                    </strong>{' '}
                                    tersimpan di galeri mesin dan aktif untuk
                                    verifikasi presensi.
                                </p>
                            </div>

                            {commitResult && (
                                <dl className="mx-auto max-w-sm space-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left text-xs">
                                    <div className="flex flex-wrap justify-between gap-x-3">
                                        <dt className="text-slate-400">
                                            Embedding ID
                                        </dt>
                                        <dd className="break-all font-mono text-indigo-300">
                                            {commitResult.embedding_id}
                                        </dd>
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-x-3">
                                        <dt className="text-slate-400">
                                            Template hash
                                        </dt>
                                        <dd className="break-all font-mono text-slate-300">
                                            {commitResult.template_hash ?? '—'}
                                        </dd>
                                    </div>
                                    <div className="flex flex-wrap justify-between gap-x-3">
                                        <dt className="text-slate-400">
                                            Cadangan galeri lama
                                        </dt>
                                        <dd className="break-all font-mono text-slate-300">
                                            {commitResult.backup ?? 'Tidak ada'}
                                        </dd>
                                    </div>
                                </dl>
                            )}

                            <div className="flex flex-col items-center justify-center gap-3 pt-6 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={resetForAnotherSubject}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-5 py-2.5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700 hover:text-white sm:w-auto"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    <span>Ulangi / Subjek Lain</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSuccess();
                                        onClose();
                                    }}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 sm:w-auto"
                                >
                                    <Check className="h-4 w-4" />
                                    <span>Tutup & Selesai</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
