import { router, useForm, usePage } from '@inertiajs/react';
import { motion } from 'motion/react';
import { useState } from 'react';

export default function TeacherLeaveStatusForm({
    today_attendance,
    recent_leaves,
    className = '',
}: {
    today_attendance?: any;
    recent_leaves?: any[];
    className?: string;
}) {
    const { auth, flash } = usePage().props as any;
    const user = auth?.user;

    const todayStr = new Date().toISOString().split('T')[0];
    const {
        data,
        setData,
        post,
        processing,
        errors,
        reset,
    } = useForm({
        attendance_status: today_attendance?.status === 'sakit' ? 'sakit' : 'izin',
        attendance_date: today_attendance?.date_raw || todayStr,
        attendance_category: today_attendance?.category || 'Izin Dinas Luar / MGMP',
        attendance_reason: today_attendance?.decision_reason || '',
        attendance_doc: today_attendance?.document_reference || '',
    });

    const [msg, setMsg] = useState<string | null>(null);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setMsg(null);
        post(route('profile.status-izin-sakit'), {
            preserveScroll: true,
            onSuccess: () => {
                setMsg('Permohonan status izin / sakit berhasil dikirimkan.');
                setTimeout(() => setMsg(null), 5000);
            },
        });
    };

    const handleCancel = () => {
        if (confirm(`Yakin ingin membatalkan permohonan dispensasi tanggal ${data.attendance_date}?`)) {
            router.post(
                route('profile.status-izin-sakit'),
                {
                    attendance_status: 'reset',
                    attendance_date: data.attendance_date,
                },
                {
                    preserveScroll: true,
                    onSuccess: () => {
                        setMsg('Permohonan dispensasi berhasil dibatalkan.');
                        setTimeout(() => setMsg(null), 5000);
                    },
                }
            );
        }
    };

    return (
        <section className={className}>
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/30 dark:border-white/10 pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-deep-navy dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-royal-blue dark:text-sky-400 text-[22px]">
                                medical_services
                            </span>
                            <span>Pengajuan Status Izin / Sakit Guru</span>
                        </h2>
                        <span className="rounded-full bg-royal-blue/10 dark:bg-sky-500/20 px-2.5 py-0.5 text-[10px] font-bold text-royal-blue dark:text-sky-300">
                            SMK Al-Madani
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant dark:text-slate-400">
                        Ajukan pemberitahuan izin dinas luar atau surat sakit agar tidak tercatat sebagai alpha.
                    </p>
                </div>

                {today_attendance && (
                    <div className="flex items-center gap-1.5 self-start sm:self-auto">
                        <span className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold ${
                            today_attendance.status === 'sakit'
                                ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-purple-400/30'
                                : today_attendance.status === 'izin'
                                ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-400/30'
                                : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-400/30'
                        }`}>
                            <span className="material-symbols-outlined text-[15px]">
                                {today_attendance.status === 'sakit' ? 'medical_services' : today_attendance.status === 'izin' ? 'event_note' : 'check_circle'}
                            </span>
                            <span>Hari Ini: {today_attendance.status.toUpperCase()}</span>
                        </span>
                    </div>
                )}
            </header>

            {(flash?.success || msg) && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200"
                >
                    <span className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400">check_circle</span>
                    <span>{flash?.success || msg}</span>
                </motion.div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-4">
                {/* Status Selector */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-2">
                        Pilih Status Dispensasi:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setData({ ...data, attendance_status: 'izin', attendance_category: 'Izin Dinas Luar / MGMP' })}
                            className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-center transition-all ${
                                data.attendance_status === 'izin'
                                    ? 'border-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30 font-bold'
                                    : 'border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-on-surface-variant dark:text-slate-400 hover:bg-surface-container'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[20px] text-amber-600 dark:text-amber-400">
                                event_note
                            </span>
                            <span className="text-xs font-bold">IZIN (Dinas / Keperluan)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setData({ ...data, attendance_status: 'sakit', attendance_category: 'Sakit (Surat Dokter)' })}
                            className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-center transition-all ${
                                data.attendance_status === 'sakit'
                                    ? 'border-purple-500 bg-purple-500/15 text-purple-900 dark:text-purple-200 ring-2 ring-purple-500/30 font-bold'
                                    : 'border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-on-surface-variant dark:text-slate-400 hover:bg-surface-container'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[20px] text-purple-600 dark:text-purple-400">
                                medical_services
                            </span>
                            <span className="text-xs font-bold">SAKIT (Surat Dokter)</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1">
                            Tanggal
                        </label>
                        <input
                            type="date"
                            value={data.attendance_date}
                            onChange={(e) => setData('attendance_date', e.target.value)}
                            className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-3.5 py-2 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1">
                            Kategori
                        </label>
                        <select
                            value={data.attendance_category}
                            onChange={(e) => setData('attendance_category', e.target.value)}
                            className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-3.5 py-2 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue cursor-pointer"
                        >
                            {data.attendance_status === 'sakit' ? (
                                <>
                                    <option value="Sakit (Surat Dokter)">Sakit (Surat Dokter)</option>
                                    <option value="Sakit (Rawat Jalan / RS)">Sakit (Rawat Jalan / RS)</option>
                                    <option value="Sakit (Istirahat Mandiri)">Sakit (Istirahat Mandiri)</option>
                                </>
                            ) : (
                                <>
                                    <option value="Izin Dinas Luar / MGMP">Izin Dinas Luar / MGMP</option>
                                    <option value="Izin Keperluan Keluarga">Izin Keperluan Keluarga</option>
                                    <option value="Tugas Sekolah / LKS">Tugas Sekolah / LKS</option>
                                    <option value="Cuti Resmi">Cuti Resmi</option>
                                    <option value="Izin Lainnya">Izin Lainnya</option>
                                </>
                            )}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1">
                        Alasan / Penjelasan
                    </label>
                    <textarea
                        rows={2}
                        value={data.attendance_reason}
                        onChange={(e) => setData('attendance_reason', e.target.value)}
                        placeholder="Jelaskan alasan izin dinas atau sakit..."
                        className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-3.5 py-2 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1">
                        Nomor Surat / Referensi Dokumen (Opsional)
                    </label>
                    <input
                        type="text"
                        value={data.attendance_doc}
                        onChange={(e) => setData('attendance_doc', e.target.value)}
                        placeholder="No. Surat Keterangan Dokter atau Surat Tugas"
                        className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-3.5 py-2 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                    />
                </div>

                <div className="pt-2 flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={processing}
                        className={`rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md transition-all flex items-center gap-2 ${
                            data.attendance_status === 'sakit'
                                ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                                : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]">send</span>
                        <span>{processing ? 'Mengirim...' : 'Kirim Pengajuan'}</span>
                    </button>

                    {today_attendance && (today_attendance.status === 'izin' || today_attendance.status === 'sakit') && (
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={processing}
                            className="rounded-xl border border-rose-300/60 dark:border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
                        >
                            Batalkan Pengajuan Hari Ini
                        </button>
                    )}
                </div>
            </form>

            {/* Riwayat Pengajuan Guru */}
            {recent_leaves && recent_leaves.length > 0 && (
                <div className="mt-6 border-t border-outline-variant/30 dark:border-white/10 pt-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-white mb-2.5 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-400">history</span>
                        <span>Riwayat Pengajuan Terkini</span>
                    </h4>
                    <div className="space-y-1.5">
                        {recent_leaves.map((item: any) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant/30 dark:border-white/5 bg-surface-container-lowest dark:bg-[#13203F] p-2.5 text-xs"
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                                        item.status === 'sakit'
                                            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                                            : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                                    }`}>
                                        {item.status}
                                    </span>
                                    <span className="font-semibold text-deep-navy dark:text-white">{item.category}</span>
                                    <span className="text-on-surface-variant dark:text-slate-400 hidden sm:inline">- {item.decision_reason}</span>
                                </div>
                                <span className="text-[11px] font-mono text-on-surface-variant dark:text-slate-400">{item.date}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
