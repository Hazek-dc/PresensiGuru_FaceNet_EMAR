import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import History from '../Pages/Attendance/History';

// Berkas ini di luar Pages/ karena app.tsx memuat semua Pages/**/*.tsx ke bundle.

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ href, children }: { href: string; children?: unknown }) => <a href={href}>{children as never}</a>,
    router: { get: vi.fn(), reload: vi.fn(), visit: vi.fn(), delete: vi.fn() },
    usePage: () => ({ props: { auth: { user: { id: 2, name: 'Guru Satu', role: 'teacher', embedding_id: 'S01' } } } }),
}));
// Tombol ekspor berada di prop header layout.
vi.mock('../Layouts/AuthenticatedLayout', () => ({
    default: ({ header, children }: { header?: unknown; children?: unknown }) => (
        <div>
            {header as never}
            {children as never}
        </div>
    ),
}));
vi.mock('jspdf', () => ({ default: vi.fn() }));
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { route: (name: string, param?: unknown) => string }).route = (name) => `/${name}`;

const emptyPage = { data: [], links: [], total: 0, from: 0, to: 0 };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('Riwayat presensi', () => {
    it.each([false, true])('menampilkan unduhan CSV lengkap (admin: %s)', (isAdmin) => {
        act(() =>
            root.render(
                <History
                    records={emptyPage}
                    activities={emptyPage}
                    summaryStats={{ total: 0, hadir: 0, terlambat: 0, pulang: 0, izin_sakit: 0, failed: 0, success_rate: 0 }}
                    filters={{ tab: 'presensi', search: '', date: '', status: '', activity_event: '' }}
                    isAdmin={isAdmin}
                    subjectAnalysis={null}
                />,
            ),
        );
        const link = container.querySelector('a[href="/attendance.export.all"]');
        expect(link?.textContent).toContain('CSV Lengkap');
    });
});
