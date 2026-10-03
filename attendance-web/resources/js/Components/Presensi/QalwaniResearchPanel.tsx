import {
    Activity,
    Brain,
    ChevronDown,
    ChevronUp,
    Clock,
    Eye,
    Hash,
    Ruler,
    Smile,
    Sun,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useState } from 'react';

interface QalwaniResearchPanelProps {
    ear: number;
    mar: number;
    quality: number;
    lux?: number | null;
    /** 'camera' = perkiraan kamera tanpa kalibrasi; ditampilkan dengan ~. */
    luxSource?: string | null;
    luxCondition?: string | null;
    distanceCm?: number | null;
    distanceCategory?: string | null;
    facenetScore?: number | null;
    emarScore?: number | null;
    latencyMs?: number | null;
    sessionId?: string | null;
    isDark?: boolean;
}

export function QalwaniResearchPanel({
    ear,
    mar,
    quality,
    lux,
    luxSource = null,
    luxCondition,
    distanceCm,
    distanceCategory,
    facenetScore,
    emarScore,
    latencyMs,
    sessionId,
    isDark = true,
}: QalwaniResearchPanelProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div
            className={`w-full rounded-2xl border transition-colors ${
                isDark
                    ? 'border-white/10 bg-slate-900/95'
                    : 'border-slate-200 bg-white'
            }`}
            role="region"
            aria-label="Panel Telemetri Penelitian Qalwani"
        >
            {/* Header Button (Collapsible) */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between rounded-2xl p-3.5 text-left focus:outline-none focus:ring-2 focus:ring-royal-blue"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-royal-blue/10 dark:bg-sky-400/15 text-royal-blue dark:text-sky-300">
                        <Activity className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                            Telemetri Penelitian Biometrik
                        </h3>
                        <p
                            className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                        >
                            Data pengujian internal (bukan presensi resmi)
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                        QALWANI
                    </span>
                    {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                </div>
            </button>

            {/* Collapsible Content with Framer Motion */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="space-y-3 overflow-hidden border-t border-slate-100 dark:border-white/10 p-4 pt-3"
                    >
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* EAR */}
                            <MetricCard
                                icon={
                                    <Eye className="h-3.5 w-3.5 text-royal-blue dark:text-sky-300" />
                                }
                                label="EAR"
                                value={ear.toFixed(3)}
                                sublabel="Eye Aspect Ratio"
                                isDark={isDark}
                            />

                            {/* MAR */}
                            <MetricCard
                                icon={
                                    <Smile className="h-3.5 w-3.5 text-royal-blue dark:text-sky-300" />
                                }
                                label="MAR"
                                value={mar.toFixed(3)}
                                sublabel="Mouth Aspect Ratio"
                                isDark={isDark}
                            />

                            {/* FaceNet Distance */}
                            <MetricCard
                                icon={
                                    <Brain className="h-3.5 w-3.5 text-royal-blue dark:text-sky-300" />
                                }
                                label="FaceNet"
                                value={
                                    facenetScore != null
                                        ? facenetScore.toFixed(3)
                                        : '-'
                                }
                                sublabel="1:1 Distance"
                                isDark={isDark}
                            />

                            {/* EMAR Liveness Fusion */}
                            <MetricCard
                                icon={
                                    <Activity className="h-3.5 w-3.5 text-royal-blue dark:text-sky-300" />
                                }
                                label="EMAR"
                                value={
                                    emarScore != null
                                        ? emarScore.toFixed(3)
                                        : '-'
                                }
                                sublabel="Liveness Fusion"
                                isDark={isDark}
                            />

                            {/* Intensitas Cahaya (Lux) */}
                            <MetricCard
                                icon={
                                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                                }
                                label="Lux"
                                value={
                                    lux != null
                                        ? `${luxSource === 'camera' ? '~' : ''}${Math.round(lux)}`
                                        : '-'
                                }
                                sublabel={
                                    luxCondition
                                        ? `Kondisi ${luxCondition}${luxSource === 'camera' ? ' · perkiraan kamera' : ''}`
                                        : 'Pencahayaan'
                                }
                                isDark={isDark}
                            />

                            {/* Jarak Sensor (Live / Preset) */}
                            <MetricCard
                                icon={
                                    <Ruler className="h-3.5 w-3.5 text-emerald-500" />
                                }
                                label="Jarak"
                                value={
                                    distanceCm != null
                                        ? `${Math.round(distanceCm)} cm`
                                        : '-'
                                }
                                sublabel={distanceCategory || 'Jarak Sensor'}
                                isDark={isDark}
                            />
                        </div>

                        {/* Footer: Session & Latency */}
                        <div
                            className={`flex items-center justify-between border-t pt-2 text-[10px] ${
                                isDark
                                    ? 'border-slate-800 text-slate-400'
                                    : 'border-slate-200 text-slate-600'
                            }`}
                        >
                            <div
                                className="flex items-center gap-1"
                                title="Session ID"
                            >
                                <Hash className="h-3 w-3" />
                                <span className="font-mono">
                                    {sessionId ? sessionId.slice(0, 8) : '-'}
                                </span>
                            </div>
                            <div
                                className="flex items-center gap-1"
                                title="Backend Latency"
                            >
                                <Clock className="h-3 w-3" />
                                <span>
                                    {latencyMs != null ? `${latencyMs}ms` : '-'}
                                </span>
                            </div>
                            <span>Kualitas: {Math.round(quality * 100)}%</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ---- Helper Metric Card ---- */
function MetricCard({
    icon,
    label,
    value,
    sublabel,
    isDark = true,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sublabel: string;
    isDark?: boolean;
}) {
    return (
        <div
            className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${
                isDark
                    ? 'border-slate-800 bg-slate-950/60'
                    : 'border-slate-200 bg-slate-50/60'
            }`}
        >
            <div className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5">{icon}</div>
            <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                    <span
                        className={`text-xs font-bold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                    >
                        {value}
                    </span>
                    <span
                        className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                        {label}
                    </span>
                </div>
                <span
                    className={`text-[9px] leading-tight block truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}
                >
                    {sublabel}
                </span>
            </div>
        </div>
    );
}
