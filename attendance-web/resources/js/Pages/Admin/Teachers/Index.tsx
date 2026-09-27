import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Teacher {
    id: number;
    name: string;
    email: string;
    nip?: string;
    department?: string;
    embedding_id?: string;
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
    filters: {
        search?: string;
        status?: string;
    };
}

export default function Index({ teachers, stats, filters }: IndexProps) {
    const [search, setSearch] = useState(filters.search || '');
    const [activeStatus, setActiveStatus] = useState(filters.status || '');
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        router.get(
            route('admin.teachers.index'),
            { search, status: activeStatus },
            { preserveState: true, replace: true },
        );
    };

    const handleFilterStatus = (statusValue: string) => {
        setActiveStatus(statusValue);
        router.get(
            route('admin.teachers.index'),
            { search, status: statusValue },
            { preserveState: true, replace: true },
        );
    };

    const clearFilters = () => {
        setSearch('');
        setActiveStatus('');
        router.get(
            route('admin.teachers.index'),
            {},
            { preserveState: true, replace: true },
        );
    };

    const getInitials = (name: string) => {
        if (!name) return 'U';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const filterChips = [
        { label: 'Semua Guru', value: '', icon: 'group' },
        { label: 'Hadir Hari Ini', value: 'hadir', icon: 'how_to_reg', color: 'emerald' },
        { label: 'Sakit', value: 'sakit', icon: 'medical_services', color: 'purple' },
        { label: 'Izin', value: 'izin', icon: 'event_note', color: 'amber' },
        { label: 'Enrolled Biometrik', value: 'enrolled', icon: 'verified_user', color: 'sky' },
        { label: 'Belum Enrolled', value: 'not_enrolled', icon: 'warning', color: 'orange' },
        { label: 'Dinonaktifkan', value: 'disabled', icon: 'block', color: 'rose' },
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.04,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    };

    return (
        <AuthenticatedLayout>
            <Head title="Manajemen Guru & Pendidik" />

            <div className="flex-1 p-4 sm:p-6 lg:p-10 max-w-[1440px] mx-auto w-full space-y-6 sm:space-y-8">
                {/* 1. PAGE HEADER */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-royal-blue/10 dark:bg-sky-500/20 text-royal-blue dark:text-sky-300 border border-royal-blue/20 dark:border-sky-500/30">
                                <span className="material-symbols-outlined text-[14px]">school</span>
                                <span>SMK Al-Madani • Direktori Pendidik</span>
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white tracking-tight">
                            Manajemen Guru & Tenaga Pendidik
                        </h1>
                        <p className="text-xs sm:text-sm text-on-surface-variant dark:text-slate-400 mt-1">
                            Kelola data kepegawaian, verifikasi biometrik FaceNet + EMAR, dan sinkronisasi status presensi hari ini
                        </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        {/* View Switch Toggle */}
                        <div className="inline-flex rounded-2xl border border-surface-variant/80 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-1 shadow-xs">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                    viewMode === 'grid'
                                        ? 'bg-royal-blue text-white shadow-sm shadow-royal-blue/20'
                                        : 'text-on-surface-variant dark:text-slate-400 hover:text-deep-navy dark:hover:text-white'
                                }`}
                                title="Tampilan Grid Bento"
                            >
                                <span className="material-symbols-outlined text-[18px]">grid_view</span>
                                <span className="hidden sm:inline">Grid</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                    viewMode === 'table'
                                        ? 'bg-royal-blue text-white shadow-sm shadow-royal-blue/20'
                                        : 'text-on-surface-variant dark:text-slate-400 hover:text-deep-navy dark:hover:text-white'
                                }`}
                                title="Tampilan Tabel Rinci"
                            >
                                <span className="material-symbols-outlined text-[18px]">table_rows</span>
                                <span className="hidden sm:inline">Tabel</span>
                            </button>
                        </div>

                        {/* Quick Action: Tambah Guru */}
                        <Link
                            href={route('admin.teachers.create')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue to-indigo-600 dark:from-sky-600 dark:to-blue-600 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-royal-blue/20 hover:brightness-110 active:scale-95 transition-all"
                        >
                            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">person_add</span>
                            <span>Tambah Guru</span>
                        </Link>
                    </div>
                </div>

                {/* 2. STATS KPI BENTO CARDS */}
                {stats && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5"
                    >
                        {/* Total Guru */}
                        <div className="relative overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400">
                                    Total Pendidik
                                </span>
                                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-sky-400">
                                    <span className="material-symbols-outlined text-[20px]">groups</span>
                                </span>
                            </div>
                            <div className="mt-3 flex items-baseline gap-2">
                                <span className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white">
                                    {stats.total}
                                </span>
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    Guru Aktif
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-on-surface-variant dark:text-slate-400">
                                Terdaftar di pangkalan data
                            </p>
                        </div>

                        {/* Enrolled Biometrik */}
                        <div className="relative overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400">
                                    Terdaftar Biometrik
                                </span>
                                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                    <span className="material-symbols-outlined text-[20px]">fingerprint</span>
                                </span>
                            </div>
                            <div className="mt-3 flex items-baseline gap-2">
                                <span className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white">
                                    {stats.enrolled}
                                </span>
                                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                    {stats.enrolled_pct}% Siap
                                </span>
                            </div>
                            <div className="mt-2 w-full bg-surface-container-high dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${stats.enrolled_pct}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Hadir Hari Ini */}
                        <div className="relative overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400">
                                    Hadir Hari Ini
                                </span>
                                <span className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                    <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                                    {stats.present_today > 0 && (
                                        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="mt-3 flex items-baseline gap-2">
                                <span className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white">
                                    {stats.present_today}
                                </span>
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    Tercatat Masuk
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-on-surface-variant dark:text-slate-400">
                                Sinkron FaceNet + EMAR
                            </p>
                        </div>

                        {/* Izin & Sakit */}
                        <div className="relative overflow-hidden rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400">
                                    Izin & Sakit
                                </span>
                                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                    <span className="material-symbols-outlined text-[20px]">event_available</span>
                                </span>
                            </div>
                            <div className="mt-3 flex items-baseline gap-2">
                                <span className="text-2xl sm:text-3xl font-extrabold text-deep-navy dark:text-white">
                                    {stats.leave_today}
                                </span>
                                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    Dispensasi
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-on-surface-variant dark:text-slate-400">
                                Keterangan resmi hari ini
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* 3. SEARCH & QUICK FILTER BAR */}
                <div className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs space-y-4">
                    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                        {/* Search Input Box */}
                        <form onSubmit={handleSearch} className="relative flex-1 max-w-xl">
                            <div className="relative flex items-center rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/80 px-3.5 py-2.5 focus-within:border-royal-blue dark:focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-royal-blue/20 transition-all">
                                <span className="material-symbols-outlined text-on-surface-variant dark:text-slate-400 mr-2.5 text-[20px]">
                                    search
                                </span>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Cari guru berdasarkan nama, email, NIP, atau ID wajah..."
                                    className="bg-transparent border-none outline-none text-xs sm:text-sm text-deep-navy dark:text-white w-full placeholder-on-surface-variant/70 dark:placeholder-slate-500 focus:ring-0 p-0"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearch('');
                                            router.get(route('admin.teachers.index'), { status: activeStatus });
                                        }}
                                        className="text-slate-400 hover:text-deep-navy dark:hover:text-white p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                )}
                            </div>
                        </form>

                        {/* Search Submit & Reset Controls */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleSearch()}
                                className="px-4 py-2.5 rounded-2xl bg-royal-blue hover:bg-royal-blue/90 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-[16px]">search</span>
                                <span>Cari</span>
                            </button>
                            {(search || activeStatus) && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="px-3 py-2.5 rounded-2xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
                                    <span>Reset Filter</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Chips Carousel (Responsive scroll) */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant dark:text-slate-400 shrink-0 mr-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">tune</span>
                            <span>Filter:</span>
                        </span>
                        {filterChips.map((chip) => {
                            const isSelected = activeStatus === chip.value;
                            return (
                                <button
                                    key={chip.value}
                                    type="button"
                                    onClick={() => handleFilterStatus(chip.value)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all shrink-0 active:scale-95 ${
                                        isSelected
                                            ? 'bg-deep-navy dark:bg-sky-600 text-white shadow-sm ring-2 ring-deep-navy/20 dark:ring-sky-500/30'
                                            : 'border border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-on-surface-variant dark:text-slate-300 hover:bg-surface-container dark:hover:bg-white/10'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">
                                        {chip.icon}
                                    </span>
                                    <span>{chip.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 4. CONTENT VIEW: GRID BENTO CARDS VS TABLE */}
                <AnimatePresence mode="wait">
                    {viewMode === 'grid' ? (
                        <motion.div
                            key="grid-view"
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
                        >
                            {teachers.data.map((teacher: Teacher) => {
                                const isEnrolled = !!teacher.embedding_id;
                                const isPresent = ['hadir', 'success', 'terlambat', 'pulang'].includes(teacher.today_status || '');
                                const isIzin = teacher.today_status === 'izin';
                                const isSakit = teacher.today_status === 'sakit';
                                const isLate = teacher.today_status === 'terlambat';

                                return (
                                    <motion.div
                                        key={teacher.id}
                                        variants={itemVariants}
                                        whileHover={{ y: -3 }}
                                        transition={{ duration: 0.2 }}
                                        className="group relative flex flex-col justify-between rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] hover:border-royal-blue/40 dark:hover:border-sky-500/40 shadow-xs hover:shadow-lg hover:shadow-royal-blue/5 transition-all duration-300 overflow-hidden"
                                    >
                                        {/* Status Bar Accent on Left */}
                                        <div
                                            className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${
                                                isPresent
                                                    ? 'bg-emerald-500'
                                                    : isSakit
                                                    ? 'bg-purple-500'
                                                    : isIzin
                                                    ? 'bg-amber-500'
                                                    : isEnrolled
                                                    ? 'bg-royal-blue dark:bg-sky-500'
                                                    : 'bg-slate-300 dark:bg-slate-700'
                                            }`}
                                        ></div>

                                        <div className="p-5 sm:p-6 space-y-4">
                                            {/* Teacher Header: Avatar, Name, NIP, Status Badge */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className="relative shrink-0">
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-surface-container-high to-surface-container-highest dark:from-slate-700 dark:to-slate-800 text-deep-navy dark:text-white font-extrabold text-sm shadow-xs border border-white/20">
                                                            {getInitials(teacher.name)}
                                                        </div>
                                                        <span
                                                            className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#0F1B36] ${
                                                                isPresent
                                                                    ? 'bg-emerald-500'
                                                                    : isSakit
                                                                    ? 'bg-purple-500'
                                                                    : isIzin
                                                                    ? 'bg-amber-500'
                                                                    : isEnrolled
                                                                    ? 'bg-sky-500'
                                                                    : 'bg-slate-400'
                                                            }`}
                                                        ></span>
                                                    </div>

                                                    <div className="min-w-0">
                                                        <h3 className="font-bold text-base text-deep-navy dark:text-white truncate group-hover:text-royal-blue dark:group-hover:text-sky-400 transition-colors">
                                                            {teacher.name}
                                                        </h3>
                                                        <p className="text-xs text-on-surface-variant dark:text-slate-400 truncate mt-0.5 font-mono">
                                                            {teacher.nip ? `NIP: ${teacher.nip}` : 'NIP: Belum Terdaftar'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Account Status Pill */}
                                                <div className="shrink-0">
                                                    {teacher.deleted_at ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                            Nonaktif
                                                        </span>
                                                    ) : isEnrolled ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">
                                                            <span className="material-symbols-outlined text-[12px]">verified</span>
                                                            Aktif
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/20">
                                                            Pending
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Details Bento Grid */}
                                            <div className="rounded-2xl bg-surface-container-low/60 dark:bg-white/5 p-3.5 border border-outline-variant/30 dark:border-white/5 space-y-2.5 text-xs">
                                                <div className="flex items-center justify-between text-on-surface-variant dark:text-slate-400">
                                                    <span className="font-semibold uppercase tracking-wider text-[10px]">Bidang / Tugas:</span>
                                                    <span className="font-medium text-deep-navy dark:text-slate-200">
                                                        {teacher.department || 'Guru Mata Pelajaran'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-on-surface-variant dark:text-slate-400">
                                                    <span className="font-semibold uppercase tracking-wider text-[10px]">Email:</span>
                                                    <span className="font-mono text-[11px] text-deep-navy dark:text-slate-200 truncate max-w-[180px]" title={teacher.email}>
                                                        {teacher.email}
                                                    </span>
                                                </div>

                                                {/* ID Wajah / Embedding */}
                                                <div className="flex items-center justify-between text-on-surface-variant dark:text-slate-400 pt-1 border-t border-outline-variant/20 dark:border-white/5">
                                                    <span className="font-semibold uppercase tracking-wider text-[10px]">ID Template Wajah:</span>
                                                    {isEnrolled ? (
                                                        <span className="font-mono font-bold text-[11px] text-royal-blue dark:text-sky-300 bg-royal-blue/10 dark:bg-sky-500/20 px-2 py-0.5 rounded-md">
                                                            {teacher.embedding_id}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[13px]">hourglass_empty</span>
                                                            Belum Ada Template
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Presensi / Dispensasi Hari Ini Card */}
                                            <div className="p-3 rounded-2xl bg-surface-container-low/40 dark:bg-white/5 border border-outline-variant/20 dark:border-white/5">
                                                <p className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant dark:text-slate-400 mb-1">
                                                    Status Kehadiran Hari Ini:
                                                </p>
                                                {isPresent ? (
                                                    <div className="flex items-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                        <span className="relative flex h-2 w-2 mr-2 shrink-0">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                        </span>
                                                        <span>
                                                            Aktif (Hadir {teacher.today_time || '07:00'} WIB)
                                                        </span>
                                                        {isLate && (
                                                            <span className="ml-1.5 rounded px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px]">
                                                                Terlambat
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : isSakit ? (
                                                    <div className="flex items-center text-xs font-bold text-purple-700 dark:text-purple-300">
                                                        <span className="h-2 w-2 mr-2 rounded-full bg-purple-500 shrink-0"></span>
                                                        <span>Sakit ({teacher.today_category || 'Surat Dokter'})</span>
                                                    </div>
                                                ) : isIzin ? (
                                                    <div className="flex items-center text-xs font-bold text-amber-700 dark:text-amber-300">
                                                        <span className="h-2 w-2 mr-2 rounded-full bg-amber-500 shrink-0"></span>
                                                        <span>Izin ({teacher.today_category || 'Dinas / Keperluan'})</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                                                        <span className="h-2 w-2 mr-2 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                                                        <span>Belum ada presensi / izin hari ini</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card Actions Footer */}
                                        <div className="p-3.5 sm:p-4 bg-surface-container-low/50 dark:bg-[#0D1832] border-t border-surface-variant/40 dark:border-white/5 flex items-center justify-between gap-2">
                                            <Link
                                                href={route('admin.teachers.show', teacher.id)}
                                                className="px-3 py-2 rounded-xl text-xs font-bold text-on-surface-variant dark:text-slate-300 hover:text-deep-navy dark:hover:text-white hover:bg-surface-container dark:hover:bg-white/10 transition-all flex items-center gap-1.5"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                                                <span className="hidden sm:inline">Detail</span>
                                            </Link>

                                            <div className="flex items-center gap-2">
                                                {!isEnrolled && !teacher.deleted_at && (
                                                    <Link
                                                        href={route('admin.enroll') + `?teacher_id=${teacher.id}`}
                                                        className="px-3 py-2 rounded-xl bg-royal-blue/15 hover:bg-royal-blue text-royal-blue hover:text-white dark:bg-sky-500/20 dark:hover:bg-sky-600 dark:text-sky-300 dark:hover:text-white text-xs font-bold transition-all flex items-center gap-1 shadow-xs"
                                                        title="Daftarkan template biometrik wajah"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">fingerprint</span>
                                                        <span>Enroll</span>
                                                    </Link>
                                                )}
                                                <Link
                                                    href={route('admin.teachers.edit', teacher.id)}
                                                    className="px-3.5 py-2 rounded-xl bg-surface-container-highest dark:bg-white/10 text-deep-navy dark:text-white hover:bg-royal-blue hover:text-white dark:hover:bg-sky-600 font-bold text-xs transition-all flex items-center gap-1.5 border border-outline-variant/40 dark:border-white/10 shadow-xs"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">edit</span>
                                                    <span>Edit & Status</span>
                                                </Link>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    ) : (
                        /* TABLE VIEW ALTERNATIVE */
                        <motion.div
                            key="table-view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="rounded-3xl border border-surface-variant/50 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] shadow-xs overflow-hidden"
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-surface-variant/40 dark:border-white/10 bg-surface-container-low/40 dark:bg-white/5 text-on-surface-variant dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                                            <th className="p-4 pl-6">Guru & NIP</th>
                                            <th className="p-4">Kontak / Email</th>
                                            <th className="p-4">Biometrik Wajah</th>
                                            <th className="p-4">Kehadiran Hari Ini</th>
                                            <th className="p-4 pr-6 text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-surface-variant/30 dark:divide-white/5">
                                        {teachers.data.map((teacher: Teacher) => {
                                            const isEnrolled = !!teacher.embedding_id;
                                            const isPresent = ['hadir', 'success', 'terlambat', 'pulang'].includes(teacher.today_status || '');
                                            const isIzin = teacher.today_status === 'izin';
                                            const isSakit = teacher.today_status === 'sakit';

                                            return (
                                                <tr
                                                    key={teacher.id}
                                                    className="hover:bg-surface-container-low/40 dark:hover:bg-white/5 transition-colors"
                                                >
                                                    <td className="p-4 pl-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container-high dark:bg-slate-800 text-deep-navy dark:text-white font-bold text-xs shrink-0">
                                                                {getInitials(teacher.name)}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-deep-navy dark:text-white text-sm">
                                                                    {teacher.name}
                                                                </div>
                                                                <div className="text-on-surface-variant dark:text-slate-400 font-mono text-[11px]">
                                                                    {teacher.nip || 'NIP: -'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-on-surface-variant dark:text-slate-300 font-mono">
                                                        {teacher.email}
                                                    </td>
                                                    <td className="p-4">
                                                        {isEnrolled ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                                <span>{teacher.embedding_id}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                                                <span className="material-symbols-outlined text-[14px]">warning</span>
                                                                <span>Belum Enrolled</span>
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        {isPresent ? (
                                                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                                                                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                                                                <span>Hadir ({teacher.today_time || '07:00'} WIB)</span>
                                                            </span>
                                                        ) : isSakit ? (
                                                            <span className="inline-flex items-center gap-1.5 font-bold text-purple-700 dark:text-purple-300">
                                                                <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                                                                <span>Sakit</span>
                                                            </span>
                                                        ) : isIzin ? (
                                                            <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
                                                                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                                                                <span>Izin</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400">Belum Ada Presensi</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {!isEnrolled && (
                                                                <Link
                                                                    href={route('admin.enroll') + `?teacher_id=${teacher.id}`}
                                                                    className="p-1.5 rounded-lg bg-royal-blue/15 text-royal-blue hover:bg-royal-blue hover:text-white transition"
                                                                    title="Enroll Wajah"
                                                                >
                                                                    <span className="material-symbols-outlined text-[18px]">fingerprint</span>
                                                                </Link>
                                                            )}
                                                            <Link
                                                                href={route('admin.teachers.edit', teacher.id)}
                                                                className="px-3 py-1.5 rounded-xl border border-outline-variant/60 dark:border-white/10 hover:bg-royal-blue hover:text-white transition font-semibold"
                                                            >
                                                                Edit
                                                            </Link>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 5. EMPTY STATE */}
                {teachers.data.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="py-16 text-center bg-surface-container-lowest dark:bg-[#0F1B36] rounded-3xl border border-surface-variant/50 dark:border-white/10 p-6 flex flex-col items-center justify-center space-y-3"
                    >
                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-container-high dark:bg-white/5 text-on-surface-variant dark:text-slate-400">
                            <span className="material-symbols-outlined text-[36px]">group_off</span>
                        </div>
                        <h3 className="text-lg font-bold text-deep-navy dark:text-white">
                            Tidak Ada Data Guru Ditemukan
                        </h3>
                        <p className="text-xs text-on-surface-variant dark:text-slate-400 max-w-sm">
                            Tidak ada data pendidik yang cocok dengan pencarian atau filter status yang dipilih.
                        </p>
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-2 px-4 py-2 rounded-xl bg-royal-blue text-white font-bold text-xs shadow-xs hover:brightness-110 transition"
                        >
                            Reset Semua Filter
                        </button>
                    </motion.div>
                )}

                {/* 6. MODERN RESPONSIVE PAGINATION */}
                {teachers.data.length > 0 && teachers.links && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-5 rounded-3xl border border-surface-variant/50 dark:border-white/10 shadow-xs">
                        <div className="text-xs text-on-surface-variant dark:text-slate-400 font-medium text-center sm:text-left">
                            Menampilkan <span className="font-bold text-deep-navy dark:text-white">{teachers.from || 0}</span> sampai{' '}
                            <span className="font-bold text-deep-navy dark:text-white">{teachers.to || 0}</span> dari{' '}
                            <span className="font-bold text-deep-navy dark:text-white">{teachers.total}</span> guru terdaftar
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                            {teachers.links.map((link: any, i: number) => (
                                <Link
                                    key={i}
                                    href={link.url || '#'}
                                    className={`inline-flex h-8 min-w-[32px] sm:h-9 sm:min-w-[36px] items-center justify-center rounded-xl px-3 text-xs font-bold transition-all ${
                                        link.active
                                            ? 'bg-royal-blue text-white shadow-sm shadow-royal-blue/20'
                                            : 'text-on-surface-variant dark:text-slate-300 hover:bg-surface-container-low dark:hover:bg-white/10 border border-transparent hover:border-outline-variant/40'
                                    } ${!link.url ? 'cursor-not-allowed opacity-40 hover:bg-transparent hover:border-transparent' : 'active:scale-95'}`}
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
