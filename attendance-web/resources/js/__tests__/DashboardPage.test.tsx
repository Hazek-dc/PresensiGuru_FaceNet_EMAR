import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../Pages/Dashboard';

// Berkas ini di luar Pages/ karena app.tsx memuat semua Pages/**/*.tsx ke bundle.

const reload = vi.fn();
vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ href, children }: { href: string; children?: unknown }) => <a href={href}>{children as never}</a>,
    router: { reload: (...args: unknown[]) => reload(...args), visit: vi.fn() },
    usePage: () => ({ props: { auth: { user: { id: 1, name: 'Qalwani Anugerah', role: 'admin', embedding_id: 'emb_1' } } } }),
}));

vi.mock('../Layouts/AuthenticatedLayout', () => ({
    default: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));

// Penghitung render kartu yang tidak bergantung pada jam: bukti jam tidak merender ulang halaman.
const statsCardRenders = { count: 0 };
vi.mock('../Components/Presensi/LightingStatsCard', () => ({
    LightingStatsCard: () => {
        statsCardRenders.count += 1;
        return <div data-testid="lighting-card" />;
    },
    LuxMeasurementStatus: () => null,
}));

vi.mock('../Components/Presensi/ConfirmHideActivityModal', () => ({ default: () => null }));
vi.mock('axios', () => ({ default: { post: vi.fn(), delete: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { route: (name: string, param?: unknown) => string }).route = (name, param) =>
    param === undefined ? `/${name}` : `/${name}/${String(param)}`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.useFakeTimers();
    reload.mockReset();
    statsCardRenders.count = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
});

function props(overrides: Record<string, unknown> = {}) {
    const history = Array.from({ length: 8 }, (_, i) => ({
        id: 100 - i,
        status: i % 2 ? 'terlambat' : 'hadir',
        description: 'Verifikasi presensi biometrik',
        time: '07:10',
        date_badge: 'Hari ini',
        teacher: { name: `Guru ${i + 1}`, email: '', embedding_id: `S0${i + 1}` },
        is_test_data: false,
    }));
    return {
        stats: { present: 4, late: 4, pulang: 0, izin: 0, sakit: 0, closed: 0, absent: 2, failed: 0, total_teachers: 10, enrolled_teachers: 8 },
        recent_history: history,
        recent_activities: [],
        subjects_list: [{ id: 1, name: 'Guru 1', embedding_id: 'S01' }],
        distance_stats: {},
        lighting_stats: null,
        timezone: 'Asia/Jakarta',
        today_date: '2026-10-01',
        schedule_session: null,
        schedule_matrix: [],
        ...overrides,
    };
}

const render = (p: Record<string, unknown>) => act(() => root.render(<Dashboard {...p} />));
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const buttonWith = (text: string) =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

describe('Dashboard', () => {
    it('jam berdetak tiap detik tanpa merender ulang seluruh dasbor', () => {
        render(props());
        const rendersAfterMount = statsCardRenders.count;
        const clockBefore = container.textContent;

        act(() => vi.advanceTimersByTime(5000));

        expect(statsCardRenders.count).toBe(rendersAfterMount);
        expect(container.textContent).not.toBe(clockBefore);
    });

    it('dialog Hapus Semua menampilkan jumlah sebenarnya dari server, bukan panjang daftar', () => {
        render(props());
        click(container.querySelector('button[aria-label="Opsi lainnya"]')!);
        click(buttonWith('Hapus Semua Aktivitas')!);

        expect(reload).toHaveBeenCalledWith({ only: ['clear_all_summary'] });
        expect(container.textContent).toContain('Rekaman presensi:Menghitung…');

        render(props({ clear_all_summary: { attendance: 257, evaluations: 120, activities: 34 } }));
        expect(container.textContent).toContain('Rekaman presensi:257 entri');
        expect(container.textContent).toContain('Matriks evaluasi uji:120 entri');
        expect(container.textContent).toContain('Log aktivitas presensi:34 entri');
        // Salinan lengkap bisa diunduh sebelum data dihapus.
        expect(container.querySelectorAll('a[href="/attendance.export.all"]')).toHaveLength(2);
    });

    it('menyediakan unduhan satu CSV berisi riwayat presensi dan log aktivitas', () => {
        render(props());
        const link = container.querySelector('a[href="/attendance.export.all"]');
        expect(link?.getAttribute('aria-label')).toBe('Unduh CSV lengkap riwayat presensi dan log aktivitas');
    });

    it('di layar kecil feed menampilkan 5 item dulu, sisanya lewat tombol', () => {
        render(props());
        const hiddenOnSmall = () => container.querySelectorAll('.hidden.lg\\:block').length;
        expect(hiddenOnSmall()).toBe(3);

        click(buttonWith('Tampilkan 3 lainnya')!);
        expect(hiddenOnSmall()).toBe(0);
        expect(buttonWith('lainnya')).toBeUndefined();
    });
});
