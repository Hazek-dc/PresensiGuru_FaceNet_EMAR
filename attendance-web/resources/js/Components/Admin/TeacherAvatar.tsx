import { router } from '@inertiajs/react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function teacherInitials(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Foto profil guru, atau inisial bila belum ada foto / foto gagal dimuat. */
export function TeacherAvatar({ name, url, className = '' }: { name: string; url?: string | null; className?: string }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [url]);

    if (url && !broken) {
        // Nama guru selalu tampil di sebelahnya, jadi foto tidak perlu teks alternatif sendiri.
        return <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className={`shrink-0 object-cover ${className}`} />;
    }
    return (
        <div aria-hidden="true" className={`flex shrink-0 items-center justify-center font-extrabold ${className}`}>
            {teacherInitials(name)}
        </div>
    );
}

/** Mengecek berkas sebelum diunggah; server tetap memeriksa ulang. */
export function avatarFileError(file: File): string | null {
    if (!AVATAR_TYPES.includes(file.type)) return 'Format foto harus JPG, PNG, atau WebP.';
    if (file.size > AVATAR_MAX_BYTES) return 'Ukuran foto paling besar 2 MB.';
    return null;
}

interface TeacherAvatarUploaderProps {
    teacherId: number;
    name: string;
    avatarUrl?: string | null;
    disabled?: boolean;
}

/**
 * Unggah, ganti, atau hapus foto profil di halaman Edit. Dikirim terpisah dari
 * formulir profil, jadi isian yang belum disimpan tidak ikut terkirim.
 */
export function TeacherAvatarUploader({ teacherId, name, avatarUrl, disabled = false }: TeacherAvatarUploaderProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => () => {
        if (preview) URL.revokeObjectURL(preview);
    }, [preview]);

    const onFile = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const problem = avatarFileError(file);
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        setPreview(URL.createObjectURL(file));
        setBusy(true);
        router.post(
            route('admin.teachers.avatar.store', teacherId),
            { avatar: file },
            {
                forceFormData: true,
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => setPreview(null),
                onError: (errors) => {
                    setPreview(null);
                    setError(errors.avatar ?? 'Foto gagal diunggah.');
                },
                onFinish: () => setBusy(false),
            },
        );
    };

    const remove = () => {
        if (!confirm('Hapus foto profil guru ini?')) return;
        setError(null);
        setBusy(true);
        router.delete(route('admin.teachers.avatar.destroy', teacherId), {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => setBusy(false),
        });
    };

    const hasPhoto = Boolean(avatarUrl);

    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-24 w-24 shrink-0">
                <TeacherAvatar
                    name={name}
                    url={preview ?? avatarUrl}
                    className="h-24 w-24 rounded-3xl border border-outline-variant/50 bg-surface-container-high text-2xl text-deep-navy dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
                {busy && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-3xl bg-slate-950/50" role="status">
                        <span aria-hidden="true" className="material-symbols-outlined animate-spin text-white">
                            progress_activity
                        </span>
                        <span className="sr-only">Menyimpan foto…</span>
                    </span>
                )}
            </div>
            <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap gap-2">
                    <input
                        ref={inputRef}
                        id={`teacher-avatar-${teacherId}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={onFile}
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                    />
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled || busy}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-royal-blue px-4 text-xs font-bold text-white hover:bg-deep-navy disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                            add_a_photo
                        </span>
                        {hasPhoto ? 'Ganti foto' : 'Unggah foto'}
                    </button>
                    {hasPhoto && (
                        <button
                            type="button"
                            onClick={remove}
                            disabled={busy}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-outline-variant/60 px-4 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                                delete
                            </span>
                            Hapus foto
                        </button>
                    )}
                </div>
                <p className="text-[11px] text-on-surface-variant dark:text-slate-400">
                    JPG, PNG, atau WebP, paling besar 2 MB. Foto ini hanya untuk tampilan dan tidak dipakai untuk verifikasi wajah.
                </p>
                {disabled && !hasPhoto && (
                    <p className="text-[11px] text-on-surface-variant dark:text-slate-400">Aktifkan kembali guru ini untuk mengunggah foto.</p>
                )}
                {error && (
                    <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {error}
                    </p>
                )}
            </div>
        </div>
    );
}
