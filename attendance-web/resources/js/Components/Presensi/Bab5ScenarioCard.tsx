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

export interface Bab5EvaluationData {
    evaluated?: boolean;
    biometric_source?: string;
    s1_decision?: number | null;
    s2_decision?: number | null;
    s3_decision?: number | null;
    euclidean_distance?: number | null;
    p_face?: number;
    p_live?: number;
    s_final?: number;
    liveness_valid?: boolean;
    ear_val?: number;
    mar_val?: number;
    ear_blinks?: number;
    mar_mouths?: number;
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

export function Bab5ScenarioCard({
    data,
    isDark = true,
    variant = 'modal',
    className = '',
}: Bab5ScenarioCardProps) {
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

    const euclideanDist = measuredDistance ?? 0;
    const s1 = data?.s1_decision != null ? data.s1_decision : (euclideanDist <= 0.40 ? 1 : 0);

    const earVal = data?.ear_val ?? (data?.ear_blinks && data.ear_blinks > 0 ? 0.18 : 0.28);
    const marVal = data?.mar_val ?? (data?.mar_mouths && data.mar_mouths > 0 ? 0.40 : 0.05);
    const livenessValid = data?.liveness_valid !== undefined ? data.liveness_valid : (earVal < 0.20 && marVal >= 0.10);
    const s2 = data?.s2_decision != null ? data.s2_decision : (s1 === 1 && livenessValid ? 1 : 0);

    const pFace = data?.p_face ?? Math.max(0, 1 - euclideanDist / 1.5);
    const pLive = data?.p_live ?? (livenessValid ? 1.0 : 0.0);
    const sFinal = data?.s_final ?? (0.6 * pFace + 0.4 * pLive);
    const s3 = data?.s3_decision != null ? data.s3_decision : (sFinal >= 0.75 ? 1 : 0);

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
                className={`w-full rounded-2xl border p-3.5 transition-colors ${
                    isDark
                        ? 'border-white/10 bg-slate-900/95 text-white'
                        : 'border-slate-200 bg-white text-slate-800'
                } ${className}`}
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
                className={`w-full rounded-2xl border transition-colors overflow-hidden ${
                    isDark
                        ? 'border-white/10 bg-slate-900/95 text-white'
                        : 'border-slate-200 bg-white text-slate-800'
                } ${className}`}
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
                                <div className={`p-2 rounded-xl border ${
                                    s2 === 1
                                        ? 'border-emerald-500/30 bg-emerald-500/10'
                                        : 'border-rose-500/30 bg-rose-500/10'
                                }`}>
                                    <div className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">S2 Rule-Gate</div>
                                    <div className={`text-xs font-black mt-0.5 ${
                                        s2 === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                    }`}>
                                        {s2 === 1 ? 'ACCEPT' : 'REJECT'}
                                    </div>
                                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">EAR/MAR</div>
                                </div>

                                {/* S3 */}
                                <div className={`p-2 rounded-xl border ${
                                    s3 === 1
                                        ? 'border-emerald-500/30 bg-emerald-500/10'
                                        : 'border-rose-500/30 bg-rose-500/10'
                                }`}>
                                    <div className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400">S3 Fusi 0.6</div>
                                    <div className={`text-xs font-black mt-0.5 ${
                                        s3 === 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                    }`}>
                                        {s3 === 1 ? 'ACCEPT' : 'REJECT'}
                                    </div>
                                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">S={sFinal.toFixed(2)}</div>
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
            className={`w-full rounded-2xl border p-3.5 sm:p-4 transition-all ${
                isDark
                    ? 'border-white/10 bg-slate-900/80 text-white'
                    : 'border-slate-200 bg-slate-50/90 text-slate-800'
            } ${className}`}
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
                                <span className="font-mono text-slate-600 dark:text-slate-300">D ≤ 0.40</span>
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
                            : '✗ Jarak kemiripan melebihi 0.40 (Wajah tidak dikenali).'}
                    </div>
                </div>

                {/* Skenario 2 (S2): Rule-Based Gate */}
                <div
                    className={`rounded-2xl border p-3 flex flex-col justify-between transition-all ${
                        s2 === 1
                            ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
                            : 'border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10'
                    }`}
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
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                    s2 === 1
                                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                }`}
                            >
                                {s2 === 1 ? (
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
                            Rule-Based Gate (FaceNet + EMAR Hard AND)
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
                                <span className="text-slate-500 dark:text-slate-400">Min EAR (Kedipan):</span>
                                <span className={`font-mono font-bold ${earVal < 0.20 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {earVal.toFixed(3)} (&lt; 0.20)
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Max MAR (Mulut):</span>
                                <span className={`font-mono font-bold ${marVal >= 0.10 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {marVal.toFixed(3)} (≥ 0.10)
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-white/5 text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                        {s2 === 1
                            ? '✓ Wajib lolos kemiripan wajah DAN kedua ambang batas fisik (kedip & mulut).'
                            : '✗ Ditolak gerbang keras: ' + (s1 !== 1 ? 'Wajah tidak cocok' : !livenessValid ? 'Liveness (EAR/MAR) belum terlampaui' : '')}
                    </div>
                </div>

                {/* Skenario 3 (S3): Weighted Fusion */}
                <div
                    className={`rounded-2xl border p-3 flex flex-col justify-between transition-all ${
                        s3 === 1
                            ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
                            : 'border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10'
                    }`}
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
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                    s3 === 1
                                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                }`}
                            >
                                {s3 === 1 ? (
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
                            Weighted Fusion (Skor Bobot α=0.60, Threshold=0.75)
                        </div>

                        {/* Parameter details */}
                        <div className="space-y-1.5 bg-white/60 dark:bg-slate-950/40 rounded-xl p-2 border border-slate-200/50 dark:border-white/5 text-[10px]">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">P_face (0.60):</span>
                                <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{pFace.toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">P_live (0.40):</span>
                                <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{pLive.toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 dark:text-slate-400">Skor Fusi S_final:</span>
                                <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400">{sFinal.toFixed(3)} ≥ 0.75</span>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        s3 === 1 ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, sFinal * 100))}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-white/5 text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                        {s3 === 1
                            ? '✓ Skor gabungan adaptif melampaui 0.75. Toleran variasi liveness.'
                            : '✗ Skor fusi di bawah threshold 0.75.'}
                    </div>
                </div>
            </div>

            {/* Scientific Note & Dataset Sync Banner */}
            <div className="mt-3 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-white/5 text-[10px] text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5 truncate">
                    <Info className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">
                        Vektor Keputusan: <strong className="font-mono text-slate-900 dark:text-white">[{s1}, {s2}, {s3}]</strong> • Otomatis tersimpan ke <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">Dataset_Eksperimen_Bab5.csv</span>
                    </span>
                </div>
                <span className="shrink-0 text-[9px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                    N=10/kondisi
                </span>
            </div>
        </div>
    );
}
