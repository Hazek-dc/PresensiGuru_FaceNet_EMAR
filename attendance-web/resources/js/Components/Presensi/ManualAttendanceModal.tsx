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
    Lock,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
    name: string;
    embedding_id: string;
    template_hash: string;
    has_existing_template: boolean;
    existing_embedding_id?: string | null;
}

interface ManualEnrollmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    currentUserId: number;
    currentUserRole: string;
}

type Step =
    'SUBJECT_SELECT' | 'CONSENT' | 'CAPTURING' | 'PREVIEW_REPLACE' | 'SUCCESS';

export function ManualEnrollmentModal({
    isOpen,
    onClose,
    onSuccess,
    currentUserId,
    currentUserRole,
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
    const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([]);
    const [capturedPreviews, setCapturedPreviews] = useState<string[]>([]);
    const [isCapturing, setIsCapturing] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Preview & Commit State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewToken, setPreviewToken] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [replaceConfirmed, setReplaceConfirmed] = useState(false);

    // Reset state on open/close
    useEffect(() => {
        if (isOpen) {
            setStep('SUBJECT_SELECT');
            setSelectedSubject(null);
            setConsentChecked(false);
            setCapturedBlobs([]);
            setCapturedPreviews([]);
            setErrorMsg(null);
            setPreviewToken(null);
            setPreviewData(null);
            setReplaceConfirmed(false);
            fetchSubjects();
        } else {
            stopCamera();
        }
    }, [isOpen]);

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
                const list = res.data.subjects || [];
                setSubjects(list);
                // If only 1 subject (normal teacher), auto-select
                if (list.length === 1) {
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
            capturedBlobs.length >= 3
        )
            return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const previewUrl = URL.createObjectURL(blob);
                        setCapturedBlobs((prev) => [...prev, blob]);
                        setCapturedPreviews((prev) => [...prev, previewUrl]);
                    }
                },
                'image/jpeg',
                0.9,
            );
        }
    };

    const handleRemoveSample = (index: number) => {
        setCapturedBlobs((prev) => prev.filter((_, i) => i !== index));
        setCapturedPreviews((prev) => {
            const next = prev.filter((_, i) => i !== index);
            URL.revokeObjectURL(prev[index]);
            return next;
        });
    };

    const handleSubmitPreview = async () => {
        if (!selectedSubject || capturedBlobs.length === 0) return;
        setIsSubmitting(true);
        setErrorMsg(null);

        try {
            const formData = new FormData();
            formData.append('subject_id', String(selectedSubject.id));
            formData.append('consent_checked', consentChecked ? '1' : '0');
            formData.append('consent_version', consentVersion);

            capturedBlobs.forEach((blob, idx) => {
                formData.append('files[]', blob, `sample_${idx + 1}.jpg`);
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
            const msg =
                err.response?.data?.message ||
                err.response?.data?.errors?.consent_checked?.[0] ||
                'Gagal memproses sampel wajah. Silakan ulangi pengambilan sampel yang lebih jelas.';
            setErrorMsg(msg);
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
                setStep('SUCCESS');
            }
        } catch (err: any) {
            const msg =
                err.response?.data?.message ||
                'Gagal menyimpan template biometrik ke database.';
            setErrorMsg(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const filteredSubjects = subjects.filter(
        (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.department &&
                s.department.toLowerCase().includes(searchQuery.toLowerCase())),
    );

    return (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
            <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
                {/* Header & Step Indicator */}
                <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/50 px-6 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold tracking-tight text-white">
                                Face Enrollment Manual
                            </h3>
                            <p className="text-xs text-slate-400">
                                Pendaftaran Vektor Biometrik Wajah Warga Sekolah
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Progress Steps Bar */}
                <div className="flex items-center justify-between border-b border-slate-800/60 bg-slate-950/40 px-8 py-3 text-xs font-medium text-slate-400">
                    <div
                        className={`flex items-center gap-1.5 ${step === 'SUBJECT_SELECT' ? 'font-semibold text-indigo-400' : ''}`}
                    >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800">
                            1
                        </span>
                        <span>Subjek</span>
                    </div>
                    <ChevronRight className="h-3 w-3 text-slate-600" />
                    <div
                        className={`flex items-center gap-1.5 ${step === 'CONSENT' ? 'font-semibold text-indigo-400' : ''}`}
                    >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800">
                            2
                        </span>
                        <span>Consent</span>
                    </div>
                    <ChevronRight className="h-3 w-3 text-slate-600" />
                    <div
                        className={`flex items-center gap-1.5 ${step === 'CAPTURING' ? 'font-semibold text-indigo-400' : ''}`}
                    >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800">
                            3
                        </span>
                        <span>Sampel</span>
                    </div>
                    <ChevronRight className="h-3 w-3 text-slate-600" />
                    <div
                        className={`flex items-center gap-1.5 ${step === 'PREVIEW_REPLACE' ? 'font-semibold text-indigo-400' : ''}`}
                    >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800">
                            4
                        </span>
                        <span>Verifikasi</span>
                    </div>
                    <ChevronRight className="h-3 w-3 text-slate-600" />
                    <div
                        className={`flex items-center gap-1.5 ${step === 'SUCCESS' ? 'font-semibold text-emerald-400' : ''}`}
                    >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800">
                            5
                        </span>
                        <span>Selesai</span>
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                    {errorMsg && (
                        <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-sm text-rose-300">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                            <div className="flex-1">
                                <p className="font-semibold">
                                    Terjadi Kesalahan
                                </p>
                                <p className="mt-0.5 text-xs text-rose-300/90">
                                    {errorMsg}
                                </p>
                            </div>
                            <button
                                onClick={() => setErrorMsg(null)}
                                className="text-rose-400 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* STEP 1: SUBJECT SELECT */}
                    {step === 'SUBJECT_SELECT' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
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
                                                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all ${
                                                        isSelected
                                                            ? 'border-indigo-500/50 bg-indigo-600/15 shadow-sm shadow-indigo-500/5'
                                                            : 'border-slate-800/80 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/40'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                                                                isSelected
                                                                    ? 'bg-indigo-500 text-white'
                                                                    : 'bg-slate-800 text-slate-300'
                                                            }`}
                                                        >
                                                            {sub.name
                                                                .charAt(0)
                                                                .toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="text-sm font-semibold text-white">
                                                                    {sub.name}
                                                                </h4>
                                                                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                                                                    {sub.role}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-400">
                                                                {sub.email}{' '}
                                                                {sub.department
                                                                    ? `â€¢ ${sub.department}`
                                                                    : ''}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
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

                            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
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
                                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50"
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
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
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

                            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setStep('SUBJECT_SELECT')}
                                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    <span>Kembali</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={!consentChecked}
                                    onClick={() => setStep('CAPTURING')}
                                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50"
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
                                                <div className="flex h-64 w-48 items-center justify-center rounded-full border-2 border-dashed border-indigo-400/60 shadow-[0_0_0_9999px_rgba(2,6,23,0.5)]">
                                                    <div className="h-60 w-44 animate-pulse rounded-full border border-indigo-500/30" />
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
                                            Sampel Wajah ({capturedBlobs.length}
                                            /3)
                                        </h4>
                                        <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                                            Ambil 3 foto dengan sudut sedikit
                                            berbeda (depan, sedikit senyum,
                                            tegap) di pencahayaan terang.
                                        </p>

                                        <div className="grid grid-cols-3 gap-2">
                                            {[0, 1, 2].map((idx) => {
                                                const prevUrl =
                                                    capturedPreviews[idx];
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900"
                                                    >
                                                        {prevUrl ? (
                                                            <>
                                                                <img
                                                                    src={
                                                                        prevUrl
                                                                    }
                                                                    alt={`Sample ${idx + 1}`}
                                                                    className="h-full w-full -scale-x-100 transform object-cover"
                                                                />
                                                                <button
                                                                    onClick={() =>
                                                                        handleRemoveSample(
                                                                            idx,
                                                                        )
                                                                    }
                                                                    className="absolute right-0.5 top-0.5 rounded-full bg-rose-600/80 p-1 text-white transition-colors hover:bg-rose-600"
                                                                >
                                                                    <X className="h-2.5 w-2.5" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs font-bold text-slate-600">
                                                                {idx + 1}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={
                                            capturedBlobs.length >= 3 ||
                                            !!cameraError
                                        }
                                        onClick={handleTakeSample}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
                                    >
                                        <Camera className="h-3.5 w-3.5 text-indigo-400" />
                                        <span>
                                            Jepret Foto ({capturedBlobs.length}
                                            /3)
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setStep('CONSENT')}
                                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    <span>Kembali</span>
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        capturedBlobs.length < 1 || isSubmitting
                                    }
                                    onClick={handleSubmitPreview}
                                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            <span>Mengekstrak Vektor...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>
                                                Verifikasi Kualitas Sampel
                                            </span>
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
                                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-emerald-300">
                                            Ekstraksi Vektor Wajah Berhasil!
                                        </h4>
                                        <p className="mt-0.5 text-xs text-emerald-400/80">
                                            Sampel memenuhi standar pencahayaan
                                            dan kualitas embedding biometrik.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
                                    <div className="flex justify-between border-b border-slate-800 py-1">
                                        <span className="text-slate-400">
                                            Subjek Pendaftaran
                                        </span>
                                        <span className="font-semibold text-white">
                                            {previewData.name} (ID:{' '}
                                            {previewData.subject_id})
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-slate-800 py-1">
                                        <span className="text-slate-400">
                                            Vektor Embedding ID
                                        </span>
                                        <span className="font-mono font-semibold text-indigo-400">
                                            {previewData.embedding_id}
                                        </span>
                                    </div>
                                    <div className="flex justify-between py-1">
                                        <span className="text-slate-400">
                                            Template Integrity Hash
                                        </span>
                                        <span className="font-mono text-slate-300">
                                            {previewData.template_hash}
                                        </span>
                                    </div>
                                </div>

                                {previewData.has_existing_template && (
                                    <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                                        <div className="flex items-start gap-2.5 text-amber-300">
                                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                                            <div>
                                                <h5 className="text-sm font-semibold">
                                                    Peringatan Penggantian
                                                    Template Lama
                                                </h5>
                                                <p className="mt-1 text-xs leading-relaxed text-amber-300/90">
                                                    Subjek ini sebelumnya telah
                                                    memiliki template biometrik
                                                    aktif (
                                                    <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-amber-200">
                                                        {
                                                            previewData.existing_embedding_id
                                                        }
                                                    </code>
                                                    ). Menyimpan template baru
                                                    ini akan menimpa dan
                                                    menghapus vektor lama dari
                                                    database.
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
                                                Saya mengonfirmasi untuk menimpa
                                                dan menggantikan template
                                                biometrik lama dengan template
                                                baru ini.
                                            </span>
                                        </label>
                                    </div>
                                )}

                                <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => setStep('CAPTURING')}
                                        className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
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
                                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-50"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                <span>
                                                    Menyimpan ke Database...
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <Check className="h-4 w-4" />
                                                <span>
                                                    Simpan & Commit Permanen
                                                </span>
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
                                    Enrollment Wajah Berhasil!
                                </h4>
                                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                                    Vektor biometrik wajah untuk{' '}
                                    <strong className="text-white">
                                        {selectedSubject?.name}
                                    </strong>{' '}
                                    telah resmi disimpan dan aktif untuk
                                    verifikasi presensi sekolah.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep('SUBJECT_SELECT');
                                        setSelectedSubject(null);
                                        setCapturedBlobs([]);
                                        setCapturedPreviews([]);
                                        setErrorMsg(null);
                                        setPreviewToken(null);
                                        setPreviewData(null);
                                        setReplaceConfirmed(false);
                                        fetchSubjects();
                                    }}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-5 py-2.5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
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
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500"
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
