import { act, ComponentProps } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Index from '../Pages/Admin/Teachers/Index';

// Berkas ini di luar Pages/ karena app.tsx memuat semua Pages/**/*.tsx ke bundle.

vi.mock('../Layouts/AuthenticatedLayout', () => ({
    default: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ href, children }: { href: string; children?: unknown }) => <a href={href}>{children as never}</a>,
    router: { get: vi.fn() },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { route: (name: string, param?: unknown) => string }).route = (name, param) =>
    param === undefined ? `/${name}` : `/${name}/${String(param)}`;

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

function page(data: unknown[], filters: Record<string, unknown>): ComponentProps<typeof Index> {
    return {
        teachers: { data, links: [], total: data.length, from: data.length ? 1 : null, to: data.length || null, current_page: 1, last_page: 1 },
        counts: { all: data.length },
        filters,
    } as unknown as ComponentProps<typeof Index>;
}

const sinta = { id: 13, name: 'Sinta Yulisma, S.Pd', email: 'sinta@sekolah.test', embedding_id: 'S13', today_status: null };

describe('halaman daftar guru', () => {
    it('menandai kata pencarian yang diterapkan pada nama', () => {
        act(() => root.render(<Index {...page([sinta], { search: 'sin' })} />));
        const marks = Array.from(container.querySelectorAll('mark')).map((m) => m.textContent);
        expect(marks).toContain('Sin');
        expect(container.textContent).toContain('1 guru cocok');
    });

    it('kartu menampilkan jabatan dan bidang studi yang tersimpan, bukan isian contoh', () => {
        const guru = { ...sinta, position: 'guru', subjects: ['Matematika', 'Sejarah Indonesia'] };
        const kosong = { ...sinta, id: 14, name: 'Belum Diatur', email: 'b@sekolah.test', position: null, subjects: null };
        act(() => root.render(<Index {...page([guru, kosong], { search: 'sejarah' })} />));
        expect(container.textContent).toContain('Guru');
        expect(container.textContent).toContain('Matematika, Sejarah Indonesia');
        expect(container.textContent).toContain('Belum diisi');
        expect(container.textContent).not.toContain('Guru Mata Pelajaran');
        expect(Array.from(container.querySelectorAll('mark')).map((m) => m.textContent)).toContain('Sejarah');
    });

    it('hasil saringan kosong menjelaskan kata dan status yang dipakai', () => {
        act(() => root.render(<Index {...page([], { search: 'xyz', status: 'hadir' })} />));
        expect(container.textContent).toContain('Tidak ada guru yang cocok');
        expect(container.textContent).toContain(
            'Tidak ada guru berstatus hadir hari ini yang nama, email, ID wajah, atau bidang studinya memuat “xyz”.',
        );

        act(() => root.render(<Index {...page([], { status: 'staff_tu' })} />));
        expect(container.textContent).toContain('Belum ada guru dengan status jabatan Staff TU.');
    });

    it('tanpa guru sama sekali mengarahkan ke Tambah Guru, bukan ke hapus filter', () => {
        act(() => root.render(<Index {...page([], {})} />));
        expect(container.textContent).toContain('Belum ada guru');
        expect(container.textContent).not.toContain('Hapus semua filter');
        expect(container.querySelectorAll('a[href="/admin.teachers.create"]').length).toBeGreaterThan(1);
    });
});
