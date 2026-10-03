import { Head, Link } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD, LuxCalibrationWizard } from '../../Components/Presensi/LuxCalibrationWizard';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import { CameraInfo, cameraInfoFromTrack } from '../../Utils/distanceCalibration';
import { LuxCalibrationContract, LuxCalibrationSetup, REFERENCE_DEVICE_LABEL } from '../../Utils/luxCalibration';

interface Props extends LuxCalibrationSetup {
    calibration: LuxCalibrationContract | null;
}

const UNKNOWN = 'Tidak diketahui';
const fmt = (v: number | null | undefined, digits = 1) =>
    typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';

export default function LuxCalibration({ calibration, ...setup }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [camera, setCamera] = useState<CameraInfo | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [active, setActive] = useState<LuxCalibrationContract | null>(calibration);

    const getTrack = useCallback(() => streamRef.current?.getVideoTracks()[0] ?? null, []);

    const startCamera = useCallback(async () => {
        setCameraError(null);
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError('Browser tidak mendukung akses kamera. Buka lewat localhost atau HTTPS di Chrome atau Edge.');
            return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
                audio: false,
            });
            streamRef.current = stream;
            setCamera(cameraInfoFromTrack(stream.getVideoTracks()[0]));
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(() => {});
            }
        } catch (err) {
            const name = err instanceof DOMException ? err.name : '';
            setCameraError(
                name === 'NotAllowedError'
                    ? 'Izin kamera ditolak. Izinkan kamera lewat ikon gembok di bilah alamat.'
                    : name === 'NotReadableError'
                      ? 'Kamera sedang dipakai aplikasi lain. Kalibrasi juga bisa dilakukan langsung dari halaman presensi (panel Pencahayaan).'
                      : 'Kamera gagal dibuka.',
            );
        }
    }, []);

    useEffect(() => {
        void startCamera();
        return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    }, [startCamera]);

    const primary =
        'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-royal-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-deep-navy dark:bg-sky-600 dark:hover:bg-sky-500';

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-bold leading-tight text-deep-navy dark:text-white">Kalibrasi Lux Kamera</h2>
                    <p className="mt-1 max-w-3xl text-sm text-on-surface-variant dark:text-slate-400">
                        Hubungkan kecerahan kamera dengan bacaan luxmeter. Letakkan luxmeter di posisi wajah menghadap kamera, lalu rekam
                        minimal {setup.min_points} kondisi cahaya: redup (&lt; 100 lux), normal (100-300 lux), dan terang (&gt; 300 lux).
                        Kategori {setup.bands.map((b) => `${b.category} ${b.label}`).join(', ')} hanya dicatat, tidak menahan pemindaian.
                    </p>
                </div>
            }
        >
            <Head title="Kalibrasi Lux Kamera" />

            <div className="py-6 sm:py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {setup.migration_pending && (
                        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm font-semibold text-amber-900 dark:text-amber-200">
                            Tabel kalibrasi lux belum dibuat. Jalankan <code>php artisan migrate</code> lalu muat ulang halaman ini.
                        </p>
                    )}

                    <section className={CARD} aria-label="Kalibrasi aktif">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-base font-bold text-deep-navy dark:text-white">Kalibrasi aktif</h3>
                            <Link href="/presensi" className="text-sm font-semibold text-royal-blue hover:underline dark:text-sky-400">
                                Buka halaman presensi
                            </Link>
                        </div>
                        {active ? (
                            <p className="mt-2 text-sm text-on-surface-variant dark:text-slate-300">
                                #{active.id}, kamera {active.camera_label ?? UNKNOWN}, eksposur{' '}
                                {active.exposure_locked ? `dikunci (${fmt(active.exposure_time, 0)})` : 'otomatis'}, acuan{' '}
                                {active.reference_device ? REFERENCE_DEVICE_LABEL[active.reference_device] : 'tidak dicatat'}. Galat maks
                                browser {fmt(active.browser.max_rel_error * 100)}%
                                {active.engine ? `, mesin ${fmt(active.engine.max_rel_error * 100)}%` : ', tanpa model mesin'}.{' '}
                                {active.points.length} kondisi: {active.points.map((p) => `${fmt(p.lux, 0)} lux`).join(', ')}.
                            </p>
                        ) : (
                            <p className="mt-2 text-sm text-on-surface-variant dark:text-slate-400">
                                Belum ada. Tanpa kalibrasi, halaman presensi mencatat perkiraan kamera (bertanda ~, belum dikalibrasi); kalibrasi hanya diperlukan untuk lux terukur.
                            </p>
                        )}
                    </section>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <section className={CARD} aria-label="Kamera">
                            <h3 className="text-base font-bold text-deep-navy dark:text-white">Kamera</h3>
                            <div className="mt-3 aspect-video overflow-hidden rounded-2xl bg-slate-900">
                                {cameraError ? (
                                    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-rose-300">
                                        <p>{cameraError}</p>
                                        <button type="button" className={primary} onClick={() => void startCamera()}>
                                            Coba lagi
                                        </button>
                                    </div>
                                ) : (
                                    <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
                                )}
                            </div>
                            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                                <dt className="text-on-surface-variant dark:text-slate-400">Perangkat</dt>
                                <dd className="font-semibold text-deep-navy dark:text-white">{camera?.label ?? UNKNOWN}</dd>
                                <dt className="text-on-surface-variant dark:text-slate-400">Resolusi</dt>
                                <dd className="font-semibold text-deep-navy dark:text-white">
                                    {camera?.width && camera?.height ? `${camera.width}x${camera.height}` : UNKNOWN}
                                </dd>
                            </dl>
                        </section>

                        <section className={CARD} aria-label="Rekam kondisi cahaya">
                            <h3 className="mb-3 text-base font-bold text-deep-navy dark:text-white">Rekam kondisi cahaya</h3>
                            <LuxCalibrationWizard
                                videoRef={videoRef}
                                getTrack={getTrack}
                                camera={camera}
                                setup={setup}
                                onCalibrated={setActive}
                            />
                        </section>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
