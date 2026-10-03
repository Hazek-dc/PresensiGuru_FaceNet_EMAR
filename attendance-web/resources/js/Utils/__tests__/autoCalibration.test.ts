import { describe, expect, it } from 'vitest';
import { luxCondition, luxPointsReady, nextLuxCondition, StabilityTracker } from '../autoCalibration';

describe('penunggu kondisi stabil', () => {
    it('stabil bila nilai hampir tetap sepanjang jendela', () => {
        const t = new StabilityTracker(2000, 0.03);
        for (let ms = 0; ms <= 2000; ms += 100) t.push(0.300 + (ms % 200 ? 0.002 : 0), ms);
        expect(t.isStable(2000)).toBe(true);
    });

    it('belum stabil bila sampel belum menutupi jendela', () => {
        const t = new StabilityTracker(2000, 0.03);
        for (let ms = 0; ms <= 800; ms += 100) t.push(0.3, ms);
        expect(t.isStable(800)).toBe(false);
    });

    it('bergerak (maju-mundur) tidak stabil', () => {
        const t = new StabilityTracker(2000, 0.03);
        for (let ms = 0; ms <= 2000; ms += 100) t.push(0.25 + ms / 20000, ms);
        expect(t.isStable(2000)).toBe(false);
    });

    it('wajah hilang memutus kestabilan', () => {
        const t = new StabilityTracker(2000, 0.03);
        for (let ms = 0; ms <= 2000; ms += 100) t.push(ms === 1500 ? null : 0.3, ms);
        expect(t.isStable(2000)).toBe(false);
    });
});

describe('saran kondisi cahaya', () => {
    it('normal dulu, lalu redup, lalu terang', () => {
        expect(nextLuxCondition([])).toBe('normal');
        expect(nextLuxCondition([220])).toBe('redup');
        expect(nextLuxCondition([220, 60])).toBe('terang');
        expect(nextLuxCondition([220, 60, 650])).toBeNull();
    });

    it('batas kategori sama dengan naskah', () => {
        expect(luxCondition(99.9)).toBe('redup');
        expect(luxCondition(100)).toBe('normal');
        expect(luxCondition(300)).toBe('normal');
        expect(luxCondition(300.1)).toBe('terang');
    });

    it('siap disimpan bila cukup titik dan rentang >= 3 kali', () => {
        expect(luxPointsReady([60, 220, 650], 3)).toBe(true);
        expect(luxPointsReady([150, 220, 400], 3)).toBe(false);
        expect(luxPointsReady([60, 650], 3)).toBe(false);
    });
});
