import axios from 'axios';
import {
    Activity,
    AlertTriangle,
    Camera,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Cpu,
    HelpCircle,
    Info,
    RefreshCw,
    Sliders,
    Sparkles,
    Sun,
    SunMedium,
    Wrench,
    Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CALIBRATION_PROFILES,
    CalibrationProfile,
    sampleCameraPhotometry,
    getLuxCategory,
    isUsablePhotometry,
    luxEstimateDetail,
    loadLuxCalibration,
    LuxCategory,
    LuxSensorSmoother,
    NormalizedFaceROI,
    PhotometryAnalysis,
    saveLuxCalibration,
} from '../../Utils/luxMeasurement';
import {
    evaluateHardwareReading,
    formatMeasured,
    HardwareRejectReason,
    hardwareRejectMessage,
    LuxSource,
    NOT_MEASURED_LABEL,
    SensorReading,
} from '../../Utils/sensorReading';

export type LuxSourceMode = 'camera' | 'hardware' | 'manual';

export interface LuxometerWidgetProps {
    /** Lux terukur yang dipakai halaman; null bila tidak ada bacaan segar. */
    currentLux: number | null;
    /** Hanya bacaan kamera atau luxmeter aktif; null bila mode ini tidak mengukur. */
    onLuxChange: (reading: SensorReading<LuxSource> | null) => void;
    /** Target skenario uji (preset), terpisah dari hasil ukur. */
    targetLux?: number | null;
    onTargetChange?: (lux: number | null) => void;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
    faceROI?: NormalizedFaceROI | null;
    isScanning?: boolean;
    isDark?: boolean;
    /** Kalibrasi lux aktif (luxmeter); bila ada, mode Kamera memakai sampel terkalibrasi. */
    luxCalibration?: { id: number; referenceLabel: string | null } | null;
    /** Sampel kamera terkalibrasi terakhir, sama dengan panel Pencahayaan. */
    calibratedReading?: { lux: number | null; measuredAt: number; note: string | null } | null;
    onCalibrate?: () => void;
}

export { getLuxCategory };
export type { LuxCategory };

export function LuxometerWidget({
    currentLux,
    onLuxChange,
    targetLux = null,
    onTargetChange,
    videoRef,
    faceROI,
    isScanning = false,
    isDark = true,
    luxCalibration = null,
    calibratedReading = null,
    onCalibrate,
}: LuxometerWidgetProps) {
    const [mode, setMode] = useState<LuxSourceMode>('camera');
    const [isHardwareConnected, setIsHardwareConnected] = useState<boolean>(false);
    const [hardwareReject, setHardwareReject] = useState<HardwareRejectReason | null>(null);
    const [hardwareDevice, setHardwareDevice] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isFetchingHardware, setIsFetchingHardware] = useState<boolean>(false);
    const [showHelp, setShowHelp] = useState<boolean>(false);
    const [showCalibration, setShowCalibration] = useState<boolean>(false);
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

    /* Calibration State */
    const [calibration, setCalibration] = useState<{ profileId: string; factor: number; offset: number }>(() => loadLuxCalibration());
    const [referenceLuxInput, setReferenceLuxInput] = useState<string>('');
    const [analysisDetail, setAnalysisDetail] = useState<PhotometryAnalysis | null>(null);
    const [activeMethodDesc, setActiveMethodDesc] = useState<string>('Fotometri Objek Wajah');

    /* Refs */
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pollIntervalRef = useRef<any>(null);
    const cameraSampleRef = useRef<any>(null);
    const luxSmootherRef = useRef<LuxSensorSmoother>(new LuxSensorSmoother(0.30, 0.75));
    const modeRef = useRef<LuxSourceMode>(mode);
    const faceROIRef = useRef(faceROI);
    faceROIRef.current = faceROI;

    const isCalibrated = luxCalibration !== null;
    // Dengan kalibrasi, mode Kamera menampilkan sampel terkalibrasi (sama dengan
    // panel Pencahayaan), bukan perkiraan fotometri.
    const displayLux = mode === 'camera' && isCalibrated ? calibratedReading?.lux ?? null : currentLux;
    const category = useMemo(() => (displayLux === null ? null : getLuxCategory(displayLux)), [displayLux]);

    /* ---- 1. Camera Optical Photometry Sampling (Human Face & Room Light) ---- */
    const sampleCameraLuminance = useCallback(() => {
        try {
            if (!offscreenCanvasRef.current) {
                offscreenCanvasRef.current = document.createElement('canvas');
            }
            const analysis = sampleCameraPhotometry(videoRef?.current, offscreenCanvasRef.current, faceROIRef.current, calibration);
            if (!analysis) return;

            setAnalysisDetail(analysis);
            // Frame hitam/jenuh tidak dicatat sebagai batas model; bacaan lama kedaluwarsa sendiri.
            if (!isUsablePhotometry(analysis)) return;

            // Filter micro-jitter & fluorescent 50Hz/60Hz AC flicker
            const smoothed = luxSmootherRef.current.update(analysis.calibratedLux);
            onLuxChange({
                value: smoothed,
                source: 'camera',
                measuredAt: Date.now(),
                estimate: luxEstimateDetail(analysis, calibration),
            });

            if (analysis.method === 'apex_exposure') {
                setActiveMethodDesc('APEX Optik Fisik (Hardware Shutter)');
            } else if (analysis.isFaceTargeted) {
                if (analysis.isGlareCompensated) {
                    setActiveMethodDesc(`Fotometri Wajah (Filter Layar Aktif) [${calibration.factor.toFixed(2)}x]`);
                } else {
                    setActiveMethodDesc(`Fotometri Wajah Objek [${calibration.factor.toFixed(2)}x]`);
                }
            } else {
                setActiveMethodDesc(`Area Portrait (Menunggu Wajah) [${calibration.factor.toFixed(2)}x]`);
            }
            setLastUpdated(analysis.isFaceTargeted ? 'Target: Wajah Terkunci' : 'Target: Area Portrait');
        } catch {
            // Optical sampling fallback
        }
    }, [videoRef, onLuxChange, calibration]);

    /* ---- 2. Hardware Luxometer API Polling (Serial COM / External) ---- */
    // Angka luxmeter dipakai apa adanya (tanpa smoothing) dan hanya bila server
    // menandainya hasil ukur segar. Selain itu null: angka lama tidak dipertahankan.
    const fetchHardwareLux = useCallback(async () => {
        setIsFetchingHardware(true);
        try {
            const resp = await axios.get('/api/lux/current');
            // Respons yang tiba setelah pindah mode tidak boleh menimpa sumber baru.
            if (modeRef.current !== 'hardware') return;
            const verdict = evaluateHardwareReading(resp.data, 'lux');
            if (verdict.accepted) {
                onLuxChange({
                    value: verdict.value,
                    source: 'luxmeter',
                    measuredAt: Date.now() - verdict.secondsAgo * 1000,
                });
                setIsHardwareConnected(true);
                setHardwareReject(null);
                setHardwareDevice(resp.data.device || 'Luxometer Serial');
                setLastUpdated(`${Math.max(0, Math.round(verdict.secondsAgo))}s lalu`);
            } else {
                onLuxChange(null);
                setIsHardwareConnected(false);
                setHardwareReject(verdict.reason);
                setLastUpdated(null);
            }
        } catch {
            if (modeRef.current !== 'hardware') return;
            onLuxChange(null);
            setIsHardwareConnected(false);
            setHardwareReject('unreachable');
            setLastUpdated(null);
        } finally {
            setIsFetchingHardware(false);
        }
    }, [onLuxChange]);

    // Ganti mode = ganti sumber: bacaan mode sebelumnya tidak boleh terbawa.
    useEffect(() => {
        modeRef.current = mode;
        luxSmootherRef.current.reset();
        setHardwareReject(null);
        onLuxChange(null);
    }, [mode, onLuxChange]);

    /* ---- 3. Mode Effect Management ---- */
    useEffect(() => {
        if (mode === 'camera') {
            if (isCalibrated) {
                onLuxChange(null);
                return;
            }
            sampleCameraLuminance();
            cameraSampleRef.current = setInterval(sampleCameraLuminance, 1000);
            return () => {
                if (cameraSampleRef.current) clearInterval(cameraSampleRef.current);
            };
        } else if (mode === 'hardware') {
            fetchHardwareLux();
            pollIntervalRef.current = setInterval(fetchHardwareLux, 1500);
            return () => {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            };
        }
    }, [mode, isCalibrated, onLuxChange, sampleCameraLuminance, fetchHardwareLux]);

    /* ---- Calibration Handlers ---- */
    const handleSelectProfile = (profileId: string) => {
        const p = CALIBRATION_PROFILES.find((prof) => prof.id === profileId);
        if (p) {
            const next = { profileId: p.id, factor: p.factor, offset: p.offset };
            setCalibration(next);
            saveLuxCalibration(next.profileId, next.factor, next.offset);
            luxSmootherRef.current.reset();
        }
    };

    const handleFactorChange = (newFactor: number) => {
        const factorClamped = Math.max(0.3, Math.min(3.0, parseFloat(newFactor.toFixed(2))));
        const next = { ...calibration, profileId: 'CUSTOM', factor: factorClamped };
        setCalibration(next);
        saveLuxCalibration(next.profileId, next.factor, next.offset);
        luxSmootherRef.current.reset();
    };

    const handleApplyReferenceCalibration = () => {
        const targetLux = parseFloat(referenceLuxInput);
        if (isNaN(targetLux) || targetLux <= 0) return;

        const currentRaw = analysisDetail?.rawLux ?? (currentLux === null ? 0 : currentLux / (calibration.factor || 1.0));
        if (currentRaw <= 0) return;

        const calculatedFactor = parseFloat((targetLux / currentRaw).toFixed(2));
        const next = { profileId: 'CUSTOM', factor: calculatedFactor, offset: 0 };
        setCalibration(next);
        saveLuxCalibration(next.profileId, next.factor, next.offset);
        luxSmootherRef.current.reset();
        setReferenceLuxInput('');
    };

    const handleResetCalibration = () => {
        const next = { profileId: 'LAPTOP_DEFAULT', factor: 1.0, offset: 0 };
        setCalibration(next);
        saveLuxCalibration(next.profileId, next.factor, next.offset);
        luxSmootherRef.current.reset();
    };

    // Preset hanya menetapkan target skenario uji. Tidak dikirim ke /api/lux/update
    // karena akan menimpa bacaan luxmeter di sidecar dengan angka yang tidak diukur.
    const applyPreset = (luxVal: number) => {
        setMode('manual');
        onTargetChange?.(luxVal);
    };

    const adjustLux = (delta: number) => {
        if (targetLux === null) return;
        setMode('manual');
        onTargetChange?.(Math.max(10, Math.min(5000, targetLux + delta)));
    };

    const targetCategory = targetLux === null ? null : getLuxCategory(targetLux);

    // Calculate percentage for gauge (0 - 1000 Lux)
    const gaugePercent = displayLux === null ? 0 : Math.min(100, Math.max(0, (displayLux / 1000) * 100));

    return (
        <div
            className={`flex flex-col rounded-3xl border transition-colors ${
                isDark
                    ? 'border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 shadow-sm'
                    : 'border-slate-200 bg-white shadow-sm'
            } p-4 sm:p-5 backdrop-blur-xl`}
            role="region"
            aria-label="Pengukuran Intensitas Cahaya Luxometer"
        >
            {/* Header / Title Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <SunMedium className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-white">
                                Luxometer Biometrik
                            </h4>
                            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-700 dark:text-amber-300">
                                ISO 30107-3
                            </span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant dark:text-slate-400">
                            Pengukuran intensitas cahaya &amp; validasi pencahayaan
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Calibration & Accuracy Button */}
                    <button
                        type="button"
                        onClick={() => setShowCalibration(!showCalibration)}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                            showCalibration
                                ? 'bg-royal-blue/15 text-royal-blue dark:bg-sky-400/20 dark:text-sky-300'
                                : 'text-slate-400 hover:text-royal-blue dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                        title="Kalibrasi Akurasi Sensor Lux"
                        aria-label="Kalibrasi"
                    >
                        <Wrench className="h-3.5 w-3.5" />
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowHelp(!showHelp)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-royal-blue dark:hover:text-sky-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        title="Panduan Standar Pencahayaan Skripsi"
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
                        className="overflow-hidden mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-[11px] text-blue-900 dark:text-blue-200 space-y-1.5"
                    >
                        <div className="flex items-center gap-1.5 font-bold">
                            <Info className="h-3.5 w-3.5 shrink-0 text-royal-blue dark:text-sky-300" />
                            <span>Metodologi Pencahayaan Skripsi (Cochran's Q):</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-[10px] pl-1 opacity-90">
                            <li><strong>Redup (&lt; 100 Lux):</strong> Uji ketahanan ekstraksi fitur FaceNet pada kondisi minim cahaya.</li>
                            <li><strong>Standar (100 - 300 Lux):</strong> Kondisi operasional ideal presensi harian guru.</li>
                            <li><strong>Terang (&gt; 300 Lux):</strong> Uji mitigasi pantulan cahaya (flare) dan serangan layar (screen attack).</li>
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Calibration & Accuracy Tool Drawer */}
            <AnimatePresence>
                {showCalibration && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 dark:bg-sky-500/5 p-3.5 space-y-3 text-xs"
                    >
                        {isCalibrated ? (
                            <div className="space-y-2">
                                <p className="font-bold text-royal-blue dark:text-sky-300">Kalibrasi lux aktif #{luxCalibration.id}</p>
                                <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                                    Angka mode Kamera berasal dari sampel kamera terkalibrasi
                                    {luxCalibration.referenceLabel ? ` (acuan ${luxCalibration.referenceLabel.toLowerCase()})` : ''}, sama dengan panel
                                    Pencahayaan dan yang dicatat bersama presensi.
                                </p>
                                {onCalibrate && (
                                    <button type="button" onClick={onCalibrate} className="rounded-lg bg-royal-blue px-3 py-1.5 text-[11px] font-bold text-white hover:bg-deep-navy dark:bg-sky-600 dark:hover:bg-sky-500">
                                        Kalibrasi ulang
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-900 dark:text-amber-200">
                                    <p>
                                        Alat di bawah hanya menyetel perkiraan kamera (belum dikalibrasi). Untuk lux terukur, kalibrasi kamera
                                        dengan luxmeter.
                                    </p>
                                    {onCalibrate && (
                                        <button type="button" onClick={onCalibrate} className="rounded-lg bg-royal-blue px-3 py-1.5 text-[11px] font-bold text-white hover:bg-deep-navy dark:bg-sky-600 dark:hover:bg-sky-500">
                                            Kalibrasi lux
                                        </button>
                                    )}
                                </div>
                        <div className="flex items-center justify-between border-b border-sky-500/20 pb-2">
                            <div className="flex items-center gap-1.5 font-bold text-royal-blue dark:text-sky-300">
                                <Sparkles className="h-4 w-4 text-amber-400" />
                                <span>Kalibrasi &amp; Presisi Fotometri</span>
                            </div>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-800 dark:text-sky-200">
                                Faktor: {calibration.factor.toFixed(2)}x
                            </span>
                        </div>

                        {/* Profil Sensor Kamera */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
                                Profil Sensor / Kamera:
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {CALIBRATION_PROFILES.map((prof) => (
                                    <button
                                        key={prof.id}
                                        type="button"
                                        onClick={() => handleSelectProfile(prof.id)}
                                        className={`p-2 rounded-xl border text-left transition-all ${
                                            calibration.profileId === prof.id
                                                ? 'border-royal-blue bg-royal-blue/15 text-royal-blue dark:border-sky-400 dark:bg-sky-400/20 dark:text-sky-200 font-bold'
                                                : 'border-slate-300 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        <div className="text-[11px] truncate">{prof.name}</div>
                                        <div className="font-mono text-[9px] opacity-75">{prof.factor}x pengali</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Fine Tuning Multiplier Slider */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="font-semibold text-slate-600 dark:text-slate-300">Pengali Sensitivitas (Gain Multiplier):</span>
                                <span className="font-mono font-bold text-royal-blue dark:text-sky-300">{calibration.factor.toFixed(2)}x</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-slate-400">0.5x</span>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2.5"
                                    step="0.05"
                                    value={calibration.factor}
                                    onChange={(e) => handleFactorChange(parseFloat(e.target.value))}
                                    className="flex-1 accent-royal-blue dark:accent-sky-400 cursor-pointer h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg"
                                />
                                <span className="text-[10px] font-mono text-slate-400">2.5x</span>
                                <button
                                    type="button"
                                    onClick={handleResetCalibration}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 transition-colors"
                                    title="Reset ke 1.0x"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* Reference Luxmeter Tool */}
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Kalibrasi ke Luxmeter Digital Acuan:</span>
                            </div>
                            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-snug">
                                Masukkan angka pembacaan dari luxmeter fisik Anda saat ini untuk mengunci kalibrasi kamera secara otomatis.
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                                <input
                                    type="number"
                                    min="10"
                                    max="5000"
                                    placeholder="Contoh: 300"
                                    value={referenceLuxInput}
                                    onChange={(e) => setReferenceLuxInput(e.target.value)}
                                    className="flex-1 rounded-lg border border-emerald-500/40 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-deep-navy dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleApplyReferenceCalibration}
                                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer"
                                >
                                    Terapkan
                                </button>
                            </div>
                        </div>

                        {/* Real-time Photometry Diagnostics */}
                        {analysisDetail && (
                            <div className="space-y-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 p-2.5 font-mono text-[9px]">
                                <div className="grid grid-cols-4 gap-1 text-center">
                                    <div>
                                        <span className="text-slate-400 block">Wajah (Y)</span>
                                        <span className="font-bold text-deep-navy dark:text-white">{analysisDetail.meanFaceY}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block">Ruang (Y)</span>
                                        <span className="font-bold text-deep-navy dark:text-white">{analysisDetail.meanAmbientY}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block">Shadow %</span>
                                        <span className="font-bold text-amber-600 dark:text-amber-400">{Math.round(analysisDetail.shadowClipRatio * 100)}%</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block">Highlight %</span>
                                        <span className="font-bold text-sky-600 dark:text-sky-400">{Math.round(analysisDetail.highlightClipRatio * 100)}%</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-1.5 text-[8.5px]">
                                    <span className="text-slate-500">
                                        Target: <strong className={analysisDetail.isFaceTargeted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                                            {analysisDetail.isFaceTargeted ? 'Objek Manusia (Face ROI)' : 'Area Portrait Standar'}
                                        </strong>
                                    </span>
                                    <span className="text-slate-500">
                                        Filter Pendaran Layar: <strong className={analysisDetail.isGlareCompensated ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}>
                                            {analysisDetail.isGlareCompensated ? 'Aktif (Diskon Glare)' : 'Normal'}
                                        </strong>
                                    </span>
                                </div>
                            </div>
                        )}
                            </>
                        )}
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
                            <span>Kamera (Objek)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('hardware')}
                            className={`flex items-center justify-center gap-1 rounded-xl py-1.5 px-2 text-[10px] font-bold transition-all ${
                                mode === 'hardware'
                                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-300 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Cpu className="h-3 w-3" />
                            <span>Hardware Meter</span>
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
                            <span>Preset Uji</span>
                        </button>
                    </div>

                    {/* Main Gauge & Reading Display Card */}
                    <div className="rounded-2xl border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-medium text-on-surface-variant dark:text-slate-400 block">
                                        Intensitas Cahaya Ruangan:
                                    </span>
                                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-royal-blue/10 dark:bg-sky-400/15 text-royal-blue dark:text-sky-300">
                                        {mode === 'camera'
                                            ? isCalibrated
                                                ? `Kamera terkalibrasi #${luxCalibration.id}`
                                                : 'Perkiraan (belum dikalibrasi)'
                                            : mode === 'hardware'
                                              ? 'Luxmeter'
                                              : 'Tanpa pengukuran'}
                                    </span>
                                </div>
                                {displayLux === null ? (
                                    <div className="mt-0.5 font-mono text-xl font-black text-slate-500 dark:text-slate-400 tracking-tight">
                                        {NOT_MEASURED_LABEL}
                                    </div>
                                ) : (
                                    <div className="flex items-baseline gap-2 mt-0.5">
                                        <span className="font-mono text-3xl font-black text-deep-navy dark:text-white tracking-tight">
                                            {Math.round(displayLux)}
                                        </span>
                                        <span className="font-bold text-sm text-slate-500 dark:text-slate-400">
                                            Lux
                                        </span>
                                    </div>
                                )}
                                {targetLux !== null && (
                                    <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                        Target uji: <span className="font-mono font-bold">{formatMeasured(targetLux, 'Lux')}</span> (bukan hasil ukur)
                                    </div>
                                )}
                                {mode === 'camera' && !isCalibrated && (
                                    <div className="flex items-center gap-1.5 mt-1 text-[9.5px]" title={activeMethodDesc}>
                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${faceROI?.isDetected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                                            {faceROI?.isDetected ? 'Cahaya Ruangan pada Wajah (Terkunci)' : 'Mencari Objek Manusia...'}
                                        </span>
                                        {analysisDetail?.isGlareCompensated && (
                                            <span className="font-mono text-[8.5px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold">
                                                Anti-Glare Layar
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Classification Badge */}
                            {category && (
                                <div className="text-right">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-black uppercase tracking-wider ${category.badgeColor}`}
                                    >
                                        {category.isOptimal ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                        ) : (
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                        )}
                                        <span>{category.label}</span>
                                    </span>
                                    <span className="block mt-1 font-mono text-[9px] text-slate-400 dark:text-slate-500">
                                        {category.code}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Visual Range Bar (0 - 1000 Lux) */}
                        <div className="space-y-1">
                            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                {/* Fill Indicator */}
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                        category?.code === 'LOW'
                                            ? 'bg-gradient-to-r from-amber-600 to-amber-400'
                                            : category?.code === 'NORMAL'
                                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                              : 'bg-gradient-to-r from-sky-500 to-blue-500'
                                    }`}
                                    style={{ width: `${gaugePercent}%` }}
                                />

                                {/* 100 Lux Marker (Redup -> Standar) */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-slate-400 dark:bg-white/40 z-10"
                                    style={{ left: '10%' }}
                                    title="Batas Redup: 100 Lux"
                                />
                                {/* 300 Lux Marker (Standar -> Terang) */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-slate-400 dark:bg-white/40 z-10"
                                    style={{ left: '30%' }}
                                    title="Batas Terang: 300 Lux"
                                />
                            </div>

                            {/* Range Labels */}
                            <div className="flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                                <span>0 Lux</span>
                                <span className="text-amber-600 dark:text-amber-400">100 (Redup)</span>
                                <span className="text-emerald-600 dark:text-emerald-400">300 (Standar)</span>
                                <span>1000+ Lux</span>
                            </div>
                        </div>

                        {/* Description Pill */}
                        <p className="text-[10px] text-on-surface-variant dark:text-slate-300 flex items-center gap-1.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-royal-blue dark:bg-sky-400 shrink-0" />
                            <span>
                                {category
                                    ? category.description
                                    : mode === 'hardware'
                                      ? hardwareReject
                                          ? hardwareRejectMessage(hardwareReject)
                                          : 'Menunggu bacaan luxmeter.'
                                      : mode === 'manual'
                                        ? 'Preset hanya menetapkan target uji. Lux presensi dikirim kosong.'
                                        : isCalibrated
                                          ? calibratedReading?.note
                                              ? `${calibratedReading.note}.`
                                              : 'Menunggu sampel kamera terkalibrasi (saat kamera siap, tiap 30 detik, dan saat hitung mundur).'
                                          : 'Belum ada bacaan kamera. Lux presensi dikirim kosong.'}
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
                                    onClick={() => applyPreset(75)}
                                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                        targetCategory?.code === 'LOW'
                                            ? 'border-amber-500 bg-amber-500/20 text-amber-900 dark:text-amber-200 shadow-xs'
                                            : 'border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-amber-400'
                                    }`}
                                >
                                    <div className="text-[11px]">Redup</div>
                                    <div className="font-mono text-[10px] opacity-80">75 Lux</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyPreset(300)}
                                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                        targetCategory?.code === 'NORMAL'
                                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 shadow-xs'
                                            : 'border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-emerald-400'
                                    }`}
                                >
                                    <div className="text-[11px]">Standar</div>
                                    <div className="font-mono text-[10px] opacity-80">300 Lux</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyPreset(650)}
                                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                        targetCategory?.code === 'HIGH'
                                            ? 'border-sky-500 bg-sky-500/20 text-sky-900 dark:text-sky-200 shadow-xs'
                                            : 'border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-sky-400'
                                    }`}
                                >
                                    <div className="text-[11px]">Terang</div>
                                    <div className="font-mono text-[10px] opacity-80">650 Lux</div>
                                </button>
                            </div>

                            {/* Fine Tune Stepper */}
                            <div className="flex items-center gap-2 pt-1">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">Penyesuaian:</span>
                                <div className="flex items-center gap-1 flex-1">
                                    <button
                                        type="button"
                                        disabled={targetLux === null}
                                        onClick={() => adjustLux(-50)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        -50
                                    </button>
                                    <button
                                        type="button"
                                        disabled={targetLux === null}
                                        onClick={() => adjustLux(-10)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        -10
                                    </button>
                                    <button
                                        type="button"
                                        disabled={targetLux === null}
                                        onClick={() => adjustLux(+10)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        +10
                                    </button>
                                    <button
                                        type="button"
                                        disabled={targetLux === null}
                                        onClick={() => adjustLux(+50)}
                                        className="flex-1 py-1 rounded-lg border border-outline-variant/30 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-xs font-mono font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40"
                                    >
                                        +50
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
                                            ? `${hardwareDevice || 'Luxometer Serial'} (${lastUpdated})`
                                            : 'Tidak ada bacaan aktif'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchHardwareLux}
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
                                Jalankan skrip terminal untuk sinkronisasi hardware serial:
                                <code className="block mt-1 font-mono text-[9px] bg-black/10 dark:bg-black/30 p-1.5 rounded-lg text-slate-700 dark:text-slate-300">
                                    python scripts/measure_lux.py --port COM3 --sync
                                </code>
                            </p>
                        </div>
                    )}

                    {mode === 'camera' && (
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                            <span className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>{activeMethodDesc}</span>
                            </span>
                            <span className="font-mono">{lastUpdated}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
