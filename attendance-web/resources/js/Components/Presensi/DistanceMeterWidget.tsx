import axios from 'axios';
import {
    Activity,
    AlertTriangle,
    Camera,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Cpu,
    HelpCircle,
    Info,
    Move,
    RefreshCw,
    Ruler,
    Sliders,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDistanceCategory } from '../../Utils/faceDistance';
import {
    DistanceSource,
    evaluateHardwareReading,
    formatMeasured,
    HardwareRejectReason,
    hardwareRejectMessage,
    NOT_MEASURED_LABEL,
    SensorReading,
} from '../../Utils/sensorReading';

export type DistanceSourceMode = 'camera' | 'hardware' | 'manual';

export interface DistanceMeterWidgetProps {
    /** Jarak terukur yang dipakai halaman; null bila tidak ada bacaan segar. */
    currentDistance: number | null;
    /** Kamera: estimasi pemindai; hardware: sensor aktif; preset: selalu null. */
    onDistanceChange: (reading: SensorReading<DistanceSource> | null) => void;
    liveCameraReading?: SensorReading<'camera'> | null;
    /** Target skenario uji (preset), terpisah dari hasil ukur. */
    targetDistance?: number | null;
    onTargetChange?: (cm: number | null) => void;
    isDark?: boolean;
}

export function DistanceMeterWidget({
    currentDistance,
    onDistanceChange,
    liveCameraReading = null,
    targetDistance = null,
    onTargetChange,
    isDark = true,
}: DistanceMeterWidgetProps) {
    const [mode, setMode] = useState<DistanceSourceMode>('camera');
    const [isHardwareConnected, setIsHardwareConnected] = useState<boolean>(false);
    const [hardwareReject, setHardwareReject] = useState<HardwareRejectReason | null>(null);
    const [hardwareDevice, setHardwareDevice] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isFetchingHardware, setIsFetchingHardware] = useState<boolean>(false);
    const [showHelp, setShowHelp] = useState<boolean>(false);
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

    const pollIntervalRef = useRef<any>(null);
    const modeRef = useRef<DistanceSourceMode>(mode);

    const category = useMemo(
        () => (currentDistance === null ? null : getDistanceCategory(currentDistance)),
        [currentDistance],
    );

    // Ganti mode = ganti sumber: bacaan mode sebelumnya tidak boleh terbawa.
    useEffect(() => {
        modeRef.current = mode;
        setHardwareReject(null);
        onDistanceChange(null);
    }, [mode, onDistanceChange]);

    /* ---- 1. Live Camera Distance Update ---- */
    useEffect(() => {
        if (mode !== 'camera') return;
        onDistanceChange(liveCameraReading);
        setLastUpdated(liveCameraReading ? 'Live AI Vision' : null);
    }, [mode, liveCameraReading, onDistanceChange]);

    /* ---- 2. Hardware Sensor API Polling ---- */
    // Hanya bacaan yang ditandai server sebagai hasil ukur segar yang diteruskan;
    // selain itu null, angka lama tidak dipertahankan.
    const fetchHardwareDistance = useCallback(async () => {
        setIsFetchingHardware(true);
        try {
            const resp = await axios.get('/api/distance/current');
            // Respons yang tiba setelah pindah mode tidak boleh menimpa sumber baru.
            if (modeRef.current !== 'hardware') return;
            const verdict = evaluateHardwareReading(resp.data, 'distance_cm');
            if (verdict.accepted) {
                onDistanceChange({
                    value: verdict.value,
                    source: 'sensor',
                    measuredAt: Date.now() - verdict.secondsAgo * 1000,
                });
                setIsHardwareConnected(true);
                setHardwareReject(null);
                setHardwareDevice(resp.data.device || 'Rangefinder ToF/Ultrasonic');
                setLastUpdated(`${Math.max(0, Math.round(verdict.secondsAgo))}s lalu`);
            } else {
                onDistanceChange(null);
                setIsHardwareConnected(false);
                setHardwareReject(verdict.reason);
                setLastUpdated(null);
            }
        } catch {
            if (modeRef.current !== 'hardware') return;
            onDistanceChange(null);
            setIsHardwareConnected(false);
            setHardwareReject('unreachable');
            setLastUpdated(null);
        } finally {
            setIsFetchingHardware(false);
        }
    }, [onDistanceChange]);

    /* ---- 3. Mode Management ---- */
    useEffect(() => {
        if (mode === 'hardware') {
            fetchHardwareDistance();
            pollIntervalRef.current = setInterval(fetchHardwareDistance, 1500);
            return () => {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            };
        }
    }, [mode, fetchHardwareDistance]);

    // Preset hanya menetapkan target skenario uji. Tidak dikirim ke
    // /api/distance/update karena akan menimpa bacaan sensor di sidecar.
    const applyPreset = (presetCm: number) => {
        setMode('manual');
        onTargetChange?.(presetCm);
    };

    const adjustDistance = (delta: number) => {
        if (targetDistance === null) return;
        setMode('manual');
        onTargetChange?.(Math.max(15, Math.min(100, Math.round((targetDistance + delta) * 10) / 10)));
    };

    // Gauge percentage for 0 - 100 cm ruler
    const gaugePercent = currentDistance === null ? 0 : Math.min(100, Math.max(0, (currentDistance / 100) * 100));

    return (
        <div
            className={`flex flex-col rounded-3xl border transition-colors ${
                isDark
                    ? 'border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 shadow-sm'
                    : 'border-slate-200 bg-white shadow-sm'
            } p-4 sm:p-5 backdrop-blur-xl`}
            role="region"
            aria-label="Pengukuran Jarak Kamera ke Wajah"
        >
            {/* Header / Title Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-royal-blue/15 text-royal-blue dark:text-sky-300">
                        <Ruler className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-white">
                                Sensor Jarak Wajah
                            </h4>
                            <span className="rounded-md bg-royal-blue/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-royal-blue dark:text-sky-300">
                                LIVE SENSOR
                            </span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant dark:text-slate-400">
                            Pengukuran jarak kamera ke wajah / objek manusia
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setShowHelp(!showHelp)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-royal-blue dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        title="Panduan Metodologi Jarak Skripsi"
                        aria-label="Panduan"
                    >
                        <HelpCircle className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        title={isCollapsed ? 'Perluas' : 'Ciutkan'}
                        aria-label={isCollapsed ? 'Perluas' : 'Ciutkan'}
                    >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Help / Guidance Modal Accordion */}
            <AnimatePresence>
                {showHelp && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3 text-[11px] text-sky-900 dark:text-sky-200 space-y-1.5"
                    >
                        <div className="flex items-center gap-1.5 font-bold">
                            <Info className="h-3.5 w-3.5 shrink-0 text-royal-blue dark:text-sky-300" />
                            <span>Metodologi Skenario Jarak Skripsi (Cochran's Q):</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-[10px] pl-1 opacity-90">
                            <li><strong>30 cm (Ideal):</strong> Jarak operasional baku presensi guru di SMK Al-Madani.</li>
                            <li><strong>45 cm (Sedang):</strong> Uji akurasi embedding FaceNet & ketahanan liveness EMAR jarak menengah.</li>
                            <li><strong>60 cm (Jauh):</strong> Uji batas resolusi wajah dan kepekaan kedipan mata/mulut jarak jauh.</li>
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>

            {!isCollapsed && (
                <div className="mt-3.5 space-y-3.5">
                    {/* Source Mode Selector Tabs */}
                    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-container-low dark:bg-slate-900/60 p-1 border border-outline-variant/30 dark:border-white/5">
                        <button
                            type="button"
                            onClick={() => setMode('camera')}
                            className={`flex items-center justify-center gap-1 rounded-xl py-1.5 px-2 text-[10px] font-bold transition-all ${
                                mode === 'camera'
                                    ? 'bg-white dark:bg-slate-800 text-royal-blue dark:text-sky-300 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Camera className="h-3 w-3" />
                            <span>AI Kamera</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('hardware')}
                            className={`flex items-center justify-center gap-1 rounded-xl py-1.5 px-2 text-[10px] font-bold transition-all ${
                                mode === 'hardware'
                                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-300 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Cpu className="h-3 w-3" />
                            <span>Hardware ToF</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('manual')}
                            className={`flex items-center justify-center gap-1 rounded-xl py-1.5 px-2 text-[10px] font-bold transition-all ${
                                mode === 'manual'
                                    ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-300 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Sliders className="h-3 w-3" />
                            <span>Preset Baku</span>
                        </button>
                    </div>

                    {/* Main Distance Readout & Ruler Gauge */}
                    <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-medium text-on-surface-variant dark:text-slate-400 block">
                                    Jarak Terukur ({mode === 'camera' ? 'Geometri Wajah AI' : mode === 'hardware' ? 'Sensor Hardware' : 'Tanpa pengukuran'}):
                                </span>
                                {currentDistance === null ? (
                                    <div className="mt-0.5 font-mono text-xl font-black text-slate-500 dark:text-slate-400 tracking-tight">
                                        {NOT_MEASURED_LABEL}
                                    </div>
                                ) : (
                                    <div className="flex items-baseline gap-2 mt-0.5">
                                        <span className="font-mono text-3xl font-black text-deep-navy dark:text-white tracking-tight">
                                            {currentDistance.toFixed(1)}
                                        </span>
                                        <span className="font-bold text-sm text-slate-500 dark:text-slate-400">
                                            cm
                                        </span>
                                    </div>
                                )}
                                {targetDistance !== null && (
                                    <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                        Target uji: <span className="font-mono font-bold">{formatMeasured(targetDistance, 'cm')}</span> (bukan hasil ukur)
                                    </div>
                                )}
                            </div>

                            {/* Classification Badge */}
                            {category && (
                                <div className="text-right">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-black uppercase tracking-wider ${category.badgeColor}`}
                                    >
                                        {category.isIdeal ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                        ) : (
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                        )}
                                        <span>{category.label}</span>
                                    </span>
                                    <span className="block mt-1 font-mono text-[9px] text-slate-400 dark:text-slate-500">
                                        Target: {category.benchmarkTarget} cm
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Visual Ruler Gauge (0 - 100 cm) */}
                        <div className="space-y-1">
                            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                {/* Fill Indicator */}
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                        category?.code === 'TOO_CLOSE'
                                            ? 'bg-rose-500'
                                            : category?.code === 'IDEAL_30'
                                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                              : category?.code === 'MID_45'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-500'
                                                : category?.code === 'FAR_60'
                                                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                                  : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${gaugePercent}%` }}
                                />

                                {/* 30 cm Marker (Ideal) */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 dark:bg-emerald-300 z-10"
                                    style={{ left: '30%' }}
                                    title="Target Ideal: 30 cm"
                                />
                                {/* 45 cm Marker (Sedang) */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-sky-400 dark:bg-sky-300 z-10"
                                    style={{ left: '45%' }}
                                    title="Target Sedang: 45 cm"
                                />
                                {/* 60 cm Marker (Jauh) */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-purple-400 dark:bg-purple-300 z-10"
                                    style={{ left: '60%' }}
                                    title="Target Jauh: 60 cm"
                                />
                            </div>

                            {/* Ruler Labels */}
                            <div className="flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                                <span>0 cm</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">30 cm (Ideal)</span>
                                <span className="text-sky-600 dark:text-sky-400 font-bold">45 cm</span>
                                <span className="text-purple-600 dark:text-purple-400 font-bold">60 cm</span>
                                <span>100 cm</span>
                            </div>
                        </div>

                        {/* Guidance Pill */}
                        <p className="text-[10px] text-on-surface-variant dark:text-slate-300 flex items-center gap-1.5">
                            <span
                                className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                                    category?.isIdeal ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                            />
                            <span>
                                {category
                                    ? category.guidanceMessage
                                    : mode === 'hardware'
                                      ? hardwareReject
                                          ? hardwareRejectMessage(hardwareReject)
                                          : 'Menunggu bacaan sensor jarak.'
                                      : mode === 'manual'
                                        ? 'Preset hanya menetapkan target uji. Jarak presensi dikirim kosong.'
                                        : 'Wajah belum terdeteksi kamera. Jarak presensi dikirim kosong.'}
                            </span>
                        </p>
                    </div>

                    {/* Mode Specific Controls & Presets */}
                    {mode === 'manual' && (
                        <div className="space-y-2 pt-0.5">
                            <span className="text-[10px] font-bold text-on-surface-variant dark:text-slate-400 uppercase tracking-wider block">
                                Target Uji (Preset, Bukan Hasil Ukur):
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => applyPreset(30)}
                                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                        targetDistance !== null && Math.abs(targetDistance - 30) < 5
                                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 shadow-xs'
                                            : 'border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-emerald-400'
                                    }`}
                                >
                                    <div className="text-[11px]">30 cm</div>
                                    <div className="font-mono text-[10px] opacity-80">Baku / Ideal</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyPreset(45)}
                                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                        targetDistance !== null && Math.abs(targetDistance - 45) < 5
                                            ? 'border-sky-500 bg-sky-500/20 text-sky-900 dark:text-sky-200 shadow-xs'
                                            : 'border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-sky-400'
                                    }`}
                                >
                                    <div className="text-[11px]">45 cm</div>
                                    <div className="font-mono text-[10px] opacity-80">Sedang</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyPreset(60)}
                                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                        targetDistance !== null && Math.abs(targetDistance - 60) < 5
                                            ? 'border-purple-500 bg-purple-500/20 text-purple-900 dark:text-purple-200 shadow-xs'
                                            : 'border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-purple-400'
                                    }`}
                                >
                                    <div className="text-[11px]">60 cm</div>
                                    <div className="font-mono text-[10px] opacity-80">Jauh</div>
                                </button>
                            </div>

                            {/* Fine Tune Stepper */}
                            <div className="flex items-center gap-2 pt-1">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">Penyesuaian:</span>
                                <div className="flex items-center gap-1 flex-1">
                                    <button
                                        type="button"
                                        disabled={targetDistance === null}
                                        onClick={() => adjustDistance(-5)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        -5cm
                                    </button>
                                    <button
                                        type="button"
                                        disabled={targetDistance === null}
                                        onClick={() => adjustDistance(-1)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        -1cm
                                    </button>
                                    <button
                                        type="button"
                                        disabled={targetDistance === null}
                                        onClick={() => adjustDistance(+1)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        +1cm
                                    </button>
                                    <button
                                        type="button"
                                        disabled={targetDistance === null}
                                        onClick={() => adjustDistance(+5)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        +5cm
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'hardware' && (
                        <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low/60 dark:bg-slate-900/30 p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                    <span
                                        className={`h-2 w-2 rounded-full ${
                                            isHardwareConnected
                                                ? 'bg-emerald-500 animate-pulse'
                                                : 'bg-amber-500'
                                        }`}
                                    />
                                    <span className="font-bold text-deep-navy dark:text-white">
                                        {isHardwareConnected
                                            ? `${hardwareDevice || 'Sensor ToF / Ultrasonic'} (${lastUpdated})`
                                            : 'Tidak ada bacaan aktif'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchHardwareDistance}
                                    disabled={isFetchingHardware}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-royal-blue dark:text-sky-300 hover:bg-royal-blue/10 dark:hover:bg-sky-400/10 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw
                                        className={`h-3 w-3 ${
                                            isFetchingHardware ? 'animate-spin' : ''
                                        }`}
                                    />
                                    <span>Sinkron</span>
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                                Jalankan skrip terminal untuk sinkronisasi hardware ToF / ultrasonik:
                                <code className="block mt-1 font-mono text-[9px] bg-black/10 dark:bg-black/30 p-1.5 rounded-lg text-slate-700 dark:text-slate-300">
                                    python scripts/measure_distance.py --port COM3 --sync
                                </code>
                            </p>
                        </div>
                    )}

                    {mode === 'camera' && (
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                            <span className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Sensor geometri wajah AI aktif (30-60 FPS)</span>
                            </span>
                            <span className="font-mono">{lastUpdated || 'Menunggu Wajah'}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
