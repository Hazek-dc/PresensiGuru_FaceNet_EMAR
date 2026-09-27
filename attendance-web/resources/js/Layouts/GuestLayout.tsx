import DynamicBackdrop from '@/Components/DynamicBackdrop';
import ThemeSwitcher from '@/Components/ThemeSwitcher';
import { Link } from '@inertiajs/react';
import { AnimatePresence, motion } from 'motion/react';
import { PropsWithChildren, useState } from 'react';

interface GuestProps extends PropsWithChildren {
    maxWidth?: string;
    noCardWrap?: boolean;
}

export default function Guest({
    children,
    maxWidth = 'max-w-md',
    noCardWrap = false,
}: GuestProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-surface dark:bg-[#070D1A] text-on-surface dark:text-slate-100 transition-colors duration-300">
            {/* Dynamic Backdrop Aurora (Ambient Blur Spheres) & Cyber Dot-Matrix */}
            <DynamicBackdrop />

            {/* Top Navigation Bar */}
            <header className="relative z-20 w-full border-b border-outline-variant/30 dark:border-white/5 bg-white/60 dark:bg-slate-950/60 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6 sm:py-3">
                    {/* Brand Logo & Title */}
                    <Link
                        href="/"
                        className="group flex items-center gap-2.5 sm:gap-3 focus:outline-none"
                    >
                        <motion.div
                            whileHover={{ scale: 1.06 }}
                            whileTap={{ scale: 0.95 }}
                            className="relative flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-white p-1 shadow-md shadow-royal-blue/15 dark:shadow-[0_0_18px_rgba(56,189,248,0.25)] border border-slate-200/80 dark:border-sky-400/40 ring-1 ring-royal-blue/20 dark:ring-sky-400/30 transition-transform duration-300"
                        >
                            <img
                                src="/images/logo-smk-al-madani.png"
                                alt="Logo SMK Al-Madani Pontianak"
                                className="h-full w-full object-contain filter drop-shadow-xs"
                                loading="eager"
                            />
                        </motion.div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm sm:text-base font-extrabold tracking-tight text-deep-navy dark:text-white">
                                    SMK Al-Madani
                                </span>
                                <span className="hidden xs:inline-block rounded-md bg-royal-blue/10 dark:bg-sky-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-royal-blue dark:text-sky-300">
                                    Pontianak
                                </span>
                            </div>
                            <span className="text-[10px] sm:text-xs text-on-surface-variant dark:text-slate-400 font-medium hidden sm:block">
                                Presensi Biometrik Wajah · FaceNet + EMAR
                            </span>
                        </div>
                    </Link>

                    {/* Right Action: Desktop Links + Theme Switcher */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Desktop Presensi Link */}
                        <Link
                            href={route('presensi')}
                            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/50 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-deep-navy dark:text-slate-200 shadow-xs hover:bg-white dark:hover:bg-white/10 active:scale-95 transition-all"
                        >
                            <span className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-300">
                                photo_camera
                            </span>
                            <span>Kamera Presensi</span>
                        </Link>

                        <ThemeSwitcher size="sm" />

                        {/* Mobile Menu Toggle */}
                        <motion.button
                            type="button"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            whileTap={{ scale: 0.9 }}
                            className="sm:hidden flex items-center justify-center h-9 w-9 rounded-xl border border-outline-variant/50 dark:border-white/10 bg-white/70 dark:bg-white/5 text-on-surface-variant dark:text-slate-300 transition-all active:bg-surface-container-high"
                            aria-label="Toggle menu"
                        >
                            <span className="material-symbols-outlined text-[20px]">
                                {mobileMenuOpen ? 'close' : 'menu'}
                            </span>
                        </motion.button>
                    </div>
                </div>

                {/* Mobile Dropdown Menu */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="sm:hidden overflow-hidden border-t border-outline-variant/20 dark:border-white/5 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl"
                        >
                            <div className="px-3 py-3 space-y-1.5">
                                <Link
                                    href={route('presensi')}
                                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 min-h-[44px] text-xs font-semibold text-deep-navy dark:text-slate-200 hover:bg-surface-container-high/60 dark:hover:bg-white/5 transition-colors"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <span className="material-symbols-outlined text-[18px] text-royal-blue dark:text-sky-300">
                                        photo_camera
                                    </span>
                                    <div className="flex flex-col">
                                        <span>Kamera Presensi</span>
                                        <span className="text-[10px] font-normal text-on-surface-variant dark:text-slate-400">
                                            Buka scanner tanpa login
                                        </span>
                                    </div>
                                </Link>
                                <Link
                                    href={route('login')}
                                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 min-h-[44px] text-xs font-semibold text-deep-navy dark:text-slate-200 hover:bg-surface-container-high/60 dark:hover:bg-white/5 transition-colors"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <span className="material-symbols-outlined text-[18px] text-royal-blue dark:text-sky-300">
                                        login
                                    </span>
                                    <div className="flex flex-col">
                                        <span>Masuk Admin / Guru</span>
                                        <span className="text-[10px] font-normal text-on-surface-variant dark:text-slate-400">
                                            Login ke portal presensi
                                        </span>
                                    </div>
                                </Link>
                                {/* Subtitle in mobile menu */}
                                <div className="pt-2 pb-1 px-3 text-[10px] text-on-surface-variant/60 dark:text-slate-500 font-medium">
                                    Presensi Biometrik Wajah · FaceNet + EMAR
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </header>

            {/* Main Content Area */}
            <main className="relative z-10 flex flex-1 items-center justify-center px-3 py-4 sm:px-6 sm:py-10">
                {noCardWrap ? (
                    children
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className={`w-full ${maxWidth}`}
                    >
                        <div className="overflow-hidden rounded-3xl border border-outline-variant/50 dark:border-white/10 bg-surface-container-lowest/85 dark:bg-[#111D36]/85 p-6 sm:p-8 shadow-[0_20px_50px_-15px_rgba(17,39,76,0.12)] dark:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all">
                            {children}
                        </div>
                    </motion.div>
                )}
            </main>

            {/* Bottom Footer */}
            <footer className="relative z-10 w-full py-3 sm:py-4 px-3 text-center text-[10px] sm:text-xs text-on-surface-variant/70 dark:text-slate-500">
                <p>
                    &copy; {new Date().getFullYear()} Presensi Guru • FaceNet &amp; EMAR
                </p>
            </footer>
        </div>
    );
}
