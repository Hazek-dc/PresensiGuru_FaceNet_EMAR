import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function Edit({
    teacher,
    today_attendance,
    today_dispensation,
    todayAttendance,
    todayDispensation,
    recent_leaves,
}: any) {
    const activeDispensation = todayDispensation || today_dispensation || (today_attendance && ['izin', 'sakit'].includes(today_attendance.status) ? today_attendance : null);
    const activeAttendance = todayAttendance || (today_attendance && today_attendance.is_present ? today_attendance : null);

    const {
        data,
        setData,
        put,
        post,
        delete: destroy,
        processing,
        errors,
    } = useForm({
        name: teacher.name,
        email: teacher.email,
        attendance_status: activeDispensation?.status === 'sakit' ? 'sakit' : activeDispensation?.status === 'izin' ? 'izin' : '',
        attendance_category: activeDispensation?.category || activeDispensation?.reason || '',
        attendance_reason: activeDispensation?.decision_reason || activeDispensation?.reason || '',
        attendance_doc: activeDispensation?.document_reference || '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put(route('admin.teachers.update', teacher.id));
    };

    const handleDisable = () => {
        if (
            confirm(
                'Yakin ingin menonaktifkan guru ini? Template wajah akan dicabut.',
            )
        ) {
            destroy(route('admin.teachers.destroy', teacher.id));
        }
    };

    const handleRestore = () => {
        post(route('admin.teachers.restore', teacher.id));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold leading-tight text-deep-navy dark:text-white">
                            Edit Profil Guru: {teacher.name}
                        </h2>
                        <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-0.5">
                            Perbarui identitas akun dan kelola status biometrik
                        </p>
                    </div>
                    <Link
                        href={route('admin.teachers.index')}
                        className="rounded-xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/10 px-4 py-2 text-xs font-bold text-deep-navy dark:text-white hover:bg-surface-container dark:hover:bg-white/20 transition-all flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        <span>Kembali</span>
                    </Link>
                </div>
            }
        >
            <Head title="Edit Guru" />

            <div className="py-8">
                <div className="mx-auto flex max-w-7xl flex-col lg:flex-row gap-6 px-4 sm:px-6 lg:px-8">
                    {/* Data Guru Form */}
                    <div className="flex-1 overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm">
                        <div className="p-6 sm:p-8 text-gray-900 dark:text-slate-100">
                            <h3 className="mb-4 text-base font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-royal-blue dark:text-sky-400">badge</span>
                                <span>Informasi Profil</span>
                            </h3>
                            <form onSubmit={submit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        Nama Lengkap
                                    </label>
                                    <input
                                        type="text"
                                        className="mt-1.5 block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue disabled:opacity-50"
                                        value={data.name}
                                        onChange={(e) =>
                                            setData('name', e.target.value)
                                        }
                                        disabled={teacher.deleted_at !== null}
                                    />
                                    {errors.name && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.name}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        className="mt-1.5 block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue disabled:opacity-50"
                                        value={data.email}
                                        onChange={(e) =>
                                            setData('email', e.target.value)
                                        }
                                        disabled={teacher.deleted_at !== null}
                                    />
                                    {errors.email && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.email}
                                        </p>
                                    )}
                                </div>

                                {/* Status Izin & Sakit Guru (Hanya Izin & Sakit) */}
                                <div className="mt-6 pt-6 border-t border-outline-variant/30 dark:border-white/10">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                                        <div>
                                            <h4 className="text-sm font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-royal-blue dark:text-sky-400 text-[20px]">
                                                    event_available
                                                </span>
                                                <span>Status Dispensasi Guru (Hari Ini)</span>
                                            </h4>
                                            <p className="text-[11px] text-on-surface-variant dark:text-slate-400 mt-0.5">
                                                Pilih status berhalangan hadir guru:{' '}
                                                <strong className="text-royal-blue dark:text-sky-400">
                                                    Hanya Izin atau Sakit
                                                </strong>
                                            </p>
                                        </div>
                                        {data.attendance_status && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setData({
                                                        ...data,
                                                        attendance_status: '',
                                                        attendance_category: '',
                                                        attendance_reason: '',
                                                        attendance_doc: '',
                                                    })
                                                }
                                                className="self-start sm:self-auto text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">cancel</span>
                                                <span>Reset Status Dispensasi</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* 2 Exclusive Buttons: Hanya Izin dan Sakit */}
                                    <div className="grid grid-cols-2 gap-3 mb-3.5">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setData({
                                                    ...data,
                                                    attendance_status: 'izin',
                                                    attendance_category: data.attendance_category || 'Izin Dinas Luar / MGMP',
                                                })
                                            }
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
                                            onClick={() =>
                                                setData({
                                                    ...data,
                                                    attendance_status: 'sakit',
                                                    attendance_category: data.attendance_category || 'Sakit (Surat Dokter)',
                                                })
                                            }
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

                                    {/* Detail Inputs when Izin or Sakit is selected */}
                                    {data.attendance_status && (
                                        <div className="space-y-3 p-3.5 rounded-2xl bg-surface-container-low/60 dark:bg-white/5 border border-outline-variant/30 dark:border-white/10">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1">
                                                        Kategori {data.attendance_status.toUpperCase()}
                                                    </label>
                                                    <select
                                                        value={data.attendance_category}
                                                        onChange={(e) => setData('attendance_category', e.target.value)}
                                                        className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-3 py-2 text-xs text-deep-navy dark:text-white cursor-pointer"
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

                                                <div>
                                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1">
                                                        No. Surat / Keterangan (Opsional)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={data.attendance_doc}
                                                        onChange={(e) => setData('attendance_doc', e.target.value)}
                                                        placeholder="Contoh: SKD-2026/089"
                                                        className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-3 py-2 text-xs text-deep-navy dark:text-white"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[11px] font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1">
                                                    Alasan / Penjelasan
                                                </label>
                                                <input
                                                    type="text"
                                                    value={data.attendance_reason}
                                                    onChange={(e) => setData('attendance_reason', e.target.value)}
                                                    placeholder="Keterangan dispensasi guru..."
                                                    className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-3 py-2 text-xs text-deep-navy dark:text-white"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!teacher.deleted_at && (
                                    <div className="pt-2">
                                        <button
                                            type="submit"
                                            disabled={processing}
                                            className="rounded-xl bg-royal-blue dark:bg-sky-600 px-6 py-2.5 text-xs font-bold text-white hover:brightness-110 shadow-md shadow-royal-blue/20 transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">save</span>
                                            <span>Simpan Perubahan</span>
                                        </button>
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>

                    {/* Status & Tindakan Berbahaya */}
                    <div className="w-full lg:w-96 shrink-0 space-y-6">
                        <div className="overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm">
                            <div className="p-6 text-gray-900 dark:text-slate-100">
                                <h3 className="mb-4 text-base font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-royal-blue dark:text-sky-400">verified_user</span>
                                    <span>Status Akun</span>
                                </h3>
                                <div className="space-y-4 text-xs">
                                    <div className="rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-white/5 p-4">
                                        <p className="text-on-surface-variant dark:text-slate-400">
                                            Status Template Biometrik
                                        </p>
                                        {teacher.embedding_id ? (
                                            <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                <span>Terdaftar (ID Tersimpan)</span>
                                            </p>
                                        ) : (
                                            <p className="mt-1 font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                                <span>Belum Terdaftar</span>
                                            </p>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-white/5 p-4">
                                        <p className="text-on-surface-variant dark:text-slate-400">
                                            Status Akses Akun
                                        </p>
                                        {teacher.deleted_at ? (
                                            <p className="mt-1 font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">block</span>
                                                <span>
                                                    Dinonaktifkan ({new Date(teacher.deleted_at).toLocaleDateString()})
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                <span>Aktif</span>
                                            </p>
                                        )}
                                    </div>

                                    {/* Widget Presensi / Dispensasi Hari Ini */}
                                    <div className="rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-white/5 p-4">
                                        <div className="text-xs text-on-surface-variant dark:text-slate-400 font-medium mb-1.5">
                                            Presensi / Dispensasi Hari Ini
                                        </div>

                                        {activeAttendance ? (
                                            /* JIKA SUDAH PRESENSI SUKSES (STATUS AKTIF / HADIR) */
                                            <div>
                                                <div className="flex items-center text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                                    <span className="relative flex h-2.5 w-2.5 mr-2 shrink-0">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                                    </span>
                                                    <span>
                                                        Aktif (Hadir {activeAttendance.time || '07:00'} WIB)
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 ml-4.5 font-medium">
                                                    ✓ Terverifikasi FaceNet + EMAR ({activeAttendance.subject_id || teacher.subject_id || teacher.embedding_id || 'S01'})
                                                </div>
                                            </div>
                                        ) : activeDispensation ? (
                                            /* JIKA ADA DISPENSASI (IZIN / SAKIT) */
                                            (activeDispensation.type === 'IZIN' || activeDispensation.status === 'izin') ? (
                                                <div className="flex items-center text-sm font-semibold text-amber-700 dark:text-amber-400">
                                                    <span className="h-2 w-2 mr-2 rounded-full bg-amber-500 shrink-0"></span>
                                                    <span>Izin ({activeDispensation.reason || activeDispensation.category || 'Dinas/Keperluan'})</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-sm font-semibold text-purple-700 dark:text-purple-400">
                                                    <span className="h-2 w-2 mr-2 rounded-full bg-purple-500 shrink-0"></span>
                                                    <span>Sakit ({activeDispensation.reason || 'Surat Dokter'})</span>
                                                </div>
                                            )
                                        ) : (
                                            /* JIKA BELUM PRESENSI */
                                            <div className="flex items-center text-sm text-gray-500 dark:text-slate-400">
                                                <span className="h-2 w-2 mr-2 rounded-full bg-gray-300 dark:bg-slate-600 shrink-0"></span>
                                                <span>Belum ada presensi / izin hari ini</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Riwayat Dispensasi Terkini */}
                                    {recent_leaves && recent_leaves.length > 0 && (
                                        <div className="rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-white/5 p-4">
                                            <p className="text-on-surface-variant dark:text-slate-400 mb-2 font-bold uppercase tracking-wider text-[10px]">
                                                Riwayat Izin / Sakit Terkini
                                            </p>
                                            <div className="space-y-1.5">
                                                {recent_leaves.map((leave: any) => (
                                                    <div key={leave.id} className="flex items-center justify-between text-[11px] py-1 border-b border-outline-variant/20 dark:border-white/5 last:border-none">
                                                        <span className={`font-bold uppercase text-[10px] rounded px-1.5 py-0.2 ${
                                                            leave.status === 'sakit'
                                                                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                                                                : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                                                        }`}>
                                                            {leave.status}
                                                        </span>
                                                        <span className="text-on-surface-variant dark:text-slate-400 font-mono text-[10px]">
                                                            {leave.date}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-3xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/40 shadow-sm">
                            <div className="p-6">
                                <h3 className="mb-1 text-base font-bold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-rose-600 dark:text-rose-400">gavel</span>
                                    <span>Tindakan Khusus</span>
                                </h3>
                                <p className="mb-4 text-xs text-rose-700 dark:text-rose-300">
                                    Tindakan ini akan mempengaruhi hak akses login dan autentikasi biometrik guru.
                                </p>

                                {teacher.deleted_at ? (
                                    <button
                                        type="button"
                                        onClick={handleRestore}
                                        disabled={processing}
                                        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">restore</span>
                                        <span>Aktifkan Kembali Guru</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleDisable}
                                        disabled={processing}
                                        className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">block</span>
                                        <span>Nonaktifkan Guru (Cabut Template)</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
