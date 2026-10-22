import React, { useState } from 'react';
import {
    ShieldCheck,
    ShieldAlert,
    Cpu,
    GitMerge,
    Layers,
    FileSpreadsheet,
    Download,
    CheckCircle2,
    XCircle,
    Info,
    ChevronDown,
    ChevronUp,
    ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { bab5View, FUSION } from '../../Utils/fusionDecision';

export interface Bab5EvaluationData {
    evaluated?: boolean;
    biometric_source?: string;
    s1_decision?: number | null;
    s2_decision?: number | null;
    s3_decision?: number | null;
    euclidean_distance?: number | null;
    p_face?: number | null;
    p_live?: number | null;
    s_final?: number | null;
    liveness_valid?: boolean | null;
    /** Siklus dlib mesin, sumber liveness S2/S3 sejak D2. */
    blink_cycles?: number | null;
    mouth_cycles?: number | null;
    landmark_frames?: number | null;
    /** EAR/MAR browser (MediaPipe), telemetri saja. */
    ear_val?: number | null;
    mar_val?: number | null;
    ear_blinks?: number | null;
    mar_mouths?: number | null;
    /** Versi definisi keputusan tersimpan; null pada riwayat lama atau hitung ulang. */
    decision_version?: string | null;
    recomputed?: boolean | null;
    l2_threshold?: number | null;
    subject_id?: string;
    distance_cm?: number;
    lux_value?: number;
}

interface Bab5ScenarioCardProps {
    data?: Bab5EvaluationData | null;
    isDark?: boolean;
    variant?: 'modal' | 'sidebar' | 'full';
    className?: string;
}

/**
 * Latar kartu. Teks di dalam kartu memakai varian dark: dari tema halaman, jadi
 * tanpa prop isDark latar juga mengikuti tema. Sebelumnya bawaannya selalu gelap,
 * sehingga di tema terang teksnya gelap di atas latar gelap.
 */
const PANEL_SURFACE = {
    dark: 'border-white/10 bg-slate-900/95 text-white',
    light: 'border-slate-200 bg-white text-slate-800',
    theme: 'border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-slate-900/95 dark:text-white',
} as const;

const GRID_SURFACE = {
    dark: 'border-white/10 bg-slate-900/80 text-white',
    light: 'border-slate-200 bg-slate-50/90 text-slate-800',
    theme: 'border-slate-200 bg-slate-50/90 text-slate-800 dark:border-white/10 dark:bg-slate-900/80 dark:text-white',
} as const;

export function Bab5ScenarioCard({
    data,
    isDark,
    variant = 'modal',
    className = '',
}: Bab5ScenarioCardProps) {
    const surface = isDark === undefined ? 'theme' : isDark ? 'dark' : 'light';
    const [isExpanded, setIsExpanded] = useState<boolean>(true);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);

    // Tanpa jarak dari mesin biometrik tidak ada yang bisa dinilai. Dulu
    // kartu ini mengisi jarak 0,25 (pasti lolos 0,40) saat data kosong.
    const measuredDistance =
        typeof data?.euclidean_distance === 'number' && Number.isFinite(data.euclidean_distance)
            ? data.euclidean_distance
            : null;
    // Rekaman tersimpan membawa keputusan S1-S3 walau jaraknya tidak selalu ikut;
    // yang belum dinilai adalah yang ditandai evaluated=false atau tidak punya
    // jarak maupun keputusan.
    const notEvaluated =
        data?.evaluated === false || (measuredDistance === null && data?.s1_decision == null);
    const distanceText = (digits: number) =>
        measuredDistance === null ? '—' : measuredDistance.toFixed(digits);

    // D1 = rumus S3 (b), D2 = liveness dlib mesin. Tanpa P_live dlib, S2/S3 FTA.
    const { s1, s2, s3, pFace, pLive, sFinal, livenessValid, l2Threshold, version } = bab5View(data);
    const l2Text = l2Threshold.toFixed(2);
    const thresholdText = FUSION.threshold.toFixed(2);
    const fixed = (v: number | null, digits: number) => (v === null ? '—' : v.toFixed(digits));
    const cycles = (v: number | null | undefined) => (v == null ? '—' : `${v}x`);
    const verdict = (v: 0 | 1 | null) => (v === null ? 'FTA' : v === 1 ? 'ACCEPT' : 'REJECT');
    const tone = (v: 0 | 1 | null) =>
        v === null
            ? { box: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' }
            : v === 1
              ? { box: 'border-emerald-500/30 bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' }
              : { box: 'border-rose-500/30 bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' };

    const handleDownloadBab5Csv = async () => {
        setIsDownloading(true);
        try {
            window.location.href = '/presensi/export-bab5';
            setTimeout(() => setIsDownloading(false), 2000);
        } catch (err) {
            console.error('Download error:', err);
            setIsDownloading(false);
        }
    };

    if (notEvaluated) {
        return (
            <div
                className={`w-full rounded-2xl border p-3.5 transition-colors ${PANEL_SURFACE[surface]} ${className}`}
                role="region"
                aria-label="Panel Evaluasi Bab 5 Cochran Q"
            >
                <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 dark:bg-indigo-400/20 text-indigo-600 dark:text-indigo-300">
                        <Layers className="h-4 w-4" />
                    </div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Evaluasi 3 Skenario (Bab 5)</h4>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Belum ada jarak Euclidean dari mesin biometrik, jadi S1, S2, dan S3 belum dinilai.
                </p>
            </div>
        );
    }

    if (variant === 'sidebar') {
        return (
            <div
                className={`w-full rounded-2xl border transition-colors overflow-hidden ${PANEL_SURFACE[surface]} ${className}`}
                role="region"
                aria-label="Panel Evaluasi Bab 5 Cochran Q"
            >
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex w-full items-center justify-between p-3.5 text-left focus:outline-none focus:ring-2 focus:ring-royal-blue cursor-pointer"
                    aria-expanded={isExpanded}
                >
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 dark:bg-indigo-400/20 text-indigo-600 dark:text-indigo-300">
                            <Layers className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider">
                                    Evaluasi 3 Skenario (Bab 5)
                                </h4>
                                <span className="rounded bg-indigo-500/15 px-1.5 py-0.2 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
                                    Cochran's Q
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                Perbandingan Serentak S1, S2, S3
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                    </div>
                </button>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-t border-slate-100 dark:border-white/10 p-3.5 space-y-3"
                        >
                            {/* 3 mini status indicators */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                {/* S1 */}
                                <div className={`p-2 rounded-xl border ${
                                    s1 === 1
                                        ? 'border-emerald-500/30 bg-emerald-500/10'
                                        : 'border-rose-500/30 bg-rose-500/10'
                                }`}>
                                    <div className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">S1 FaceNet</div>
                                    <div className={`text-xs font-black mt-0.5 ${
                                        s1 === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                    }`}>
                                        {s1 === 1 ? 'ACCEPT' : 'REJECT'}
                                    </div>
                                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">D={distanceText(2)}</div>
                                </div>

                                {/* S2 */}
                                <div className={`p-2 rounded-xl border ${tone(s2).box}`}>
                                    <div className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">S2 Rule-Gate</div>
                                    <div className={`text-xs font-black mt-0.5 ${tone(s2).text}`}>{verdict(s2)}</div>
                                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">siklus dlib</div>
                                </div>

                                {/* S3 */}
                                <div className={`p-2 rounded-xl border ${tone(s3).box}`}>
                                    <div className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">S3 Fusi 0.6</div>
                                    <div className={`text-xs font-black mt-0.5 ${tone(s3).text}`}>{verdict(s3)}</div>
                                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">S={fixed(sFinal, 2)}</div>
                                </div>
                            </div>

                            {/* Download CSV Dataset Bab 5 */}
                            <button
                                type="button"
                                onClick={handleDownloadBab5Csv}
                                disabled={isDownloading}
                                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-[11px] font-bold transition cursor-pointer"
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                                <span>{isDownloading ? 'Mengunduh...' : 'Unduh Dataset Bab 5 (CSV)'}</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    // Modal or Full variant (detailed 3 scenario grid)
    return (
        <div
            className={`w-full rounded-2xl border p-3.5 sm:p-4 transition-all ${GRID_SURFACE[surface]} ${className}`}
        >
            {/* Header with Title & Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25">
                        <Layers className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-black tracking-tight text-deep-navy dark:text-white">
                                Evaluasi Serentak 3 Skenario (Bab 5)
                            </h3>
                            <span className="hidden sm:inline-block rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
                                Uji Cochran's Q &amp; McNemar
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            Evaluasi serentak pada sampel uji yang sama untuk pembuktian hipotesis
                        </p>
                    </div>
                </div>

                {/* CSV Download Button */}
                <button
                    type="button"
                    onClick={handleDownloadBab5Csv}
                    disabled={isDownloading}
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-[11px] font-bold transition cursor-pointer shrink-0"
                    title="Unduh Dataset_Eksperimen_Bab5.csv"
                >
                    <Download className="h-3.5 w-3.5" />
                    <span>{isDownloading ? 'Mengunduh...' : 'Unduh CSV Bab 5'}</span>
                </button>
            </div>

            {/* 3 Scenario Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3 mt-3">
                {/* Skenario 1 (S1): FaceNet Stand-alone */}
                <div
                    className={`rounded-2xl border p-3 flex flex-col justify-between transition-all ${
                        s1 === 1
                            ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
                            : 'border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10'
                    }`}
                >
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                                <Cpu className="h-3.5 w-3.5 text-blue-500" />
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                    Skenario 1 (S1)
                                </span>
                            </div>
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                    s1 === 1
                                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                }`}
                            >
                                {s1 === 1 ? (
                                    <>
                                        <CheckCircle2 className="h-3 w-3" /> ACCEPT (1)
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-3 w-3" /> REJECT (0)
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                            FaceNet Stand-alone (Verifikasi Wajah Murni)
                        </div>

                        {/* Parameter details */}
                        <div className="space-y-1.5 bg-white/60 dark:bg-slate-950/40 rounded-xl p-2 border border-slate-200/50 dark:border-white/5 text-[10px]">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Jarak Euclidean (D):</span>
                                <span className="font-mono font-bold">{distanceText(3)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Ambang Batas:</span>
                                <span className="font-mono text-slate-600 dark:text-slate-300">D ≤ {l2Text}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Liveness Gate:</span>
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">Diabaikan</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-white/5 text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                        {s1 === 1
                            ? '✓ Wajah cocok dengan template. Rentan terhadap spoofing foto/layar.'
                            : `✗ Jarak kemiripan melebihi ${l2Text} (Wajah tidak dikenali).`}
                    </div>
                </div>

                {/* Skenario 2 (S2): Rule-Based Gate */}
                <div
                    className={`rounded-2xl border p-3 flex flex-col justify-between transition-all ${tone(s2).box}`}
                >
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                    Skenario 2 (S2)
                                </span>
                            </div>
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${tone(s2).text}`}
                            >
                                {s2 === null ? (
                                    <>
                                        <Info className="h-3 w-3" /> FTA (liveness)
                                    </>
                                ) : s2 === 1 ? (
                                    <>
                                        <CheckCircle2 className="h-3 w-3" /> ACCEPT (1)
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-3 w-3" /> REJECT (0)
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                            Rule-Based Gate (FaceNet DAN siklus kedip DAN siklus mulut dlib)
                        </div>

                        {/* Parameter details */}
                        <div className="space-y-1.5 bg-white/60 dark:bg-slate-950/40 rounded-xl p-2 border border-slate-200/50 dark:border-white/5 text-[10px]">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Status Wajah (S1):</span>
                                <span className={`font-semibold ${s1 === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                                    {s1 === 1 ? 'Lolos (1)' : 'Gagal (0)'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Siklus kedip dlib (EAR &lt; 0.20):</span>
                                <span className={`font-mono font-bold ${(data?.blink_cycles ?? 0) >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {cycles(data?.blink_cycles)} (≥ 1)
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Siklus mulut dlib (MAR ≥ 0.10):</span>
                                <span className={`font-mono font-bold ${(data?.mouth_cycles ?? 0) >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {cycles(data?.mouth_cycles)} (≥ 1)
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-white/5 text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                        {s2 === null
                            ? 'Landmark atau skor liveness dlib tidak tersedia (FTA), S2 tidak dinilai.'
                            : s2 === 1
                              ? '✓ Wajib lolos kemiripan wajah DAN siklus kedip DAN siklus mulut dlib.'
                              : '✗ Ditolak gerbang keras: ' + (s1 !== 1 ? 'Wajah tidak cocok' : !livenessValid ? 'Siklus kedip/mulut dlib belum lengkap' : '')}
                    </div>
                </div>

                {/* Skenario 3 (S3): Weighted Fusion */}
                <div
                    className={`rounded-2xl border p-3 flex flex-col justify-between transition-all ${tone(s3).box}`}
                >
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                                <GitMerge className="h-3.5 w-3.5 text-indigo-500" />
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                    Skenario 3 (S3)
                                </span>
                            </div>
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${tone(s3).text}`}
                            >
                                {s3 === null ? (
                                    <>
                                        <Info className="h-3 w-3" /> FTA (liveness)
                                    </>
                                ) : s3 === 1 ? (
                                    <>
                                        <CheckCircle2 className="h-3 w-3" /> ACCEPT (1)
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-3 w-3" /> REJECT (0)
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                            Weighted Fusion (α={FUSION.alpha.toFixed(2)}, D_REF={FUSION.dRef.toFixed(2)}, Threshold={thresholdText}, gerbang D ≤ {l2Text})
                        </div>

                        {/* Parameter details */}
                        <div className="space-y-1.5 bg-white/60 dark:bg-slate-950/40 rounded-xl p-2 border border-slate-200/50 dark:border-white/5 text-[10px]">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">s_embed = 1 − D/{FUSION.dRef.toFixed(2)} ({FUSION.alpha.toFixed(2)}):</span>
                                <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{fixed(pFace, 3)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">P_live dlib ({(1 - FUSION.alpha).toFixed(2)}):</span>
                                <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{fixed(pLive, 3)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Skor Fusi S_final:</span>
                                <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400">{fixed(sFinal, 3)} ≥ {FUSION.threshold.toFixed(2)}</span>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        s3 === 1 ? 'bg-emerald-500' : s3 === null ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, (sFinal ?? 0) * 100))}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-white/5 text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                        {s3 === null
                            ? 'Landmark atau skor liveness dlib tidak tersedia (FTA), S3 tidak dinilai.'
                            : s3 === 1
                              ? `✓ Identitas cocok dan skor fusi mencapai ${thresholdText}.`
                              : s1 !== 1
                                ? `✗ Gerbang identitas: jarak melebihi ${l2Text}.`
                                : `✗ Skor fusi di bawah threshold ${thresholdText}.`}
                    </div>
                </div>
            </div>

            {version !== 'current' && (
                <p
                    className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300"
                    role="note"
                >
                    {version === 'recomputed'
                        ? `Dihitung ulang untuk tampilan dari riwayat lama dengan definisi ${FUSION.version}. Ini bukan keputusan yang dibuat saat presensi.`
                        : 'Keputusan tersimpan memakai definisi lama (rumus S3 a dan liveness browser). Rumus di atas adalah definisi sekarang, jadi angka ini tidak sebanding dengan data baru.'}
                </p>
            )}

            {/* Scientific Note & Dataset Sync Banner */}
            <div className="mt-3 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-white/5 text-[10px] text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5 truncate">
                    <Info className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">
                        Vektor Keputusan: <strong className="font-mono text-slate-900 dark:text-white">[{s1 ?? '-'}, {s2 ?? 'FTA'}, {s3 ?? 'FTA'}]</strong> • Otomatis tersimpan ke <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">Dataset_Eksperimen_Bab5.csv</span>
                    </span>
                </div>
                <span className="shrink-0 text-[9px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                    N=5/kondisi
                </span>
            </div>
        </div>
    );
}
