import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { FormEventHandler, MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

/* ─── Toast Notification ─── */
interface Toast {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
    icon: string;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-[92vw] max-w-sm pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        layout
                        initial={{ opacity: 0, y: -24, scale: 0.92, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -16, scale: 0.92, filter: 'blur(4px)' }}
                        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                        className={`pointer-events-auto w-full flex items-center gap-2.5 rounded-2xl border p-3 pr-3.5 text-xs font-semibold shadow-xl backdrop-blur-2xl cursor-pointer select-none ${
                            toast.type === 'error'
                                ? 'border-rose-400/40 bg-rose-50/90 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 shadow-rose-500/15'
                                : toast.type === 'success'
                                  ? 'border-emerald-400/40 bg-emerald-50/90 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 shadow-emerald-500/15'
                                  : 'border-royal-blue/30 bg-blue-50/90 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 shadow-blue-500/15'
                        }`}
                        onClick={() => onDismiss(toast.id)}
                    >
                        <span
                            className={`material-symbols-outlined text-[18px] shrink-0 ${
                                toast.type === 'error'
                                    ? 'text-rose-500'
                                    : toast.type === 'success'
                                      ? 'text-emerald-500'
                                      : 'text-royal-blue'
                            }`}
                        >
                            {toast.icon}
                        </span>
                        <span className="flex-1 leading-snug">{toast.message}</span>
                        <span className="material-symbols-outlined text-[16px] opacity-40 shrink-0">close</span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

/* ─── Stagger animation variants ─── */
const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06, delayChildren: 0.1 },
    },
};

const staggerItem = {
    hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
    visible: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { type: 'spring' as const, stiffness: 350, damping: 24 },
    },
};

/* ─── Main Login Component ─── */
export default function Login({
    status,
    canResetPassword,
}: {
    status?: string;
    canResetPassword: boolean;
}) {
    const [showPassword, setShowPassword] = useState(false);
    const [activeDemoRole, setActiveDemoRole] = useState<'admin' | 'guru' | null>(null);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toastIdRef = useRef(0);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);

    /* ─── Toast helpers ─── */
    const pushToast = useCallback((type: Toast['type'], message: string, icon: string) => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev.slice(-2), { id, type, message, icon }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4200);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    /* Status toast on mount */
    useEffect(() => {
        if (status) {
            pushToast('success', status, 'check_circle');
        }
    }, [status, pushToast]);

    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false as boolean,
    });

    /* Show error toast when errors arrive */
    const prevErrorRef = useRef<string | undefined>();
    useEffect(() => {
        const errMsg = errors.email || errors.password;
        if (errMsg && errMsg !== prevErrorRef.current) {
            pushToast('error', 'Kredensial tidak valid. Periksa email dan kata sandi Anda.', 'error');
        }
        prevErrorRef.current = errMsg;
    }, [errors.email, errors.password, pushToast]);

    /* ─── 3D Card Tilt Physics ─── */
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [5, -5]), {
        stiffness: 260,
        damping: 22,
    });
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), {
        stiffness: 260,
        damping: 22,
    });

    const glareX = useSpring(useTransform(mouseX, [-0.5, 0.5], [0, 100]), {
        stiffness: 300,
        damping: 30,
    });
    const glareY = useSpring(useTransform(mouseY, [-0.5, 0.5], [0, 100]), {
        stiffness: 300,
        damping: 30,
    });

    const cursorGlowX = useMotionValue(0);
    const cursorGlowY = useMotionValue(0);

    const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const x = (e.clientX - rect.left) / width - 0.5;
        const y = (e.clientY - rect.top) / height - 0.5;
        mouseX.set(x);
        mouseY.set(y);
        cursorGlowX.set(e.clientX - rect.left);
        cursorGlowY.set(e.clientY - rect.top);
    };

    const handleMouseLeave = () => {
        mouseX.set(0);
        mouseY.set(0);
    };

    const handleQuickFill = (role: 'admin' | 'guru') => {
        setActiveDemoRole(role);
        const label = role === 'admin' ? 'Admin' : 'Guru (S01)';
        if (role === 'admin') {
            setData({
                email: 'admin@presensi.test',
                password: 'Presensi2026!',
                remember: true,
            });
        } else {
            setData({
                email: 'gurupresensi1@gmail.com',
                password: 'password',
                remember: true,
            });
        }
        pushToast('info', `Kredensial ${label} terisi otomatis`, 'auto_fix_high');
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    /* Card border state-based glow */
    const cardBorderClass = processing
        ? 'border-amber-400/50 dark:border-amber-400/40'
        : errors.email || errors.password
          ? 'border-rose-400/50 dark:border-rose-400/40'
          : emailFocused || passwordFocused
            ? 'border-royal-blue/50 dark:border-sky-400/40'
            : 'border-outline-variant/50 dark:border-white/10';

    return (
        <GuestLayout noCardWrap>
            <Head title="Masuk - Presensi FaceNet & EMAR" />

            {/* Toast Popup Layer */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

            <div className="w-full max-w-[92vw] xs:max-w-sm sm:max-w-md mx-auto py-3 sm:py-6 lg:py-8">
                <motion.div
                    ref={cardRef}
                    style={{
                        rotateX: isTouchDevice ? 0 : rotateX,
                        rotateY: isTouchDevice ? 0 : rotateY,
                        transformPerspective: 1000,
                        transformStyle: 'preserve-3d',
                    }}
                    onMouseMove={isTouchDevice ? undefined : handleMouseMove}
                    onMouseLeave={isTouchDevice ? undefined : handleMouseLeave}
                    initial={{ opacity: 0, y: 24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className={`relative group rounded-3xl ${cardBorderClass} border bg-surface-container-lowest/90 dark:bg-[#101A2F]/90 px-4 py-5 sm:p-8 backdrop-blur-2xl shadow-[0_25px_65px_-15px_rgba(17,39,76,0.15)] dark:shadow-[0_25px_65px_-15px_rgba(0,0,0,0.7)] transition-[border-color,box-shadow] duration-300 hover:shadow-[0_30px_80px_-15px_rgba(56,189,248,0.22)] overflow-hidden`}
                >
                    {/* Cursor-following Glow Orb (Desktop Only) */}
                    {!isTouchDevice && (
                        <motion.div
                            className="pointer-events-none absolute z-0 h-60 w-60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{
                                background:
                                    'radial-gradient(circle, rgba(56,189,248,0.12) 0%, rgba(37,99,235,0.06) 40%, transparent 70%)',
                                x: cursorGlowX,
                                y: cursorGlowY,
                                translateX: '-50%',
                                translateY: '-50%',
                            }}
                        />
                    )}

                    {/* 3D Glare Reflection Layer */}
                    <motion.div
                        className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
                        style={{
                            background: useTransform(
                                [glareX, glareY],
                                ([x, y]) =>
                                    `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.07) 0%, transparent 60%)`
                            ),
                        }}
                    />

                    {/* Card Inner Glow Ring */}
                    <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 dark:ring-white/5 z-0" />

                    {/* ─── All card content with stagger animation ─── */}
                    <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        animate="visible"
                        className="relative z-10"
                    >
                        {/* Header & Logo */}
                        <motion.div
                            variants={staggerItem}
                            className="mb-5 sm:mb-6 text-center"
                            style={{ transform: 'translateZ(25px)' }}
                        >
                            <motion.div
                                whileHover={{ scale: 1.06, rotate: 2 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                className="relative mx-auto mb-3 flex h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 items-center justify-center rounded-2xl sm:rounded-3xl bg-white p-2 sm:p-2.5 shadow-xl shadow-royal-blue/15 dark:shadow-[0_0_35px_rgba(56,189,248,0.35)] border border-slate-200/80 dark:border-sky-400/50 ring-2 ring-royal-blue/20 dark:ring-sky-400/40 cursor-default"
                            >
                                <img
                                    src="/images/logo-smk-al-madani.png"
                                    alt="Logo SMK Al-Madani Pontianak"
                                    className="h-full w-full object-contain filter drop-shadow-xs"
                                    loading="eager"
                                />
                                {/* Ambient Status Indicator */}
                                <span className="absolute -top-1 -right-1 flex h-3 w-3 sm:h-3.5 sm:w-3.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 bg-emerald-500 border-2 border-white"></span>
                                </span>
                            </motion.div>

                            <div className="inline-flex items-center gap-1.5 mb-1 px-2.5 py-0.5 rounded-full bg-royal-blue/10 dark:bg-sky-400/15 border border-royal-blue/20 dark:border-sky-400/25 text-[10px] sm:text-[11px] font-bold text-royal-blue dark:text-sky-300">
                                <span>SMK AL-MADANI PONTIANAK</span>
                            </div>

                            <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-deep-navy dark:text-white">
                                Masuk ke Portal Presensi
                            </h2>
                            <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-sm text-on-surface-variant dark:text-slate-400">
                                Verifikasi Biometrik Wajah FaceNet + EMAR
                            </p>
                        </motion.div>

                        {/* Quick 1-Click Role Auto-fill Pills */}
                        <motion.div
                            variants={staggerItem}
                            className="mb-4 sm:mb-5 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-2.5"
                            style={{ transform: 'translateZ(15px)' }}
                        >
                            <motion.button
                                type="button"
                                onClick={() => handleQuickFill('admin')}
                                whileHover={{ scale: 1.04, y: -1 }}
                                whileTap={{ scale: 0.96 }}
                                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:px-3.5 sm:py-2 rounded-xl text-[11px] font-bold transition-all min-h-[44px] sm:min-h-0 ${
                                    activeDemoRole === 'admin'
                                        ? 'bg-royal-blue text-white shadow-lg shadow-royal-blue/30 ring-2 ring-royal-blue/30'
                                        : 'bg-surface-container-high/60 dark:bg-white/5 text-on-surface-variant dark:text-slate-300 hover:bg-surface-container-high dark:hover:bg-white/10 border border-outline-variant/40 dark:border-white/10'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[15px]">
                                    admin_panel_settings
                                </span>
                                <span>Demo Admin</span>
                                {activeDemoRole === 'admin' && (
                                    <motion.span
                                        initial={{ scale: 0, rotate: -90 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        className="material-symbols-outlined text-[14px] ml-0.5"
                                    >
                                        check_circle
                                    </motion.span>
                                )}
                            </motion.button>

                            <motion.button
                                type="button"
                                onClick={() => handleQuickFill('guru')}
                                whileHover={{ scale: 1.04, y: -1 }}
                                whileTap={{ scale: 0.96 }}
                                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:px-3.5 sm:py-2 rounded-xl text-[11px] font-bold transition-all min-h-[44px] sm:min-h-0 ${
                                    activeDemoRole === 'guru'
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-500/30'
                                        : 'bg-surface-container-high/60 dark:bg-white/5 text-on-surface-variant dark:text-slate-300 hover:bg-surface-container-high dark:hover:bg-white/10 border border-outline-variant/40 dark:border-white/10'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[15px]">
                                    school
                                </span>
                                <span>Demo Guru</span>
                                {activeDemoRole === 'guru' && (
                                    <motion.span
                                        initial={{ scale: 0, rotate: -90 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        className="material-symbols-outlined text-[14px] ml-0.5"
                                    >
                                        check_circle
                                    </motion.span>
                                )}
                            </motion.button>
                        </motion.div>

                        {/* Form Fields */}
                        <form
                            onSubmit={submit}
                            className="space-y-3.5 sm:space-y-4"
                            style={{ transform: 'translateZ(20px)' }}
                        >
                            {/* Email Field */}
                            <motion.div variants={staggerItem}>
                                <label
                                    htmlFor="email"
                                    className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 transition-colors duration-200 ${
                                        emailFocused
                                            ? 'text-royal-blue dark:text-sky-300'
                                            : errors.email
                                              ? 'text-rose-600 dark:text-rose-400'
                                              : 'text-deep-navy dark:text-slate-300'
                                    }`}
                                >
                                    Alamat Email
                                </label>

                                <div className="relative group/field">
                                    {/* Focus Ring Glow */}
                                    <div
                                        className={`absolute -inset-px rounded-2xl transition-all duration-300 ${
                                            emailFocused
                                                ? 'bg-gradient-to-r from-royal-blue/30 via-sky-400/20 to-royal-blue/30 dark:from-sky-500/30 dark:via-sky-400/20 dark:to-sky-500/30 blur-[1px]'
                                                : errors.email
                                                  ? 'bg-rose-500/20 blur-[1px]'
                                                  : 'bg-transparent'
                                        }`}
                                    />
                                    <div className="relative">
                                        <div
                                            className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 transition-colors duration-200 ${
                                                emailFocused
                                                    ? 'text-royal-blue dark:text-sky-300'
                                                    : errors.email
                                                      ? 'text-rose-500'
                                                      : 'text-on-surface-variant dark:text-slate-400'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">
                                                mail
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
                                            onFocus={() => setEmailFocused(true)}
                                            onBlur={() => setEmailFocused(false)}
                                            onChange={(e) => setData('email', e.target.value)}
                                            className={`block w-full rounded-2xl border bg-surface-container-lowest/95 dark:bg-slate-900/80 pl-10 pr-4 py-3 sm:py-3.5 text-xs sm:text-sm text-deep-navy dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-xs transition-all duration-200 focus:outline-none focus:ring-0 ${
                                                emailFocused
                                                    ? 'border-royal-blue dark:border-sky-400 shadow-[0_0_0_3px_rgba(37,99,235,0.12)] dark:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]'
                                                    : errors.email
                                                      ? 'border-rose-400 dark:border-rose-400'
                                                      : 'border-outline-variant/60 dark:border-white/10'
                                            }`}
                                        />
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {errors.email && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0, y: -4 }}
                                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                                            exit={{ opacity: 0, height: 0, y: -4 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <InputError message={errors.email} className="mt-1.5" />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>

                            {/* Password Field */}
                            <motion.div variants={staggerItem}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label
                                        htmlFor="password"
                                        className={`block text-[11px] font-bold uppercase tracking-wider transition-colors duration-200 ${
                                            passwordFocused
                                                ? 'text-royal-blue dark:text-sky-300'
                                                : errors.password
                                                  ? 'text-rose-600 dark:text-rose-400'
                                                  : 'text-deep-navy dark:text-slate-300'
                                        }`}
                                    >
                                        Kata Sandi
                                    </label>
                                    {canResetPassword && (
                                        <Link
                                            href={route('password.request')}
                                            className="text-[11px] font-semibold text-royal-blue dark:text-sky-300 hover:underline hover:brightness-110 focus:outline-none transition-all"
                                        >
                                            Lupa sandi?
                                        </Link>
                                    )}
                                </div>

                                <div className="relative group/field">
                                    {/* Focus Ring Glow */}
                                    <div
                                        className={`absolute -inset-px rounded-2xl transition-all duration-300 ${
                                            passwordFocused
                                                ? 'bg-gradient-to-r from-royal-blue/30 via-sky-400/20 to-royal-blue/30 dark:from-sky-500/30 dark:via-sky-400/20 dark:to-sky-500/30 blur-[1px]'
                                                : errors.password
                                                  ? 'bg-rose-500/20 blur-[1px]'
                                                  : 'bg-transparent'
                                        }`}
                                    />
                                    <div className="relative">
                                        <div
                                            className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 transition-colors duration-200 ${
                                                passwordFocused
                                                    ? 'text-royal-blue dark:text-sky-300'
                                                    : errors.password
                                                      ? 'text-rose-500'
                                                      : 'text-on-surface-variant dark:text-slate-400'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">
                                                lock
                                            </span>
                                        </div>
                                        <input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={data.password}
                                            placeholder="••••••••"
                                            autoComplete="current-password"
                                            onFocus={() => setPasswordFocused(true)}
                                            onBlur={() => setPasswordFocused(false)}
                                            onChange={(e) => setData('password', e.target.value)}
                                            className={`block w-full rounded-2xl border bg-surface-container-lowest/95 dark:bg-slate-900/80 pl-10 pr-12 py-3 sm:py-3.5 text-xs sm:text-sm text-deep-navy dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-xs transition-all duration-200 focus:outline-none focus:ring-0 ${
                                                passwordFocused
                                                    ? 'border-royal-blue dark:border-sky-400 shadow-[0_0_0_3px_rgba(37,99,235,0.12)] dark:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]'
                                                    : errors.password
                                                      ? 'border-rose-400 dark:border-rose-400'
                                                      : 'border-outline-variant/60 dark:border-white/10'
                                            }`}
                                        />
                                        <motion.button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            whileHover={{ scale: 1.15 }}
                                            whileTap={{ scale: 0.9 }}
                                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-on-surface-variant dark:text-slate-400 hover:text-deep-navy dark:hover:text-white transition-colors focus:outline-none min-w-[44px] justify-end"
                                            title={
                                                showPassword
                                                    ? 'Sembunyikan Kata Sandi'
                                                    : 'Tampilkan Kata Sandi'
                                            }
                                        >
                                            <AnimatePresence mode="wait">
                                                <motion.span
                                                    key={showPassword ? 'off' : 'on'}
                                                    initial={{ scale: 0.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0.5, opacity: 0 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="material-symbols-outlined text-[18px]"
                                                >
                                                    {showPassword ? 'visibility_off' : 'visibility'}
                                                </motion.span>
                                            </AnimatePresence>
                                        </motion.button>
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {errors.password && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0, y: -4 }}
                                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                                            exit={{ opacity: 0, height: 0, y: -4 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <InputError message={errors.password} className="mt-1.5" />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>

                            {/* Remember Me */}
                            <motion.div variants={staggerItem} className="flex items-center justify-between pt-0.5">
                                <label className="flex items-center gap-2.5 cursor-pointer select-none min-h-[44px] sm:min-h-0 group/check">
                                    <Checkbox
                                        name="remember"
                                        checked={data.remember}
                                        onChange={(e) =>
                                            setData(
                                                'remember',
                                                (e.target.checked || false) as false,
                                            )
                                        }
                                        className="rounded-lg border-outline-variant/80 dark:border-white/20 text-royal-blue focus:ring-royal-blue/30 shrink-0 transition-all group-hover/check:border-royal-blue dark:group-hover/check:border-sky-400"
                                    />
                                    <span className="text-[11px] sm:text-xs font-medium text-on-surface-variant dark:text-slate-300 group-hover/check:text-deep-navy dark:group-hover/check:text-white transition-colors">
                                        Ingat sesi saya
                                    </span>
                                </label>
                            </motion.div>

                            {/* Submit CTA Button */}
                            <motion.div variants={staggerItem} className="pt-1.5 sm:pt-2">
                                <motion.button
                                    type="submit"
                                    disabled={processing}
                                    whileHover={processing ? {} : { scale: 1.015, y: -1 }}
                                    whileTap={processing ? {} : { scale: 0.975, y: 1 }}
                                    className={`group/btn relative flex w-full items-center justify-center gap-2 rounded-2xl py-3 sm:py-3.5 px-4 text-xs sm:text-sm font-bold text-white min-h-[48px] sm:min-h-[50px] transition-all duration-200 overflow-hidden ${
                                        processing
                                            ? 'bg-amber-500 shadow-[0_10px_25px_-5px_rgba(245,158,11,0.4)] cursor-wait'
                                            : 'bg-gradient-to-r from-royal-blue via-blue-600 to-indigo-700 dark:from-sky-500 dark:via-royal-blue dark:to-blue-700 shadow-[0_10px_30px_-5px_rgba(2,132,199,0.45)] hover:shadow-[0_18px_40px_-5px_rgba(2,132,199,0.55)] active:shadow-[0_5px_15px_-5px_rgba(2,132,199,0.4)]'
                                    }`}
                                >
                                    {/* Shimmer Sweep Effect on Hover */}
                                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 ease-out" />
                                    </div>

                                    <AnimatePresence mode="wait">
                                        {processing ? (
                                            <motion.span
                                                key="loading"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                className="flex items-center gap-2"
                                            >
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                <span>Memverifikasi...</span>
                                            </motion.span>
                                        ) : (
                                            <motion.span
                                                key="idle"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                className="flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">
                                                    login
                                                </span>
                                                <span>Masuk ke Dashboard</span>
                                                <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover/btn:translate-x-1">
                                                    arrow_forward
                                                </span>
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </motion.button>
                            </motion.div>
                        </form>

                        {/* Subtle Divider */}
                        <motion.div variants={staggerItem} className="my-5 sm:my-6 flex items-center justify-center">
                            <div className="w-full border-t border-outline-variant/40 dark:border-white/10" />
                            <span className="absolute bg-surface-container-lowest dark:bg-[#101A2F] px-3 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 dark:text-slate-400">
                                atau
                            </span>
                        </motion.div>

                        {/* Quick Camera Attendance Portal CTA */}
                        <motion.div
                            variants={staggerItem}
                            style={{ transform: 'translateZ(15px)' }}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                        >
                            <Link
                                href={route('presensi')}
                                className="group/cam relative flex w-full items-center justify-between rounded-2xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-high/30 dark:bg-white/5 p-3.5 sm:p-4 text-left hover:bg-surface-container-high/60 dark:hover:bg-white/10 hover:border-royal-blue/30 dark:hover:border-sky-500/30 transition-all min-h-[56px] sm:min-h-[60px] overflow-hidden"
                            >
                                {/* Hover Accent Shimmer */}
                                <div className="pointer-events-none absolute inset-0 opacity-0 group-hover/cam:opacity-100 transition-opacity duration-300">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-sky-400/5 to-transparent" />
                                </div>

                                <div className="relative flex items-center gap-3 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-accent/20 to-royal-blue/20 dark:from-sky-500/20 dark:to-blue-500/15 text-royal-blue dark:text-sky-300 border border-sky-400/20 transition-transform duration-200 group-hover/cam:scale-105">
                                        <span className="material-symbols-outlined text-[20px]">
                                            photo_camera
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs sm:text-sm font-bold text-deep-navy dark:text-white flex items-center gap-1.5">
                                            <span className="truncate">Presensi Wajah Cepat</span>
                                            <span className="relative flex h-2 w-2 shrink-0">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-on-surface-variant dark:text-slate-400 truncate">
                                            Buka scanner kamera tanpa login
                                        </div>
                                    </div>
                                </div>
                                <span className="relative material-symbols-outlined text-[20px] text-on-surface-variant dark:text-slate-400 transition-all duration-200 group-hover/cam:translate-x-1 group-hover/cam:text-royal-blue dark:group-hover/cam:text-sky-300">
                                    chevron_right
                                </span>
                            </Link>
                        </motion.div>

                        {/* Bottom Security Badge */}
                        <motion.div
                            variants={staggerItem}
                            className="mt-4 sm:mt-5 flex items-center justify-center gap-1.5 text-[9px] sm:text-[10px] text-on-surface-variant/60 dark:text-slate-500"
                        >
                            <span className="material-symbols-outlined text-[13px]">
                                verified_user
                            </span>
                            <span>Dienkripsi TLS 1.3 • Sesi aman 24 jam</span>
                        </motion.div>
                    </motion.div>
                </motion.div>
            </div>
        </GuestLayout>
    );
}
