import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm } from '@inertiajs/react';

export default function Settings({ settings }: any) {
    const { data, setData, post, processing, errors } = useForm({
        facenet_threshold: settings.facenet_threshold,
        emar_threshold: settings.emar_threshold,
        reason: '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('admin.settings.update'), {
            preserveScroll: true,
            onSuccess: () => setData('reason', ''),
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-bold leading-tight text-deep-navy dark:text-white">
                        Pengaturan Model & Threshold AI
                    </h2>
                    <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-0.5">
                        Kalibrasi parameter sensitivitas pengenalan wajah FaceNet dan temporal liveness EMAR
                    </p>
                </div>
            }
        >
            <Head title="Pengaturan Penelitian" />

            <div className="py-8">
                <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm">
                        <div className="border-l-4 border-royal-blue dark:border-sky-500 p-6 sm:p-8 text-gray-900 dark:text-slate-100">
                            <h3 className="mb-2 text-lg font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-royal-blue dark:text-sky-400">tune</span>
                                <span>Konfigurasi Threshold Biometrik</span>
                            </h3>
                            <p className="mb-6 text-xs leading-relaxed text-on-surface-variant dark:text-slate-400">
                                Pengaturan ini akan mengubah parameter sensitivitas pengenalan wajah dan deteksi liveness di seluruh sistem. Hanya peran <strong>Peneliti</strong> dan <strong>Admin</strong> yang dapat mengakses dan memodifikasi konfigurasi ini. Setiap perubahan wajib disertai alasan.
                            </p>

                            <form onSubmit={submit} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        FaceNet 1:1 Distance Threshold
                                    </label>
                                    <p className="mb-2 text-[11px] text-on-surface-variant dark:text-slate-400">
                                        Jarak Euclidean maksimal (0.0 - 2.0). Semakin kecil nilainya, semakin ketat kecocokan wajah.
                                    </p>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="2"
                                        className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-sm text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue font-mono"
                                        value={data.facenet_threshold}
                                        onChange={(e) =>
                                            setData(
                                                'facenet_threshold',
                                                e.target.value,
                                            )
                                        }
                                        required
                                    />
                                    {errors.facenet_threshold && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.facenet_threshold}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        EMAR Temporal Liveness Threshold
                                    </label>
                                    <p className="mb-2 text-[11px] text-on-surface-variant dark:text-slate-400">
                                        Standar deviasi variasi temporal minimal untuk dianggap manusia asli (0.0 - 1.0).
                                    </p>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="1"
                                        className="block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-sm text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue font-mono"
                                        value={data.emar_threshold}
                                        onChange={(e) =>
                                            setData(
                                                'emar_threshold',
                                                e.target.value,
                                            )
                                        }
                                        required
                                    />
                                    {errors.emar_threshold && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.emar_threshold}
                                        </p>
                                    )}
                                </div>

                                <div className="border-t border-outline-variant/30 dark:border-white/10 pt-4">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        Alasan Perubahan (Audit Log){' '}
                                        <span className="text-rose-500">*</span>
                                    </label>
                                    <textarea
                                        className="mt-2 block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                                        rows={3}
                                        placeholder="Jelaskan dasar penelitian mengapa threshold ini diubah..."
                                        value={data.reason}
                                        onChange={(e) =>
                                            setData('reason', e.target.value)
                                        }
                                        required
                                    ></textarea>
                                    {errors.reason && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.reason}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center justify-end pt-4">
                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className="rounded-xl bg-royal-blue dark:bg-sky-600 px-6 py-2.5 text-xs font-bold text-white hover:brightness-110 transition-all shadow-md shadow-royal-blue/20 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">save</span>
                                        <span>Simpan Konfigurasi</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
