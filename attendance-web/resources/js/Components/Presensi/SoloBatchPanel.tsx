import { useEffect, useState } from 'react';
import type { SoloBatchControls } from '../../Hooks/useSoloBatch';
import {
    buildSoloQueue,
    cellKey,
    isAttack,
    SOLO_DATASET_SPLIT,
    SOLO_DISTANCES,
    SOLO_LUX_LABELS,
    SOLO_LUX_LEVELS,
    SOLO_PARTICIPANT_ID,
    SOLO_SAMPLE_LABELS,
    SOLO_SAMPLES,
    SoloCell,
    SoloDistance,
    SoloLuxLevel,
    SoloSample,
    totalCompleted,
} from '../../Utils/soloSession';

const PHASE_TEXT = {
    idle: 'Belum berjalan. Pemindai dijeda sampai antrean dimulai.',
    armed: 'Menunggu wajah stabil 1,5 detik di posisi target...',
    processing: 'Rekaman terkirim, menunggu keputusan mesin...',
    resting: 'Jeda',
    done: 'Repetisi sel ini selesai.',
    error: 'Antrean berhenti karena galat.',
} as const;

const SELECT_CLASS =
    'w-full min-h-[40px] rounded-xl border border-outline-variant/60 dark:border-white/10 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-bold text-deep-navy dark:text-white focus:border-royal-blue dark:focus:border-sky-400 focus:outline-none disabled:opacity-60';

function useSecondsLeft(until: number | null): number | null {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (until === null) return;
        const id = window.setInterval(() => setNow(Date.now()), 200);
        return () => window.clearInterval(id);
    }, [until]);
    return until === null ? null : Math.max(0, Math.ceil((until - now) / 1000));
}

/**
 * Kontrol mode solo calibration_dev: pilih sel (label x lux x jarak), lalu antrean
 * merekam N repetisi beruntun tanpa sentuhan. Hanya untuk Admin/Peneliti.
 */
export function SoloBatchPanel({
    solo,
    distanceCalibrated,
    participantStatus,
}: {
    solo: SoloBatchControls;
    distanceCalibrated: boolean;
    /** Status templat P_DEV_01 dari daftar Studio; null bila akunnya belum ada. */
    participantStatus: { label: string; level: 'ready' | 'photo' | 'none' | 'unknown' } | null;
}) {
    const { progress, batch, activeCell } = solo;
    const running = batch.phase === 'armed' || batch.phase === 'processing' || batch.phase === 'resting';
    const secondsLeft = useSecondsLeft(batch.phase === 'resting' ? batch.restEndsAt : null);

    const cell = activeCell;
    const done = cell ? progress.counts[cellKey(cell)] ?? 0 : 0;
    const cellComplete = cell !== null && done >= progress.repetitions;
    const needsCalibration = cell !== null && !isAttack(cell.sample) && !distanceCalibrated;
    const total = buildSoloQueue().length * progress.repetitions;
    const blocker = participantStatus === null
        ? `Belum ada akun guru aktif dengan embedding_id ${SOLO_PARTICIPANT_ID}. Buat akunnya lalu daftarkan wajahnya dari kamera ini (45 cm, cahaya normal).`
        : participantStatus.level === 'none' || participantStatus.level === 'photo'
          ? `Templat ${SOLO_PARTICIPANT_ID}: ${participantStatus.label}. Daftarkan wajahnya dari kamera ini dulu.`
          : needsCalibration
            ? 'Bona fide butuh kalibrasi jarak kamera ini, agar perekaman hanya mulai di rentang target.'
            : null;
    const warning = participantStatus?.level === 'unknown'
        ? `${participantStatus.label}. Pastikan mesin biometrik menyala sebelum memulai.`
        : null;

    const change = (patch: Partial<SoloCell>) => {
        if (!cell) return;
        solo.selectCell({ ...cell, ...patch });
    };

    return (
        <section
            aria-label="Mode solo kalibrasi"
            className="rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 p-3.5 sm:p-4 shadow-sm backdrop-blur-xl"
        >
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="text-xs font-bold text-deep-navy dark:text-white">Mode solo</h3>
                    <p className="text-[11px] text-on-surface-variant dark:text-slate-400">
                        {SOLO_PARTICIPANT_ID} · {SOLO_DATASET_SPLIT}
                    </p>
                </div>
                <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-xs font-bold text-deep-navy dark:text-white">
                    <input
                        type="checkbox"
                        className="h-4 w-4 accent-royal-blue"
                        checked={progress.enabled}
                        onChange={(e) => solo.setEnabled(e.target.checked)}
                    />
                    <span>{progress.enabled ? 'Aktif' : 'Nonaktif'}</span>
                </label>
            </div>

            {progress.enabled && cell && (
                <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="text-[11px] font-semibold text-on-surface-variant dark:text-slate-400">
                            Sampel
                            <select
                                className={SELECT_CLASS}
                                value={cell.sample}
                                disabled={running}
                                onChange={(e) => change({ sample: e.target.value as SoloSample })}
                            >
                                {SOLO_SAMPLES.map((s) => (
                                    <option key={s} value={s}>{SOLO_SAMPLE_LABELS[s]}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[11px] font-semibold text-on-surface-variant dark:text-slate-400">
                            Cahaya
                            <select
                                className={SELECT_CLASS}
                                value={cell.lux}
                                disabled={running}
                                onChange={(e) => change({ lux: e.target.value as SoloLuxLevel })}
                            >
                                {SOLO_LUX_LEVELS.map((l) => (
                                    <option key={l} value={l}>{SOLO_LUX_LABELS[l]}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[11px] font-semibold text-on-surface-variant dark:text-slate-400">
                            Jarak
                            <select
                                className={SELECT_CLASS}
                                value={cell.distanceCm}
                                disabled={running}
                                onChange={(e) => change({ distanceCm: Number(e.target.value) as SoloDistance })}
                            >
                                {SOLO_DISTANCES.map((d) => (
                                    <option key={d} value={d}>{d} cm</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-2 text-xs">
                        <label className="text-[11px] font-semibold text-on-surface-variant dark:text-slate-400">
                            Repetisi per sel
                            <input
                                type="number"
                                min={1}
                                max={50}
                                className={`${SELECT_CLASS} w-24`}
                                value={progress.repetitions}
                                disabled={running}
                                onChange={(e) => solo.setRepetitions(Number(e.target.value))}
                            />
                        </label>
                        <p className="font-mono font-bold text-deep-navy dark:text-white" aria-live="polite">
                            Sel ini {done}/{progress.repetitions} · Total {totalCompleted(progress)}/{total}
                        </p>
                    </div>

                    {isAttack(cell.sample) && (
                        <p className="rounded-xl border border-slate-400/30 bg-slate-500/10 px-2.5 py-2 text-[11px] leading-snug text-slate-700 dark:text-slate-300">
                            Jarak serangan mengikuti penanda lantai {cell.distanceCm} cm. Estimasi jarak kamera membaca ukuran
                            wajah di foto atau layar, jadi tidak dipakai untuk memulai perekaman.
                        </p>
                    )}

                    {(blocker ?? warning) && (
                        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                            {blocker ?? warning}
                        </p>
                    )}

                    <div
                        className={`rounded-xl border px-2.5 py-2 text-[11px] leading-snug ${
                            batch.phase === 'error'
                                ? 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                                : 'border-outline-variant/40 dark:border-white/10 bg-surface-container-low dark:bg-slate-900/60 text-deep-navy dark:text-white'
                        }`}
                        aria-live="polite"
                    >
                        <span className="font-bold">
                            {batch.phase === 'resting' ? `${PHASE_TEXT.resting} ${secondsLeft ?? 0} detik` : PHASE_TEXT[batch.phase]}
                        </span>
                        {running && (
                            <span className="ml-1">
                                Repetisi {Math.min(batch.completed + 1, batch.target)} dari {batch.target}.
                            </span>
                        )}
                        {batch.error && <span className="mt-0.5 block">{batch.error}</span>}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {running ? (
                            <button
                                type="button"
                                onClick={solo.stop}
                                className="min-h-[42px] flex-1 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                            >
                                Hentikan antrean
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={solo.start}
                                    disabled={blocker !== null || cellComplete}
                                    className="min-h-[42px] flex-1 rounded-xl bg-royal-blue px-3 text-xs font-bold text-white hover:bg-deep-navy disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600"
                                >
                                    Mulai antrean ({Math.max(0, progress.repetitions - done)} repetisi)
                                </button>
                                <button
                                    type="button"
                                    onClick={solo.goToNextCell}
                                    className="min-h-[42px] rounded-xl border border-outline-variant/60 dark:border-white/10 px-3 text-xs font-bold text-deep-navy dark:text-white hover:bg-surface-container dark:hover:bg-white/10"
                                >
                                    Sel berikutnya
                                </button>
                            </>
                        )}
                    </div>
                    {!running && (
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm('Hapus hitungan kemajuan di peramban ini? Data presensi di server tidak terhapus.')) {
                                    solo.resetCounts();
                                }
                            }}
                            className="min-h-[32px] text-[11px] font-bold text-on-surface-variant underline dark:text-slate-400"
                        >
                            Atur ulang hitungan
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
