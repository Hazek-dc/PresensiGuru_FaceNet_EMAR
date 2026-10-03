export interface LightingStats {
    current_lux: number | null;
    current_category: string | null;
    current_status: string | null;
    current_source: string | null;
    current_at: string | null;
    average_today: number | null;
    scans_today: number;
    measured_today: number;
    /** Presensi hari ini dengan perkiraan kamera tanpa kalibrasi (tidak dihitung terukur). */
    estimated_today?: number;
    estimated_average_today?: number | null;
    optimal_pct: number | null;
    warning_pct: number | null;
    calibrated: boolean;
    current_source_label?: string | null;
    current_kategori_naskah?: 'redup' | 'normal' | 'terang' | null;
    calibration?: { id: number; reference_label: string | null; points: number; created_at: string | null } | null;
    can_calibrate?: boolean;
}

/** Lux terakhir untuk teks: perkiraan kamera diberi "~" dan labelnya. */
function latestLuxText(stats: LightingStats): string {
    const approx = stats.current_source === 'camera' ? '~' : '';
    return `${approx}${Math.round(stats.current_lux ?? 0)} lux`;
}

/**
 * Status pengukuran di bawah input target cahaya Dashboard: target bukan hasil
 * ukur; lux terukur berasal dari kamera terkalibrasi di Studio, dan tanpa
 * kalibrasi Studio mencatat perkiraan kamera yang bertanda estimasi.
 */
export function LuxMeasurementStatus({ stats }: { stats: LightingStats | null | undefined }) {
    const calibration = stats?.calibration ?? null;
    const reference = calibration?.reference_label ? `, acuan ${calibration.reference_label.toLowerCase()}` : '';
    return (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            {calibration ? (
                <>
                    Lux diukur otomatis di Studio (kalibrasi #{calibration.id}
                    {reference}).{' '}
                    {stats?.current_lux != null ? (
                        <>
                            Terakhir:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">{latestLuxText(stats)}</strong>
                            {stats.current_kategori_naskah && <> · {stats.current_kategori_naskah}</>}
                            {stats.current_source_label && <> · {stats.current_source_label}</>}.
                        </>
                    ) : (
                        'Belum ada presensi dengan lux terukur.'
                    )}
                </>
            ) : (
                <>
                    Angka ini target skenario, bukan hasil ukur. Tanpa kalibrasi, Studio memperkirakan lux dari kamera
                    secara otomatis (estimasi).{' '}
                    {stats?.current_lux != null && (
                        <>
                            Terakhir:{' '}
                            <strong className="text-slate-800 dark:text-slate-200">{latestLuxText(stats)}</strong>
                            {stats.current_kategori_naskah && <> · {stats.current_kategori_naskah}</>}
                            {stats.current_source_label && <> · {stats.current_source_label}</>}.{' '}
                        </>
                    )}
                    {stats?.can_calibrate && (
                        <a href="/admin/kalibrasi-lux" className="font-bold text-royal-blue hover:underline dark:text-sky-400">
                            Kalibrasi lux (opsional, untuk nilai terukur)
                        </a>
                    )}
                </>
            )}
        </p>
    );
}

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(v % 1 ? 1 : 0)}%`);

/**
 * Statistik pencahayaan hari ini (PRD Lux bagian 15). Persentase dihitung dari
 * pemindaian yang lux-nya terukur, jadi jumlahnya ditampilkan di sampingnya.
 */
export function LightingStatsCard({ stats }: { stats: LightingStats | null | undefined }) {
    const estimatedToday = stats?.estimated_today ?? 0;
    const rows: Array<[string, string]> = stats
        ? [
              [
                  'Lux terakhir',
                  stats.current_lux !== null
                      ? `${latestLuxText(stats)} · ${stats.current_category ?? '—'}${stats.current_source === 'camera' ? ' (estimasi)' : ''}`
                      : 'Tidak terukur',
              ],
              ['Rata-rata terukur hari ini', stats.average_today !== null ? `${stats.average_today.toFixed(0)} lux` : '—'],
              ['Pemindaian optimal (READY)', pct(stats.optimal_pct)],
              ['Peringatan (LOW)', pct(stats.warning_pct)],
              ['Lux terukur hari ini', `${stats.measured_today} dari ${stats.scans_today} pemindaian`],
              ...(estimatedToday > 0
                  ? ([
                        [
                            'Estimasi kamera hari ini',
                            `${estimatedToday} pemindaian${
                                stats.estimated_average_today != null ? ` · rata-rata ~${stats.estimated_average_today.toFixed(0)} lux` : ''
                            }`,
                        ],
                    ] as Array<[string, string]>)
                  : []),
          ]
        : [];

    return (
        <div className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#0F1B36] p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/70 dark:border-white/[0.08]">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-amber-500">light_mode</span>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Statistik Pencahayaan</h3>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-md bg-slate-100 dark:bg-white/5 px-2 py-0.5 text-[9px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                    Optimal 200-300 lux
                </span>
            </div>
            {!stats ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Tabel pencahayaan belum dibuat (php artisan migrate).</p>
            ) : (
                <>
                    {/* Label dan nilai berbagi satu baris; nilai panjang turun ke baris berikutnya
                        alih-alih menjepit label di kartu sempit (kolom kanan Dashboard). */}
                    <dl className="space-y-1.5 text-xs">
                        {rows.map(([label, value]) => (
                            <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                                <dd className="ml-auto text-right font-semibold text-slate-900 dark:text-white">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    {!stats.calibrated && (
                        <p className="mt-2.5 text-[11px] text-amber-700 dark:text-amber-300">
                            Tanpa kalibrasi luxmeter, lux dicatat sebagai estimasi kamera dan tidak dihitung sebagai lux terukur.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
