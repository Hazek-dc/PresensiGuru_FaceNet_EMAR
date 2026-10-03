import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { avatarFileError, TeacherAvatar, teacherInitials } from '../TeacherAvatar';

vi.mock('@inertiajs/react', () => ({ router: { post: vi.fn(), delete: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('foto profil guru', () => {
    it('inisial dari nama depan dan belakang', () => {
        expect(teacherInitials('Sinta Yulisma, S.Pd')).toBe('SS');
        expect(teacherInitials('Maulidia')).toBe('MA');
        expect(teacherInitials('  ')).toBe('?');
    });

    it('menolak format dan ukuran yang tidak diterima server', () => {
        expect(avatarFileError(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe('Format foto harus JPG, PNG, atau WebP.');
        const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'b.jpg', { type: 'image/jpeg' });
        expect(avatarFileError(big)).toBe('Ukuran foto paling besar 2 MB.');
        expect(avatarFileError(new File(['x'], 'c.webp', { type: 'image/webp' }))).toBeNull();
    });

    it('kembali ke inisial bila foto gagal dimuat', () => {
        const container = document.createElement('div');
        const root = createRoot(container);
        act(() => root.render(<TeacherAvatar name="Sinta Yulisma" url="/admin/teachers/1/avatar?v=1" />));
        const img = container.querySelector('img')!;
        expect(img).not.toBeNull();
        act(() => {
            img.dispatchEvent(new Event('error'));
        });
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toBe('SY');
        act(() => root.unmount());
    });
});
