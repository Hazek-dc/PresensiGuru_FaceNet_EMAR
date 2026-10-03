import { describe, expect, it } from 'vitest';
import {
    classifyLighting,
    estimateLux,
    LUX_PROBE_MAX_AGE_MS,
    luxProbeFormFields,
    luxReadingForSubmit,
    lumaStats,
    median,
    type LuxProbeResult,
} from '../luxCalibration';

describe('klasifikasi pencahayaan (sama dengan LightingModel.php)', () => {
    it.each([
        [50, 'LOW', 'WARNING'],
        [100, 'STANDARD', 'VALID'],
        [150, 'STANDARD', 'VALID'],
        [200, 'OPTIMAL', 'READY'],
        [250, 'OPTIMAL', 'READY'],
        // Tabel PRD menulis VALID, aturan kodenya (200 <= lux <= 300) memberi READY.
        [300, 'OPTIMAL', 'READY'],
        [500, 'HIGH', 'MONITOR'],
        [99.9, 'LOW', 'WARNING'],
        [199.9, 'STANDARD', 'VALID'],
        [300.1, 'HIGH', 'MONITOR'],
    ])('%s lux -> %s %s', (lux, category, status) => {
        const c = classifyLighting(lux);
        expect(c.category).toBe(category);
        expect(c.status).toBe(status);
    });

    it('kategori naskah redup/normal/terang', () => {
        expect(classifyLighting(99.9).kategoriNaskah).toBe('redup');
        expect(classifyLighting(100).kategoriNaskah).toBe('normal');
        expect(classifyLighting(300).kategoriNaskah).toBe('normal');
        expect(classifyLighting(300.1).kategoriNaskah).toBe('terang');
    });

    it('tanpa nilai tidak diberi kategori', () => {
        expect(classifyLighting(null)).toMatchObject({ lux: null, category: null, status: null });
    });
});

describe('estimasi lux dan luma', () => {
    it('estimasi mengikuti model log-log', () => {
        const model = { a: 3, b: 1.5 };
        const luma = 255 * 10 ** ((Math.log10(250) - 3) / 1.5);
        expect(estimateLux(luma, model)).toBeCloseTo(250, 0);
        expect(estimateLux(null, model)).toBeNull();
        expect(estimateLux(100, null)).toBeNull();
    });

    it('luma Rec.601 dari RGBA', () => {
        const px = [200, 150, 30, 255, 255, 255, 255, 255];
        const s = lumaStats(px);
        expect(s.mean).toBeCloseTo((0.299 * 200 + 0.587 * 150 + 0.114 * 30 + 255) / 2, 3);
        expect(s.saturated).toBe(0.5);
    });

    it('median', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 2, 3])).toBe(2.5);
        expect(median([])).toBeNull();
    });
});

describe('field formulir sampel cahaya', () => {
    const probe: LuxProbeResult = {
        lux: 245.3, luma: 90.5, exposureLocked: true, frames: [new Blob(['a']), new Blob(['b'])],
        calibrationId: 7, measuredAt: 1_000, note: null,
    };

    it('mengirim lux browser berkalibrasi bila tidak ada bacaan lain', () => {
        const keys = luxProbeFormFields(probe, false, 2_000).map(([k]) => k);
        expect(keys).toEqual([
            'lux_exposure_locked', 'lux_browser_luma', 'lux_probe_frames[]', 'lux_probe_frames[]',
            'lux_value', 'lux_source', 'lux_calibration_id',
        ]);
    });

    it('luxmeter didahulukan: hanya foto dan luma yang dikirim', () => {
        const keys = luxProbeFormFields(probe, true, 2_000).map(([k]) => k);
        expect(keys).not.toContain('lux_value');
        expect(keys).toContain('lux_probe_frames[]');
    });

    it('sampel basi tidak dikirim', () => {
        expect(luxProbeFormFields(probe, false, 1_000 + LUX_PROBE_MAX_AGE_MS + 1)).toEqual([]);
        expect(luxProbeFormFields(null, false, 0)).toEqual([]);
    });
});

describe('prioritas lux yang dikirim bersama presensi', () => {
    const probe: LuxProbeResult = {
        lux: 245.3, luma: 90.5, exposureLocked: true, frames: [], calibrationId: 7, measuredAt: 1_000, note: null,
    };
    const camera = { value: 300, source: 'camera', measuredAt: 1_000 };
    const luxmeter = { value: 180, source: 'luxmeter', measuredAt: 1_000 };

    it('perkiraan kamera tanpa kalibrasi tidak menggeser sampel terkalibrasi', () => {
        expect(luxReadingForSubmit(camera, probe, 2_000)).toBeNull();
    });

    it('bacaan luxmeter tetap didahulukan', () => {
        expect(luxReadingForSubmit(luxmeter, probe, 2_000)).toBe(luxmeter);
    });

    it('tanpa sampel terkalibrasi yang segar, bacaan panel dipakai apa adanya', () => {
        expect(luxReadingForSubmit(camera, null, 2_000)).toBe(camera);
        expect(luxReadingForSubmit(camera, { ...probe, lux: null }, 2_000)).toBe(camera);
        expect(luxReadingForSubmit(camera, probe, 1_000 + LUX_PROBE_MAX_AGE_MS + 1)).toBe(camera);
    });
});
