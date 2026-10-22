import { describe, expect, it } from 'vitest';
import {
    challengeLabel,
    challengeOrder,
    combineChallengeStatuses,
    faceDetectedPercent,
} from '../livenessGuidance';

describe('panduan liveness D2', () => {
    it('selalu meminta kedip dan buka-tutup mulut, urutannya acak', () => {
        expect(challengeOrder(0.1)).toEqual(['BLINK', 'OPEN_MOUTH']);
        expect(challengeOrder(0.9)).toEqual(['OPEN_MOUTH', 'BLINK']);
        expect(new Set(challengeOrder(0.3))).toEqual(
            new Set(['BLINK', 'OPEN_MOUTH']),
        );
        expect(challengeLabel(challengeOrder(0.9))).toBe('OPEN_MOUTH>BLINK');
    });

    it('status gabungan lolos hanya bila kedua langkah lolos', () => {
        expect(
            combineChallengeStatuses(['PASS_LIVENESS', 'PASS_LIVENESS'], 2),
        ).toBe('PASS_LIVENESS');
        expect(
            combineChallengeStatuses(
                ['PASS_LIVENESS', 'REJECT_WRONG_ACTION'],
                2,
            ),
        ).toBe('REJECT_WRONG_ACTION');
        expect(
            combineChallengeStatuses(['REJECT_TIMEOUT', 'PASS_LIVENESS'], 2),
        ).toBe('REJECT_TIMEOUT');
    });

    it('langkah yang belum selesai saat rekaman berhenti dihitung timeout', () => {
        expect(combineChallengeStatuses(['PASS_LIVENESS'], 2)).toBe(
            'REJECT_TIMEOUT',
        );
        expect(
            combineChallengeStatuses(
                ['PASS_LIVENESS', 'WAITING_FOR_ACTION'],
                2,
            ),
        ).toBe('REJECT_TIMEOUT');
        expect(combineChallengeStatuses([], 2)).toBe('REJECT_TIMEOUT');
    });
});

describe('faceDetectedPercent (D10)', () => {
    it('dihitung dari semua frame yang diproses, bukan hanya frame berwajah', () => {
        expect(faceDetectedPercent(180, 240)).toBe(75);
        expect(faceDetectedPercent(239, 240)).toBe(99.6);
        expect(faceDetectedPercent(0, 240)).toBe(0);
    });

    it('tanpa frame yang diproses tidak diisi 100', () => {
        expect(faceDetectedPercent(0, 0)).toBeNull();
    });
});
