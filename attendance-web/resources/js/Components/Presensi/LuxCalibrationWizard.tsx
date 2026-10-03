import axios from 'axios';
import { FormEvent, RefObject, useEffect, useRef, useState } from 'react';
import { CameraInfo } from '../../Utils/distanceCalibration';
import {
    canvasJpeg,
    classifyLighting,
    currentExposureTime,
    LUMA_DARK,
    LUMA_SATURATED,
    LuxCalibrationContract,
    LuxCalibrationDraft,
    LuxCalibrationSetup,
    lockExposure,
    median,
    REFERENCE_DEVICE_LABEL,
    ReferenceDevice,
    sampleVideoLuma,
    supportsExposureLock,
    unlockExposure,
} from '../../Utils/luxCalibration';
import {
    LUMA_STABLE_MS,
    LUMA_STABLE_SPREAD,
    LUX_CONDITION_TEXT,
    luxPointsReady,
    nextLuxCondition,
    StabilityTracker,
} from '../../Utils/autoCalibration';

interface LuxCalibrationWizardProps {
    /** Video kamera yang dikalibrasi; di Studio ini video pemindai itu sendiri. */
    videoRef: RefObject<HTMLVideoElement | null>;
    getTrack: () => MediaStreamTrack | null;
    camera: CameraInfo | null;
    setup: LuxCalibrationSetup;
    onCalibrated?: (calibration: LuxCalibrationContract) => void;
    /** Simpan kalibrasi sendiri begitu jumlah kondisi dan rentang lux mencukupi. */
    autoCommit?: boolean;
    /** Panduan suara (Studio). */
    speak?: (text: string) => void;
}

const MAX_STABLE_WAIT_MS = 4000;

const fmt = (v: number | null | undefined, digits = 1) =>
    typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
const errorText = (err: any, fallback: string) =>
    err?.response?.data?.message ?? err?.response?.data?.reason ?? fallback;

export const CARD =
    'rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest dark:bg-[#0F1B36] p-4 sm:p-6 shadow-sm';
const PRIMARY =
    'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-deep-navy disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500';
const SECONDARY =
    'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-outline-variant/60 px-4 py-2 text-sm font-bold text-deep-navy transition hover:bg-surface-container-low disabled:opacity-50 dark:border-white/15 dark:text-white dark:hover:bg-white/5';
const FIELD =
    'mt-1 rounded-xl border-outline-variant/60 text-base text-deep-navy dark:border-white/15 dark:bg-slate-900 dark:text-white';

/**
 * Rekam kondisi cahaya (bacaan luxmeter + kecerahan kamera + foto untuk mesin),
 * lalu simpan model kalibrasi. Dipakai halaman Kalibrasi Lux dan Studio presensi.
 */
export function LuxCalibrationWizard({ videoRef, getTrack, camera, setup, onCalibrated, autoCommit = false, speak }: LuxCalibrationWizardProps) {
    const [lockSupported, setLockSupported] = useState(false);
    const [lockedExposure, setLockedExposure] = useState<number | null>(null);
    const [liveLuma, setLiveLuma] = useState<number | null>(null);
    const [luxInput, setLuxInput] = useState('');
    const [device, setDevice] = useState<ReferenceDevice>(setup.draft.reference_device ?? 'luxmeter');
    const [draft, setDraft] = useState<LuxCalibrationDraft>(setup.draft);
    const [busy, setBusy] = useState(false);
    const [phase, setPhase] = useState<string | null>(null);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    const getTrackRef = useRef(getTrack);
    getTrackRef.current = getTrack;
    const lockedRef = useRef<number | null>(null);
    lockedRef.current = lockedExposure;

    useEffect(() => {
        setLockSupported(supportsExposureLock(getTrackRef.current()));
        setLockedExposure(null);
    }, [camera?.deviceId, camera?.label]);

    // Eksposur dikembalikan otomatis saat jendela ditutup; di Studio, video yang
    // sama dipakai lagi untuk merekam presensi.
    useEffect(
        () => () => {
            const t = getTrackRef.current();
            if (lockedRef.current !== null && t) void unlockExposure(t);
        },
        [],
    );

    // Kecerahan langsung, agar operator melihat kamera bereaksi terhadap perubahan lampu.
    useEffect(() => {
        const canvas = document.createElement('canvas');
        const id = window.setInterval(() => {
            const v = videoRef.current;
            const stats = v ? sampleVideoLuma(v, canvas) : null;
            setLiveLuma(stats ? stats.mean : null);
        }, 500);
        return () => window.clearInterval(id);
    }, [videoRef]);

    // Kunci otomatis di kondisi pertama: kecerahan kamera harus mengikuti lampu,
    // bukan disetel ulang oleh eksposur otomatis.
    const autoLock = async (): Promise<number | null> => {
        if (lockedExposure !== null || !lockSupported || draft.points.length > 0) return lockedExposure;
        const t = getTrack();
        const current = currentExposureTime(t);
        if (!t || current === null || !(await lockExposure(t, current))) return null;
        setLockedExposure(current);
        await new Promise((r) => setTimeout(r, 300));
        return current;
    };

    // Tunggu cahaya dan eksposur tenang sebelum sampel diambil.
    const waitForStableLuma = async (v: HTMLVideoElement): Promise<boolean> => {
        const canvas = document.createElement('canvas');
        const tracker = new StabilityTracker(LUMA_STABLE_MS, LUMA_STABLE_SPREAD);
        const started = performance.now();
        while (performance.now() - started < MAX_STABLE_WAIT_MS) {
            const now = performance.now();
            tracker.push(sampleVideoLuma(v, canvas)?.mean ?? null, now);
            if (tracker.isStable(now)) return true;
            await new Promise((r) => setTimeout(r, 100));
        }
        return false;
    };

    const toggleLock = async () => {
        const t = getTrack();
        if (!t) return;
        if (lockedExposure !== null) {
            await unlockExposure(t);
            setLockedExposure(null);
            return;
        }
        // Kunci pada eksposur yang sedang dipilih kamera di cahaya saat ini.
        const current = currentExposureTime(t);
        if (current === null || !(await lockExposure(t, current))) {
            setMessage({ kind: 'error', text: 'Kamera menolak penguncian eksposur. Kalibrasi tetap bisa dicoba tanpa kunci.' });
            return;
        }
        setLockedExposure(current);
    };

    const recordPoint = async (e: FormEvent) => {
        e.preventDefault();
        const lux = Number(luxInput.replace(',', '.'));
        const v = videoRef.current;
        if (!v || !camera) return;
        if (!Number.isFinite(lux) || lux <= 0) {
            setMessage({ kind: 'error', text: 'Isi bacaan luxmeter lebih dari 0.' });
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            setPhase('Menunggu cahaya stabil...');
            const lockedNow = await autoLock();
            const stable = await waitForStableLuma(v);
            setPhase('Merekam...');
            const canvas = document.createElement('canvas');
            const lumas: number[] = [];
            const frames: Blob[] = [];
            for (let i = 0; i < 15; i++) {
                const stats = sampleVideoLuma(v, canvas);
                if (stats) {
                    lumas.push(stats.mean);
                    if (i % 5 === 0) {
                        const blob = await canvasJpeg(canvas);
                        if (blob) frames.push(blob);
                    }
                }
                await new Promise((r) => setTimeout(r, 40));
            }
            const luma = median(lumas);
            if (luma === null || frames.length < 3) {
                setMessage({ kind: 'error', text: 'Bingkai kamera belum tersedia. Tunggu gambar muncul lalu coba lagi.' });
                return;
            }
            const form = new FormData();
            form.append('luxmeter_lux', String(lux));
            form.append('browser_luma', String(Math.round(luma * 1000) / 1000));
            form.append('browser_samples', String(lumas.length));
            form.append('exposure_locked', lockedNow !== null ? '1' : '0');
            if (lockedNow !== null) form.append('exposure_time', String(lockedNow));
            if (camera.label) form.append('camera_label', camera.label);
            form.append('resolution_w', String(camera.width ?? v.videoWidth));
            form.append('resolution_h', String(camera.height ?? v.videoHeight));
            form.append('reference_device', device);
            frames.forEach((b, i) => form.append('frames[]', b, `lux_${i}.jpg`));
            const resp = await axios.post('/api/biometric/lux-calibration/point', form, { headers: { Accept: 'application/json' } });
            const nextDraft: LuxCalibrationDraft = resp.data.draft;
            setDraft(nextDraft);
            setLuxInput('');
            setMessage({
                kind: resp.data.engine_error ? 'error' : 'ok',
                text:
                    (resp.data.draft_reset ? 'Kamera, eksposur, atau alat acuan berubah; kondisi sebelumnya dihapus. ' : '') +
                    `Kondisi ${lux} lux direkam (kecerahan ${fmt(luma)}).` +
                    (stable ? '' : ' Cahaya belum benar-benar stabil saat direkam; ulangi bila kalibrasi ditolak.') +
                    (resp.data.engine_error ? ` Mesin: ${resp.data.engine_error}` : ''),
            });
            const recorded = nextDraft.points.map((p) => p.lux);
            if (autoCommit && luxPointsReady(recorded, setup.min_points)) {
                setPhase('Menyimpan kalibrasi...');
                await commit();
            } else {
                const next = nextLuxCondition(recorded);
                speak?.(next ? `Kondisi direkam. Berikutnya, atur cahaya ${next}.` : 'Kondisi direkam.');
            }
        } catch (err) {
            setMessage({ kind: 'error', text: errorText(err, 'Kondisi gagal direkam.') });
        } finally {
            setPhase(null);
            setBusy(false);
        }
    };

    const commit = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const resp = await axios.post('/api/biometric/lux-calibration/commit', {}, { headers: { Accept: 'application/json' } });
            setDraft({ camera_label: null, exposure_locked: null, reference_device: null, points: [] });
            setMessage({ kind: 'ok', text: 'Kalibrasi lux disimpan.' + (resp.data.warning ? ` ${resp.data.warning}` : '') });
            speak?.('Kalibrasi lux disimpan.');
            onCalibrated?.(resp.data.calibration);
        } catch (err) {
            setMessage({ kind: 'error', text: errorText(err, 'Kalibrasi ditolak.') });
            speak?.('Kalibrasi lux ditolak. Baca keterangan di layar.');
        } finally {
            setBusy(false);
        }
    };

    const reset = async () => {
        setBusy(true);
        try {
            const resp = await axios.post('/api/biometric/lux-calibration/reset', {}, { headers: { Accept: 'application/json' } });
            setDraft(resp.data.draft);
            setMessage(null);
        } finally {
            setBusy(false);
        }
    };

    const lumaWarning =
        liveLuma !== null && (liveLuma <= LUMA_DARK * 2 || liveLuma >= LUMA_SATURATED - 5)
            ? liveLuma >= LUMA_SATURATED - 5
                ? 'Gambar hampir jenuh; kondisi ini akan ditolak.'
                : 'Gambar hampir gelap total; kondisi ini akan ditolak.'
            : null;
    const nextCondition = nextLuxCondition(draft.points.map((p) => p.lux));
    const deviceChanged = draft.points.length > 0 && !!draft.reference_device && draft.reference_device !== device;

    return (
        <div className="space-y-4 text-sm">
            <div className="rounded-2xl border border-outline-variant/50 p-3 dark:border-white/10">
                <p className="font-semibold text-deep-navy dark:text-white">
                    Kecerahan kamera: {fmt(liveLuma)} dari 255
                </p>
                {lumaWarning && <p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">{lumaWarning}</p>}
                <p className="mt-2 text-on-surface-variant dark:text-slate-400">
                    {lockSupported
                        ? 'Kunci eksposur di cahaya normal sebelum merekam, agar kecerahan kamera naik-turun mengikuti lampu. Jangan ubah kuncinya sampai semua kondisi terekam.'
                        : 'Kamera ini tidak mengizinkan eksposur dikunci dari browser. Kalibrasi tetap bisa dicoba; bila kecerahan tidak berubah antar kondisi, kalibrasi akan ditolak.'}
                </p>
                {lockSupported && (
                    <button type="button" className={`${SECONDARY} mt-2`} onClick={() => void toggleLock()} disabled={busy}>
                        {lockedExposure !== null ? `Lepas kunci (${fmt(lockedExposure, 0)})` : 'Kunci eksposur sekarang'}
                    </button>
                )}
            </div>

            {nextCondition && draft.points.length < setup.max_points && (
                <p className="rounded-xl border border-royal-blue/30 bg-royal-blue/5 p-3 font-semibold text-deep-navy dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-white">
                    Kondisi {draft.points.length + 1}: atur cahaya {LUX_CONDITION_TEXT[nextCondition]}. Tunggu angka luxmeter stabil,
                    ketik angkanya, lalu tekan Enter.
                </p>
            )}

            <form className="flex flex-wrap items-end gap-3" onSubmit={recordPoint}>
                <label className="flex flex-col">
                    <span className="font-semibold text-deep-navy dark:text-white">Alat acuan</span>
                    <select value={device} onChange={(e) => setDevice(e.target.value as ReferenceDevice)} className={`${FIELD} min-h-[44px]`}>
                        {(Object.keys(REFERENCE_DEVICE_LABEL) as ReferenceDevice[]).map((d) => (
                            <option key={d} value={d}>
                                {REFERENCE_DEVICE_LABEL[d]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col">
                    <span className="font-semibold text-deep-navy dark:text-white">Bacaan luxmeter (lux)</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={luxInput}
                        onChange={(e) => setLuxInput(e.target.value)}
                        className={`${FIELD} w-40`}
                        required
                    />
                </label>
                <button
                    type="submit"
                    className={PRIMARY}
                    disabled={busy || !camera || setup.migration_pending || draft.points.length >= setup.max_points}
                >
                    {busy ? phase ?? 'Merekam...' : 'Rekam kondisi ini'}
                </button>
            </form>
            {deviceChanged && (
                <p className="font-semibold text-amber-700 dark:text-amber-300">
                    Alat acuan berbeda dari kondisi yang sudah direkam; kondisi berikutnya memulai kalibrasi baru.
                </p>
            )}
            {device === 'luxmeter_app' && (
                <p className="text-on-surface-variant dark:text-slate-400">
                    Sensor cahaya ponsel kurang akurat dibanding luxmeter fisik. Alat acuan ikut tercatat di kalibrasi agar
                    dapat disebutkan sebagai keterbatasan.
                </p>
            )}

            {message && (
                <p
                    role="status"
                    className={`rounded-xl p-3 ${
                        message.kind === 'ok'
                            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-500/10 text-rose-800 dark:text-rose-300'
                    }`}
                >
                    {message.text}
                </p>
            )}

            <table className="w-full text-left">
                <thead className="text-on-surface-variant dark:text-slate-400">
                    <tr>
                        <th className="py-1 font-semibold">Luxmeter</th>
                        <th className="py-1 font-semibold">Kategori</th>
                        <th className="py-1 font-semibold">Kecerahan browser</th>
                        <th className="py-1 font-semibold">Kecerahan mesin</th>
                    </tr>
                </thead>
                <tbody className="text-deep-navy dark:text-white">
                    {draft.points.length === 0 && (
                        <tr>
                            <td colSpan={4} className="py-2 text-on-surface-variant dark:text-slate-400">
                                Belum ada kondisi terekam.
                            </td>
                        </tr>
                    )}
                    {draft.points.map((p, i) => (
                        <tr key={i} className="border-t border-outline-variant/40 dark:border-white/10">
                            <td className="py-1.5">{fmt(p.lux)} lux</td>
                            <td className="py-1.5">{classifyLighting(p.lux).category}</td>
                            <td className="py-1.5">{fmt(p.browser_luma)}</td>
                            <td className="py-1.5" title={p.engine_error ?? undefined}>
                                {p.engine_luma !== null ? fmt(p.engine_luma) : 'Tidak terukur'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    className={PRIMARY}
                    onClick={() => void commit()}
                    disabled={busy || draft.points.length < setup.min_points || setup.migration_pending}
                >
                    Simpan kalibrasi
                </button>
                <button type="button" className={SECONDARY} onClick={() => void reset()} disabled={busy || draft.points.length === 0}>
                    Mulai ulang
                </button>
            </div>
            <p className="text-xs text-on-surface-variant dark:text-slate-400">
                Butuh minimal {setup.min_points} kondisi. Kalibrasi ditolak bila galat model melebihi {fmt(setup.max_rel_error * 100, 0)}%,
                rentang cahaya kurang dari 3 kali lipat, atau kecerahan tidak naik seiring lux. Tidak ada yang disimpan sebelum
                tombol Simpan ditekan.
            </p>
        </div>
    );
}
