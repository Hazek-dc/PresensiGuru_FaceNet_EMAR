import { describe, expect, it } from 'vitest';
import { bab5View, FUSION } from '../fusionDecision';

describe('bab5View (D1 rumus b, D2 liveness dlib)', () => {
    it('memakai keputusan server apa adanya', () => {
        const v = bab5View({
            euclidean_distance: 0.3,
            s1_decision: 1,
            s2_decision: 0,
            s3_decision: 1,
            p_live: 0.5,
        });
        expect([v.s1, v.s2, v.s3]).toEqual([1, 0, 1]);
    });

    it('menghitung rumus b bila nilai server tidak ada', () => {
        const v = bab5View({ euclidean_distance: 0.3, p_live: 0.5 });
        expect(v.pFace).toBeCloseTo(1 - 0.3 / FUSION.dRef, 12);
        expect(v.sFinal).toBeCloseTo(0.6 * 0.75 + 0.4 * 0.5, 12);
        expect([v.s1, v.s2, v.s3]).toEqual([1, 0, 1]);
    });

    it('d = 0,20 tepat dengan P_live 0 ditolak, sama dengan floating point mesin', () => {
        const v = bab5View({ euclidean_distance: 0.2, p_live: 0 });
        expect(v.sFinal).toBe(0.49999999999999994);
        expect(v.s3).toBe(0);
    });

    it('gerbang identitas: d di atas 0,40 tidak pernah lolos S3', () => {
        const v = bab5View({ euclidean_distance: 0.41, p_live: 1 });
        expect([v.s1, v.s2, v.s3]).toEqual([0, 0, 0]);
    });

    it('tanpa P_live atau landmark dlib, S2/S3 FTA (null) dan EAR/MAR tidak dikarang', () => {
        expect(bab5View({ euclidean_distance: 0.1 })).toMatchObject({
            s1: 1,
            s2: null,
            s3: null,
            livenessFta: true,
        });
        expect(
            bab5View({
                euclidean_distance: 0.1,
                p_live: 1,
                landmark_frames: 0,
            }),
        ).toMatchObject({ s2: null, s3: null });
    });

    it('tanpa jarak tidak ada yang dinilai', () => {
        expect(bab5View({ p_live: 1 })).toMatchObject({
            s1: null,
            s2: null,
            s3: null,
            pFace: null,
        });
        expect(bab5View(null)).toMatchObject({ s1: null, s2: null, s3: null });
    });
});
