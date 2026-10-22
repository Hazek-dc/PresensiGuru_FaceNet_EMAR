import { describe, expect, it } from 'vitest';
import { classifyDistance, DistanceGateDecision } from '../distanceCalibration';
import {
    batchReducer,
    buildSoloQueue,
    cellKey,
    DEFAULT_PROGRESS,
    INITIAL_BATCH,
    nextIncompleteCell,
    parseProgress,
    SOLO_REST_MS,
    SoloCell,
    soloDistanceGate,
    soloFormFields,
} from '../soloSession';

const bonaFide60: SoloCell = { sample: 'bona_fide', lux: 'normal', distanceCm: 60 };
const screen30: SoloCell = { sample: 'screen_attack', lux: 'redup', distanceCm: 30 };

/** Keputusan distancePrecheck() kamera terkalibrasi pada jarak cm. */
function calibratedGate(cm: number | null): DistanceGateDecision {
    const classification = classifyDistance(cm, true);
    return { blocked: !classification.allow_verification, classification, guidance: classification.allow_verification ? null : classification.message };
}

describe('antrean sel mode solo', () => {
    it('4 label x 3 lux x 3 jarak = 36 sel unik', () => {
        const queue = buildSoloQueue();
        expect(queue).toHaveLength(36);
        expect(new Set(queue.map(cellKey)).size).toBe(36);
    });

    it('field formulir: serangan membawa spesies, bona fide tidak', () => {
        expect(Object.fromEntries(soloFormFields(bonaFide60))).toEqual({
            participant_id: 'P_DEV_01',
            subject_id: 'P_DEV_01',
            dataset_split: 'calibration_dev',
            session_type: 'CALIBRATION',
            sample_type: 'BONA_FIDE',
        });
        expect(Object.fromEntries(soloFormFields(screen30))).toMatchObject({
            sample_type: 'ATTACK',
            pai_species: 'screen_attack',
        });
    });
});

describe('gerbang jarak mode solo', () => {
    it('bona fide terkalibrasi hanya lanjut di rentang target', () => {
        const opts = { calibrated: true, targetCm: 60, attack: false };
        expect(soloDistanceGate(calibratedGate(64.2), opts).blocked).toBe(false);
        // 50 cm sah untuk Studio biasa (45-55) tetapi bukan target 60.
        const wrongBand = soloDistanceGate(calibratedGate(50), opts);
        expect(wrongBand.blocked).toBe(true);
        expect(wrongBand.guidance).toBe('Mundur ke 60-70 cm (target 60 cm)');
        expect(soloDistanceGate(calibratedGate(72), opts).guidance).toBe('Maju ke 60-70 cm (target 60 cm)');
        expect(soloDistanceGate(calibratedGate(null), opts).blocked).toBe(true);
    });

    it('serangan tidak pernah ditahan jarak lebar wajah', () => {
        const gate = soloDistanceGate(calibratedGate(95), { calibrated: true, targetCm: 30, attack: true });
        expect(gate.blocked).toBe(false);
        expect(gate.guidance).toBeNull();
    });

    it('tanpa kalibrasi keputusan dasar tidak diubah', () => {
        const base = { ...calibratedGate(50), blocked: false };
        expect(soloDistanceGate(base, { calibrated: false, targetCm: 60, attack: false })).toBe(base);
    });
});

describe('antrean repetisi', () => {
    it('menjalankan N repetisi dengan jeda di antaranya', () => {
        let s = batchReducer(INITIAL_BATCH, { type: 'START', cell: bonaFide60, repetitions: 2 });
        expect(s.phase).toBe('armed');
        s = batchReducer(s, { type: 'SUBMITTED' });
        expect(s.phase).toBe('processing');
        s = batchReducer(s, { type: 'RESULT', ok: true, now: 1000 });
        expect(s).toMatchObject({ phase: 'resting', completed: 1, restEndsAt: 1000 + SOLO_REST_MS });
        s = batchReducer(s, { type: 'REST_DONE' });
        expect(s.phase).toBe('armed');
        s = batchReducer(batchReducer(s, { type: 'SUBMITTED' }), { type: 'RESULT', ok: true, now: 9000 });
        expect(s).toMatchObject({ phase: 'done', completed: 2, restEndsAt: null });
    });

    it('galat server menghentikan antrean', () => {
        let s = batchReducer(INITIAL_BATCH, { type: 'START', cell: screen30, repetitions: 10 });
        s = batchReducer(batchReducer(s, { type: 'SUBMITTED' }), { type: 'RESULT', ok: false, error: 'HTTP 422' });
        expect(s).toMatchObject({ phase: 'error', completed: 0, error: 'HTTP 422' });
        // Hasil yang datang terlambat tidak dihitung.
        expect(batchReducer(s, { type: 'RESULT', ok: true, now: 1 })).toBe(s);
    });

    it('hasil di luar fase processing diabaikan', () => {
        const armed = batchReducer(INITIAL_BATCH, { type: 'START', cell: bonaFide60, repetitions: 3 });
        expect(batchReducer(armed, { type: 'RESULT', ok: true, now: 1 })).toBe(armed);
        expect(batchReducer(INITIAL_BATCH, { type: 'SUBMITTED' })).toBe(INITIAL_BATCH);
    });

    it('repetisi tidak sah tidak memulai antrean', () => {
        expect(batchReducer(INITIAL_BATCH, { type: 'START', cell: bonaFide60, repetitions: 0 })).toBe(INITIAL_BATCH);
    });
});

describe('kemajuan tersimpan', () => {
    it('data rusak atau kunci asing dibuang', () => {
        expect(parseProgress('{bukan json')).toEqual(DEFAULT_PROGRESS);
        const parsed = parseProgress(JSON.stringify({
            enabled: true,
            repetitions: 10,
            activeKey: 'bona_fide|normal|60',
            counts: { 'bona_fide|normal|60': 4, 'asing|x|1': 9, 'print_attack|redup|30': -1 },
        }));
        expect(parsed).toEqual({ enabled: true, repetitions: 10, activeKey: 'bona_fide|normal|60', counts: { 'bona_fide|normal|60': 4 } });
    });

    it('sel berikutnya melewati sel yang sudah lengkap', () => {
        const progress = { ...DEFAULT_PROGRESS, repetitions: 2, counts: { 'bona_fide|redup|45': 2 } };
        expect(cellKey(nextIncompleteCell(progress, 'bona_fide|redup|30')!)).toBe('bona_fide|redup|60');
        const allDone = { ...progress, counts: Object.fromEntries(buildSoloQueue().map((c) => [cellKey(c), 2])) };
        expect(nextIncompleteCell(allDone, null)).toBeNull();
    });
});
