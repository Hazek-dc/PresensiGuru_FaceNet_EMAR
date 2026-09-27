import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import DeleteUserForm from './Partials/DeleteUserForm';
import TeacherLeaveStatusForm from './Partials/TeacherLeaveStatusForm';
import UpdateBiometricConsentForm from './Partials/UpdateBiometricConsentForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';

export default function Edit({
    mustVerifyEmail,
    status,
    today_attendance,
    recent_leaves,
}: PageProps<{
    mustVerifyEmail: boolean;
    status?: string;
    today_attendance?: any;
    recent_leaves?: any[];
}>) {
    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-bold leading-tight text-deep-navy dark:text-white">
                        Pengaturan Profil & Akun
                    </h2>
                    <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-0.5">
                        Kelola data pribadi, status izin/sakit guru, persetujuan biometrik, dan keamanan kata sandi
                    </p>
                </div>
            }
        >
            <Head title="Profil Akun" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {/* Status Izin & Sakit Guru (Hanya Izin & Sakit) */}
                    <div className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-6 shadow-sm sm:p-8">
                        <TeacherLeaveStatusForm
                            today_attendance={today_attendance}
                            recent_leaves={recent_leaves}
                            className="max-w-2xl"
                        />
                    </div>

                    <div className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-6 shadow-sm sm:p-8">
                        <UpdateProfileInformationForm
                            mustVerifyEmail={mustVerifyEmail}
                            status={status}
                            className="max-w-2xl"
                        />
                    </div>

                    <div className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-6 shadow-sm sm:p-8">
                        <UpdateBiometricConsentForm className="max-w-2xl" />
                    </div>

                    <div className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-6 shadow-sm sm:p-8">
                        <UpdatePasswordForm className="max-w-2xl" />
                    </div>

                    <div className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-6 shadow-sm sm:p-8">
                        <DeleteUserForm className="max-w-2xl" />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
