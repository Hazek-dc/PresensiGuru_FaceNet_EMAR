/** Ringkasan pencahayaan satu presensi (App\Services\LightingSummary::fromMetadata). */
export interface LightingSummary {
    lux: number | null;
    source: string | null;
    source_label: string | null;
    kategori_naskah: 'redup' | 'normal' | 'terang' | null;
    category: string | null;
    status: string | null;
    target: number | null;
    target_kategori: 'redup' | 'normal' | 'terang' | null;
    target_met: boolean | null;
    calibration_id: number | null;
    reference_device: string | null;
    reference_label: string | null;
    note: string | null;
    note_label: string | null;
}

const fmtLux = (v: number | null) => (v === null ? null : `${Math.round(v * 10) / 10} lux`);

/**
 * Baris CSV "Parameter,Nilai,Keterangan" untuk unduhan hasil di Studio. Nama
 * parameter sama dengan ekspor server (AttendanceHistoryController::exportSubject).
 */
export function lightingCsvRows(s: LightingSummary | null | undefined): string[] {
    if (!s) return [];
    const cell = (v: string | number | null) => (v === null || v === '' ? '-' : String(v));
    const rows = [
        `Sumber_Lux,${cell(s.source)},Sumber nilai lux (luxmeter / engine / camera_calibrated / camera = perkiraan kamera belum dikalibrasi)`,
        `Kategori_Naskah_Lux,${cell(s.kategori_naskah)},redup < 100 / normal 100-300 / terang > 300 lux`,
        `Target_Lux,${cell(s.target)},Target skenario uji yang diatur operator (bukan hasil ukur)`,
        `Sesuai_Target_Lux,${s.target_met === null ? '-' : s.target_met ? '1' : '0'},1 = kategori lux tercatat sama dengan target (perkiraan bila Sumber_Lux camera)`,
        `ID_Kalibrasi_Lux,${cell(s.calibration_id)},Kalibrasi lux kamera yang dipakai`,
        `Alat_Acuan_Lux,${cell(s.reference_device)},luxmeter (fisik) / luxmeter_app (aplikasi HP)`,
    ];
    if (s.note_label) rows.push(`Alasan_Lux_Tidak_Terukur,"${s.note_label.replace(/"/g, '""')}",${s.note ?? ''}`);
    return rows;
}

function TargetTag({ s }: { s: LightingSummary }) {
    if (s.target === null) return null;
    const target = `${s.target_kategori ?? '—'} (${fmtLux(s.target)})`;
    const style =
        s.target_met === true
            ? 'bg-emerald-600 text-white'
            : s.target_met === false
              ? 'bg-rose-600 text-white'
              : 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
    // Kesesuaian yang dihitung dari perkiraan kamera ditandai, bukan disajikan sebagai hasil ukur.
    const estimate = s.source === 'camera' ? ' (perkiraan)' : '';
    const text =
        s.target_met === true
            ? `✓ Sesuai target ${target}${estimate}`
            : s.target_met === false
              ? `✗ Target ${target}${estimate}`
              : `Target ${target}, belum terukur`;
    return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${style}`}>{text}</span>;
}

/**
 * compact: satu baris untuk daftar riwayat. full: rincian untuk detail presensi
 * dan hasil di Studio. Target adalah skenario uji, bukan hasil ukur.
 */
export function LightingSummaryView({ summary, variant = 'full' }: { summary: LightingSummary | null | undefined; variant?: 'compact' | 'full' }) {
    if (!summary) return null;
    const s = summary;
    const measured = s.lux === null ? null : `${s.source === 'camera' ? '~' : ''}${fmtLux(s.lux)}`;

    if (variant === 'compact') {
        return (
            <span className="inline-flex flex-wrap items-center gap-1.5">
                <span>
                    Pencahayaan:{' '}
                    <strong className="text-deep-navy dark:text-white">{measured ?? 'Belum terukur'}</strong>
                    {s.kategori_naskah && <> · {s.kategori_naskah}</>}
                    {s.source_label && <> · {s.source_label}</>}
                </span>
                <TargetTag s={s} />
            </span>
        );
    }

    const rows: Array<[string, React.ReactNode]> = [
        ['Intensitas cahaya', measured ?? 'Belum terukur'],
        ['Kategori naskah', s.kategori_naskah ? `${s.kategori_naskah}${s.category ? ` (${s.category} · ${s.status})` : ''}` : '—'],
        ['Sumber', s.source_label ?? '—'],
        ['Target skenario', s.target !== null ? <TargetTag s={s} /> : 'Tidak diatur'],
        [
            'Kalibrasi',
            s.calibration_id !== null ? `#${s.calibration_id}${s.reference_label ? ` · acuan ${s.reference_label.toLowerCase()}` : ''}` : '—',
        ],
    ];
    if (s.note_label) rows.push(['Mengapa tidak terukur', s.note_label]);

    return (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {rows.map(([label, value]) => (
                <div key={label} className="contents">
                    <dt className="text-on-surface-variant dark:text-slate-400">{label}</dt>
                    <dd className="font-semibold text-deep-navy dark:text-white">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
