import re

filepath = 'resources/js/Pages/Attendance/History.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''<div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/30 p-1 text-xs scrollbar-none w-full sm:w-auto">
                                                {[
                                                    { id: '', label: 'Semua', icon: 'apps' },
                                                    { id: 'hadir', label: 'Hadir', icon: 'check_circle' },
                                                    { id: 'terlambat', label: 'Terlambat', icon: 'schedule' },
                                                    { id: 'pulang', label: 'Pulang', icon: 'logout' },
                                                    { id: 'izin', label: 'Izin', icon: 'clinical_notes' },
                                                    { id: 'sakit', label: 'Sakit', icon: 'sick' },
                                                    { id: 'failed', label: 'Ditolak', icon: 'cancel' },
                                                ].map((tab) => (
                                                    <button
                                                        key={tab.id}
                                                        type="button"
                                                        onClick={() => setStatus(tab.id)}
                                                        className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                                                            status === tab.id
                                                                ? 'text-white shadow-xs'
                                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5'
                                                        }`}
                                                    >
                                                        {status === tab.id && (
                                                            <motion.div
                                                                layoutId="historyStatusActiveFilterPill"
                                                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                                                className="absolute inset-0 rounded-lg bg-deep-navy dark:bg-sky-600 -z-10"
                                                            />
                                                        )}
                                                        <span className={`material-symbols-outlined text-[15px] ${
                                                            status === tab.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                                                        }`}>
                                                            {tab.icon}
                                                        </span>
                                                        <span>{tab.label}</span>
                                                    </button>
                                                ))}
                                            </div>'''

content = re.sub(
    r'<div className="flex items-center gap-1\.5 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/30 p-1 text-xs scrollbar-none w-full sm:w-auto">.*?<\/div>',
    replacement,
    content,
    flags=re.DOTALL
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
