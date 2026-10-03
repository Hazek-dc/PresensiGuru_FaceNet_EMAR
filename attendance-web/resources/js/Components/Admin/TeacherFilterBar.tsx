import { router } from '@inertiajs/react';
import { motion } from 'motion/react';
import {
    Fragment,
    KeyboardEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    hasActiveTeacherFilters,
    highlightParts,
    SEARCH_DEBOUNCE_MS,
    SORT_OPTIONS,
    STATUS_FILTER_LABEL,
    STATUS_FILTER_PHRASE,
    STATUS_GROUPS,
    TeacherFilters,
    teacherQuery,
    TeacherSort,
    TeacherStatusCounts,
    TeacherStatusFilter,
} from '../../Utils/teacherFilters';
import { SPRING_SNAPPY } from '../Motion';

/**
 * Status filter halaman guru. Pencarian dikirim 300 ms setelah berhenti mengetik;
 * chip, urutan, dan jumlah per halaman langsung. Hanya daftar, jumlah chip, dan
 * filter yang dimuat ulang, jadi kartu statistik dan posisi gulir tidak berubah.
 */
export function useTeacherFilters(initial: TeacherFilters) {
    const [filters, setFilters] = useState(initial);
    const [loading, setLoading] = useState(false);
    const filtersRef = useRef(initial);
    const timerRef = useRef<number | null>(null);
    const visitIdRef = useRef(0);
    const lastQueryRef = useRef(JSON.stringify(teacherQuery(initial)));

    const cancelPending = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const visit = useCallback(
        (next: TeacherFilters) => {
            cancelPending();
            const query = teacherQuery(next);
            const key = JSON.stringify(query);
            // Mengetik lalu menghapus kembali ke kata yang sama tidak perlu ke server.
            if (key === lastQueryRef.current) return;
            lastQueryRef.current = key;
            // Kunjungan baru membatalkan yang lama; hanya yang terakhir boleh mematikan indikator.
            const id = ++visitIdRef.current;
            router.get(route('admin.teachers.index'), query, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                only: ['teachers', 'counts', 'filters'],
                onStart: () => {
                    if (id === visitIdRef.current) setLoading(true);
                },
                onFinish: () => {
                    if (id === visitIdRef.current) setLoading(false);
                },
            });
        },
        [cancelPending],
    );

    const update = useCallback(
        (patch: Partial<TeacherFilters>, debounce = false) => {
            const next = { ...filtersRef.current, ...patch };
            filtersRef.current = next;
            setFilters(next);
            if (!debounce) {
                visit(next);
                return;
            }
            cancelPending();
            timerRef.current = window.setTimeout(
                () => visit(filtersRef.current),
                SEARCH_DEBOUNCE_MS,
            );
        },
        [visit, cancelPending],
    );

    useEffect(() => cancelPending, [cancelPending]);

    return {
        filters,
        loading,
        setSearch: (search: string) => update({ search }, true),
        submitSearch: () => visit(filtersRef.current),
        clearSearch: () => update({ search: '' }),
        setStatus: (status: TeacherStatusFilter) => update({ status }),
        setSort: (sort: TeacherSort) => update({ sort }),
        setPerPage: (per_page: number) => update({ per_page }),
        clearAll: () => update({ search: '', status: '' }),
    };
}

export type TeacherFilterControls = ReturnType<typeof useTeacherFilters>;

interface TeacherFilterBarProps {
    controls: TeacherFilterControls;
    /** Filter yang sudah diterapkan server; ringkasan hasil mengikuti ini, bukan ketikan yang belum terkirim. */
    applied: TeacherFilters;
    counts: TeacherStatusCounts;
    total: number;
}

export function TeacherFilterBar({
    controls,
    applied,
    counts,
    total,
}: TeacherFilterBarProps) {
    const { filters, loading } = controls;
    const inputRef = useRef<HTMLInputElement | null>(null);

    // "/" memindahkan fokus ke kotak cari dari mana saja di halaman, kecuali saat sedang mengetik.
    useEffect(() => {
        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.isContentEditable ||
                    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
            )
                return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Escape') return;
        if (filters.search) {
            e.preventDefault();
            controls.clearSearch();
        } else {
            inputRef.current?.blur();
        }
    };

    const filtered = hasActiveTeacherFilters(applied);

    return (
        <section
            aria-label="Cari dan saring guru"
            className="shadow-xs space-y-3 rounded-3xl border border-surface-variant/50 bg-surface-container-lowest p-4 dark:border-white/10 dark:bg-[#0F1B36] sm:p-5"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <form
                    role="search"
                    onSubmit={(e) => {
                        e.preventDefault();
                        controls.submitSearch();
                    }}
                    className="min-w-0 flex-1"
                >
                    <label htmlFor="teacher-search" className="sr-only">
                        Cari guru
                    </label>
                    <div className="flex min-h-[44px] items-center rounded-2xl border border-outline-variant/60 bg-surface-container-low px-3.5 transition-colors focus-within:border-royal-blue focus-within:ring-2 focus-within:ring-royal-blue/20 dark:border-white/10 dark:bg-slate-900/80 dark:focus-within:border-sky-400">
                        <span
                            aria-hidden="true"
                            className="material-symbols-outlined mr-2.5 text-[20px] text-on-surface-variant dark:text-slate-400"
                        >
                            search
                        </span>
                        <input
                            ref={inputRef}
                            id="teacher-search"
                            type="search"
                            value={filters.search}
                            onChange={(e) => controls.setSearch(e.target.value)}
                            onKeyDown={onSearchKeyDown}
                            placeholder="Cari nama, email, ID wajah, atau bidang studi"
                            autoComplete="off"
                            spellCheck={false}
                            enterKeyHint="search"
                            maxLength={100}
                            aria-keyshortcuts="/"
                            className="w-full min-w-0 self-stretch border-none bg-transparent p-0 py-2.5 text-sm text-deep-navy placeholder:text-on-surface-variant/70 focus:ring-0 dark:text-white dark:placeholder:text-slate-500 [&::-webkit-search-cancel-button]:hidden"
                        />
                        <div className="ml-2 flex shrink-0 items-center gap-1">
                            {loading && (
                                <span
                                    aria-hidden="true"
                                    data-testid="teacher-search-loading"
                                    className="material-symbols-outlined animate-spin text-[18px] text-royal-blue dark:text-sky-400"
                                >
                                    progress_activity
                                </span>
                            )}
                            {filters.search ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        controls.clearSearch();
                                        inputRef.current?.focus();
                                    }}
                                    aria-label="Hapus kata pencarian"
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-deep-navy dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                    <span className="material-symbols-outlined text-[18px]">
                                        close
                                    </span>
                                </button>
                            ) : (
                                !loading && (
                                    <kbd
                                        aria-hidden="true"
                                        title="Tekan / untuk mencari"
                                        className="hidden h-6 min-w-6 items-center justify-center rounded-md border border-outline-variant/70 px-1.5 font-sans text-[11px] font-semibold text-on-surface-variant dark:border-white/15 dark:text-slate-400 sm:inline-flex"
                                    >
                                        /
                                    </kbd>
                                )
                            )}
                        </div>
                    </div>
                </form>

                <div className="flex items-center gap-2 sm:shrink-0">
                    <label
                        htmlFor="teacher-sort"
                        className="shrink-0 text-xs font-semibold text-on-surface-variant dark:text-slate-400"
                    >
                        Urutkan
                    </label>
                    <select
                        id="teacher-sort"
                        value={filters.sort}
                        onChange={(e) =>
                            controls.setSort(e.target.value as TeacherSort)
                        }
                        className="min-h-[44px] w-full rounded-2xl border-outline-variant/60 bg-surface-container-low py-2 pl-3 pr-9 text-sm font-semibold text-deep-navy focus:border-royal-blue focus:ring-2 focus:ring-royal-blue/20 dark:border-white/10 dark:bg-slate-900/80 dark:text-white dark:[color-scheme:dark] sm:w-auto"
                    >
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Di layar sempit chip digulir ke samping; di layar lebar dibungkus ke baris berikutnya. */}
            <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
                <div
                    role="group"
                    aria-label="Saring menurut status"
                    className="flex w-max items-center gap-2 lg:w-auto lg:flex-wrap"
                >
                    {STATUS_GROUPS.map((group, gi) => (
                        <Fragment key={group.label ?? 'semua'}>
                            {gi > 0 && (
                                <span
                                    aria-hidden="true"
                                    className="mx-1 h-6 w-px shrink-0 bg-outline-variant/60 dark:bg-white/10"
                                />
                            )}
                            {group.label && (
                                <span className="shrink-0 text-xs font-medium text-on-surface-variant dark:text-slate-400">
                                    {group.label}
                                </span>
                            )}
                            {group.chips.map((chip) => {
                                const selected = filters.status === chip.value;
                                const count = counts[chip.countKey];
                                return (
                                    <button
                                        key={chip.value || 'semua'}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={
                                            count === undefined
                                                ? chip.label
                                                : `${chip.label}, ${count} guru`
                                        }
                                        // Chip yang sudah aktif diklik lagi kembali ke Semua.
                                        onClick={() =>
                                            controls.setStatus(
                                                selected && chip.value !== ''
                                                    ? ''
                                                    : chip.value,
                                            )
                                        }
                                        className={`relative inline-flex min-h-[44px] shrink-0 lg:min-h-[40px] items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-blue/60 dark:focus-visible:ring-sky-400/60 ${
                                            selected
                                                ? 'border-transparent text-white'
                                                : 'border-outline-variant/60 bg-surface-container-low text-deep-navy hover:bg-surface-container dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        {/* Latar pilihan meluncur dari chip lama ke chip baru. */}
                                        {selected && (
                                            <motion.span
                                                aria-hidden="true"
                                                layoutId="teacherStatusChipPill"
                                                transition={SPRING_SNAPPY}
                                                className="absolute inset-0 rounded-xl bg-deep-navy dark:bg-sky-600"
                                            />
                                        )}
                                        {chip.dot && (
                                            <span
                                                aria-hidden="true"
                                                className={`relative h-2 w-2 rounded-full ${chip.dot}`}
                                            />
                                        )}
                                        <span className="relative">{chip.label}</span>
                                        {count !== undefined && (
                                            <span
                                                className={`relative rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                                                    selected
                                                        ? 'bg-white/20 text-white'
                                                        : count === 0
                                                          ? 'text-on-surface-variant dark:text-slate-500'
                                                          : 'bg-surface-container-high text-deep-navy dark:bg-white/10 dark:text-slate-200'
                                                }`}
                                            >
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-outline-variant/40 pt-3 text-xs dark:border-white/10">
                <p
                    aria-live="polite"
                    className="font-semibold text-deep-navy dark:text-white"
                >
                    <span className="tabular-nums">{total}</span> guru{' '}
                    {filtered ? 'cocok' : 'terdaftar'}
                </p>
                {applied.search.trim() !== '' && (
                    <FilterToken
                        label={`“${applied.search.trim()}”`}
                        removeLabel="Hapus kata pencarian"
                        onRemove={controls.clearSearch}
                    />
                )}
                {applied.status !== '' && (
                    <FilterToken
                        label={STATUS_FILTER_LABEL[applied.status]}
                        removeLabel={`Hapus filter ${STATUS_FILTER_PHRASE[applied.status]}`}
                        onRemove={() => controls.setStatus('')}
                    />
                )}
                {filtered && (
                    <button
                        type="button"
                        onClick={controls.clearAll}
                        className="min-h-[28px] font-bold text-royal-blue hover:underline dark:text-sky-400"
                    >
                        Hapus semua filter
                    </button>
                )}
            </div>
        </section>
    );
}

function FilterToken({
    label,
    removeLabel,
    onRemove,
}: {
    label: string;
    removeLabel: string;
    onRemove: () => void;
}) {
    return (
        <span className="inline-flex max-w-full items-center gap-0.5 rounded-lg bg-royal-blue/10 py-0.5 pl-2.5 pr-0.5 font-semibold text-royal-blue dark:bg-sky-500/15 dark:text-sky-300">
            <span className="truncate">{label}</span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={removeLabel}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-royal-blue/15 dark:hover:bg-sky-500/20"
            >
                <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[14px]"
                >
                    close
                </span>
            </button>
        </span>
    );
}

/** Tandai bagian teks yang cocok dengan kata pencarian yang sedang diterapkan. */
export function HighlightMatch({
    text,
    query,
}: {
    text: string;
    query: string;
}) {
    const parts = highlightParts(text, query);
    if (!parts.some((part) => part.match)) return <>{text}</>;
    return (
        <>
            {parts.map((part, i) =>
                part.match ? (
                    <mark
                        key={i}
                        className="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30"
                    >
                        {part.text}
                    </mark>
                ) : (
                    <Fragment key={i}>{part.text}</Fragment>
                ),
            )}
        </>
    );
}
