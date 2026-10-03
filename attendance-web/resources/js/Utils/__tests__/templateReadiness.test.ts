import { describe, expect, it } from 'vitest';
import { readinessOf } from '../templateReadiness';

const base = { enrolled: true, source: 'photo' as const, n_sessions: 1, webcam_sessions: 0, enrolled_at: null };

describe('kesiapan template wajah guru', () => {
    it('belum terdaftar: presensi pasti ditolak, pendaftaran mengganti', () => {
        expect(readinessOf(null, true)).toMatchObject({ level: 'none', enrollMode: 'replace' });
        expect(readinessOf({ ...base, enrolled: false }, true).level).toBe('none');
    });

    it('template foto saja: belum siap untuk webcam', () => {
        expect(readinessOf(base, true)).toMatchObject({ level: 'photo', enrollMode: 'replace' });
    });

    it('ada sesi webcam: siap, pendaftaran berikutnya menambah sesi', () => {
        const r = readinessOf({ ...base, source: 'webcam', n_sessions: 2, webcam_sessions: 1 }, true);
        expect(r).toMatchObject({ level: 'ready', enrollMode: 'append' });
        expect(r.label).toContain('2 sesi');
    });

    it('mesin tidak terhubung: status tidak diketahui, bukan siap', () => {
        expect(readinessOf(base, false).level).toBe('unknown');
        expect(readinessOf(undefined, true).level).toBe('unknown');
    });
});
