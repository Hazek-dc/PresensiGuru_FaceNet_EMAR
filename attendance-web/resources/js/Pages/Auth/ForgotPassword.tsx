import InputError from '@/Components/InputError';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';

export default function ForgotPassword({ status }: { status?: string }) {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('password.email'));
    };

    return (
        <GuestLayout>
            <Head title="Lupa Kata Sandi - Presensi FaceNet" />

            {/* Header */}
            <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-royal-blue/10 dark:bg-sky-accent/15 text-royal-blue dark:text-sky-300 shadow-inner">
                    <span
                        className="material-symbols-outlined text-[26px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                        lock_reset
                    </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-deep-navy dark:text-white">
                    Reset Kata Sandi
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-on-surface-variant dark:text-slate-400 leading-relaxed">
                    Masukkan email Anda untuk menerima tautan reset kata sandi baru.
                </p>
            </div>

            {status && (
                <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/15 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    <span className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400 shrink-0">
                        check_circle
                    </span>
                    <span>{status}</span>
                </div>
            )}

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <label
                        htmlFor="email"
                        className="block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 mb-1.5"
                    >
                        Email Terdaftar
                    </label>

                    <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-on-surface-variant dark:text-slate-400">
                            <span className="material-symbols-outlined text-[18px]">
                                alternate_email
                            </span>
                        </div>
                        <input
                            id="email"
                            type="email"
                            name="email"
                            value={data.email}
                            placeholder="nama@email.com"
                            autoComplete="username"
                            autoFocus
                            onChange={(e) => setData('email', e.target.value)}
                            className="block w-full rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-slate-900/80 pl-10 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm text-deep-navy dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-xs focus:border-royal-blue focus:ring-2 focus:ring-royal-blue/20 transition-all duration-200"
                        />
                    </div>

                    <InputError message={errors.email} className="mt-1.5" />
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={processing}
                        className="group relative flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue to-deep-navy dark:from-sky-accent dark:to-royal-blue py-3 px-4 text-xs sm:text-sm font-bold text-white shadow-lg shadow-royal-blue/25 hover:shadow-royal-blue/35 hover:brightness-110 active:scale-[0.98] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 min-h-[46px]"
                    >
                        {processing ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                <span>Mengirim Tautan...</span>
                            </>
                        ) : (
                            <>
                                <span>Kirim Tautan Reset Sandi</span>
                                <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:translate-x-1">
                                    send
                                </span>
                            </>
                        )}
                    </button>
                </div>
            </form>

            <div className="mt-6 text-center">
                <Link
                    href={route('login')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-royal-blue dark:text-sky-300 hover:underline"
                >
                    <span className="material-symbols-outlined text-[16px]">
                        arrow_back
                    </span>
                    <span>Kembali ke Halaman Masuk</span>
                </Link>
            </div>
        </GuestLayout>
    );
}
