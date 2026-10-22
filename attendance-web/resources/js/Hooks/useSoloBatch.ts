import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CueName, playCue, unlockAudio } from '../Utils/audioCue';
import {
    batchReducer,
    batchRunning,
    buildSoloQueue,
    cellKey,
    DEFAULT_PROGRESS,
    INITIAL_BATCH,
    loadProgress,
    nextIncompleteCell,
    parseCellKey,
    saveProgress,
    SoloCell,
    SoloProgress,
} from '../Utils/soloSession';

const PHASE_CUES: Partial<Record<string, CueName>> = {
    resting: 'rest',
    done: 'done',
    error: 'error',
};

/**
 * Status mode solo: kemajuan per sel (localStorage) dan antrean repetisi.
 * onArm dipanggil tiap kali antrean siap merekam lagi (awal antrean dan sesudah
 * jeda), agar halaman mengosongkan hasil sebelumnya dan pemindai bersiap.
 */
export function useSoloBatch(onArm: () => void) {
    const [progress, setProgress] = useState<SoloProgress>(() =>
        typeof window === 'undefined' ? DEFAULT_PROGRESS : loadProgress(),
    );
    const [batch, dispatch] = useReducer(batchReducer, INITIAL_BATCH);
    const batchRef = useRef(batch);
    batchRef.current = batch;
    const onArmRef = useRef(onArm);
    onArmRef.current = onArm;

    useEffect(() => saveProgress(progress), [progress]);

    const activeCell: SoloCell | null = progress.enabled
        ? parseCellKey(progress.activeKey) ?? buildSoloQueue()[0]
        : null;

    useEffect(() => {
        if (batch.phase !== 'resting' || batch.restEndsAt === null) return;
        const id = window.setTimeout(() => dispatch({ type: 'REST_DONE' }), Math.max(0, batch.restEndsAt - Date.now()));
        return () => window.clearTimeout(id);
    }, [batch.phase, batch.restEndsAt]);

    const prevPhaseRef = useRef(batch.phase);
    useEffect(() => {
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = batch.phase;
        if (prev === batch.phase) return;
        if (batch.phase === 'armed') {
            if (prev === 'resting') playCue('resume');
            onArmRef.current();
            return;
        }
        const cue = PHASE_CUES[batch.phase];
        if (cue) playCue(cue);
    }, [batch.phase]);

    const setEnabled = useCallback((enabled: boolean) => {
        if (!enabled) dispatch({ type: 'STOP' });
        setProgress((p) => ({ ...p, enabled }));
    }, []);

    const selectCell = useCallback((cell: SoloCell) => {
        if (batchRunning(batchRef.current)) return;
        setProgress((p) => ({ ...p, activeKey: cellKey(cell) }));
    }, []);

    const setRepetitions = useCallback((repetitions: number) => {
        if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 50) return;
        setProgress((p) => ({ ...p, repetitions }));
    }, []);

    /** Dipanggil dari klik: gestur ini sekaligus membuka izin audio peramban. */
    const start = useCallback(() => {
        if (!activeCell) return;
        unlockAudio();
        const remaining = progress.repetitions - (progress.counts[cellKey(activeCell)] ?? 0);
        dispatch({ type: 'START', cell: activeCell, repetitions: Math.max(1, remaining) });
    }, [activeCell, progress.repetitions, progress.counts]);

    const stop = useCallback(() => dispatch({ type: 'STOP' }), []);

    const goToNextCell = useCallback(() => {
        if (batchRunning(batchRef.current)) return;
        setProgress((p) => {
            const next = nextIncompleteCell(p, p.activeKey);
            return next ? { ...p, activeKey: cellKey(next) } : p;
        });
    }, []);

    const resetCounts = useCallback(() => {
        if (batchRunning(batchRef.current)) return;
        setProgress((p) => ({ ...p, counts: {} }));
    }, []);

    const markSubmitted = useCallback(() => dispatch({ type: 'SUBMITTED' }), []);

    /**
     * ok = server menyimpan presentasi (keputusan apa pun, termasuk FTA).
     * Galat validasi atau jaringan menghentikan antrean dan tidak dihitung.
     */
    const recordResult = useCallback((result: { ok: true; cell: SoloCell } | { ok: false; error: string }) => {
        if (result.ok) {
            const key = cellKey(result.cell);
            setProgress((p) => ({ ...p, counts: { ...p.counts, [key]: (p.counts[key] ?? 0) + 1 } }));
            dispatch({ type: 'RESULT', ok: true, now: Date.now() });
        } else {
            dispatch({ type: 'RESULT', ok: false, error: result.error });
        }
    }, []);

    return {
        progress,
        batch,
        activeCell,
        setEnabled,
        selectCell,
        setRepetitions,
        start,
        stop,
        goToNextCell,
        resetCounts,
        markSubmitted,
        recordResult,
    };
}

export type SoloBatchControls = ReturnType<typeof useSoloBatch>;
