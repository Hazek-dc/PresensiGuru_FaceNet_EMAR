import { describe, expect, it } from 'vitest';
import type { Landmark3D } from '../../Hooks/useFaceLandmarker';
import {
    ChallengeTracker,
    CycleCounter,
    EAR_BLINK_THRESHOLD,
    MAR_OPEN_THRESHOLD,
    eyeAspectRatio,
    mouthAspectRatio,
} from '../emarGeometry';

const W = 640;
const H = 480;

/** 478 landmark nol, lalu titik mata/mulut diisi dalam piksel. */
function face({ eyeOpenPx = 8, mouthOpenPx = 2 }: { eyeOpenPx?: number; mouthOpenPx?: number }): Landmark3D[] {
    const lms: Landmark3D[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
    const put = (i: number, xPx: number, yPx: number) => (lms[i] = { x: xPx / W, y: yPx / H, z: 0 });

    // Kedua mata lebar 40 px, bukaan eyeOpenPx
    for (const [p1, p2, p3, p4, p5, p6, cx] of [
        [33, 160, 158, 133, 153, 144, 200],
        [362, 385, 387, 263, 373, 380, 400],
    ]) {
        put(p1, cx - 20, 200);
        put(p4, cx + 20, 200);
        put(p2, cx - 7, 200 - eyeOpenPx / 2);
        put(p6, cx - 7, 200 + eyeOpenPx / 2);
        put(p3, cx + 7, 200 - eyeOpenPx / 2);
        put(p5, cx + 7, 200 + eyeOpenPx / 2);
    }
    // Mulut lebar 60 px, bukaan mouthOpenPx
    put(78, 270, 330);
    put(308, 330, 330);
    for (const [up, low, x] of [
        [81, 178, 285],
        [13, 14, 300],
        [311, 402, 315],
    ]) {
        put(up, x, 330 - mouthOpenPx / 2);
        put(low, x, 330 + mouthOpenPx / 2);
    }
    return lms;
}

describe('EAR/MAR geometris', () => {
    it('menghitung rasio dalam piksel, bukan koordinat ternormalisasi', () => {
        // Bukaan 8 px / lebar 40 px = 0,20
        expect(eyeAspectRatio(face({ eyeOpenPx: 8 }), W, H)).toBeCloseTo(0.2, 6);
        // Bukaan 6 px / lebar 60 px = 0,10
        expect(mouthAspectRatio(face({ mouthOpenPx: 6 }), W, H)).toBeCloseTo(0.1, 6);
    });

    it('memisahkan mata/mulut terbuka dan tertutup di sekitar ambang naskah', () => {
        const ear = (px: number) => eyeAspectRatio(face({ eyeOpenPx: px }), W, H)!;
        const mar = (px: number) => mouthAspectRatio(face({ mouthOpenPx: px }), W, H)!;
        expect(ear(8.1) < EAR_BLINK_THRESHOLD).toBe(false); // 0,2025: terbuka
        expect(ear(7.9) < EAR_BLINK_THRESHOLD).toBe(true); // 0,1975: tertutup
        expect(mar(6.1) >= MAR_OPEN_THRESHOLD).toBe(true); // 0,1017: terbuka
        expect(mar(5.9) >= MAR_OPEN_THRESHOLD).toBe(false); // 0,0983: tertutup
    });

    it('null bila landmark tidak lengkap', () => {
        expect(eyeAspectRatio(null, W, H)).toBeNull();
        expect(mouthAspectRatio([], W, H)).toBeNull();
    });
});

describe('CycleCounter', () => {
    it('menghitung satu siklus penuh', () => {
        const c = new CycleCounter();
        [false, true, true, false].forEach((v) => c.update(v));
        expect(c.count).toBe(1);
    });

    it('keadaan aktif terus (foto statis) tidak menghasilkan siklus', () => {
        const c = new CycleCounter();
        for (let i = 0; i < 50; i++) c.update(true);
        expect(c.count).toBe(0);
    });
});

describe('ChallengeTracker', () => {
    const OPEN_EYE = 0.28;
    const CLOSED_EYE = 0.12;
    const CLOSED_MOUTH = 0.03;
    const OPEN_MOUTH = 0.35;
    const PARTED_LIPS = 0.12; // sedikit terbuka, >= 0,10

    it('BLINK lolos saat mata terbuka lalu tertutup', () => {
        const t = new ChallengeTracker('BLINK', 1.0);
        t.update(OPEN_EYE, CLOSED_MOUTH, 1.1);
        expect(t.update(CLOSED_EYE, CLOSED_MOUTH, 1.3)).toBe('PASS_LIVENESS');
    });

    it('BLINK tetap lolos walau bibir sedikit terbuka sesaat', () => {
        const t = new ChallengeTracker('BLINK', 1.0);
        t.update(OPEN_EYE, PARTED_LIPS, 1.1);
        t.update(OPEN_EYE, PARTED_LIPS, 1.3);
        expect(t.update(CLOSED_EYE, PARTED_LIPS, 1.4)).toBe('PASS_LIVENESS');
    });

    it('BLINK ditolak bila mulut dibuka terus >= 0,6 s sebelum berkedip', () => {
        const t = new ChallengeTracker('BLINK', 1.0);
        t.update(OPEN_EYE, OPEN_MOUTH, 1.1);
        t.update(OPEN_EYE, OPEN_MOUTH, 1.5);
        expect(t.update(OPEN_EYE, OPEN_MOUTH, 1.75)).toBe('REJECT_WRONG_ACTION');
    });

    it('foto bermata tertutup tidak pernah lolos BLINK', () => {
        const t = new ChallengeTracker('BLINK', 1.0);
        for (let s = 1.1; s < 5.0; s += 0.2) t.update(CLOSED_EYE, CLOSED_MOUTH, s);
        expect(t.update(CLOSED_EYE, CLOSED_MOUTH, 5.2)).toBe('REJECT_TIMEOUT');
    });

    it('OPEN_MOUTH lolos saat mulut tertutup lalu terbuka, kedipan tidak menggagalkan', () => {
        const t = new ChallengeTracker('OPEN_MOUTH', 1.0);
        t.update(OPEN_EYE, CLOSED_MOUTH, 1.1);
        t.update(CLOSED_EYE, CLOSED_MOUTH, 1.2); // kedip refleks
        expect(t.update(OPEN_EYE, OPEN_MOUTH, 1.5)).toBe('PASS_LIVENESS');
    });

    it('foto bermulut terbuka tidak pernah lolos OPEN_MOUTH', () => {
        const t = new ChallengeTracker('OPEN_MOUTH', 1.0);
        for (let s = 1.1; s < 5.4; s += 0.2) t.update(OPEN_EYE, OPEN_MOUTH, s);
        expect(t.status).toBe('REJECT_TIMEOUT');
    });

    it('status akhir tidak berubah lagi', () => {
        const t = new ChallengeTracker('BLINK', 0);
        t.update(OPEN_EYE, CLOSED_MOUTH, 0.1);
        t.update(CLOSED_EYE, CLOSED_MOUTH, 0.2);
        expect(t.update(OPEN_EYE, OPEN_MOUTH, 3.9)).toBe('PASS_LIVENESS');
    });
});
