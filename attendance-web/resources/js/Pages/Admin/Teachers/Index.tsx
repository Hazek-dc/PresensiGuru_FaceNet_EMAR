import { Head, Link } from '@inertiajs/react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { forwardRef, ReactNode, useEffect, useRef, useState } from 'react';
import { TeacherAvatar } from '../../../Components/Admin/TeacherAvatar';
import { HighlightMatch, TeacherFilterBar, useTeacherFilters } from '../../../Components/Admin/TeacherFilterBar';
import { CountUp, EASE_OUT_EXPO, itemVariants, listVariants, scrollToTopOf, SPRING_SNAPPY, SPRING_SOFT } from '../../../Components/Motion';
import AuthenticatedLayout from '../../../Layouts/AuthenticatedLayout';
import { positionLabel } from '../../../Utils/staffProfile';
import { normalizeTeacherFilters, PER_PAGE_OPTIONS, STATUS_FILTER_PHRASE, TeacherStatusCounts } from '../../../Utils/teacherFilters';

interface Teacher {
    id: number;
    name: string;
    email: string;
    nip?: string;
    position?: string | null;
    subjects?: string[] | null;
    embedding_id?: string;
    avatar_url?: string | null;
    deleted_at?: string | null;
    today_status?: string | null;
    today_time?: string | null;
    today_category?: string | null;
}

interface IndexProps {
    teachers: {
        data: Teacher[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        total: number;
        from: number | null;
        to: number | null;
        current_page: number;
        last_page: number;
    };
    stats?: {
        total: number;
        enrolled: number;
        not_enrolled: number;
        present_today: number;
        leave_today: number;
        enrolled_pct: number;
    };
    counts?: TeacherStatusCounts;
    filters: {
        search?: string;
        status?: string;
        sort?: string;
        per_page?: number | string;
    };
}

type ViewMode = 'grid' | 'table';
const VIEW_MODE_KEY = 'admin-teachers-view';

function readViewMode(): ViewMode {
    try {
        return window.localStorage.getItem(VIEW_MODE_KEY) === 'table' ? 'table' : 'grid';
    } catch {
        return 'grid';
    }
}

type Tone = 'present' | 'late' | 'sakit' | 'izin' | 'enrolled' | 'pending';

const TONE_BAR: Record<Tone, string> = {
    present: 'bg-emerald-500',
    late: 'bg-amber-500',
    sakit: 'bg-purple-500',
    izin: 'bg-amber-500',
    enrolled: 'bg-royal-blue dark:bg-sky-500',
    pending: 'bg-slate-300 dark:bg-slate-600',
};

const TONE_TEXT: Record<Tone, string> = {
    present: 'text-emerald-700 dark:text-emerald-400',
    late: 'text-amber-700 dark:text-amber-300',
    sakit: 'text-purple-700 dark:text-purple-300',
    izin: 'text-amber-700 dark:text-amber-300',
    enrolled: 'text-slate-600 dark:text-slate-400',
    pending: 'text-slate-600 dark:text-slate-400',
};

const PRESENT_LABEL: Record<string, string> = { hadir: 'Hadir', success: 'Hadir', terlambat: 'Terlambat', pulang: 'Pulang' };

/** Status kehadiran hari ini dari data yang tercatat saja; jam dan kategori kosong tidak diisi. */
function todayStatus(teacher: Teacher): { tone: Tone; label: string } {
    const status = teacher.today_status ?? '';
    const time = teacher.today_time ? ` · ${teacher.today_time} WIB` : '';
    const category = teacher.today_category ? ` (${teacher.today_category})` : '';
    if (status in PRESENT_LABEL) {
        return { tone: status === 'terlambat' ? 'late' : 'present', label: `${PRESENT_LABEL[status]}${time}` };
    }
    if (status === 'sakit') return { tone: 'sakit', label: `Sakit${category}` };
    if (status === 'izin') return { tone: 'izin', label: `Izin${category}` };
    return { tone: teacher.embedding_id ? 'enrolled' : 'pending', label: 'Belum ada presensi atau izin hari ini' };
}

function StatTile({
    label,
    icon,
    iconClass,
    children,
    footer,
}: {
    label: string;
    icon: string;
    iconClass: string;
    children: ReactNode;
    footer: ReactNode;
}) {
    return (
        <motion.div
            variants={itemVariants}
            className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-3.5 sm:p-5 shadow-xs"
        >
            <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-on-surface-variant dark:text-slate-400 leading-tight">
                    {label}
                </span>
                <span className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl ${iconClass}`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px] sm:text-[20px]">
                        {icon}
                    </span>
                </span>
            </div>
            <div className="mt-2 sm:mt-3 flex flex-wrap items-baseline gap-x-2">{children}</div>
            <div className="mt-1">{footer}</div>
        </motion.div>
    );
}

export default function Index({ teachers, stats, counts = {}, filters }: IndexProps) {
    const applied = normalizeTeacherFilters(filters);
    const controls = useTeacherFilters(applied);
    const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
    const listRef = useRef<HTMLDivElement | null>(null);
    const highlight = applied.search.trim();
    const filtered = highlight !== '' || applied.status !== '';

    // Pilihan Grid/Tabel diingat per peramban agar tidak kembali ke Grid setiap pindah halaman.
    useEffect(() => {
        try {
            window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
        } catch {
            // Penyimpanan diblokir: pilihan tetap berlaku selama halaman terbuka.
        }
    }, [viewMode]);

    const statusLabel = applied.status ? STATUS_FILTER_PHRASE[applied.status] : '';
    const emptyMessage = !filtered
        ? 'Tambahkan guru untuk mulai mendaftarkan wajah dan mencatat presensi.'
        : highlight && statusLabel
          ? `Tidak ada guru berstatus ${statusLabel} yang nama, email, ID wajah, atau bidang studinya memuat “${highlight}”.`
          : highlight
            ? `Tidak ada guru yang nama, email, ID wajah, atau bidang studinya memuat “${highlight}”.`
            : `Belum ada guru dengan status ${statusLabel}.`;

    const viewButton = (mode: ViewMode, icon: string, label: string, title: string) => (
        <button
            type="button"
            onClick={() => setViewMode(mode)}
            aria-pressed={viewMode === mode}
            aria-label={title}
            title={title}
            className={`relative flex min-h-[44px] lg:min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-blue/60 ${
                viewMode === mode ? 'text-white' : 'text-on-surface-variant dark:text-slate-400 hover:text-deep-navy dark:hover:text-white'
            }`}
        >
            {viewMode === mode && (
                <motion.span
                    layoutId="teacherViewModePill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-xl bg-royal-blue dark:bg-sky-600 shadow-sm"
                />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    {icon}
                </span>
                <span className="hidden sm:inline">{label}</span>
            </span>
        </button>
    );

    return (
        <AuthenticatedLayout>
            <Head title="Manajemen Guru & Pendidik" />

            <MotionConfig reducedMotion="user">
                <div className="flex-1 px-3.5 py-4 sm:p-6 lg:p-10 max-w-[1440px] mx-auto w-full space-y-5 sm:space-y-8">
                    {/* 1. JUDUL & AKSI */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={SPRING_SOFT}
                        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
                    >
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-royal-blue/10 dark:bg-sky-500/20 text-royal-blue dark:text-sky-300 border border-royal-blue/20 dark:border-sky-500/30">
                                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">school</span>
                                <span>SMK Al-Madani • Direktori Pendidik</span>
                            </span>
                            <h1 className="mt-2 text-[1.45rem] leading-tight sm:text-3xl font-extrabold text-deep-navy dark:text-white tracking-tight">
                                Manajemen Guru & Tenaga Pendidik
                            </h1>
                            <p className="text-xs sm:text-sm text-on-surface-variant dark:text-slate-400 mt-1">
                                Kelola data kepegawaian, verifikasi biometrik FaceNet + EMAR, dan sinkronisasi status presensi hari ini
                            </p>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                            <div
                                role="group"
                                aria-label="Tampilan daftar"
                                className="inline-flex rounded-2xl border border-surface-variant/80 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-1 shadow-xs"
                            >
                                {viewButton('grid', 'grid_view', 'Grid', 'Tampilan kartu')}
                                {viewButton('table', 'table_rows', 'Tabel', 'Tampilan tabel')}
                            </div>

                            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={SPRING_SNAPPY} className="flex-1 md:flex-none">
                                <Link
                                    href={route('admin.teachers.create')}
                                    className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-royal-blue dark:bg-sky-600 px-4 sm:px-5 text-xs sm:text-sm font-bold text-white shadow-md shadow-royal-blue/20 hover:bg-deep-navy dark:hover:bg-sky-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-blue/60 focus-visible:ring-offset-2"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-[18px] sm:text-[20px]">person_add</span>
                                    <span>Tambah Guru</span>
                                </Link>
                            </motion.div>
                        </div>
                    </motion.div>

                    {/* 2. RINGKASAN: angka menghitung naik saat halaman dibuka */}
                    {stats && (
                        <motion.div
                            variants={listVariants}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-5"
                        >
                            <StatTile
                                label="Total Pendidik"
                                icon="groups"
                                iconClass="bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-sky-400"
                                footer={
                                    <p className="text-[10px] sm:text-[11px] text-on-surface-variant dark:text-slate-400">
                                        Terdaftar di pangkalan data
                                    </p>
                                }
                            >
                                <CountUp value={stats.total} className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white" />
                                <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Guru Aktif</span>
                            </StatTile>

                            <StatTile
                                label="Terdaftar Biometrik"
                                icon="fingerprint"
                                iconClass="bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                footer={
                                    <div
                                        role="progressbar"
                                        aria-label="Guru dengan template wajah"
                                        aria-valuenow={stats.enrolled_pct}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        className="mt-1.5 w-full bg-surface-container-high dark:bg-slate-700 h-1.5 rounded-full overflow-hidden"
                                    >
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, stats.enrolled_pct)}%` }}
                                            transition={{ duration: 1, ease: EASE_OUT_EXPO, delay: 0.15 }}
                                            className="bg-emerald-500 h-full rounded-full"
                                        />
                                    </div>
                                }
                            >
                                <CountUp value={stats.enrolled} className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white" />
                                <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                    <CountUp value={stats.enrolled_pct} suffix="% Siap" />
                                </span>
                            </StatTile>

                            <StatTile
                                label="Hadir Hari Ini"
                                icon="how_to_reg"
                                iconClass="bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                footer={
                                    <p className="text-[10px] sm:text-[11px] text-on-surface-variant dark:text-slate-400">Sinkron FaceNet + EMAR</p>
                                }
                            >
                                <CountUp value={stats.present_today} className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white" />
                                <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Tercatat Masuk</span>
                            </StatTile>

                            <StatTile
                                label="Izin & Sakit"
                                icon="event_available"
                                iconClass="bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                footer={
                                    <p className="text-[10px] sm:text-[11px] text-on-surface-variant dark:text-slate-400">Keterangan resmi hari ini</p>
                                }
                            >
                                <CountUp value={stats.leave_today} className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white" />
                                <span className="text-[10px] sm:text-[11px] font-semibold text-amber-700 dark:text-amber-400">Dispensasi</span>
                            </StatTile>
                        </motion.div>
                    )}

                    {/* 3. CARI & SARING */}
                    <TeacherFilterBar controls={controls} applied={applied} counts={counts} total={teachers.total} />

                    {/* Daftar lama diredupkan halus selama hasil saringan dimuat. */}
                    <motion.div
                        ref={listRef}
                        aria-busy={controls.loading}
                        animate={{ opacity: controls.loading ? 0.55 : 1 }}
                        transition={{ duration: 0.2 }}
                        className="scroll-mt-24 space-y-5 sm:space-y-8"
                    >
                        {/* 4. KARTU ATAU TABEL */}
                        {teachers.data.length > 0 && (
                            <AnimatePresence mode="wait" initial={false}>
                                {viewMode === 'grid' ? (
                                    <motion.div
                                        key="grid-view"
                                        variants={listVariants}
                                        initial="hidden"
                                        animate="show"
                                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                                        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-5"
                                    >
                                        <AnimatePresence mode="popLayout" initial={false}>
                                            {teachers.data.map((teacher) => (
                                                <TeacherCard key={teacher.id} teacher={teacher} highlight={highlight} />
                                            ))}
                                        </AnimatePresence>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="table-view"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                                        transition={SPRING_SOFT}
                                        className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-xs overflow-hidden"
                                    >
                                        <TeacherTable teachers={teachers.data} highlight={highlight} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )}

                        {/* 5. KOSONG: bedakan hasil saringan kosong dari belum ada guru sama sekali */}
                        {teachers.data.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={SPRING_SOFT}
                                className="py-14 sm:py-16 text-center bg-surface-container-lowest dark:bg-[#0F1B36] rounded-3xl border border-surface-variant/50 dark:border-white/10 p-6 flex flex-col items-center justify-center space-y-3"
                            >
                                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-container-high dark:bg-white/5 text-on-surface-variant dark:text-slate-400">
                                    <span aria-hidden="true" className="material-symbols-outlined text-[36px]">
                                        {filtered ? 'search_off' : 'group_off'}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-deep-navy dark:text-white">
                                    {filtered ? 'Tidak ada guru yang cocok' : 'Belum ada guru'}
                                </h3>
                                <p className="text-sm text-on-surface-variant dark:text-slate-400 max-w-md">{emptyMessage}</p>
                                {filtered ? (
                                    <button
                                        type="button"
                                        onClick={controls.clearAll}
                                        className="mt-2 min-h-[44px] px-4 py-2 rounded-xl bg-royal-blue text-white font-bold text-sm hover:bg-deep-navy dark:bg-sky-600 dark:hover:bg-sky-500 transition-colors"
                                    >
                                        Hapus semua filter
                                    </button>
                                ) : (
                                    <Link
                                        href={route('admin.teachers.create')}
                                        className="mt-2 inline-flex min-h-[44px] items-center px-4 py-2 rounded-xl bg-royal-blue text-white font-bold text-sm hover:bg-deep-navy dark:bg-sky-600 dark:hover:bg-sky-500 transition-colors"
                                    >
                                        Tambah Guru
                                    </Link>
                                )}
                            </motion.div>
                        )}
                    </motion.div>

                    {/* 6. HALAMAN & JUMLAH PER HALAMAN */}
                    {teachers.data.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-5 rounded-3xl border border-surface-variant/50 dark:border-white/10 shadow-xs">
                            <div className="flex flex-col items-center gap-2 text-xs text-on-surface-variant dark:text-slate-400 font-medium sm:flex-row sm:gap-4">
                                <p className="text-center sm:text-left">
                                    Menampilkan <span className="font-bold text-deep-navy dark:text-white">{teachers.from || 0}</span>–
                                    <span className="font-bold text-deep-navy dark:text-white">{teachers.to || 0}</span> dari{' '}
                                    <span className="font-bold text-deep-navy dark:text-white">{teachers.total}</span> guru
                                </p>
                                <label className="flex items-center gap-2">
                                    <span>Per halaman</span>
                                    <select
                                        value={controls.filters.per_page}
                                        onChange={(e) => controls.setPerPage(Number(e.target.value))}
                                        className="min-h-[44px] lg:min-h-[36px] rounded-xl border-outline-variant/60 bg-surface-container-low py-1 pl-2.5 pr-8 text-xs font-bold text-deep-navy focus:border-royal-blue focus:ring-2 focus:ring-royal-blue/20 dark:border-white/10 dark:bg-slate-900/80 dark:text-white dark:[color-scheme:dark]"
                                    >
                                        {PER_PAGE_OPTIONS.map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            {teachers.last_page > 1 && (
                                <nav aria-label="Halaman daftar guru" className="flex flex-wrap items-center justify-center gap-1.5">
                                    {teachers.links.map((link, i) =>
                                        link.url ? (
                                            <Link
                                                key={i}
                                                href={link.url}
                                                preserveState
                                                preserveScroll
                                                only={['teachers', 'counts', 'filters']}
                                                onSuccess={() => scrollToTopOf(listRef.current)}
                                                aria-current={link.active ? 'page' : undefined}
                                                className={`inline-flex h-11 min-w-[44px] lg:h-9 lg:min-w-[36px] items-center justify-center rounded-xl px-3 text-xs font-bold transition-colors ${
                                                    link.active
                                                        ? 'bg-royal-blue text-white dark:bg-sky-600'
                                                        : 'text-on-surface-variant dark:text-slate-300 hover:bg-surface-container-low dark:hover:bg-white/10'
                                                }`}
                                                dangerouslySetInnerHTML={{ __html: link.label }}
                                            />
                                        ) : (
                                            <span
                                                key={i}
                                                aria-disabled="true"
                                                className="inline-flex h-11 min-w-[44px] lg:h-9 lg:min-w-[36px] items-center justify-center rounded-xl px-3 text-xs font-bold text-on-surface-variant opacity-40 dark:text-slate-300"
                                                dangerouslySetInnerHTML={{ __html: link.label }}
                                            />
                                        ),
                                    )}
                                </nav>
                            )}
                        </div>
                    )}
                </div>
            </MotionConfig>
        </AuthenticatedLayout>
    );
}

// forwardRef: AnimatePresence mode="popLayout" mengukur kartu yang keluar lewat ref.
const TeacherCard = forwardRef<HTMLElement, { teacher: Teacher; highlight: string }>(function TeacherCard({ teacher, highlight }, ref) {
    const isEnrolled = !!teacher.embedding_id;
    const position = positionLabel(teacher.position);
    const subjects = teacher.subjects?.length ? teacher.subjects.join(', ') : null;
    const today = todayStatus(teacher);

    return (
        <motion.article
            ref={ref}
            layout
            variants={itemVariants}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.99 }}
            transition={SPRING_SOFT}
            className="group relative flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] hover:border-royal-blue/40 dark:hover:border-sky-500/40 shadow-xs hover:shadow-lg hover:shadow-royal-blue/5 transition-[border-color,box-shadow] duration-300 overflow-hidden"
        >
            {/* Warna status di tepi kiri */}
            <div aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1.5 ${TONE_BAR[today.tone]}`} />

            <div className="p-4 sm:p-5 pl-5 sm:pl-6">
                {/* Avatar, nama, NIP, status akun */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                            <TeacherAvatar
                                name={teacher.name}
                                url={teacher.avatar_url}
                                className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-tr from-surface-container-high to-surface-container-highest dark:from-slate-700 dark:to-slate-800 text-deep-navy dark:text-white text-sm shadow-xs border border-white/20"
                            />
                            <span
                                aria-hidden="true"
                                className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#0F1B36] ${TONE_BAR[today.tone]}`}
                            />
                        </div>

                        <div className="min-w-0">
                            <h3 className="font-bold text-[15px] sm:text-base text-deep-navy dark:text-white truncate group-hover:text-royal-blue dark:group-hover:text-sky-400 transition-colors">
                                <HighlightMatch text={teacher.name} query={highlight} />
                            </h3>
                            <p className="text-[11px] sm:text-xs text-on-surface-variant dark:text-slate-400 truncate mt-0.5 font-mono">
                                {teacher.nip ? `NIP: ${teacher.nip}` : 'NIP: Belum Terdaftar'}
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0">
                        {teacher.deleted_at ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                                Nonaktif
                            </span>
                        ) : isEnrolled ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                <span aria-hidden="true" className="material-symbols-outlined text-[12px]">verified</span>
                                Aktif
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                Pending
                            </span>
                        )}
                    </div>
                </div>

                {/* Data kepegawaian: label kiri, isi kanan, satu baris per data */}
                <dl className="mt-3.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-2xl bg-surface-container-low/60 dark:bg-white/5 p-3 border border-outline-variant/30 dark:border-white/5 text-xs">
                    <dt className="pt-px font-semibold uppercase tracking-wide text-[10px] text-on-surface-variant dark:text-slate-400">Jabatan</dt>
                    <dd className={`text-right font-medium ${position ? 'text-deep-navy dark:text-slate-200' : 'text-on-surface-variant dark:text-slate-400'}`}>
                        {position ?? 'Belum diisi'}
                    </dd>

                    {teacher.position === 'guru' && (
                        <>
                            <dt className="pt-px font-semibold uppercase tracking-wide text-[10px] text-on-surface-variant dark:text-slate-400">Bidang Studi</dt>
                            <dd className={`text-right font-medium ${subjects ? 'text-deep-navy dark:text-slate-200' : 'text-on-surface-variant dark:text-slate-400'}`}>
                                {subjects ? <HighlightMatch text={subjects} query={highlight} /> : 'Belum diisi'}
                            </dd>
                        </>
                    )}

                    <dt className="pt-px font-semibold uppercase tracking-wide text-[10px] text-on-surface-variant dark:text-slate-400">Email</dt>
                    <dd className="truncate text-right font-mono text-[11px] text-deep-navy dark:text-slate-200" title={teacher.email}>
                        <HighlightMatch text={teacher.email} query={highlight} />
                    </dd>

                    <dt className="pt-px font-semibold uppercase tracking-wide text-[10px] text-on-surface-variant dark:text-slate-400">ID Wajah</dt>
                    <dd className="text-right">
                        {isEnrolled ? (
                            <span className="font-mono font-bold text-[11px] text-royal-blue dark:text-sky-300 bg-royal-blue/10 dark:bg-sky-500/20 px-2 py-0.5 rounded-md">
                                <HighlightMatch text={teacher.embedding_id ?? ''} query={highlight} />
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">hourglass_empty</span>
                                Belum Ada Template
                            </span>
                        )}
                    </dd>
                </dl>

                {/* Kehadiran hari ini, satu baris */}
                <p className={`mt-3 flex items-center gap-2 text-xs font-semibold ${TONE_TEXT[today.tone]}`}>
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${TONE_BAR[today.tone]}`} />
                    <span className="sr-only">Kehadiran hari ini: </span>
                    <span className="min-w-0 truncate">{today.label}</span>
                </p>
            </div>

            {/* Aksi */}
            <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-surface-container-low/50 dark:bg-[#0D1832] border-t border-surface-variant/40 dark:border-white/5 flex items-center justify-between gap-2">
                <Link
                    href={route('admin.teachers.show', teacher.id)}
                    aria-label={`Detail ${teacher.name}`}
                    className="inline-flex min-h-[44px] lg:min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-on-surface-variant dark:text-slate-300 hover:text-deep-navy dark:hover:text-white hover:bg-surface-container dark:hover:bg-white/10 transition-colors"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-[17px]">visibility</span>
                    <span>Detail</span>
                </Link>

                <div className="flex items-center gap-2">
                    {!isEnrolled && !teacher.deleted_at && (
                        <Link
                            href={route('admin.enroll') + `?teacher_id=${teacher.id}`}
                            className="inline-flex min-h-[44px] lg:min-h-[38px] items-center gap-1 rounded-xl bg-royal-blue/15 hover:bg-royal-blue text-royal-blue hover:text-white dark:bg-sky-500/20 dark:hover:bg-sky-600 dark:text-sky-300 dark:hover:text-white px-3 text-xs font-bold transition-colors"
                            title="Daftarkan template biometrik wajah"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">fingerprint</span>
                            <span>Enroll</span>
                        </Link>
                    )}
                    <Link
                        href={route('admin.teachers.edit', teacher.id)}
                        className="inline-flex min-h-[44px] lg:min-h-[38px] items-center gap-1.5 rounded-xl bg-surface-container-highest dark:bg-white/10 text-deep-navy dark:text-white hover:bg-royal-blue hover:text-white dark:hover:bg-sky-600 px-3.5 text-xs font-bold transition-colors border border-outline-variant/40 dark:border-white/10"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit</span>
                        <span>Edit & Status</span>
                    </Link>
                </div>
            </div>
        </motion.article>
    );
});

function TeacherTable({ teachers, highlight }: { teachers: Teacher[]; highlight: string }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
                <thead>
                    <tr className="border-b border-surface-variant/40 dark:border-white/10 bg-surface-container-low/40 dark:bg-white/5 text-on-surface-variant dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <th className="p-4 pl-6">Guru & NIP</th>
                        <th className="p-4">Kontak / Email</th>
                        <th className="p-4">Jabatan & Bidang Studi</th>
                        <th className="p-4">Biometrik Wajah</th>
                        <th className="p-4">Kehadiran Hari Ini</th>
                        <th className="p-4 pr-6 text-right">Aksi</th>
                    </tr>
                </thead>
                <motion.tbody
                    variants={listVariants}
                    initial="hidden"
                    animate="show"
                    className="divide-y divide-surface-variant/30 dark:divide-white/5"
                >
                    {teachers.map((teacher) => {
                        const isEnrolled = !!teacher.embedding_id;
                        const position = positionLabel(teacher.position);
                        const subjects = teacher.subjects?.length ? teacher.subjects.join(', ') : null;
                        const today = todayStatus(teacher);

                        return (
                            <motion.tr
                                key={teacher.id}
                                variants={itemVariants}
                                className="hover:bg-surface-container-low/40 dark:hover:bg-white/5 transition-colors"
                            >
                                <td className="p-4 pl-6">
                                    <div className="flex items-center gap-3">
                                        <TeacherAvatar
                                            name={teacher.name}
                                            url={teacher.avatar_url}
                                            className="h-9 w-9 rounded-xl bg-surface-container-high dark:bg-slate-800 text-deep-navy dark:text-white text-xs"
                                        />
                                        <div>
                                            <div className="font-bold text-deep-navy dark:text-white text-sm">
                                                <HighlightMatch text={teacher.name} query={highlight} />
                                            </div>
                                            <div className="text-on-surface-variant dark:text-slate-400 font-mono text-[11px]">
                                                {teacher.nip || 'NIP: -'}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-on-surface-variant dark:text-slate-300 font-mono">
                                    <HighlightMatch text={teacher.email} query={highlight} />
                                </td>
                                <td className="p-4">
                                    {position ? (
                                        <div>
                                            <div className="font-semibold text-deep-navy dark:text-white">{position}</div>
                                            {teacher.position === 'guru' && (
                                                <div className="mt-0.5 max-w-[240px] text-[11px] text-on-surface-variant dark:text-slate-400">
                                                    {subjects ? <HighlightMatch text={subjects} query={highlight} /> : 'Bidang studi belum diisi'}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-on-surface-variant dark:text-slate-400">Belum diisi</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    {isEnrolled ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">check_circle</span>
                                            <span><HighlightMatch text={teacher.embedding_id ?? ''} query={highlight} /></span>
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">warning</span>
                                            <span>Belum Enrolled</span>
                                        </span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center gap-1.5 font-semibold ${TONE_TEXT[today.tone]}`}>
                                        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE_BAR[today.tone]}`} />
                                        <span>{today.label}</span>
                                    </span>
                                </td>
                                <td className="p-4 pr-6 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {!isEnrolled && (
                                            <Link
                                                href={route('admin.enroll') + `?teacher_id=${teacher.id}`}
                                                aria-label={`Enroll wajah ${teacher.name}`}
                                                title="Enroll Wajah"
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-royal-blue/15 text-royal-blue hover:bg-royal-blue hover:text-white transition-colors"
                                            >
                                                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">fingerprint</span>
                                            </Link>
                                        )}
                                        <Link
                                            href={route('admin.teachers.edit', teacher.id)}
                                            className="inline-flex h-9 items-center px-3 rounded-xl border border-outline-variant/60 dark:border-white/10 hover:bg-royal-blue hover:text-white transition-colors font-semibold"
                                        >
                                            Edit
                                        </Link>
                                    </div>
                                </td>
                            </motion.tr>
                        );
                    })}
                </motion.tbody>
            </table>
        </div>
    );
}
