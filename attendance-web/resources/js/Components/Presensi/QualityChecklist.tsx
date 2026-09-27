import {
    AlertCircle,
    CheckCircle2,
    Circle,
    Eye,
    Lightbulb,
    Move,
    UserCheck,
} from 'lucide-react';
import { motion } from 'motion/react';

interface QualityChecklistProps {
    hasFace: boolean;
    isAligned: boolean;
    isLightingGood: boolean;
    isLivenessPassed: boolean;
    isDark?: boolean;
}

type ItemStatus = 'passed' | 'needs-action' | 'waiting';

export function QualityChecklist({
    hasFace,
    isAligned,
    isLightingGood,
    isLivenessPassed,
    isDark = true,
}: QualityChecklistProps) {
    const getItemStatus = (
        isPassed: boolean,
        prereqPassed: boolean,
    ): ItemStatus => {
        if (isPassed) return 'passed';
        if (prereqPassed) return 'needs-action';
        return 'waiting';
    };

    const items: Array<{
        label: string;
        status: ItemStatus;
        icon: React.ReactNode;
    }> = [
        {
            label: 'Wajah Terdeteksi',
            status: getItemStatus(hasFace, true),
            icon: <UserCheck className="h-3.5 w-3.5" />,
        },
        {
            label: 'Posisi Sesuai',
            status: getItemStatus(isAligned, hasFace),
            icon: <Move className="h-3.5 w-3.5" />,
        },
        {
            label: 'Pencahayaan Cukup',
            status: getItemStatus(isLightingGood, hasFace),
            icon: <Lightbulb className="h-3.5 w-3.5" />,
        },
        {
            label: 'Uji Liveness',
            status: getItemStatus(
                isLivenessPassed,
                isAligned && isLightingGood,
            ),
            icon: <Eye className="h-3.5 w-3.5" />,
        },
    ];

    return (
        <div
            className={`rounded-2xl border p-3 sm:p-4 transition-colors ${
                isDark
                    ? 'border-slate-800/80 bg-slate-900/90'
                    : 'border-slate-200 bg-white shadow-sm'
            }`}
        >
            <h4
                className={`mb-2 sm:mb-3 font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
            >
                Checklist Kesiapan Scanner
            </h4>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                {items.map((item, index) => {
                    const isPassed = item.status === 'passed';
                    const isNeedsAction = item.status === 'needs-action';

                    return (
                        <motion.div
                            key={index}
                            layout
                            initial={{ opacity: 0.8, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                            className={`flex items-center gap-1.5 sm:gap-2 rounded-xl border px-2 py-1.5 sm:px-2.5 sm:py-2 transition-all ${
                                isPassed
                                    ? isDark
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                        : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                    : isNeedsAction
                                      ? isDark
                                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                          : 'border-amber-300 bg-amber-50 text-amber-800'
                                      : isDark
                                        ? 'border-slate-800 bg-slate-950/50 text-slate-500'
                                        : 'border-slate-200 bg-slate-50 text-slate-400'
                            }`}
                        >
                            <div className="flex-shrink-0">
                                {isPassed ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400" />
                                ) : isNeedsAction ? (
                                    <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400" />
                                ) : (
                                    <Circle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                                )}
                            </div>
                            <span className="truncate text-[11px] sm:text-xs font-semibold">
                                {item.label}
                            </span>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
