import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { recordedDistance } from '@/Utils/distanceCalibration';
import { formatMeasured } from '@/Utils/sensorReading';
import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { FormEventHandler, useCallback, useMemo, useRef, useState } from 'react';
import { Bab5ScenarioCard } from '@/Components/Presensi/Bab5ScenarioCard';
import { LightingSummaryView } from '@/Components/Presensi/LightingSummaryView';
import { TeacherAvatar } from '@/Components/Admin/TeacherAvatar';
import { CountUp, scrollToTopOf, SPRING_SOFT, useInertiaNavigating } from '@/Components/Motion';

/* ─── Toast Feedback Notification Interface ─── */
interface Toast {
    id: number;
    type: 'success' | 'error' | 'info' | 'loading';
    message: string;
    submessage?: string;
    icon: string;
}

/* ─── Floating Toast Container ─── */
function ToastContainer({
    toasts,
    onDismiss,
}: {
    toasts: Toast[];
    onDismiss: (id: number) => void;
}) {
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-[92vw] max-w-md pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        layout
                        initial={{ opacity: 0, y: -24, scale: 0.92, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -16, scale: 0.92, filter: 'blur(4px)' }}
                        transition={{ type: 'spring' as const, stiffness: 380, damping: 26 }}
                        className={`pointer-events-auto w-full flex items-start gap-3 rounded-2xl border p-3.5 pr-4 text-xs font-semibold shadow-2xl backdrop-blur-2xl cursor-pointer select-none transition-all ${
                            toast.type === 'error'
                                ? 'border-rose-400/40 bg-rose-50/95 dark:bg-rose-950/90 text-rose-800 dark:text-rose-200 shadow-rose-500/15'
                                : toast.type === 'success'
                                  ? 'border-emerald-400/40 bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 shadow-emerald-500/15'
                                  : toast.type === 'loading'
                                    ? 'border-amber-400/40 bg-amber-50/95 dark:bg-amber-950/90 text-amber-800 dark:text-amber-200 shadow-amber-500/15'
                                    : 'border-royal-blue/30 bg-blue-50/95 dark:bg-slate-900/90 text-royal-blue dark:text-sky-200 shadow-blue-500/15'
                        }`}
                        onClick={() => onDismiss(toast.id)}
                    >
                        <span
                            className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${
                                toast.type === 'error'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : toast.type === 'success'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : toast.type === 'loading'
                                        ? 'text-amber-600 dark:text-amber-400 animate-spin'
                                        : 'text-royal-blue dark:text-sky-400'
                            }`}
                        >
                            {toast.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="leading-snug font-bold">{toast.message}</div>
                            {toast.submessage && (
                                <div className="text-[11px] font-normal opacity-80 mt-0.5 leading-relaxed">
                                    {toast.submessage}
                                </div>
                            )}
                        </div>
                        <span className="material-symbols-outlined text-[16px] opacity-40 shrink-0 mt-0.5 hover:opacity-100 transition-opacity">
                            close
                        </span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

/* ─── Telemetry Detail Inspection Modal ─── */
function BiometricDetailModal({
    record,
    onClose,
    onDelete,
}: {
    record: any | null;
    onClose: () => void;
    onDelete?: (record: any) => void;
}) {
    if (!record) return null;

    const statusStr = (record.status || '').toLowerCase();
    const isSuccess = statusStr === 'success' || statusStr === 'hadir';
    const isLate = statusStr === 'terlambat';
    const isPulang = statusStr === 'pulang';
    const isIzin = statusStr === 'izin';
    const isSakit = statusStr === 'sakit';
    const meta = record.metadata || {};
    const recorded = recordedDistance(meta);

    const dist =
        meta.euclidean_distance !== null && meta.euclidean_distance !== undefined
            ? Number(meta.euclidean_distance)
            : null;
    const distPct = dist !== null ? Math.min(100, Math.max(0, (dist / 1.0) * 100)) : 0;
    const isPassingThreshold = dist !== null ? dist <= 0.40 : isSuccess;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-md overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                transition={{ type: 'spring' as const, stiffness: 380, damping: 28 }}
                className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0B1426] p-5 sm:p-7 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.5)] my-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Avatar & Subject Info */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <TeacherAvatar
                            name={record.user?.name ?? '?'}
                            url={record.user?.avatar_url}
                            className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-tr from-royal-blue/15 to-sky-accent/20 dark:from-sky-500/20 dark:to-royal-blue/30 text-royal-blue dark:text-sky-300 text-sm sm:text-base border border-royal-blue/20 dark:border-sky-400/30 shadow-xs"
                        />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-extrabold text-base sm:text-lg text-deep-navy dark:text-white truncate">
                                    {record.user ? record.user.name : 'Guru Tidak Dikenal'}
                                </h3>
                                {record.user?.embedding_id && (
                                    <span className="rounded-lg bg-sky-50 dark:bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-royal-blue dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
                                        {record.user.embedding_id}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {record.user?.email || 'Subjek Presensi'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                        aria-label="Tutup"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Status & Decision Banner */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/5 p-3.5">
                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                                isSakit
                                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                                    : isIzin
                                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                      : isPulang
                                        ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300'
                                        : isSuccess
                                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                          : isLate
                                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                            }`}
                        >
                            <span
                                className={`h-2 w-2 rounded-full ${
                                    isSakit
                                        ? 'bg-purple-500'
                                        : isIzin
                                          ? 'bg-amber-500'
                                          : isPulang
                                            ? 'bg-sky-500'
                                            : isSuccess
                                              ? 'bg-emerald-500'
                                              : isLate
                                                ? 'bg-amber-500'
                                                : 'bg-rose-500'
                                }`}
                            />
                            <span>
                                {isSakit
                                    ? 'Sakit (Dokter)'
                                    : isIzin
                                      ? 'Izin Dinas'
                                      : isPulang
                                        ? 'Presensi Pulang'
                                        : isSuccess
                                          ? 'Hadir (ACCEPT)'
                                          : isLate
                                            ? 'Terlambat'
                                            : 'Gagal / Tolak'}
                            </span>
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {record.decision_reason || 'Verifikasi Biometrik'}
                        </span>
                    </div>

                    <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {record.time} WIB • {record.date}
                    </div>
                </div>

                {/* Biometrics Dual Telemetry Cards */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* 1. FaceNet Euclidean Distance Card */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <span className="material-symbols-outlined text-[15px] text-royal-blue dark:text-sky-400">
                                    face
                                </span>
                                FaceNet 512-D
                            </span>
                            <span
                                className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                                    isPassingThreshold
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                }`}
                            >
                                {meta.id_pred || '–'}
                            </span>
                        </div>

                        <div className="mt-3">
                            <div className="flex items-baseline justify-between">
                                <span className="text-2xl font-black font-mono text-deep-navy dark:text-white">
                                    {dist !== null ? dist.toFixed(3) : '-'}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                    Ambang: ≤ 0.400
                                </span>
                            </div>
                            {/* Visual Threshold Bar */}
                            <div className="relative mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        isPassingThreshold
                                            ? 'bg-emerald-500'
                                            : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${distPct}%` }}
                                />
                            </div>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                            Semakin kecil jarak, semakin tinggi kemiripan wajah.
                        </p>
                    </div>

                    {/* 2. EMAR Liveness & Anti-Spoof Card */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <span className="material-symbols-outlined text-[15px] text-emerald-600 dark:text-emerald-400">
                                    visibility
                                </span>
                                EMAR Anti-Spoof
                            </span>
                            <span
                                className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                                    meta.pad_pred === 'BONA_FIDE'
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : meta.pad_pred
                                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
                                }`}
                            >
                                {meta.pad_pred || '–'}
                            </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                            <div className="rounded-xl bg-white dark:bg-white/5 p-2 border border-slate-200/60 dark:border-white/5">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                                    Kedipan (EAR)
                                </span>
                                <span className="text-base font-black font-mono text-deep-navy dark:text-white">
                                    {meta.ear_blinks != null ? `${meta.ear_blinks}x` : '–'}
                                </span>
                            </div>
                            <div className="rounded-xl bg-white dark:bg-white/5 p-2 border border-slate-200/60 dark:border-white/5">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                                    Mulut (MAR)
                                </span>
                                <span className="text-base font-black font-mono text-deep-navy dark:text-white">
                                    {meta.mar_mouths != null ? `${meta.mar_mouths}x` : '–'}
                                </span>
                            </div>
                        </div>

                        <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                            Durasi audit: {meta.scan_duration_s != null ? `${meta.scan_duration_s}s` : '–'} • Deteksi:{' '}
                            {meta.face_detected_pct != null ? `${meta.face_detected_pct}%` : '–'}
                        </p>
                    </div>
                </div>

                {/* Environment Info Strip */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100/70 dark:bg-white/5 text-[11px] text-slate-600 dark:text-slate-400">
                    <span>
                        Jarak Kamera: <strong className="text-deep-navy dark:text-white">{formatMeasured(recorded.distanceCm, 'cm', 1)}</strong>
                        {recorded.category && <> · {recorded.category}</>}
                        {recorded.source && <span className="block text-[10px]">Sumber: {recorded.source}</span>}
                    </span>
                    {meta.lighting ? (
                        <LightingSummaryView summary={meta.lighting} variant="compact" />
                    ) : (
                        <span>
                            Pencahayaan: <strong className="text-deep-navy dark:text-white">{formatMeasured(meta.lux, 'Lux')}</strong>
                        </span>
                    )}
                    <span>
                        ID Catatan: <strong className="font-mono text-deep-navy dark:text-white">#{record.id}</strong>
                    </span>
                </div>

                {/* Bab 5 Multi-Scenario Evaluation Card */}
                {meta.evaluation_bab5 && (
                    <div className="mt-4">
                        <Bab5ScenarioCard
                            data={{
                                ...meta.evaluation_bab5,
                                euclidean_distance:
                                    meta.evaluation_bab5.euclidean_distance ?? meta.euclidean_distance,
                            }}
                            variant="modal"
                        />
                    </div>
                )}

                {/* Modal Actions */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                        <a
                            href={route('attendance.export.subject', record.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all shadow-xs"
                        >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                            <span>Unduh CSV Subjek</span>
                        </a>

                        {onDelete && (
                            <button
                                type="button"
                                onClick={() => onDelete(record)}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-xs cursor-pointer"
                                title="Hapus rekaman presensi ini"
                            >
                                <span className="material-symbols-outlined text-[15px]">delete</span>
                                <span>Hapus</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            href={route('attendance.show', record.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3.5 py-2 text-xs font-bold text-deep-navy dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <span>Halaman Penuh</span>
                            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                        </Link>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-deep-navy dark:bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-royal-blue transition-colors shadow-xs"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

/* ─── Activity Log Detail Inspection Modal ─── */
function ActivityDetailModal({
    activity,
    onClose,
    onDelete,
}: {
    activity: any | null;
    onClose: () => void;
    onDelete?: (activity: any) => void;
}) {
    const [copied, setCopied] = useState(false);
    if (!activity) return null;

    const props = activity.properties || {};
    const hasBiometric =
        props.s1 !== undefined ||
        props.euclidean_distance !== undefined ||
        props.ear_val !== undefined ||
        props.s_final !== undefined;

    const handleCopyJson = () => {
        navigator.clipboard.writeText(JSON.stringify(activity, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const eventName = (activity.event || activity.log_name || 'event').toLowerCase();
    const isPresensi =
        eventName.includes('attendance') ||
        eventName.includes('biometric') ||
        eventName.includes('presensi');
    const isEnroll = eventName.includes('enroll') || eventName.includes('wajah');
    const isAuth =
        eventName.includes('login') ||
        eventName.includes('logout') ||
        eventName.includes('auth');
    const isDanger =
        eventName.includes('delete') ||
        eventName.includes('clear') ||
        eventName.includes('hapus');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-md overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                transition={{ type: 'spring' as const, stiffness: 380, damping: 28 }}
                className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0B1426] p-5 sm:p-7 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.5)] my-auto max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Event Icon & Details */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold border shadow-xs ${
                                isDanger
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30'
                                    : isPresensi
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                                      : isEnroll
                                        ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/30'
                                        : isAuth
                                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30'
                                          : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[24px]">
                                {isDanger
                                    ? 'delete_forever'
                                    : isPresensi
                                      ? 'face'
                                      : isEnroll
                                        ? 'how_to_reg'
                                        : isAuth
                                          ? 'security'
                                          : 'history_edu'}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-extrabold text-base sm:text-lg text-deep-navy dark:text-white truncate">
                                    Detail Log Aktivitas #{activity.id}
                                </h3>
                                <span className="rounded-lg bg-slate-100 dark:bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                                    {activity.log_name || 'default'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {activity.time} WIB • {activity.date} ({activity.created_at_human})
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                        aria-label="Tutup"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Body Content - Scrollable */}
                <div className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
                    {/* Actor & Description Card */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Aktor Pengguna
                            </span>
                            <span className="font-semibold text-deep-navy dark:text-white flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-400">
                                    account_circle
                                </span>
                                {activity.causer_name}
                            </span>
                        </div>
                        {activity.causer_email && activity.causer_email !== '-' && (
                            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                                <span>Email Aktor:</span>
                                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                    {activity.causer_email}
                                </span>
                            </div>
                        )}
                        <div className="border-t border-slate-200/60 dark:border-white/5 pt-2.5">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                                Deskripsi Kejadian
                            </span>
                            <p className="font-medium text-deep-navy dark:text-slate-200 leading-relaxed bg-white dark:bg-white/5 p-2.5 rounded-xl border border-slate-200/60 dark:border-white/5">
                                {activity.description}
                            </p>
                        </div>
                    </div>

                    {/* Biometric & Bab 5 Telemetry (if available) */}
                    {hasBiometric && (
                        <div className="rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/50 dark:bg-sky-500/5 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[15px]">science</span>
                                    Telemetri Biometrik &amp; Evaluasi Bab 5
                                </span>
                                {props.final_decision && (
                                    <span
                                        className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                                            props.final_decision === 'ACCEPT'
                                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                        }`}
                                    >
                                        {props.final_decision}
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-xl bg-white dark:bg-white/5 p-2 border border-sky-100 dark:border-white/5">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">
                                        S1 FaceNet
                                    </span>
                                    <span
                                        className={`font-mono font-black text-xs ${
                                            props.s1 === 'ACCEPT'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-rose-600 dark:text-rose-400'
                                        }`}
                                    >
                                        {props.s1 || '-'}
                                    </span>
                                </div>
                                <div className="rounded-xl bg-white dark:bg-white/5 p-2 border border-sky-100 dark:border-white/5">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">
                                        S2 Rule-Gate
                                    </span>
                                    <span
                                        className={`font-mono font-black text-xs ${
                                            props.s2 === 'ACCEPT'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-rose-600 dark:text-rose-400'
                                        }`}
                                    >
                                        {props.s2 || '-'}
                                    </span>
                                </div>
                                <div className="rounded-xl bg-white dark:bg-white/5 p-2 border border-sky-100 dark:border-white/5">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">
                                        S3 Fusion
                                    </span>
                                    <span
                                        className={`font-mono font-black text-xs ${
                                            props.s3 === 'ACCEPT'
                                                ? 'text-sky-600 dark:text-sky-400'
                                                : 'text-rose-600 dark:text-rose-400'
                                        }`}
                                    >
                                        {props.s3 || '-'}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                                <div className="rounded-lg bg-white/80 dark:bg-white/5 p-1.5 border border-sky-100 dark:border-white/5 text-center">
                                    <span className="text-slate-400 block">Jarak L2</span>
                                    <strong className="text-deep-navy dark:text-white">
                                        {props.euclidean_distance != null
                                            ? Number(props.euclidean_distance).toFixed(3)
                                            : '-'}
                                    </strong>
                                </div>
                                <div className="rounded-lg bg-white/80 dark:bg-white/5 p-1.5 border border-sky-100 dark:border-white/5 text-center">
                                    <span className="text-slate-400 block">S_final</span>
                                    <strong className="text-deep-navy dark:text-white">
                                        {props.s_final ?? '-'}
                                    </strong>
                                </div>
                                <div className="rounded-lg bg-white/80 dark:bg-white/5 p-1.5 border border-sky-100 dark:border-white/5 text-center">
                                    <span className="text-slate-400 block">EAR</span>
                                    <strong className="text-deep-navy dark:text-white">
                                        {props.ear_val ?? '-'}
                                    </strong>
                                </div>
                                <div className="rounded-lg bg-white/80 dark:bg-white/5 p-1.5 border border-sky-100 dark:border-white/5 text-center">
                                    <span className="text-slate-400 block">MAR</span>
                                    <strong className="text-deep-navy dark:text-white">
                                        {props.mar_val ?? '-'}
                                    </strong>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Network & Client Info */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-3.5 space-y-2">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                            Informasi Jaringan &amp; Klien
                        </span>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-400">Alamat IP:</span>
                            <span className="font-mono font-bold text-deep-navy dark:text-white">
                                {props.ip || '127.0.0.1'}
                            </span>
                        </div>
                        {props.user_agent && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono break-all bg-white dark:bg-white/5 p-2 rounded-lg border border-slate-200/60 dark:border-white/5">
                                {props.user_agent}
                            </div>
                        )}
                    </div>

                    {/* Raw Metadata JSON Viewer */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-900 text-slate-200 p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">code</span>
                                Raw Metadata JSON
                            </span>
                            <button
                                type="button"
                                onClick={handleCopyJson}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-mono font-semibold transition-colors"
                            >
                                <span className="material-symbols-outlined text-[12px]">
                                    {copied ? 'check' : 'content_copy'}
                                </span>
                                <span>{copied ? 'Tersalin!' : 'Salin JSON'}</span>
                            </button>
                        </div>
                        <pre className="text-[10px] font-mono max-h-36 overflow-y-auto p-2 rounded-lg bg-black/40 text-emerald-400 whitespace-pre-wrap break-all scrollbar-thin">
                            {JSON.stringify(activity, null, 2)}
                        </pre>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100 dark:border-white/5">
                    {onDelete && (
                        <button
                            type="button"
                            onClick={() => onDelete(activity)}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-xs cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                            <span>Hapus Log</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-auto rounded-xl bg-deep-navy dark:bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-royal-blue transition-colors shadow-xs"
                    >
                        Tutup
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

/* ─── Animation Variants ─── */
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.04,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: {
        opacity: 1,
        y: 0,
        transition: {
            type: 'spring' as const,
            stiffness: 400,
            damping: 28,
        },
    },
};

/**
 * Paginasi daftar. Di HP hanya Sebelumnya / halaman aktif / Berikutnya yang tampil.
 * Pindah halaman mempertahankan state (mode kartu/tabel tidak kembali ke kartu) lalu
 * menggulir halus ke awal daftar, bukan melompat ke atas halaman.
 */
function HistoryPagination({ page, noun, onNavigated }: { page: any; noun: string; onNavigated: () => void }) {
    if (!page?.links || page.links.length <= 3) return null;
    return (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 border-t border-slate-200/70 dark:border-white/[0.08] pt-4">
            <div className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
                Menampilkan <span className="font-bold text-deep-navy dark:text-white">{page.from || 0}</span> sampai{' '}
                <span className="font-bold text-deep-navy dark:text-white">{page.to || 0}</span> dari{' '}
                <span className="font-bold text-deep-navy dark:text-white">{page.total}</span> {noun}
            </div>
            <nav aria-label={`Halaman ${noun}`} className="flex flex-wrap items-center justify-center gap-1.5">
                {page.links.map((link: any, i: number) => {
                    const numeric = /^\d+$/.test(String(link.label).trim());
                    const className = `${
                        numeric && !link.active ? 'hidden sm:inline-flex' : 'inline-flex'
                    } h-11 min-w-[44px] lg:h-9 lg:min-w-[36px] items-center justify-center rounded-xl px-3 text-xs font-semibold transition-colors ${
                        link.active
                            ? 'bg-deep-navy dark:bg-sky-600 text-white shadow-sm'
                            : 'border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-deep-navy dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`;
                    return link.url ? (
                        <Link
                            key={i}
                            href={link.url}
                            preserveState
                            preserveScroll
                            onSuccess={onNavigated}
                            aria-current={link.active ? 'page' : undefined}
                            className={className}
                            dangerouslySetInnerHTML={{ __html: link.label }}
                        />
                    ) : (
                        <span
                            key={i}
                            aria-disabled="true"
                            className={`${className} cursor-not-allowed opacity-50`}
                            dangerouslySetInnerHTML={{ __html: link.label }}
                        />
                    );
                })}
            </nav>
        </div>
    );
}

/** Lencana Bab 5 dari log: 1 / 'ACCEPT' = diterima, 0 / 'REJECT' = ditolak, kosong = tidak tercatat. */
function bab5Verdict(value: unknown): 'ACC' | 'REJ' | '–' {
    if (value === 1 || value === '1' || value === 'ACCEPT') return 'ACC';
    if (value === 0 || value === '0' || value === 'REJECT') return 'REJ';
    return '–';
}

/* ─── Main History Component ─── */
export default function History({
    records,
    activities,
    summaryStats,
    filters,
    isAdmin,
}: any) {
    const [currentTab, setCurrentTab] = useState<'presensi' | 'audit'>(filters.tab || 'presensi');
    const [search, setSearch] = useState(filters.search || '');
    const [date, setDate] = useState(filters.date || '');
    const [status, setStatus] = useState(filters.status || '');
    const [activityEvent, setActivityEvent] = useState(filters.activity_event || '');
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [selectedDetailRecord, setSelectedDetailRecord] = useState<any | null>(null);
    const [selectedDetailActivity, setSelectedDetailActivity] = useState<any | null>(null);

    // Mobile Actions Drawer state
    const [isMobileActionOpen, setIsMobileActionOpen] = useState(false);

    // Daftar lama diredupkan selama saringan / halaman baru dimuat; titik gulir setelah pindah halaman.
    const navigating = useInertiaNavigating();
    const listTopRef = useRef<HTMLDivElement | null>(null);

    // Toast notifications state
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    // Clear All state
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    // Single Item Delete State
    const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
    const [singleDeleteItem, setSingleDeleteItem] = useState<any | null>(null);
    const [singleDeleteType, setSingleDeleteType] = useState<'record' | 'activity' | null>(null);
    const [isDeletingSingle, setIsDeletingSingle] = useState(false);

    const promptDeleteRecord = useCallback((record: any) => {
        setSingleDeleteItem(record);
        setSingleDeleteType('record');
        setIsSingleDeleteModalOpen(true);
    }, []);

    const promptDeleteActivity = useCallback((act: any) => {
        setSingleDeleteItem(act);
        setSingleDeleteType('activity');
        setIsSingleDeleteModalOpen(true);
    }, []);

    /* ─── Toast dispatcher ─── */
    const pushToast = useCallback(
        (type: Toast['type'], message: string, icon: string, submessage?: string) => {
            const id = ++toastIdRef.current;
            setToasts((prev) => [...prev.slice(-2), { id, type, message, icon, submessage }]);
            if (type !== 'loading') {
                setTimeout(() => {
                    setToasts((prev) => prev.filter((t) => t.id !== id));
                }, 4500);
            }
            return id;
        },
        [],
    );

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const handleFilter: FormEventHandler = (e) => {
        if (e) e.preventDefault();
        router.get(
            route('attendance.history'),
            { tab: currentTab, search, date, status, activity_event: activityEvent },
            {
                preserveState: true,
                replace: true,
                onSuccess: () => {
                    pushToast('info', 'Filter berhasil diterapkan', 'filter_alt', 'Daftar riwayat diperbarui sesuai kriteria.');
                },
            },
        );
    };

    const handleQuickStatus = (newStatus: string) => {
        setStatus(newStatus);
        const labelMap: Record<string, string> = {
            '': 'Semua',
            hadir: 'Hadir Tepat Waktu',
            terlambat: 'Terlambat',
            pulang: 'Presensi Pulang',
            izin_sakit: 'Izin / Sakit',
            failed: 'Ditolak / Gagal',
        };
        router.get(
            route('attendance.history'),
            { tab: currentTab, search, date, status: newStatus, activity_event: activityEvent },
            {
                preserveState: true,
                replace: true,
                onSuccess: () => {
                    pushToast('info', `Status disaring: ${labelMap[newStatus] || newStatus}`, 'tune');
                },
            },
        );
    };

    const handleQuickActivityEvent = (newEvent: string) => {
        setActivityEvent(newEvent);
        const labelMap: Record<string, string> = {
            '': 'Semua Event',
            all: 'Semua Event',
            attendance: 'Presensi Biometrik',
            enrollment: 'Registrasi Wajah',
            auth: 'Autentikasi & Sesi',
            system: 'Sistem & Hapus',
        };
        router.get(
            route('attendance.history'),
            { tab: 'audit', search, activity_event: newEvent },
            {
                preserveState: true,
                replace: true,
                onSuccess: () => {
                    pushToast('info', `Kategori Log: ${labelMap[newEvent] || newEvent}`, 'tune');
                },
            },
        );
    };

    const handleResetFilter = () => {
        setSearch('');
        setDate('');
        setStatus('');
        setActivityEvent('');
        router.get(
            route('attendance.history'),
            { tab: currentTab },
            {
                preserveState: true,
                replace: true,
                onSuccess: () => {
                    pushToast('info', 'Filter telah dibersihkan', 'refresh', 'Menampilkan seluruh rekaman data.');
                },
            },
        );
    };

    const handleTabSwitch = (newTab: 'presensi' | 'audit') => {
        setCurrentTab(newTab);
        router.get(
            route('attendance.history'),
            { tab: newTab, search, date, status, activity_event: activityEvent },
            { preserveState: true, replace: true },
        );
    };

    // Quick status chips with counts
    const statusChips = useMemo(
        () => [
            { id: '', label: 'Semua', count: summaryStats?.total ?? records?.total ?? 0, icon: 'apps' },
            { id: 'hadir', label: 'Hadir', count: summaryStats?.hadir ?? 0, icon: 'check_circle' },
            { id: 'terlambat', label: 'Terlambat', count: summaryStats?.terlambat ?? 0, icon: 'schedule' },
            { id: 'pulang', label: 'Pulang', count: summaryStats?.pulang ?? 0, icon: 'logout' },
            { id: 'izin_sakit', label: 'Izin/Sakit', count: summaryStats?.izin_sakit ?? 0, icon: 'clinical_notes' },
            { id: 'failed', label: 'Ditolak', count: summaryStats?.failed ?? 0, icon: 'cancel' },
        ],
        [summaryStats, records],
    );

    // Client-side PDF Table Generation via jsPDF + autoTable with smooth toast feedback
    const handleExportPdf = async () => {
        setIsExportingPdf(true);
        const loadingId = pushToast(
            'loading',
            'Menyiapkan Laporan PDF...',
            'progress_activity',
            'Mengompilasi data tabel rekonsiliasi & telemetri biometrik.',
        );

        try {
            const response = await axios.get(route('attendance.export.pdf-data'), {
                params: { search, date, status },
            });

            if (response.data.status !== 'success' || !response.data.data) {
                throw new Error('Gagal mengambil data untuk pembuatan PDF');
            }

            const { meta, data: rows } = response.data;

            // Initialize landscape A4 document
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'pt',
                format: 'a4',
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // 1. Header: School & Document Info
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.setTextColor(30, 58, 138); // Blue 900
            doc.text('SMK AL-MADANI PONTIANAK', pageWidth / 2, 38, { align: 'center' });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(30, 41, 59); // Slate 800
            doc.text(
                'LAPORAN REKAPITULASI PRESENSI & VERIFIKASI BIOMETRIK GURU (FACENET + EMAR)',
                pageWidth / 2,
                52,
                { align: 'center' },
            );

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139); // Slate 500
            const filterInfo = `Filter Subjek: ${meta.filters.search}  |  Tanggal: ${meta.filters.date}  |  Status: ${meta.filters.status}  |  Dicetak: ${meta.generated_at}`;
            doc.text(filterInfo, pageWidth / 2, 65, { align: 'center' });

            // Horizontal Line
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.8);
            doc.line(36, 74, pageWidth - 36, 74);

            // 2. KPI Summary Boxes Strip (6 categories)
            const sum = meta.summary;
            const kpiY = 88;
            const kpiBoxWidth = (pageWidth - 72 - 40) / 6;
            const kpis = [
                { label: 'TOTAL DATA', val: String(sum.total), color: [15, 23, 42] },
                { label: 'HADIR TEPAT WAKTU', val: String(sum.hadir), color: [22, 163, 74] },
                { label: 'TERLAMBAT', val: String(sum.terlambat), color: [217, 119, 6] },
                { label: 'PRESENSI PULANG', val: String(sum.pulang || 0), color: [2, 132, 199] },
                { label: 'IZIN / SAKIT', val: String(sum.izin_sakit), color: [124, 58, 237] },
                { label: 'DITOLAK / GAGAL', val: String(sum.failed), color: [220, 38, 38] },
            ];

            kpis.forEach((kpi, idx) => {
                const bx = 36 + idx * (kpiBoxWidth + 8);
                doc.setFillColor(248, 250, 252);
                doc.roundedRect(bx, kpiY - 6, kpiBoxWidth, 28, 3, 3, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(bx, kpiY - 6, kpiBoxWidth, 28, 3, 3, 'S');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
                doc.text(kpi.val, bx + kpiBoxWidth / 2, kpiY + 8, { align: 'center' });

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.text(kpi.label, bx + kpiBoxWidth / 2, kpiY + 18, { align: 'center' });
            });

            // 3. Tabular Data
            const tableColumns = [
                { header: 'No', dataKey: 'no' },
                { header: 'Waktu & Tgl', dataKey: 'datetime' },
                { header: 'Kode', dataKey: 'teacher_id' },
                { header: 'Nama Tenaga Pendidik', dataKey: 'teacher_name' },
                { header: 'Status', dataKey: 'status_label' },
                { header: 'Keputusan', dataKey: 'final_decision' },
                { header: 'L2 Dist', dataKey: 'euclidean_distance' },
                { header: 'PAD', dataKey: 'pad_pred' },
                { header: 'EAR / MAR', dataKey: 'blinks' },
                { header: 'Keterangan Sistem', dataKey: 'decision_reason' },
            ];

            const tableRows = rows.map((r: any) => ({
                no: String(r.no),
                datetime: `${r.time} WIB\n${r.date}`,
                teacher_id: r.teacher_id || '-',
                teacher_name: `${r.teacher_name}\n${r.teacher_email}`,
                status_label: r.status_label,
                final_decision: r.final_decision,
                euclidean_distance: r.euclidean_distance,
                pad_pred: r.pad_pred,
                blinks: `${r.ear_blinks}x / ${r.mar_mouths}x`,
                decision_reason: r.decision_reason || '-',
            }));

            autoTable(doc, {
                columns: tableColumns,
                body: tableRows,
                startY: 122,
                margin: { left: 36, right: 36 },
                styles: {
                    fontSize: 7.5,
                    cellPadding: 4,
                    font: 'helvetica',
                    textColor: [15, 23, 42],
                    lineColor: [226, 232, 240],
                    lineWidth: 0.5,
                },
                headStyles: {
                    fillColor: [30, 41, 59], // Slate 800
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 7.5,
                    halign: 'center',
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252],
                },
                columnStyles: {
                    no: { halign: 'center', cellWidth: 24 },
                    datetime: { halign: 'center', cellWidth: 68 },
                    teacher_id: { halign: 'center', cellWidth: 40, fontStyle: 'bold' },
                    teacher_name: { cellWidth: 140 },
                    status_label: { halign: 'center', cellWidth: 72, fontStyle: 'bold' },
                    final_decision: { halign: 'center', cellWidth: 55, fontStyle: 'bold' },
                    euclidean_distance: { halign: 'center', cellWidth: 46 },
                    pad_pred: { halign: 'center', cellWidth: 56 },
                    blinks: { halign: 'center', cellWidth: 56 },
                    decision_reason: { cellWidth: 'auto' },
                },
                didDrawPage: () => {
                    const totalPages = (doc as any).getNumberOfPages
                        ? (doc as any).getNumberOfPages()
                        : 1;
                    const str = 'Halaman ' + totalPages;
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text(str, pageWidth - 36, pageHeight - 14, { align: 'right' });
                    doc.text(
                        'Sistem Presensi FaceNet + EMAR · SMK Al-Madani Pontianak',
                        36,
                        pageHeight - 14,
                    );
                },
            });

            // 4. Save file to disk
            const dateStamp = new Date().toISOString().slice(0, 10);
            doc.save(`Laporan_Presensi_Guru_SMK_Al_Madani_${dateStamp}.pdf`);

            dismissToast(loadingId);
            pushToast(
                'success',
                'Laporan PDF Berhasil Diunduh!',
                'check_circle',
                'Dokumen A4 Landscape telah tersimpan di perangkat Anda.',
            );
        } catch (err: any) {
            console.error('PDF Export Error:', err);
            dismissToast(loadingId);
            pushToast(
                'error',
                'Gagal Membuat PDF',
                'error',
                'Terjadi kesalahan saat memproses data. Anda dapat menggunakan tombol Cetak Resmi.',
            );
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleClearAll = useCallback(async () => {
        setIsClearing(true);
        setModalError(null);

        try {
            const response = await axios.delete('/dashboard/activities/clear-all');
            if (response.data.status === 'success') {
                setIsClearModalOpen(false);
                pushToast(
                    'success',
                    'Riwayat Berhasil Dibersihkan',
                    'check_circle',
                    response.data.message || 'Seluruh catatan presensi guru telah dihapus permanen.',
                );
                router.reload();
            } else {
                setModalError(response.data.message || 'Gagal menghapus riwayat presensi.');
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Gagal memproses penghapusan data.';
            setModalError(msg);
        } finally {
            setIsClearing(false);
        }
    }, [pushToast]);

    const handleConfirmSingleDelete = useCallback(async () => {
        if (!singleDeleteItem || !singleDeleteType) return;
        setIsDeletingSingle(true);

        const url =
            singleDeleteType === 'record'
                ? `/attendance/history/${singleDeleteItem.id}`
                : `/attendance/activities/${singleDeleteItem.id}`;

        try {
            const response = await axios.delete(url);
            if (response.data.status === 'success') {
                setIsSingleDeleteModalOpen(false);
                setSelectedDetailRecord(null);
                pushToast(
                    'success',
                    singleDeleteType === 'record' ? 'Rekaman Presensi Dihapus' : 'Log Aktivitas Dihapus',
                    'check_circle',
                    response.data.message || 'Catatan telah berhasil dihapus.',
                );
                router.reload();
            } else {
                pushToast('error', 'Gagal Menghapus', 'error', response.data.message);
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Terjadi kesalahan saat menghapus data.';
            pushToast('error', 'Gagal Menghapus', 'error', msg);
        } finally {
            setIsDeletingSingle(false);
        }
    }, [singleDeleteItem, singleDeleteType, pushToast]);

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-3.5">
                    {/* Top Breadcrumbs & Back Nav */}
                    <div className="flex items-center justify-between">
                        <Link
                            href="/dashboard"
                            className="-my-2 inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 py-2 text-xs font-semibold text-royal-blue dark:text-sky-300 hover:text-blue-700 dark:hover:text-sky-200 transition-colors group"
                        >
                            <span className="material-symbols-outlined text-[16px] transition-transform group-hover:-translate-x-1">
                                arrow_back
                            </span>
                            <span>Kembali ke Dashboard</span>
                        </Link>

                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            <span>Live Telemetri (FaceNet + EMAR)</span>
                        </span>
                    </div>

                    {/* Main Title & Action Hub Header */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-deep-navy dark:text-white">
                                Pusat Riwayat &amp; Aktivitas
                            </h2>
                            <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-1">
                                Arsip biometrik FaceNet 512-D, liveness EMAR 8s, serta log audit sistem
                            </p>
                        </div>

                        {/* Action Hub Buttons Bar */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* 1. Ekspor PDF (Primary Action) */}
                            <motion.button
                                whileHover={{ y: -1.5 }}
                                whileTap={{ scale: 0.96 }}
                                type="button"
                                onClick={handleExportPdf}
                                disabled={isExportingPdf}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-xs disabled:opacity-60 min-h-[44px] lg:min-h-[38px]"
                                title="Unduh tabel presensi dalam format PDF (A4 Landscape)"
                            >
                                {isExportingPdf ? (
                                    <>
                                        <span className="material-symbols-outlined text-[16px] animate-spin">
                                            progress_activity
                                        </span>
                                        <span>Membuat PDF...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[16px]">
                                            picture_as_pdf
                                        </span>
                                        <span>Ekspor PDF</span>
                                    </>
                                )}
                            </motion.button>

                            {/* 2. Cetak Resmi A4 */}
                            <motion.a
                                whileHover={{ y: -1.5 }}
                                whileTap={{ scale: 0.96 }}
                                href={route('attendance.export.print', { search, date, status })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-royal-blue/30 dark:border-sky-500/30 bg-royal-blue/5 dark:bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-royal-blue dark:text-sky-300 hover:bg-royal-blue/10 dark:hover:bg-sky-500/20 transition-all shadow-xs min-h-[44px] lg:min-h-[38px]"
                                title="Buka pratinjau cetak resmi A4 dengan Kop Surat SMK Al-Madani"
                            >
                                <span className="material-symbols-outlined text-[16px]">print</span>
                                <span>Cetak A4</span>
                            </motion.a>

                            {/* 3. Satu CSV: semua riwayat presensi + log aktivitas */}
                            <motion.a
                                whileHover={{ y: -1.5 }}
                                whileTap={{ scale: 0.96 }}
                                href={route('attendance.export.all')}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all shadow-xs min-h-[44px] lg:min-h-[38px]"
                                title="Unduh semua riwayat presensi dan log aktivitas dalam satu berkas CSV"
                            >
                                <span className="material-symbols-outlined text-[16px]">download</span>
                                <span>CSV Lengkap</span>
                            </motion.a>

                            {/* Tombol tambahan ikut membungkus baris induk, jadi label tidak terlipat di tablet. */}
                            <div className="hidden sm:contents">
                                <motion.a
                                    whileHover={{ y: -1.5 }}
                                    whileTap={{ scale: 0.96 }}
                                    href={route('attendance.export.latest')}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all shadow-xs min-h-[44px] lg:min-h-[38px]"
                                    title="Unduh CSV data subjek yang paling baru melakukan presensi"
                                >
                                    <span className="material-symbols-outlined text-[16px]">
                                        file_download
                                    </span>
                                    <span>CSV Terakhir</span>
                                </motion.a>

                                {isAdmin && (
                                    <>
                                        <motion.a
                                            whileHover={{ y: -1.5 }}
                                            whileTap={{ scale: 0.96 }}
                                            href={route('export.operational')}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs font-bold text-deep-navy dark:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition-all shadow-xs min-h-[44px] lg:min-h-[38px]"
                                            title="Unduh seluruh rekaman riwayat presensi operasional format CSV"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">
                                                table_view
                                            </span>
                                            <span>Ekspor CSV</span>
                                        </motion.a>

                                        <motion.a
                                            whileHover={{ y: -1.5 }}
                                            whileTap={{ scale: 0.96 }}
                                            href={route('export.research')}
                                            className="inline-flex items-center gap-1.5 rounded-xl bg-royal-blue dark:bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:brightness-110 transition-all shadow-xs min-h-[44px] lg:min-h-[38px]"
                                            title="Unduh Matriks Evaluasi Bab 4 CSV untuk keperluan analitik & skripsi"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">
                                                science
                                            </span>
                                            <span>Riset Bab 4</span>
                                        </motion.a>

                                        <motion.a
                                            whileHover={{ y: -1.5 }}
                                            whileTap={{ scale: 0.96 }}
                                            href={route('export.cochran')}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-royal-blue/30 dark:border-sky-400/30 bg-royal-blue/10 dark:bg-sky-400/10 hover:bg-royal-blue/20 dark:hover:bg-sky-400/20 text-royal-blue dark:text-sky-300 px-3.5 py-2 text-xs font-bold transition-colors shadow-xs min-h-[44px] lg:min-h-[38px]"
                                            title="Unduh presentasi uji berpasangan (S1/S2/S3) yang terekam capture_session. Rancangan penuh: 3.240 presentasi (810 bona fide + 2.430 serangan)"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">
                                                query_stats
                                            </span>
                                            <span>Data Uji Berpasangan</span>
                                        </motion.a>

                                        <motion.a
                                            whileHover={{ y: -1.5 }}
                                            whileTap={{ scale: 0.96 }}
                                            href={route('attendance.export.bab5')}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-3.5 py-2 text-xs font-bold transition-all shadow-xs min-h-[44px] lg:min-h-[38px]"
                                            title="Unduh CSV 3 Skenario Evaluasi Bab 5 (FaceNet Stand-alone, Rule-Based Gate, Weighted Fusion)"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">
                                                dataset
                                            </span>
                                            <span>Uji Bab 5 (CSV)</span>
                                        </motion.a>
                                    </>
                                )}

                                {records?.total > 0 && (
                                    <motion.button
                                        whileHover={{ y: -1.5 }}
                                        whileTap={{ scale: 0.96 }}
                                        type="button"
                                        onClick={() => {
                                            setModalError(null);
                                            setConfirmChecked(false);
                                            setIsClearModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 transition-colors hover:bg-rose-100 dark:hover:bg-rose-500/20 shadow-xs min-h-[44px] lg:min-h-[38px]"
                                        title="Hapus seluruh riwayat presensi"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">
                                            delete_sweep
                                        </span>
                                        <span>Hapus Semua</span>
                                    </motion.button>
                                )}
                            </div>

                            {/* Mobile Actions Drawer Toggle (< sm screens) */}
                            <div className="relative sm:hidden">
                                <motion.button
                                    whileTap={{ scale: 0.92 }}
                                    type="button"
                                    onClick={() => setIsMobileActionOpen(!isMobileActionOpen)}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/90 dark:bg-white/10 px-3 py-2 text-xs font-bold text-deep-navy dark:text-white transition-all min-h-[44px] lg:min-h-[38px]"
                                >
                                    <span className="material-symbols-outlined text-[18px]">
                                        tune
                                    </span>
                                    <span>Opsi Ekspor</span>
                                </motion.button>

                                <AnimatePresence>
                                    {isMobileActionOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95, y: 6 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: 6 }}
                                            className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-[#0E182D]/95 p-2 shadow-2xl backdrop-blur-xl z-40 space-y-1"
                                        >
                                            <a
                                                href={route('attendance.export.latest')}
                                                onClick={() => setIsMobileActionOpen(false)}
                                                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-deep-navy dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[16px] text-sky-600 dark:text-sky-400">
                                                    file_download
                                                </span>
                                                <span>CSV Subjek Terakhir</span>
                                            </a>

                                            {isAdmin && (
                                                <>
                                                    <a
                                                        href={route('export.operational')}
                                                        onClick={() => setIsMobileActionOpen(false)}
                                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-deep-navy dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-400">
                                                            table_view
                                                        </span>
                                                        <span>Ekspor CSV Operasional</span>
                                                    </a>
                                                     <a
                                                        href={route('export.research')}
                                                        onClick={() => setIsMobileActionOpen(false)}
                                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-deep-navy dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px] text-purple-600 dark:text-purple-400">
                                                            science
                                                        </span>
                                                        <span>Matriks Riset Bab 4</span>
                                                    </a>
                                                    <a
                                                        href={route('export.cochran')}
                                                        onClick={() => setIsMobileActionOpen(false)}
                                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-deep-navy dark:text-slate-200 hover:bg-royal-blue/10 dark:hover:bg-sky-400/10 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px] text-indigo-600 dark:text-indigo-400">
                                                            query_stats
                                                        </span>
                                                        <span>Data Uji Berpasangan</span>
                                                    </a>
                                                    <a
                                                        href={route('attendance.export.bab5')}
                                                        onClick={() => setIsMobileActionOpen(false)}
                                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-deep-navy dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">
                                                            dataset
                                                        </span>
                                                        <span>Uji Bab 5 (CSV)</span>
                                                    </a>
                                                </>
                                            )}

                                            {records?.total > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsMobileActionOpen(false);
                                                        setModalError(null);
                                                        setConfirmChecked(false);
                                                        setIsClearModalOpen(true);
                                                    }}
                                                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">
                                                        delete_sweep
                                                    </span>
                                                    <span>Hapus Semua Data</span>
                                                </button>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>
            }
        >
            <Head title="Pusat Riwayat & Aktivitas" />

            {/* Floating Toast Popup Feedback */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

            <MotionConfig reducedMotion="user">
            {/* Telemetry Inspection Popup Modal */}
            <AnimatePresence>
                {selectedDetailRecord && (
                    <BiometricDetailModal
                        record={selectedDetailRecord}
                        onClose={() => setSelectedDetailRecord(null)}
                        onDelete={promptDeleteRecord}
                    />
                )}
            </AnimatePresence>

            <div className="py-4 sm:py-7">
                <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
                    {/* KPI Summary Cards Strip (Staggered Animation, 6 Cards) */}
                    {summaryStats && (
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-6"
                        >
                            {/* Card 1: Total Entri */}
                            <motion.div
                                variants={itemVariants}
                                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                                className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] p-2.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:justify-between min-w-0"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        Total Entri
                                    </span>
                                    <div aria-hidden="true" className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
                                            fact_check
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
                                    <CountUp value={Number(summaryStats.total ?? records?.total ?? 0)} />
                                </div>
                                <div className="mt-1 hidden sm:block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                    Semua data terverifikasi
                                </div>
                            </motion.div>

                            {/* Card 2: Tepat Waktu */}
                            <motion.div
                                variants={itemVariants}
                                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                                className="rounded-2xl sm:rounded-3xl border border-emerald-500/20 bg-white dark:bg-[#0F1B36] p-2.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:justify-between min-w-0"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                                        Tepat Waktu
                                    </span>
                                    <div aria-hidden="true" className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
                                            check_circle
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                                    <CountUp value={Number(summaryStats.hadir ?? 0)} />
                                </div>
                                <div className="mt-1 hidden sm:block text-[10px] text-emerald-700 dark:text-emerald-400/80 truncate">
                                    Sesi Masuk &lt; 07:15 WIB
                                </div>
                            </motion.div>

                            {/* Card 3: Terlambat */}
                            <motion.div
                                variants={itemVariants}
                                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                                className="rounded-2xl sm:rounded-3xl border border-amber-500/20 bg-white dark:bg-[#0F1B36] p-2.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:justify-between min-w-0"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] sm:text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                                        Terlambat
                                    </span>
                                    <div aria-hidden="true" className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
                                            schedule
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                                    <CountUp value={Number(summaryStats.terlambat ?? 0)} />
                                </div>
                                <div className="mt-1 hidden sm:block text-[10px] text-amber-700 dark:text-amber-400/80 truncate">
                                    07:15 - 08:00 WIB
                                </div>
                            </motion.div>

                            {/* Card 4: Presensi Pulang */}
                            <motion.div
                                variants={itemVariants}
                                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                                className="rounded-2xl sm:rounded-3xl border border-sky-500/20 bg-white dark:bg-[#0F1B36] p-2.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:justify-between min-w-0"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] sm:text-[11px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
                                        Pulang
                                    </span>
                                    <div aria-hidden="true" className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
                                            logout
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-black font-mono text-sky-600 dark:text-sky-400">
                                    <CountUp value={Number(summaryStats.pulang ?? 0)} />
                                </div>
                                <div className="mt-1 hidden sm:block text-[10px] text-sky-700 dark:text-sky-400/80 truncate">
                                    Sesi Kepulangan Guru
                                </div>
                            </motion.div>

                            {/* Card 5: Izin & Sakit */}
                            <motion.div
                                variants={itemVariants}
                                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                                className="rounded-2xl sm:rounded-3xl border border-purple-500/20 bg-white dark:bg-[#0F1B36] p-2.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:justify-between min-w-0"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                                        Izin / Sakit
                                    </span>
                                    <div aria-hidden="true" className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
                                            clinical_notes
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-black font-mono text-purple-600 dark:text-purple-400">
                                    <CountUp value={Number(summaryStats.izin_sakit ?? 0)} />
                                </div>
                                <div className="mt-1 hidden sm:block text-[10px] text-purple-700 dark:text-purple-400/80 truncate">
                                    Dispensasi &amp; Sakit
                                </div>
                            </motion.div>

                            {/* Card 6: Tingkat Kehadiran % */}
                            <motion.div
                                variants={itemVariants}
                                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                                className="rounded-2xl sm:rounded-3xl border border-royal-blue/20 dark:border-sky-500/20 bg-white dark:bg-[#0F1B36] p-2.5 sm:p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:justify-between min-w-0"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] sm:text-[11px] font-bold text-royal-blue dark:text-sky-400 uppercase tracking-wider">
                                        Kehadiran
                                    </span>
                                    <div aria-hidden="true" className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl bg-royal-blue/10 dark:bg-sky-500/10 text-royal-blue dark:text-sky-400">
                                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
                                            analytics
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-1 sm:mt-2 text-lg sm:text-2xl font-black font-mono text-royal-blue dark:text-sky-400">
                                    <CountUp
                                        value={Number(summaryStats.success_rate ?? 0)}
                                        decimals={Number.isInteger(Number(summaryStats.success_rate ?? 0)) ? 0 : 1}
                                        suffix="%"
                                    />
                                </div>
                                <div className="mt-2 w-full bg-slate-100 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{
                                            width: `${Math.min(100, summaryStats.success_rate ?? 0)}%`,
                                        }}
                                        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                                        className="bg-royal-blue dark:bg-sky-500 h-1.5 rounded-full"
                                    />
                                </div>
                            </motion.div>
                        </motion.div>
                    )}

                    {/* Main Content Container */}
                    <div className="overflow-hidden rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] shadow-xs">
                        <div className="p-3.5 sm:p-6 text-gray-900 dark:text-slate-100">
                            {/* Navigation Bar: Responsive Tabs & View Switcher */}
                            <div className="flex flex-col gap-3.5 border-b border-slate-200/70 dark:border-white/[0.08] pb-5 mb-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    {/* Responsive Tabs */}
                                    <div className="inline-flex rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/30 p-1 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => handleTabSwitch('presensi')}
                                            className={`relative inline-flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 font-bold transition-colors min-h-[44px] lg:min-h-[38px] ${
                                                currentTab === 'presensi'
                                                    ? 'text-white'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            {currentTab === 'presensi' && (
                                                <motion.div
                                                    layoutId="historyActiveTab"
                                                    transition={{
                                                        type: 'spring' as const,
                                                        stiffness: 450,
                                                        damping: 32,
                                                    }}
                                                    className="absolute inset-0 rounded-xl bg-deep-navy dark:bg-sky-600 shadow-sm"
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[17px]">
                                                    how_to_reg
                                                </span>
                                                <span className="hidden sm:inline">
                                                    Riwayat Presensi Guru
                                                </span>
                                                <span className="sm:hidden">Presensi</span>
                                                <span className="rounded-full bg-white/20 px-1.5 sm:px-2 py-0.2 text-[10px] font-mono">
                                                    {records?.total || 0}
                                                </span>
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleTabSwitch('audit')}
                                            className={`relative inline-flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-2 font-bold transition-colors min-h-[44px] lg:min-h-[38px] ${
                                                currentTab === 'audit'
                                                    ? 'text-white'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            {currentTab === 'audit' && (
                                                <motion.div
                                                    layoutId="historyActiveTab"
                                                    transition={{
                                                        type: 'spring' as const,
                                                        stiffness: 450,
                                                        damping: 32,
                                                    }}
                                                    className="absolute inset-0 rounded-xl bg-deep-navy dark:bg-sky-600 shadow-sm"
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[17px]">
                                                    history_edu
                                                </span>
                                                <span className="hidden sm:inline">
                                                    Audit Log Sistem
                                                </span>
                                                <span className="sm:hidden">Audit Log</span>
                                                <span className="rounded-full bg-white/20 px-1.5 sm:px-2 py-0.2 text-[10px] font-mono">
                                                    {activities?.total || 0}
                                                </span>
                                            </span>
                                        </button>
                                    </div>

                                    {/* View Mode Switcher (Kartu vs Tabel) */}
                                    {currentTab === 'presensi' && (
                                        <div className="inline-flex rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/30 p-1 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('cards')}
                                                className={`relative px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 text-xs transition-all min-h-[44px] lg:min-h-[32px] ${
                                                    viewMode === 'cards'
                                                        ? 'text-deep-navy dark:text-white'
                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                                                }`}
                                                title="Tampilan Kartu Modern"
                                            >
                                                {viewMode === 'cards' && (
                                                    <motion.div
                                                        layoutId="historyViewModePill"
                                                        transition={{
                                                            type: 'spring' as const,
                                                            stiffness: 500,
                                                            damping: 35,
                                                        }}
                                                        className="absolute inset-0 rounded-lg bg-white dark:bg-sky-600 shadow-xs"
                                                    />
                                                )}
                                                <span className="relative z-10 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[16px]">
                                                        dashboard
                                                    </span>
                                                    <span>Kartu</span>
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setViewMode('table')}
                                                className={`relative px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 text-xs transition-all min-h-[44px] lg:min-h-[32px] ${
                                                    viewMode === 'table'
                                                        ? 'text-deep-navy dark:text-white'
                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                                                }`}
                                                title="Tampilan Tabel Lengkap"
                                            >
                                                {viewMode === 'table' && (
                                                    <motion.div
                                                        layoutId="historyViewModePill"
                                                        transition={{
                                                            type: 'spring' as const,
                                                            stiffness: 500,
                                                            damping: 35,
                                                        }}
                                                        className="absolute inset-0 rounded-lg bg-white dark:bg-sky-600 shadow-xs"
                                                    />
                                                )}
                                                <span className="relative z-10 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[16px]">
                                                        table_rows
                                                    </span>
                                                    <span>Tabel</span>
                                                </span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Interactive Quick-Filter Status Chips Bar */}
                                {currentTab === 'presensi' && (
                                    <div className="relative w-full">
                                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none w-full">
                                            {statusChips.map((chip) => {
                                                const isActive =
                                                    (status === '' && chip.id === '') ||
                                                    status === chip.id ||
                                                    (chip.id === 'hadir' && status === 'success') ||
                                                    (chip.id === 'izin_sakit' &&
                                                        (status === 'izin' || status === 'sakit'));

                                                return (
                                                    <button
                                                        key={chip.id}
                                                        type="button"
                                                        onClick={() => handleQuickStatus(chip.id)}
                                                        className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all min-h-[44px] lg:min-h-[38px] ${
                                                            isActive
                                                                ? 'text-white shadow-xs'
                                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100/80 dark:bg-white/5 hover:bg-slate-200/80 dark:hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {isActive && (
                                                            <motion.div
                                                                layoutId="historyStatusChipPill"
                                                                transition={{
                                                                    type: 'spring' as const,
                                                                    stiffness: 500,
                                                                    damping: 35,
                                                                }}
                                                                className="absolute inset-0 rounded-xl bg-deep-navy dark:bg-sky-600 shadow-xs"
                                                            />
                                                        )}
                                                        <span className="relative z-10 flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[15px]">
                                                                {chip.icon}
                                                            </span>
                                                            <span>{chip.label}</span>
                                                            <span
                                                                className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                                                                    isActive
                                                                        ? 'bg-white/20 text-white'
                                                                        : 'bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                                                                }`}
                                                            >
                                                                {chip.count}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Advanced Filter Controls Form */}
                                <form
                                    onSubmit={handleFilter}
                                    className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1"
                                >
                                    <div className="relative flex-1 min-w-[220px] w-full sm:w-auto">
                                        <span aria-hidden="true" className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-slate-400 dark:text-slate-500">
                                            search
                                        </span>
                                        <input
                                            type="text"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder={
                                                currentTab === 'presensi'
                                                    ? 'Cari nama guru / ID (S01) / status...'
                                                    : 'Cari aktivitas sistem / event / aktor...'
                                            }
                                            className="w-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/80 px-3 py-2 pl-9 text-xs text-deep-navy dark:text-white placeholder:text-slate-400 focus:border-royal-blue dark:focus:border-sky-400 focus:ring-1 focus:ring-royal-blue transition-all min-h-[44px] lg:min-h-[38px]"
                                        />
                                        {search && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSearch('');
                                                    router.get(
                                                        route('attendance.history'),
                                                        { tab: currentTab, search: '', date, status },
                                                        { preserveState: true, replace: true },
                                                    );
                                                }}
                                                aria-label="Hapus kata pencarian"
                                                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">
                                                    close
                                                </span>
                                            </button>
                                        )}
                                    </div>

                                    {currentTab === 'presensi' && (
                                        <div className="w-full sm:w-auto">
                                            <label htmlFor="history-date" className="sr-only">
                                                Tanggal presensi
                                            </label>
                                            <input
                                                id="history-date"
                                                type="date"
                                                value={date}
                                                onChange={(e) => setDate(e.target.value)}
                                                className="w-full sm:w-auto rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/80 px-3 py-2 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue dark:focus:border-sky-400 focus:ring-1 focus:ring-royal-blue min-h-[44px] lg:min-h-[38px]"
                                            />
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.96 }}
                                            type="submit"
                                            className="flex-1 sm:flex-none rounded-xl bg-deep-navy dark:bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-royal-blue transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[44px] lg:min-h-[38px]"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">
                                                filter_list
                                            </span>
                                            <span>Terapkan</span>
                                        </motion.button>

                                        {(search || date || status) && (
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.96 }}
                                                type="button"
                                                onClick={handleResetFilter}
                                                className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-deep-navy dark:hover:text-white transition-colors min-h-[44px] lg:min-h-[38px]"
                                            >
                                                Reset
                                            </motion.button>
                                        )}
                                    </div>
                                </form>
                            </div>

                            <motion.div
                                ref={listTopRef}
                                aria-busy={navigating}
                                animate={{ opacity: navigating ? 0.55 : 1 }}
                                transition={{ duration: 0.2 }}
                                className="scroll-mt-24"
                            >
                            {/* TAB 1: PRESENSI RECORDS CONTENT */}
                            <AnimatePresence mode="wait">
                                {currentTab === 'presensi' && (
                                    <motion.div
                                        key="presensi-tab-content"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {/* VIEW MODE A: Modern Responsive Cards Grid */}
                                        <div
                                            className={
                                                viewMode === 'cards'
                                                    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4'
                                                    : 'hidden'
                                            }
                                        >
                                            <AnimatePresence mode="popLayout">
                                                {records.data.map((record: any, idx: number) => {
                                                    const statusStr = (record.status || '').toLowerCase();
                                                    const isSuccess =
                                                        statusStr === 'success' || statusStr === 'hadir';
                                                    const isLate = statusStr === 'terlambat';
                                                    const isPulang = statusStr === 'pulang';
                                                    const isIzin = statusStr === 'izin';
                                                    const isSakit = statusStr === 'sakit';
                                                    const meta = record.metadata || {};

                                                    return (
                                                        <motion.div
                                                            key={record.id}
                                                            layout
                                                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.96 }}
                                                            transition={{
                                                                ...SPRING_SOFT,
                                                                delay: Math.min(idx * 0.03, 0.3),
                                                            }}
                                                            whileHover={{
                                                                y: -3,
                                                                transition: SPRING_SOFT,
                                                            }}
                                                            whileTap={{ scale: 0.99 }}
                                                            className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0B1528] p-4 sm:p-5 shadow-xs hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md transition-all flex flex-col justify-between"
                                                        >
                                                            {/* Left Color Accent Bar */}
                                                            <div
                                                                className={`absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full ${
                                                                    isSakit
                                                                        ? 'bg-purple-500'
                                                                        : isIzin
                                                                          ? 'bg-amber-500'
                                                                          : isPulang
                                                                            ? 'bg-sky-500'
                                                                            : isSuccess
                                                                              ? 'bg-emerald-500'
                                                                              : isLate
                                                                                ? 'bg-amber-500'
                                                                                : 'bg-rose-500'
                                                                }`}
                                                            />

                                                            {/* Top Section: Teacher Details & Time */}
                                                            <div className="flex items-start justify-between gap-3 pl-2">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="relative shrink-0">
                                                                        <TeacherAvatar
                                                                            name={record.user?.name ?? '?'}
                                                                            url={record.user?.avatar_url}
                                                                            className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 text-slate-800 dark:text-slate-100 text-xs border border-slate-200/80 dark:border-white/10 shadow-xs"
                                                                        />
                                                                        <span
                                                                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#0B1528] ${
                                                                                isSakit
                                                                                    ? 'bg-purple-500'
                                                                                    : isIzin
                                                                                      ? 'bg-amber-500'
                                                                                      : isPulang
                                                                                        ? 'bg-sky-500'
                                                                                        : isSuccess
                                                                                          ? 'bg-emerald-500'
                                                                                          : isLate
                                                                                            ? 'bg-amber-500'
                                                                                            : 'bg-rose-500'
                                                                            }`}
                                                                        />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm truncate">
                                                                                {record.user
                                                                                    ? record.user.name
                                                                                    : 'Guru Tidak Dikenal'}
                                                                            </span>
                                                                            {record.user?.embedding_id && (
                                                                                <span className="rounded-lg bg-sky-50 dark:bg-sky-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-royal-blue dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
                                                                                    {record.user.embedding_id}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                                                                            {record.user?.email || '-'}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-col items-end shrink-0 text-right">
                                                                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-[13px] text-slate-400 dark:text-slate-500">
                                                                            schedule
                                                                        </span>
                                                                        {record.time} WIB
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                                                        {record.date}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Middle Section: Status & Decision Reason */}
                                                            <div className="my-3 pl-2 flex flex-col gap-1.5">
                                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                                    <span
                                                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                                                            isSakit
                                                                                ? 'bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300'
                                                                                : isIzin
                                                                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                                                                                  : isPulang
                                                                                    ? 'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300'
                                                                                    : isSuccess
                                                                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                                                      : isLate
                                                                                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                                                                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                        }`}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[12px]">
                                                                            {isSakit
                                                                                ? 'medical_services'
                                                                                : isIzin
                                                                                  ? 'event_note'
                                                                                  : isPulang
                                                                                    ? 'logout'
                                                                                    : isSuccess
                                                                                      ? 'check'
                                                                                      : isLate
                                                                                        ? 'warning'
                                                                                        : 'close'}
                                                                        </span>
                                                                        <span>
                                                                            {isSakit
                                                                                ? 'Sakit'
                                                                                : isIzin
                                                                                  ? 'Izin'
                                                                                  : isPulang
                                                                                    ? 'Presensi Pulang'
                                                                                    : isSuccess
                                                                                      ? 'Hadir (ACCEPT)'
                                                                                      : isLate
                                                                                        ? 'Terlambat'
                                                                                        : 'Gagal / Tolak'}
                                                                        </span>
                                                                    </span>

                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 italic truncate max-w-[180px]">
                                                                        {record.decision_reason ||
                                                                            'Verifikasi Biometrik'}
                                                                    </span>
                                                                </div>

                                                                {/* Telemetry Chips Cluster */}
                                                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                                    {meta.euclidean_distance !==
                                                                        undefined &&
                                                                        meta.euclidean_distance !==
                                                                            null && (
                                                                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200/80 dark:border-white/10">
                                                                                L2:{' '}
                                                                                <strong
                                                                                    className={
                                                                                        Number(
                                                                                            meta.euclidean_distance,
                                                                                        ) <= 0.40
                                                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                                                            : 'text-amber-600 dark:text-amber-400'
                                                                                    }
                                                                                >
                                                                                    {Number(
                                                                                        meta.euclidean_distance,
                                                                                    ).toFixed(3)}
                                                                                </strong>
                                                                            </span>
                                                                        )}
                                                                    {meta.pad_pred && (
                                                                        <span
                                                                            className={`font-mono text-[10px] px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                                                                meta.pad_pred ===
                                                                                'BONA_FIDE'
                                                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                            }`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[11px]">
                                                                                {meta.pad_pred ===
                                                                                'BONA_FIDE'
                                                                                    ? 'verified_user'
                                                                                    : 'gpp_bad'}
                                                                            </span>
                                                                            <span>
                                                                                {meta.pad_pred}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                    {(meta.ear_blinks != null || meta.mar_mouths != null) && (
                                                                        <span className="font-mono text-[10px] bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-lg border border-slate-200/80 dark:border-white/10">
                                                                            {meta.ear_blinks != null ? `${meta.ear_blinks}x` : '–'} kedip •{' '}
                                                                            {meta.mar_mouths != null ? `${meta.mar_mouths}x` : '–'} mulut
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Bab 5 Scenario Mini Badges */}
                                                                {meta.evaluation_bab5 && meta.evaluation_bab5.evaluated !== false && (
                                                                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-white/5">
                                                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                                                            Bab 5:
                                                                        </span>
                                                                        <span
                                                                            className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
                                                                                meta.evaluation_bab5.s1_decision === 1
                                                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                            }`}
                                                                            title="Skenario 1: FaceNet Stand-alone (Threshold <= 0.40)"
                                                                        >
                                                                            S1: {meta.evaluation_bab5.s1_decision === 1 ? 'ACC' : 'REJ'}
                                                                        </span>
                                                                        <span
                                                                            className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
                                                                                meta.evaluation_bab5.s2_decision === 1
                                                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                            }`}
                                                                            title="Skenario 2: Rule-Based Gate (FaceNet + EAR & MAR Liveness)"
                                                                        >
                                                                            S2: {meta.evaluation_bab5.s2_decision === 1 ? 'ACC' : 'REJ'}
                                                                        </span>
                                                                        <span
                                                                            className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
                                                                                meta.evaluation_bab5.s3_decision === 1
                                                                                    ? 'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300'
                                                                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                            }`}
                                                                            title={`Skenario 3: Weighted Fusion (S_final = ${meta.evaluation_bab5.s_final})`}
                                                                        >
                                                                            S3: {meta.evaluation_bab5.s3_decision === 1 ? 'ACC' : 'REJ'} ({meta.evaluation_bab5.s_final})
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Bottom Actions */}
                                                            <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2 pl-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setSelectedDetailRecord(record)
                                                                    }
                                                                    className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 rounded-xl bg-royal-blue/10 dark:bg-sky-500/15 border border-royal-blue/20 dark:border-sky-500/25 px-2.5 py-1.5 text-[11px] font-bold text-royal-blue dark:text-sky-300 hover:bg-royal-blue/20 dark:hover:bg-sky-500/25 transition-all shadow-xs"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">
                                                                        visibility
                                                                    </span>
                                                                    <span>Pratinjau Telemetri</span>
                                                                </button>

                                                                <div className="flex items-center gap-1.5">
                                                                    <a
                                                                        href={route(
                                                                            'attendance.export.subject',
                                                                            record.id,
                                                                        )}
                                                                        className="inline-flex items-center justify-center h-11 w-11 lg:h-8 lg:w-8 rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/80 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all shadow-xs"
                                                                        title="Unduh CSV riwayat evaluasi subjek ini"
                                                                        aria-label="Unduh CSV subjek ini"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[15px]">
                                                                            download
                                                                        </span>
                                                                    </a>

                                                                    <Link
                                                                        href={route(
                                                                            'attendance.show',
                                                                            record.id,
                                                                        )}
                                                                        className="inline-flex items-center justify-center h-11 w-11 lg:h-8 lg:w-8 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-deep-navy dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-xs"
                                                                        title="Buka halaman detail lengkap"
                                                                        aria-label="Buka detail presensi"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[15px]">
                                                                            chevron_right
                                                                        </span>
                                                                    </Link>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => promptDeleteRecord(record)}
                                                                        className="inline-flex items-center justify-center h-11 w-11 lg:h-8 lg:w-8 rounded-xl border border-rose-200/80 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 active:scale-95 transition-all shadow-xs cursor-pointer"
                                                                        title="Hapus catatan presensi ini"
                                                                        aria-label="Hapus catatan"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[15px]">
                                                                            delete
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </div>

                                        {/* VIEW MODE B: Desktop Detailed Table View */}
                                        <div
                                            className={
                                                viewMode === 'table'
                                                    ? 'overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/10'
                                                    : 'hidden'
                                            }
                                        >
                                            <table className="w-full whitespace-nowrap text-left text-xs text-gray-600 dark:text-slate-300">
                                                <thead className="bg-slate-50/90 dark:bg-black/40 text-[11px] font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 border-b border-slate-200/80 dark:border-white/10">
                                                    <tr>
                                                        <th className="px-5 py-3.5">Subjek / Guru</th>
                                                        <th className="px-5 py-3.5">Waktu Presensi</th>
                                                        <th className="px-5 py-3.5">Status &amp; Keputusan</th>
                                                        <th className="px-5 py-3.5">
                                                            Telemetri (FaceNet + EMAR)
                                                        </th>
                                                        <th className="px-5 py-3.5 text-right">
                                                            Aksi &amp; Unduh
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
                                                    {records.data.map((record: any) => {
                                                        const statusStr = (record.status || '').toLowerCase();
                                                        const isSuccess =
                                                            statusStr === 'success' || statusStr === 'hadir';
                                                        const isLate = statusStr === 'terlambat';
                                                        const isPulang = statusStr === 'pulang';
                                                        const isIzin = statusStr === 'izin';
                                                        const isSakit = statusStr === 'sakit';
                                                        const meta = record.metadata || {};

                                                        return (
                                                            <tr
                                                                key={record.id}
                                                                className="bg-white dark:bg-[#0F1B36] hover:bg-slate-50/80 dark:hover:bg-[#152345] transition-colors"
                                                            >
                                                                {/* Subject & Teacher Info */}
                                                                <td className="px-5 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <TeacherAvatar
                                                                            name={record.user?.name ?? '?'}
                                                                            url={record.user?.avatar_url}
                                                                            className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 text-deep-navy dark:text-white text-xs shadow-xs"
                                                                        />
                                                                        <div>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="font-bold text-deep-navy dark:text-white text-sm">
                                                                                    {record.user
                                                                                        ? record.user.name
                                                                                        : 'Guru Tidak Dikenal'}
                                                                                </span>
                                                                                {record.user?.embedding_id && (
                                                                                    <span className="rounded-lg bg-sky-50 dark:bg-sky-500/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-royal-blue dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
                                                                                        {record.user.embedding_id}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                                                                {record.user?.email || '-'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </td>

                                                                {/* Timestamp */}
                                                                <td className="px-5 py-4 font-mono">
                                                                    <div className="font-bold text-deep-navy dark:text-white text-xs flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-[14px] text-slate-400 dark:text-slate-500">
                                                                            schedule
                                                                        </span>
                                                                        {record.time} WIB
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                                                        {record.date}
                                                                    </div>
                                                                </td>

                                                                {/* Status Badge */}
                                                                <td className="px-5 py-4">
                                                                    <div className="flex flex-col gap-1 items-start">
                                                                        <span
                                                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                                                                isSakit
                                                                                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                                                                                    : isIzin
                                                                                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                                                                      : isPulang
                                                                                        ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300'
                                                                                        : isSuccess
                                                                                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                                                                          : isLate
                                                                                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                                                                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                                                            }`}
                                                                        >
                                                                            <span
                                                                                className={`h-1.5 w-1.5 rounded-full ${
                                                                                    isSakit
                                                                                        ? 'bg-purple-500'
                                                                                        : isIzin
                                                                                          ? 'bg-amber-500'
                                                                                          : isPulang
                                                                                            ? 'bg-sky-500'
                                                                                            : isSuccess
                                                                                              ? 'bg-emerald-500'
                                                                                              : isLate
                                                                                                ? 'bg-amber-500'
                                                                                                : 'bg-rose-500'
                                                                                }`}
                                                                            />
                                                                            <span>
                                                                                {isSakit
                                                                                    ? 'Sakit (Dokter)'
                                                                                    : isIzin
                                                                                      ? 'Izin Dinas'
                                                                                      : isPulang
                                                                                        ? 'Presensi Pulang'
                                                                                        : isSuccess
                                                                                          ? 'Hadir (ACCEPT)'
                                                                                          : isLate
                                                                                            ? 'Terlambat'
                                                                                            : 'Gagal / Tolak'}
                                                                            </span>
                                                                        </span>
                                                                        <span
                                                                            className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[200px] truncate"
                                                                            title={record.decision_reason}
                                                                        >
                                                                            {record.decision_reason}
                                                                        </span>
                                                                    </div>
                                                                </td>

                                                                {/* Telemetry Metrics */}
                                                                <td className="px-5 py-4">
                                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                                                                        <span className="text-slate-500 dark:text-slate-400">
                                                                            Dist:{' '}
                                                                            <strong className="text-deep-navy dark:text-white">
                                                                                {meta.euclidean_distance !==
                                                                                    null &&
                                                                                meta.euclidean_distance !==
                                                                                    undefined
                                                                                    ? Number(
                                                                                          meta.euclidean_distance,
                                                                                      ).toFixed(3)
                                                                                    : '-'}
                                                                            </strong>
                                                                        </span>
                                                                        <span className="text-slate-500 dark:text-slate-400">
                                                                            PAD:{' '}
                                                                            <strong
                                                                                className={
                                                                                    meta.pad_pred ===
                                                                                    'BONA_FIDE'
                                                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                                                        : 'text-rose-600 dark:text-rose-400'
                                                                                }
                                                                            >
                                                                                {meta.pad_pred || '-'}
                                                                            </strong>
                                                                        </span>
                                                                        <span className="text-slate-500 dark:text-slate-400">
                                                                            EAR:{' '}
                                                                            <strong className="text-deep-navy dark:text-white">
                                                                                {meta.ear_blinks != null ? `${meta.ear_blinks}x` : '–'}
                                                                            </strong>
                                                                        </span>
                                                                        <span className="text-slate-500 dark:text-slate-400">
                                                                            MAR:{' '}
                                                                            <strong className="text-deep-navy dark:text-white">
                                                                                {meta.mar_mouths != null ? `${meta.mar_mouths}x` : '–'}
                                                                            </strong>
                                                                        </span>
                                                                        {meta.evaluation_bab5 && meta.evaluation_bab5.evaluated !== false && (
                                                                            <div className="col-span-2 flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-100 dark:border-white/5 text-[9px] font-mono">
                                                                                <span className="text-slate-400 font-sans font-bold">
                                                                                    Bab 5:
                                                                                </span>
                                                                                <span
                                                                                    className={`px-1 rounded font-bold ${
                                                                                        meta.evaluation_bab5.s1_decision === 1
                                                                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                                                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                                                                    }`}
                                                                                    title="Skenario 1: FaceNet Stand-alone"
                                                                                >
                                                                                    S1:{meta.evaluation_bab5.s1_decision === 1 ? 'ACC' : 'REJ'}
                                                                                </span>
                                                                                <span
                                                                                    className={`px-1 rounded font-bold ${
                                                                                        meta.evaluation_bab5.s2_decision === 1
                                                                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                                                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                                                                    }`}
                                                                                    title="Skenario 2: Rule-Based Gate"
                                                                                >
                                                                                    S2:{meta.evaluation_bab5.s2_decision === 1 ? 'ACC' : 'REJ'}
                                                                                </span>
                                                                                <span
                                                                                    className={`px-1 rounded font-bold ${
                                                                                        meta.evaluation_bab5.s3_decision === 1
                                                                                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                                                                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                                                                    }`}
                                                                                    title={`Skenario 3: Weighted Fusion (${meta.evaluation_bab5.s_final})`}
                                                                                >
                                                                                    S3:{meta.evaluation_bab5.s3_decision === 1 ? 'ACC' : 'REJ'} ({meta.evaluation_bab5.s_final})
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>

                                                                {/* Actions */}
                                                                <td className="px-5 py-4 text-right">
                                                                    <div className="inline-flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setSelectedDetailRecord(
                                                                                    record,
                                                                                )
                                                                            }
                                                                            className="inline-flex items-center gap-1 rounded-xl bg-royal-blue/10 dark:bg-sky-500/15 border border-royal-blue/20 dark:border-sky-500/25 px-2.5 py-1.5 text-xs font-bold text-royal-blue dark:text-sky-300 hover:bg-royal-blue/20 dark:hover:bg-sky-500/25 transition-all shadow-xs"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[15px]">
                                                                                visibility
                                                                            </span>
                                                                            <span>Pratinjau</span>
                                                                        </button>

                                                                        <a
                                                                            href={route(
                                                                                'attendance.export.subject',
                                                                                record.id,
                                                                            )}
                                                                            className="inline-flex items-center gap-1 rounded-xl border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1.5 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all shadow-xs"
                                                                            title={`Unduh file CSV riwayat evaluasi presensi ${record.user?.name || 'Subjek'}`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[15px]">
                                                                                download
                                                                            </span>
                                                                            <span>CSV</span>
                                                                        </a>

                                                                        <Link
                                                                            href={route(
                                                                                'attendance.show',
                                                                                record.id,
                                                                            )}
                                                                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-xs font-bold text-deep-navy dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-xs"
                                                                        >
                                                                            <span>Detail</span>
                                                                            <span className="material-symbols-outlined text-[14px]">
                                                                                chevron_right
                                                                            </span>
                                                                        </Link>

                                                                        <button
                                                                            type="button"
                                                                            onClick={() => promptDeleteRecord(record)}
                                                                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200/80 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-xs"
                                                                            title={`Hapus riwayat presensi ${record.user?.name || 'Subjek'}`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[15px]">
                                                                                delete
                                                                            </span>
                                                                            <span className="sr-only sm:not-sr-only">Hapus</span>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Empty State */}
                                        {records.data.length === 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.96 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="py-14 text-center"
                                            >
                                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 mb-3 border border-slate-200/80 dark:border-white/10">
                                                    <span className="material-symbols-outlined text-[32px]">
                                                        manage_search
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-base text-deep-navy dark:text-white">
                                                    Tidak ada riwayat presensi yang cocok
                                                </h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                                                    Kriteria pencarian atau filter status yang Anda
                                                    pilih tidak menghasilkan data. Coba sesuaikan
                                                    kata kunci atau bersihkan filter.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={handleResetFilter}
                                                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-deep-navy dark:bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-royal-blue transition-colors shadow-xs"
                                                >
                                                    <span className="material-symbols-outlined text-[15px]">
                                                        refresh
                                                    </span>
                                                    <span>Bersihkan Semua Filter</span>
                                                </button>
                                            </motion.div>
                                        )}

                                        {/* Pagination Controls */}
                                        <HistoryPagination
                                            page={records}
                                            noun="riwayat presensi"
                                            onNavigated={() => scrollToTopOf(listTopRef.current)}
                                        />
                                    </motion.div>
                                )}

                                {/* TAB 2: SYSTEM AUDIT / ACTIVITY LOGS */}
                                {currentTab === 'audit' && (
                                    <motion.div
                                        key="audit-tab-content"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-4"
                                    >
                                        {/* Audit Controls & Quick Category Chips Strip */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0B1528] shadow-xs">
                                            {/* Category Chips */}
                                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                                                {[
                                                    { id: '', label: 'Semua Event', icon: 'list_alt' },
                                                    { id: 'attendance', label: 'Presensi Biometrik', icon: 'face' },
                                                    { id: 'enrollment', label: 'Registrasi Wajah', icon: 'how_to_reg' },
                                                    { id: 'auth', label: 'Autentikasi & Sesi', icon: 'security' },
                                                    { id: 'system', label: 'Sistem & Hapus', icon: 'delete_sweep' },
                                                ].map((cat) => {
                                                    const isActActive =
                                                        activityEvent === cat.id ||
                                                        (cat.id === '' && (!activityEvent || activityEvent === 'all'));

                                                    return (
                                                        <button
                                                            key={cat.id}
                                                            type="button"
                                                            onClick={() => handleQuickActivityEvent(cat.id)}
                                                            className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all min-h-[44px] lg:min-h-[34px] ${
                                                                isActActive
                                                                    ? 'text-white shadow-xs'
                                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100/80 dark:bg-white/5 hover:bg-slate-200/80 dark:hover:bg-white/10'
                                                            }`}
                                                        >
                                                            {isActActive && (
                                                                <motion.div
                                                                    layoutId="historyAuditFilterPill"
                                                                    transition={{
                                                                        type: 'spring' as const,
                                                                        stiffness: 500,
                                                                        damping: 35,
                                                                    }}
                                                                    className="absolute inset-0 rounded-xl bg-deep-navy dark:bg-sky-600 shadow-xs"
                                                                />
                                                            )}
                                                            <span className="relative z-10 flex items-center gap-1.5">
                                                                <span className="material-symbols-outlined text-[15px]">
                                                                    {cat.icon}
                                                                </span>
                                                                <span>{cat.label}</span>
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Action Buttons: Ekspor Log CSV */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <motion.a
                                                    whileHover={{ y: -1 }}
                                                    whileTap={{ scale: 0.97 }}
                                                    href={route('attendance.export.activities', {
                                                        activity_event: activityEvent,
                                                        search,
                                                    })}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-royal-blue/30 dark:border-sky-500/30 bg-royal-blue/10 dark:bg-sky-500/10 px-3.5 py-1.5 text-xs font-bold text-royal-blue dark:text-sky-300 hover:bg-royal-blue/20 dark:hover:bg-sky-500/20 transition-all shadow-xs min-h-[44px] lg:min-h-[34px]"
                                                    title="Unduh seluruh catatan aktivitas audit sistem dalam format CSV"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">
                                                        download
                                                    </span>
                                                    <span>Ekspor Log CSV</span>
                                                </motion.a>
                                            </div>
                                        </div>

                                        {/* Audit Table */}
                                        <div className="md:overflow-x-auto md:rounded-2xl md:border md:border-slate-200/80 md:dark:border-white/10">
                                            <table className="block md:table w-full md:whitespace-nowrap text-left text-xs text-gray-600 dark:text-slate-300">
                                                <thead className="hidden md:table-header-group bg-slate-50/90 dark:bg-black/40 text-[11px] font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 border-b border-slate-200/80 dark:border-white/10">
                                                    <tr>
                                                        <th className="px-5 py-3.5">Waktu Kejadian</th>
                                                        <th className="px-5 py-3.5">
                                                            Aktor / Pengguna
                                                        </th>
                                                        <th className="px-5 py-3.5">Event Sistem</th>
                                                        <th className="px-5 py-3.5">
                                                            Deskripsi Aktivitas
                                                        </th>
                                                        <th className="px-5 py-3.5 text-right">Aksi</th>
                                                    </tr>
                                                </thead>
                                                <motion.tbody
                                                    variants={containerVariants}
                                                    initial="hidden"
                                                    animate="show"
                                                    className="block md:table-row-group space-y-2.5 md:space-y-0 md:divide-y md:divide-slate-200/70 md:dark:divide-white/5"
                                                >
                                                    {activities?.data?.map((act: any) => {
                                                        const evLower = (act.event || act.log_name || '').toLowerCase();
                                                        const isPresensi =
                                                            evLower.includes('attendance') ||
                                                            evLower.includes('biometric') ||
                                                            evLower.includes('presensi');
                                                        const isEnroll =
                                                            evLower.includes('enroll') ||
                                                            evLower.includes('wajah');
                                                        const isAuth =
                                                            evLower.includes('login') ||
                                                            evLower.includes('logout') ||
                                                            evLower.includes('auth');
                                                        const isDanger =
                                                            evLower.includes('delete') ||
                                                            evLower.includes('clear') ||
                                                            evLower.includes('hapus');

                                                        const hasBab5 = ['s1', 's2', 's3'].some(
                                                            (k) => act.properties?.[k] !== undefined && act.properties?.[k] !== null,
                                                        );

                                                        return (
                                                            <motion.tr
                                                                key={act.id}
                                                                variants={itemVariants}
                                                                className="block md:table-row rounded-2xl md:rounded-none border md:border-0 border-slate-200/80 dark:border-white/10 p-3.5 md:p-0 bg-white dark:bg-[#0F1B36] hover:bg-slate-50/80 dark:hover:bg-[#152345] transition-colors"
                                                            >
                                                                <td className="block md:table-cell md:px-5 md:py-4 font-mono">
                                                                    <div className="font-bold text-deep-navy dark:text-white text-xs flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-[13px] text-slate-400 dark:text-slate-500">
                                                                            schedule
                                                                        </span>
                                                                        {act.time} WIB
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                                                        {act.date} ({act.created_at_human})
                                                                    </div>
                                                                </td>
                                                                <td className="block md:table-cell pt-2 md:px-5 md:py-4 font-bold text-deep-navy dark:text-white">
                                                                    <div className="flex items-center gap-2">
                                                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-400">
                                                                            account_circle
                                                                        </span>
                                                                        <div>
                                                                            <div>{act.causer_name}</div>
                                                                            {act.causer_email && act.causer_email !== '-' && (
                                                                                <div className="text-[10px] font-normal text-slate-400 font-mono">
                                                                                    {act.causer_email}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="block md:table-cell pt-2 md:px-5 md:py-4">
                                                                    <div className="flex flex-col gap-1 items-start">
                                                                        <span
                                                                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold border ${
                                                                                isDanger
                                                                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                                                                    : isPresensi
                                                                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                                                      : isEnroll
                                                                                        ? 'bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300'
                                                                                        : isAuth
                                                                                          ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                                                                                          : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200/70 dark:border-white/10'
                                                                            }`}
                                                                        >
                                                                            {act.event}
                                                                        </span>
                                                                        {hasBab5 && (
                                                                            <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
                                                                                Bab 5:{' '}
                                                                                {(['s1', 's2', 's3'] as const).map((k, i) => {
                                                                                    const verdict = bab5Verdict(act.properties?.[k]);
                                                                                    return (
                                                                                        <span key={k}>
                                                                                            {i > 0 && ' • '}
                                                                                            <strong
                                                                                                className={
                                                                                                    verdict === 'ACC'
                                                                                                        ? k === 's3'
                                                                                                            ? 'text-sky-600 dark:text-sky-400'
                                                                                                            : 'text-emerald-600 dark:text-emerald-400'
                                                                                                        : verdict === 'REJ'
                                                                                                          ? 'text-rose-600 dark:text-rose-400'
                                                                                                          : 'text-slate-500 dark:text-slate-400'
                                                                                                }
                                                                                            >
                                                                                                {k.toUpperCase()}:{verdict}
                                                                                            </strong>
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="block md:table-cell pt-2 md:px-5 md:py-4 font-medium text-slate-700 dark:text-slate-200 md:max-w-xs md:truncate">
                                                                    <span title={act.description}>
                                                                        {act.description}
                                                                    </span>
                                                                </td>
                                                                <td className="block md:table-cell pt-3 md:px-5 md:py-4 md:text-right">
                                                                    <div className="inline-flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setSelectedDetailActivity(act)}
                                                                            className="inline-flex min-h-[44px] md:min-h-0 items-center gap-1 rounded-xl bg-royal-blue/10 dark:bg-sky-500/15 border border-royal-blue/20 dark:border-sky-500/25 px-3 md:px-2.5 py-1.5 text-xs font-bold text-royal-blue dark:text-sky-300 hover:bg-royal-blue/20 dark:hover:bg-sky-500/25 transition-all shadow-xs"
                                                                            title="Lihat detail lengkap & raw JSON aktivitas ini"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[15px]">
                                                                                visibility
                                                                            </span>
                                                                            <span>Detail</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => promptDeleteActivity(act)}
                                                                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 justify-center items-center gap-1 rounded-xl border border-rose-200/80 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-xs"
                                                                            title="Hapus log aktivitas ini"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[15px]">
                                                                                delete
                                                                            </span>
                                                                            <span className="sr-only sm:not-sr-only">Hapus</span>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </motion.tr>
                                                        );
                                                    })}
                                                </motion.tbody>
                                            </table>
                                        </div>

                                        {(!activities?.data || activities.data.length === 0) && (
                                            <div className="py-14 text-center">
                                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 mb-3 border border-slate-200/80 dark:border-white/10">
                                                    <span className="material-symbols-outlined text-[32px]">
                                                        history_edu
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-base text-deep-navy dark:text-white">
                                                    Belum ada catatan aktivitas sistem
                                                </h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">
                                                    Semua aktivitas sistem, verifikasi biometrik, dan
                                                    ekspor data akan otomatis tercatat di sini.
                                                </p>
                                            </div>
                                        )}

                                        {/* Pagination for Audit */}
                                        <HistoryPagination
                                            page={activities}
                                            noun="log aktivitas"
                                            onNavigated={() => scrollToTopOf(listTopRef.current)}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Single Item Delete Confirmation Modal (High-End Danger Modal) */}
            <AnimatePresence>
                {isSingleDeleteModalOpen && singleDeleteItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: 16 }}
                            transition={{ type: 'spring' as const, stiffness: 380, damping: 28 }}
                            className="w-full max-w-md overflow-hidden rounded-3xl border border-rose-500/30 bg-white dark:bg-[#0F1B36] p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
                                    <span className="material-symbols-outlined text-[28px]">
                                        delete
                                    </span>
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-deep-navy dark:text-white">
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
                                            <strong className="text-deep-navy dark:text-white">
                                                {singleDeleteItem.user?.name || 'Subjek Presensi'}
                                            </strong>
                                        </div>
                                        <div className="flex items-center justify-between font-mono text-[11px]">
                                            <span className="text-slate-500 dark:text-slate-400">Waktu &amp; Tanggal:</span>
                                            <span className="text-slate-700 dark:text-slate-300">
                                                {singleDeleteItem.time || singleDeleteItem.created_at || '-'} WIB ({singleDeleteItem.date || '-'})
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500 dark:text-slate-400">Status:</span>
                                            <span className="font-bold text-deep-navy dark:text-white uppercase">
                                                {singleDeleteItem.status}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-500 dark:text-slate-400">Aktor:</span>
                                            <strong className="text-deep-navy dark:text-white">
                                                {singleDeleteItem.causer_name || '-'}
                                            </strong>
                                        </div>
                                        <div className="flex items-center justify-between font-mono text-[11px]">
                                            <span className="text-slate-500 dark:text-slate-400">Event:</span>
                                            <span className="font-bold text-deep-navy dark:text-white">
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

                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                                Data ini akan dihapus secara permanen dari basis data sistem dan riwayat audit akan diperbarui.
                            </p>

                            <div className="flex items-center justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsSingleDeleteModalOpen(false);
                                        setSingleDeleteItem(null);
                                    }}
                                    disabled={isDeletingSingle}
                                    className="rounded-xl border border-slate-200/80 dark:border-white/10 px-4 py-2.5 text-xs font-bold text-deep-navy dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
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

            {/* Clear All Confirmation Modal (High-End Danger Modal) */}
            <AnimatePresence>
                {isClearModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: 16 }}
                            transition={{ type: 'spring' as const, stiffness: 380, damping: 28 }}
                            className="w-full max-w-md overflow-hidden rounded-3xl border border-rose-500/30 bg-white dark:bg-[#0F1B36] p-6 shadow-2xl"
                        >
                            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
                                    <span className="material-symbols-outlined text-[28px]">
                                        warning
                                    </span>
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-deep-navy dark:text-white">
                                        Hapus Semua Riwayat Presensi?
                                    </h3>
                                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                        Tindakan ini permanen &amp; tidak dapat dibatalkan
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                                Tindakan ini akan menghapus seluruh rekaman presensi guru secara
                                permanen dari database. Seluruh riwayat verifikasi biometrik dan
                                log aktivitas terkait akan dibersihkan.
                            </p>

                            {modalError && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[18px]">
                                        error
                                    </span>
                                    <span>{modalError}</span>
                                </motion.div>
                            )}

                            <label className="flex items-center gap-2.5 mb-6 cursor-pointer text-xs font-semibold text-deep-navy dark:text-white select-none p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10">
                                <input
                                    type="checkbox"
                                    checked={confirmChecked}
                                    onChange={(e) => setConfirmChecked(e.target.checked)}
                                    className="rounded-lg text-rose-600 focus:ring-rose-500 h-4 w-4 border-slate-300"
                                />
                                <span>Saya mengonfirmasi untuk menghapus seluruh data</span>
                            </label>

                            <div className="flex items-center justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setIsClearModalOpen(false)}
                                    disabled={isClearing}
                                    className="rounded-xl border border-slate-200/80 dark:border-white/10 px-4 py-2.5 text-xs font-bold text-deep-navy dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearAll}
                                    disabled={!confirmChecked || isClearing}
                                    className="rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-md shadow-rose-600/20"
                                >
                                    {isClearing ? (
                                        <>
                                            <span className="material-symbols-outlined text-[16px] animate-spin">
                                                progress_activity
                                            </span>
                                            <span>Menghapus...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">
                                                delete_forever
                                            </span>
                                            <span>Ya, Hapus Semua</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Activity Detail Inspection Modal */}
            <AnimatePresence>
                {selectedDetailActivity && (
                    <ActivityDetailModal
                        activity={selectedDetailActivity}
                        onClose={() => setSelectedDetailActivity(null)}
                        onDelete={promptDeleteActivity}
                    />
                )}
            </AnimatePresence>
            </MotionConfig>
        </AuthenticatedLayout>
    );
}
