import { useForm, usePage } from '@inertiajs/react';
import { FormEventHandler } from 'react';

export default function UpdateBiometricConsentForm({
    className = '',
}: {
    className?: string;
}) {
    const user = usePage().props.auth.user;

    const {
        delete: destroy,
        processing,
        reset,
    } = useForm({
        password: '',
    });

    const revokeConsent: FormEventHandler = (e) => {
        e.preventDefault();

        if (
            confirm(
                'Tindakan ini akan menghapus template wajah Anda dari sistem kami secara permanen. Anda harus melakukan pendaftaran (enrollment) ulang jika ingin melakukan presensi kembali. Lanjutkan?',
            )
        ) {
            destroy(route('profile.revoke-biometric'), {
                preserveScroll: true,
                onSuccess: () => reset(),
            });
        }
    };

    return (
        <section className={className}>
            <header>
                <h2 className="text-base font-bold text-deep-navy dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-royal-blue dark:text-sky-400">fingerprint</span>
                    <span>Persetujuan & Data Biometrik</span>
                </h2>

                <p className="mt-1 text-xs text-on-surface-variant dark:text-slate-400">
                    Sistem ini menyimpan representasi matematis (embedding 512-dimensi) wajah Anda untuk keperluan verifikasi presensi.
                </p>
            </header>

            <div className="mt-6 space-y-4 text-xs">
                <div className="flex gap-4">
                    <div className="w-1/3 font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400">
                        Status Enrollment
                    </div>
                    <div>
                        {user.embedding_id ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                <span>Aktif (Template 512D Tersimpan)</span>
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                <span>Belum Terdaftar</span>
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="w-1/3 font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400">
                        Protokol Riset
                    </div>
                    <div className="font-semibold text-deep-navy dark:text-slate-200">FaceNet-512D + EMAR Temporal Analysis</div>
                </div>
            </div>

            {user.embedding_id && (
                <div className="mt-6">
                    <button
                        onClick={revokeConsent}
                        disabled={processing}
                        className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                        <span>Cabut Persetujuan & Hapus Biometrik</span>
                    </button>
                    <p className="mt-2 max-w-xl text-xs text-red-500">
                        Tindakan ini tidak dapat dibatalkan. Riwayat presensi
                        Anda akan tetap ada, namun Anda tidak akan bisa
                        melakukan presensi hingga mendaftar kembali.
                    </p>
                </div>
            )}
        </section>
    );
}
