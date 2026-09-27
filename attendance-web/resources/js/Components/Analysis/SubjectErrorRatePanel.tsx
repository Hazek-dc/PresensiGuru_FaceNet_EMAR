import React, { useState } from 'react';
import { motion } from 'motion/react';

interface SubjectAnalysisData {
    error_rates: Array<{
        participant_id: string;
        total: number;
        m1_errors: number;
        m2_errors: number;
        m3_errors: number;
        m1_rate: number;
        m2_rate: number;
        m3_rate: number;
    }>;
    confusion_matrices: {
        M1: { TP: number; FN: number; TN: number; FP: number };
        M2: { TP: number; FN: number; TN: number; FP: number };
        M3: { TP: number; FN: number; TN: number; FP: number };
    };
    summary: {
        m1_mean: number; m1_median: number; m1_min: number; m1_max: number;
        m2_mean: number; m2_median: number; m2_min: number; m2_max: number;
        m3_mean: number; m3_median: number; m3_min: number; m3_max: number;
        total_samples: number;
        total_subjects: number;
    };
    integrity_check: {
        passed: boolean;
        details: string;
    };
}

interface SubjectErrorRatePanelProps {
    data: SubjectAnalysisData;
}

export function SubjectErrorRatePanel({ data }: SubjectErrorRatePanelProps) {
    const [isTableOpen, setIsTableOpen] = useState(false);

    const calculateMetrics = (cm: { TP: number; FN: number; TN: number; FP: number }) => {
        const { TP, FN, TN, FP } = cm;
        const total = TP + FN + TN + FP;
        const accuracy = total > 0 ? (TP + TN) / total : 0;
        const apcer = (FP + TN) > 0 ? FP / (FP + TN) : 0;
        const bpcer = (FN + TP) > 0 ? FN / (FN + TP) : 0;
        const acer = (apcer + bpcer) / 2;
        return { accuracy, apcer, bpcer, acer };
    };

    const metricsM1 = calculateMetrics(data.confusion_matrices.M1);
    const metricsM2 = calculateMetrics(data.confusion_matrices.M2);
    const metricsM3 = calculateMetrics(data.confusion_matrices.M3);

    return (
        <div className="flex flex-col gap-6">
            {/* Section 1: Integrity Check Banner */}
            {data.integrity_check.passed ? (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-4 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                    <span className="material-symbols-outlined shrink-0 text-xl">check_circle</span>
                    <span className="font-medium text-sm">{data.integrity_check.details}</span>
                </div>
            ) : (
                <div className="flex items-center gap-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 p-4 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300">
                    <span className="material-symbols-outlined shrink-0 text-xl">warning</span>
                    <span className="font-medium text-sm">{data.integrity_check.details}</span>
                </div>
            )}

            {/* Section 2: Confusion Matrix Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[
                    { key: 'M1', title: 'S1: FaceNet Saja', color: 'amber', cm: data.confusion_matrices.M1, metrics: metricsM1 },
                    { key: 'M2', title: 'S2: FaceNet + EMAR Bertingkat', color: 'blue', cm: data.confusion_matrices.M2, metrics: metricsM2 },
                    { key: 'M3', title: 'S3: FaceNet + EMAR Pembobotan', color: 'emerald', cm: data.confusion_matrices.M3, metrics: metricsM3 },
                ].map((item, idx) => (
                    <motion.div
                        key={item.key}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0F1B36] shadow-xs overflow-hidden flex flex-col`}
                    >
                        <div className={`p-4 border-b border-slate-100 dark:border-white/5 bg-${item.color}-50/50 dark:bg-${item.color}-900/10`}>
                            <h3 className="text-deep-navy dark:text-white font-bold">{item.title}</h3>
                        </div>
                        <div className="p-4 flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-2 text-center text-sm font-mono">
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-center h-16">
                                    <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-sans font-bold">TP</div>
                                    <div className="font-bold text-deep-navy dark:text-white">{item.cm.TP}</div>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-center h-16">
                                    <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-sans font-bold">FN</div>
                                    <div className="font-bold text-deep-navy dark:text-white">{item.cm.FN}</div>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-center h-16">
                                    <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-sans font-bold">FP</div>
                                    <div className="font-bold text-deep-navy dark:text-white">{item.cm.FP}</div>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-center h-16">
                                    <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-sans font-bold">TN</div>
                                    <div className="font-bold text-deep-navy dark:text-white">{item.cm.TN}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-slate-500 dark:text-slate-400">Akurasi:</span>
                                    <span className="font-medium text-deep-navy dark:text-white">{(item.metrics.accuracy * 100).toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 dark:text-slate-400">APCER:</span>
                                    <span className="font-medium text-deep-navy dark:text-white">{(item.metrics.apcer * 100).toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 dark:text-slate-400">BPCER:</span>
                                    <span className="font-medium text-deep-navy dark:text-white">{(item.metrics.bpcer * 100).toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 dark:text-slate-400 font-bold">ACER:</span>
                                    <span className="font-bold text-deep-navy dark:text-white">{(item.metrics.acer * 100).toFixed(2)}%</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Section 4: Comparison Summary Bar */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0F1B36] shadow-xs p-5">
                <h3 className="text-deep-navy dark:text-white font-bold mb-4">Rata-rata Tingkat Galat (Mean Error Rate)</h3>
                <div className="flex flex-col gap-3">
                    {[
                        { label: 'S1: FaceNet Saja', val: data.summary.m1_mean, color: 'bg-amber-500' },
                        { label: 'S2: FaceNet + EMAR Bertingkat', val: data.summary.m2_mean, color: 'bg-blue-500' },
                        { label: 'S3: FaceNet + EMAR Pembobotan', val: data.summary.m3_mean, color: 'bg-emerald-500' },
                    ].map((bar, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-48 shrink-0">{bar.label}</span>
                            <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, bar.val)}%` }}
                                    transition={{ duration: 1, delay: 0.2 }}
                                    className={`h-full ${bar.color}`}
                                />
                            </div>
                            <span className="text-xs font-mono font-medium text-deep-navy dark:text-white w-12 text-right">
                                {bar.val.toFixed(2)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Section 3: Error Rate Table */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0F1B36] shadow-xs overflow-hidden">
                <button
                    onClick={() => setIsTableOpen(!isTableOpen)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                >
                    <h3 className="text-deep-navy dark:text-white font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">table_chart</span>
                        Tabel Tingkat Galat Per Subjek
                    </h3>
                    <span className="material-symbols-outlined text-slate-500">
                        {isTableOpen ? 'expand_less' : 'expand_more'}
                    </span>
                </button>
                {isTableOpen && (
                    <div className="overflow-x-auto p-4 border-t border-slate-100 dark:border-white/5">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="px-4 py-3 rounded-tl-lg">Subjek</th>
                                    <th className="px-4 py-3">Total</th>
                                    <th className="px-4 py-3">Galat M1</th>
                                    <th className="px-4 py-3">Galat M2</th>
                                    <th className="px-4 py-3">Galat M3</th>
                                    <th className="px-4 py-3">Rate M1%</th>
                                    <th className="px-4 py-3">Rate M2%</th>
                                    <th className="px-4 py-3 rounded-tr-lg">Rate M3%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {data.error_rates.map((row, i) => {
                                    const getColor = (rate: number) => {
                                        if (rate < 5) return 'text-emerald-600 dark:text-emerald-400 font-medium';
                                        if (rate <= 20) return 'text-amber-600 dark:text-amber-400 font-medium';
                                        return 'text-rose-600 dark:text-rose-400 font-bold';
                                    };
                                    return (
                                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                            <td className="px-4 py-2 font-medium text-deep-navy dark:text-white">{row.participant_id}</td>
                                            <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.total}</td>
                                            <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.m1_errors}</td>
                                            <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.m2_errors}</td>
                                            <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.m3_errors}</td>
                                            <td className={`px-4 py-2 ${getColor(row.m1_rate)}`}>{row.m1_rate.toFixed(1)}%</td>
                                            <td className={`px-4 py-2 ${getColor(row.m2_rate)}`}>{row.m2_rate.toFixed(1)}%</td>
                                            <td className={`px-4 py-2 ${getColor(row.m3_rate)}`}>{row.m3_rate.toFixed(1)}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-bold text-deep-navy dark:text-white">
                                <tr>
                                    <td className="px-4 py-3 rounded-bl-lg">Rata-rata</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">-</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">-</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">-</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">-</td>
                                    <td className="px-4 py-3">{data.summary.m1_mean.toFixed(1)}%</td>
                                    <td className="px-4 py-3">{data.summary.m2_mean.toFixed(1)}%</td>
                                    <td className="px-4 py-3 rounded-br-lg">{data.summary.m3_mean.toFixed(1)}%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Section 5: Statistical Test Results */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#0F1B36] shadow-xs p-5">
                <h3 className="text-deep-navy dark:text-white font-bold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-indigo-500">science</span>
                    Hasil Uji Statistik Inferensial (Tingkat Subjek)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {[
                        { title: 'Friedman χ²', desc: 'Uji varians global' },
                        { title: 'Wilcoxon Signed-Rank', desc: 'S1 vs S3 berpasangan' },
                        { title: 'Effect Size (r)', desc: 'Besaran efek perlakuan' },
                        { title: 'Design Effect', desc: 'Efek desain tingkat subjek' },
                    ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 flex flex-col gap-1 items-center justify-center text-center h-24">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{stat.title}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">{stat.desc}</span>
                        </div>
                    ))}
                </div>
                <div className="flex justify-center">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                        <span className="material-symbols-outlined text-sm">terminal</span>
                        Jalankan analisis_tingkat_subjek.py untuk hasil lengkap
                    </span>
                </div>
            </div>
        </div>
    );
}
