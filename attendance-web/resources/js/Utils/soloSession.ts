/**
 * Mode solo Studio: peneliti merekam dirinya sendiri (P_DEV_01) untuk split
 * calibration_dev tanpa menyentuh mouse saat berdiri di penanda lantai.
 *
 * Satu sel = label sampel x tingkat lux x jarak (4 x 3 x 3 = 36 sel). Antrean
 * menjalankan N repetisi beruntun untuk satu sel; pergantian sel tetap dipicu
 * operator karena lampu atau artefak serangan harus diganti secara fisik.
 */
import { DISTANCE_BANDS, DistanceGateDecision } from './distanceCalibration';

export const SOLO_PARTICIPANT_ID = 'P_DEV_01';
export const SOLO_DATASET_SPLIT = 'calibration_dev';
// Session-C, pasangan Session-E (pendaftaran) dan Session-T (uji).
export const SOLO_SESSION_TYPE = 'CALIBRATION';
/** Wajah harus lolos gerbang kualitas dan jarak selama ini sebelum hitung mundur. */
export const SOLO_HOLD_MS = 1500;
/** Jeda di antara dua repetisi, dihitung sejak hasil verifikasi diterima. */
export const SOLO_REST_MS = 4000;
export const SOLO_DEFAULT_REPETITIONS = 10;

export type SoloSample = 'bona_fide' | 'print_attack' | 'screen_attack' | 'replay_video';
export type SoloLuxLevel = 'redup' | 'normal' | 'terang';
export type SoloDistance = 30 | 45 | 60;

export const SOLO_SAMPLES: readonly SoloSample[] = ['bona_fide', 'print_attack', 'screen_attack', 'replay_video'];
export const SOLO_LUX_LEVELS: readonly SoloLuxLevel[] = ['redup', 'normal', 'terang'];
export const SOLO_DISTANCES: readonly SoloDistance[] = [30, 45, 60];

// Sama dengan tombol preset LuxometerWidget. Yang dibandingkan adalah kategori
// naskah (<100, 100-300, >300); angkanya hanya wakil kategori itu.
export const SOLO_LUX_TARGETS: Record<SoloLuxLevel, number> = { redup: 75, normal: 300, terang: 650 };

export const SOLO_SAMPLE_LABELS: Record<SoloSample, string> = {
    bona_fide: 'Bona fide (wajah langsung)',
    print_attack: 'Print attack (foto cetak)',
    screen_attack: 'Screen attack (foto di layar)',
    replay_video: 'Replay video',
};

export const SOLO_LUX_LABELS: Record<SoloLuxLevel, string> = {
    redup: 'Redup (<100 lux)',
    normal: 'Normal (100-300 lux)',
    terang: 'Terang (>300 lux)',
};

export interface SoloCell {
    sample: SoloSample;
    lux: SoloLuxLevel;
    distanceCm: SoloDistance;
}

export function cellKey(cell: SoloCell): string {
    return `${cell.sample}|${cell.lux}|${cell.distanceCm}`;
}

/** Semua sel, urut label sampel lalu lux lalu jarak. */
export function buildSoloQueue(): SoloCell[] {
    const cells: SoloCell[] = [];
    for (const sample of SOLO_SAMPLES) {
        for (const lux of SOLO_LUX_LEVELS) {
            for (const distanceCm of SOLO_DISTANCES) {
                cells.push({ sample, lux, distanceCm });
            }
        }
    }
    return cells;
}

export function parseCellKey(key: string | null | undefined): SoloCell | null {
    if (!key) return null;
    return buildSoloQueue().find((cell) => cellKey(cell) === key) ?? null;
}

export function isAttack(sample: SoloSample): boolean {
    return sample !== 'bona_fide';
}

/** Field formulir presensi yang menandai satu presentasi sebagai calibration_dev. */
export function soloFormFields(cell: SoloCell): Array<[string, string]> {
    const fields: Array<[string, string]> = [
        ['participant_id', SOLO_PARTICIPANT_ID],
        ['subject_id', SOLO_PARTICIPANT_ID],
        ['dataset_split', SOLO_DATASET_SPLIT],
        ['session_type', SOLO_SESSION_TYPE],
        ['sample_type', isAttack(cell.sample) ? 'ATTACK' : 'BONA_FIDE'],
    ];
    if (isAttack(cell.sample)) fields.push(['pai_species', cell.sample]);
    return fields;
}

/* ------------------------------------------------------------------ */
/*  Gerbang jarak                                                      */
/* ------------------------------------------------------------------ */

/**
 * Gerbang jarak mode solo di atas distancePrecheck():
 * - Serangan: jarak dari lebar wajah mengukur ukuran wajah di foto/layar, bukan
 *   jarak artefak ke kamera, jadi tidak pernah menahan hitung mundur. Kondisi
 *   jaraknya adalah penanda lantai (target skenario).
 * - Bona fide dengan kalibrasi: hanya rentang milik target yang boleh lanjut.
 * - Tanpa kalibrasi: keputusan distancePrecheck() apa adanya (tidak memblokir).
 */
export function soloDistanceGate(
    base: DistanceGateDecision,
    { calibrated, targetCm, attack }: { calibrated: boolean; targetCm: number | null; attack: boolean },
): DistanceGateDecision {
    if (attack) {
        return { blocked: false, classification: base.classification, guidance: null };
    }
    const band = DISTANCE_BANDS.find((b) => b.target_cm === targetCm);
    if (!calibrated || !band) return base;

    const cm = base.classification.distance_cm;
    if (cm === null) {
        return { ...base, blocked: true };
    }
    if (cm >= band.min_cm && cm <= band.max_cm) {
        return { blocked: false, classification: base.classification, guidance: null };
    }
    return {
        blocked: true,
        classification: base.classification,
        guidance: `${cm < band.min_cm ? 'Mundur' : 'Maju'} ke ${band.min_cm}-${band.max_cm} cm (target ${band.target_cm} cm)`,
    };
}

/* ------------------------------------------------------------------ */
/*  Antrean repetisi                                                   */
/* ------------------------------------------------------------------ */

export type BatchPhase = 'idle' | 'armed' | 'processing' | 'resting' | 'done' | 'error';

export interface BatchState {
    phase: BatchPhase;
    cell: SoloCell | null;
    target: number;
    completed: number;
    restEndsAt: number | null;
    error: string | null;
}

export type BatchEvent =
    | { type: 'START'; cell: SoloCell; repetitions: number }
    | { type: 'SUBMITTED' }
    | { type: 'RESULT'; ok: true; now: number }
    | { type: 'RESULT'; ok: false; error: string }
    | { type: 'REST_DONE' }
    | { type: 'STOP' };

export const INITIAL_BATCH: BatchState = {
    phase: 'idle',
    cell: null,
    target: 0,
    completed: 0,
    restEndsAt: null,
    error: null,
};

/**
 * armed: pemindai menunggu wajah stabil lalu merekam sendiri.
 * processing: rekaman 8 s terkirim, menunggu keputusan server.
 * resting: jeda SOLO_REST_MS sebelum repetisi berikutnya.
 * Galat server menghentikan antrean agar repetisi yang gagal tidak terlewat diam-diam.
 */
export function batchReducer(state: BatchState, event: BatchEvent): BatchState {
    switch (event.type) {
        case 'START':
            if (!(event.repetitions >= 1)) return state;
            return { ...INITIAL_BATCH, phase: 'armed', cell: event.cell, target: Math.floor(event.repetitions) };
        case 'SUBMITTED':
            return state.phase === 'armed' ? { ...state, phase: 'processing' } : state;
        case 'RESULT':
            if (state.phase !== 'processing') return state;
            if (!event.ok) return { ...state, phase: 'error', error: event.error };
            {
                const completed = state.completed + 1;
                return completed >= state.target
                    ? { ...state, completed, phase: 'done', restEndsAt: null }
                    : { ...state, completed, phase: 'resting', restEndsAt: event.now + SOLO_REST_MS };
            }
        case 'REST_DONE':
            return state.phase === 'resting' ? { ...state, phase: 'armed', restEndsAt: null } : state;
        case 'STOP':
            return { ...INITIAL_BATCH, cell: state.cell };
        default:
            return state;
    }
}

export function batchRunning(state: BatchState): boolean {
    return state.phase === 'armed' || state.phase === 'processing' || state.phase === 'resting';
}

/* ------------------------------------------------------------------ */
/*  Penyimpanan per peramban                                           */
/* ------------------------------------------------------------------ */

export interface SoloProgress {
    enabled: boolean;
    repetitions: number;
    activeKey: string | null;
    /** Repetisi yang sudah tercatat server per sel; hanya penanda kemajuan di layar. */
    counts: Record<string, number>;
}

export const SOLO_STORAGE_KEY = 'presensi_solo_calibration_dev';

export const DEFAULT_PROGRESS: SoloProgress = {
    enabled: false,
    repetitions: SOLO_DEFAULT_REPETITIONS,
    activeKey: null,
    counts: {},
};

export function parseProgress(raw: string | null): SoloProgress {
    if (!raw) return DEFAULT_PROGRESS;
    try {
        const data = JSON.parse(raw) as Partial<SoloProgress>;
        const counts: Record<string, number> = {};
        for (const [key, value] of Object.entries(data.counts ?? {})) {
            if (parseCellKey(key) && Number.isInteger(value) && (value as number) >= 0) counts[key] = value as number;
        }
        const repetitions = Number.isInteger(data.repetitions) && (data.repetitions as number) >= 1
            ? (data.repetitions as number)
            : SOLO_DEFAULT_REPETITIONS;
        return {
            enabled: data.enabled === true,
            repetitions,
            activeKey: parseCellKey(data.activeKey) ? (data.activeKey as string) : null,
            counts,
        };
    } catch {
        return DEFAULT_PROGRESS;
    }
}

export function loadProgress(): SoloProgress {
    try {
        return parseProgress(window.localStorage.getItem(SOLO_STORAGE_KEY));
    } catch {
        return DEFAULT_PROGRESS;
    }
}

export function saveProgress(progress: SoloProgress): void {
    try {
        window.localStorage.setItem(SOLO_STORAGE_KEY, JSON.stringify(progress));
    } catch {
        // Penyimpanan diblokir (mode privat): kemajuan hanya hilang dari layar, data tetap di server.
    }
}

/** Sel pertama sesudah `fromKey` yang repetisinya belum lengkap; null bila semua lengkap. */
export function nextIncompleteCell(progress: SoloProgress, fromKey: string | null): SoloCell | null {
    const queue = buildSoloQueue();
    const start = fromKey ? queue.findIndex((cell) => cellKey(cell) === fromKey) + 1 : 0;
    for (let i = 0; i < queue.length; i++) {
        const cell = queue[(start + i) % queue.length];
        if ((progress.counts[cellKey(cell)] ?? 0) < progress.repetitions) return cell;
    }
    return null;
}

export function totalCompleted(progress: SoloProgress): number {
    return Object.values(progress.counts).reduce((sum, n) => sum + n, 0);
}
