import { CheckCircle2, Clock, Cpu, ShieldCheck, Sparkles } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface SessionSummaryCardProps {
    isDark?: boolean;
}

export function SessionSummaryCard({ isDark = true }: SessionSummaryCardProps) {
    const [currentTime, setCurrentTime] = useState<string>('');

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(
                now.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                })
            );
        };
        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div
            className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-colors ${
                isDark
                    ? 'border-slate-800/80 bg-slate-900/90'
                    : 'border-slate-200 bg-white'
            }`}
            role="region"
            aria-label="Ringkasan Sistem Presensi"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                        <Cpu className="h-4 w-4" />
                    </div>
                    <div>
                        <h4
                            className={`font-mono text-[11px] font-bold uppercase tracking-wider ${
                                isDark ? 'text-slate-300' : 'text-slate-700'
                            }`}
                        >
                            Status Sistem &amp; Model
                        </h4>
                        <p className="text-[10px] text-slate-500">
                            Konfigurasi Standar Skripsi
                        </p>
                    </div>
                </div>

                {/* Live Clock Badge */}
                <div
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono font-bold ${
                        isDark
                            ? 'border-slate-700 bg-slate-950 text-cyan-400'
                            : 'border-slate-300 bg-slate-100 text-cyan-700'
                    }`}
                >
                    <Clock className="h-3 w-3 animate-pulse" />
                    <span>{currentTime || '00:00:00'} WIB</span>
                </div>
            </div>

            {/* System Status Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div
                    className={`flex flex-col gap-0.5 rounded-xl border p-2.5 ${
                        isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'
                    }`}
                >
                    <span className="text-[10px] text-slate-400">Engine Ekstraksi</span>
                    <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        FaceNet (512-D)
                    </span>
                </div>

                <div
                    className={`flex flex-col gap-0.5 rounded-xl border p-2.5 ${
                        isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'
                    }`}
                >
                    <span className="text-[10px] text-slate-400">Proteksi PAD</span>
                    <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                        <ShieldCheck className="h-3 w-3 text-purple-400" />
                        EMAR Liveness
                    </span>
                </div>

                <div
                    className={`flex flex-col gap-0.5 rounded-xl border p-2.5 ${
                        isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'
                    }`}
                >
                    <span className="text-[10px] text-slate-400">Ambang EAR/MAR</span>
                    <span className="font-mono font-medium text-slate-300 text-[11px]">
                        0.20 / 0.10
                    </span>
                </div>

                <div
                    className={`flex flex-col gap-0.5 rounded-xl border p-2.5 ${
                        isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'
                    }`}
                >
                    <span className="text-[10px] text-slate-400">Standar Evaluasi</span>
                    <span className="font-semibold text-slate-300 text-[11px]">
                        ISO/IEC 30107-3
                    </span>
                </div>
            </div>
        </div>
    );
}
