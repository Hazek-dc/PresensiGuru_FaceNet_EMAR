import DynamicBackdrop from '@/Components/DynamicBackdrop';
import ThemeSwitcher from '@/Components/ThemeSwitcher';
import { Link, usePage } from '@inertiajs/react';
import { AnimatePresence, motion } from 'motion/react';
import {
    PropsWithChildren,
    ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

export default function AuthenticatedLayout({
    header,
    children,
}: PropsWithChildren<{ header?: ReactNode }>) {
    const { user } = usePage().props.auth as any;

    // Mobile sidebar drawer state
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Desktop collapse state (with localStorage persistence)
    const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('app_sidebar_collapsed');
            if (saved !== null) {
                return saved === 'true';
            }
            return window.innerWidth < 1080;
        }
        return false;
    });

    // Hover-to-expand state when collapsed in desktop rail mode
    const [isHovered, setIsHovered] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Active tooltip index for collapsed mode
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

    // Profile menu popover state in collapsed mode
    const [collapsedProfileMenuOpen, setCollapsedProfileMenuOpen] = useState(false);

    // Auto-detect screen size changes for responsive auto-collapse
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            if (width < 768) {
                // Mobile: close drawer on viewport resize
                setSidebarOpen(false);
            } else if (width < 1080) {
                // Tablet auto-collapse if user hasn't explicitly set a preference
                const saved = localStorage.getItem('app_sidebar_collapsed');
                if (saved === null) {
                    setIsCollapsed(true);
                }
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Desktop keyboard shortcut (Alt + S or Ctrl + B) to toggle sidebar + Escape to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.altKey && e.key.toLowerCase() === 's') || (e.ctrlKey && e.key.toLowerCase() === 'b')) {
                e.preventDefault();
                toggleCollapse();
            } else if (e.key === 'Escape') {
                setSidebarOpen(false);
                setActiveTooltip(null);
                setCollapsedProfileMenuOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Toggle collapse handler with persistence
    const toggleCollapse = useCallback(() => {
        setIsCollapsed((prev) => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('app_sidebar_collapsed', String(next));
            }
            return next;
        });
    }, []);

    const handleMouseEnter = () => {
        if (!isCollapsed) return;
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHovered(true);
        }, 70);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHovered(false);
            setActiveTooltip(null);
            setCollapsedProfileMenuOpen(false);
        }, 110);
    };

    interface NavItem {
        id: string;
        label: string;
        icon: string;
        href: string;
        active: boolean;
        badge?: string;
        isLive?: boolean;
        category?: string;
    }

    interface NavSection {
        id: string;
        title: string;
        items: NavItem[];
    }

    // Navigation items categorized into logical semantic groups
    const navSections: NavSection[] = [
        {
            id: 'main',
            title: 'Menu Utama',
            items: [
                {
                    id: 'dashboard',
                    label: 'Dashboard',
                    icon: 'dashboard',
                    href: route('dashboard'),
                    active: route().current('dashboard'),
                    category: 'Menu Utama',
                },
                {
                    id: 'presensi',
                    label: 'Presensi Kamera',
                    icon: 'document_scanner',
                    href: route('presensi'),
                    active: route().current('presensi') || route().current('attendance.capture'),
                    badge: 'LIVE',
                    isLive: true,
                    category: 'Menu Utama',
                },
                {
                    id: 'history',
                    label: 'Riwayat Log',
                    icon: 'history',
                    href: route('attendance.history'),
                    active: route().current('attendance.history') || route().current('attendance.show'),
                    category: 'Menu Utama',
                },
            ],
        },
    ];

    if (user.role === 'teacher') {
        navSections.push({
            id: 'teacher-ops',
            title: 'Biometrik Pribadi',
            items: [
                {
                    id: 'teacher-enrollment',
                    label: 'Enrollment Wajah',
                    icon: 'face',
                    href: route('teacher.enrollment'),
                    active: route().current('teacher.enrollment'),
                    badge: user.embedding_id ? 'SIAP' : 'DAFTAR',
                    isLive: false,
                    category: 'Biometrik Pribadi',
                },
            ],
        });
    }

    if (user.role === 'admin') {
        navSections.push({
            id: 'admin-management',
            title: 'Kelola Akademik',
            items: [
                {
                    id: 'teachers',
                    label: 'Manajemen Guru',
                    icon: 'group',
                    href: route('admin.teachers.index'),
                    active: route().current('admin.teachers.*'),
                    category: 'Kelola Akademik',
                },
                {
                    id: 'enrollment',
                    label: 'Enrollment Wajah',
                    icon: 'face',
                    href: route('admin.enroll'),
                    active: route().current('admin.enroll'),
                    category: 'Kelola Akademik',
                },
            ],
        });
    }

    if (user.role === 'admin' || user.role === 'researcher') {
        navSections.push({
            id: 'research-lab',
            title: 'Laboratorium Riset',
            items: [
                {
                    id: 'research',
                    label: 'Dataset Riset EMAR',
                    icon: 'science',
                    href: route('admin.research-dataset'),
                    active: route().current('admin.research-dataset.*'),
                    badge: 'QALWANI',
                    category: 'Laboratorium Riset',
                },
                {
                    id: 'settings',
                    label: 'Pengaturan Model',
                    icon: 'tune',
                    href: route('admin.settings.model'),
                    active: route().current('admin.settings.*'),
                    category: 'Laboratorium Riset',
                },
                {
                    id: 'distance-calibration',
                    label: 'Kalibrasi Jarak',
                    icon: 'straighten',
                    href: route('admin.distance-calibration'),
                    active: route().current('admin.distance-calibration'),
                    category: 'Laboratorium Riset',
                },
                {
                    id: 'lux-calibration',
                    label: 'Kalibrasi Lux',
                    icon: 'light_mode',
                    href: route('admin.lux-calibration'),
                    active: route().current('admin.lux-calibration'),
                    category: 'Laboratorium Riset',
                },
            ],
        });
    }

    const allNavItems = navSections.flatMap((s) => s.items);

    // Is the visual sidebar expanded (either fully uncollapsed or temporarily hovered in rail mode)?
    const isVisuallyExpanded = !isCollapsed || isHovered;

    // Mobile drawer staggered entrance variants
    const mobileDrawerVariants = {
        hidden: { x: '-100%', opacity: 0 },
        show: {
            x: 0,
            opacity: 1,
            transition: {
                type: 'spring' as const,
                damping: 26,
                stiffness: 290,
            },
        },
        exit: {
            x: '-100%',
            opacity: 0,
            transition: {
                duration: 0.22,
                ease: 'easeIn' as const,
            },
        },
    };

    const navContainerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.04,
                delayChildren: 0.06,
            },
        },
    };

    const navItemVariants = {
        hidden: { opacity: 0, x: -14 },
        show: {
            opacity: 1,
            x: 0,
            transition: {
                duration: 0.25,
                ease: 'easeOut' as const,
            },
        },
    };

    return (
        <div className="relative flex min-h-screen bg-[#F4F6F9] dark:bg-[#070D1E] text-on-surface dark:text-slate-100 font-sans antialiased transition-colors duration-300 overflow-x-hidden">
            {/* Dynamic Backdrop Aurora: Ambient Blur Spheres & Cyber Dot-Matrix */}
            <DynamicBackdrop />

            {/* ======================================================== */}
            {/* 1. DESKTOP SIDEBAR (Collapsible, Floating Hover & Glass)  */}
            {/* ======================================================== */}
            <aside
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`fixed inset-y-0 left-0 z-30 hidden md:flex flex-col bg-white/90 dark:bg-[#081126]/90 text-slate-800 dark:text-white backdrop-blur-2xl transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-r border-slate-200/80 dark:border-white/10 ${
                    isVisuallyExpanded ? 'w-64' : 'w-[76px]'
                } ${
                    isCollapsed && isHovered
                        ? 'shadow-[0_20px_50px_rgba(0,0,0,0.25)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.8)] ring-1 ring-royal-blue/30 dark:ring-sky-500/30'
                        : 'shadow-xl dark:shadow-[0_0_40px_rgba(0,0,0,0.6)]'
                }`}
                aria-label="Sidebar Utama"
            >
                {/* Desktop Edge Floating Collapse Button */}
                <button
                    type="button"
                    onClick={toggleCollapse}
                    className="absolute -right-3.5 top-24 z-40 hidden md:flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 dark:border-white/15 bg-white dark:bg-[#0D1836] text-slate-600 dark:text-slate-300 shadow-md hover:bg-royal-blue hover:text-white dark:hover:bg-sky-500 dark:hover:text-white hover:scale-110 active:scale-95 transition-all focus:outline-none"
                    title={isCollapsed ? 'Perluas Sidebar (Alt + S)' : 'Ciutkan Sidebar (Alt + S)'}
                    aria-label="Toggle Sidebar"
                >
                    <span
                        className={`material-symbols-outlined text-[16px] transition-transform duration-300 ${
                            isCollapsed ? 'rotate-180' : 'rotate-0'
                        }`}
                    >
                        chevron_left
                    </span>
                </button>

                {/* Brand Header */}
                <div className="flex h-20 items-center px-4 border-b border-slate-200/80 dark:border-white/10 shrink-0">
                    <Link
                        href={route('dashboard')}
                        className="flex items-center gap-3 overflow-hidden group py-1 w-full"
                    >
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-xs border border-slate-200/90 dark:border-white/10 transition-transform duration-300 group-hover:scale-105">
                            <img
                                src="/images/logo-smk-al-madani.png"
                                alt="Logo SMK Al-Madani"
                                className="h-full w-full object-contain filter drop-shadow-xs"
                            />
                            {/* Active Brand Dot */}
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900"></span>
                            </span>
                        </div>
                        {isVisuallyExpanded && (
                            <div className="flex flex-col min-w-0 transition-opacity duration-200 overflow-hidden">
                                <span className="font-headline-md text-[15px] font-extrabold tracking-tight text-deep-navy dark:text-white truncate leading-tight">
                                    SMK Al-Madani
                                </span>
                                <span className="text-[11px] font-medium text-slate-500 dark:text-ice-blue/75 truncate flex items-center gap-1.5 mt-0.5">
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                    <span>Presensi Biometrik</span>
                                </span>
                            </div>
                        )}
                    </Link>
                </div>

                {/* Navigation Items List by Section */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 flex flex-col gap-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10">
                    {navSections.map((section, sIdx) => (
                        <div key={section.id} className="flex flex-col gap-1">
                            {/* Section Header or Collapsed Separator */}
                            {isVisuallyExpanded ? (
                                <div className="px-3 pt-2 pb-0.5 select-none">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-ice-blue/40">
                                        {section.title}
                                    </span>
                                </div>
                            ) : (
                                sIdx > 0 && (
                                    <div className="my-1.5 mx-auto w-6 border-t border-slate-200/80 dark:border-white/10" />
                                )
                            )}

                            {/* Nav Items */}
                            {section.items.map((item) => {
                                const isActive = item.active;
                                return (
                                    <div
                                        key={item.id}
                                        className="relative group"
                                        onMouseEnter={() => !isVisuallyExpanded && setActiveTooltip(item.id)}
                                        onMouseLeave={() => setActiveTooltip(null)}
                                    >
                                        <Link
                                            href={item.href}
                                            className={`relative flex items-center gap-3.5 px-3 py-2.5 rounded-2xl transition-all duration-200 active:scale-[0.98] ${
                                                isActive
                                                    ? 'text-royal-blue dark:text-white font-bold'
                                                    : 'text-slate-600 dark:text-white/75 hover:text-deep-navy dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10'
                                            } ${!isVisuallyExpanded ? 'justify-center' : ''}`}
                                        >
                                            {/* Active Background Pill with Framer Motion layoutId */}
                                            {isActive && (
                                                <motion.div
                                                    layoutId="activeSidebarNavBg"
                                                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                                                    className="absolute inset-0 rounded-2xl bg-royal-blue/10 dark:bg-white/10"
                                                />
                                            )}

                                            {/* Active Left Indicator Bar */}
                                            {isActive && (
                                                <motion.div
                                                    layoutId="activeSidebarNavIndicator"
                                                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                                    className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-royal-blue dark:bg-sky-400"
                                                />
                                            )}

                                            {/* Icon with micro-scale on hover */}
                                            <span
                                                className={`material-symbols-outlined relative z-10 shrink-0 text-[22px] transition-transform duration-200 ${
                                                    isActive
                                                        ? 'text-royal-blue dark:text-sky-300 scale-110'
                                                        : 'text-slate-500 dark:text-white/70 group-hover:text-royal-blue dark:group-hover:text-white group-hover:scale-105'
                                                }`}
                                                style={{
                                                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                                                }}
                                            >
                                                {item.icon}
                                            </span>

                                            {/* Item Label & Status Pill */}
                                            {isVisuallyExpanded && (
                                                <div className="flex flex-1 items-center justify-between min-w-0 transition-opacity duration-200">
                                                    <span className="text-[13px] font-medium truncate">
                                                        {item.label}
                                                    </span>
                                                    {item.badge && (
                                                        <span
                                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${
                                                                item.isLive
                                                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-xs'
                                                                    : 'bg-royal-blue/10 dark:bg-sky-500/20 border border-royal-blue/20 dark:border-sky-400/30 text-royal-blue dark:text-sky-300'
                                                            }`}
                                                        >
                                                            {item.isLive && (
                                                                <span className="relative flex h-1.5 w-1.5">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                                                </span>
                                                            )}
                                                            <span>{item.badge}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </Link>

                                        {/* Collapsed Mode Floating Tooltip */}
                                        <AnimatePresence>
                                            {!isVisuallyExpanded && activeTooltip === item.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, x: -8, scale: 0.95 }}
                                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                                    exit={{ opacity: 0, x: -6, scale: 0.95 }}
                                                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                                                    className="fixed left-[84px] z-50 rounded-xl bg-slate-900/95 dark:bg-[#111C38]/95 px-3 py-2 text-xs font-semibold text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-xl pointer-events-none flex items-center gap-2 whitespace-nowrap"
                                                >
                                                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900/95 dark:bg-[#111C38]/95 rotate-45 border-l border-b border-white/20" />
                                                    <div className="flex flex-col gap-0.5 relative z-10">
                                                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono">
                                                            {item.category || section.title}
                                                        </span>
                                                        <span className="text-white font-semibold">
                                                            {item.label}
                                                        </span>
                                                    </div>
                                                    {item.badge && (
                                                        <span
                                                            className={`relative z-10 rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                                                                item.isLive
                                                                    ? 'bg-emerald-500/25 border border-emerald-400/40 text-emerald-300'
                                                                    : 'bg-sky-500/25 border border-sky-400/40 text-sky-300'
                                                            }`}
                                                        >
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Quick Action: Daftar Guru Baru (Admin) */}
                {user.role === 'admin' && (
                    <div className="p-3 border-t border-slate-200/80 dark:border-white/10 shrink-0">
                        {isVisuallyExpanded ? (
                            <Link
                                href={route('admin.teachers.create')}
                                className="group/btn relative w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue via-blue-600 to-indigo-700 dark:from-sky-500 dark:via-royal-blue dark:to-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-royal-blue/25 hover:shadow-lg hover:shadow-royal-blue/35 active:scale-[0.98] transition-all duration-200 overflow-hidden"
                            >
                                <div className="pointer-events-none absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 ease-out" />
                                </div>
                                <span className="material-symbols-outlined text-[18px]">person_add</span>
                                <span>Daftar Guru Baru</span>
                            </Link>
                        ) : (
                            <div className="relative group flex justify-center">
                                <Link
                                    href={route('admin.teachers.create')}
                                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-accent to-royal-blue text-white shadow-md shadow-royal-blue/25 hover:brightness-110 active:scale-90 transition-all"
                                    title="Daftarkan Guru Baru"
                                >
                                    <span className="material-symbols-outlined text-[20px]">person_add</span>
                                </Link>
                            </div>
                        )}
                    </div>
                )}

                {/* User Profile Footer Bento */}
                <div className="relative p-3 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-black/20 flex flex-col gap-1.5 shrink-0">
                    {isVisuallyExpanded ? (
                        <>
                            <div className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors">
                                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-royal-blue to-sky-accent text-white font-bold text-xs uppercase shadow-sm">
                                    {user.name ? user.name.substring(0, 2) : 'AD'}
                                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#081126]"></span>
                                </div>
                                <div className="flex flex-1 flex-col min-w-0">
                                    <span className="text-xs font-semibold text-deep-navy dark:text-white truncate">
                                        {user.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-ice-blue/60 uppercase font-mono truncate">
                                        {user.role || 'Administrator'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <Link
                                    href={route('profile.edit')}
                                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[11px] font-medium text-slate-600 dark:text-white/75 hover:text-deep-navy dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 transition-all active:scale-95"
                                    title="Edit Profil"
                                >
                                    <span className="material-symbols-outlined text-[16px]">manage_accounts</span>
                                    <span>Profil</span>
                                </Link>
                                <Link
                                    href={route('logout')}
                                    method="post"
                                    as="button"
                                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/15 transition-all active:scale-95"
                                    title="Keluar dari Aplikasi"
                                >
                                    <span className="material-symbols-outlined text-[16px]">logout</span>
                                    <span>Keluar</span>
                                </Link>
                            </div>
                        </>
                    ) : (
                        <div className="relative flex flex-col items-center">
                            <button
                                type="button"
                                onClick={() => setCollapsedProfileMenuOpen((p) => !p)}
                                className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-royal-blue to-sky-accent text-white font-bold text-xs uppercase shadow-sm hover:scale-105 active:scale-95 transition-transform"
                                title={user.name}
                                aria-label="Menu Profil Pengguna"
                            >
                                {user.name ? user.name.substring(0, 2) : 'AD'}
                                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#081126]"></span>
                            </button>

                            {/* Floating Profile Popover in Collapsed Rail Mode */}
                            <AnimatePresence>
                                {collapsedProfileMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        exit={{ opacity: 0, x: -8, scale: 0.95 }}
                                        transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                                        className="fixed bottom-4 left-[84px] z-50 w-56 rounded-2xl bg-white/95 dark:bg-[#0E1B38]/95 p-3 text-slate-800 dark:text-white shadow-2xl ring-1 ring-slate-200 dark:ring-white/15 backdrop-blur-2xl flex flex-col gap-2.5"
                                    >
                                        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-white/10">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-royal-blue text-white font-bold text-xs">
                                                {user.name ? user.name.substring(0, 2) : 'AD'}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold text-deep-navy dark:text-white truncate">
                                                    {user.name}
                                                </span>
                                                <span className="text-[10px] text-slate-500 dark:text-ice-blue/60 uppercase">
                                                    {user.role || 'Admin'}
                                                </span>
                                            </div>
                                        </div>
                                        <Link
                                            href={route('profile.edit')}
                                            onClick={() => setCollapsedProfileMenuOpen(false)}
                                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                                            <span>Pengaturan Profil</span>
                                        </Link>
                                        <Link
                                            href={route('logout')}
                                            method="post"
                                            as="button"
                                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15 transition-colors text-left"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">logout</span>
                                            <span>Keluar dari Akun</span>
                                        </Link>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </aside>

            {/* ======================================================== */}
            {/* 2. MOBILE SIDEBAR DRAWER (Smooth Slide-over & Backdrop)  */}
            {/* ======================================================== */}
            <AnimatePresence>
                {sidebarOpen && (
                    <div className="fixed inset-0 z-50 flex md:hidden">
                        {/* Frosted Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            onClick={() => setSidebarOpen(false)}
                            className="fixed inset-0 bg-slate-950/65 backdrop-blur-md"
                        />

                        {/* Drawer Panel with Swipe Gesture */}
                        <motion.div
                            variants={mobileDrawerVariants}
                            initial="hidden"
                            animate="show"
                            exit="exit"
                            drag="x"
                            dragConstraints={{ left: -300, right: 0 }}
                            dragElastic={{ left: 0.1, right: 0 }}
                            onDragEnd={(_, info) => {
                                if (info.offset.x < -60 || info.velocity.x < -300) {
                                    setSidebarOpen(false);
                                }
                            }}
                            className="relative z-10 flex h-full w-[300px] max-w-[85vw] flex-col bg-white/95 dark:bg-[#071026]/95 text-slate-800 dark:text-white backdrop-blur-2xl shadow-2xl border-r border-slate-200/80 dark:border-white/10 select-none"
                        >
                            {/* Mobile Header */}
                            <div className="flex h-20 items-center justify-between px-5 border-b border-slate-200/80 dark:border-white/10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-xs border border-slate-200/90 dark:border-white/10">
                                        <img
                                            src="/images/logo-smk-al-madani.png"
                                            alt="Logo SMK Al-Madani"
                                            className="h-full w-full object-contain filter drop-shadow-xs"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-deep-navy dark:text-white text-base">SMK Al-Madani</span>
                                        <span className="text-[10px] text-slate-500 dark:text-ice-blue/70">Presensi Biometrik Wajah</span>
                                    </div>
                                </div>
                                <motion.button
                                    type="button"
                                    onClick={() => setSidebarOpen(false)}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                                    aria-label="Tutup Menu"
                                >
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </motion.button>
                            </div>

                            {/* Mobile Nav Links with Staggered Animation & Sections */}
                            <motion.div
                                variants={navContainerVariants}
                                initial="hidden"
                                animate="show"
                                className="flex-1 overflow-y-auto px-3.5 py-4 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10"
                            >
                                {navSections.map((section) => (
                                    <div key={section.id} className="flex flex-col gap-1">
                                        <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-ice-blue/40 mt-1 mb-0.5 select-none">
                                            {section.title}
                                        </span>
                                        {section.items.map((item) => {
                                            const isActive = item.active;
                                            return (
                                                <motion.div key={item.id} variants={navItemVariants}>
                                                    <Link
                                                        href={item.href}
                                                        onClick={() => setSidebarOpen(false)}
                                                        className={`flex min-h-[44px] items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all active:scale-[0.98] ${
                                                            isActive
                                                                ? 'bg-gradient-to-r from-royal-blue/15 via-royal-blue/10 to-transparent dark:from-sky-500/25 dark:via-sky-500/10 dark:to-transparent text-royal-blue dark:text-white font-bold ring-1 ring-royal-blue/20 dark:ring-sky-accent/40 shadow-xs'
                                                                : 'text-slate-600 dark:text-white/75 hover:text-deep-navy dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span
                                                                className={`material-symbols-outlined text-[22px] ${
                                                                    isActive ? 'text-royal-blue dark:text-sky-accent' : 'text-slate-500 dark:text-white/70'
                                                                }`}
                                                                style={{
                                                                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                                                                }}
                                                            >
                                                                {item.icon}
                                                            </span>
                                                            <span className="text-sm font-medium">{item.label}</span>
                                                        </div>
                                                        {item.badge && (
                                                            <span
                                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${
                                                                    item.isLive
                                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-xs'
                                                                        : 'bg-royal-blue/10 dark:bg-sky-accent/20 border border-royal-blue/20 dark:border-sky-accent/40 text-royal-blue dark:text-sky-accent'
                                                                }`}
                                                            >
                                                                {item.isLive && (
                                                                    <span className="relative flex h-1.5 w-1.5">
                                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                                                    </span>
                                                                )}
                                                                <span>{item.badge}</span>
                                                            </span>
                                                        )}
                                                    </Link>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                ))}

                                {/* Mobile Quick Action for Admin */}
                                {user.role === 'admin' && (
                                    <div className="pt-2">
                                        <Link
                                            href={route('admin.teachers.create')}
                                            onClick={() => setSidebarOpen(false)}
                                            className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-royal-blue via-blue-600 to-indigo-700 dark:from-sky-500 dark:via-royal-blue dark:to-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-royal-blue/25 active:scale-[0.98] transition-all"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">person_add</span>
                                            <span>Daftar Guru Baru</span>
                                        </Link>
                                    </div>
                                )}
                            </motion.div>

                            {/* Mobile Footer with ThemeSwitcher & Account */}
                            <div className="p-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/90 dark:bg-black/20 flex flex-col gap-2.5 shrink-0">
                                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-white/90">Tema Tampilan</span>
                                    <ThemeSwitcher size="sm" />
                                </div>
                                <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-royal-blue to-sky-accent text-white font-bold text-xs uppercase">
                                        {user.name ? user.name.substring(0, 2) : 'AD'}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs font-semibold text-deep-navy dark:text-white truncate">{user.name}</span>
                                        <span className="text-[10px] text-slate-500 dark:text-ice-blue/60 uppercase">{user.role || 'Admin'}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Link
                                        href={route('profile.edit')}
                                        onClick={() => setSidebarOpen(false)}
                                        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 py-2.5 text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">person</span>
                                        <span>Profil</span>
                                    </Link>
                                    <Link
                                        href={route('logout')}
                                        method="post"
                                        as="button"
                                        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/20 active:scale-95 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">logout</span>
                                        <span>Keluar</span>
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ======================================================== */}
            {/* 3. MAIN CONTENT AREA (Dynamically Adjusted Margin)       */}
            {/* ======================================================== */}
            <div
                className={`relative z-10 flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isCollapsed ? 'md:ml-[76px]' : 'md:ml-64'
                }`}
            >
                {/* Top App Bar */}
                <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-surface-variant/60 dark:border-white/10 bg-surface-container-lowest/85 dark:bg-[#0D1836]/85 px-4 sm:px-6 md:px-8 backdrop-blur-md transition-colors duration-300">
                    {/* Left: Mobile Trigger / Desktop Toggle + Breadcrumbs */}
                    <div className="flex items-center gap-3 sm:gap-4">
                        {/* Mobile Menu Button */}
                        <motion.button
                            type="button"
                            onClick={() => setSidebarOpen(true)}
                            whileTap={{ scale: 0.92 }}
                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-on-surface dark:text-white hover:bg-surface-container dark:hover:bg-white/10 transition-colors md:hidden shadow-xs"
                            aria-label="Buka Menu Sidebar"
                        >
                            <span className="material-symbols-outlined text-[22px]">menu</span>
                        </motion.button>

                        {/* Desktop Quick Toggle Button */}
                        <motion.button
                            type="button"
                            onClick={toggleCollapse}
                            whileTap={{ scale: 0.92 }}
                            className="hidden md:flex h-10 w-10 items-center justify-center rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-on-surface-variant dark:text-slate-200 hover:text-on-surface dark:hover:text-white hover:bg-surface-container dark:hover:bg-white/10 hover:border-outline-variant dark:hover:border-white/20 transition-all shadow-xs"
                            title={isCollapsed ? 'Perluas Sidebar (Alt + S)' : 'Ciutkan Sidebar (Alt + S)'}
                            aria-label="Toggle Sidebar"
                        >
                            <span className="material-symbols-outlined text-[20px]">
                                {isCollapsed ? 'menu_open' : 'menu'}
                            </span>
                        </motion.button>

                        {/* Title & Portal Badge */}
                        <div className="flex items-center gap-2.5">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-base sm:text-lg font-bold text-deep-navy dark:text-white tracking-tight leading-tight">
                                        Portal Presensi Biometrik
                                    </h1>
                                    <span className="hidden sm:inline-flex items-center rounded-full border border-sky-accent/30 bg-sky-accent/10 dark:bg-sky-accent/15 px-2 py-0.5 text-[10px] font-bold text-royal-blue dark:text-sky-300">
                                        FaceNet + EMAR
                                    </span>
                                </div>
                                <span className="text-[11px] text-on-surface-variant dark:text-slate-400 hidden sm:block">
                                    SMK Al-Madani Pontianak · Analisis Kinerja Liveness
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Theme Switcher, History & User Menu */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Theme Switcher (Desktop & Tablet) */}
                        <ThemeSwitcher size="sm" className="hidden sm:flex" />

                        {/* Riwayat Quick Button */}
                        <Link
                            href={route('attendance.history')}
                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-white/5 text-on-surface-variant dark:text-slate-200 hover:text-royal-blue dark:hover:text-sky-300 hover:border-royal-blue/30 hover:bg-surface-container dark:hover:bg-white/10 transition-all active:scale-95 hidden sm:flex shadow-xs"
                            title="Riwayat Presensi"
                        >
                            <span className="material-symbols-outlined text-[20px]">history</span>
                        </Link>

                        {/* User Profile Avatar Link */}
                        <Link
                            href={route('profile.edit')}
                            className="flex items-center gap-2 rounded-2xl p-1 sm:px-2.5 sm:py-1.5 text-on-surface dark:text-white hover:bg-surface-container dark:hover:bg-white/5 transition-colors focus:ring-2 focus:ring-royal-blue/20"
                            title="Pengaturan Profil"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-deep-navy to-royal-blue dark:from-sky-500 dark:to-royal-blue text-white text-xs font-bold ring-2 ring-sky-accent/30 shadow-xs">
                                {user.name ? user.name.substring(0, 2).toUpperCase() : 'AD'}
                            </div>
                            <div className="hidden lg:flex flex-col text-left">
                                <span className="text-xs font-bold text-deep-navy dark:text-white truncate max-w-[120px]">
                                    {user.name}
                                </span>
                                <span className="text-[10px] text-on-surface-variant dark:text-slate-400 capitalize">
                                    {user.role || 'Admin'}
                                </span>
                            </div>
                        </Link>
                    </div>
                </header>

                {/* Page Header (if provided by view) */}
                {header && (
                    <div className="border-b border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0D1836] shadow-xs">
                        <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 md:px-8">
                            {header}
                        </div>
                    </div>
                )}

                {/* Page Content View (with bottom padding for mobile bottom bar) */}
                <main className="flex-1 pb-20 md:pb-6">{children}</main>
            </div>

            {/* ======================================================== */}
            {/* 4. MOBILE BOTTOM FLOATING DOCK (Thumb Ergonomics)        */}
            {/* ======================================================== */}
            <nav
                aria-label="Navigasi Bawah Mobile"
                className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#071026]/90 px-2 backdrop-blur-xl md:hidden shadow-[0_-4px_25px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_25px_rgba(0,0,0,0.5)]"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                {/* 1. Dashboard Tab */}
                <Link
                    href={route('dashboard')}
                    className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                        route().current('dashboard')
                            ? 'text-royal-blue dark:text-sky-300 font-bold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-deep-navy dark:hover:text-white'
                    }`}
                >
                    <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ fontVariationSettings: route().current('dashboard') ? "'FILL' 1" : "'FILL' 0" }}
                    >
                        dashboard
                    </span>
                    <span className="text-[10px] font-medium mt-0.5">Beranda</span>
                </Link>

                {/* 2. Riwayat Tab */}
                <Link
                    href={route('attendance.history')}
                    className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                        route().current('attendance.history') || route().current('attendance.show')
                            ? 'text-royal-blue dark:text-sky-300 font-bold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-deep-navy dark:hover:text-white'
                    }`}
                >
                    <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ fontVariationSettings: route().current('attendance.history') ? "'FILL' 1" : "'FILL' 0" }}
                    >
                        history
                    </span>
                    <span className="text-[10px] font-medium mt-0.5">Riwayat</span>
                </Link>

                {/* 3. Center Elevated Floating Camera Button */}
                <div className="flex items-center justify-center px-2 -mt-5">
                    <Link
                        href={route('presensi')}
                        className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-accent via-royal-blue to-indigo-700 text-white shadow-lg shadow-royal-blue/40 border-2 border-white dark:border-[#071026] active:scale-90 transition-transform"
                        title="Buka Kamera Presensi"
                    >
                        <span className="material-symbols-outlined text-[26px]">document_scanner</span>
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                    </Link>
                </div>

                {/* 4. Teacher List (Admin) / Enrollment (Teacher) */}
                {user.role === 'admin' ? (
                    <Link
                        href={route('admin.teachers.index')}
                        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                            route().current('admin.teachers.*')
                                ? 'text-royal-blue dark:text-sky-300 font-bold'
                                : 'text-slate-500 dark:text-slate-400 hover:text-deep-navy dark:hover:text-white'
                        }`}
                    >
                        <span
                            className="material-symbols-outlined text-[22px]"
                            style={{ fontVariationSettings: route().current('admin.teachers.*') ? "'FILL' 1" : "'FILL' 0" }}
                        >
                            group
                        </span>
                        <span className="text-[10px] font-medium mt-0.5">Guru</span>
                    </Link>
                ) : (
                    <Link
                        href={route('teacher.enrollment')}
                        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                            route().current('teacher.enrollment')
                                ? 'text-royal-blue dark:text-sky-300 font-bold'
                                : 'text-slate-500 dark:text-slate-400 hover:text-deep-navy dark:hover:text-white'
                        }`}
                    >
                        <span
                            className="material-symbols-outlined text-[22px]"
                            style={{ fontVariationSettings: route().current('teacher.enrollment') ? "'FILL' 1" : "'FILL' 0" }}
                        >
                            face
                        </span>
                        <span className="text-[10px] font-medium mt-0.5">Wajah</span>
                    </Link>
                )}

                {/* 5. More Menu Button (Opens full mobile drawer) */}
                <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="flex flex-col items-center justify-center flex-1 py-1 text-slate-500 dark:text-slate-400 hover:text-deep-navy dark:hover:text-white transition-all active:scale-95"
                >
                    <span className="material-symbols-outlined text-[22px]">menu</span>
                    <span className="text-[10px] font-medium mt-0.5">Menu</span>
                </button>
            </nav>
        </div>
    );
}
