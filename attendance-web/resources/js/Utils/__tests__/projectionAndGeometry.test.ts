import { describe, expect, it } from 'vitest';
import { Landmark3D } from '../../Hooks/useFaceLandmarker';
import { getDistanceCategory } from '../faceDistance';
import { evaluateQualityGate } from '../faceGeometry';
import {
    calculateProjection,
    projectNormalizedPoint,
    projectToThreeOrthographic,
} from '../projection';

describe('TAHAP 13.27 — Projection Module', () => {
    it('calculates cover projection for landscape video in container correctly', () => {
        const proj = calculateProjection({
            videoWidth: 1280,
            videoHeight: 720,
            containerWidth: 800,
            containerHeight: 600,
            fitMode: 'cover',
            isMirrored: true,
        });

        expect(proj.isValid).toBe(true);
        expect(proj.scale).toBeCloseTo(600 / 720, 4);
        expect(proj.renderedHeight).toBeCloseTo(600, 4);
        expect(proj.renderedWidth).toBeGreaterThan(800);
        expect(proj.cropX).toBeGreaterThan(0);
        expect(proj.cropY).toBe(0);
    });

    it('calculates perfect 1:1 zero-crop projection for 1080p video in 16:9 widescreen container', () => {
        const proj1080p = calculateProjection({
            videoWidth: 1920,
            videoHeight: 1080,
            containerWidth: 960,
            containerHeight: 540,
            fitMode: 'cover',
            isMirrored: true,
        });

        expect(proj1080p.isValid).toBe(true);
        expect(proj1080p.scale).toBeCloseTo(0.5, 4);
        expect(proj1080p.renderedWidth).toBe(960);
        expect(proj1080p.renderedHeight).toBe(540);
        expect(proj1080p.cropX).toBe(0);
        expect(proj1080p.cropY).toBe(0);

        // Center point projects exactly to center of 960x540 container
        const centerPoint = projectNormalizedPoint(0.5, 0.5, 0, proj1080p);
        expect(centerPoint.screenX).toBe(480);
        expect(centerPoint.screenY).toBe(270);
    });

    it('handles zero dimensions safely', () => {
        const proj = calculateProjection({
            videoWidth: 0,
            videoHeight: 0,
            containerWidth: 800,
            containerHeight: 600,
        });

        expect(proj.isValid).toBe(false);

        const point = projectNormalizedPoint(0.5, 0.5, 0, proj);
        expect(point).toEqual({ screenX: 0, screenY: 0, screenZ: 0 });
    });

    it('applies mirror transform exactly once when mirrored', () => {
        const projMirrored = calculateProjection({
            videoWidth: 1000,
            videoHeight: 1000,
            containerWidth: 1000,
            containerHeight: 1000,
            fitMode: 'cover',
            isMirrored: true,
        });

        const pointMirrored = projectNormalizedPoint(0.1, 0.1, 0, projMirrored);
        expect(pointMirrored.screenX).toBe(900);
        expect(pointMirrored.screenY).toBe(100);

        const projUnmirrored = calculateProjection({
            videoWidth: 1000,
            videoHeight: 1000,
            containerWidth: 1000,
            containerHeight: 1000,
            fitMode: 'cover',
            isMirrored: false,
        });
        const pointUnmirrored = projectNormalizedPoint(
            0.1,
            0.1,
            0,
            projUnmirrored,
        );
        expect(pointUnmirrored.screenX).toBe(100);
        expect(pointUnmirrored.screenY).toBe(100);
    });

    it('projects normalized center to Three.js orthographic origin (0,0)', () => {
        const proj = calculateProjection({
            videoWidth: 1000,
            videoHeight: 1000,
            containerWidth: 1000,
            containerHeight: 1000,
            fitMode: 'cover',
            isMirrored: false,
        });

        const threePoint = projectToThreeOrthographic(0.5, 0.5, 0, proj);
        expect(threePoint.cx).toBeCloseTo(0, 5);
        expect(threePoint.cy).toBeCloseTo(0, 5);
    });
});

describe('TAHAP 13.28 — Face Geometry & Quality Gate', () => {
    function createMockLandmarks(
        centerX = 0.5,
        centerY = 0.45,
        scale = 1.0,
    ): Landmark3D[] {
        const lms: Landmark3D[] = Array.from({ length: 478 }, () => ({
            x: centerX,
            y: centerY,
            z: 0,
        }));

        // Anatomical landmark offsets relative to center
        lms[33] = { x: centerX - 0.2 * scale, y: centerY - 0.05 * scale, z: 0 }; // Left eye outer
        lms[133] = {
            x: centerX - 0.05 * scale,
            y: centerY - 0.05 * scale,
            z: 0,
        }; // Left eye inner
        lms[362] = {
            x: centerX + 0.05 * scale,
            y: centerY - 0.05 * scale,
            z: 0,
        }; // Right eye inner
        lms[263] = {
            x: centerX + 0.2 * scale,
            y: centerY - 0.05 * scale,
            z: 0,
        }; // Right eye outer
        lms[1] = { x: centerX, y: centerY, z: 0 }; // Nose tip
        lms[61] = {
            x: centerX - 0.05 * scale,
            y: centerY + 0.05 * scale,
            z: 0,
        }; // Mouth left
        lms[291] = {
            x: centerX + 0.05 * scale,
            y: centerY + 0.05 * scale,
            z: 0,
        }; // Mouth right
        lms[152] = { x: centerX, y: centerY + 0.15 * scale, z: 0 }; // Chin
        lms[234] = { x: centerX - 0.2 * scale, y: centerY, z: 0 }; // Cheek left
        lms[454] = { x: centerX + 0.2 * scale, y: centerY, z: 0 }; // Cheek right
        lms[10] = { x: centerX, y: centerY - 0.15 * scale, z: 0 }; // Forehead

        return lms;
    }

    it('returns SEARCHING guidance when face is missing', () => {
        const result = evaluateQualityGate(false, 0, null, 0, 0);
        expect(result.isReady).toBe(false);
        expect(result.state).toBe('SEARCHING');
    });

    it('returns MULTIPLE_FACES guidance when face count > 1', () => {
        const lms = createMockLandmarks();
        const result = evaluateQualityGate(true, 2, lms, 0.8, 0.9);
        expect(result.isReady).toBe(false);
        expect(result.state).toBe('MULTIPLE_FACES');
    });

    it('returns MOVE_CLOSER when interocular ratio is too small', () => {
        const lms = createMockLandmarks(0.5, 0.45, 0.15); // Small face scale (< 0.055)
        const result = evaluateQualityGate(true, 1, lms, 0.5, 0.8);
        expect(result.isReady).toBe(false);
        expect(result.state).toBe('MOVE_CLOSER');
    });

    it('returns READY for all three ISO/IEC distance benchmarks: 30cm, 45cm, and 60cm', () => {
        // 30 cm scale: iod ~ 0.15 (scale = 0.60 -> iod = 0.15)
        const lms30 = createMockLandmarks(0.5, 0.45, 0.60);
        const res30 = evaluateQualityGate(true, 1, lms30, 0.85, 0.9);
        expect(res30.isReady).toBe(true);
        expect(res30.state).toBe('READY');

        // 45 cm scale: iod ~ 0.10 (scale = 0.40 -> iod = 0.10)
        const lms45 = createMockLandmarks(0.5, 0.45, 0.40);
        const res45 = evaluateQualityGate(true, 1, lms45, 0.85, 0.9);
        expect(res45.isReady).toBe(true);
        expect(res45.state).toBe('READY');

        // 60 cm scale: iod ~ 0.075 (scale = 0.30 -> iod = 0.075)
        const lms60 = createMockLandmarks(0.5, 0.45, 0.30);
        const res60 = evaluateQualityGate(true, 1, lms60, 0.85, 0.9);
        expect(res60.isReady).toBe(true);
        expect(res60.state).toBe('READY');
    });

    it('returns MOVE_BACK when interocular ratio is too large', () => {
        // Scale 1.95 gives interocular ratio > 0.38 while remaining safely inside frame margins
        const lms = createMockLandmarks(0.5, 0.45, 1.95);
        const result = evaluateQualityGate(true, 1, lms, 0.9, 0.8);
        expect(result.isReady).toBe(false);
        expect(result.state).toBe('MOVE_BACK');
    });

    it('returns MOVE_LEFT/RIGHT when face is off-center', () => {
        const lmsLeft = createMockLandmarks(0.7, 0.45, 1.0); // Shifted right in frame -> move left
        const resultLeft = evaluateQualityGate(true, 1, lmsLeft, 0.8, 0.8);
        expect(resultLeft.isReady).toBe(false);
        expect(resultLeft.state).toBe('MOVE_LEFT');

        const lmsRight = createMockLandmarks(0.3, 0.45, 1.0); // Shifted left in frame -> move right
        const resultRight = evaluateQualityGate(true, 1, lmsRight, 0.8, 0.8);
        expect(resultRight.isReady).toBe(false);
        expect(resultRight.state).toBe('MOVE_RIGHT');
    });

    it('returns READY when face satisfies all quality gate constraints', () => {
        const lms = createMockLandmarks(0.5, 0.45, 1.0); // Ideal face
        const result = evaluateQualityGate(true, 1, lms, 0.85, 0.9);
        expect(result.isReady).toBe(true);
        expect(result.state).toBe('READY');
        expect(result.metrics?.areLandmarksVisible).toBe(true);
    });
});

describe('Rentang posisi jarak (Subbab 5.2)', () => {
    it('classifies inclusive bands 30-40, 45-55, 60-70 cm as valid levels', () => {
        for (const cm of [30, 35, 40]) {
            const cat = getDistanceCategory(cm);
            expect(cat.code).toBe('IDEAL_30');
            expect(cat.label).toBe('30 cm (Dekat)');
            expect(cat.isValidDistance).toBe(true);
            expect(cat.benchmarkTarget).toBe(30);
        }
        for (const cm of [45, 50, 55]) {
            const cat = getDistanceCategory(cm);
            expect(cat.code).toBe('MID_45');
            expect(cat.label).toBe('45 cm (Ideal)');
            expect(cat.isIdeal).toBe(true);
            expect(cat.isValidDistance).toBe(true);
            expect(cat.benchmarkTarget).toBe(45);
        }
        for (const cm of [60, 65, 70]) {
            const cat = getDistanceCategory(cm);
            expect(cat.code).toBe('FAR_60');
            expect(cat.label).toBe('60 cm (Jauh)');
            expect(cat.isValidDistance).toBe(true);
            expect(cat.benchmarkTarget).toBe(60);
        }
    });

    it('rejects positions outside every band', () => {
        expect(getDistanceCategory(29.9).code).toBe('TOO_CLOSE');
        expect(getDistanceCategory(29.9).isValidDistance).toBe(false);
        expect(getDistanceCategory(70.1).code).toBe('TOO_FAR');
        expect(getDistanceCategory(70.1).isValidDistance).toBe(false);
        expect(getDistanceCategory(100).isValidDistance).toBe(false);
    });

    it('treats the gaps 40-45 and 55-60 cm as out of band with the nearest level as target', () => {
        for (const cm of [40.1, 42, 44.9]) {
            const cat = getDistanceCategory(cm);
            expect(cat.isValidDistance).toBe(false);
            expect(cat.isIdeal).toBe(false);
            expect(cat.benchmarkTarget).toBe(45);
        }
        for (const cm of [55.1, 57, 59.9]) {
            const cat = getDistanceCategory(cm);
            expect(cat.isValidDistance).toBe(false);
            expect(cat.isIdeal).toBe(false);
            expect(cat.benchmarkTarget).toBe(60);
        }
    });
});
