import { describe, expect, it } from 'vitest';
import {
    ActiveCalibration,
    calibrationAppliesTo,
    cameraFormFields,
    cameraInfoFromTrack,
    categoryLabel,
    classifyDistance,
    DEFAULT_MAX_RESIDUAL_CM,
    distancePrecheck,
    engineDistanceNoteLabel,
    distanceSourceLabel,
    estimateFromRatio,
    faceWidthRatio,
    fitInverseModel,
    median,
    parseCurrentCalibration,
    phpFmt,
    phpRound,
    recordedDistance,
    round1,
} from '../distanceCalibration';
import { sensorFormFields } from '../sensorReading';

function landmarksWithCheeks(left: number, right: number, count = 478) {
    const lms = Array.from({ length: count }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    if (count > 454) {
        lms[234] = { x: left, y: 0.5, z: 0 };
        lms[454] = { x: right, y: 0.5, z: 0 };
    }
    return lms;
}

// Model sintetis a/r + b; rasio tiap titik dibuat tepat dari model ini.
const A = 12.6;
const B = 0.5;
const ratioAt = (cm: number) => A / (cm - B);

// Tabel kasus sama dengan tests/Feature/DistanceCheckTest.php (DistanceModel PHP).
describe('classifyDistance: skenario uji PRD T01-T07', () => {
    const cases: Array<[string, number, string, string]> = [
        ['T01', 30, 'DEKAT', 'Posisi dekat (30-40 cm)'],
        ['T02', 35, 'DEKAT', 'Posisi dekat (30-40 cm)'],
        ['T03', 45, 'IDEAL', 'Posisi sesuai (45-55 cm)'],
        ['T04', 50, 'IDEAL', 'Posisi sesuai (45-55 cm)'],
        ['T05', 55, 'IDEAL', 'Posisi sesuai (45-55 cm)'],
        ['T06', 60, 'JAUH', 'Posisi jauh (60-70 cm)'],
        ['T07', 70, 'JAUH', 'Posisi jauh (60-70 cm)'],
    ];
    for (const [id, cm, category, message] of cases) {
        it(`${id} ${cm} cm: ${category}, boleh lanjut (D1: ketiga rentang di semua mode)`, () => {
            expect(classifyDistance(cm, true)).toEqual({ distance_cm: cm, category, allow_verification: true, message });
        });
    }

    it('wajah tidak terdeteksi: INVALID, jarak tidak dilaporkan', () => {
        expect(classifyDistance(45, false)).toEqual({
            distance_cm: null,
            category: 'INVALID',
            allow_verification: false,
            message: 'Wajah belum terdeteksi',
        });
        expect(classifyDistance(null, false).message).toBe('Wajah belum terdeteksi');
    });
});

describe('classifyDistance: batas rentang', () => {
    it('batas rentang inklusif', () => {
        for (const [cm, category] of [
            [30, 'DEKAT'],
            [40, 'DEKAT'],
            [45, 'IDEAL'],
            [55, 'IDEAL'],
            [60, 'JAUH'],
            [70, 'JAUH'],
        ] as const) {
            const result = classifyDistance(cm, true);
            expect(result.category).toBe(category);
            expect(result.allow_verification).toBe(true);
        }
    });

    it('tepat di luar batas: INVALID dengan arahan ke rentang terdekat', () => {
        const cases: Array<[number, string]> = [
            [29.9, 'Mundur ke 30-40 cm'],
            [40.1, 'Maju ke 30-40 cm'],
            [44.9, 'Mundur ke 45-55 cm'],
            [55.1, 'Maju ke 45-55 cm'],
            [59.9, 'Mundur ke 60-70 cm'],
            [70.1, 'Maju ke 60-70 cm'],
            [0, 'Mundur ke 30-40 cm'],
            [150, 'Maju ke 60-70 cm'],
            // Kasus INVALID di DistanceCheckTest.php
            [42, 'Maju ke 30-40 cm'],
            [44, 'Mundur ke 45-55 cm'],
            [56, 'Maju ke 45-55 cm'],
            [90, 'Maju ke 60-70 cm'],
            [10, 'Mundur ke 30-40 cm'],
        ];
        for (const [cm, message] of cases) {
            const result = classifyDistance(cm, true);
            expect(result.category, `${cm} cm`).toBe('INVALID');
            expect(result.allow_verification).toBe(false);
            expect(result.message, `${cm} cm`).toBe(message);
        }
    });

    it('tepat di tengah celah diarahkan mundur ke rentang berikutnya', () => {
        expect(classifyDistance(42.5, true).message).toBe('Mundur ke 45-55 cm');
        expect(classifyDistance(57.5, true).message).toBe('Mundur ke 60-70 cm');
        expect(classifyDistance(42.4, true).message).toBe('Maju ke 30-40 cm');
        expect(classifyDistance(57.4, true).message).toBe('Maju ke 45-55 cm');
    });

    it('jarak dibulatkan 0,1 cm sebelum dibandingkan, seperti DistanceModel::classify()', () => {
        expect(classifyDistance(40.04, true)).toMatchObject({ distance_cm: 40, category: 'DEKAT', allow_verification: true });
        expect(classifyDistance(40.05, true)).toMatchObject({ distance_cm: 40.1, category: 'INVALID', message: 'Maju ke 30-40 cm' });
        expect(classifyDistance(29.96, true)).toMatchObject({ distance_cm: 30, category: 'DEKAT' });
        expect(classifyDistance(47.349, true).distance_cm).toBe(47.3);
    });

    it('jarak null atau tidak berhingga dengan wajah terdeteksi: belum terukur', () => {
        for (const cm of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(classifyDistance(cm, true)).toEqual({
                distance_cm: null,
                category: 'INVALID',
                allow_verification: false,
                message: 'Jarak belum terukur',
            });
        }
    });

    it('label kategori untuk tampilan riwayat', () => {
        expect(categoryLabel('DEKAT')).toBe('Dekat (30-40 cm)');
        expect(categoryLabel('IDEAL')).toBe('Ideal (45-55 cm)');
        expect(categoryLabel('JAUH')).toBe('Jauh (60-70 cm)');
        expect(categoryLabel('INVALID')).toBe('Di luar rentang');
        expect(categoryLabel(null)).toBeNull();
    });
});

describe('faceWidthRatio dan median', () => {
    it('rasio dari landmark pipi 234 dan 454, arah cermin tidak berpengaruh', () => {
        expect(faceWidthRatio(landmarksWithCheeks(0.35, 0.65))).toBeCloseTo(0.3, 12);
        expect(faceWidthRatio(landmarksWithCheeks(0.65, 0.35))).toBeCloseTo(0.3, 12);
    });

    it('landmark kurang atau lebar nol menghasilkan null', () => {
        expect(faceWidthRatio(null)).toBeNull();
        expect(faceWidthRatio([{ x: 0.5 }])).toBeNull();
        expect(faceWidthRatio(landmarksWithCheeks(0.4, 0.4))).toBeNull();
    });

    it('median ganjil, genap, dan mengabaikan nilai kosong', () => {
        expect(median([0.3, 0.1, 0.2])).toBe(0.2);
        expect(median([0.4, 0.1, 0.2, 0.3])).toBeCloseTo(0.25, 12);
        expect(median([null, 0.2, undefined, Number.NaN])).toBe(0.2);
        expect(median([])).toBeNull();
    });
});

describe('fitInverseModel dan estimateFromRatio', () => {
    const exactPoints = [30, 45, 60].map((cm) => ({ target_cm: cm, ratio: ratioAt(cm) }));

    it('titik tepat dari model: a dan b kembali, residu nol', () => {
        const fit = fitInverseModel(exactPoints);
        expect(fit.ok).toBe(true);
        expect(fit.reason).toBeNull();
        expect(fit.model?.a).toBeCloseTo(A, 9);
        expect(fit.model?.b).toBeCloseTo(B, 9);
        expect(fit.model?.max_residual_cm).toBeCloseTo(0, 9);
    });

    it('bolak-balik: estimasi pada rasio titik kalibrasi kembali ke jaraknya', () => {
        const fit = fitInverseModel(exactPoints);
        for (const cm of [30, 45, 60, 37.5, 52]) {
            expect(estimateFromRatio(ratioAt(cm), fit.model)).toBe(cm);
        }
    });

    it('urutan titik dan titik ganda: yang terakhir untuk target yang sama dipakai', () => {
        const fit = fitInverseModel([
            { target_cm: 60, ratio: ratioAt(60) },
            { target_cm: 30, ratio: 0.9 },
            { target_cm: 45, ratio: ratioAt(45) },
            { target_cm: 30, ratio: ratioAt(30) },
        ]);
        expect(fit.ok).toBe(true);
        expect(fit.model?.a).toBeCloseTo(A, 9);
    });

    it('residu dihitung per titik; derau kecil masih sah', () => {
        const noisy = [
            { target_cm: 30, ratio: ratioAt(31) },
            { target_cm: 45, ratio: ratioAt(44) },
            { target_cm: 60, ratio: ratioAt(61) },
        ];
        const fit = fitInverseModel(noisy);
        expect(fit.ok).toBe(true);
        expect(fit.points).toHaveLength(3);
        const maxAbs = Math.max(...fit.points.map((p) => Math.abs(p.residual_cm)));
        expect(fit.model?.max_residual_cm).toBe(maxAbs);
        for (const p of fit.points) {
            // Residu dibulatkan 0,01 cm seperti DistanceModel::fit().
            expect(Math.abs(p.fitted_cm + p.residual_cm - p.target_cm)).toBeLessThanOrEqual(0.005 + 1e-9);
            expect(phpRound(p.residual_cm, 2)).toBe(p.residual_cm);
        }
    });

    it('rasio di luar (0, 1] dianggap titik belum ada', () => {
        const fit = fitInverseModel([{ target_cm: 30, ratio: 1.2 }, ...exactPoints.slice(1)]);
        expect(fit.reason).toBe('missing_points');
        expect(fit.message).toBe('Titik kalibrasi belum lengkap: 30 cm belum terekam.');
    });

    // Teks alasan sama dengan DistanceModel::fit() (DistanceCalibrationTest.php).
    it('titik belum lengkap ditolak', () => {
        const fit = fitInverseModel(exactPoints.slice(0, 2));
        expect(fit.ok).toBe(false);
        expect(fit.reason).toBe('missing_points');
        expect(fit.model).toBeNull();
        expect(fit.message).toBe('Titik kalibrasi belum lengkap: 60 cm belum terekam.');
        expect(fitInverseModel([{ target_cm: 30, ratio: null }]).message).toBe(
            'Titik kalibrasi belum lengkap: 30 cm, 45 cm, 60 cm belum terekam.',
        );
    });

    it('rasio harus menurun tegas dari 30 ke 45 ke 60 cm', () => {
        const flat = fitInverseModel([
            { target_cm: 30, ratio: 0.42 },
            { target_cm: 45, ratio: 0.28 },
            { target_cm: 60, ratio: 0.28 },
        ]);
        expect(flat.reason).toBe('ratios_not_decreasing');
        expect(flat.model).toBeNull();
        expect(flat.message).toBe(
            'Rasio lebar wajah tidak mengecil dari 45 cm ke 60 cm (0.2800 lalu 0.2800). Ulangi perekaman dengan jarak yang diukur meteran.',
        );
        const swapped = fitInverseModel([
            { target_cm: 30, ratio: 0.28 },
            { target_cm: 45, ratio: 0.42 },
            { target_cm: 60, ratio: 0.21 },
        ]);
        expect(swapped.reason).toBe('ratios_not_decreasing');
        expect(swapped.message).toContain('tidak mengecil dari 30 cm ke 45 cm');
    });

    it('residu di atas batas ditolak tetapi model tetap dilaporkan', () => {
        const bent = [
            { target_cm: 30, ratio: ratioAt(30) },
            { target_cm: 45, ratio: ratioAt(55) },
            { target_cm: 60, ratio: ratioAt(60) },
        ];
        const fit = fitInverseModel(bent);
        expect(fit.ok).toBe(false);
        expect(fit.reason).toBe('residual_too_large');
        expect(fit.model?.max_residual_cm ?? 0).toBeGreaterThan(DEFAULT_MAX_RESIDUAL_CM);
        expect(fitInverseModel(bent, 50).ok).toBe(true);
    });

    it('kasus meleset di DistanceCheckTest.php: sisa > 3 cm dengan teks yang sama', () => {
        const fit = fitInverseModel([
            { target_cm: 30, ratio: 0.42 },
            { target_cm: 45, ratio: 0.4 },
            { target_cm: 60, ratio: 0.21 },
        ]);
        expect(fit.reason).toBe('residual_too_large');
        const residual = fit.model?.max_residual_cm ?? 0;
        expect(residual).toBeGreaterThan(3);
        expect(fit.message).toBe(
            `Sisa model ${phpFmt(residual, 2)} cm melebihi batas 3 cm. Ulangi perekaman titik yang meleset.`,
        );
    });

    it('phpFmt membuang nol di belakang seperti DistanceModel::fmt()', () => {
        expect(phpFmt(3, 2)).toBe('3');
        expect(phpFmt(3.5, 2)).toBe('3.5');
        expect(phpFmt(4.126, 2)).toBe('4.13');
        expect(phpFmt(100, 1)).toBe('100');
        expect(phpFmt(42.5)).toBe('42.5');
    });

    it('estimasi null tanpa rasio atau model sah; dibulatkan 0,1 cm', () => {
        const model = { a: A, b: B, max_residual_cm: 0 };
        expect(estimateFromRatio(null, model)).toBeNull();
        expect(estimateFromRatio(0, model)).toBeNull();
        expect(estimateFromRatio(-0.2, model)).toBeNull();
        expect(estimateFromRatio(0.3, null)).toBeNull();
        expect(estimateFromRatio(0.3, { a: -1, b: 0, max_residual_cm: 0 })).toBeNull();
        expect(estimateFromRatio(0.3, { a: 0, b: 50, max_residual_cm: 0 })).toBeNull();
        expect(estimateFromRatio(0.3, model)).toBe(42.5);
        expect(estimateFromRatio(0.31, model)).toBe(round1(A / 0.31 + B));
    });

    it('round1/phpRound sama dengan round() PHP 8.3 (setengah menjauhi nol, pra-pembulatan)', () => {
        expect(round1(42.25)).toBe(42.3);
        expect(round1(-42.25)).toBe(-42.3);
        expect(round1(47.34)).toBe(47.3);
        expect(round1(40.05)).toBe(40.1);
        expect(phpRound(1.005, 2)).toBe(1.01);
        expect(phpRound(2.675, 2)).toBe(2.68);
    });
});

describe('distancePrecheck (gerbang sebelum pemindaian 8 s)', () => {
    it('terkalibrasi dan di luar rentang: diblokir dengan arahan', () => {
        const gate = distancePrecheck({ calibrated: true, distanceCm: 42, faceDetected: true });
        expect(gate.blocked).toBe(true);
        expect(gate.guidance).toBe('Maju ke 30-40 cm');
    });

    it('terkalibrasi, wajah hilang atau jarak belum terukur: diblokir', () => {
        expect(distancePrecheck({ calibrated: true, distanceCm: 50, faceDetected: false }).blocked).toBe(true);
        expect(distancePrecheck({ calibrated: true, distanceCm: null, faceDetected: true }).blocked).toBe(true);
    });

    it('terkalibrasi dan di salah satu rentang: lanjut di semua rentang', () => {
        for (const cm of [30, 35, 50, 65, 70]) {
            const gate = distancePrecheck({ calibrated: true, distanceCm: cm, faceDetected: true });
            expect(gate.blocked, `${cm} cm`).toBe(false);
            expect(gate.guidance).toBeNull();
        }
    });

    it('belum terkalibrasi: arahan tetap tampil tetapi tidak memblokir', () => {
        const gate = distancePrecheck({ calibrated: false, distanceCm: 90, faceDetected: true });
        expect(gate.blocked).toBe(false);
        expect(gate.guidance).toBe('Maju ke 60-70 cm');
        expect(distancePrecheck({ calibrated: false, distanceCm: null, faceDetected: true }).blocked).toBe(false);
    });
});

const calibration: ActiveCalibration = {
    id: 7,
    camera_label: 'EYESEC USB Camera (1bcf:2284)',
    resolution_w: 1920,
    resolution_h: 1080,
    browser: { a: A, b: B, max_residual_cm: 0.4 },
    engine: null,
    points: [],
    created_at: '2026-09-27T08:00:00Z',
};

describe('respons kalibrasi dan kecocokan kamera', () => {
    it('parseCurrentCalibration menerima kalibrasi sah', () => {
        const parsed = parseCurrentCalibration({
            calibrated: true,
            calibration: {
                ...calibration,
                engine: { a: 10.2, b: 1.1, max_residual_cm: 0.9 },
                points: [{ target_cm: 30, browser_ratio: 0.43, engine_ratio: 0.36 }],
            },
        });
        expect(parsed?.id).toBe(7);
        expect(parsed?.browser.a).toBe(A);
        expect(parsed?.engine?.a).toBe(10.2);
        expect(parsed?.points).toEqual([{ target_cm: 30, browser_ratio: 0.43, engine_ratio: 0.36 }]);
    });

    it('parseCurrentCalibration menolak respons belum terkalibrasi atau model rusak', () => {
        expect(parseCurrentCalibration({ calibrated: false, calibration: null })).toBeNull();
        expect(parseCurrentCalibration({ calibrated: true, calibration: { ...calibration, browser: { a: -3, b: 1 } } })).toBeNull();
        expect(parseCurrentCalibration({ calibrated: true, calibration: { ...calibration, browser: null } })).toBeNull();
        expect(parseCurrentCalibration(null)).toBeNull();
        expect(parseCurrentCalibration('<html>')).toBeNull();
    });

    it('kalibrasi berlaku untuk kamera yang sama dengan resolusi seaspek', () => {
        const camera = { label: 'EYESEC USB Camera (1bcf:2284)', deviceId: 'x', width: 1280, height: 720, fps: 30 };
        expect(calibrationAppliesTo(calibration, camera).applies).toBe(true);
        expect(calibrationAppliesTo(calibration, { ...camera, label: null }).applies).toBe(true);
    });

    it('kamera lain atau aspek lain tidak memakai kalibrasi', () => {
        const other = calibrationAppliesTo(calibration, { label: 'Integrated Webcam', deviceId: null, width: 1920, height: 1080, fps: 30 });
        expect(other.applies).toBe(false);
        expect(other.reason).toContain('EYESEC');
        const aspect = calibrationAppliesTo(calibration, { label: null, deviceId: null, width: 640, height: 480, fps: 30 });
        expect(aspect.applies).toBe(false);
        // Selisih aspek di bawah 2 % (sameAspect di PHP) masih dianggap sama.
        expect(calibrationAppliesTo(calibration, { label: null, deviceId: null, width: 1920, height: 1088, fps: 30 }).applies).toBe(true);
        expect(calibrationAppliesTo(null, null).applies).toBe(false);
    });

    it('sebelum kamera aktif kalibrasi belum dipakai', () => {
        expect(calibrationAppliesTo(calibration, null)).toEqual({ applies: false, reason: 'Kamera belum aktif' });
    });
});

describe('info kamera dan field form presensi', () => {
    it('info kamera dari track: nilai yang tidak dilaporkan tetap null', () => {
        const info = cameraInfoFromTrack({
            label: 'EYESEC USB Camera',
            getSettings: () => ({ deviceId: 'cam-1', width: 1920, height: 1080, frameRate: 30.000030517578125 }),
        });
        expect(info).toEqual({ label: 'EYESEC USB Camera', deviceId: 'cam-1', width: 1920, height: 1080, fps: 30 });
        expect(cameraInfoFromTrack({ getSettings: () => ({ width: 1280, height: 720 }) })).toEqual({
            label: null,
            deviceId: null,
            width: 1280,
            height: 720,
            fps: null,
        });
        expect(cameraInfoFromTrack(null)).toBeNull();
    });

    it('field kamera hanya berisi nilai yang diketahui', () => {
        expect(cameraFormFields({ label: 'EYESEC USB Camera', deviceId: 'c', width: 1920, height: 1080, fps: 30 }, 7)).toEqual([
            ['camera_label', 'EYESEC USB Camera'],
            ['camera_resolution', '1920x1080'],
            ['camera_fps', '30'],
            ['calibration_id', '7'],
        ]);
        expect(cameraFormFields({ label: null, deviceId: null, width: null, height: null, fps: null }, null)).toEqual([]);
        expect(cameraFormFields(null, undefined)).toEqual([]);
    });

    it('estimasi kamera terkalibrasi dikirim dengan sumbernya lewat sensorFormFields', () => {
        const now = 5_000_000;
        const fields = sensorFormFields({
            lux: null,
            distance: { value: 47.34, source: 'camera_calibrated', measuredAt: now - 100 },
            luxTarget: null,
            distanceTarget: null,
            nowMs: now,
        });
        expect(fields).toEqual([
            ['distance_cm', '47.3'],
            ['distance_source', 'camera_calibrated'],
        ]);
    });
});

describe('jarak tercatat di riwayat', () => {
    it('kategori dan sumber tersimpan ditampilkan apa adanya', () => {
        expect(recordedDistance({ distance_cm: 47.3, distance_category: 'IDEAL', distance_source: 'engine' })).toEqual({
            distanceCm: 47.3,
            category: 'Ideal (45-55 cm)',
            source: 'Engine, dari video (terkalibrasi)',
        });
    });

    it('catatan lama tanpa kategori diberi kategori dari jarak tersimpan', () => {
        expect(recordedDistance({ distance_cm: '62', distance_source: 'camera' })).toEqual({
            distanceCm: 62,
            category: 'Jauh (60-70 cm)',
            source: 'Kamera (estimasi, belum dikalibrasi)',
        });
    });

    it('tanpa jarak tidak ada kategori', () => {
        expect(recordedDistance({ distance_cm: null, distance_category: 'INVALID' })).toEqual({
            distanceCm: null,
            category: null,
            source: null,
        });
        expect(recordedDistance(undefined).distanceCm).toBeNull();
    });

    it('alasan jarak engine kosong', () => {
        expect(engineDistanceNoteLabel('no_calibration')).toBe('belum ada kalibrasi aktif');
        expect(engineDistanceNoteLabel('kode_baru')).toBe('kode_baru');
        expect(engineDistanceNoteLabel(null)).toBeNull();
    });

    it('label sumber', () => {
        expect(distanceSourceLabel('camera_calibrated')).toBe('Kamera terkalibrasi');
        expect(distanceSourceLabel('sensor')).toBe('Sensor jarak');
        expect(distanceSourceLabel('hardware_serial')).toBe('hardware_serial');
        expect(distanceSourceLabel(null)).toBeNull();
    });
});
