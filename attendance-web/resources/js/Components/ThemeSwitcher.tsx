import { useTheme } from '@/Hooks/useTheme';
import React, { memo } from 'react';

interface ThemeSwitcherProps {
    className?: string;
    size?: 'sm' | 'md';
}

function ThemeSwitcherComponent({ className = '', size = 'md' }: ThemeSwitcherProps) {
    const { isDark, toggleTheme } = useTheme();

    const isSmall = size === 'sm';

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        toggleTheme();
    };

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label={isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
            title={isDark ? 'Mode Gelap Aktif (Klik untuk Terang)' : 'Mode Terang Aktif (Klik untuk Gelap)'}
            onClick={handleClick}
            className={`relative flex items-center shrink-0 cursor-pointer select-none rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent active:scale-95 ${
                isSmall ? 'h-[34px] w-[68px] p-1' : 'h-[42px] w-[86px] p-1.5'
            } ${
                isDark
                    ? 'bg-[#151B2E]/90 border border-white/10 shadow-[inset_0_2px_5px_rgba(0,0,0,0.6),inset_0_-1px_2px_rgba(255,255,255,0.05),0_4px_18px_rgba(0,0,0,0.45)]'
                    : 'bg-[#BBD4F8]/80 border border-white/80 shadow-[inset_0_2px_5px_rgba(255,255,255,0.8),inset_0_-2px_4px_rgba(75,146,219,0.15),0_4px_16px_rgba(75,146,219,0.22)]'
            } backdrop-blur-md ${className}`}
        >
            {/* Background Static Icon Guides */}
            <div className="absolute inset-0 flex items-center justify-between pointer-events-none px-1">
                {/* Left Slot: Sun placeholder (shown when dark mode is on, faded when light) */}
                <div className="flex-1 flex items-center justify-center">
                    <div
                        className={`flex items-center justify-center text-slate-400 transition-all duration-200 ${
                            isDark ? 'opacity-65 scale-95 rotate-0' : 'opacity-0 scale-70 -rotate-45'
                        }`}
                    >
                        <SunIcon isSmall={isSmall} />
                    </div>
                </div>

                {/* Right Slot: Moon placeholder (shown when light mode is on, faded when dark) */}
                <div className="flex-1 flex items-center justify-center">
                    <div
                        className={`flex items-center justify-center text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-all duration-200 ${
                            isDark ? 'opacity-0 scale-70 rotate-45' : 'opacity-80 scale-95 rotate-0'
                        }`}
                    >
                        <MoonIcon isSmall={isSmall} />
                    </div>
                </div>
            </div>

            {/* Elevated Sliding Pill Thumb (Pure GPU-accelerated CSS transition) */}
            <div
                className={`relative z-10 flex h-full w-[calc(50%-1px)] items-center justify-center rounded-full transform-gpu will-change-transform transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isDark
                        ? isSmall
                            ? 'translate-x-[calc(100%+2px)] bg-gradient-to-b from-[#2E3A54] via-[#232D44] to-[#192236] border border-white/15 shadow-[0_4px_14px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-1px_2px_rgba(0,0,0,0.3)]'
                            : 'translate-x-[calc(100%+3px)] bg-gradient-to-b from-[#2E3A54] via-[#232D44] to-[#192236] border border-white/15 shadow-[0_4px_14px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-1px_2px_rgba(0,0,0,0.3)]'
                        : 'translate-x-0 bg-gradient-to-b from-white via-white/95 to-white/90 border border-white shadow-[0_4px_14px_rgba(30,58,138,0.2),inset_0_1px_2px_rgba(255,255,255,1),inset_0_-1px_2px_rgba(0,0,0,0.05)]'
                }`}
            >
                {/* Active Icon Inside Thumb */}
                <div className="relative flex items-center justify-center">
                    {/* Sun Icon for Light Mode */}
                    <div
                        className={`absolute flex items-center justify-center text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.6)] transform-gpu transition-all duration-200 ${
                            isDark ? 'opacity-0 scale-50 rotate-90 pointer-events-none' : 'opacity-100 scale-100 rotate-0'
                        }`}
                    >
                        <SunIcon isSmall={isSmall} filled />
                    </div>

                    {/* Moon Icon for Dark Mode */}
                    <div
                        className={`flex items-center justify-center text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)] transform-gpu transition-all duration-200 ${
                            isDark ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90 pointer-events-none'
                        }`}
                    >
                        <MoonIcon isSmall={isSmall} />
                    </div>
                </div>
            </div>
        </button>
    );
}

// Clean SVG Sun Component with 8 radiant rays
function SunIcon({ isSmall = false, filled = false }: { isSmall?: boolean; filled?: boolean }) {
    return (
        <svg
            className={`${isSmall ? 'w-4 h-4' : 'w-5 h-5'} transition-transform duration-200`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="4.2" fill={filled ? 'currentColor' : 'none'} />
            <path d="M12 2.5v2" />
            <path d="M12 19.5v2" />
            <path d="m5.2 5.2 1.4 1.4" />
            <path d="m17.4 17.4 1.4 1.4" />
            <path d="M2.5 12h2" />
            <path d="M19.5 12h2" />
            <path d="m6.6 17.4-1.4 1.4" />
            <path d="m18.8 5.2-1.4 1.4" />
        </svg>
    );
}

// Clean SVG Crescent Moon Component
function MoonIcon({ isSmall = false }: { isSmall?: boolean }) {
    return (
        <svg
            className={`${isSmall ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'} transition-transform duration-200`}
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
    );
}

export default memo(ThemeSwitcherComponent);
