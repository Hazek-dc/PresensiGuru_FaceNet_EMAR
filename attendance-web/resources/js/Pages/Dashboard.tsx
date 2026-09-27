import ConfirmHideActivityModal, {
    PreviewData,
} from '@/Components/Presensi/ConfirmHideActivityModal';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Framer Motion Animation Variants
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.04,
            delayChildren: 0.02,
        },
    },
};

const cardItemVariants = {
    hidden: { opacity: 0, y: 14, scale: 0.98 },
    show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            type: 'spring' as const,
            damping: 26,
            stiffness: 340,
        },
    },
};

// =========================================================================
// LUXURY ENTERPRISE GRADE UI PRIMITIVES
// =========================================================================

/**
 * 1. AnimatedCounter: Rolling Odometer Count-Up with Elastic Ease-Out
 */
function AnimatedCounter({ value, duration = 900 }: { value: number; duration?: number }) {
    const [displayValue, setDisplayValue] = useState<number>(Number(value) || 0);
    const prevValueRef = useRef<number>(Number(value) || 0);

    useEffect(() => {
        const startVal = prevValueRef.current;
        const endVal = Number(value) || 0;
        prevValueRef.current = endVal;
        if (startVal === endVal) {
            setDisplayValue(endVal);
            return;
        }

        const startTime = performance.now();
        let frameId: number;

        const updateCount = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Elastic ease-out curve
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            const current = Math.round(startVal + (endVal - startVal) * easeProgress);
            setDisplayValue(current);

            if (progress < 1) {
                frameId = requestAnimationFrame(updateCount);
            } else {
                setDisplayValue(endVal);
            }
        };

        frameId = requestAnimationFrame(updateCount);
        return () => cancelAnimationFrame(frameId);
    }, [value, duration]);

    return <span className="tabular-nums font-mono">{displayValue}</span>;
}

/**
 * 2. StatusDot: Crisp, purposeful status indicator
 */
function StatusDot({
    color = 'emerald',
    size = 'sm',
}: {
    color?: 'emerald' | 'amber' | 'sky' | 'rose' | 'purple';
    size?: 'xs' | 'sm' | 'md';
}) {
    const dotColor = {
        emerald: 'bg-emerald-500',
        amber: 'bg-amber-500',
        sky: 'bg-sky-500',
        rose: 'bg-rose-500',
        purple: 'bg-purple-500',
    }[color] || 'bg-emerald-500';

    const sizeClass = {
        xs: 'h-1.5 w-1.5',
        sm: 'h-2 w-2',
        md: 'h-2.5 w-2.5',
    }[size];

    return (
        <span className={`inline-block shrink-0 rounded-full ${dotColor} ${sizeClass}`} />
    );
}

// Alias for backwards compatibility
const BreathingBeacon = StatusDot;

/**
 * 3. LiquidSheenSweep: Removed AI-slop sheen effect
 */
function LiquidSheenSweep() {
    return null;
}

/**
 * 4. StatBentoCard: Crisp, solid card surface per DESIGN.md
 */
function SpotlightBentoCard({
    children,
    className = '',
}: {
    children: React.ReactNode;
    statusColor?: 'emerald' | 'amber' | 'purple' | 'slate' | 'sky' | 'rose';
    className?: string;
}) {
    return (
        <motion.div
            variants={cardItemVariants}
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0F1B36] p-3.5 sm:p-5 shadow-xs transition-colors hover:border-slate-300 dark:hover:border-white/20 flex flex-col justify-between ${className}`}
        >
            <div className="relative z-10 flex flex-col justify-between h-full">
                {children}
            </div>
        </motion.div>
    );
}

export default function Dashboard({
    stats,
    recent_history,
    recent_activities,
    subjects_list,
    latest_evaluations,
    distance_stats,
    timezone,
    today_date,
    schedule_session,
    schedule_matrix,
}: any) {
    const { user } = (usePage().props.auth as any) || {};

    // Live WIB Clock State with Smooth Second Counter
    const [currentTime, setCurrentTime] = useState<string>('');
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
            setCurrentTime(timeStr);
        };
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    const todayFormatted = useMemo(() => {
        return new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }, []);

    // Time-based greeting
    const greetingText = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 11) return 'Selamat Pagi';
        if (hour < 15) return 'Selamat Siang';
        if (hour < 18) return 'Selamat Sore';
        return 'Selamat Malam';
    }, []);

    // Tab state: Attendance Verification vs Activity Logs
    const [feedTab, setFeedTab] = useState<'presensi' | 'audit'>('presensi');

    // Filter & Search states for Recent Activity feed
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'HADIR' | 'TERLAMBAT' | 'PULANG' | 'IZIN_SAKIT' | 'GAGAL'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Dropdown "More Actions" popover
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!moreMenuOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
                setMoreMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [moreMenuOpen]);

    // Pre-Flight Session Parameter Form States (Skenario Jarak 30 cm)
    const default18Teachers = useMemo(
        () => [
            { id: 1, name: 'Nur Holis', embedding_id: 'S01', email: 'gurupresensi1@gmail.com', has_embedding: true },
            { id: 2, name: 'Viky Widiyanti', embedding_id: 'S02', email: 'gurupresensi2@gmail.com', has_embedding: true },
            { id: 3, name: 'Mauludin', embedding_id: 'S03', email: 'gurupresensi3@gmail.com', has_embedding: true },
            { id: 4, name: 'Ahmad Fauzi', embedding_id: 'S04', email: 'gurupresensi4@gmail.com', has_embedding: true },
            { id: 5, name: 'Merli Yanti', embedding_id: 'S05', email: 'gurupresensi5@gmail.com', has_embedding: true },
            { id: 6, name: 'Karmila Milla', embedding_id: 'S06', email: 'gurupresensi6@gmail.com', has_embedding: true },
            { id: 7, name: 'Reynaldi Surya', embedding_id: 'S07', email: 'gurupresensi7@gmail.com', has_embedding: true },
            { id: 8, name: 'Taufik Hidayat', embedding_id: 'S08', email: 'gurupresensi8@gmail.com', has_embedding: true },
            { id: 9, name: 'Wery Saputra', embedding_id: 'S09', email: 'gurupresensi9@gmail.com', has_embedding: true },
            { id: 10, name: 'Hendra Wijaya', embedding_id: 'S10', email: 'gurupresensi10@gmail.com', has_embedding: true },
            { id: 11, name: 'Susi Lisnasari', embedding_id: 'S11', email: 'gurupresensi11@gmail.com', has_embedding: true },
            { id: 12, name: 'Ponco Prastio', embedding_id: 'S12', email: 'gurupresensi12@gmail.com', has_embedding: true },
            { id: 13, name: 'Yulisma Shinta', embedding_id: 'S13', email: 'gurupresensi13@gmail.com', has_embedding: true },
            { id: 14, name: 'Arie Lazido', embedding_id: 'S14', email: 'gurupresensi14@gmail.com', has_embedding: true },
            { id: 15, name: 'Bambang Susanto', embedding_id: 'S15', email: 'gurupresensi15@gmail.com', has_embedding: true },
            { id: 16, name: 'Sri Wahyuni', embedding_id: 'S16', email: 'gurupresensi16@gmail.com', has_embedding: true },
            { id: 17, name: 'Dedi Irawan', embedding_id: 'S17', email: 'gurupresensi17@gmail.com', has_embedding: true },
            { id: 18, name: 'Eka Prasetya', embedding_id: 'S18', email: 'gurupresensi18@gmail.com', has_embedding: true },
        ],
        [],
    );

    const teachers = subjects_list && subjects_list.length > 0 ? subjects_list : default18Teachers;
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('S01');
    const [luxValue, setLuxValue] = useState<number>(300);
    const [selectedDistance, setSelectedDistance] = useState<number>(30); // 30cm Baku, 45cm Sedang, 60cm Jauh
    const [sessionMode, setSessionMode] = useState<'TEST' | 'ENROLLMENT'>('TEST');
    const [sampleType] = useState<'BONA_FIDE' | 'ATTACK'>('BONA_FIDE');
    const [isStudioExpanded, setIsStudioExpanded] = useState<boolean>(false);
    const [isSOPExpanded, setIsSOPExpanded] = useState<boolean>(true);

    const selectedTeacher = useMemo(() => {
        return teachers.find((t: any) => t.embedding_id === selectedSubjectId) || teachers[0];
    }, [teachers, selectedSubjectId]);

    const handleLaunchStudio = () => {
        const params = new URLSearchParams({
            subject_id: selectedSubjectId,
            claimed_id: selectedSubjectId,
            lux: luxValue.toString(),
            distance_cm: selectedDistance.toString(),
            session_type: sessionMode,
            sample_type: sampleType,
        });
        router.visit(`/presensi?${params.toString()}`);
    };

    // Modal state for Hide Activities
    const [isHideModalOpen, setIsHideModalOpen] = useState(false);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [isFetchingPreview, setIsFetchingPreview] = useState(false);
    const [isCommittingHide, setIsCommittingHide] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [successBanner, setSuccessBanner] = useState<string | null>(null);

    // Modal state for Clear All Activities
    const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [clearConfirmationChecked, setClearConfirmationChecked] = useState(false);

    // Modal state for Single Item Deletion
    const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
    const [singleDeleteItem, setSingleDeleteItem] = useState<any | null>(null);
    const [singleDeleteType, setSingleDeleteType] = useState<'record' | 'activity' | null>(null);
    const [isDeletingSingle, setIsDeletingSingle] = useState(false);

    // Calculate total recorded attendance today
    const totalPresent = stats?.present || 0;
    const totalLate = stats?.late || 0;
    const totalPulang = stats?.pulang || 0;
    const totalIzin = stats?.izin || 0;
    const totalSakit = stats?.sakit || 0;
    const totalDispensasi = totalIzin + totalSakit;
    const totalAbsent = stats?.absent || 0;
    const totalFailed = (stats?.failed || 0) + (stats?.invalid || 0);
    const totalTeachers = stats?.total_teachers || teachers.length || 18;

    const attendanceRate = useMemo(() => {
        if (!totalTeachers) return 0;
        return Math.min(100, Math.round(((totalPresent + totalLate + totalDispensasi) / totalTeachers) * 100));
    }, [totalPresent, totalLate, totalDispensasi, totalTeachers]);

    // Counts for status sub-filter badges
    const statusCounts = useMemo(() => {
        const counts = { ALL: 0, HADIR: 0, TERLAMBAT: 0, PULANG: 0, IZIN_SAKIT: 0, GAGAL: 0 };
        if (!recent_history) return counts;
        counts.ALL = recent_history.length;
        recent_history.forEach((item: any) => {
            const st = (item.status || '').toLowerCase();
            if (st === 'success' || st === 'hadir') counts.HADIR++;
            else if (st === 'terlambat') counts.TERLAMBAT++;
            else if (st === 'pulang') counts.PULANG++;
            else if (st === 'izin' || st === 'sakit') counts.IZIN_SAKIT++;
            else if (st === 'failed' || st === 'invalid' || st === 'gagal' || st === 'ditolak') counts.GAGAL++;
        });
        return counts;
    }, [recent_history]);

    // Filtered Recent History list
    const filteredHistory = useMemo(() => {
        if (!recent_history) return [];

        return recent_history.filter((item: any) => {
            const status = (item.status || '').toLowerCase();
            const isLate = status === 'terlambat';
            const isSuccess = status === 'success' || status === 'hadir';
            const isPulang = status === 'pulang';
            const isIzinSakit = status === 'izin' || status === 'sakit';
            const isFail = status === 'failed' || status === 'invalid' || status === 'gagal' || status === 'ditolak';

            // Category Tab Filter
            if (statusFilter === 'HADIR' && !isSuccess) return false;
            if (statusFilter === 'TERLAMBAT' && !isLate) return false;
            if (statusFilter === 'PULANG' && !isPulang) return false;
            if (statusFilter === 'IZIN_SAKIT' && !isIzinSakit) return false;
            if (statusFilter === 'GAGAL' && !isFail) return false;

            // Search Query Filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const teacherName = (item.teacher?.name || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                const time = (item.time || '').toLowerCase();
                const embeddingId = (item.teacher?.embedding_id || '').toLowerCase();
                return teacherName.includes(q) || desc.includes(q) || time.includes(q) || embeddingId.includes(q);
            }

            return true;
        });
    }, [recent_history, statusFilter, searchQuery]);

    // Filtered System & Teacher Activities (Audit Log)
    const filteredActivities = useMemo(() => {
        if (!recent_activities) return [];

        return recent_activities.filter((act: any) => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const desc = (act.description || '').toLowerCase();
                const causer = (act.causer_name || '').toLowerCase();
                const event = (act.event || '').toLowerCase();
                return desc.includes(q) || causer.includes(q) || event.includes(q);
            }
            return true;
        });
    }, [recent_activities, searchQuery]);

    // Modal handlers
    const handleOpenHideModal = useCallback(async () => {
        setIsHideModalOpen(true);
        setModalError(null);
        setPreviewData(null);
        setIsFetchingPreview(true);

        try {
            const response = await axios.post('/dashboard/activities/preview');
            if (response.data.status === 'success') {
                setPreviewData(response.data);
            } else {
                setModalError(response.data.message || 'Gagal memuat preview aktivitas.');
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Gagal terhubung ke server untuk mengambil preview.';
            setModalError(msg);
        } finally {
            setIsFetchingPreview(false);
        }
    }, []);

    const handleConfirmHide = useCallback(async (token: string, targetIds: number[], reason: string) => {
        setIsCommittingHide(true);
        setModalError(null);

        try {
            const response = await axios.post('/dashboard/activities/hide', {
                preview_token: token,
                target_ids: targetIds,
                reason: reason,
                confirmation_checked: true,
            });

            if (response.data.status === 'success') {
                setIsHideModalOpen(false);
                setSuccessBanner(
                    response.data.message ||
                        `Berhasil menyembunyikan ${targetIds.length} aktivitas verifikasi hari ini dari Dashboard.`,
                );
                setTimeout(() => setSuccessBanner(null), 6000);
                router.reload();
            } else {
                setModalError(response.data.message || 'Gagal menyembunyikan aktivitas.');
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Gagal memproses penyembunyian aktivitas. Silakan coba lagi.';
            setModalError(msg);
        } finally {
            setIsCommittingHide(false);
        }
    }, []);

    const handleClearAllActivities = useCallback(async () => {
        setIsClearingAll(true);
        setModalError(null);

        try {
            const response = await axios.delete('/dashboard/activities/clear-all');
            if (response.data.status === 'success') {
                setIsClearAllModalOpen(false);
                setSuccessBanner(
                    response.data.message ||
                        'Semua aktivitas presensi dan riwayat log berhasil dihapus secara permanen.',
                );
                setTimeout(() => setSuccessBanner(null), 6000);
                router.reload();
            } else {
                setModalError(response.data.message || 'Gagal menghapus aktivitas presensi.');
            }
        } catch (err: any) {
            const msg =
                err.response?.data?.message ||
                'Gagal memproses penghapusan seluruh data aktivitas. Silakan coba lagi.';
            setModalError(msg);
        } finally {
            setIsClearingAll(false);
        }
    }, []);

    const promptDeleteRecord = useCallback((record: any) => {
        setModalError(null);
        setSingleDeleteItem(record);
        setSingleDeleteType('record');
        setIsSingleDeleteModalOpen(true);
    }, []);

    const promptDeleteActivity = useCallback((act: any) => {
        setModalError(null);
        setSingleDeleteItem(act);
        setSingleDeleteType('activity');
        setIsSingleDeleteModalOpen(true);
    }, []);

    const handleConfirmSingleDelete = useCallback(async () => {
        if (!singleDeleteItem || !singleDeleteType) return;
        setIsDeletingSingle(true);
        setModalError(null);

        const url =
            singleDeleteType === 'record'
                ? `/attendance/history/${singleDeleteItem.id}`
                : `/attendance/activities/${singleDeleteItem.id}`;

        try {
            const response = await axios.delete(url);
            if (response.data.status === 'success') {
                setIsSingleDeleteModalOpen(false);
                setSingleDeleteItem(null);
                setSuccessBanner(
                    singleDeleteType === 'record'
                        ? 'Rekaman presensi berhasil dihapus.'
                        : 'Log aktivitas berhasil dihapus.',
                );
                setTimeout(() => setSuccessBanner(null), 5000);
                router.reload();
            } else {
                setModalError(response.data.message || 'Gagal menghapus data.');
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Terjadi kesalahan saat menghapus data.';
            setModalError(msg);
        } finally {
            setIsDeletingSingle(false);
        }
    }, [singleDeleteItem, singleDeleteType]);

    const handleReload = () => {
        setIsRefreshing(true);
        router.reload({
            onFinish: () => {
                setTimeout(() => setIsRefreshing(false), 400);
            },
        });
    };

    return (
        <AuthenticatedLayout>
            <Head title="Dashboard Presensi & Analisis Biometrik" />

            <div className="mx-auto w-full max-w-[1536px] px-3 sm:px-6 md:px-8 py-3.5 sm:py-6 md:py-7">
                {/* ======================================================== */}
                {/* SUCCESS NOTIFICATION BANNER                              */}
                {/* ======================================================== */}
                <AnimatePresence>
                    {successBanner && (
                        <motion.div
                            initial={{ opacity: 0, y: -12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -12, scale: 0.98 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 350 }}
                            className="mb-4 sm:mb-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/15 p-3.5 sm:p-4 text-emerald-800 dark:text-emerald-300 shadow-sm backdrop-blur-md"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                </div>
                                <span className="text-xs sm:text-sm font-semibold leading-snug truncate sm:whitespace-normal">{successBanner}</span>
                            </div>
                            <button
                                onClick={() => setSuccessBanner(null)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-800/70 dark:text-emerald-300/70 hover:bg-emerald-500/20 hover:text-emerald-900 dark:hover:text-emerald-200 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ======================================================== */}
                {/* 1. HERO GREETING & REALTIME HEADER (Ultra-Fluid Modern)  */}
                {/* ======================================================== */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="mb-5 sm:mb-6 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0F1B36] p-4 sm:p-5 md:p-6 shadow-xs"
                >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        {/* Left: Emblem + Identity */}
                        <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
                            {/* School Logo Responsive Emblem */}
                            <div className="relative shrink-0 flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 aspect-square rounded-2xl bg-white p-1.5 sm:p-2 md:p-2.5 border border-slate-200/90 dark:border-white/10 shadow-xs">
                                <img
                                    src="/images/logo-smk-al-madani.png"
                                    alt="Logo SMK Al-Madani Pontianak"
                                    className="h-full w-full object-contain filter drop-shadow-xs transition-transform duration-300 hover:scale-105"
                                    loading="eager"
                                />
                                {/* Active Indicator Dot */}
                                <span className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 flex h-3 w-3 sm:h-3.5 sm:w-3.5">
                                    <span className="relative inline-flex rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 bg-emerald-500 border-2 border-white dark:border-[#0F1B36]"></span>
                                </span>
                            </div>

                            <div className="flex flex-col gap-1 sm:gap-1.5 min-w-0">
                                {/* Kicker Metadata Strip */}
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-md border border-royal-blue/20 dark:border-sky-400/25 bg-royal-blue/5 dark:bg-sky-400/10 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-royal-blue dark:text-sky-300">
                                        SMK Al-Madani Pontianak
                                    </span>

                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 dark:bg-emerald-500/15 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <StatusDot color="emerald" size="xs" />
                                        Sistem Aktif
                                    </span>

                                    {currentTime && (
                                        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-0.5 text-[9px] sm:text-[10px] font-mono font-medium text-slate-700 dark:text-slate-200">
                                            <span className="material-symbols-outlined text-[12px] text-royal-blue dark:text-sky-400">
                                                schedule
                                            </span>
                                            <span>{currentTime} WIB</span>
                                        </span>
                                    )}

                                    <span className="hidden sm:inline-flex rounded-md bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[9px] sm:text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                        {timezone || 'Asia/Jakarta'}
                                    </span>
                                </div>

                                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight leading-snug truncate">
                                    {greetingText}, {user?.name ? user.name.split(' ')[0] : 'Administrator'}
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-2 sm:line-clamp-none">
                                    Monitoring kehadiran pengajar &amp; analisis verifikasi FaceNet + EMAR · <span className="font-medium text-slate-700 dark:text-slate-300">{todayFormatted}</span>
                                </p>
                            </div>
                        </div>

                        {/* Right: Quick Action Buttons (Touch-Optimized for all viewports) */}
                        <div className="flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto pt-1 sm:pt-0">
                            <Link
                                href={route('presensi')}
                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-[#11274C] hover:bg-[#1B3663] text-white dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 font-semibold px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm shadow-xs transition-colors active:scale-[0.98]"
                            >
                                <span className="material-symbols-outlined text-[19px] sm:text-[21px]">
                                    photo_camera
                                </span>
                                <span>Mulai Presensi</span>
                            </Link>

                            <button
                                type="button"
                                onClick={handleReload}
                                disabled={isRefreshing}
                                className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-semibold text-slate-700 dark:text-white shadow-xs hover:bg-slate-50 dark:hover:bg-white/10 active:scale-95 transition-colors disabled:opacity-60"
                                title="Segarkan Data Dashboard"
                            >
                                <span className={`material-symbols-outlined text-[19px] text-slate-500 dark:text-slate-400 ${isRefreshing ? 'animate-spin text-royal-blue dark:text-sky-400' : ''}`}>
                                    sync
                                </span>
                                <span className="hidden sm:inline">{isRefreshing ? 'Memuat...' : 'Refresh'}</span>
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* ======================================================== */}
                {/* BIOMETRIC ONBOARDING BANNER (If Teacher not enrolled)   */}
                {/* ======================================================== */}
                {user?.role === 'teacher' && !user?.embedding_id && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-5 sm:mb-6 overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-4 sm:p-5 shadow-xs"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3.5 sm:gap-4">
                                <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                    <span className="material-symbols-outlined text-[22px] sm:text-[24px]">face</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                            Wajib Dilakukan
                                        </span>
                                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                                            Pendaftaran Biometrik Wajah Belum Selesai
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
                                        Wajah Anda belum terdaftar di sistem FaceNet. Lakukan enrollment wajah sekarang agar Anda dapat melakukan presensi kehadiran melalui kamera secara otomatis.
                                    </p>
                                </div>
                            </div>

                            <Link
                                href={route('teacher.enrollment')}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 dark:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-95 transition-all"
                            >
                                <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                                <span>Daftarkan Wajah Sekarang</span>
                            </Link>
                        </div>
                    </motion.div>
                )}

                {/* ======================================================== */}
                {/* 2. STATS OVERVIEW BENTO GRID (Responsive 2x2 to 4x1)     */}
                {/* ======================================================== */}
                <div className="mb-5 sm:mb-6">
                    {/* Overall Progress Rate Bar with Modern Glass Finish */}
                    <div className="mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-white">
                                Rasio Kehadiran Pengajar Hari Ini
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-extrabold px-2 py-0.5 shadow-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <AnimatedCounter value={attendanceRate} />% Tercatat
                            </span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {totalPresent + totalLate + totalDispensasi} dari {totalTeachers} subjek guru hadir &amp; terverifikasi
                        </span>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10 mb-4 p-0.5 border border-slate-200/50 dark:border-white/5">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${attendanceRate}%` }}
                            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full rounded-full bg-emerald-500 shadow-xs"
                        />
                    </div>

                    {/* 2x2 on mobile (xs/sm), 4 columns on desktop (lg) */}
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 md:gap-4"
                    >
                        {/* 1. Hadir Tepat Waktu */}
                        <SpotlightBentoCard statusColor="emerald">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block truncate">
                                            Hadir Tepat
                                        </span>
                                    </div>
                                    <div className="mt-1 sm:mt-1.5 flex items-baseline gap-1.5">
                                        <span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                                            <AnimatedCounter value={totalPresent} />
                                        </span>
                                        <span className="text-[10px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400">Guru</span>
                                    </div>
                                </div>
                                <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                                    <span
                                        className="material-symbols-outlined text-[20px] sm:text-[24px]"
                                        style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                        how_to_reg
                                    </span>
                                </div>
                            </div>

                            <div className="mt-3 sm:mt-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-2 sm:pt-2.5 text-[10px] sm:text-[11px] text-emerald-700 dark:text-emerald-400">
                                <span className="truncate flex items-center gap-1 font-medium">
                                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"></span>
                                    FaceNet + EMAR
                                </span>
                                <span className="font-bold shrink-0 ml-1 hidden sm:inline">Sebelum 07.15</span>
                            </div>
                        </SpotlightBentoCard>

                        {/* 2. Terlambat */}
                        <SpotlightBentoCard statusColor="amber">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block truncate">
                                            Terlambat
                                        </span>
                                    </div>
                                    <div className="mt-1 sm:mt-1.5 flex items-baseline gap-1.5">
                                        <span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                                            <AnimatedCounter value={totalLate} />
                                        </span>
                                        <span className="text-[10px] sm:text-xs font-semibold text-amber-600 dark:text-amber-400">Guru</span>
                                    </div>
                                </div>
                                <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                                    <span
                                        className="material-symbols-outlined text-[20px] sm:text-[24px]"
                                        style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                        schedule
                                    </span>
                                </div>
                            </div>

                            <div className="mt-3 sm:mt-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-2 sm:pt-2.5 text-[10px] sm:text-[11px] text-amber-700 dark:text-amber-400">
                                <span className="truncate font-medium">Toleransi Masuk</span>
                                <span className="font-bold shrink-0 ml-1">07.16 – 08.00</span>
                            </div>
                        </SpotlightBentoCard>

                        {/* 3. Dispensasi Izin / Sakit */}
                        <SpotlightBentoCard statusColor="purple">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 block truncate">
                                            Dispensasi
                                        </span>
                                    </div>
                                    <div className="mt-1 sm:mt-1.5 flex items-baseline gap-1.5">
                                        <span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                                            <AnimatedCounter value={totalDispensasi} />
                                        </span>
                                        <span className="text-[10px] sm:text-xs font-semibold text-purple-600 dark:text-purple-400">Guru</span>
                                    </div>
                                </div>
                                <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
                                    <span className="material-symbols-outlined text-[20px] sm:text-[24px]">
                                        clinical_notes
                                    </span>
                                </div>
                            </div>

                            <div className="mt-3 sm:mt-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-2 sm:pt-2.5 text-[10px] sm:text-[11px] text-purple-700 dark:text-purple-400">
                                <span className="truncate font-medium">{totalIzin} Izin • {totalSakit} Sakit</span>
                                <span className="font-bold shrink-0 ml-1 hidden sm:inline">Surat Resmi</span>
                            </div>
                        </SpotlightBentoCard>

                        {/* 4. Belum Hadir / Standby */}
                        <SpotlightBentoCard statusColor="slate">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block truncate">
                                            Belum Hadir
                                        </span>
                                    </div>
                                    <div className="mt-1 sm:mt-1.5 flex items-baseline gap-1.5">
                                        <span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                                            <AnimatedCounter value={totalAbsent} />
                                        </span>
                                        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400">Guru</span>
                                    </div>
                                </div>
                                <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/10 group-hover:scale-105 transition-transform">
                                    <span className="material-symbols-outlined text-[20px] sm:text-[24px]">person_off</span>
                                </div>
                            </div>

                            <div className="mt-3 sm:mt-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-2 sm:pt-2.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="truncate font-medium">{totalFailed > 0 ? `${totalFailed} Anomali Log` : 'Standby Sistem'}</span>
                                <span className="font-bold shrink-0 ml-1">S01 – S18</span>
                            </div>
                        </SpotlightBentoCard>
                    </motion.div>
                </div>

                {/* ======================================================== */}
                {/* 3. PRE-FLIGHT SESSION PARAMETER DOCK (30 CM Skenario)    */}
                {/* ======================================================== */}
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-5 sm:mb-7 overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] shadow-xs"
                >
                    {/* Header Bar with Quick Summary & Collapse Toggle */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-slate-50/70 dark:bg-white/[0.02] border-b border-slate-200/60 dark:border-white/5">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-[#11274C] dark:bg-sky-500/20 text-white dark:text-sky-300 shadow-xs">
                                <span className="material-symbols-outlined text-[20px] sm:text-[22px]">tune</span>
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
                                        Studio Presensi &amp; Skenario Uji
                                    </h3>
                                    <span className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold ${
                                        selectedDistance === 30
                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                            : selectedDistance === 45
                                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                              : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                                    }`}>
                                        {selectedDistance} CM
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                                        [{selectedTeacher?.embedding_id || 'S01'}] {selectedTeacher?.name || 'Guru'}
                                    </span>
                                    <span>•</span>
                                    <span>{selectedDistance} cm</span>
                                    <span>•</span>
                                    <span>{luxValue} Lux</span>
                                    <span>•</span>
                                    <span>{sessionMode === 'TEST' ? 'Mode Uji (T)' : 'Mode Daftar (E)'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons: Responsive Layout for all screen widths */}
                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-1 sm:pt-0">
                            <button
                                type="button"
                                onClick={() => setIsStudioExpanded((prev) => !prev)}
                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-98 transition-all"
                            >
                                <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400">
                                    {isStudioExpanded ? 'expand_less' : 'tune'}
                                </span>
                                <span>{isStudioExpanded ? 'Tutup Parameter' : 'Ubah Parameter'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleLaunchStudio}
                                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl bg-[#11274C] hover:bg-[#1B3663] text-white dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                                <span>Buka Studio</span>
                            </button>
                        </div>
                    </div>

                    {/* Expandable Parameter Form Controls */}
                    <AnimatePresence>
                        {isStudioExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden border-t border-slate-200/60 dark:border-white/5"
                            >
                                <div className="p-4 sm:p-5 flex flex-col gap-4">
                                    <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                        {/* 1. Claimed ID (S01 - S18) */}
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                                                <span>1. ID Subjek (Claimed ID)</span>
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">S01 - S18</span>
                                            </label>
                                            <div className="relative">
                                                <select
                                                    value={selectedSubjectId}
                                                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                                                    className="w-full min-h-[44px] appearance-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/80 px-3 py-2 sm:px-3.5 sm:py-2.5 pr-9 text-xs font-bold text-slate-900 dark:text-white focus:border-royal-blue dark:focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-royal-blue transition-all"
                                                >
                                                    {teachers.map((t: any) => (
                                                        <option key={t.id || t.embedding_id} value={t.embedding_id} className="dark:bg-slate-900">
                                                            [{t.embedding_id}] {t.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-3 text-[18px] text-slate-400">
                                                    expand_more
                                                </span>
                                            </div>
                                        </div>

                                        {/* 2. Lux Meter Input */}
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                                                <span>2. Intensitas Cahaya (Lux)</span>
                                                <span className="text-[10px] text-royal-blue dark:text-sky-300 font-semibold">Sensor Lux</span>
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="10"
                                                    max="5000"
                                                    value={luxValue}
                                                    onChange={(e) => setLuxValue(Number(e.target.value))}
                                                    className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/80 px-3 py-2 sm:px-3.5 sm:py-2.5 pr-12 text-xs font-bold text-slate-900 dark:text-white focus:border-royal-blue dark:focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-royal-blue transition-all"
                                                    placeholder="Contoh: 300"
                                                />
                                                <span className="pointer-events-none absolute right-3 top-3 text-[11px] font-bold text-slate-400">
                                                    Lux
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1 mt-1">
                                                {[200, 250, 300, 350, 400].map((preset) => (
                                                    <button
                                                        key={preset}
                                                        type="button"
                                                        onClick={() => setLuxValue(preset)}
                                                        className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all ${
                                                            luxValue === preset
                                                                ? 'bg-royal-blue text-white shadow-xs'
                                                                : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {preset}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 3. Jarak Pengujian (30cm Baku, 45cm Sedang, 60cm Jauh) */}
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                                                <span>3. Jarak Pengujian</span>
                                                <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                                                    selectedDistance === 30
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                                                        : selectedDistance === 45
                                                          ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300'
                                                          : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300'
                                                }`}>
                                                    {selectedDistance} cm
                                                </span>
                                            </label>
                                            <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-slate-900/80 p-1 min-h-[44px] items-center">
                                                {[
                                                    { value: 30, label: '30 cm', sub: 'Baku', color: 'bg-emerald-600 dark:bg-emerald-600' },
                                                    { value: 45, label: '45 cm', sub: 'Sedang', color: 'bg-sky-600 dark:bg-sky-600' },
                                                    { value: 60, label: '60 cm', sub: 'Jauh', color: 'bg-purple-600 dark:bg-purple-600' },
                                                ].map((item) => (
                                                    <button
                                                        key={item.value}
                                                        type="button"
                                                        onClick={() => setSelectedDistance(item.value)}
                                                        className={`relative flex flex-col items-center justify-center rounded-lg py-1.5 px-1 text-center transition-colors ${
                                                            selectedDistance === item.value
                                                                ? 'text-white font-bold'
                                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                                                        }`}
                                                    >
                                                        {selectedDistance === item.value && (
                                                            <motion.div
                                                                layoutId="selectedDistancePill"
                                                                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                                                className={`absolute inset-0 rounded-lg shadow-xs ${item.color}`}
                                                            />
                                                        )}
                                                        <span className="relative z-10 text-xs leading-tight">{item.label}</span>
                                                        <span className="relative z-10 text-[9px] opacity-80 leading-none">{item.sub}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                                Preset pengujian: 30 cm (ideal), 45 cm (sedang), 60 cm (jauh).
                                            </span>
                                        </div>

                                        {/* 4. Mode Sesi (Session-E vs Session-T) */}
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                4. Mode Sesi
                                            </label>
                                            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-slate-900/80 p-1 min-h-[44px] items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => setSessionMode('TEST')}
                                                    className={`relative flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                                                        sessionMode === 'TEST'
                                                            ? 'text-white'
                                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                                    }`}
                                                >
                                                    {sessionMode === 'TEST' && (
                                                        <motion.div
                                                            layoutId="sessionModeActivePill"
                                                            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                                            className="absolute inset-0 rounded-lg bg-royal-blue dark:bg-sky-600 shadow-xs"
                                                        />
                                                    )}
                                                    <span className="relative z-10 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[15px]">how_to_reg</span>
                                                        <span>Uji (T)</span>
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSessionMode('ENROLLMENT')}
                                                    className={`relative flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                                                        sessionMode === 'ENROLLMENT'
                                                            ? 'text-white'
                                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                                    }`}
                                                >
                                                    {sessionMode === 'ENROLLMENT' && (
                                                        <motion.div
                                                            layoutId="sessionModeActivePill"
                                                            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                                            className="absolute inset-0 rounded-lg bg-royal-blue dark:bg-sky-600 shadow-xs"
                                                        />
                                                    )}
                                                    <span className="relative z-10 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[15px]">add_a_photo</span>
                                                        <span>Daftar (E)</span>
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* ======================================================== */}
                {/* 3. MAIN DASHBOARD CONTENT (Bento Grid: Feed + Widgets)   */}
                {/* ======================================================== */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-7">
                    {/* ---------------------------------------------------- */}
                    {/* LEFT AREA: Live Activity Feed (8 Cols on Desktop)    */}
                    {/* ---------------------------------------------------- */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: 0.15 }}
                        className="flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] shadow-xs lg:col-span-8"
                    >
                        {/* Feed Header & Interactive Controls */}
                        <div className="flex flex-col gap-3.5 border-b border-slate-200/60 dark:border-white/5 p-3.5 sm:p-5 bg-white dark:bg-[#0F1B36]">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-blue/10 dark:bg-sky-500/20 text-royal-blue dark:text-sky-400 shadow-xs">
                                        <span className="material-symbols-outlined text-[22px]">
                                            {feedTab === 'presensi' ? 'format_list_bulleted' : 'browse_activity'}
                                        </span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                                                {feedTab === 'presensi'
                                                    ? 'Aktivitas Verifikasi Presensi'
                                                    : 'Log Aktivitas Guru & Sistem'}
                                            </h3>
                                            {feedTab === 'presensi' && (
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 px-2.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 shadow-xs">
                                                    <BreathingBeacon color="emerald" size="xs" />
                                                    LIVE FEED
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                                            {feedTab === 'presensi'
                                                ? 'Log kehadiran & hasil verifikasi biometrik FaceNet + EMAR'
                                                : 'Riwayat pendaftaran enrollment wajah, login, dan audit data guru'}
                                        </p>
                                    </div>
                                </div>

                                {/* Action Buttons Toolbar (Responsive Row) */}
                                <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto flex-wrap">
                                    {/* Download CSV Latest Subject */}
                                    <a
                                        href={route('attendance.export.latest')}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1.5 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors shadow-xs"
                                        title="Unduh CSV data subjek yang barusan presensi"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">download</span>
                                        <span className="hidden sm:inline">CSV Terakhir</span>
                                    </a>

                                    <Link
                                        href={route('attendance.history')}
                                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <span>Pusat Riwayat</span>
                                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                    </Link>

                                    {/* More Options Dropdown */}
                                    {((recent_history && recent_history.length > 0) || (recent_activities && recent_activities.length > 0)) && (
                                        <div className="relative" ref={moreMenuRef}>
                                            <button
                                                type="button"
                                                onClick={() => setMoreMenuOpen((v) => !v)}
                                                className={`inline-flex items-center justify-center h-8 w-8 rounded-xl border transition-all active:scale-95 shadow-xs ${
                                                    moreMenuOpen
                                                        ? 'border-royal-blue/40 dark:border-sky-400/40 bg-royal-blue/10 dark:bg-sky-500/15 text-royal-blue dark:text-sky-300'
                                                        : 'border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                                                }`}
                                                title="Opsi lainnya"
                                                aria-label="Opsi lainnya"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">more_vert</span>
                                            </button>

                                            <AnimatePresence>
                                                {moreMenuOpen && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                                        transition={{ duration: 0.15, ease: 'easeOut' }}
                                                        className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#13203F] shadow-xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl overflow-hidden"
                                                    >
                                                        <div className="p-1.5">
                                                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                                Opsi Lanjutan
                                                            </div>

                                                            {feedTab === 'presensi' && recent_history && recent_history.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setMoreMenuOpen(false);
                                                                        handleOpenHideModal();
                                                                    }}
                                                                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                                                                >
                                                                    <span className="material-symbols-outlined text-[17px]">visibility_off</span>
                                                                    <div className="flex flex-col text-left">
                                                                        <span>Sembunyikan Hari Ini</span>
                                                                        <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">Sembunyikan entri dari dashboard</span>
                                                                    </div>
                                                                </button>
                                                            )}

                                                            <div className="mx-2.5 my-1 h-px bg-slate-200/60 dark:bg-white/5"></div>

                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setMoreMenuOpen(false);
                                                                    setModalError(null);
                                                                    setClearConfirmationChecked(false);
                                                                    setIsClearAllModalOpen(true);
                                                                }}
                                                                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[17px]">delete_sweep</span>
                                                                <div className="flex flex-col text-left">
                                                                    <span>Hapus Semua Aktivitas</span>
                                                                    <span className="text-[10px] font-normal text-rose-600/70 dark:text-rose-400/70">Penghapusan permanen seluruh data</span>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Feed Mode Selector & Search / Category Tabs */}
                            <div className="flex flex-col gap-2.5 pt-1">
                                {/* Top Tab Switcher: Presensi vs Audit Activity */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="grid grid-cols-2 sm:inline-flex rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/30 p-1 text-xs w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={() => setFeedTab('presensi')}
                                            className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-colors ${
                                                feedTab === 'presensi'
                                                    ? 'text-white'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            {feedTab === 'presensi' && (
                                                <motion.div
                                                    layoutId="feedActiveTabPill"
                                                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                                    className="absolute inset-0 rounded-lg bg-royal-blue dark:bg-sky-600 shadow-xs"
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                                                <span>Presensi</span>
                                                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-mono font-bold">
                                                    {filteredHistory.length}
                                                </span>
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFeedTab('audit')}
                                            className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-colors ${
                                                feedTab === 'audit'
                                                    ? 'text-white'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            {feedTab === 'audit' && (
                                                <motion.div
                                                    layoutId="feedActiveTabPill"
                                                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                                    className="absolute inset-0 rounded-lg bg-royal-blue dark:bg-sky-600 shadow-xs"
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px]">history_edu</span>
                                                <span>Log Aktivitas</span>
                                                {recent_activities && recent_activities.length > 0 && (
                                                    <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-mono font-bold">
                                                        {recent_activities.length}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Search Bar */}
                                    <div className="relative w-full sm:w-64">
                                        <span className="material-symbols-outlined absolute left-3 top-2 sm:top-2.5 text-[18px] text-slate-400">
                                            search
                                        </span>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder={feedTab === 'presensi' ? 'Cari nama guru / status...' : 'Cari log aktivitas...'}
                                            className="w-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/60 px-3 py-1.5 pl-9 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-royal-blue dark:focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-royal-blue transition-all"
                                        />
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery('')}
                                                className="absolute right-2.5 top-1.5 sm:top-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">close</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Status Sub-Filter with Counts & Icons (Only for Presensi Tab) */}
                                {feedTab === 'presensi' && (
                                    <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/30 p-1 text-xs scrollbar-none w-full sm:w-auto">
                                        {[
                                            { id: 'ALL', label: 'Semua', count: statusCounts.ALL, icon: 'apps' },
                                            { id: 'HADIR', label: 'Hadir', count: statusCounts.HADIR, icon: 'check_circle' },
                                            { id: 'TERLAMBAT', label: 'Terlambat', count: statusCounts.TERLAMBAT, icon: 'schedule' },
                                            { id: 'PULANG', label: 'Pulang', count: statusCounts.PULANG, icon: 'logout' },
                                            { id: 'IZIN_SAKIT', label: 'Izin/Sakit', count: statusCounts.IZIN_SAKIT, icon: 'clinical_notes' },
                                            { id: 'GAGAL', label: 'Ditolak', count: statusCounts.GAGAL, icon: 'cancel' },
                                        ].map((tab) => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setStatusFilter(tab.id as any)}
                                                className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                                                    statusFilter === tab.id
                                                        ? 'text-white shadow-xs'
                                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5'
                                                }`}
                                            >
                                                {statusFilter === tab.id && (
                                                    <motion.div
                                                        layoutId="statusActiveFilterPill"
                                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                                        className="absolute inset-0 rounded-lg bg-royal-blue dark:bg-sky-600 shadow-xs"
                                                    />
                                                )}
                                                <span className="relative z-10 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[13px]">{tab.icon}</span>
                                                    <span>{tab.label}</span>
                                                    <span
                                                        className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                                                            statusFilter === tab.id
                                                                ? 'bg-white/20 text-white'
                                                                : 'bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                                                        }`}
                                                    >
                                                        {tab.count}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Activity List Body */}
                        <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col gap-2.5 max-h-[580px] min-h-[360px]">
                            <AnimatePresence mode="popLayout">
                                {feedTab === 'presensi' ? (
                                    filteredHistory.length > 0 ? (
                                        filteredHistory.map((item: any, idx: number) => {
                                            const statusStr = (item.status || '').toLowerCase();
                                            const isLate = statusStr === 'terlambat';
                                            const isPresent = statusStr === 'success' || statusStr === 'hadir';
                                            const isPulang = statusStr === 'pulang';
                                            const isIzin = statusStr === 'izin';
                                            const isSakit = statusStr === 'sakit';
                                            const statusGlowColor = isPresent
                                                ? 'rgba(16, 185, 129, 0.22)'
                                                : isLate
                                                ? 'rgba(245, 158, 11, 0.22)'
                                                : isSakit || isIzin
                                                ? 'rgba(168, 85, 247, 0.22)'
                                                : isPulang
                                                ? 'rgba(14, 165, 233, 0.22)'
                                                : 'rgba(244, 63, 94, 0.22)';

                                            return (
                                                <motion.div
                                                    key={item.id || idx}
                                                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                        scale: 1,
                                                        boxShadow: idx === 0
                                                            ? [`0 0 0 0 ${statusGlowColor}`, `0 0 24px 3px ${statusGlowColor}`, '0 0 0 0 rgba(0,0,0,0)']
                                                            : 'none',
                                                    }}
                                                    exit={{ opacity: 0, scale: 0.96 }}
                                                    transition={{
                                                        duration: 0.35,
                                                        delay: Math.min(idx * 0.03, 0.25),
                                                        ease: [0.16, 1, 0.3, 1],
                                                    }}
                                                    className="group relative shrink-0 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#0B1528] p-3 sm:p-4 hover:border-royal-blue/40 dark:hover:border-sky-400/40 hover:bg-slate-50/70 dark:hover:bg-[#111F3C] hover:shadow-xs transition-all overflow-hidden"
                                                >
                                                    {/* Left Status Accent Bar */}
                                                    <div
                                                        className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                                                            isSakit
                                                                ? 'bg-purple-500'
                                                                : isIzin
                                                                ? 'bg-amber-500'
                                                                : isPulang
                                                                ? 'bg-sky-500'
                                                                : isPresent
                                                                ? 'bg-emerald-500'
                                                                : isLate
                                                                ? 'bg-amber-500'
                                                                : 'bg-rose-500'
                                                        }`}
                                                    />

                                                    {/* MOBILE VIEW (< 640px) */}
                                                    <div className="flex flex-col gap-2.5 sm:hidden pl-2">
                                                        {/* Top Row: Avatar + Name + ID + Status Chip */}
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <div className="relative shrink-0">
                                                                    <div
                                                                        className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-xs border shadow-xs ${
                                                                            isSakit
                                                                                ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-500/20'
                                                                                : isIzin
                                                                                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-500/20'
                                                                                : isPulang
                                                                                ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-500/20'
                                                                                : isPresent
                                                                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-500/20'
                                                                                : isLate
                                                                                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-500/20'
                                                                                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-500/20'
                                                                        }`}
                                                                    >
                                                                        {item.teacher?.name
                                                                            ? item.teacher.name.substring(0, 2).toUpperCase()
                                                                            : 'GU'}
                                                                    </div>
                                                                    <span
                                                                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#0B1528] ${
                                                                            isSakit
                                                                                ? 'bg-purple-500'
                                                                                : isIzin
                                                                                ? 'bg-amber-500'
                                                                                : isPulang
                                                                                ? 'bg-sky-500'
                                                                                : isPresent
                                                                                ? 'bg-emerald-500'
                                                                                : isLate
                                                                                ? 'bg-amber-500'
                                                                                : 'bg-rose-500'
                                                                        }`}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                                            {item.teacher?.name || 'Guru Tidak Dikenal'}
                                                                        </span>
                                                                        {item.teacher?.embedding_id && (
                                                                            <span className="shrink-0 rounded px-1 py-0.2 font-mono text-[9px] font-bold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10">
                                                                                {item.teacher.embedding_id}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Status Badge */}
                                                            <div
                                                                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border shadow-xs ${
                                                                    isSakit
                                                                        ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-500/15 dark:border-purple-500/30 dark:text-purple-300'
                                                                        : isIzin
                                                                        ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300'
                                                                        : isPulang
                                                                        ? 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-500/15 dark:border-sky-500/30 dark:text-sky-300'
                                                                        : isPresent
                                                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300'
                                                                        : isLate
                                                                        ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300'
                                                                        : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-300'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-[13px]">
                                                                    {isSakit
                                                                        ? 'medical_services'
                                                                        : isIzin
                                                                        ? 'event_note'
                                                                        : isPulang
                                                                        ? 'logout'
                                                                        : isPresent
                                                                        ? 'check_circle'
                                                                        : isLate
                                                                        ? 'warning'
                                                                        : 'cancel'}
                                                                </span>
                                                                <span className="capitalize">{item.status || 'Hadir'}</span>
                                                            </div>
                                                        </div>

                                                        {/* Description */}
                                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                                            {item.description || (isSakit ? 'Surat Keterangan Sakit Guru' : isIzin ? 'Dispensasi Izin Guru' : 'Verifikasi presensi')}
                                                        </span>

                                                        {/* Bottom Row: Time + CSV Download + Delete */}
                                                        <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-2 text-[10px] text-slate-500 dark:text-slate-400">
                                                            <div className="flex items-center gap-1.5 font-mono">
                                                                <span className="material-symbols-outlined text-[13px] text-slate-400">schedule</span>
                                                                <span className="font-bold text-slate-800 dark:text-slate-200">{item.time || '-'}</span>
                                                                {item.date_badge && <span>• {item.date_badge}</span>}
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <a
                                                                    href={route('attendance.export.subject', item.id)}
                                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
                                                                    title={`Unduh CSV ${item.teacher?.name || 'Subjek'}`}
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">download</span>
                                                                    <span>CSV</span>
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => promptDeleteRecord(item)}
                                                                    className="inline-flex items-center justify-center h-6 w-6 rounded-lg border border-rose-200/80 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                                                                    title={`Hapus data presensi ${item.teacher?.name || 'Subjek'}`}
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">delete</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* DESKTOP VIEW (>= 640px) */}
                                                    <div className="hidden sm:flex items-center justify-between gap-4 pl-2.5">
                                                        {/* Teacher Avatar & Info */}
                                                        <div className="flex items-center gap-3.5 min-w-0">
                                                            <div className="relative shrink-0">
                                                                <div
                                                                    className={`flex h-11 w-11 items-center justify-center rounded-2xl font-bold text-xs border shadow-xs transition-transform group-hover:scale-105 ${
                                                                        isSakit
                                                                            ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-500/20'
                                                                            : isIzin
                                                                            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-500/20'
                                                                            : isPulang
                                                                            ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-500/20'
                                                                            : isPresent
                                                                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-500/20'
                                                                            : isLate
                                                                            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-500/20'
                                                                            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-500/20'
                                                                    }`}
                                                                >
                                                                    {item.teacher?.name
                                                                        ? item.teacher.name.substring(0, 2).toUpperCase()
                                                                        : 'GU'}
                                                                </div>
                                                                <span
                                                                    className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#0B1528] ${
                                                                        isSakit
                                                                            ? 'bg-purple-500'
                                                                            : isIzin
                                                                            ? 'bg-amber-500'
                                                                            : isPulang
                                                                            ? 'bg-sky-500'
                                                                            : isPresent
                                                                            ? 'bg-emerald-500'
                                                                            : isLate
                                                                            ? 'bg-amber-500'
                                                                            : 'bg-rose-500'
                                                                    }`}
                                                                />
                                                            </div>

                                                            <div className="flex flex-col min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                                        {item.teacher?.name || 'Guru Tidak Dikenal'}
                                                                    </span>
                                                                    {item.teacher?.embedding_id && (
                                                                        <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10">
                                                                            {item.teacher.embedding_id}
                                                                        </span>
                                                                    )}
                                                                    {item.is_test_data && (
                                                                        <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                                                                            TEST
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                                    {item.description || (isSakit ? 'Surat Keterangan Sakit Guru' : isIzin ? 'Dispensasi Izin Guru' : 'Verifikasi presensi biometrik')}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Right: Time & Status Badge */}
                                                        <div className="flex items-center gap-3.5 shrink-0">
                                                            <div className="flex flex-col items-end text-right">
                                                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[13px] text-slate-400 dark:text-slate-500">schedule</span>
                                                                    {item.time || '-'}
                                                                </span>
                                                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                                                    {item.date_badge ? `${item.date_badge} • ` : ''}
                                                                    {isSakit
                                                                        ? 'Sakit (Dokter)'
                                                                        : isIzin
                                                                        ? 'Izin Dinas'
                                                                        : isPulang
                                                                        ? 'Presensi Pulang'
                                                                        : isPresent
                                                                        ? 'FaceNet + EMAR ✓'
                                                                        : isLate
                                                                        ? 'Terlambat'
                                                                        : 'Gagal / Ditolak'}
                                                                </span>
                                                            </div>

                                                            <div
                                                                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border shadow-xs ${
                                                                    isSakit
                                                                        ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-500/15 dark:border-purple-500/30 dark:text-purple-300'
                                                                        : isIzin
                                                                        ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300'
                                                                        : isPulang
                                                                        ? 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-500/15 dark:border-sky-500/30 dark:text-sky-300'
                                                                        : isPresent
                                                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300'
                                                                        : isLate
                                                                        ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300'
                                                                        : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-300'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">
                                                                    {isSakit
                                                                        ? 'medical_services'
                                                                        : isIzin
                                                                        ? 'event_note'
                                                                        : isPulang
                                                                        ? 'logout'
                                                                        : isPresent
                                                                        ? 'check_circle'
                                                                        : isLate
                                                                        ? 'warning'
                                                                        : 'cancel'}
                                                                </span>
                                                                <span className="capitalize">{item.status || 'Hadir'}</span>
                                                            </div>

                                                            <a
                                                                href={route('attendance.export.subject', item.id)}
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-royal-blue dark:hover:text-sky-400 hover:bg-royal-blue/5 dark:hover:bg-sky-500/10 hover:border-royal-blue/30 dark:hover:border-sky-400/30 transition-all shadow-xs"
                                                                title={`Unduh CSV data presensi ${item.teacher?.name || 'Subjek'}`}
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">download</span>
                                                            </a>

                                                            <button
                                                                type="button"
                                                                onClick={() => promptDeleteRecord(item)}
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200/80 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 hover:border-rose-300 dark:hover:border-rose-500/50 transition-all shadow-xs"
                                                                title={`Hapus data presensi ${item.teacher?.name || 'Subjek'}`}
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">delete</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-center">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 mb-3 border border-slate-200/60 dark:border-white/10">
                                                <span className="material-symbols-outlined text-[24px]">inbox</span>
                                            </div>
                                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Tidak ada aktivitas presensi</h4>
                                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                                                {searchQuery || statusFilter !== 'ALL'
                                                    ? 'Tidak ada log presensi yang cocok dengan filter.'
                                                    : 'Belum ada data presensi guru yang tercatat.'}
                                            </p>
                                        </div>
                                    )
                                ) : (
                                    /* AUDIT LOG & TEACHER ACTIVITIES STREAM */
                                    filteredActivities.length > 0 ? (
                                        filteredActivities.map((act: any, idx: number) => {
                                            const isEnrollment = act.event === 'biometric_enrollment' || (act.description || '').toLowerCase().includes('mendaftarkan wajah');
                                            const isAttendance = act.event === 'attendance' || (act.description || '').toLowerCase().includes('presensi');
                                            const isLogin = act.event === 'login_success' || (act.description || '').toLowerCase().includes('login');
                                            const actGlowColor = isEnrollment
                                                ? 'rgba(168, 85, 247, 0.22)'
                                                : isAttendance
                                                ? 'rgba(16, 185, 129, 0.22)'
                                                : isLogin
                                                ? 'rgba(14, 165, 233, 0.22)'
                                                : 'rgba(100, 116, 139, 0.18)';

                                            return (
                                                <motion.div
                                                    key={act.id || idx}
                                                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                        scale: 1,
                                                        boxShadow: idx === 0
                                                            ? [`0 0 0 0 ${actGlowColor}`, `0 0 24px 3px ${actGlowColor}`, '0 0 0 0 rgba(0,0,0,0)']
                                                            : 'none',
                                                    }}
                                                    exit={{ opacity: 0, scale: 0.96 }}
                                                    transition={{
                                                        duration: 0.35,
                                                        delay: Math.min(idx * 0.03, 0.25),
                                                        ease: [0.16, 1, 0.3, 1],
                                                    }}
                                                    className="group relative shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#0B1528] p-3.5 sm:p-4 hover:border-royal-blue/40 dark:hover:border-sky-400/40 hover:bg-slate-50/70 dark:hover:bg-[#111F3C] hover:shadow-xs transition-all overflow-hidden"
                                                >
                                                    <div
                                                        className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                                                            isEnrollment
                                                                ? 'bg-purple-500'
                                                                : isAttendance
                                                                  ? 'bg-emerald-500'
                                                                  : isLogin
                                                                    ? 'bg-sky-500'
                                                                    : 'bg-slate-400'
                                                        }`}
                                                    />

                                                    <div className="flex items-center gap-3 pl-2.5 min-w-0">
                                                        <div
                                                            className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl ${
                                                                isEnrollment
                                                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                                                    : isAttendance
                                                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                                      : isLogin
                                                                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                                                                        : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/10'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                                                                {isEnrollment ? 'add_a_photo' : isAttendance ? 'how_to_reg' : isLogin ? 'login' : 'history'}
                                                            </span>
                                                        </div>

                                                        <div className="flex flex-col min-w-0">
                                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                                                    {act.causer_name || 'Pengguna'}
                                                                </span>
                                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider border ${
                                                                    isEnrollment
                                                                        ? 'bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300'
                                                                        : isAttendance
                                                                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                                          : 'bg-slate-100 dark:bg-white/10 border-slate-200/60 dark:border-white/10 text-slate-600 dark:text-slate-300'
                                                                }`}>
                                                                    {isEnrollment ? 'Enrollment' : isAttendance ? 'Presensi' : isLogin ? 'Login' : act.event}
                                                                </span>
                                                            </div>
                                                            <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                                                {act.description}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between sm:justify-end gap-3 pl-2.5 sm:pl-0 shrink-0">
                                                        <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                                            {act.created_at_human || `${act.date} ${act.time}`}
                                                        </span>

                                                        <button
                                                            type="button"
                                                            onClick={() => promptDeleteActivity(act)}
                                                            className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl border border-rose-200/80 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 hover:border-rose-300 dark:hover:border-rose-500/50 transition-all shadow-xs"
                                                            title="Hapus log aktivitas ini"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px] sm:text-[15px]">delete</span>
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            );
                                        })
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 text-center">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 mb-3 border border-slate-200/60 dark:border-white/10">
                                                <span className="material-symbols-outlined text-[24px]">history</span>
                                            </div>
                                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Tidak ada log aktivitas</h4>
                                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                                                {searchQuery
                                                    ? 'Tidak ada log aktivitas yang cocok dengan pencarian.'
                                                    : 'Belum ada aktivitas guru atau sistem yang tercatat.'}
                                            </p>
                                        </div>
                                    )
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Feed Footer Navigation & Counter */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200/70 dark:border-white/[0.08] px-4 py-3 sm:px-5 bg-slate-50/70 dark:bg-[#0B1528]/60 text-xs rounded-b-2xl sm:rounded-b-3xl">
                            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px] self-start sm:self-auto">
                                <span className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-400">query_stats</span>
                                <span>
                                    {feedTab === 'presensi' ? (
                                        <>
                                            Menampilkan <strong className="font-semibold text-slate-800 dark:text-slate-200">{filteredHistory.length}</strong> dari <strong className="font-semibold text-slate-800 dark:text-slate-200">{recent_history?.length || 0}</strong> presensi hari ini
                                        </>
                                    ) : (
                                        <>
                                            Menampilkan <strong className="font-semibold text-slate-800 dark:text-slate-200">{filteredActivities.length}</strong> dari <strong className="font-semibold text-slate-800 dark:text-slate-200">{recent_activities?.length || 0}</strong> log aktivitas
                                        </>
                                    )}
                                </span>
                            </div>
                            <Link
                                href={route('attendance.history')}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-bold text-royal-blue dark:text-sky-400 hover:bg-royal-blue/5 dark:hover:bg-sky-500/10 hover:border-royal-blue/30 dark:hover:border-sky-400/30 transition-all group shadow-xs"
                            >
                                <span>Buka Riwayat &amp; Ekspor PDF</span>
                                <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">
                                    arrow_forward
                                </span>
                            </Link>
                        </div>
                    </motion.div>

                    {/* ---------------------------------------------------- */}
                    {/* RIGHT AREA: SOP Timeline, Quick Actions, Telemetry   */}
                    {/* Responsive: 1-col mobile, 2-col tablet, 1-col desktop*/}
                    {/* ---------------------------------------------------- */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5 lg:col-span-4">
                        {/* 0. Standar Operasional Presensi Guru (SMK Al-Madani) Widget */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: 0.15 }}
                            className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs overflow-hidden"
                        >
                            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.08]">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10">
                                        <span className="material-symbols-outlined text-[18px]">school</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                            SOP Presensi SMK Al-Madani
                                        </h3>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                            Jadwal &amp; Status Operasional
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/[0.06] px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-white/10 shadow-xs">
                                        <BreathingBeacon color="emerald" size="xs" />
                                        <span>{currentTime || 'WIB'}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsSOPExpanded((v) => !v)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                        title={isSOPExpanded ? 'Ciutkan Jadwal SOP' : 'Buka Jadwal SOP'}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">
                                            {isSOPExpanded ? 'expand_less' : 'expand_more'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <AnimatePresence initial={false}>
                                {isSOPExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                        className="overflow-hidden"
                                    >
                                        {/* Current Active Status Pill */}
                                        <div className="mb-3.5 rounded-2xl bg-slate-50/80 dark:bg-white/[0.03] p-3 border border-slate-200/80 dark:border-white/[0.07]">
                                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                                                Sesi Saat Ini:
                                            </span>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                    {schedule_session?.session_title || 'Presensi Masuk (Tepat Waktu)'}
                                                </span>
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${
                                                    schedule_session?.status === 'HADIR'
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                        : schedule_session?.status === 'TERLAMBAT'
                                                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                                                        : schedule_session?.status === 'PULANG'
                                                        ? 'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300'
                                                        : schedule_session?.status === 'DITUTUP'
                                                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                        : 'bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300'
                                                }`}>
                                                    {schedule_session?.status_label || schedule_session?.status || 'AKTIF'}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                                <span>Rentang: <strong className="text-slate-900 dark:text-slate-100 font-mono">{schedule_session?.time_range || '06.30 – 07.15 WIB'}</strong></span>
                                                <span>Scanner: <strong className={schedule_session?.scanner_open !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{schedule_session?.scanner_open !== false ? 'Buka' : 'Tutup'}</strong></span>
                                            </div>
                                        </div>

                                        {/* Schedule Timeline */}
                                        <div className="relative pl-5 text-xs">
                                            {/* Vertical connector line */}
                                            <div className="absolute left-[9px] top-1 bottom-1 w-0.5 rounded-full bg-slate-200 dark:bg-white/10"></div>

                                            <div className="space-y-2.5">
                                                {(schedule_matrix || [
                                                    { session: 'Presensi Masuk (Tepat Waktu)', range: '06.30 – 07.15 WIB', status: 'HADIR', status_color: 'emerald', note: 'Guru hadir sebelum bel masuk / KBM dimulai.' },
                                                    { session: 'Batas Toleransi (Terlambat)', range: '07.16 – 08.00 WIB', status: 'TERLAMBAT', status_color: 'amber', note: 'Biometrik tetap ACCEPT, status terlambat.' },
                                                    { session: 'Batas Akhir Masuk (Ditutup)', range: '> 08.00 WIB', status: 'DITUTUP / ALPHA', status_color: 'rose', note: 'Scanner menolak masuk (lapor piket/TU).' },
                                                    { session: 'Presensi Pulang (Senin – Kamis)', range: '14.30 – 17.00 WIB', status: 'PULANG', status_color: 'sky', note: 'Dibuka setelah jam KBM terakhir selesai.' },
                                                    { session: 'Presensi Pulang (Jumat)', range: '11.30 – 14.00 WIB', status: 'PULANG', status_color: 'indigo', note: 'Penyesuaian waktu ibadah sholat Jumat.' },
                                                ]).map((item: any, idx: number) => {
                                                    const isActive = schedule_session?.session_title === item.session;
                                                    const dotColor =
                                                        item.status_color === 'emerald' ? 'bg-emerald-500' :
                                                        item.status_color === 'amber' ? 'bg-amber-500' :
                                                        item.status_color === 'rose' ? 'bg-rose-500' :
                                                        item.status_color === 'indigo' ? 'bg-indigo-500' :
                                                        'bg-sky-500';
                                                    const ringColor =
                                                        item.status_color === 'emerald' ? 'ring-emerald-500/25' :
                                                        item.status_color === 'amber' ? 'ring-amber-500/25' :
                                                        item.status_color === 'rose' ? 'ring-rose-500/25' :
                                                        item.status_color === 'indigo' ? 'ring-indigo-500/25' :
                                                        'ring-sky-500/25';

                                                    return (
                                                        <div key={idx} className="relative">
                                                            {/* Timeline dot */}
                                                            <div className={`absolute -left-5 top-2.5 flex items-center justify-center ${isActive ? 'h-5 w-5 -ml-[4px]' : 'h-3 w-3 -ml-[0px]'}`}>
                                                                <div className={`rounded-full ${dotColor} ${isActive ? 'h-3.5 w-3.5 ring-4 animate-pulse' : 'h-2.5 w-2.5'} ${isActive ? ringColor : ''} transition-all`}></div>
                                                            </div>

                                                            <div
                                                                className={`rounded-xl p-2 sm:p-2.5 transition-all ${
                                                                    isActive
                                                                        ? 'border border-sky-500/40 dark:border-sky-400/50 bg-sky-50/70 dark:bg-sky-500/15 shadow-xs ring-1 ring-royal-blue/15 dark:ring-sky-400/25'
                                                                        : 'border border-slate-200/60 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.02]'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between text-[11px] font-bold">
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        <span className={`truncate ${isActive ? 'text-royal-blue dark:text-sky-300' : 'text-slate-900 dark:text-white'}`}>
                                                                            {item.session}
                                                                        </span>
                                                                        {isActive && (
                                                                            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[8px] font-black text-emerald-700 dark:text-emerald-300 shadow-xs">
                                                                                <BreathingBeacon color="emerald" size="xs" />
                                                                                AKTIF
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className={`shrink-0 ml-1 rounded px-1.5 py-0.5 text-[9px] font-bold border ${
                                                                        item.status_color === 'emerald'
                                                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                                            : item.status_color === 'amber'
                                                                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                                                                            : item.status_color === 'rose'
                                                                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                            : 'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300'
                                                                    }`}>
                                                                        {item.status}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                                                    <span className="font-mono">{item.range}</span>
                                                                    <span className="text-[9px] font-sans truncate max-w-[130px] text-right opacity-80">{item.note}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        {/* 1. Quick Actions Bento Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: 0.2 }}
                            className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center gap-2.5 mb-3.5 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.08]">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10">
                                        <span className="material-symbols-outlined text-[18px]">bolt</span>
                                    </div>
                                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Aksi Cepat</h3>
                                </div>

                                <div className="flex flex-col gap-2 sm:gap-2.5">
                                    <Link
                                        href={route('presensi')}
                                        className="group flex items-center justify-between min-h-[44px] rounded-2xl bg-[#11274C] hover:bg-[#1B3663] dark:bg-sky-600 dark:hover:bg-sky-500 p-3.5 sm:p-4 text-white shadow-xs active:scale-[0.98] transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                                                <span className="material-symbols-outlined text-[20px]">document_scanner</span>
                                            </div>
                                            <div className="flex flex-col text-left min-w-0">
                                                <span className="text-xs sm:text-sm font-bold truncate">Halaman Presensi</span>
                                                <span className="text-[10px] sm:text-[11px] text-white/70 truncate">Kamera Real-time</span>
                                            </div>
                                        </div>
                                        <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:translate-x-1 shrink-0 ml-2">
                                            arrow_forward
                                        </span>
                                    </Link>

                                    {user?.role === 'admin' && (
                                        <Link
                                            href={route('admin.teachers.index')}
                                            className="group flex items-center justify-between min-h-[44px] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.03] p-3 sm:p-3.5 text-slate-900 dark:text-white hover:bg-slate-100/80 dark:hover:bg-white/[0.06] hover:border-slate-300 dark:hover:border-white/20 active:scale-[0.98] transition-all"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10">
                                                    <span className="material-symbols-outlined text-[18px]">group</span>
                                                </div>
                                                <div className="flex flex-col text-left min-w-0">
                                                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">Kelola Guru</span>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Direktori &amp; Status</span>
                                                </div>
                                            </div>
                                            <span className="material-symbols-outlined text-[18px] text-slate-400 dark:text-slate-500 transition-transform duration-200 group-hover:translate-x-1 shrink-0 ml-2">
                                                chevron_right
                                            </span>
                                        </Link>
                                    )}

                                    {(user?.role === 'admin' || user?.role === 'researcher') && (
                                        <Link
                                            href={route('admin.research-dataset')}
                                            className="group flex items-center justify-between min-h-[44px] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.03] p-3 sm:p-3.5 text-slate-900 dark:text-white hover:bg-slate-100/80 dark:hover:bg-white/[0.06] hover:border-slate-300 dark:hover:border-white/20 active:scale-[0.98] transition-all"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                                    <span className="material-symbols-outlined text-[18px]">science</span>
                                                </div>
                                                <div className="flex flex-col text-left min-w-0">
                                                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">Dataset Riset EMAR</span>
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Manifest &amp; Serangan PAI</span>
                                                </div>
                                            </div>
                                            <span className="material-symbols-outlined text-[18px] text-slate-400 dark:text-slate-500 transition-transform duration-200 group-hover:translate-x-1 shrink-0 ml-2">
                                                chevron_right
                                            </span>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        {/* 2. Biometric System Telemetry Widget */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: 0.25 }}
                            className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs"
                        >
                            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.08]">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[20px] text-slate-700 dark:text-slate-200">
                                        memory
                                    </span>
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Status Model</h3>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shadow-xs">
                                    <BreathingBeacon color="emerald" size="xs" />
                                    AKTIF
                                </span>
                            </div>

                            <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 dark:bg-white/[0.03] px-3 py-2.5 border border-slate-200/60 dark:border-white/[0.05]">
                                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">Fitur Wajah:</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">FaceNet 512-D</span>
                                </div>
                                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 dark:bg-white/[0.03] px-3 py-2.5 border border-slate-200/60 dark:border-white/[0.05]">
                                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">Liveness Test:</span>
                                    <span className="font-mono font-bold text-royal-blue dark:text-sky-300 text-xs">EMAR Aspect Ratio</span>
                                </div>
                                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 dark:bg-white/[0.03] px-3 py-2.5 border border-slate-200/60 dark:border-white/[0.05]">
                                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">Threshold L2:</span>
                                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">≤ 0.40 (Strict)</span>
                                </div>
                            </div>
                        </motion.div>

                        {/* 2.5 Multi-Distance Benchmark Evaluation Widget */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: 0.28 }}
                            className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs"
                        >
                            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.08]">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[20px] text-sky-600 dark:text-sky-400">
                                        straighten
                                    </span>
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                        Benchmark Jarak
                                    </h3>
                                </div>
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-white/5 px-2 py-0.5 text-[9px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                                    30 / 45 / 60 cm
                                </span>
                            </div>

                            <div className="space-y-2.5">
                                {[
                                    {
                                        key: 'd30',
                                        name: '30 cm (Baku)',
                                        total: distance_stats?.d30?.total ?? 0,
                                        accept: distance_stats?.d30?.accept ?? 0,
                                        badgeColor: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                                        barColor: 'bg-emerald-500',
                                    },
                                    {
                                        key: 'd45',
                                        name: '45 cm (Sedang)',
                                        total: distance_stats?.d45?.total ?? 0,
                                        accept: distance_stats?.d45?.accept ?? 0,
                                        badgeColor: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
                                        barColor: 'bg-sky-500',
                                    },
                                    {
                                        key: 'd60',
                                        name: '60 cm (Jauh)',
                                        total: distance_stats?.d60?.total ?? 0,
                                        accept: distance_stats?.d60?.accept ?? 0,
                                        badgeColor: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
                                        barColor: 'bg-purple-500',
                                    },
                                ].map((item) => {
                                    const acceptRate = item.total > 0 ? Math.round((item.accept / item.total) * 100) : 100;
                                    return (
                                        <div
                                            key={item.key}
                                            className="rounded-xl border border-slate-200/60 dark:border-white/[0.05] bg-slate-50/70 dark:bg-white/[0.02] p-2.5"
                                        >
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                                                    {item.name}
                                                </span>
                                                <span className={`rounded-md border px-1.5 py-0.2 text-[9px] font-mono font-bold ${item.badgeColor}`}>
                                                    {item.total > 0 ? `${acceptRate}% Pass` : 'Siap Uji'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-mono">
                                                <span>Sampel: {item.total} sesi</span>
                                                <span>Diterima: {item.accept}</span>
                                            </div>
                                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${item.barColor}`}
                                                    style={{ width: `${Math.min(100, Math.max(item.total > 0 ? acceptRate : 100, 8))}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>

                        {/* 3. System Tip / Environment Guide (Full Width on Tablet) */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: 0.3 }}
                            className="sm:col-span-2 lg:col-span-1 flex gap-3 rounded-2xl sm:rounded-3xl border border-amber-500/20 bg-amber-50/60 dark:bg-amber-950/20 p-4 sm:p-5 text-amber-900 dark:text-amber-200 shadow-xs"
                        >
                            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-200/60 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-500/20">
                                <span className="material-symbols-outlined text-[20px] sm:text-[22px]">lightbulb</span>
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                                    Rekomendasi Akurasi
                                </span>
                                <p className="text-[10px] sm:text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                                    Posisikan wajah tegak pada jarak benchmark <strong>30 cm</strong>, <strong>45 cm</strong>, atau <strong>60 cm</strong> dengan cahaya standar <strong>100 - 300 lux</strong> untuk verifikasi optimal.
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* ======================================================== */}
            {/* CONFIRM HIDE ACTIVITY MODAL (Preserved & Functional)     */}
            {/* ======================================================== */}
            <ConfirmHideActivityModal
                show={isHideModalOpen}
                onClose={() => setIsHideModalOpen(false)}
                previewData={previewData}
                onConfirm={handleConfirmHide}
                isLoading={isFetchingPreview || isCommittingHide}
                errorMessage={modalError}
            />

            {/* ======================================================== */}
            {/* SINGLE ITEM DELETE CONFIRMATION MODAL (Ultra-Fluid Danger)*/}
            {/* ======================================================== */}
            <AnimatePresence>
                {isSingleDeleteModalOpen && singleDeleteItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: 16 }}
                            transition={{ type: 'spring' as const, stiffness: 380, damping: 28 }}
                            className="w-full max-w-md overflow-hidden rounded-3xl border border-rose-500/30 bg-white dark:bg-[#0F1B36] p-5 sm:p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
                                    <span className="material-symbols-outlined text-[28px]">
                                        delete
                                    </span>
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                                        {singleDeleteType === 'record'
                                            ? 'Hapus Rekaman Presensi?'
                                            : 'Hapus Log Aktivitas?'}
                                    </h3>
                                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                        Tindakan ini permanen &amp; tidak dapat dibatalkan
                                    </p>
                                </div>
                            </div>

                            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 bg-slate-50 dark:bg-white/5 p-3.5 rounded-2xl border border-slate-200/70 dark:border-white/5 space-y-1.5">
                                {singleDeleteType === 'record' ? (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500 dark:text-slate-400">Guru:</span>
                                            <strong className="text-slate-900 dark:text-white">
                                                {singleDeleteItem.teacher?.name || singleDeleteItem.user?.name || 'Subjek Presensi'}
                                            </strong>
                                        </div>
                                        <div className="flex items-center justify-between font-mono text-[11px]">
                                            <span className="text-slate-500 dark:text-slate-400">Waktu &amp; Tanggal:</span>
                                            <span className="text-slate-700 dark:text-slate-300">
                                                {singleDeleteItem.time || singleDeleteItem.created_at || '-'} WIB ({singleDeleteItem.date_badge || singleDeleteItem.date || '-'})
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500 dark:text-slate-400">Status:</span>
                                            <span className="font-bold text-slate-900 dark:text-white uppercase">
                                                {singleDeleteItem.status}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500 dark:text-slate-400">Aktor:</span>
                                            <strong className="text-slate-900 dark:text-white">
                                                {singleDeleteItem.causer_name || '-'}
                                            </strong>
                                        </div>
                                        <div className="flex items-center justify-between font-mono text-[11px]">
                                            <span className="text-slate-500 dark:text-slate-400">Event:</span>
                                            <span className="font-bold text-slate-900 dark:text-white">
                                                {singleDeleteItem.event || '-'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Deskripsi:</span>
                                            <p className="line-clamp-2 text-slate-700 dark:text-slate-300 font-medium">
                                                {singleDeleteItem.description || '-'}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {modalError && (
                                <div className="mb-3.5 rounded-xl border border-rose-300 bg-rose-100 dark:bg-rose-900/50 p-2.5 text-xs font-semibold text-rose-800 dark:text-rose-200">
                                    {modalError}
                                </div>
                            )}

                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                                Rekaman ini akan dihapus secara permanen dari sistem dan audit trail akan mencatat tindakan ini.
                            </p>

                            <div className="flex items-center justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsSingleDeleteModalOpen(false);
                                        setSingleDeleteItem(null);
                                        setModalError(null);
                                    }}
                                    disabled={isDeletingSingle}
                                    className="rounded-xl border border-slate-200/80 dark:border-white/10 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmSingleDelete}
                                    disabled={isDeletingSingle}
                                    className="rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-md shadow-rose-600/20"
                                >
                                    {isDeletingSingle ? (
                                        <>
                                            <span className="material-symbols-outlined text-[16px] animate-spin">
                                                progress_activity
                                            </span>
                                            <span>Menghapus...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">
                                                delete
                                            </span>
                                            <span>Ya, Hapus Data</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ======================================================== */}
            {/* CONFIRM CLEAR ALL ACTIVITIES MODAL (Responsive UI)       */}
            {/* ======================================================== */}
            <AnimatePresence>
                {isClearAllModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ duration: 0.2 }}
                            className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0F1B36] p-4 sm:p-6 shadow-2xl"
                        >
                            {/* Header with Danger Icon */}
                            <div className="flex items-start gap-3 sm:gap-3.5 mb-3.5">
                                <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                    <span className="material-symbols-outlined text-[24px] sm:text-[28px]">delete_forever</span>
                                </div>
                                <div>
                                    <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                        Hapus Semua Aktivitas Presensi
                                    </h3>
                                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        Tindakan permanen membersihkan seluruh rekaman presensi &amp; log
                                    </p>
                                </div>
                            </div>

                            {/* Warning Alert */}
                            <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/30 p-3 text-xs text-rose-800 dark:text-rose-300 mb-3.5">
                                <p className="font-semibold flex items-center gap-1.5 mb-1">
                                    <span className="material-symbols-outlined text-[15px]">warning</span>
                                    Perhatian: Data Dihapus Permanen
                                </p>
                                <p className="text-[10px] sm:text-[11px] leading-relaxed opacity-90">
                                    Seluruh log kehadiran guru, riwayat verifikasi biometrik FaceNet + EMAR, dan catatan aktivitas terkait akan dibersihkan dari database.
                                </p>
                            </div>

                            {/* Deletion Summary Card */}
                            <div className="space-y-1.5 rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50/80 dark:bg-slate-900/60 p-3 text-xs mb-3.5">
                                <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                                    <span>Total Log Presensi:</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">{recent_history?.length || 0} entri</span>
                                </div>
                                <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                                    <span>Total Log Aktivitas:</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">{recent_activities?.length || 0} entri</span>
                                </div>
                                {user?.role === 'admin' && (
                                    <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                                        <span>Matriks Evaluasi Uji:</span>
                                        <span className="font-mono font-bold text-slate-900 dark:text-white">{latest_evaluations?.length || 0} entri</span>
                                    </div>
                                )}
                            </div>

                            {/* Error Message */}
                            {modalError && (
                                <div className="mb-3.5 rounded-xl border border-rose-300 bg-rose-100 dark:bg-rose-900/50 p-2.5 text-xs font-semibold text-rose-800 dark:text-rose-200">
                                    {modalError}
                                </div>
                            )}

                            {/* Confirmation Checkbox */}
                            <label className="flex items-start gap-2.5 cursor-pointer mb-4 text-xs text-slate-700 dark:text-slate-200 select-none">
                                <input
                                    type="checkbox"
                                    checked={clearConfirmationChecked}
                                    onChange={(e) => setClearConfirmationChecked(e.target.checked)}
                                    className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 dark:border-white/20 dark:bg-slate-900"
                                />
                                <span className="font-medium text-[11px] sm:text-xs">Saya memahami bahwa seluruh rekaman aktivitas presensi akan dihapus secara permanen.</span>
                            </label>

                            {/* Action Buttons */}
                            <div className="flex flex-col-reverse sm:flex-row items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsClearAllModalOpen(false)}
                                    disabled={isClearingAll}
                                    className="w-full sm:flex-1 min-h-[44px] rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearAllActivities}
                                    disabled={!clearConfirmationChecked || isClearingAll}
                                    className="w-full sm:flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 dark:bg-rose-500 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-700 dark:hover:bg-rose-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isClearingAll ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                            <span>Menghapus...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                                            <span>Ya, Hapus Semua</span>
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
