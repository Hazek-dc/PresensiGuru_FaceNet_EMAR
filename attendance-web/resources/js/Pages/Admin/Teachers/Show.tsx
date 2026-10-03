import React from 'react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import { motion } from 'motion/react';
import { positionLabel } from '@/Utils/staffProfile';
import { TeacherAvatar } from '@/Components/Admin/TeacherAvatar';

interface TeacherShowProps {
    teacher: {
        id: number;
        name: string;
        email: string;
        embedding_id: string | null;
        role: string;
        position?: string | null;
        subjects?: string[] | null;
        avatar_url?: string | null;
        deleted_at: string | null;
        created_at: string;
    };
    history: Array<{
        id: number;
        status: string;
        decision_reason: string;
        time: string;
        date: string;
        euclidean_distance: number | null;
        pad_pred: string;
        id_pred: string;
        final_decision: string;
        ear_blinks: number;
        mar_mouths: number;
    }>;
    biometricStats: {
        total_presensi: number;
        total_hadir: number;
        total_terlambat: number;
        total_gagal: number;
        avg_euclidean: number | null;
        avg_ear_blinks: number | null;
        avg_mar_mouths: number | null;
    };
    subjectEvaluation: {
        participant_id: string;
        total: number;
        m1_errors: number;
        m2_errors: number;
        m3_errors: number;
        m1_rate: number;
        m2_rate: number;
        m3_rate: number;
    } | null;
}

export default function Show({ teacher, history, biometricStats, subjectEvaluation }: TeacherShowProps) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center gap-4">
                    <Link
                        href={route('admin.teachers.index')}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                    >
                        <span className="material-symbols-outlined text-xl leading-none">arrow_back</span>
                    </Link>
                    <h2 className="text-xl font-bold text-deep-navy dark:text-white leading-tight">
                        Detail Guru: {teacher.name}
                    </h2>
                </div>
            }
        >
            <Head title={`Detail Guru - ${teacher.name}`} />

            <div className="py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
                    
                    {/* Profile Card */}
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm p-6"
                    >
                        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                            <div className="flex items-center gap-4">
                                <TeacherAvatar
                                    name={teacher.name}
                                    url={teacher.avatar_url}
                                    className="h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-2xl"
                                />
                                <div>
                                    <h3 className="text-xl font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                        {teacher.name}
                                        {teacher.embedding_id && (
                                            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                                                ID: {teacher.embedding_id}
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{teacher.email}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {positionLabel(teacher.position) ? (
                                            <span className="font-semibold text-deep-navy dark:text-white">{positionLabel(teacher.position)}</span>
                                        ) : (
                                            'Jabatan belum diisi'
                                        )}
                                        {teacher.position === 'guru' && (
                                            <span>
                                                {' · '}
                                                {teacher.subjects?.length ? teacher.subjects.join(', ') : 'bidang studi belum diisi'}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 min-w-[200px]">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Status Akun</span>
                                    {teacher.deleted_at ? (
                                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400">Nonaktif</span>
                                    ) : (
                                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Aktif</span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Biometrik</span>
                                    {teacher.embedding_id ? (
                                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Template Aktif</span>
                                    ) : (
                                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">Perlu Enrollment</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Operational Stats Bento Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Total Presensi', value: biometricStats.total_presensi, icon: 'calendar_month', color: 'indigo' },
                            { label: 'Hadir', value: biometricStats.total_hadir, icon: 'check_circle', color: 'emerald' },
                            { label: 'Terlambat', value: biometricStats.total_terlambat, icon: 'schedule', color: 'amber' },
                            { label: 'Gagal', value: biometricStats.total_gagal, icon: 'cancel', color: 'rose' },
                        ].map((stat, i) => (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm p-4 flex items-center gap-4"
                            >
                                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center bg-${stat.color}-50 dark:bg-${stat.color}-500/10 text-${stat.color}-600 dark:text-${stat.color}-400 shrink-0`}>
                                    <span className="material-symbols-outlined text-2xl">{stat.icon}</span>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                                    <p className="text-xl font-bold text-deep-navy dark:text-white tabular-nums font-mono">{stat.value}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Biometric Telemetry Card */}
                        {(biometricStats.avg_euclidean !== null || biometricStats.avg_ear_blinks !== null) && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm p-6 flex flex-col justify-between"
                            >
                                <div>
                                    <h3 className="text-deep-navy dark:text-white font-bold mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-lg text-indigo-500">speed</span>
                                        Telemetri Biometrik
                                    </h3>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-500 dark:text-slate-400">Rata-rata Euclidean Distance</span>
                                                <span className="font-mono font-bold text-deep-navy dark:text-white">{biometricStats.avg_euclidean?.toFixed(3) ?? '-'}</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full ${(biometricStats.avg_euclidean ?? 0) <= 0.40 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                                                    style={{ width: `${Math.min(((biometricStats.avg_euclidean ?? 0) / 1.0) * 100, 100)}%` }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Ambang batas standar: 0.40</p>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-500 dark:text-slate-400">Rata-rata Kedipan (EAR)</span>
                                                <span className="font-mono font-bold text-deep-navy dark:text-white">{biometricStats.avg_ear_blinks?.toFixed(1) ?? '-'}</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500" style={{ width: `${Math.min(((biometricStats.avg_ear_blinks ?? 0) / 10) * 100, 100)}%` }} />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-500 dark:text-slate-400">Rata-rata Mulut (MAR)</span>
                                                <span className="font-mono font-bold text-deep-navy dark:text-white">{biometricStats.avg_mar_mouths?.toFixed(1) ?? '-'}</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-sky-500" style={{ width: `${Math.min(((biometricStats.avg_mar_mouths ?? 0) / 10) * 100, 100)}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Subject Evaluation Panel */}
                        {subjectEvaluation && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm p-6"
                            >
                                <h3 className="text-deep-navy dark:text-white font-bold mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg text-emerald-500">biotech</span>
                                    Evaluasi Biometrik Riset — {subjectEvaluation.participant_id}
                                </h3>
                                
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1 uppercase">S1</p>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-slate-500 dark:text-slate-400">Galat: {subjectEvaluation.m1_errors}</span>
                                            <span className="text-sm font-bold text-deep-navy dark:text-white font-mono">{subjectEvaluation.m1_rate.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 mb-1 uppercase">S2</p>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-slate-500 dark:text-slate-400">Galat: {subjectEvaluation.m2_errors}</span>
                                            <span className="text-sm font-bold text-deep-navy dark:text-white font-mono">{subjectEvaluation.m2_rate.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-1 uppercase">S3</p>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-slate-500 dark:text-slate-400">Galat: {subjectEvaluation.m3_errors}</span>
                                            <span className="text-sm font-bold text-deep-navy dark:text-white font-mono">{subjectEvaluation.m3_rate.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">Perbandingan Tingkat Galat</p>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold w-4 text-slate-400">S1</span>
                                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-amber-500" style={{ width: `${Math.min(subjectEvaluation.m1_rate, 100)}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold w-4 text-slate-400">S2</span>
                                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-sky-500" style={{ width: `${Math.min(subjectEvaluation.m2_rate, 100)}%` }} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold w-4 text-slate-400">S3</span>
                                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(subjectEvaluation.m3_rate, 100)}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-right">Total Sampel: {subjectEvaluation.total}</p>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Attendance History Table */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm overflow-hidden"
                    >
                        <div className="p-6 border-b border-surface-variant/50 dark:border-white/5">
                            <h3 className="text-deep-navy dark:text-white font-bold flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">history</span>
                                Riwayat Presensi Terakhir
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/30">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Tanggal</th>
                                        <th className="px-6 py-4 font-medium">Waktu</th>
                                        <th className="px-6 py-4 font-medium">Status</th>
                                        <th className="px-6 py-4 font-medium">Jarak Euclidean</th>
                                        <th className="px-6 py-4 font-medium">PAD</th>
                                        <th className="px-6 py-4 font-medium text-right">Keputusan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                    {history.length > 0 ? (
                                        history.slice(0, 20).map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                                <td className="px-6 py-3 text-deep-navy dark:text-white font-medium">{row.date}</td>
                                                <td className="px-6 py-3 text-slate-500 dark:text-slate-400 tabular-nums">{row.time}</td>
                                                <td className="px-6 py-3">
                                                    {row.status.toLowerCase() === 'hadir' && <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Hadir</span>}
                                                    {row.status.toLowerCase() === 'terlambat' && <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">Terlambat</span>}
                                                    {row.status.toLowerCase() === 'failed' && <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400">Gagal</span>}
                                                    {['izin', 'sakit'].includes(row.status.toLowerCase()) && <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 capitalize">{row.status}</span>}
                                                </td>
                                                <td className="px-6 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">
                                                    {row.euclidean_distance !== null ? row.euclidean_distance.toFixed(4) : '-'}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`text-[10px] font-bold ${row.pad_pred === 'REAL' ? 'text-emerald-500' : row.pad_pred === 'SPOOF' ? 'text-rose-500' : 'text-slate-500'}`}>
                                                        {row.pad_pred}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    {row.final_decision === 'ACCEPT' ? (
                                                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">ACCEPT</span>
                                                    ) : row.final_decision === 'REJECT' ? (
                                                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">REJECT</span>
                                                    ) : (
                                                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{row.final_decision}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                                                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">inbox</span>
                                                <p>Belum ada riwayat</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>

                </div>
            </div>
        </AuthenticatedLayout>
    );
}
