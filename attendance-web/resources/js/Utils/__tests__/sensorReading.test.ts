import { describe, expect, it } from 'vitest';
import {
    evaluateHardwareReading,
    formatLux,
    formatMeasured,
    freshReading,
    luxSourceLabel,
    NOT_MEASURED_LABEL,
    parseTargetParam,
    SENSOR_MAX_AGE_S,
    sensorFormFields,
} from '../sensorReading';

const measured = {
    success: true,
    lux: 325.5,
    source: 'hardware_serial',
    device: 'UNI-T UT383',
    seconds_ago: 1.2,
    is_stale: false,
    is_measured: true,
    not_measured_reason: null,
    max_age_s: 10,
};

describe('evaluateHardwareReading', () => {
    it('menerima bacaan luxmeter segar yang ditandai is_measured', () => {
        expect(evaluateHardwareReading(measured, 'lux')).toEqual({ accepted: true, value: 325.5, secondsAgo: 1.2 });
    });

    it('menolak respons tanpa bacaan (server baru)', () => {
        const none = { success: true, lux: null, source: 'none', seconds_ago: null, is_measured: false, not_measured_reason: 'no_reading' };
        expect(evaluateHardwareReading(none, 'lux')).toEqual({ accepted: false, reason: 'no_reading' });
    });

    it('menolak bacaan basi walau angkanya ada', () => {
        const stale = { ...measured, seconds_ago: 42, is_stale: true, is_measured: false, not_measured_reason: 'stale' };
        expect(evaluateHardwareReading(stale, 'lux')).toEqual({ accepted: false, reason: 'stale' });
    });

    it('menolak preset 300 lux dari server lama (source default, tanpa is_measured)', () => {
        const legacyPreset = { success: true, lux: 300, source: 'default', device: 'internal_preset', seconds_ago: 0 };
        expect(evaluateHardwareReading(legacyPreset, 'lux')).toEqual({ accepted: false, reason: 'not_a_measurement' });
    });

    it('menolak preset dan penyetelan manual dari tombol web', () => {
        for (const source of ['manual_preset', 'manual_tune', 'research_preset']) {
            const verdict = evaluateHardwareReading({ ...measured, source }, 'lux');
            expect(verdict).toEqual({ accepted: false, reason: 'not_a_measurement' });
        }
    });

    it('menolak respons tanpa is_measured meski sumbernya sensor', () => {
        const { is_measured: _omit, ...legacy } = measured;
        expect(evaluateHardwareReading(legacy, 'lux').accepted).toBe(false);
    });

    it('memeriksa umur sendiri bila server menyatakan is_measured tetapi seconds_ago melewati batas', () => {
        const inconsistent = { ...measured, seconds_ago: SENSOR_MAX_AGE_S + 0.5 };
        expect(evaluateHardwareReading(inconsistent, 'lux')).toEqual({ accepted: false, reason: 'stale' });
        const noAge = { ...measured, seconds_ago: null };
        expect(evaluateHardwareReading(noAge, 'lux')).toEqual({ accepted: false, reason: 'stale' });
    });

    it('memakai kunci distance_cm untuk sensor jarak', () => {
        const distance = { ...measured, lux: undefined, distance_cm: 47.3, source: 'hardware_serial' };
        expect(evaluateHardwareReading(distance, 'distance_cm')).toEqual({ accepted: true, value: 47.3, secondsAgo: 1.2 });
        expect(evaluateHardwareReading(distance, 'lux')).toEqual({ accepted: false, reason: 'no_reading' });
    });

    it('menolak respons gagal atau kosong', () => {
        expect(evaluateHardwareReading(null, 'lux')).toEqual({ accepted: false, reason: 'invalid' });
        expect(evaluateHardwareReading({ success: false }, 'lux')).toEqual({ accepted: false, reason: 'invalid' });
    });
});

describe('freshReading', () => {
    const reading = { value: 150, source: 'camera' as const, measuredAt: 1_000_000 };

    it('segar sampai tepat batas umur, basi setelahnya', () => {
        expect(freshReading(reading, 1_000_000 + SENSOR_MAX_AGE_S * 1000)).toBe(reading);
        expect(freshReading(reading, 1_000_000 + SENSOR_MAX_AGE_S * 1000 + 1)).toBeNull();
    });

    it('bacaan yang lebih baru dari jam tampilan tetap segar', () => {
        expect(freshReading(reading, 999_500)).toBe(reading);
    });

    it('null tetap null', () => {
        expect(freshReading(null, 1_000_000)).toBeNull();
    });
});

describe('sensorFormFields', () => {
    const now = 2_000_000;

    it('tanpa bacaan tidak mengirim lux_value/distance_cm sama sekali', () => {
        expect(sensorFormFields({ lux: null, distance: null, luxTarget: null, distanceTarget: null, nowMs: now })).toEqual([]);
    });

    it('target dari query string dikirim dengan nama terpisah, bukan sebagai hasil ukur', () => {
        const fields = sensorFormFields({ lux: null, distance: null, luxTarget: 300, distanceTarget: 30, nowMs: now });
        expect(fields).toEqual([
            ['lux_target', '300'],
            ['distance_target_cm', '30'],
        ]);
        expect(fields.map(([k]) => k)).not.toContain('lux_value');
        expect(fields.map(([k]) => k)).not.toContain('distance_cm');
    });

    it('bacaan segar dikirim bersama sumbernya', () => {
        const fields = sensorFormFields({
            lux: { value: 212.46, source: 'luxmeter', measuredAt: now - 1500 },
            distance: { value: 47.34, source: 'camera', measuredAt: now - 30 },
            luxTarget: null,
            distanceTarget: null,
            nowMs: now,
        });
        expect(fields).toEqual([
            ['lux_value', '212.5'],
            ['lux_source', 'luxmeter'],
            ['distance_cm', '47.3'],
            ['distance_source', 'camera'],
        ]);
    });

    it('bacaan basi tidak dikirim', () => {
        const fields = sensorFormFields({
            lux: { value: 212, source: 'camera', measuredAt: now - (SENSOR_MAX_AGE_S * 1000 + 1) },
            distance: { value: 60, source: 'sensor', measuredAt: now - 60_000 },
            luxTarget: null,
            distanceTarget: null,
            nowMs: now,
        });
        expect(fields).toEqual([]);
    });
});

describe('parseTargetParam dan formatMeasured', () => {
    it('query string kosong atau tidak valid bukan target', () => {
        expect(parseTargetParam(null)).toBeNull();
        expect(parseTargetParam('')).toBeNull();
        expect(parseTargetParam('abc')).toBeNull();
        expect(parseTargetParam('0')).toBeNull();
        expect(parseTargetParam('75')).toBe(75);
    });

    it('null ditampilkan sebagai Tidak terukur', () => {
        expect(formatMeasured(null, 'Lux')).toBe(NOT_MEASURED_LABEL);
        expect(formatMeasured(undefined, 'cm')).toBe(NOT_MEASURED_LABEL);
        expect(formatMeasured(212.6, 'Lux')).toBe('213 Lux');
        expect(formatMeasured(47.34, 'cm', 1)).toBe('47.3 cm');
    });
});

describe('lux perkiraan kamera', () => {
    const now = 1_000_000;
    const estimate = {
        method: 'human_face_photometry',
        profile: 'LAPTOP_DEFAULT',
        factor: 1,
        offset: 0,
        glare_compensated: false,
        face_targeted: true,
    };

    it('mengirim rincian perkiraan hanya untuk sumber camera', () => {
        const camera = sensorFormFields({
            lux: { value: 212.44, source: 'camera', measuredAt: now - 500, estimate },
            distance: null, luxTarget: null, distanceTarget: null, nowMs: now,
        });
        expect(camera).toContainEqual(['lux_value', '212.4']);
        expect(camera).toContainEqual(['lux_source', 'camera']);
        expect(JSON.parse(camera.find(([k]) => k === 'lux_estimate')![1])).toEqual(estimate);

        const luxmeter = sensorFormFields({
            lux: { value: 212.44, source: 'luxmeter', measuredAt: now - 500, estimate },
            distance: null, luxTarget: null, distanceTarget: null, nowMs: now,
        });
        expect(luxmeter.some(([k]) => k === 'lux_estimate')).toBe(false);
    });

    it('perkiraan diberi ~ dan label estimasi; hasil ukur tidak', () => {
        expect(formatLux(212.4, 'camera')).toBe('~212 Lux');
        expect(formatLux(212.4, 'luxmeter')).toBe('212 Lux');
        expect(formatLux(null, 'camera')).toBe(NOT_MEASURED_LABEL);
        expect(luxSourceLabel('camera')).toBe('Perkiraan kamera (belum dikalibrasi)');
        expect(luxSourceLabel('camera_calibrated')).toBe('Kamera terkalibrasi');
        expect(luxSourceLabel('luxmeter')).toBe('Luxmeter');
    });
});
