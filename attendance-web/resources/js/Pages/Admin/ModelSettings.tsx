import React, { useState } from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm, router } from '@inertiajs/react';

interface ModelSettingsProps {
    settings: {
        facenet_threshold: number;
        liveness_strategy: 'S1' | 'S2' | 'S3';
        ear_threshold: number;
        mar_threshold: number;
        stability_threshold: number;
        scan_duration_sec: number;
        distance_cm: number;
    };
    flash?: {
        success?: string;
        error?: string;
    };
}

export default function ModelSettings({ settings, flash }: ModelSettingsProps) {
    const { data, setData, post, processing, errors, reset } = useForm({
        facenet_threshold: Number(settings.facenet_threshold ?? 0.40),
        liveness_strategy: settings.liveness_strategy ?? 'S2',
        ear_threshold: Number(settings.ear_threshold ?? 0.20),
        mar_threshold: Number(settings.mar_threshold ?? 0.10),
        reason: '',
    });

    const [isResetting, setIsResetting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('admin.settings.model.update'), {
            preserveScroll: true,
            onSuccess: () => setData('reason', ''),
        });
    };

    const handleReset = () => {
        if (confirm('Kembalikan seluruh parameter model biometrik ke standar default Bab 3 Skripsi (L2=0.40, S2, EAR=0.20, MAR=0.10)?')) {
            setIsResetting(true);
            router.post(route('admin.settings.model.reset'), {}, {
                preserveScroll: true,
                onFinish: () => {
                    setIsResetting(false);
                    setData({
                        facenet_threshold: 0.40,
                        liveness_strategy: 'S2',
                        ear_threshold: 0.20,
                        mar_threshold: 0.10,
                        reason: '',
                    });
                },
            });
        }
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-500/10 dark:bg-sky-500/10 border border-blue-500/20 dark:border-sky-500/20 text-blue-600 dark:text-sky-400 text-xs font-semibold mb-1.5">
                            <span className="material-symbols-outlined text-[14px]">science</span>
                            <span>Riset Skripsi Qalwani Anugerah (NPM. 221220048)</span>
                        </div>
                        <h2 className="text-xl font-bold leading-tight text-deep-navy dark:text-white">
                            Pengaturan Model & Ambang Batas Biometrik
                        </h2>
                        <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-0.5">
                            Kalibrasi parameter deteksi FaceNet (Inception-ResNet-V1) dan Liveness EMAR (Eye-Mouth Aspect Ratio)
                        </p>
                    </div>
                </div>
            }
        >
            <Head title="Pengaturan Model Biometrik - FaceNet & EMAR" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">

                    {flash?.success && (
                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2.5 shadow-sm">
                            <span className="material-symbols-outlined text-[20px]">check_circle</span>
                            <span className="font-medium">{flash.success}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Kolom Kiri: Form Kalibrasi Interaktif */}
                        <div className="lg:col-span-2 bg-surface-container-lowest dark:bg-[#0F1B36] border border-surface-variant/50 dark:border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
                            <div className="flex items-center justify-between pb-4 border-b border-outline-variant/30 dark:border-white/10">
                                <h3 className="text-base font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-royal-blue dark:text-sky-400">tune</span>
                                    <span>Parameter Keputusan Biometrik</span>
                                </h3>
                                <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/10 text-on-surface-variant dark:text-slate-400">
                                    Strategi: <strong className="text-royal-blue dark:text-sky-400">{data.liveness_strategy}</strong>
                                </span>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* 1. FaceNet Euclidean Distance Slider */}
                                <div className="p-4 rounded-2xl bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-200">
                                                FaceNet 1:1 Euclidean Distance Threshold (L2)
                                            </label>
                                            <p className="text-[11px] text-on-surface-variant dark:text-slate-400 mt-0.5">
                                                Rentang: 0.20 - 0.60 (Standar Bab 3: <strong className="text-royal-blue dark:text-sky-400">0.40</strong>)
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold font-mono px-3 py-1 rounded-xl bg-blue-500/10 dark:bg-sky-500/20 border border-blue-500/30 dark:border-sky-500/40 text-royal-blue dark:text-sky-300">
                                            {Number(data.facenet_threshold).toFixed(2)}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.20"
                                        max="0.60"
                                        step="0.01"
                                        value={data.facenet_threshold}
                                        onChange={(e) => setData('facenet_threshold', parseFloat(e.target.value))}
                                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-royal-blue dark:accent-sky-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-on-surface-variant dark:text-slate-500 font-mono">
                                        <span>0.20 (Sangat Ketat)</span>
                                        <span className="text-royal-blue dark:text-sky-400 font-bold">0.40 (Optimal Bab 3)</span>
                                        <span>0.60 (Toleran)</span>
                                    </div>
                                    {errors.facenet_threshold && (
                                        <p className="text-xs text-rose-500">{errors.facenet_threshold}</p>
                                    )}
                                </div>

                                {/* 2. Strategi Fusi Liveness Radio Group */}
                                <div className="p-4 rounded-2xl bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/5 space-y-3">
                                    <label className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-200 block">
                                        Strategi Fusi Liveness Multi-Modal
                                    </label>
                                    <p className="text-[11px] text-on-surface-variant dark:text-slate-400 mb-2">
                                        Pilih skenario integrasi FaceNet dan EMAR yang diuji dalam penelitian:
                                    </p>

                                    <div className="space-y-2.5">
                                        {/* S1 */}
                                        <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                                            data.liveness_strategy === 'S1'
                                                ? 'border-royal-blue bg-blue-500/10 dark:border-sky-500 dark:bg-sky-500/10 ring-1 ring-royal-blue/30'
                                                : 'border-outline-variant/40 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 hover:border-outline-variant'
                                        }`}>
                                            <input
                                                type="radio"
                                                name="liveness_strategy"
                                                value="S1"
                                                checked={data.liveness_strategy === 'S1'}
                                                onChange={(e) => setData('liveness_strategy', e.target.value as any)}
                                                className="mt-1 text-royal-blue focus:ring-royal-blue"
                                            />
                                            <div className="text-xs">
                                                <div className="font-bold text-deep-navy dark:text-white">
                                                    Skenario S1: Feature Concatenation (Early Fusion)
                                                </div>
                                                <div className="text-on-surface-variant dark:text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                                                    Menggabungkan 512-D FaceNet embedding dan vektor temporal kedipan-mulut ke dalam satu representasi gabungan.
                                                </div>
                                            </div>
                                        </label>

                                        {/* S2 - Default */}
                                        <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                                            data.liveness_strategy === 'S2'
                                                ? 'border-royal-blue bg-blue-500/10 dark:border-sky-500 dark:bg-sky-500/10 ring-1 ring-royal-blue/30'
                                                : 'border-outline-variant/40 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 hover:border-outline-variant'
                                        }`}>
                                            <input
                                                type="radio"
                                                name="liveness_strategy"
                                                value="S2"
                                                checked={data.liveness_strategy === 'S2'}
                                                onChange={(e) => setData('liveness_strategy', e.target.value as any)}
                                                className="mt-1 text-royal-blue focus:ring-royal-blue"
                                            />
                                            <div className="text-xs">
                                                <div className="font-bold text-royal-blue dark:text-sky-300 flex items-center gap-2">
                                                    <span>Skenario S2: Rule-Based Gate (Cascaded Late Fusion)</span>
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-royal-blue/15 text-royal-blue dark:bg-sky-500/30 dark:text-sky-200 font-bold">
                                                        DEFAULT BAB 3
                                                    </span>
                                                </div>
                                                <div className="text-on-surface-variant dark:text-slate-300 text-[11px] mt-0.5 leading-relaxed">
                                                    Wajib lulus Liveness EMAR (Blink ≥ 1 & Mouth ≥ 1) SEBELUM verifikasi jarak Euclidean FaceNet (L2 ≤ 0.40). Teruji efektif menangkal Cut-Out Photo Attack.
                                                </div>
                                            </div>
                                        </label>

                                        {/* S3 */}
                                        <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                                            data.liveness_strategy === 'S3'
                                                ? 'border-royal-blue bg-blue-500/10 dark:border-sky-500 dark:bg-sky-500/10 ring-1 ring-royal-blue/30'
                                                : 'border-outline-variant/40 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 hover:border-outline-variant'
                                        }`}>
                                            <input
                                                type="radio"
                                                name="liveness_strategy"
                                                value="S3"
                                                checked={data.liveness_strategy === 'S3'}
                                                onChange={(e) => setData('liveness_strategy', e.target.value as any)}
                                                className="mt-1 text-royal-blue focus:ring-royal-blue"
                                            />
                                            <div className="text-xs">
                                                <div className="font-bold text-deep-navy dark:text-white">
                                                    Skenario S3: Score-Level Fusion (Weighted Score)
                                                </div>
                                                <div className="text-on-surface-variant dark:text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                                                    Mengombinasikan skor probabilitas kecocokan FaceNet dan kepercayaan EMAR dengan pembobotan linear (w₁·ScoreFace + w₂·ScoreEMAR).
                                                </div>
                                            </div>
                                        </label>
                                    </div>
                                    {errors.liveness_strategy && (
                                        <p className="text-xs text-rose-500">{errors.liveness_strategy}</p>
                                    )}
                                </div>

                                {/* 3. EAR Threshold Slider */}
                                <div className="p-4 rounded-2xl bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-200">
                                                Eye Aspect Ratio Threshold (T_EAR)
                                            </label>
                                            <p className="text-[11px] text-on-surface-variant dark:text-slate-400 mt-0.5">
                                                Ambang batas kedipan mata. Rentang: 0.15 - 0.25 (Default: <strong className="text-emerald-600 dark:text-emerald-400">0.20</strong>)
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold font-mono px-3 py-1 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                                            {Number(data.ear_threshold).toFixed(2)}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.15"
                                        max="0.25"
                                        step="0.01"
                                        value={data.ear_threshold}
                                        onChange={(e) => setData('ear_threshold', parseFloat(e.target.value))}
                                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                                    />
                                    <div className="flex justify-between text-[10px] text-on-surface-variant dark:text-slate-500 font-mono">
                                        <span>0.15 (Mata Sangat Sipit)</span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">0.20 (Standard Soukupova)</span>
                                        <span>0.25 (Sensitif)</span>
                                    </div>
                                    {errors.ear_threshold && (
                                        <p className="text-xs text-rose-500">{errors.ear_threshold}</p>
                                    )}
                                </div>

                                {/* 4. MAR Threshold Slider */}
                                <div className="p-4 rounded-2xl bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-200">
                                                Mouth Aspect Ratio Threshold (T_MAR)
                                            </label>
                                            <p className="text-[11px] text-on-surface-variant dark:text-slate-400 mt-0.5">
                                                Ambang batas bukaan mulut. Rentang: 0.06 - 0.20 (Default: <strong className="text-amber-600 dark:text-amber-400">0.10</strong>)
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold font-mono px-3 py-1 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 dark:border-amber-500/40 text-amber-700 dark:text-amber-300">
                                            {Number(data.mar_threshold).toFixed(2)}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.06"
                                        max="0.20"
                                        step="0.01"
                                        value={data.mar_threshold}
                                        onChange={(e) => setData('mar_threshold', parseFloat(e.target.value))}
                                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
                                    />
                                    <div className="flex justify-between text-[10px] text-on-surface-variant dark:text-slate-500 font-mono">
                                        <span>0.06 (Bukaan Kecil)</span>
                                        <span className="text-amber-600 dark:text-amber-400 font-bold">0.10 (Optimal Bab 3)</span>
                                        <span>0.20 (Bukaan Lebar)</span>
                                    </div>
                                    {errors.mar_threshold && (
                                        <p className="text-xs text-rose-500">{errors.mar_threshold}</p>
                                    )}
                                </div>

                                {/* Audit Reason */}
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 block mb-1">
                                        Catatan / Alasan Kalibrasi (Audit Log)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: Pengujian variasi pencahayaan Lux 100 Bab 4..."
                                        value={data.reason}
                                        onChange={(e) => setData('reason', e.target.value)}
                                        className="w-full px-4 py-2.5 text-xs bg-white dark:bg-slate-900 border border-outline-variant/60 dark:border-white/10 rounded-xl text-deep-navy dark:text-white focus:ring-2 focus:ring-royal-blue focus:outline-none"
                                    />
                                    {errors.reason && (
                                        <p className="text-xs text-rose-500 mt-1">{errors.reason}</p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-outline-variant/30 dark:border-white/10">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        disabled={isResetting || processing}
                                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition disabled:opacity-50"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                        <span>{isResetting ? 'Mengembalikan...' : 'Reset to Default Bab 3 Skripsi'}</span>
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={processing || isResetting}
                                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-royal-blue dark:bg-sky-600 hover:brightness-110 rounded-xl shadow-md shadow-royal-blue/20 transition disabled:opacity-50"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">save</span>
                                        <span>{processing ? 'Menyimpan...' : 'Simpan Konfigurasi Model'}</span>
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Kolom Kanan: Parameter Eksperimen Terkunci & Metodologi */}
                        <div className="space-y-6">
                            {/* Parameter Terkunci (Read-Only) */}
                            <div className="bg-surface-container-lowest dark:bg-[#0F1B36] border border-surface-variant/50 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-sm">
                                <h3 className="text-sm font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-slate-400">lock</span>
                                    <span>Parameter Eksperimen Terkunci</span>
                                </h3>
                                <p className="text-[11px] text-on-surface-variant dark:text-slate-400 leading-relaxed">
                                    Parameter di bawah ini dipertahankan konstan sesuai batasan metodologi skripsi di SMK Al-Madani:
                                </p>

                                <div className="p-3.5 rounded-2xl bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/5 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-semibold text-deep-navy dark:text-slate-300">Durasi Scan Window</div>
                                        <div className="text-[10px] text-on-surface-variant dark:text-slate-500">Waktu perekaman video per sesi</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-800 border border-outline-variant/40 dark:border-white/10 text-xs font-mono font-bold text-deep-navy dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>
                                        <span>8 Detik</span>
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/5 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-semibold text-deep-navy dark:text-slate-300">Jarak Kamera Biometrik</div>
                                        <div className="text-[10px] text-on-surface-variant dark:text-slate-500">Jarak subjek ke lensa webcam</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-800 border border-outline-variant/40 dark:border-white/10 text-xs font-mono font-bold text-deep-navy dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>
                                        <span>30 cm</span>
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-surface-container-low dark:bg-white/5 border border-outline-variant/40 dark:border-white/5 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-semibold text-deep-navy dark:text-slate-300">Minimal Stabilitas Wajah</div>
                                        <div className="text-[10px] text-on-surface-variant dark:text-slate-500">Face detection continuity threshold</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-800 border border-outline-variant/40 dark:border-white/10 text-xs font-mono font-bold text-deep-navy dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[14px] text-slate-400">lock</span>
                                        <span>≥ 80.0%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Rumus Aturan S2 (PRD Skripsi) */}
                            <div className="bg-gradient-to-br from-blue-500/10 to-transparent dark:from-sky-950/30 dark:to-transparent border border-blue-500/20 dark:border-sky-500/20 rounded-3xl p-6 space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-royal-blue dark:text-sky-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px]">verified</span>
                                    <span>Logika Keputusan (Skenario S2)</span>
                                </h3>
                                <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-outline-variant/30 dark:border-white/5 font-mono text-[11px] text-deep-navy dark:text-slate-300 space-y-1">
                                    <div className="text-emerald-600 dark:text-emerald-400 font-bold">ACCEPT jika dan hanya jika:</div>
                                    <div>(D_L2 ≤ 0.40) ∧</div>
                                    <div>(Blink ≥ 1) ∧ (Mouth ≥ 1) ∧</div>
                                    <div>(Stabilitas ≥ 80%)</div>
                                </div>
                                <p className="text-[11px] text-on-surface-variant dark:text-slate-400 leading-relaxed">
                                    Khusus jika kedipan ≥ 1x namun mulut = 0x, sistem mengklasifikasikan sebagai serangan <strong>Cut-Out Photo Attack</strong> dan segera menolak (<span className="text-rose-600 dark:text-rose-400 font-semibold">REJECT</span>).
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
