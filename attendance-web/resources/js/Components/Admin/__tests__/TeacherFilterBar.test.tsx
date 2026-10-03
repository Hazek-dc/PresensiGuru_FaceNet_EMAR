import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_TEACHER_FILTERS,
    highlightParts,
    normalizeTeacherFilters,
    TeacherFilters,
    teacherQuery,
} from '../../../Utils/teacherFilters';
import { TeacherFilterBar, useTeacherFilters } from '../TeacherFilterBar';

const get = vi.fn();
vi.mock('@inertiajs/react', () => ({
    router: { get: (...args: unknown[]) => get(...args) },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { route: () => string }).route = () => '/admin/teachers';

const counts = { all: 5, hadir: 2, izin: 0, sakit: 1, enrolled: 3, not_enrolled: 1, disabled: 1 };

function Harness({ initial, applied = initial }: { initial: TeacherFilters; applied?: TeacherFilters }) {
    const controls = useTeacherFilters(initial);
    return <TeacherFilterBar controls={controls} applied={applied} counts={counts} total={3} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.useFakeTimers();
    get.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
});

function mount(initial: TeacherFilters = DEFAULT_TEACHER_FILTERS, applied?: TeacherFilters) {
    act(() => root.render(<Harness initial={initial} applied={applied} />));
}

const input = () => container.querySelector('#teacher-search') as HTMLInputElement;

function type(value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
        setValue.call(input(), value);
        input().dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function chip(label: string) {
    return Array.from(container.querySelectorAll('button[aria-pressed]')).find((b) =>
        (b.getAttribute('aria-label') ?? '').startsWith(label),
    ) as HTMLButtonElement;
}

const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('pencarian dan filter guru', () => {
    it('mengetik cepat hanya mengirim satu permintaan setelah jeda, dengan muat ulang parsial', () => {
        mount();
        type('s');
        type('si');
        type('sin');
        advance(299);
        expect(get).not.toHaveBeenCalled();

        advance(1);
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith(
            '/admin/teachers',
            { search: 'sin' },
            expect.objectContaining({
                only: ['teachers', 'counts', 'filters'],
                preserveState: true,
                preserveScroll: true,
                replace: true,
            }),
        );
    });

    it('chip langsung mengirim beserta kata yang belum terkirim; klik ulang kembali ke Semua', () => {
        mount();
        type('sin');
        expect(chip('Hadir').getAttribute('aria-label')).toBe('Hadir, 2 guru');

        click(chip('Hadir'));
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][1]).toEqual({ search: 'sin', status: 'hadir' });
        expect(chip('Hadir').getAttribute('aria-pressed')).toBe('true');

        // Jeda pencarian yang tertunda sudah ikut terkirim, jadi tidak ada permintaan kedua.
        advance(1000);
        expect(get).toHaveBeenCalledTimes(1);

        click(chip('Hadir'));
        expect(get.mock.calls[1][1]).toEqual({ search: 'sin' });
        expect(chip('Semua').getAttribute('aria-pressed')).toBe('true');
    });

    it('kata yang sama dengan yang sudah diterapkan tidak dikirim ulang', () => {
        mount({ ...DEFAULT_TEACHER_FILTERS, search: 'sin' });
        type('sin ');
        advance(500);
        expect(get).not.toHaveBeenCalled();
    });

    it('"/" memfokuskan kotak cari; Escape menghapus kata yang sudah diterapkan', () => {
        mount({ ...DEFAULT_TEACHER_FILTERS, search: 'abc' });
        act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })));
        expect(document.activeElement).toBe(input());

        act(() => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        expect(input().value).toBe('');
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][1]).toEqual({});
    });

    it('urutan dikirim langsung tanpa nilai bawaan di URL', () => {
        mount();
        const select = container.querySelector('#teacher-sort') as HTMLSelectElement;
        act(() => {
            select.value = 'newest';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(get.mock.calls[0][1]).toEqual({ sort: 'newest' });
    });

    it('indikator memuat hanya dimatikan oleh kunjungan terakhir', () => {
        mount();
        const spinner = () => container.querySelector('[data-testid="teacher-search-loading"]');
        click(chip('Izin'));
        const first = get.mock.calls[0][2] as { onStart: () => void; onFinish: () => void };
        act(() => first.onStart());
        expect(spinner()).not.toBeNull();

        click(chip('Sakit'));
        const second = get.mock.calls[1][2] as { onStart: () => void; onFinish: () => void };
        act(() => {
            second.onStart();
            first.onFinish();
        });
        expect(spinner()).not.toBeNull();

        act(() => second.onFinish());
        expect(spinner()).toBeNull();
    });

    it('ringkasan mengikuti filter yang diterapkan server dan bisa dihapus sekaligus', () => {
        const applied = { ...DEFAULT_TEACHER_FILTERS, search: 'sin', status: 'hadir' as const };
        mount(applied, applied);
        expect(container.textContent).toContain('3 guru cocok');
        expect(container.textContent).toContain('“sin”');
        expect(container.textContent).toContain('Hadir hari ini');

        const clearAll = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Hapus semua filter')!;
        click(clearAll);
        expect(get.mock.calls[0][1]).toEqual({});
    });
});

describe('util filter guru', () => {
    it('menandai semua kecocokan tanpa peka huruf besar', () => {
        expect(highlightParts('Sinta Yulisma', 'sin')).toEqual([
            { text: 'Sin', match: true },
            { text: 'ta Yulisma', match: false },
        ]);
        expect(highlightParts('Ana dan ana', 'ANA').filter((p) => p.match).map((p) => p.text)).toEqual(['Ana', 'ana']);
        expect(highlightParts('Maulidia', '  ')).toEqual([{ text: 'Maulidia', match: false }]);
    });

    it('URL hanya memuat nilai selain bawaan; nilai asing dari server jatuh ke bawaan', () => {
        expect(teacherQuery({ search: '  sin ', status: '', sort: 'name', per_page: 9 })).toEqual({ search: 'sin' });
        expect(teacherQuery({ search: '', status: 'disabled', sort: 'oldest', per_page: 36 })).toEqual({
            status: 'disabled',
            sort: 'oldest',
            per_page: 36,
        });
        expect(normalizeTeacherFilters({ search: 'x', status: 'acak', sort: 'acak', per_page: '18' })).toEqual({
            search: 'x',
            status: '',
            sort: 'name',
            per_page: 18,
        });
        expect(normalizeTeacherFilters(undefined)).toEqual(DEFAULT_TEACHER_FILTERS);
    });
});
