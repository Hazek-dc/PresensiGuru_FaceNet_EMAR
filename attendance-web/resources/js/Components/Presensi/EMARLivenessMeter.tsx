import { Activity, Eye, Smile } from 'lucide-react';
import React from 'react';

interface EMARLivenessMeterProps {
    ear: number;
    mar: number;
    isBlinkActive?: boolean;
    isMouthActive?: boolean;
    isDark?: boolean;
}

const EAR_THRESH = 0.20;
const MAR_THRESH = 0.10;

export function EMARLivenessMeter({
    ear,
    mar,
    isBlinkActive = false,
    isMouthActive = false,
    isDark = true,
}: EMARLivenessMeterProps) {
    // Normalization for visual progress bars
    // EAR range typically 0.05 - 0.35
    const earPercent = Math.min(100, Math.max(0, (ear / 0.35) * 100));
    const earThreshPercent = (EAR_THRESH / 0.35) * 100;

    // MAR range typically 0.05 - 0.40
    const marPercent = Math.min(100, Math.max(0, (mar / 0.40) * 100));
    const marThreshPercent = (MAR_THRESH / 0.40) * 100;

    const isEarOpen = ear >= EAR_THRESH;
    const isMarOpen = mar >= MAR_THRESH;

    return (
        <div
            className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 transition-colors ${
                isDark
                    ? 'border-slate-800/80 bg-slate-900/90'
                    : 'border-slate-200 bg-white shadow-sm'
            }`}
            role="region"
            aria-label="Meter Liveness EMAR Realtime"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                        <Activity className="h-3.5 w-3.5" />
                    </div>
                    <span
                        className={`font-mono text-[11px] font-bold uppercase tracking-wider ${
                            isDark ? 'text-slate-300' : 'text-slate-700'
                        }`}
                    >
                        Meter Liveness EMAR
                    </span>
                </div>
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[9px] font-bold text-purple-300">
                    REALTIME
                </span>
            </div>

            {/* Grid for EAR & MAR Meters */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {/* EAR Bar */}
                <div
                    className={`flex flex-col gap-1.5 rounded-xl border p-2.5 ${
                        isDark
                            ? 'border-slate-800 bg-slate-950/60'
                            : 'border-slate-200/80 bg-slate-50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-slate-400">
                            <Eye className="h-3.5 w-3.5 text-cyan-400" />
                            EAR (Mata)
                        </span>
                        <div className="flex items-baseline gap-1">
                            <span className="font-mono text-xs font-bold text-cyan-400">
                                {ear.toFixed(3)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                                ({isEarOpen ? 'Terbuka' : 'Kedip'})
                            </span>
                        </div>
                    </div>

                    {/* Progress Bar with Threshold Marker */}
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-75"
                            style={{ width: `${earPercent}%` }}
                        />
                        {/* Threshold Line */}
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                            style={{ left: `${earThreshPercent}%` }}
                            title={`Ambang EAR: ${EAR_THRESH}`}
                        />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500">
                        <span>0.00</span>
                        <span className="text-amber-400/80">Ambang: {EAR_THRESH}</span>
                        <span>0.35</span>
                    </div>
                </div>

                {/* MAR Bar */}
                <div
                    className={`flex flex-col gap-1.5 rounded-xl border p-2.5 ${
                        isDark
                            ? 'border-slate-800 bg-slate-950/60'
                            : 'border-slate-200/80 bg-slate-50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-slate-400">
                            <Smile className="h-3.5 w-3.5 text-amber-400" />
                            MAR (Mulut)
                        </span>
                        <div className="flex items-baseline gap-1">
                            <span className="font-mono text-xs font-bold text-amber-400">
                                {mar.toFixed(3)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                                ({isMarOpen ? 'Terbuka' : 'Tertutup'})
                            </span>
                        </div>
                    </div>

                    {/* Progress Bar with Threshold Marker */}
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-75"
                            style={{ width: `${marPercent}%` }}
                        />
                        {/* Threshold Line */}
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-10"
                            style={{ left: `${marThreshPercent}%` }}
                            title={`Ambang MAR: ${MAR_THRESH}`}
                        />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500">
                        <span>0.00</span>
                        <span className="text-cyan-400/80">Ambang: {MAR_THRESH}</span>
                        <span>0.40</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
