import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { StaffProfileFields } from '@/Components/Admin/StaffProfileFields';
import { StaffPosition } from '@/Utils/staffProfile';
import { Head, Link, useForm } from '@inertiajs/react';

export default function Create({
    subject_options = [],
    max_subjects = 3,
}: {
    subject_options?: string[];
    max_subjects?: number;
}) {
    const { data, setData, post, processing, errors, transform } = useForm({
        name: '',
        email: '',
        position: '' as StaffPosition | '',
        subjects: [] as string[],
        password: '',
        password_confirmation: '',
    });

    // Bidang studi hanya untuk guru; server juga membuangnya untuk jabatan lain.
    transform((form) => ({ ...form, subjects: form.position === 'guru' ? form.subjects : [] }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route('admin.teachers.store'));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold leading-tight text-deep-navy dark:text-white">
                            Tambah Data Guru
                        </h2>
                        <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-0.5">
                            Formulir pendaftaran akun dan profil tenaga pendidik baru
                        </p>
                    </div>
                    <Link
                        href={route('admin.teachers.index')}
                        className="rounded-xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/10 px-4 py-2 text-xs font-bold text-deep-navy dark:text-white hover:bg-surface-container dark:hover:bg-white/20 transition-all flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                        <span>Batal</span>
                    </Link>
                </div>
            }
        >
            <Head title="Tambah Guru" />

            <div className="py-8">
                <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-sm">
                        <div className="p-6 sm:p-8 text-gray-900 dark:text-slate-100">
                            <form onSubmit={submit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        Nama Lengkap
                                    </label>
                                    <input
                                        type="text"
                                        className="mt-1.5 block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                                        placeholder="Contoh: Budi Santoso, S.Kom."
                                        value={data.name}
                                        onChange={(e) =>
                                            setData('name', e.target.value)
                                        }
                                        required
                                    />
                                    {errors.name && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.name}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        Email Guru
                                    </label>
                                    <input
                                        type="email"
                                        className="mt-1.5 block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                                        placeholder="guru@smkalmadani.sch.id"
                                        value={data.email}
                                        onChange={(e) =>
                                            setData('email', e.target.value)
                                        }
                                        required
                                    />
                                    {errors.email && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.email}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        Password Akun
                                    </label>
                                    <input
                                        type="password"
                                        className="mt-1.5 block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                                        placeholder="Minimal 8 karakter"
                                        value={data.password}
                                        onChange={(e) =>
                                            setData('password', e.target.value)
                                        }
                                        required
                                        minLength={8}
                                    />
                                    {errors.password && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.password}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300">
                                        Konfirmasi Password
                                    </label>
                                    <input
                                        type="password"
                                        className="mt-1.5 block w-full rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-xs text-deep-navy dark:text-white shadow-xs focus:border-royal-blue focus:ring-1 focus:ring-royal-blue"
                                        placeholder="Ulangi password di atas"
                                        value={data.password_confirmation}
                                        onChange={(e) =>
                                            setData(
                                                'password_confirmation',
                                                e.target.value,
                                            )
                                        }
                                        required
                                    />
                                </div>

                                {/* Jabatan & bidang studi */}
                                <div className="mt-6 pt-6 border-t border-outline-variant/30 dark:border-white/10">
                                    <h4 className="mb-3.5 text-sm font-bold text-deep-navy dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-royal-blue dark:text-sky-400 text-[20px]">
                                            work
                                        </span>
                                        <span>Jabatan &amp; Bidang Studi</span>
                                    </h4>
                                    <StaffProfileFields
                                        position={data.position}
                                        subjects={data.subjects}
                                        subjectOptions={subject_options}
                                        maxSubjects={max_subjects}
                                        onPositionChange={(value) => setData('position', value)}
                                        onSubjectsChange={(value) => setData('subjects', value)}
                                        errors={errors as Record<string, string>}
                                    />
                                </div>

                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className="w-full rounded-xl bg-royal-blue dark:bg-sky-600 px-4 py-3 text-xs font-bold text-white hover:brightness-110 shadow-md shadow-royal-blue/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">person_add</span>
                                        <span>Simpan Profil Guru</span>
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
