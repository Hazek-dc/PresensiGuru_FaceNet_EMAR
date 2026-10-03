import { describe, expect, it } from 'vitest';
import {
    calculatePhotometricLux,
    isUsablePhotometry,
    luxEstimateDetail,
    getLuxCategory,
    LuxSensorSmoother,
    CALIBRATION_PROFILES,
} from '../luxMeasurement';

describe('Lux Measurement & Photometry Unit Tests', () => {
    it('categorizes lux according to ISO/IEC 30107-3 and skripsi ranges', () => {
        expect(getLuxCategory(50).code).toBe('LOW');
        expect(getLuxCategory(50).label).toBe('Redup');
        expect(getLuxCategory(50).isOptimal).toBe(false);

        expect(getLuxCategory(100).code).toBe('NORMAL');
        expect(getLuxCategory(300).code).toBe('NORMAL');
        expect(getLuxCategory(300).label).toBe('Standar');
        expect(getLuxCategory(300).isOptimal).toBe(true);

        expect(getLuxCategory(99.9).code).toBe('LOW');
        expect(getLuxCategory(300.1).code).toBe('HIGH');
        expect(getLuxCategory(301).code).toBe('HIGH');
        expect(getLuxCategory(500).code).toBe('HIGH');
        expect(getLuxCategory(800).code).toBe('HIGH');
        expect(getLuxCategory(800).label).toBe('Terang');
        expect(getLuxCategory(800).isOptimal).toBe(false);
    });

    it('computes accurate APEX lux when camera exposure time and ISO are available on human face', () => {
        // Create 10x10 synthetic frame with middle gray (128)
        const width = 10;
        const height = 10;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = 128;     // R
            rgba[i + 1] = 128; // G
            rgba[i + 2] = 128; // B
            rgba[i + 3] = 255; // A
        }

        // Standard outdoor daylight settings: t = 1/250s (0.004s), ISO 100, f/2.0
        // APEX: (250 * 4) / (0.004 * 100) * (128 / 128) = 1000 / 0.4 = 2500 Lux
        // MediaTrackSettings.exposureTime bersatuan 100 µs: 0,004 s = 40.
        const result = calculatePhotometricLux(rgba, width, height, null, {
            exposureTime: 40,
            iso: 100,
        });

        expect(result.method).toBe('apex_exposure');
        expect(result.calibratedLux).toBe(2500);
        expect(result.meanFaceY).toBe(128);
    });

    it('targets human face ROI and separates face luminance from room ambient', () => {
        const width = 20;
        const height = 20;
        const rgba = new Uint8ClampedArray(width * height * 4);

        // Fill background with low ambient (40)
        for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = 40;
            rgba[i + 1] = 40;
            rgba[i + 2] = 40;
            rgba[i + 3] = 255;
        }

        // Place a bright face at normalized [0.3, 0.3, 0.7, 0.7] (pixels 6..14)
        for (let y = 6; y <= 14; y++) {
            for (let x = 6; x <= 14; x++) {
                const idx = (y * width + x) * 4;
                rgba[idx] = 180;
                rgba[idx + 1] = 180;
                rgba[idx + 2] = 180;
            }
        }

        const faceROI = {
            xMin: 0.3,
            yMin: 0.3,
            xMax: 0.7,
            yMax: 0.7,
            isDetected: true,
        };

        const result = calculatePhotometricLux(rgba, width, height, faceROI);
        expect(result.isFaceTargeted).toBe(true);
        expect(result.method).toBe('human_face_photometry');
        expect(result.meanFaceY).toBeGreaterThan(150);
        expect(result.meanAmbientY).toBeLessThan(60);
    });

    it('discounts screen brightness glare in dark rooms to avoid false high readings', () => {
        const width = 20;
        const height = 20;
        const rgba = new Uint8ClampedArray(width * height * 4);

        // Background is dark room with webcam AEC noise (ambient = 50)
        for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = 50;
            rgba[i + 1] = 50;
            rgba[i + 2] = 50;
            rgba[i + 3] = 255;
        }

        // Face is lit by 100% monitor brightness in front of user
        for (let y = 6; y <= 14; y++) {
            for (let x = 6; x <= 14; x++) {
                const idx = (y * width + x) * 4;
                rgba[idx] = 110;
                rgba[idx + 1] = 110;
                rgba[idx + 2] = 110;
            }
        }

        const faceROI = {
            xMin: 0.3,
            yMin: 0.3,
            xMax: 0.7,
            yMax: 0.7,
            isDetected: true,
        };

        const result = calculatePhotometricLux(rgba, width, height, faceROI);
        // Screen glare filter should trigger
        expect(result.isGlareCompensated).toBe(true);
        // True room lighting should be correctly classified as Redup (< 100 Lux), not deceived by screen
        expect(result.calibratedLux).toBeLessThan(100);
        expect(getLuxCategory(result.calibratedLux).code).toBe('LOW');
    });

    it('compensates dark scenes with AEC shadow clip detection', () => {
        const width = 10;
        const height = 10;
        const rgba = new Uint8ClampedArray(width * height * 4);
        // Fill with low luminance and shadow clipping (e.g. value 15)
        for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = 15;
            rgba[i + 1] = 15;
            rgba[i + 2] = 15;
            rgba[i + 3] = 255;
        }

        const result = calculatePhotometricLux(rgba, width, height);
        expect(result.shadowClipRatio).toBe(1.0);
        expect(result.calibratedLux).toBeLessThan(100);
    });

    it('smoothes lux fluctuations without lag using adaptive EMA', () => {
        const smoother = new LuxSensorSmoother(0.30, 0.75);

        // Initial reading
        expect(smoother.update(300)).toBe(300);

        // Minor frame flicker (fluorescent 50Hz/60Hz: 300 -> 320)
        // Expected: 0.30 * 320 + 0.70 * 300 = 96 + 210 = 306
        const smoothedMinor = smoother.update(320);
        expect(smoothedMinor).toBe(306);

        // Sudden drastic change (e.g. room light turned off: 306 -> 50)
        // Delta = 256 > 120, so uses fast alpha = 0.75
        // Expected: 0.75 * 50 + 0.25 * 306 = 37.5 + 76.5 = 114
        const smoothedFast = smoother.update(50);
        expect(smoothedFast).toBe(114);
    });

    it('applies user calibration factor correctly', () => {
        const width = 10;
        const height = 10;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = 128;
            rgba[i + 1] = 128;
            rgba[i + 2] = 128;
            rgba[i + 3] = 255;
        }

        const base = calculatePhotometricLux(rgba, width, height, null, undefined, 1.0, 0);
        const calibrated = calculatePhotometricLux(rgba, width, height, null, undefined, 1.5, 20);

        expect(calibrated.calibratedLux).toBe(Math.round(base.rawLux * 1.5 + 20));
    });

    it('has standard calibration profiles defined', () => {
        expect(CALIBRATION_PROFILES.length).toBeGreaterThanOrEqual(3);
        const laptop = CALIBRATION_PROFILES.find((p) => p.id === 'LAPTOP_DEFAULT');
        expect(laptop).toBeDefined();
        expect(laptop?.factor).toBe(1.0);
    });
});

describe('perkiraan lux otomatis tanpa kalibrasi', () => {
    const frame = (value: number) => {
        const rgba = new Uint8ClampedArray(64 * 48 * 4);
        for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = value;
            rgba[i + 1] = value;
            rgba[i + 2] = value;
            rgba[i + 3] = 255;
        }
        return calculatePhotometricLux(rgba, 64, 48, null);
    };

    it('frame hitam atau jenuh tidak dianggap bacaan, bukan batas 5 lux', () => {
        expect(frame(0).calibratedLux).toBe(5);
        expect(isUsablePhotometry(frame(0))).toBe(false);
        expect(isUsablePhotometry(frame(255))).toBe(false);
        expect(isUsablePhotometry(frame(120))).toBe(true);
    });

    it('mencatat metode dan profil lensa yang dipakai', () => {
        expect(luxEstimateDetail(frame(120), { profileId: 'EXTERNAL_USB', factor: 1.25, offset: 0 })).toEqual({
            method: 'fallback_portrait_photometry',
            profile: 'EXTERNAL_USB',
            factor: 1.25,
            offset: 0,
            glare_compensated: false,
            face_targeted: false,
        });
    });
});
