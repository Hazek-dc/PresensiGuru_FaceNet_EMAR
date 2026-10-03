import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { engineDistanceNoteLabel, recordedDistance } from '@/Utils/distanceCalibration';
import { formatMeasured } from '@/Utils/sensorReading';
import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import { Bab5ScenarioCard } from '@/Components/Presensi/Bab5ScenarioCard';
import { LightingSummaryView } from '@/Components/Presensi/LightingSummaryView';

export default function Show({ record, isResearcher, lighting }: any) {
    const [copied, setCopied] = useState(false);
    const meta = record.metadata || {};
    const recorded = recordedDistance(meta);

    const dist =
        meta.euclidean_distance !== null && meta.euclidean_distance !== undefined
            ? Number(meta.euclidean_distance)
            : null;
    const distPct = dist !== null ? Math.min(100, Math.max(0, (dist / 1.0) * 100)) : 0;
    const isPassingThreshold = dist !== null ? dist <= 0.40 : record.status === 'success';

    const statusStr = (record.status || '').toLowerCase();
    const isSuccess = statusStr === 'success' || statusStr === 'hadir';
    const isLate = statusStr === 'terlambat';
    const isPulang = statusStr === 'pulang';
    const isIzin = statusStr === 'izin';
    const isSakit = statusStr === 'sakit';

    const handleCopyJson = () => {
        navigator.clipboard.writeText(JSON.stringify(record, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-deep-navy dark:text-white">
                                Detail Verifikasi Biometrik
                            </h2>
                            <span className="rounded-lg bg-sky-50 dark:bg-sky-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-royal-blue dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
                                #{record.id}
                            </span>
                        </div>
                        <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-1">
                            Evaluasi FaceNet 512-D, EMAR Anti-Spoofing, &amp; 3 Skenario Bab 5
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <a
                            href={route('attendance.export.subject', record.id)}
                            className="rounded-xl border border-sky-300 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all shadow-xs flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                            <span>Unduh CSV Subjek</span>
                        </a>

                        <a
                            href={route('attendance.export.bab5')}
                            className="rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all shadow-xs flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[16px]">dataset</span>
                            <span>Ekspor Bab 5 (CSV)</span>
                        </a>

                        <Link
                            href={route('attendance.history')}
                            className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/10 px-4 py-2 text-xs font-bold text-deep-navy dark:text-white hover:bg-slate-50 dark:hover:bg-white/20 transition-all flex items-center gap-1 shadow-xs"
                        >
                            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                            <span>Kembali</span>
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title={`Detail Presensi #${record.id} - ${record.user?.name || 'Subjek'}`} />

            <div className="py-6 sm:py-8">
                <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {/* Card 1: Subject Profile & Status Banner */}
                    <div className="overflow-hidden rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0F1B36] p-6 sm:p-7 shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-white/5 pb-5">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-royal-blue/15 to-sky-400/20 dark:from-sky-500/20 dark:to-royal-blue/30 text-royal-blue dark:text-sky-300 font-extrabold text-base border border-royal-blue/20 dark:border-sky-400/30 shadow-xs">
                                    {record.user?.embedding_id ||
                                        record.user?.name?.substring(0, 2).toUpperCase() ||
                                        'GU'}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-extrabold text-lg text-deep-navy dark:text-white truncate">
                                            {record.user ? record.user.name : 'Guru Tidak Dikenal'}
                                        </h3>
                                        {record.user?.embedding_id && (
                                            <span className="rounded-lg bg-sky-50 dark:bg-sky-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-royal-blue dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
                                                {record.user.embedding_id}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                                        {record.user?.email || 'subjek@smk-almadani.sch.id'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold ${
                                        isSakit
                                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                                            : isIzin
                                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                              : isPulang
                                                ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300'
                                                : isSuccess
                                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                                  : isLate
                                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                    }`}
                                >
                                    <span
                                        className={`h-2 w-2 rounded-full ${
                                            isSakit
                                                ? 'bg-purple-500'
                                                : isIzin
                                                  ? 'bg-amber-500'
                                                  : isPulang
                                                    ? 'bg-sky-500'
                                                    : isSuccess
                                                      ? 'bg-emerald-500'
                                                      : isLate
                                                        ? 'bg-amber-500'
                                                        : 'bg-rose-500'
                                        }`}
                                    />
                                    <span>
                                        {isSakit
                                            ? 'Sakit (Dokter)'
                                            : isIzin
                                              ? 'Izin Dinas'
                                              : isPulang
                                                ? 'Presensi Pulang'
                                                : isSuccess
                                                  ? 'Hadir (ACCEPT)'
                                                  : isLate
                                                    ? 'Terlambat'
                                                    : 'Ditolak / Gagal'}
                                    </span>
                                </span>

                                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                    {new Date(record.created_at).toLocaleString('id-ID', {
                                        dateStyle: 'full',
                                        timeStyle: 'medium',
                                    })}{' '}
                                    WIB
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div>
                                <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider block">
                                    Alasan / Catatan Sistem:
                                </span>
                                <p className="font-semibold text-deep-navy dark:text-slate-200 mt-0.5">
                                    {record.decision_reason || 'Verifikasi Biometrik Normal'}
                                </p>
                            </div>
                            {record.biometric_request_id && (
                                <div className="text-right">
                                    <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider block">
                                        UUID Sesi:
                                    </span>
                                    <code className="text-[11px] font-mono text-royal-blue dark:text-sky-300">
                                        {record.biometric_request_id}
                                    </code>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Card 2: Bab 5 Multi-Scenario Evaluation Card */}
                    {meta.evaluation_bab5 && (
                        <Bab5ScenarioCard
                            data={{
                                ...meta.evaluation_bab5,
                                euclidean_distance:
                                    meta.evaluation_bab5.euclidean_distance ?? meta.euclidean_distance,
                            }}
                            variant="full"
                        />
                    )}

                    {/* Card 3: Dual Biometric Telemetry & Environment Sensor Matrix */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 3A: FaceNet 512-D Verification */}
                        <div className="rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0F1B36] p-5 sm:p-6 flex flex-col justify-between shadow-xs">
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[18px] text-royal-blue dark:text-sky-400">
                                            face
                                        </span>
                                        FaceNet 512-D Euclidean
                                    </span>
                                    <span
                                        className={`px-2.5 py-0.5 rounded-lg font-mono text-xs font-bold ${
                                            isPassingThreshold
                                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                        }`}
                                    >
                                        {meta.id_pred || (isPassingThreshold ? 'MATCH' : 'MISMATCH')}
                                    </span>
                                </div>

                                <div className="mt-4">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-3xl font-black font-mono text-deep-navy dark:text-white">
                                            {dist !== null ? dist.toFixed(3) : '-'}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                            Ambang Batas: &le; 0.400
                                        </span>
                                    </div>
                                    <div className="relative mt-2 h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                isPassingThreshold ? 'bg-emerald-500' : 'bg-amber-500'
                                            }`}
                                            style={{ width: `${distPct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-white/5 pt-3">
                                Nilai jarak L2 &le; 0.400 menandakan representasi fitur embedding 512 dimensi identik dengan template guru tersimpan.
                            </p>
                        </div>

                        {/* 3B: EMAR Anti-Spoofing & Liveness */}
                        <div className="rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#0F1B36] p-5 sm:p-6 flex flex-col justify-between shadow-xs">
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400">
                                            visibility
                                        </span>
                                        EMAR Liveness &amp; PAD
                                    </span>
                                    <span
                                        className={`px-2.5 py-0.5 rounded-lg font-mono text-xs font-bold ${
                                            meta.pad_pred === 'BONA_FIDE'
                                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                        }`}
                                    >
                                        {meta.pad_pred || 'BONA_FIDE'}
                                    </span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                                    <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-3 border border-slate-200/60 dark:border-white/5">
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                                            Kedipan (EAR)
                                        </span>
                                        <span className="text-xl font-black font-mono text-deep-navy dark:text-white mt-1 block">
                                            {meta.ear_blinks ?? 0}x
                                        </span>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-3 border border-slate-200/60 dark:border-white/5">
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                                            Mulut (MAR)
                                        </span>
                                        <span className="text-xl font-black font-mono text-deep-navy dark:text-white mt-1 block">
                                            {meta.mar_mouths ?? 0}x
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-white/5 pt-3">
                                Durasi pemindaian: {meta.scan_duration_s ?? 8} detik • Akurasi deteksi wajah: {meta.face_detected_pct ?? 100}%
                            </p>
                        </div>
                    </div>

                    {/* Card 4: Environmental Conditions Strip */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-4 flex flex-wrap items-center justify-around gap-4 text-xs font-mono text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-slate-400">
                                straight
                            </span>
                            <span>
                                Jarak Kamera: <strong className="text-deep-navy dark:text-white font-bold">{formatMeasured(recorded.distanceCm, 'cm', 1)}</strong>
                                {recorded.category && <> · {recorded.category}</>}
                                {recorded.source && <span className="block text-[11px] font-sans">Sumber: {recorded.source}</span>}
                                {(meta.browser_distance_cm != null || meta.engine_distance_cm != null) && (
                                    <span className="block text-[11px] font-sans">
                                        Browser {formatMeasured(meta.browser_distance_cm, 'cm', 1)} · Engine{' '}
                                        {formatMeasured(meta.engine_distance_cm, 'cm', 1)}
                                        {meta.engine_distance_cm == null && engineDistanceNoteLabel(meta.engine_distance_note) && (
                                            <> ({engineDistanceNoteLabel(meta.engine_distance_note)})</>
                                        )}
                                        {meta.distance_mismatch_cm != null && <> · selisih {formatMeasured(meta.distance_mismatch_cm, 'cm', 1)}</>}
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[18px] text-amber-500">
                                light_mode
                            </span>
                            {lighting ? (
                                <div className="min-w-0 flex-1 font-sans">
                                    <LightingSummaryView summary={lighting} />
                                </div>
                            ) : (
                                <span>
                                    Intensitas Cahaya: <strong className="text-deep-navy dark:text-white font-bold">{formatMeasured(meta.lux, 'Lux')}</strong>
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-sky-500">
                                timer
                            </span>
                            <span>
                                Waktu Sesi: <strong className="text-deep-navy dark:text-white font-bold">{meta.scan_duration_s ?? 8}s</strong>
                            </span>
                        </div>
                    </div>

                    {/* Card 5: Researcher & Audit Raw Metadata */}
                    {isResearcher && (
                        <div className="rounded-3xl border border-slate-200/80 dark:border-white/10 bg-slate-900 text-slate-200 p-5 sm:p-6 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] text-royal-blue dark:text-sky-400">
                                        science
                                    </span>
                                    Metadata Peneliti &amp; Audit Log JSON
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopyJson}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono font-semibold transition-colors text-white"
                                >
                                    <span className="material-symbols-outlined text-[14px]">
                                        {copied ? 'check' : 'content_copy'}
                                    </span>
                                    <span>{copied ? 'Tersalin!' : 'Salin JSON'}</span>
                                </button>
                            </div>
                            <pre className="text-xs font-mono max-h-64 overflow-y-auto p-3.5 rounded-xl bg-black/50 text-emerald-400 whitespace-pre-wrap break-all scrollbar-thin">
                                {JSON.stringify(record, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}

