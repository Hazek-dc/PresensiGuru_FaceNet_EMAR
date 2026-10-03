import { describe, expect, it } from 'vitest';
import { checkDistanceTarget, checkLuxTarget, targetBand } from '../testParameters';

describe('parameter uji Studio (sama dengan PHP targetMet)', () => {
    it('rentang target jarak', () => {
        expect(targetBand(30)).toEqual([30, 40]);
        expect(targetBand(45)).toEqual([45, 55]);
        expect(targetBand(60)).toEqual([60, 70]);
        expect(targetBand(null)).toBeNull();
    });

    it('presensi #225: target 30 cm, terukur 50,6 cm tidak sesuai', () => {
        expect(checkDistanceTarget(30, 50.6)?.met).toBe(false);
        expect(checkDistanceTarget(30, 33.5)?.met).toBe(true);
        expect(checkDistanceTarget(60, 59.9)?.met).toBe(false);
        expect(checkDistanceTarget(30, null)?.met).toBeNull();
        expect(checkDistanceTarget(null, 40)).toBeNull();
    });

    it('target lux memakai kategori naskah', () => {
        expect(checkLuxTarget(300, 250)?.met).toBe(true);
        expect(checkLuxTarget(300, 601)?.met).toBe(false);
        expect(checkLuxTarget(50, 80)?.met).toBe(true);
        expect(checkLuxTarget(300, null)?.met).toBeNull();
        expect(checkLuxTarget(null, 200)).toBeNull();
    });

    it('kesesuaian dari perkiraan kamera ditandai perkiraan', () => {
        expect(checkLuxTarget(300, 250, true)?.text).toBe('Sesuai target cahaya normal (perkiraan)');
        expect(checkLuxTarget(300, 601, true)?.text).toBe('Cahaya terang, target normal (perkiraan)');
        expect(checkLuxTarget(300, 250)?.text).toBe('Sesuai target cahaya normal');
        expect(checkLuxTarget(300, null, true)?.text).toBe('Target cahaya normal, lux belum terukur');
    });
});
