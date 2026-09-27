import DynamicBackdrop from '@/Components/DynamicBackdrop';
import ThemeSwitcher from '@/Components/ThemeSwitcher';
import { useTheme } from '@/Hooks/useTheme';
import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import {
    Activity,
    AlertCircle,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    Download,
    Eye,
    HelpCircle,
    Info,
    LayoutDashboard,
    Lock,
    Maximize2,
    Minimize2,
    Monitor,
    User as PersonIcon,
    RefreshCw,
    Search,
    Settings2,
    Shield,
    ShieldCheck,
    SkipForward,
    FileSpreadsheet,
    Smile,
    Sparkles,
    Sun,
    X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DistanceMeterWidget } from '../../Components/Presensi/DistanceMeterWidget';
import { FaceScannerContainer } from '../../Components/Presensi/FaceScannerContainer';
import { LuxometerWidget } from '../../Components/Presensi/LuxometerWidget';
import { ManualEnrollmentModal } from '../../Components/Presensi/ManualEnrollmentModal';
import { QalwaniResearchPanel } from '../../Components/Presensi/QalwaniResearchPanel';
import { QualityChecklist } from '../../Components/Presensi/QualityChecklist';
import { Bab5ScenarioCard } from '../../Components/Presensi/Bab5ScenarioCard';
import { offerReenrollment } from '../../Utils/enrollmentPreview';
import { getDistanceCategory } from '../../Utils/faceDistance';
import { l2ThresholdCaption } from '../../Utils/faceMatchDisplay';
import { getLuxCategory, NormalizedFaceROI } from '../../Utils/luxMeasurement';
import {
    DistanceSource,
    formatMeasured,
    freshReading,
    LuxSource,
    parseTargetParam,
    SensorReading,
    sensorFormFields,
    sourceLabel,
} from '../../Utils/sensorReading';

/* ------------------------------------------------------------------ */
/*  Types & Toast Feedback System                                      */
/* ------------------------------------------------------------------ */

interface Toast {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
    icon?: string;
}

function ToastContainer({
    toasts,
    onDismiss,
}: {
    toasts: Toast[];
    onDismiss: (id: number) => void;
}) {
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-[92vw] max-w-sm pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        layout
                        initial={{ opacity: 0, y: -24, scale: 0.92, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -16, scale: 0.92, filter: 'blur(4px)' }}
                        transition={{ type: 'spring' as const, stiffness: 380, damping: 26 }}
                        className={`pointer-events-auto w-full flex items-center gap-2.5 rounded-2xl border p-3 pr-3.5 text-xs font-semibold shadow-xl backdrop-blur-2xl cursor-pointer select-none ${
                            toast.type === 'error'
                                ? 'border-rose-400/40 bg-rose-50/90 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 shadow-rose-500/15'
                                : toast.type === 'success'
                                  ? 'border-emerald-400/40 bg-emerald-50/90 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 shadow-emerald-500/15'
                                  : 'border-royal-blue/30 bg-blue-50/90 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 shadow-blue-500/15'
                        }`}
                        onClick={() => onDismiss(toast.id)}
                    >
                        <span
                            className={`material-symbols-outlined text-[18px] shrink-0 ${
                                toast.type === 'error'
                                    ? 'text-rose-500'
                                    : toast.type === 'success'
                                      ? 'text-emerald-500'
                                      : 'text-royal-blue dark:text-sky-400'
                            }`}
                        >
                            {toast.icon ||
                                (toast.type === 'error'
                                    ? 'error'
                                    : toast.type === 'success'
                                      ? 'check_circle'
                                      : 'info')}
                        </span>
                        <span className="flex-1 leading-snug">{toast.message}</span>
                        <span className="material-symbols-outlined text-[16px] opacity-40 shrink-0">
                            close
                        </span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

interface User {
    id: number;
    name: string;
    email: string;
    role?: string;
    embedding_id?: string;
    is_test_data?: boolean;
}

interface Props {
    user?: User;
    schedule_session?: any;
    schedule_matrix?: any[];
}

const DEFAULT_SUBJECTS = [
    { id: 'S01', name: 'Nur Holis', email: 'gurupresensi1@gmail.com' },
    { id: 'S02', name: 'Viky Widiyanti', email: 'gurupresensi2@gmail.com' },
    { id: 'S03', name: 'Mauludin', email: 'gurupresensi3@gmail.com' },
    { id: 'S04', name: 'Ahmad Fauzi', email: 'gurupresensi4@gmail.com' },
    { id: 'S05', name: 'Merli Yanti', email: 'gurupresensi5@gmail.com' },
    { id: 'S06', name: 'Karmila Milla', email: 'gurupresensi6@gmail.com' },
    { id: 'S07', name: 'Reynaldi Surya', email: 'gurupresensi7@gmail.com' },
    { id: 'S08', name: 'Taufik Hidayat', email: 'gurupresensi8@gmail.com' },
    { id: 'S09', name: 'Wery Saputra', email: 'gurupresensi9@gmail.com' },
    { id: 'S10', name: 'Hendra Wijaya', email: 'gurupresensi10@gmail.com' },
    { id: 'S11', name: 'Susi Lisnasari', email: 'gurupresensi11@gmail.com' },
    { id: 'S12', name: 'Ponco Prastio', email: 'gurupresensi12@gmail.com' },
    { id: 'S13', name: 'Yulisma Shinta', email: 'gurupresensi13@gmail.com' },
    { id: 'S14', name: 'Arie Lazido', email: 'gurupresensi14@gmail.com' },
    { id: 'S15', name: 'Bambang Susanto', email: 'gurupresensi15@gmail.com' },
    { id: 'S16', name: 'Sri Wahyuni', email: 'gurupresensi16@gmail.com' },
    { id: 'S17', name: 'Dedi Irawan', email: 'gurupresensi17@gmail.com' },
    { id: 'S18', name: 'Eka Prasetya', email: 'gurupresensi18@gmail.com' },
];

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function Presensi({ user, schedule_session, schedule_matrix }: Props) {
    /* ---- Theme ---- */
    const { isDark } = useTheme();

    /* ---- Real-Time Digital Clock ---- */
    const [currentTime, setCurrentTime] = useState<string>('');

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(
                now.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                }),
            );
        };
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    /* ---- Fullscreen Kiosk Mode Toggle ---- */
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
        }
    };

    /* ---- SMK Al-Madani Operational SOP Schedule ---- */
    const [simulatedSession, setSimulatedSession] = useState<string>('REALTIME');
    const [showScheduleGuide, setShowScheduleGuide] = useState<boolean>(false);

    const currentSchedule = useMemo(() => {
        if (simulatedSession === '07:00') {
            return {
                session_title: 'Presensi Masuk (Tepat Waktu)',
                status: 'HADIR',
                status_label: 'HADIR (Tepat Waktu)',
                time_range: '06.30 – 07.15 WIB',
                operational_desc: 'Guru hadir sebelum bel masuk / KBM dimulai.',
                color: 'emerald',
            };
        }
        if (simulatedSession === '07:30') {
            return {
                session_title: 'Batas Toleransi (Terlambat)',
                status: 'TERLAMBAT',
                status_label: 'TERLAMBAT',
                time_range: '07.16 – 08.00 WIB',
                operational_desc: 'Verifikasi biometrik tetap ACCEPT, namun status tercatat terlambat.',
                color: 'amber',
            };
        }
        if (simulatedSession === '08:15') {
            return {
                session_title: 'Batas Akhir Masuk (Ditutup)',
                status: 'DITUTUP',
                status_label: 'DITUTUP / ALPHA',
                time_range: '> 08.00 WIB',
                operational_desc: 'Scanner menolak presensi masuk (harus lapor manual ke piket/TU).',
                color: 'rose',
            };
        }
        if (simulatedSession === '15:00') {
            return {
                session_title: 'Presensi Pulang (Senin – Kamis)',
                status: 'PULANG',
                status_label: 'PULANG',
                time_range: '14.30 – 17.00 WIB',
                operational_desc: 'Dibuka setelah jam KBM terakhir selesai.',
                color: 'sky',
            };
        }
        if (simulatedSession === '12:30') {
            return {
                session_title: 'Presensi Pulang (Jumat)',
                status: 'PULANG',
                status_label: 'PULANG',
                time_range: '11.30 – 14.00 WIB',
                operational_desc: 'Penyesuaian waktu ibadah sholat Jumat.',
                color: 'indigo',
            };
        }
        return schedule_session || {
            session_title: 'Presensi Masuk (Tepat Waktu)',
            status: 'HADIR',
            status_label: 'HADIR',
            time_range: '06.30 – 07.15 WIB',
            operational_desc: 'Guru hadir sebelum bel masuk / KBM dimulai.',
            color: 'emerald',
        };
    }, [simulatedSession, schedule_session]);

    /* ---- Scenario & Pre-Flight Payload ---- */
    const searchParams =
        typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : null;

    const [subjectId, setSubjectId] = useState<string>(
        searchParams?.get('subject_id') ||
            searchParams?.get('claimed_id') ||
            user?.embedding_id ||
            'S01',
    );
    // ?lux= dan ?distance_cm= dari Studio adalah target skenario uji, bukan hasil
    // ukur: dikirim sebagai lux_target/distance_target_cm, tidak pernah lux_value.
    const [luxTarget, setLuxTarget] = useState<number | null>(() => parseTargetParam(searchParams?.get('lux')));
    const [luxReading, setLuxReading] = useState<SensorReading<LuxSource> | null>(null);
    const scannerVideoRef = useRef<HTMLVideoElement | null>(null);

    const handleVideoRefReady = useCallback((video: HTMLVideoElement | null) => {
        scannerVideoRef.current = video;
    }, []);

    const handleLuxChange = useCallback((reading: SensorReading<LuxSource> | null) => {
        setLuxReading(reading);
    }, []);

    const [distanceTarget, setDistanceTarget] = useState<number | null>(() =>
        parseTargetParam(searchParams?.get('distance_cm')),
    );
    const [distanceReading, setDistanceReading] = useState<SensorReading<DistanceSource> | null>(null);
    const [cameraDistanceReading, setCameraDistanceReading] = useState<SensorReading<'camera'> | null>(null);
    const [faceROI, setFaceROI] = useState<NormalizedFaceROI | null>(null);

    const handleDistanceChange = useCallback((reading: SensorReading<DistanceSource> | null) => {
        setDistanceReading(reading);
    }, []);

    const handleDistanceLiveUpdate = useCallback((distCm: number) => {
        setCameraDistanceReading({ value: distCm, source: 'camera', measuredAt: Date.now() });
    }, []);

    // Jam 1 s agar bacaan yang melewati SENSOR_MAX_AGE_S langsung tampil "Tidak terukur".
    const [sensorNow, setSensorNow] = useState<number>(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setSensorNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const [sessionType, setSessionType] = useState<string>(
        searchParams?.get('session_type') || 'TEST',
    );
    const [sampleType, setSampleType] = useState<string>(
        searchParams?.get('sample_type') || 'BONA_FIDE',
    );

    /* ---- Mode & Identity ---- */
    const [mode, setMode] = useState<'personal' | 'kiosk'>(
        user ? 'personal' : 'kiosk',
    );
    const [kioskId, setKioskId] = useState(subjectId);
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
    const [enrollPreselect, setEnrollPreselect] = useState<string | null>(null);

    /* ---- User-Friendly Helper, Research HUD & Teacher Picker States ---- */
    const [isResearchHudOpen, setIsResearchHudOpen] = useState(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [isSubjectPickerOpen, setIsSubjectPickerOpen] = useState(false);
    const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
    const [sidebarTab, setSidebarTab] = useState<'operasional' | 'riset'>('operasional');

    // Widget jarak hanya terpasang di panel riset dan di sana menentukan sumbernya
    // (kamera, sensor, atau preset tanpa ukuran). Di luar panel itu sumbernya
    // estimasi kamera pemindai. Lux hanya terukur selama luxometer berjalan.
    const distanceSubmitReading = sidebarTab === 'riset' ? distanceReading : cameraDistanceReading;
    const measuredLux = freshReading(luxReading, sensorNow);
    const measuredDistance = freshReading(distanceSubmitReading, sensorNow);
    const freshCameraDistance = freshReading(cameraDistanceReading, sensorNow);
    const luxValue = measuredLux?.value ?? null;
    const luxCondition = luxValue === null ? null : getLuxCategory(luxValue).label;
    const distanceCm = measuredDistance?.value ?? null;
    const distanceCategory = distanceCm === null ? null : getDistanceCategory(distanceCm).label;

    // Dibaca saat submit, bukan dari closure: pemindai menangkap callback submit
    // di awal perekaman 8 s, sehingga state di closure sudah basi saat dikirim.
    const sensorSubmitRef = useRef({ luxReading, distanceSubmitReading, luxTarget, distanceTarget });
    useEffect(() => {
        sensorSubmitRef.current = { luxReading, distanceSubmitReading, luxTarget, distanceTarget };
    });

    const filteredSubjects = useMemo(() => {
        if (!subjectSearchQuery.trim()) return DEFAULT_SUBJECTS;
        const q = subjectSearchQuery.toLowerCase();
        return DEFAULT_SUBJECTS.filter(
            (s) =>
                s.id.toLowerCase().includes(q) ||
                s.name.toLowerCase().includes(q) ||
                s.email.toLowerCase().includes(q),
        );
    }, [subjectSearchQuery]);

    /* ---- Evaluation Decision Modal State ---- */
    const [evaluationData, setEvaluationData] = useState<any | null>(null);
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
    const [isEvalTechDetailsOpen, setIsEvalTechDetailsOpen] = useState(false);

    /* ---- Floating Toasts Feedback System ---- */
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback(
        (type: 'success' | 'error' | 'info', message: string, icon?: string) => {
            const id = Date.now() + Math.random();
            setToasts((prev) => [...prev.slice(-2), { id, type, message, icon }]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 4000);
        },
        [],
    );

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const [isCsvDownloaded, setIsCsvDownloaded] = useState(false);

    /* ---- Verification Flow ---- */
    const [status, setStatus] = useState<
        'idle' | 'verifying' | 'success' | 'failed'
    >('idle');
    const [statusText, setStatusText] = useState('Siap memindai wajah...');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState<number>(0);
    const abortRef = useRef<AbortController | null>(null);

    /* ---- Research Metrics ---- */
    const [ear, setEar] = useState(0);
    const [mar, setMar] = useState(0);
    const [quality, setQuality] = useState(0);
    const [facenetScore, setFacenetScore] = useState<number | null>(null);
    const [emarScore, setEmarScore] = useState<number | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    /* ---- Current Subject Info ---- */
    const currentSubjectInfo = useMemo(() => {
        return (
            DEFAULT_SUBJECTS.find((s) => s.id === subjectId) || {
                id: subjectId,
                name: user?.name || 'Pengajar / Subjek Uji',
                email: user?.email || '',
            }
        );
    }, [subjectId, user]);

    /* ---- Research Mode Detection ---- */
    const isQalwaniSubject =
        user?.email?.toUpperCase().includes('QALWANI') ||
        user?.email?.includes('admin') ||
        subjectId.toUpperCase().includes('QALWANI') ||
        kioskId.toUpperCase().includes('QALWANI');

    /* ---- Callbacks ---- */
    const handleMetricsUpdate = useCallback(
        (metrics: { ear: number; mar: number; quality: number }) => {
            setEar(metrics.ear);
            setMar(metrics.mar);
            setQuality(metrics.quality);
        },
        [],
    );

    /* ---- Verification Callbacks ---- */
    const handleVerificationSubmit = useCallback(
        async (videoBlob: Blob, scanMetrics: any) => {
            if (abortRef.current) abortRef.current.abort();
            abortRef.current = new AbortController();

            const startTime = performance.now();
            setStatus('verifying');
            setErrorMsg(null);
            setStatusText('Menganalisis biometrik wajah & menghitung skor evaluasi...');

            const formData = new FormData();
            const filename = `presensi_scan_${subjectId}_${Date.now()}.webm`;
            formData.append('video', videoBlob, filename);
            formData.append('mode', mode);
            formData.append('kiosk_id', kioskId);
            formData.append('subject_id', subjectId);
            const sensors = sensorSubmitRef.current;
            for (const [key, value] of sensorFormFields({
                lux: sensors.luxReading,
                distance: sensors.distanceSubmitReading,
                luxTarget: sensors.luxTarget,
                distanceTarget: sensors.distanceTarget,
                nowMs: Date.now(),
            })) {
                formData.append(key, value);
            }
            formData.append('session_type', sessionType);
            formData.append('sample_type', sampleType);

            formData.append('ear_blinks', String(scanMetrics.earBlinks));
            formData.append('mar_mouths', String(scanMetrics.marMouths));
            formData.append('face_pct', String(scanMetrics.facePct));
            formData.append('scan_duration_s', String(scanMetrics.durationS));
            if (scanMetrics.earVal !== undefined) {
                formData.append('ear_val', String(scanMetrics.earVal));
            }
            if (scanMetrics.marVal !== undefined) {
                formData.append('mar_val', String(scanMetrics.marVal));
            }
            if (scanMetrics.activeChallenge !== undefined) {
                formData.append('active_challenge', scanMetrics.activeChallenge);
            }
            if (scanMetrics.challengeStatus !== undefined) {
                formData.append('challenge_status', scanMetrics.challengeStatus);
            }

            if (simulatedSession !== 'REALTIME') {
                formData.append('simulated_time', simulatedSession);
                if (simulatedSession === '12:30') {
                    formData.append('simulated_day', 'Friday');
                } else {
                    formData.append('simulated_day', 'Monday');
                }
            }

            try {
                const response = await axios.post('/presensi/verify', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    signal: abortRef.current.signal,
                });

                const endTime = performance.now();
                setLatencyMs(Math.round(endTime - startTime));

                const isSuccess =
                    response.data.success !== undefined
                        ? !!response.data.success
                        : response.data.status === 'success';
                setStatus(isSuccess ? 'success' : 'failed');
                const finalMsg =
                    response.data.message ||
                    (isSuccess
                        ? 'Verifikasi biometrik & presensi berhasil!'
                        : 'Verifikasi ditolak.');
                setStatusText(finalMsg);
                setSessionId(response.data.request_id || null);

                if (response.data.evaluation) {
                    setEvaluationData(response.data.evaluation);
                    setIsEvalModalOpen(true);
                }

                if (response.data.metadata) {
                    setFacenetScore(response.data.metadata.facenet_score ?? null);
                    setEmarScore(response.data.metadata.emar_score ?? null);
                }

                if (isSuccess) {
                    addToast('success', finalMsg, 'check_circle');
                } else {
                    addToast('error', finalMsg, 'cancel');
                }
            } catch (err: unknown) {
                if (axios.isCancel(err)) return;
                console.error('Presensi verification error:', err);
                const serverMsg =
                    axios.isAxiosError(err) && err.response?.data?.message
                        ? err.response.data.message
                        : 'Gagal terhubung ke server biometrik.';
                setStatus('failed');
                setErrorMsg(serverMsg);
                setStatusText(serverMsg);
                addToast('error', serverMsg, 'error');
            }
        },
        [mode, kioskId, subjectId, sessionType, sampleType, simulatedSession, addToast],
    );

    const handleReset = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setStatus('idle');
        setErrorMsg(null);
        setStatusText('Siap memindai wajah...');
        setFacenetScore(null);
        setEmarScore(null);
        setLatencyMs(null);
        setSessionId(null);
        setEvaluationData(null);
        setIsEvalModalOpen(false);
        setResetKey((prev) => prev + 1);
    }, []);

    /* ---- Advance to Next Subject (S01 -> S02 -> ... -> S18) ---- */
    const handleNextSubject = useCallback(() => {
        setIsEvalModalOpen(false);
        handleReset();
        const num = parseInt(subjectId.replace(/\D/g, ''), 10) || 1;
        const nextNum = num >= 18 ? 1 : num + 1;
        const nextId = `S${String(nextNum).padStart(2, '0')}`;
        setSubjectId(nextId);
        setKioskId(nextId);

        if (typeof window !== 'undefined') {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('subject_id', nextId);
            newUrl.searchParams.set('claimed_id', nextId);
            window.history.replaceState({}, '', newUrl.toString());
        }
        const nextSub = DEFAULT_SUBJECTS.find((s) => s.id === nextId);
        addToast(
            'info',
            `Beralih ke subjek: ${nextId}${nextSub ? ` (${nextSub.name})` : ''}`,
            'person',
        );
    }, [subjectId, handleReset, addToast]);

    /* ---- Change Subject directly from Selector ---- */
    const handleChangeSubject = useCallback(
        (newId: string) => {
            handleReset();
            setSubjectId(newId);
            setKioskId(newId);
            if (typeof window !== 'undefined') {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('subject_id', newId);
                newUrl.searchParams.set('claimed_id', newId);
                window.history.replaceState({}, '', newUrl.toString());
            }
            const s = DEFAULT_SUBJECTS.find((sub) => sub.id === newId);
            addToast('info', `Subjek dipilih: ${newId}${s ? ` (${s.name})` : ''}`, 'badge');
        },
        [handleReset, addToast],
    );

    /* ---- Download CSV Data for the Subject Who Just Completed Presensi ---- */
    const handleDownloadSubjectCsv = useCallback(() => {
        if (!evaluationData) return;

        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const fileName = `Presensi_Evaluasi_${evaluationData.subject_id}_${timestamp}.csv`;

        const csvContent = [
            'Parameter,Nilai_Evaluasi,Keterangan',
            `ID_Subjek,${evaluationData.subject_id},Identitas Subjek Terdaftar (S01 - S18)`,
            `Nama_Guru,"${evaluationData.teacher_name || '-'}",Nama Lengkap Guru / Staf`,
            `Status_Presensi,${evaluationData.final_decision === 'ACCEPT' ? 'HADIR' : 'GAGAL'},Status Kehadiran Sistem (HADIR / GAGAL)`,
            `Keputusan_Final,${evaluationData.final_decision},Keputusan Fusi Biometrik (ACCEPT / REJECT)`,
            `PAD_Prediction,${evaluationData.pad_pred},Klasifikasi Liveness Anti-Spoofing (BONA_FIDE / ATTACK)`,
            `ID_Prediction,${evaluationData.id_pred},Klasifikasi Pengenalan Identitas FaceNet (MATCH / NON_MATCH)`,
            `Jarak_Euclidean_L2,${evaluationData.euclidean_distance ?? '-'},Jarak Euclidean Vektor Embedding (Threshold <= 0.40)`,
            `FaceNet_Score,${evaluationData.facenet_score ?? '-'},Skor Kesamaan Wajah FaceNet (128-D)`,
            `EMAR_Score,${evaluationData.emar_score ?? '-'},Skor Fusi Liveness EMAR`,
            `Tantangan_Acak_EMAR,${evaluationData.active_challenge || '-'},Instruksi Challenge-Response Acak (BLINK / OPEN_MOUTH)`,
            `Status_Tantangan,${evaluationData.challenge_status || '-'},Hasil Evaluasi Tantangan (PASS_LIVENESS / REJECT)`,
            `Kedipan_Mata_EAR,${evaluationData.ear_blinks},Jumlah Kedipan Mata Terdeteksi (EAR < 0.20)`,
            `Gerakan_Mulut_MAR,${evaluationData.mar_mouths},Jumlah Gerakan Mulut Terdeteksi (MAR >= 0.10)`,
            `Kestabilan_Wajah_Pct,${evaluationData.face_detected_pct}%,Persentase Frame Wajah Terlacak Stabil (Min 80.0%)`,
            `Jarak_Pengujian_cm,${formatMeasured(evaluationData.distance_cm, 'cm', 1)},Jarak Kamera ke Wajah (${evaluationData.distance_source || 'none'})`,
            `Intensitas_Cahaya_Lux,${formatMeasured(evaluationData.lux_value, 'Lux', 1)},Kondisi Pencahayaan Lingkungan Uji (${evaluationData.lux_source || 'none'})`,
            `Durasi_Scan_Detik,${evaluationData.scan_duration_s || 8.0} Detik,Jendela Waktu Pemindaian Biometrik`,
            `Pesan_Evaluasi,"${(evaluationData.message || statusText || '').replace(/"/g, '""')}",Penjelasan Keputusan Engine Biometrik`,
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], {
            type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setIsCsvDownloaded(true);
        addToast(
            'success',
            `Data evaluasi CSV subjek (${evaluationData.subject_id}) berhasil diunduh!`,
            'download_done',
        );
        setTimeout(() => setIsCsvDownloaded(false), 2500);
    }, [evaluationData, statusText, addToast]);

    /* ---- Verification Result for scanner ---- */
    const verificationResult: 'success' | 'failed' | null =
        status === 'success'
            ? 'success'
            : status === 'failed'
              ? 'failed'
              : null;

    // Jarak L2 nyata dari mesin dan ambang yang dipakai server saat memutuskan.
    const faceMatchL2Caption = evaluationData
        ? l2ThresholdCaption(evaluationData.euclidean_distance, evaluationData.facenet_threshold)
        : null;

    const showReenrollOffer = offerReenrollment(evaluationData, mode, user?.embedding_id);

    const openEnrollment = (embeddingId: string | null) => {
        setEnrollPreselect(embeddingId);
        setIsEnrollModalOpen(true);
    };

    /* ---- Render ---- */
    return (
        <div
            className="relative min-h-screen font-sans transition-colors duration-300 bg-surface-container-lowest dark:bg-[#071026] text-slate-900 dark:text-white overflow-x-hidden"
            style={{ minHeight: '100dvh' }}
        >
            <Head title="Presensi Biometrik 3D: FaceNet + EMAR" />

            {/* Floating Toast Feedback Notifications */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

            {/* Background */}
            <DynamicBackdrop />

            {/* ======================================================== */}
            {/* 1. ULTRA-SLEEK GLASS HEADER (Fluid, Clean & Responsive)  */}
            {/* ======================================================== */}
            <header className="sticky top-0 z-50 border-b border-outline-variant/40 dark:border-white/10 bg-white/85 dark:bg-[#071026]/90 backdrop-blur-2xl transition-colors duration-300 shadow-sm">
                <div className="mx-auto flex h-14 sm:h-16 max-w-[1500px] items-center justify-between px-2.5 sm:px-6 lg:px-8">
                    {/* Brand / Logo */}
                    <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
                        <Link
                            href="/dashboard"
                            className="group flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-tr from-sky-accent via-royal-blue to-indigo-700 p-0.5 shadow-md shadow-royal-blue/20 transition-transform active:scale-95"
                            title="Kembali ke Dashboard"
                        >
                            <div className="flex h-full w-full items-center justify-center rounded-[12px] sm:rounded-[14px] bg-white dark:bg-[#0F1B36] text-royal-blue dark:text-sky-400 group-hover:scale-105 transition-transform">
                                <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                            </div>
                        </Link>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <h1 className="bg-gradient-to-r from-royal-blue via-blue-600 to-sky-500 dark:from-sky-400 dark:via-teal-300 dark:to-emerald-400 bg-clip-text text-xs sm:text-base font-extrabold tracking-tight text-transparent truncate">
                                    PRESENSI BIOMETRIK
                                </h1>
                                <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                                    <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="hidden xs:inline">FaceNet + EMAR</span>
                                    <span className="xs:hidden">3D AI</span>
                                </span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-on-surface-variant dark:text-slate-400 hidden sm:block truncate">
                                Sistem Presensi Otomatis &amp; Anti-Spoofing Jarak 30 cm
                            </p>
                        </div>
                    </div>

                    {/* Right Header Navigation & Live Clock */}
                    <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                        {currentTime && (
                            <div className="hidden md:flex items-center gap-1.5 rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low/70 dark:bg-white/5 px-3 py-1.5 text-xs font-mono font-bold text-deep-navy dark:text-slate-200 shadow-xs backdrop-blur-md">
                                <Clock className="h-3.5 w-3.5 text-royal-blue dark:text-sky-300 animate-pulse" />
                                <span>{currentTime}</span>
                                <span className="text-[9px] font-sans font-semibold text-on-surface-variant dark:text-slate-400">
                                    WIB
                                </span>
                            </div>
                        )}

                        {/* Fullscreen Kiosk Mode Toggle (Hidden on mobile phones for native viewport stability) */}
                        <motion.button
                            type="button"
                            onClick={toggleFullscreen}
                            whileTap={{ scale: 0.92 }}
                            className="hidden sm:flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-surface-container dark:hover:bg-white/10 transition-all shadow-xs cursor-pointer touch-manipulation"
                            title={isFullscreen ? 'Keluar dari Mode Layar Penuh' : 'Mode Layar Penuh (Kiosk)'}
                            aria-label="Toggle Fullscreen"
                        >
                            {isFullscreen ? (
                                <Minimize2 className="h-4 w-4 text-royal-blue dark:text-sky-300" />
                            ) : (
                                <Maximize2 className="h-4 w-4 text-royal-blue dark:text-sky-300" />
                            )}
                        </motion.button>

                        {/* Quick Help / Guide Button */}
                        <motion.button
                            type="button"
                            onClick={() => setIsHelpModalOpen(true)}
                            whileTap={{ scale: 0.92 }}
                            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl border border-sky-400/40 bg-sky-500/10 text-royal-blue dark:text-sky-300 hover:bg-sky-500/20 transition-all shadow-xs cursor-pointer touch-manipulation"
                            title="Petunjuk Presensi 3 Langkah"
                            aria-label="Petunjuk Presensi"
                        >
                            <HelpCircle className="h-4 w-4" />
                        </motion.button>

                        <ThemeSwitcher size="sm" />

                        {user ? (
                            <Link
                                href="/dashboard"
                                className="flex h-9 w-9 sm:h-auto sm:w-auto items-center justify-center gap-1.5 rounded-xl sm:rounded-2xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-white/10 text-deep-navy dark:text-slate-200 hover:bg-surface-container dark:hover:bg-white/20 sm:px-3 sm:py-2 text-xs font-bold transition-all active:scale-95 shadow-xs touch-manipulation"
                                title="Buka Dashboard"
                            >
                                <LayoutDashboard className="h-4 w-4 text-royal-blue dark:text-sky-400" />
                                <span className="hidden sm:inline">Dashboard</span>
                            </Link>
                        ) : (
                            <Link
                                href="/login"
                                className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-royal-blue to-indigo-600 px-3 sm:px-4 py-2 text-xs font-bold text-white shadow-md shadow-royal-blue/25 hover:brightness-110 active:scale-95 transition-all touch-manipulation min-h-[36px] flex items-center justify-center"
                            >
                                Login
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* ======================================================== */}
            {/* 2. MAIN CONTAINER & VIEWPORT                            */}
            {/* ======================================================== */}
            <main
                className="relative z-10 mx-auto flex w-full max-w-[1500px] flex-1 flex-col px-2.5 py-3 sm:px-6 md:px-8 sm:py-6"
                style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            >
                {/* ======================================================== */}
                {/* 2. UNIFIED MODERN CONTROL STRIP (Mobile & Desktop)       */}
                {/* ======================================================== */}
                <div className="mb-4 sm:mb-6 space-y-3">
                    {/* Top Row: Title, Mode Toggle & Primary Actions */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-deep-navy dark:text-white tracking-tight">
                                    Studio Presensi Biometrik
                                </h2>
                                <span className="inline-flex items-center gap-1 rounded-full bg-royal-blue/10 dark:bg-sky-500/15 border border-royal-blue/20 dark:border-sky-400/25 px-2.5 py-0.5 text-[10px] font-mono font-bold text-royal-blue dark:text-sky-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-royal-blue dark:bg-sky-400 animate-ping" />
                                    1080p FHD • 8s EMAR
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-on-surface-variant dark:text-slate-400 mt-0.5">
                                Presensi biometrik wajah 3D berstandar ISO/IEC 30107-3 PAD dengan verifikasi kedipan biologis (EAR/MAR).
                            </p>
                        </div>

                        {/* Controls Group */}
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            {/* Mode Toggle Switcher */}
                            <div className="grid grid-cols-2 inline-flex rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low/90 dark:bg-black/40 p-1 shadow-xs backdrop-blur-md">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('personal');
                                        setErrorMsg(null);
                                    }}
                                    disabled={!user}
                                    className={`relative flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 sm:px-4 py-1.5 text-xs font-bold transition-colors touch-manipulation ${
                                        mode === 'personal'
                                            ? 'text-white'
                                            : 'text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-white'
                                    } ${!user ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    {mode === 'personal' && (
                                        <motion.div
                                            layoutId="presensiActiveModePill"
                                            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                            className="absolute inset-0 rounded-xl bg-royal-blue dark:bg-sky-600 shadow-md shadow-royal-blue/25"
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-1.5">
                                        <PersonIcon className="h-3.5 w-3.5" />
                                        <span>Personal</span>
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('kiosk');
                                        setErrorMsg(null);
                                    }}
                                    className={`relative flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 sm:px-4 py-1.5 text-xs font-bold transition-colors touch-manipulation ${
                                        mode === 'kiosk'
                                            ? 'text-white'
                                            : 'text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-white'
                                    } cursor-pointer`}
                                >
                                    {mode === 'kiosk' && (
                                        <motion.div
                                            layoutId="presensiActiveModePill"
                                            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                            className="absolute inset-0 rounded-xl bg-royal-blue dark:bg-sky-600 shadow-md shadow-royal-blue/25"
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-1.5">
                                        <Monitor className="h-3.5 w-3.5" />
                                        <span className="hidden xs:inline">Kiosk (S01 - S18)</span>
                                        <span className="xs:hidden">Kiosk</span>
                                    </span>
                                </button>
                            </div>

                            {/* Ulangi Sesi Button */}
                            <motion.button
                                type="button"
                                onClick={handleReset}
                                whileTap={{ scale: 0.95 }}
                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/5 px-3 py-1.5 text-xs font-bold text-deep-navy dark:text-white hover:bg-surface-container dark:hover:bg-white/10 transition shadow-xs cursor-pointer"
                                title="Reset dan ulangi sesi pemindaian"
                            >
                                <RefreshCw className="h-3.5 w-3.5 text-royal-blue dark:text-sky-400" />
                                <span className="hidden sm:inline">Ulangi Sesi</span>
                            </motion.button>

                            {/* Subjek Berikutnya Button (in Kiosk) */}
                            {mode === 'kiosk' && (
                                <motion.button
                                    type="button"
                                    onClick={handleNextSubject}
                                    whileTap={{ scale: 0.95 }}
                                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-2xl bg-gradient-to-r from-royal-blue via-blue-600 to-indigo-700 dark:from-sky-500 dark:via-royal-blue dark:to-blue-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-royal-blue/20 hover:brightness-105 transition cursor-pointer"
                                    title="Lanjut ke Guru Berikutnya (S01 - S18)"
                                >
                                    <SkipForward className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Berikutnya</span>
                                </motion.button>
                            )}
                        </div>
                    </div>

                    {/* Operational Status & Fast Navigation Ribbon */}
                    <div className="overflow-hidden rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 p-3 sm:p-3.5 shadow-sm backdrop-blur-xl">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                            {/* Left: Active Subject + Operational Session + Status Pill */}
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Subject Pill */}
                                <div className="flex items-center gap-1.5 rounded-2xl border border-sky-400/30 bg-sky-500/10 dark:bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-royal-blue dark:text-sky-300">
                                    <span className="material-symbols-outlined text-[15px]">badge</span>
                                    <span className="font-mono font-black text-deep-navy dark:text-white">{currentSubjectInfo.id}</span>
                                    <span className="truncate max-w-[130px] sm:max-w-[200px] text-deep-navy dark:text-white">{currentSubjectInfo.name}</span>
                                    {mode === 'kiosk' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSubjectSearchQuery('');
                                                setIsSubjectPickerOpen(true);
                                            }}
                                            className="ml-1 rounded-lg bg-royal-blue/15 hover:bg-royal-blue/25 dark:bg-sky-400/20 dark:hover:bg-sky-400/30 px-1.5 py-0.5 text-[10px] font-extrabold uppercase transition cursor-pointer"
                                        >
                                            Ganti
                                        </button>
                                    )}
                                </div>

                                {/* Active Session */}
                                <div className="flex items-center gap-1.5 rounded-2xl border border-blue-500/30 bg-blue-500/10 dark:bg-blue-500/15 px-3 py-1.5 text-xs font-bold text-blue-800 dark:text-blue-300">
                                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                                    <span className="truncate max-w-[160px] sm:max-w-none text-deep-navy dark:text-white">
                                        {currentSchedule.session_title} ({currentSchedule.time_range})
                                    </span>
                                </div>

                                {/* Attendance Status Badge */}
                                <span
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase border shadow-xs ${
                                        currentSchedule.status === 'HADIR'
                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                            : currentSchedule.status === 'TERLAMBAT'
                                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                              : currentSchedule.status === 'PULANG'
                                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                                                : currentSchedule.status === 'DITUTUP'
                                                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                                  : 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30'
                                    }`}
                                >
                                    {currentSchedule.status_label || currentSchedule.status}
                                </span>

                                {/* Standard 30cm Badge */}
                                <span className="hidden sm:inline-flex items-center gap-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                    <Lock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                    <span>Baku: 30 cm</span>
                                </span>
                            </div>

                            {/* Right: Drawer Toggles (SOP Table & Riset Bab 5) */}
                            <div className="flex items-center gap-2 self-start lg:self-auto">
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleGuide(!showScheduleGuide)}
                                    className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                                        showScheduleGuide
                                            ? 'border-royal-blue/40 bg-royal-blue/15 text-royal-blue dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-300'
                                            : 'border-outline-variant/50 bg-surface-container-low dark:border-white/10 dark:bg-white/5 text-on-surface-variant dark:text-slate-300 hover:text-on-surface dark:hover:text-white'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[15px]">school</span>
                                    <span>Jadwal SOP</span>
                                    {showScheduleGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setIsResearchHudOpen(!isResearchHudOpen)}
                                    className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                                        isResearchHudOpen
                                            ? 'border-royal-blue/40 bg-royal-blue/15 text-royal-blue dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-300'
                                            : 'border-outline-variant/50 bg-surface-container-low dark:border-white/10 dark:bg-white/5 text-on-surface-variant dark:text-slate-300 hover:text-on-surface dark:hover:text-white'
                                    }`}
                                >
                                    <Settings2 className="h-3.5 w-3.5" />
                                    <span>Parameter Riset</span>
                                    {isResearchHudOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                            </div>
                        </div>

                        {/* Collapsible SOP Table Drawer */}
                        <AnimatePresence>
                            {showScheduleGuide && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                                    className="mt-3.5 pt-3 border-t border-outline-variant/30 dark:border-white/10 overflow-hidden"
                                >
                                    <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 dark:border-white/10">
                                        <table className="w-full text-left text-xs bg-white/50 dark:bg-slate-900/50">
                                            <thead>
                                                <tr className="border-b border-outline-variant/30 dark:border-white/10 text-[10px] font-extrabold uppercase text-on-surface-variant dark:text-slate-400 bg-surface-container-low/50 dark:bg-white/5">
                                                    <th className="py-2.5 px-3">Sesi</th>
                                                    <th className="py-2.5 px-3">Rentang Waktu (WIB)</th>
                                                    <th className="py-2.5 px-3">Status Sistem</th>
                                                    <th className="py-2.5 px-3">Keterangan Operasional</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-outline-variant/20 dark:divide-white/5 font-medium">
                                                <tr className={currentSchedule.status === 'HADIR' ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : ''}>
                                                    <td className="py-2 px-3 font-bold text-deep-navy dark:text-white">
                                                        Presensi Masuk (Tepat Waktu)
                                                    </td>
                                                    <td className="py-2 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                                        06.30 – 07.15
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300">
                                                            HADIR
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-on-surface-variant dark:text-slate-300">
                                                        Guru hadir sebelum bel masuk / KBM dimulai.
                                                    </td>
                                                </tr>
                                                <tr className={currentSchedule.status === 'TERLAMBAT' ? 'bg-amber-500/10 dark:bg-amber-500/15' : ''}>
                                                    <td className="py-2 px-3 font-bold text-deep-navy dark:text-white">
                                                        Batas Toleransi (Terlambat)
                                                    </td>
                                                    <td className="py-2 px-3 font-mono font-bold text-amber-700 dark:text-amber-400">
                                                        07.16 – 08.00
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-300">
                                                            TERLAMBAT
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-on-surface-variant dark:text-slate-300">
                                                        Verifikasi biometrik tetap ACCEPT, namun status tercatat terlambat.
                                                    </td>
                                                </tr>
                                                <tr className={currentSchedule.status === 'DITUTUP' ? 'bg-rose-500/10 dark:bg-rose-500/15' : ''}>
                                                    <td className="py-2 px-3 font-bold text-deep-navy dark:text-white">
                                                        Batas Akhir Masuk (Ditutup)
                                                    </td>
                                                    <td className="py-2 px-3 font-mono font-bold text-rose-700 dark:text-rose-400">
                                                        &gt; 08.00
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-extrabold text-rose-800 dark:text-rose-300">
                                                            DITUTUP / ALPHA
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-on-surface-variant dark:text-slate-300">
                                                        Scanner menolak presensi masuk (harus lapor manual ke piket/TU).
                                                    </td>
                                                </tr>
                                                <tr className={currentSchedule.session_title?.includes('Senin') ? 'bg-sky-500/10 dark:bg-sky-500/15' : ''}>
                                                    <td className="py-2 px-3 font-bold text-deep-navy dark:text-white">
                                                        Presensi Pulang (Senin – Kamis)
                                                    </td>
                                                    <td className="py-2 px-3 font-mono font-bold text-sky-700 dark:text-sky-400">
                                                        14.30 – 17.00
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-extrabold text-sky-800 dark:text-sky-300">
                                                            PULANG
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-on-surface-variant dark:text-slate-300">
                                                        Dibuka setelah jam KBM terakhir selesai.
                                                    </td>
                                                </tr>
                                                <tr className={currentSchedule.session_title?.includes('Jumat') ? 'bg-indigo-500/10 dark:bg-indigo-500/15' : ''}>
                                                    <td className="py-2 px-3 font-bold text-deep-navy dark:text-white">
                                                        Presensi Pulang (Jumat)
                                                    </td>
                                                    <td className="py-2 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                                        11.30 – 14.00
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-extrabold text-indigo-800 dark:text-indigo-300">
                                                            PULANG
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-on-surface-variant dark:text-slate-300">
                                                        Penyesuaian waktu ibadah sholat Jumat.
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Collapsible Advanced Research / Calibration HUD */}
                        <AnimatePresence>
                            {isResearchHudOpen && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                                    className="mt-3 pt-3 border-t border-outline-variant/30 dark:border-white/10 overflow-hidden"
                                >
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        {/* Direct Subject Select Dropdown */}
                                        <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 px-2.5 py-1.5">
                                            <span className="text-[11px] text-on-surface-variant dark:text-slate-400">ID Dropdown:</span>
                                            <select
                                                value={subjectId}
                                                onChange={(e) => handleChangeSubject(e.target.value)}
                                                className="bg-transparent font-mono font-bold text-xs text-deep-navy dark:text-white focus:outline-none cursor-pointer"
                                            >
                                                {DEFAULT_SUBJECTS.map((s) => (
                                                    <option key={s.id} value={s.id} className="dark:bg-slate-900">
                                                        {s.id} - {s.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Simulated SOP Time Select */}
                                        <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 px-2.5 py-1.5">
                                            <span className="text-[11px] text-on-surface-variant dark:text-slate-400">Simulasi Jam:</span>
                                            <select
                                                value={simulatedSession}
                                                onChange={(e) => setSimulatedSession(e.target.value)}
                                                className="bg-transparent font-mono font-bold text-xs text-deep-navy dark:text-white focus:outline-none cursor-pointer"
                                            >
                                                <option value="REALTIME" className="dark:bg-slate-900">🕒 Live WIB ({currentTime || 'WIB'})</option>
                                                <option value="07:00" className="dark:bg-slate-900">🟢 07.00 (Tepat Waktu)</option>
                                                <option value="07:30" className="dark:bg-slate-900">🟡 07.30 (Terlambat)</option>
                                                <option value="08:15" className="dark:bg-slate-900">🔴 08.15 (Ditutup / Alpha)</option>
                                                <option value="15:00" className="dark:bg-slate-900">🔵 15.00 (Pulang Sen-Kam)</option>
                                                <option value="12:30" className="dark:bg-slate-900">🟣 12.30 (Pulang Jumat)</option>
                                            </select>
                                        </div>

                                        {/* Lux Value & Category */}
                                        <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                                            luxValue === null
                                                ? 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                                                : luxValue < 100
                                                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                                  : luxValue <= 300
                                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                                    : 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300'
                                        }`}>
                                            <Sun className="h-3.5 w-3.5 text-amber-500" />
                                            <span>Cahaya:</span>
                                            <span className="font-mono">{formatMeasured(luxValue, 'Lux')}</span>
                                            {measuredLux && (
                                                <span className="rounded-md px-1.5 py-0.5 text-[9px] uppercase font-mono font-bold bg-black/10 dark:bg-white/10">
                                                    {luxCondition} · {sourceLabel(measuredLux.source)}
                                                </span>
                                            )}
                                            {luxTarget !== null && (
                                                <span className="text-[10px] font-medium opacity-80">Target {formatMeasured(luxTarget, 'Lux')}</span>
                                            )}
                                        </div>

                                        {/* Distance Setting & Readout */}
                                        <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                                            distanceCm === null
                                                ? 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                                                : getDistanceCategory(distanceCm).isValidDistance
                                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                                  : 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300'
                                        }`}>
                                            <span className="material-symbols-outlined text-[14px]">straighten</span>
                                            <span>Jarak:</span>
                                            <span className="font-mono">{formatMeasured(distanceCm, 'cm')}</span>
                                            {measuredDistance && (
                                                <span className="rounded-md px-1.5 py-0.5 text-[9px] uppercase font-mono font-bold bg-black/10 dark:bg-white/10">
                                                    {distanceCategory} · {sourceLabel(measuredDistance.source)}
                                                </span>
                                            )}
                                            {distanceTarget !== null && (
                                                <span className="text-[10px] font-medium opacity-80">Target {formatMeasured(distanceTarget, 'cm')}</span>
                                            )}
                                        </div>

                                        {/* Session Type */}
                                        <span className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 dark:bg-purple-500/15 px-2.5 py-1.5 font-bold text-purple-800 dark:text-purple-300">
                                            <span className="material-symbols-outlined text-[14px]">tune</span>
                                            <span className="font-mono">
                                                {sessionType === 'ENROLLMENT' ? 'Session-E' : 'Session-T'}
                                            </span>
                                        </span>

                                        {/* Sample Type */}
                                        <span className="flex items-center gap-1.5 rounded-xl border border-slate-400/30 bg-slate-500/10 dark:bg-white/5 px-2.5 py-1.5 font-bold text-slate-700 dark:text-slate-300">
                                            <Shield className="h-3.5 w-3.5" />
                                            <span className="font-mono">{sampleType}</span>
                                        </span>

                                        {/* Dataset Bab 5 CSV Quick Link */}
                                        <a
                                            href="/presensi/export-bab5"
                                            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 px-2.5 py-1.5 font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition cursor-pointer"
                                            title="Unduh Dataset_Eksperimen_Bab5.csv (Uji Cochran's Q & McNemar)"
                                        >
                                            <FileSpreadsheet className="h-3.5 w-3.5" />
                                            <span>CSV Bab 5</span>
                                        </a>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* ======================================================== */}
                {/* 4. MAIN BENTO GRID: CAMERA VIEWFINDER & RIGHT SIDEBAR   */}
                {/* ======================================================== */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 flex-1">
                    {/* ---------------------------------------------------- */}
                    {/* LEFT / CENTER: Camera Viewfinder (8 Cols)           */}
                    {/* ---------------------------------------------------- */}
                    <div className="flex flex-col gap-4 lg:col-span-8">
                        <div className="relative flex flex-col overflow-hidden rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 p-2.5 sm:p-4 shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                            {/* Ambient Glow Aura */}
                            <div
                                className={`pointer-events-none absolute -inset-1 rounded-3xl opacity-20 blur-2xl transition-all duration-700 ${
                                    status === 'success'
                                        ? 'bg-emerald-500 opacity-35'
                                        : status === 'failed'
                                          ? 'bg-rose-500 opacity-35'
                                          : status === 'verifying'
                                            ? 'bg-sky-500 opacity-30'
                                            : 'bg-royal-blue opacity-20'
                                }`}
                            />

                            <FaceScannerContainer
                                onVerificationSubmit={handleVerificationSubmit}
                                isVerifying={status === 'verifying'}
                                verificationResult={verificationResult}
                                isResearchMode={!!isQalwaniSubject}
                                scenarioParams={{
                                    subject_id: subjectId,
                                    distance_cm: distanceCm ?? undefined,
                                    lux: luxValue ?? undefined,
                                    session_type: sessionType,
                                    sample_type: sampleType,
                                }}
                                onMetricsUpdate={handleMetricsUpdate}
                                onResetScan={handleReset}
                                resetKey={resetKey}
                                onVideoRefReady={handleVideoRefReady}
                                onDistanceUpdate={handleDistanceLiveUpdate}
                                onFaceROIUpdate={setFaceROI}
                                paused={isEnrollModalOpen}
                            />

                            {/* Status Feedback Card */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={status}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.2 }}
                                    className={`mt-3 rounded-2xl border p-3.5 transition-colors ${
                                        status === 'success'
                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                            : status === 'failed'
                                              ? 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                                              : 'border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/80 text-deep-navy dark:text-white'
                                    }`}
                                >
                                    <div className="flex items-center justify-center gap-2.5">
                                        {status === 'success' ? (
                                            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        ) : status === 'failed' ? (
                                            <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                                        ) : (
                                            <Shield className="h-5 w-5 flex-shrink-0 text-royal-blue dark:text-sky-400" />
                                        )}
                                        <span className="text-xs sm:text-sm font-bold text-center">
                                            {statusText}
                                        </span>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Mobile Action Toolbar (Quick Subjek Selanjutnya, Ulangi, Pilih Guru) */}
                        <div className="lg:hidden flex items-stretch gap-2">
                            <motion.button
                                type="button"
                                onClick={handleReset}
                                whileTap={{ scale: 0.95 }}
                                className={`flex h-12 items-center justify-center gap-2 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-deep-navy dark:text-white transition hover:bg-surface-container dark:hover:bg-white/10 shadow-xs cursor-pointer touch-manipulation min-h-[48px] ${
                                    mode === 'personal' ? 'w-full px-4 text-xs font-bold' : 'w-12 shrink-0'
                                }`}
                                title="Ulangi Sesi"
                                aria-label="Ulangi Sesi"
                            >
                                <RefreshCw className="h-5 w-5 text-royal-blue dark:text-sky-400" />
                                {mode === 'personal' && <span>Ulangi Sesi Pemindaian</span>}
                            </motion.button>

                            {mode === 'kiosk' && (
                                <>
                                    <motion.button
                                        type="button"
                                        onClick={handleNextSubject}
                                        whileTap={{ scale: 0.96 }}
                                        className="flex-1 flex h-12 min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue via-blue-600 to-indigo-700 dark:from-sky-500 dark:via-royal-blue dark:to-blue-700 px-3.5 text-xs sm:text-sm font-black text-white shadow-md shadow-royal-blue/20 transition hover:brightness-105 cursor-pointer touch-manipulation"
                                    >
                                        <SkipForward className="h-4 w-4 shrink-0" />
                                        <span className="truncate">Subjek Berikutnya</span>
                                    </motion.button>

                                    <motion.button
                                        type="button"
                                        onClick={() => {
                                            setSubjectSearchQuery('');
                                            setIsSubjectPickerOpen(true);
                                        }}
                                        whileTap={{ scale: 0.95 }}
                                        className="flex h-12 min-h-[48px] px-3.5 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-sky-400/30 bg-sky-500/10 dark:bg-sky-500/15 text-royal-blue dark:text-sky-300 text-xs font-bold transition hover:bg-sky-500/20 cursor-pointer touch-manipulation"
                                        title="Pilih Guru"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">group</span>
                                        <span className="hidden xs:inline">Pilih Guru</span>
                                    </motion.button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ---------------------------------------------------- */}
                    {/* RIGHT COLUMN: Identity, Checklist & Telemetry (4 Cols)*/}
                    {/* ---------------------------------------------------- */}
                    {/* ---------------------------------------------------- */}
                    {/* RIGHT COLUMN: 2-Tab Bento Layout (Operasional vs Riset) */}
                    {/* ---------------------------------------------------- */}
                    <div className="flex flex-col gap-4 lg:col-span-4">
                        {/* Tab Segmented Control */}
                        <div className="grid grid-cols-2 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low/90 dark:bg-black/30 p-1 shadow-xs backdrop-blur-md">
                            <button
                                type="button"
                                onClick={() => setSidebarTab('operasional')}
                                className={`relative flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors touch-manipulation cursor-pointer ${
                                    sidebarTab === 'operasional'
                                        ? 'text-white'
                                        : 'text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-white'
                                }`}
                            >
                                {sidebarTab === 'operasional' && (
                                    <motion.div
                                        layoutId="sidebarActiveTabPill"
                                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                        className="absolute inset-0 rounded-xl bg-royal-blue dark:bg-sky-600 shadow-md shadow-royal-blue/25"
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                                    <span>Operasional</span>
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setSidebarTab('riset')}
                                className={`relative flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors touch-manipulation cursor-pointer ${
                                    sidebarTab === 'riset'
                                        ? 'text-white'
                                        : 'text-on-surface-variant dark:text-slate-400 hover:text-on-surface dark:hover:text-white'
                                }`}
                            >
                                {sidebarTab === 'riset' && (
                                    <motion.div
                                        layoutId="sidebarActiveTabPill"
                                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                        className="absolute inset-0 rounded-xl bg-royal-blue dark:bg-sky-600 shadow-md shadow-royal-blue/25"
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    <span>Riset &amp; Bab 5</span>
                                </span>
                            </button>
                        </div>

                        {sidebarTab === 'operasional' ? (
                            <>
                                {/* 1. Identity / Subject Profile Bento Card */}
                                <div className="rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 p-4 sm:p-5 shadow-sm backdrop-blur-xl">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400 mb-3.5 flex items-center justify-between">
                                        <span>
                                            {mode === 'personal'
                                                ? 'Identitas Subjek Biometrik'
                                                : 'Profil Subjek Kiosk (S01 - S18)'}
                                        </span>
                                        <span className="rounded-lg bg-royal-blue/10 dark:bg-sky-500/20 px-2.5 py-0.5 font-mono text-[10px] font-bold text-royal-blue dark:text-sky-300">
                                            {subjectId}
                                        </span>
                                    </h4>

                                    {mode === 'personal' && user ? (
                                        <>
                                            <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-3.5 mb-3.5">
                                                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-royal-blue to-sky-accent font-bold text-white text-base shadow-sm">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="overflow-hidden min-w-0">
                                                    <p className="truncate text-sm font-bold text-deep-navy dark:text-white">
                                                        {user.name}
                                                    </p>
                                                    <p className="truncate font-mono text-xs text-on-surface-variant dark:text-slate-400">
                                                        {user.email}
                                                    </p>
                                                    {user.embedding_id && (
                                                        <span className="inline-block mt-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                                                            Terdaftar ({user.embedding_id})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <motion.button
                                                type="button"
                                                onClick={() => openEnrollment(user.embedding_id ?? null)}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue via-blue-600 to-indigo-700 dark:from-sky-500 dark:via-royal-blue dark:to-blue-700 text-white px-4 py-2.5 text-xs sm:text-sm font-bold shadow-md shadow-royal-blue/20 transition-all min-h-[42px] touch-manipulation"
                                            >
                                                <Shield className="h-4 w-4" />
                                                <span>Pendaftaran Wajah Manual</span>
                                            </motion.button>
                                        </>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* Subject Preview Card */}
                                            <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-3">
                                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-royal-blue/20 to-sky-500/20 font-mono font-bold text-royal-blue dark:text-sky-300 text-sm border border-royal-blue/20">
                                                    {subjectId}
                                                </div>
                                                <div className="overflow-hidden min-w-0">
                                                    <p className="truncate text-xs sm:text-sm font-bold text-deep-navy dark:text-white">
                                                        {currentSubjectInfo.name}
                                                    </p>
                                                    <p className="truncate font-mono text-[11px] text-on-surface-variant dark:text-slate-400">
                                                        {currentSubjectInfo.email}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Quick Selection: Search Button + Dropdown */}
                                            <div className="space-y-2">
                                                <motion.button
                                                    type="button"
                                                    onClick={() => {
                                                        setSubjectSearchQuery('');
                                                        setIsSubjectPickerOpen(true);
                                                    }}
                                                    whileTap={{ scale: 0.98 }}
                                                    className="w-full flex items-center justify-center gap-2 rounded-2xl border border-sky-400/40 bg-sky-500/10 dark:bg-sky-500/15 text-royal-blue dark:text-sky-300 hover:bg-sky-500/20 py-2.5 px-3 text-xs font-bold transition shadow-xs cursor-pointer min-h-[42px] touch-manipulation"
                                                >
                                                    <Search className="h-4 w-4" />
                                                    <span>Cari &amp; Pilih Guru (S01 - S18)</span>
                                                </motion.button>

                                                <select
                                                    value={subjectId}
                                                    onChange={(e) => handleChangeSubject(e.target.value)}
                                                    className="w-full rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5 text-xs font-bold text-deep-navy dark:text-white focus:border-royal-blue dark:focus:border-sky-400 focus:outline-none transition cursor-pointer shadow-xs min-h-[42px]"
                                                >
                                                    {DEFAULT_SUBJECTS.map((s) => (
                                                        <option key={s.id} value={s.id} className="dark:bg-slate-900">
                                                            [{s.id}] {s.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Error Message */}
                                    {errorMsg && (
                                        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                            <span>{errorMsg}</span>
                                        </div>
                                    )}

                                    {/* Reset Button */}
                                    {(status === 'success' || status === 'failed') && (
                                        <motion.button
                                            onClick={handleReset}
                                            whileTap={{ scale: 0.98 }}
                                            className="mt-3 w-full flex items-center justify-center gap-2 cursor-pointer rounded-2xl bg-surface-container-low dark:bg-white/10 py-2.5 text-xs font-bold text-deep-navy dark:text-white transition-colors hover:bg-surface-container dark:hover:bg-white/20 border border-outline-variant/40 dark:border-white/10 shadow-xs min-h-[42px] touch-manipulation"
                                        >
                                            <RefreshCw className="h-4 w-4 text-royal-blue dark:text-sky-400" />
                                            <span>Reset &amp; Ulangi Presensi</span>
                                        </motion.button>
                                    )}
                                </div>

                                {/* 2. Quality Readiness Checklist */}
                                <QualityChecklist
                                    hasFace={
                                        status === 'verifying' ||
                                        status === 'success' ||
                                        quality > 0.1
                                    }
                                    isAligned={
                                        quality > 0.35 &&
                                        distanceCm !== null &&
                                        getDistanceCategory(distanceCm).isValidDistance
                                    }
                                    isLightingGood={luxValue !== null && luxValue >= 100 && luxValue <= 300}
                                    isLivenessPassed={
                                        status === 'success' || (ear >= 0.20 && mar >= 0.10)
                                    }
                                    isDark={isDark}
                                />

                                {/* 3. Mini Environmental Overview Card */}
                                <div className="rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 p-3.5 sm:p-4 shadow-sm backdrop-blur-xl">
                                    <div className="flex items-center justify-between mb-2.5 text-xs font-bold text-on-surface-variant dark:text-slate-400">
                                        <span className="flex items-center gap-1.5 text-deep-navy dark:text-white">
                                            <Activity className="h-3.5 w-3.5 text-royal-blue dark:text-sky-400" />
                                            <span>Sensor Lingkungan</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSidebarTab('riset')}
                                            className="text-[11px] text-royal-blue dark:text-sky-400 hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
                                        >
                                            <span>Buka Panel Riset</span>
                                            <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low/70 dark:bg-slate-900/60 p-2.5">
                                            <div className="flex items-center justify-between text-[10px] text-on-surface-variant dark:text-slate-400">
                                                <span>Jarak:</span>
                                                <span className="material-symbols-outlined text-[13px] text-emerald-500">straighten</span>
                                            </div>
                                            <p className="mt-0.5 font-mono font-bold text-deep-navy dark:text-white text-sm">
                                                {formatMeasured(distanceCm, 'cm')}
                                            </p>
                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate block">
                                                {measuredDistance
                                                    ? `${distanceCategory} · ${sourceLabel(measuredDistance.source)}`
                                                    : 'Wajah belum terdeteksi'}
                                            </span>
                                        </div>
                                        <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low/70 dark:bg-slate-900/60 p-2.5">
                                            <div className="flex items-center justify-between text-[10px] text-on-surface-variant dark:text-slate-400">
                                                <span>Cahaya:</span>
                                                <Sun className="h-3.5 w-3.5 text-amber-500" />
                                            </div>
                                            <p className="mt-0.5 font-mono font-bold text-deep-navy dark:text-white text-sm">
                                                {formatMeasured(luxValue, 'Lux')}
                                            </p>
                                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold truncate block">
                                                {measuredLux
                                                    ? `${luxCondition} · ${sourceLabel(measuredLux.source)}`
                                                    : 'Buka Panel Riset untuk mengukur'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* 1. Luxometer Biometrik Widget */}
                                <LuxometerWidget
                                    currentLux={luxValue}
                                    onLuxChange={handleLuxChange}
                                    targetLux={luxTarget}
                                    onTargetChange={setLuxTarget}
                                    videoRef={scannerVideoRef}
                                    faceROI={faceROI}
                                    isScanning={status === 'verifying'}
                                    isDark={isDark}
                                />

                                {/* 2. Distance Meter Rangefinder Widget */}
                                <DistanceMeterWidget
                                    currentDistance={distanceCm}
                                    onDistanceChange={handleDistanceChange}
                                    liveCameraReading={freshCameraDistance}
                                    targetDistance={distanceTarget}
                                    onTargetChange={setDistanceTarget}
                                    isDark={isDark}
                                />

                                {/* 3. Evaluasi 3 Skenario Bab 5 (Cochran's Q & McNemar) */}
                                <Bab5ScenarioCard
                                    data={
                                        evaluationData
                                            ? evaluationData
                                            : {
                                                  ear_val: ear,
                                                  mar_val: mar,
                                                  distance_cm: distanceCm ?? undefined,
                                                  lux_value: luxValue ?? undefined,
                                                  subject_id: subjectId,
                                              }
                                    }
                                    isDark={isDark}
                                    variant="sidebar"
                                />

                                {/* 4. Qalwani Research Telemetry Panel */}
                                {isQalwaniSubject && (
                                    <QalwaniResearchPanel
                                        ear={ear}
                                        mar={mar}
                                        quality={quality}
                                        lux={luxValue}
                                        luxCondition={luxCondition}
                                        distanceCm={distanceCm}
                                        distanceCategory={distanceCategory}
                                        facenetScore={facenetScore}
                                        emarScore={emarScore}
                                        latencyMs={latencyMs}
                                        sessionId={sessionId}
                                        isDark={isDark}
                                    />
                                )}
                            </>
                        )}

                        {/* Manual Enrollment Modal */}
                        {user && (
                            <ManualEnrollmentModal
                                isOpen={isEnrollModalOpen}
                                onClose={() => setIsEnrollModalOpen(false)}
                                onSuccess={() => {
                                    setErrorMsg(null);
                                }}
                                currentUserId={user.id}
                                currentUserRole={user.role || 'teacher'}
                                preselectEmbeddingId={enrollPreselect}
                            />
                        )}
                    </div>
                </div>

                {/* ======================================================== */}
                {/* 5. EVALUATION DECISION REPORT MODAL (ACCEPT / REJECT)    */}
                {/* ======================================================== */}
                <AnimatePresence>
                    {isEvalModalOpen && evaluationData && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6 backdrop-blur-xl overflow-y-auto">
                            {/* Backdrop Click Dismiss */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsEvalModalOpen(false)}
                                className="fixed inset-0 bg-black/40 -z-10"
                            />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                                transition={{ type: 'spring' as const, damping: 28, stiffness: 360 }}
                                className="relative w-full max-w-4xl lg:max-w-5xl overflow-hidden rounded-[28px] sm:rounded-[36px] border border-outline-variant/50 dark:border-white/10 bg-surface-container-lowest/95 dark:bg-[#0C152B]/95 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-3xl my-auto max-h-[92vh] flex flex-col"
                            >
                                {/* Subtle Ambient Radial Glow */}
                                <div
                                    className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-96 rounded-full blur-3xl opacity-20 dark:opacity-30 transition-colors ${
                                        evaluationData.final_decision === 'ACCEPT'
                                            ? 'bg-emerald-500'
                                            : 'bg-rose-500'
                                    }`}
                                />

                                {/* Modal Header Banner: Clean, Informative, Compact */}
                                <div
                                    className={`relative px-5 py-4 sm:px-7 sm:py-5 shrink-0 border-b flex items-center justify-between gap-4 ${
                                        evaluationData.final_decision === 'ACCEPT'
                                            ? 'bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/20'
                                            : 'bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/20'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                        <div
                                            className={`relative flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl shadow-md ${
                                                evaluationData.final_decision === 'ACCEPT'
                                                    ? 'bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-emerald-500/25 ring-2 ring-emerald-500/20'
                                                    : 'bg-gradient-to-tr from-rose-600 via-rose-500 to-red-500 text-white shadow-rose-500/25 ring-2 ring-rose-500/20'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[26px] sm:text-[28px]">
                                                {evaluationData.final_decision === 'ACCEPT'
                                                    ? 'verified'
                                                    : 'gpp_bad'}
                                            </span>
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span
                                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                                        evaluationData.final_decision === 'ACCEPT'
                                                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                                                            : 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-500/30'
                                                    }`}
                                                >
                                                    <span
                                                        className={`h-1.5 w-1.5 rounded-full ${
                                                            evaluationData.final_decision === 'ACCEPT'
                                                                ? 'bg-emerald-500 animate-pulse'
                                                                : 'bg-rose-500'
                                                        }`}
                                                    />
                                                    {evaluationData.final_decision === 'ACCEPT'
                                                        ? 'VERIFIKASI SUKSES'
                                                        : 'VERIFIKASI GAGAL'}
                                                </span>
                                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
                                                    Biometrik Wajah 3D &amp; Liveness
                                                </span>
                                            </div>

                                            <h3 className="text-base sm:text-xl font-black tracking-tight text-deep-navy dark:text-white truncate mt-0.5">
                                                {evaluationData.final_decision === 'ACCEPT'
                                                    ? 'Presensi Berhasil Diverifikasi'
                                                    : 'Verifikasi Belum Memenuhi Standar'}
                                            </h3>
                                        </div>
                                    </div>

                                    {/* Close Button */}
                                    <motion.button
                                        type="button"
                                        onClick={() => setIsEvalModalOpen(false)}
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.92 }}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-300 hover:bg-black/10 dark:hover:bg-white/20 transition-all cursor-pointer"
                                        title="Tutup Hasil Evaluasi"
                                        aria-label="Tutup"
                                    >
                                        <X className="h-4 w-4" />
                                    </motion.button>
                                </div>

                                {/* Modal Body: Responsive 2-Column Bento Architecture */}
                                <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
                                    {showReenrollOffer && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                                                    Wajah belum cocok dengan template tersimpan
                                                </p>
                                                <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
                                                    Kedipan dan gerak mulut terdeteksi, tetapi jarak wajah melewati batas
                                                    {faceMatchL2Caption ? ` (${faceMatchL2Caption})` : ''}. Bila ini wajah
                                                    Anda dan template dibuat dari kamera lain, daftarkan ulang dari kamera
                                                    presensi ini. Template lama dicadangkan otomatis.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsEvalModalOpen(false);
                                                    openEnrollment(evaluationData.subject_id ?? null);
                                                }}
                                                className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-sm font-bold text-white min-h-[44px] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                                            >
                                                Daftar ulang wajah dari kamera ini
                                            </button>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                                        {/* LEFT COLUMN: Digital Attendance Pass (5 Cols on Desktop) */}
                                        <div className="md:col-span-5 flex flex-col gap-3.5">
                                            <div className="rounded-3xl border border-royal-blue/20 dark:border-sky-500/20 bg-gradient-to-b from-blue-50/70 via-white/80 to-sky-50/40 dark:from-[#112042]/80 dark:via-[#0F1B36]/80 dark:to-[#0A1329]/80 p-4 sm:p-5 shadow-sm relative overflow-hidden">
                                                {/* Header SMK Al-Madani Identity */}
                                                <div className="flex items-center justify-between border-b border-outline-variant/30 dark:border-white/10 pb-3 mb-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-royal-blue/15 text-royal-blue dark:text-sky-400">
                                                            <span className="material-symbols-outlined text-[17px]">
                                                                school
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-black tracking-widest text-royal-blue dark:text-sky-400 uppercase block">
                                                                SMK AL-MADANI
                                                            </span>
                                                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                                                                Bukti Presensi Biometrik
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span
                                                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                                                            (evaluationData.status_str || '').toLowerCase() === 'hadir'
                                                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                                                : (evaluationData.status_str || '').toLowerCase() === 'terlambat'
                                                                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                                                  : (evaluationData.status_str || '').toLowerCase() === 'pulang'
                                                                    ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                                                                    : 'bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/30'
                                                        }`}
                                                    >
                                                        {evaluationData.status_label || (evaluationData.status_str || 'HADIR').toUpperCase()}
                                                    </span>
                                                </div>

                                                {/* Teacher Identity & Avatar */}
                                                <div className="flex items-center gap-3 my-2">
                                                    <div className="relative">
                                                        <div className="flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-2xl bg-gradient-to-tr from-royal-blue to-indigo-600 text-white font-black text-lg shadow-md">
                                                            {(evaluationData.teacher_name || currentSubjectInfo.name || 'G')
                                                                .split(' ')
                                                                .slice(0, 2)
                                                                .map((w: string) => w[0])
                                                                .join('')
                                                                .toUpperCase()}
                                                        </div>
                                                        <div
                                                            className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white dark:border-[#0C152B] ${
                                                                evaluationData.final_decision === 'ACCEPT'
                                                                    ? 'bg-emerald-500 text-white'
                                                                    : 'bg-rose-500 text-white'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-[11px]">
                                                                {evaluationData.final_decision === 'ACCEPT' ? 'check' : 'close'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-extrabold text-sm sm:text-base text-deep-navy dark:text-white truncate">
                                                            {evaluationData.teacher_name || currentSubjectInfo.name}
                                                        </p>
                                                        <p className="font-mono text-xs font-bold text-royal-blue dark:text-sky-400">
                                                            ID: {evaluationData.subject_id}
                                                        </p>
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                                                            Tenaga Pendidik / Guru Terdaftar
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Operational Session Summary */}
                                                <div className="mt-3.5 space-y-2 text-xs">
                                                    <div className="flex items-center justify-between rounded-xl bg-white/70 dark:bg-black/25 p-2.5 border border-outline-variant/20 dark:border-white/5">
                                                        <span className="text-[11px] font-semibold text-on-surface-variant dark:text-slate-400">
                                                            Sesi:
                                                        </span>
                                                        <span className="font-bold text-deep-navy dark:text-white text-right truncate">
                                                            {evaluationData.operational_session?.session_title || 'Presensi Masuk Harian'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between rounded-xl bg-white/70 dark:bg-black/25 p-2.5 border border-outline-variant/20 dark:border-white/5">
                                                        <span className="text-[11px] font-semibold text-on-surface-variant dark:text-slate-400">
                                                            Waktu Validasi:
                                                        </span>
                                                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                            {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between rounded-xl bg-white/70 dark:bg-black/25 p-2.5 border border-outline-variant/20 dark:border-white/5">
                                                        <span className="text-[11px] font-semibold text-on-surface-variant dark:text-slate-400">
                                                            Jadwal SOP:
                                                        </span>
                                                        <span className="font-mono font-bold text-royal-blue dark:text-sky-400">
                                                            {(evaluationData.operational_session?.time_range || '06.30 - 07.15 WIB').replace(/–/g, '-')}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* SOP Compliance Note */}
                                                <p className="mt-3 text-[10px] text-on-surface-variant dark:text-slate-300 italic bg-white/60 dark:bg-black/20 p-2 rounded-xl border border-outline-variant/20 dark:border-white/5 flex items-start gap-1.5">
                                                    <span className="material-symbols-outlined text-[13px] text-royal-blue dark:text-sky-400 shrink-0 mt-0.5">
                                                        verified_user
                                                    </span>
                                                    <span className="leading-snug">
                                                        {evaluationData.operational_session?.operational_desc ||
                                                            'Terekam sah dalam sistem presensi SMK Al-Madani.'}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>

                                        {/* RIGHT COLUMN: Human Summary & Tech Accordion (7 Cols on Desktop) */}
                                        <div className="md:col-span-7 flex flex-col gap-3.5">
                                            {/* 4 Human-Friendly Cards (2x2 Grid) */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                                                {/* Card 1: Tingkat Kecocokan Wajah */}
                                                <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low/70 dark:bg-slate-900/60 p-3 sm:p-3.5 flex flex-col justify-between shadow-xs">
                                                    <div className="flex items-center justify-between text-on-surface-variant dark:text-slate-400 text-[11px]">
                                                        <span className="font-bold">Kecocokan Wajah</span>
                                                        <span className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-400">
                                                            fingerprint
                                                        </span>
                                                    </div>
                                                    <div className="my-1.5">
                                                        <div className="flex items-baseline justify-between">
                                                            <span className="text-lg font-black text-deep-navy dark:text-white">
                                                                {evaluationData.euclidean_distance == null
                                                                    ? '—'
                                                                    : `${Math.max(0, Math.min(100, Math.round((1 - (evaluationData.euclidean_distance * evaluationData.euclidean_distance) / 2) * 100)))}%`}
                                                            </span>
                                                            <span
                                                                className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                                                                    evaluationData.id_pred === 'MATCH'
                                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                                                }`}
                                                            >
                                                                {evaluationData.id_pred === 'MATCH'
                                                                    ? 'Identik ✓'
                                                                    : evaluationData.id_pred === 'UNAVAILABLE'
                                                                      ? 'Tidak terukur'
                                                                      : 'Beda'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    evaluationData.id_pred === 'MATCH'
                                                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                                                        : 'bg-rose-500'
                                                                }`}
                                                                style={{
                                                                    width: evaluationData.euclidean_distance == null
                                                                        ? '0%'
                                                                        : `${Math.max(10, Math.min(100, Math.round((1 - (evaluationData.euclidean_distance * evaluationData.euclidean_distance) / 2) * 100)))}%`,
                                                                }}
                                                            />
                                                        </div>
                                                        {faceMatchL2Caption && (
                                                            <p className="mt-1 font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                                                {faceMatchL2Caption}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                                        {evaluationData.id_pred === 'MATCH'
                                                            ? 'Identik dengan profil guru terdaftar.'
                                                            : evaluationData.id_pred === 'UNAVAILABLE'
                                                              ? 'Mesin biometrik tidak memberi hasil; identitas belum diperiksa.'
                                                              : 'Wajah tidak cocok dengan ID subjek.'}
                                                    </span>
                                                </div>

                                                {/* Card 2: Validasi Wajah Asli (Anti-Spoofing) */}
                                                <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low/70 dark:bg-slate-900/60 p-3 sm:p-3.5 flex flex-col justify-between shadow-xs">
                                                    <div className="flex items-center justify-between text-on-surface-variant dark:text-slate-400 text-[11px]">
                                                        <span className="font-bold">Keaslian Wajah</span>
                                                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                                    </div>
                                                    <div className="my-1.5">
                                                        <div className="flex items-baseline justify-between">
                                                            <span
                                                                className={`text-sm sm:text-base font-black truncate ${
                                                                    evaluationData.pad_pred === 'BONA_FIDE'
                                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                                        : 'text-rose-600 dark:text-rose-400'
                                                                }`}
                                                            >
                                                                {evaluationData.pad_pred === 'BONA_FIDE'
                                                                    ? 'Wajah Asli'
                                                                    : 'Indikasi Tiruan'}
                                                            </span>
                                                            <span
                                                                className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase shrink-0 ${
                                                                    evaluationData.pad_pred === 'BONA_FIDE'
                                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                                                }`}
                                                            >
                                                                {evaluationData.pad_pred === 'BONA_FIDE' ? 'Bona Fide ✓' : 'Spoof'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                                            <Check className="h-3 w-3" />
                                                            <span>Anti-Spoofing Lolos</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                                        {evaluationData.pad_pred === 'BONA_FIDE'
                                                            ? 'Bukan foto cetak atau rekaman layar HP.'
                                                            : 'Terdeteksi manipulasi atau foto cetak.'}
                                                    </span>
                                                </div>

                                                {/* Card 3: Refleks Kedipan Mata Alami */}
                                                <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low/70 dark:bg-slate-900/60 p-3 sm:p-3.5 flex flex-col justify-between shadow-xs">
                                                    <div className="flex items-center justify-between text-on-surface-variant dark:text-slate-400 text-[11px]">
                                                        <span className="font-bold">Refleks Kedipan</span>
                                                        <Eye className="h-4 w-4 text-royal-blue dark:text-sky-400" />
                                                    </div>
                                                    <div className="my-1.5">
                                                        <div className="flex items-baseline justify-between">
                                                            <span className="text-lg font-black text-deep-navy dark:text-white">
                                                                {evaluationData.ear_blinks}x
                                                            </span>
                                                            <span
                                                                className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                                                                    evaluationData.ear_blinks >= 1
                                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                                }`}
                                                            >
                                                                {evaluationData.ear_blinks >= 1 ? 'Alami ✓' : 'Min 1x'}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                                            Kedipan fisiologis tervalidasi
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                                        {evaluationData.mar_mouths > 0
                                                            ? `${evaluationData.mar_mouths}x respons mikromimik terdeteksi.`
                                                            : 'Respon liveness mata 8 detik normal.'}
                                                    </span>
                                                </div>

                                                {/* Card 4: Kestabilan & Lingkungan */}
                                                <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low/70 dark:bg-slate-900/60 p-3 sm:p-3.5 flex flex-col justify-between shadow-xs">
                                                    <div className="flex items-center justify-between text-on-surface-variant dark:text-slate-400 text-[11px]">
                                                        <span className="font-bold">Kestabilan Kamera</span>
                                                        <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                    </div>
                                                    <div className="my-1.5">
                                                        <div className="flex items-baseline justify-between">
                                                            <span className="text-lg font-black text-deep-navy dark:text-white">
                                                                {evaluationData.face_detected_pct}%
                                                            </span>
                                                            <span
                                                                className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                                                                    evaluationData.face_detected_pct >= 80
                                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                                                }`}
                                                            >
                                                                {evaluationData.face_detected_pct >= 80 ? 'Stabil ✓' : 'Goyang'}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                                            {formatMeasured(evaluationData.distance_cm, 'cm')} • {formatMeasured(evaluationData.lux_value, 'Lux')}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                                        {evaluationData.distance_cm == null || evaluationData.lux_value == null
                                                            ? 'Jarak atau cahaya tidak terukur pada pemindaian ini.'
                                                            : 'Jarak dan cahaya terukur saat pemindaian.'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Expandable Technical Accordion (Bab 5 Skripsi) */}
                                            <div className="rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low/40 dark:bg-slate-900/40 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEvalTechDetailsOpen(!isEvalTechDetailsOpen)}
                                                    className="w-full flex items-center justify-between p-3 sm:p-3.5 hover:bg-surface-container-high/40 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-royal-blue/10 dark:bg-sky-400/10 text-royal-blue dark:text-sky-400 shrink-0">
                                                            <Activity className="h-3.5 w-3.5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-deep-navy dark:text-white truncate">
                                                                Rincian Teknis &amp; Telemetri Riset Skripsi (Bab 5)
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                                                Nilai Euclidean L2, EAR, MAR, dan Uji Hipotesis
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hidden sm:inline">
                                                            L2: {evaluationData.euclidean_distance ?? '—'}
                                                        </span>
                                                        {isEvalTechDetailsOpen ? (
                                                            <ChevronUp className="h-4 w-4 text-slate-400" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4 text-slate-400" />
                                                        )}
                                                    </div>
                                                </button>

                                                {isEvalTechDetailsOpen && (
                                                    <div className="p-3 sm:p-4 border-t border-outline-variant/30 dark:border-white/10 space-y-3.5 bg-surface-container-lowest/60 dark:bg-black/20">
                                                        {/* 8 Biometric Telemetry Bento Cards */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                            {/* 1. Claimed Subject */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">Subjek:</span>
                                                                <p className="font-mono font-bold text-deep-navy dark:text-white text-xs mt-0.5 truncate">
                                                                    {evaluationData.subject_id}
                                                                </p>
                                                            </div>
                                                            {/* 2. PAD Pred */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">PAD Liveness:</span>
                                                                <p className={`font-mono font-bold text-xs mt-0.5 truncate ${evaluationData.pad_pred === 'BONA_FIDE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                                                                    {evaluationData.pad_pred}
                                                                </p>
                                                            </div>
                                                            {/* 3. ID Match */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">FaceNet ID:</span>
                                                                <p className={`font-mono font-bold text-xs mt-0.5 truncate ${evaluationData.id_pred === 'MATCH' ? 'text-purple-600 dark:text-purple-400' : 'text-rose-600'}`}>
                                                                    {evaluationData.id_pred}
                                                                </p>
                                                            </div>
                                                            {/* 4. Euclidean L2 */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">Jarak L2 (&le; 0.40):</span>
                                                                <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs mt-0.5 truncate">
                                                                    {evaluationData.euclidean_distance ?? '—'}
                                                                </p>
                                                            </div>
                                                            {/* 5. Tantangan Acak */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">Tantangan:</span>
                                                                <p className="font-mono font-bold text-sky-600 dark:text-sky-400 text-xs mt-0.5 truncate">
                                                                    {evaluationData.active_challenge || '-'}
                                                                </p>
                                                            </div>
                                                            {/* 6. Status Tantangan */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">Status Tantangan:</span>
                                                                <p className={`font-mono font-bold text-xs mt-0.5 truncate ${evaluationData.challenge_status === 'PASS_LIVENESS' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                                                                    {evaluationData.challenge_status || (evaluationData.pad_pred === 'BONA_FIDE' ? 'VALID' : 'GAGAL')}
                                                                </p>
                                                            </div>
                                                            {/* 7. EAR & MAR */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">EAR & MAR:</span>
                                                                <p className="font-mono font-bold text-deep-navy dark:text-white text-xs mt-0.5 truncate">
                                                                    {evaluationData.ear_blinks}x kedip • {evaluationData.mar_mouths}x mulut
                                                                </p>
                                                            </div>
                                                            {/* 8. Stability & Lingkungan */}
                                                            <div className="rounded-xl border border-outline-variant/20 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 p-2.5">
                                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 block">Kestabilan & Uji:</span>
                                                                <p className="font-mono font-bold text-deep-navy dark:text-white text-xs mt-0.5 truncate">
                                                                    {evaluationData.face_detected_pct}% • {formatMeasured(evaluationData.distance_cm, 'cm')}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Evaluasi Serentak 3 Skenario (Bab 5: Uji Cochran's Q & McNemar) */}
                                                        <div className="pt-1">
                                                            <Bab5ScenarioCard
                                                                data={evaluationData}
                                                                isDark={isDark}
                                                                variant="modal"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons Hub */}
                                    <div className="pt-2 border-t border-outline-variant/30 dark:border-white/10 space-y-2.5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {/* Download CSV Subject Button */}
                                            <motion.button
                                                type="button"
                                                onClick={handleDownloadSubjectCsv}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl border py-2.5 px-4 text-xs font-bold shadow-xs transition-all cursor-pointer min-h-[44px] touch-manipulation ${
                                                    isCsvDownloaded
                                                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                        : 'border-sky-400/40 bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20'
                                                }`}
                                            >
                                                {isCsvDownloaded ? (
                                                    <>
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500 animate-bounce" />
                                                        <span className="truncate">
                                                            CSV Subjek ({evaluationData.subject_id}) Disimpan!
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download className="h-4 w-4" />
                                                        <span className="truncate">
                                                            Download CSV Subjek ({evaluationData.subject_id})
                                                        </span>
                                                    </>
                                                )}
                                            </motion.button>

                                            {/* Download Bab 5 CSV Dataset Button */}
                                            <a
                                                href="/presensi/export-bab5"
                                                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 py-2.5 px-4 text-xs font-bold shadow-xs transition-all cursor-pointer min-h-[44px] touch-manipulation text-center"
                                                title="Unduh Dataset_Eksperimen_Bab5.csv untuk Uji Cochran's Q &amp; McNemar"
                                            >
                                                <FileSpreadsheet className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                                <span className="truncate">
                                                    Unduh Dataset Bab 5 (CSV)
                                                </span>
                                            </a>
                                        </div>

                                        {/* Navigation Actions */}
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                            <motion.button
                                                type="button"
                                                onClick={handleNextSubject}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.96 }}
                                                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue via-blue-600 to-indigo-700 dark:from-sky-500 dark:via-royal-blue dark:to-blue-700 py-2.5 px-4 text-xs sm:text-sm font-bold text-white shadow-md shadow-royal-blue/20 hover:brightness-110 active:scale-95 transition cursor-pointer min-h-[44px] touch-manipulation"
                                            >
                                                <SkipForward className="h-4 w-4" />
                                                <span>Subjek Selanjutnya</span>
                                            </motion.button>

                                            <motion.button
                                                type="button"
                                                onClick={() => {
                                                    setIsEvalModalOpen(false);
                                                    handleReset();
                                                    addToast('info', 'Sesi diulang, siap memindai kembali', 'refresh');
                                                }}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.96 }}
                                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-deep-navy dark:text-white hover:bg-surface-container dark:hover:bg-white/20 active:scale-95 transition cursor-pointer min-h-[44px] touch-manipulation"
                                            >
                                                <RefreshCw className="h-4 w-4 text-royal-blue dark:text-sky-400" />
                                                <span>Ulangi Sesi</span>
                                            </motion.button>

                                            <Link
                                                href="/dashboard"
                                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-deep-navy dark:text-white hover:bg-surface-container dark:hover:bg-white/20 active:scale-95 transition text-center min-h-[44px] touch-manipulation"
                                            >
                                                <LayoutDashboard className="h-4 w-4 text-royal-blue dark:text-sky-400" />
                                                <span>Dashboard</span>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* ======================================================== */}
                {/* 6. MODAL CARI & PILIH GURU (KIOSK MODE)                  */}
                {/* ======================================================== */}
                <AnimatePresence>
                    {isSubjectPickerOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6 backdrop-blur-xl overflow-y-auto">
                            {/* Backdrop Click Dismiss */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsSubjectPickerOpen(false)}
                                className="fixed inset-0 bg-black/40 -z-10"
                            />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 15 }}
                                transition={{ type: 'spring' as const, damping: 26, stiffness: 350 }}
                                className="w-full max-w-xl overflow-hidden rounded-[28px] sm:rounded-[32px] border border-outline-variant/50 dark:border-white/10 bg-surface-container-lowest/95 dark:bg-[#0C152B]/95 shadow-[0_25px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl my-auto max-h-[90vh] flex flex-col"
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-outline-variant/30 dark:border-white/10 p-4 sm:p-5">
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-royal-blue/10 dark:bg-sky-500/20 text-royal-blue dark:text-sky-400">
                                            <Search className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base sm:text-lg font-extrabold text-deep-navy dark:text-white">
                                                Pilih Guru / Subjek Presensi
                                            </h3>
                                            <p className="text-xs text-on-surface-variant dark:text-slate-400">
                                                Cari nama guru atau ID untuk memulai pemindaian
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsSubjectPickerOpen(false)}
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant/50 dark:border-white/10 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-surface-container dark:hover:bg-white/10 transition cursor-pointer"
                                        aria-label="Tutup"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                {/* Search Bar */}
                                <div className="p-4 sm:p-5 border-b border-outline-variant/20 dark:border-white/5 bg-surface-container-low/40 dark:bg-white/[0.02]">
                                    <div className="relative">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={subjectSearchQuery}
                                            onChange={(e) => setSubjectSearchQuery(e.target.value)}
                                            placeholder="Ketik nama guru atau kode (misal: Nur, S02, Fauzi)..."
                                            className="w-full rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/90 pl-10 pr-4 py-3 text-base sm:text-sm font-bold text-deep-navy dark:text-white placeholder:text-slate-400 focus:border-royal-blue dark:focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-royal-blue/20"
                                            autoFocus
                                        />
                                        {subjectSearchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setSubjectSearchQuery('')}
                                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Teachers Grid List */}
                                <div className="p-3 sm:p-5 overflow-y-auto max-h-[55vh] space-y-2">
                                    {filteredSubjects.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 text-xs">
                                            Guru dengan nama "{subjectSearchQuery}" tidak ditemukan.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {filteredSubjects.map((s) => {
                                                const isSelected = subjectId === s.id;
                                                return (
                                                    <motion.button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => {
                                                            handleChangeSubject(s.id);
                                                            setIsSubjectPickerOpen(false);
                                                        }}
                                                        whileTap={{ scale: 0.98 }}
                                                        className={`flex items-center gap-3 rounded-2xl p-3 text-left transition border cursor-pointer min-h-[52px] touch-manipulation ${
                                                            isSelected
                                                                ? 'border-royal-blue dark:border-sky-400 bg-royal-blue/10 dark:bg-sky-500/20 ring-2 ring-royal-blue/30'
                                                                : 'border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 hover:bg-surface-container dark:hover:bg-white/10'
                                                        }`}
                                                    >
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-royal-blue to-sky-500 font-mono font-bold text-white text-xs shadow-xs">
                                                            {s.id}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-1">
                                                                <p className="truncate text-xs sm:text-sm font-bold text-deep-navy dark:text-white">
                                                                    {s.name}
                                                                </p>
                                                                {isSelected && (
                                                                    <span className="shrink-0 text-emerald-600 dark:text-emerald-400">
                                                                        <CheckCircle2 className="h-4 w-4" />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="truncate font-mono text-[10px] text-on-surface-variant dark:text-slate-400">
                                                                {s.email}
                                                            </p>
                                                        </div>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="border-t border-outline-variant/30 dark:border-white/10 p-3 sm:p-4 bg-surface-container-low/50 dark:bg-white/[0.02] flex items-center justify-between">
                                    <span className="text-[11px] text-on-surface-variant dark:text-slate-400 font-semibold">
                                        Total: {filteredSubjects.length} dari {DEFAULT_SUBJECTS.length} Guru
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsSubjectPickerOpen(false)}
                                        className="rounded-2xl bg-surface-container-low dark:bg-white/10 px-4 py-2 text-xs font-bold text-deep-navy dark:text-white hover:bg-surface-container dark:hover:bg-white/20 transition cursor-pointer min-h-[44px] touch-manipulation"
                                    >
                                        Tutup
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* ======================================================== */}
                {/* 7. MODAL PANDUAN CEPAT PRESENSI (3 LANGKAH)              */}
                {/* ======================================================== */}
                <AnimatePresence>
                    {isHelpModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6 backdrop-blur-xl overflow-y-auto">
                            {/* Backdrop Click Dismiss */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsHelpModalOpen(false)}
                                className="fixed inset-0 bg-black/40 -z-10"
                            />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 15 }}
                                transition={{ type: 'spring' as const, damping: 26, stiffness: 350 }}
                                className="w-full max-w-lg overflow-hidden rounded-[28px] sm:rounded-[32px] border border-outline-variant/50 dark:border-white/10 bg-surface-container-lowest/95 dark:bg-[#0C152B]/95 shadow-[0_25px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl my-auto max-h-[90vh] flex flex-col"
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-outline-variant/30 dark:border-white/10 p-5 bg-gradient-to-r from-royal-blue/10 via-sky-500/10 to-transparent">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-royal-blue dark:bg-sky-500 text-white shadow-md">
                                            <HelpCircle className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-base sm:text-lg font-extrabold text-deep-navy dark:text-white">
                                                Panduan Presensi Biometrik
                                            </h3>
                                            <p className="text-xs text-on-surface-variant dark:text-slate-400">
                                                3 Langkah mudah &amp; cepat untuk semua orang
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsHelpModalOpen(false)}
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant/50 dark:border-white/10 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-surface-container dark:hover:bg-white/10 transition cursor-pointer"
                                        aria-label="Tutup"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                {/* Content Body */}
                                <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
                                    {/* Step 1 */}
                                    <div className="flex items-start gap-3.5 rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-4 shadow-xs">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-royal-blue/15 text-royal-blue dark:text-sky-300 font-black text-sm">
                                            1
                                        </div>
                                        <div>
                                            <h4 className="text-xs sm:text-sm font-bold text-deep-navy dark:text-white">
                                                Posisikan Wajah di Lingkaran (~30 cm)
                                            </h4>
                                            <p className="text-[11px] sm:text-xs text-on-surface-variant dark:text-slate-400 mt-1">
                                                Hadap kamera tegak lurus. Pastikan wajah tidak tertutup masker atau topi, dan berada tepat di dalam lingkaran oval panduan.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Step 2 */}
                                    <div className="flex items-start gap-3.5 rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-4 shadow-xs">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 font-black text-sm">
                                            2
                                        </div>
                                        <div>
                                            <h4 className="text-xs sm:text-sm font-bold text-deep-navy dark:text-white">
                                                Tunggu Hitungan Mundur (3 Detik)
                                            </h4>
                                            <p className="text-[11px] sm:text-xs text-on-surface-variant dark:text-slate-400 mt-1">
                                                Begitu posisi dan jarak terdeteksi ideal, scanner akan menghitung mundur 3, 2, 1 secara otomatis.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Step 3 */}
                                    <div className="flex items-start gap-3.5 rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 p-4 shadow-xs">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-black text-sm">
                                            3
                                        </div>
                                        <div>
                                            <h4 className="text-xs sm:text-sm font-bold text-deep-navy dark:text-white">
                                                Pemindaian Liveness 8 Detik &amp; Kedipan
                                            </h4>
                                            <p className="text-[11px] sm:text-xs text-on-surface-variant dark:text-slate-400 mt-1">
                                                Tahan posisi selama 8 detik. Cukup berkedip secara wajar atau sedikit tersenyum untuk verifikasi anti-spoofing EMAR.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Tips Alert */}
                                    <div className="rounded-2xl border border-sky-400/30 bg-sky-50/70 dark:bg-sky-500/10 p-3.5 text-xs text-sky-900 dark:text-sky-200 shadow-xs">
                                        <p className="font-bold flex items-center gap-1.5 mb-1">
                                            <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                            <span>Tips Agar Cepat Berhasil:</span>
                                        </p>
                                        <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                                            <li>Gunakan pencahayaan ruangan yang terang merata.</li>
                                            <li>Aktifkan tombol 🔊 (speaker) di sudut atas kamera untuk mendengarkan panduan suara.</li>
                                            <li>Jika menggunakan tablet/kiosk piket, gunakan tombol 🔄 untuk berganti ke kamera belakang.</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="border-t border-outline-variant/30 dark:border-white/10 p-4 bg-surface-container-low/50 dark:bg-white/[0.02]">
                                    <button
                                        type="button"
                                        onClick={() => setIsHelpModalOpen(false)}
                                        className="w-full rounded-2xl bg-gradient-to-r from-royal-blue to-indigo-700 py-3.5 text-xs sm:text-sm font-bold text-white shadow-md hover:brightness-105 transition cursor-pointer min-h-[44px]"
                                    >
                                        Saya Mengerti, Mulai Presensi
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
