import { router } from '@inertiajs/react';
import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/**
 * Bahan gerak bersama untuk halaman admin (Riwayat, Manajemen Guru) agar terasa
 * seragam. Semua gerak punya tujuan: menandai data baru muncul, perubahan saringan,
 * atau pilihan aktif. Tidak ada animasi yang berulang terus. Halaman membungkusnya
 * dengan <MotionConfig reducedMotion="user"> sehingga setelan "kurangi gerakan"
 * di perangkat mematikan perpindahan dan skala.
 */

/** Pegas lembut untuk kartu dan panel: cepat di awal, berhenti tanpa memantul. */
export const SPRING_SOFT = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 } as const;

/** Pegas cepat untuk penanda pilihan (tab, chip) yang meluncur ke posisi baru. */
export const SPRING_SNAPPY = { type: 'spring', stiffness: 520, damping: 40 } as const;

/** Kontainer daftar: anak muncul bergiliran, total jeda tidak lebih dari ~0,35 detik. */
export const listVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

/** Item daftar: naik sedikit sambil muncul. */
export const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: SPRING_SOFT },
};

/** Easing keluar yang panjang (ease-out-expo) untuk angka dan bilah kemajuan. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

interface CountUpProps {
    value: number;
    decimals?: number;
    suffix?: string;
    duration?: number;
    className?: string;
}

/**
 * Angka yang menghitung naik ke nilainya, lalu dari nilai lama setiap kali datanya
 * berubah. Pembaca layar hanya membaca nilai akhir. Dengan "kurangi gerakan" aktif,
 * angka langsung tampil tanpa animasi.
 */
export function CountUp({ value, decimals = 0, suffix = '', duration = 0.9, className }: CountUpProps) {
    const reduceMotion = useReducedMotion();
    const ref = useRef<HTMLSpanElement | null>(null);
    const shown = useRef(0);
    const format = (v: number) => `${v.toFixed(decimals)}${suffix}`;

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        if (reduceMotion) {
            node.textContent = format(value);
            shown.current = value;
            return;
        }
        const controls = animate(shown.current, value, {
            duration,
            ease: EASE_OUT_EXPO,
            onUpdate: (v) => {
                shown.current = v;
                node.textContent = format(v);
            },
        });
        return () => controls.stop();
        // format hanya bergantung pada decimals dan suffix.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, decimals, suffix, duration, reduceMotion]);

    return (
        <span className={className}>
            <span ref={ref} aria-hidden="true" className="tabular-nums">
                {format(reduceMotion ? value : shown.current)}
            </span>
            <span className="sr-only">{format(value)}</span>
        </span>
    );
}

/**
 * true selama kunjungan Inertia (saring, pindah halaman) berjalan lebih lama dari
 * delayMs, untuk meredupkan daftar lama. Jeda singkat mencegah kedip pada respons cepat.
 */
export function useInertiaNavigating(delayMs = 120): boolean {
    const [navigating, setNavigating] = useState(false);

    useEffect(() => {
        // Tes merender halaman dengan router tiruan tanpa event.
        if (typeof router?.on !== 'function') return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const offStart = router.on('start', () => {
            clearTimeout(timer);
            timer = setTimeout(() => setNavigating(true), delayMs);
        });
        const offFinish = router.on('finish', () => {
            clearTimeout(timer);
            setNavigating(false);
        });
        return () => {
            clearTimeout(timer);
            offStart();
            offFinish();
        };
    }, [delayMs]);

    return navigating;
}

/** Gulir halus ke elemen (mis. awal daftar setelah pindah halaman), langsung bila "kurangi gerakan". */
export function scrollToTopOf(element: HTMLElement | null, offset = 88): void {
    if (!element || typeof window === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    if (top < window.scrollY) {
        window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
    }
}
