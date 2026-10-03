import { Link } from '@inertiajs/react';
import { classifyLighting, LuxCalibrationContract, LuxProbeResult, REFERENCE_DEVICE_LABEL } from '../../Utils/luxCalibration';

interface LightingMonitorPanelProps {
    calibration: LuxCalibrationContract | null;
    calibrationLoad: 'loading' | 'done' | 'failed';
    probe: LuxProbeResult | null;
    /** Lux yang akan dicatat bersama presensi dan sumbernya (sama dengan chip pemindai). */
    recorded?: { lux: number | null; source: string | null } | null;
    /** Perkiraan kamera otomatis sedang berjalan (di luar tab Riset). */
    autoEstimate?: boolean;
    canCalibrate: boolean;
    /** Buka kalibrasi di halaman ini; tanpa ini tautan ke halaman Kalibrasi Lux. */
    onCalibrate?: () => void;
}

const STATUS_STYLE: Record<string, string> = {
    READY: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    VALID: 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300',
    MONITOR: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    WARNING: 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300',
};

const SOURCE_BADGE: Record<string, string> = {
    camera: 'Estimasi kamera',
    luxmeter: 'Luxmeter',
};

/**
 * Panel "Lighting Monitor" (PRD Lux bagian 12). Menampilkan lux yang akan
 * dicatat: sampel kamera terkalibrasi, bacaan luxmeter, atau perkiraan kamera
 * otomatis (bertanda estimasi). Kategori hanya informasi dan tidak menahan pemindaian.
 */
export function LightingMonitorPanel({
    calibration,
    calibrationLoad,
    probe,
    recorded = null,
    autoEstimate = true,
    canCalibrate,
    onCalibrate,
}: LightingMonitorPanelProps) {
    const lux = recorded?.lux ?? null;
    const source = lux === null ? null : (recorded?.source ?? null);
    const isEstimate = source === 'camera';
    const c = classifyLighting(lux);
    let note: string;
    if (calibrationLoad === 'loading') {
        note = 'Memuat status kalibrasi lux...';
    } else if (source === 'luxmeter') {
        note = 'Bacaan luxmeter dari widget Luxometer, dicatat sebagai hasil ukur.';
    } else if (source === 'camera_calibrated' && calibration && probe) {
        const reference = calibration.reference_device
            ? ` (acuan ${REFERENCE_DEVICE_LABEL[calibration.reference_device].toLowerCase()})`
            : '';
        note = `Diukur ${new Date(probe.measuredAt).toLocaleTimeString('id-ID')} dengan kalibrasi #${calibration.id}${reference}. Semua kategori tetap boleh dipindai.`;
    } else if (isEstimate) {
        note = calibration
            ? `${probe?.note ? `${probe.note}. ` : ''}Sampel terkalibrasi belum tersedia, jadi sementara dicatat estimasi kamera (belum dikalibrasi).`
            : 'Diperkirakan otomatis dari kamera tiap detik dan dicatat bersama presensi sebagai estimasi (belum dikalibrasi). Kalibrasi luxmeter tidak wajib; hanya perlu untuk nilai terukur.';
    } else if (autoEstimate) {
        note = 'Menunggu gambar kamera untuk estimasi lux otomatis.';
    } else {
        note = 'Di tab Riset, lux berasal dari widget Luxometer: mode Kamera untuk perkiraan, mode Luxmeter untuk hasil ukur.';
    }
    const badge = source ? SOURCE_BADGE[source] : undefined;
    const calibrateLabel = calibration ? 'Kalibrasi ulang' : 'Kalibrasi lux';

    return (
        <section
            aria-label="Pencahayaan"
            className="rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 p-3.5 sm:p-4 shadow-sm backdrop-blur-xl"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-deep-navy dark:text-white">
                    <span className="material-symbols-outlined text-[15px] text-amber-500">light_mode</span>
                    <span>Pencahayaan</span>
                </span>
                {canCalibrate && onCalibrate && (
                    <button
                        type="button"
                        onClick={onCalibrate}
                        className="min-h-[32px] rounded-lg px-2 text-[11px] font-bold text-royal-blue hover:underline dark:text-sky-400"
                    >
                        {calibrateLabel}
                    </button>
                )}
                {canCalibrate && !onCalibrate && (
                    <Link href="/admin/kalibrasi-lux" className="text-[11px] text-royal-blue dark:text-sky-400 hover:underline font-bold">
                        {calibrateLabel}
                    </Link>
                )}
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-deep-navy dark:text-white">
                    {c.lux !== null ? `${isEstimate ? '~' : ''}${c.lux.toFixed(0)} lux` : 'Tidak terukur'}
                </span>
                {c.category && c.status && (
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[c.status]}`}>
                        {c.category} · {c.status}
                    </span>
                )}
                {badge && (
                    <span className="rounded-full border border-slate-400/50 px-2 py-0.5 text-[11px] font-bold text-on-surface-variant dark:text-slate-300">
                        {badge}
                    </span>
                )}
            </div>
            {c.category && <p className="mt-1 text-xs text-on-surface-variant dark:text-slate-400">{c.message}</p>}
            <p className="mt-2 text-[11px] leading-snug text-on-surface-variant dark:text-slate-400">{note}</p>
        </section>
    );
}

interface BiometricStatusPanelProps {
    evaluation: {
        id_pred?: string | null;
        pad_pred?: string | null;
        final_decision?: string | null;
        euclidean_distance?: number | null;
    } | null;
}

/** Panel "Biometric Status" (PRD Lux bagian 12): hasil presensi terakhir. */
export function BiometricStatusPanel({ evaluation }: BiometricStatusPanelProps) {
    const rows: Array<[string, string | null | undefined, boolean]> = [
        ['FaceNet', evaluation?.id_pred, evaluation?.id_pred === 'MATCH'],
        ['EMAR', evaluation?.pad_pred, evaluation?.pad_pred === 'BONA_FIDE'],
        ['Keputusan', evaluation?.final_decision, evaluation?.final_decision === 'ACCEPT'],
    ];

    return (
        <section
            aria-label="Status biometrik"
            className="rounded-3xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-lowest/90 dark:bg-[#0F1B36]/90 p-3.5 sm:p-4 shadow-sm backdrop-blur-xl"
        >
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-deep-navy dark:text-white">
                <span className="material-symbols-outlined text-[15px] text-royal-blue dark:text-sky-400">verified_user</span>
                Status Biometrik
            </p>
            {evaluation ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                    {rows.map(([label, value, ok]) => (
                        <div key={label} className="contents">
                            <dt className="text-on-surface-variant dark:text-slate-400">{label}</dt>
                            <dd className={`font-bold ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                {value ?? 'Tidak tersedia'} {ok ? '✓' : '✗'}
                            </dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="text-xs text-on-surface-variant dark:text-slate-400">Belum ada presensi pada sesi ini.</p>
            )}
        </section>
    );
}
