import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ActiveCalibration, CameraInfo } from '../../Utils/distanceCalibration';
import { LuxCalibrationContract, LuxCalibrationSetup, REFERENCE_DEVICE_LABEL } from '../../Utils/luxCalibration';
import { DistanceAutoCalibration, FaceRatioSample } from './DistanceAutoCalibration';
import { LuxCalibrationWizard } from './LuxCalibrationWizard';

export type AutoCalibrationSection = 'distance' | 'lux';

interface CameraAutoCalibrationModalProps {
    /** Bagian yang dijalankan, berurutan (jarak lalu cahaya). */
    sections: AutoCalibrationSection[];
    /** Video pemindai Studio: kamera yang sama dengan presensi, tanpa membuka kamera kedua. */
    scannerVideoRef: RefObject<HTMLVideoElement | null>;
    ratioRef: MutableRefObject<FaceRatioSample>;
    camera: CameraInfo | null;
    luxSetup: LuxCalibrationSetup | null;
    activeLux: LuxCalibrationContract | null;
    activeDistance: ActiveCalibration | null;
    onLuxCalibrated: (calibration: LuxCalibrationContract) => void;
    onDistanceCalibrated: (calibration: ActiveCalibration) => void;
    onClose: () => void;
}

const SECTION_TITLE: Record<AutoCalibrationSection, string> = {
    distance: 'Jarak kamera',
    lux: 'Intensitas cahaya',
};

/**
 * Kalibrasi semi-otomatis jarak dan lux dari Studio. Sistem menunggu kondisi
 * stabil, merekam, dan menyimpan sendiri; acuan nyatanya (jarak meteran,
 * bacaan luxmeter) tetap dari operator. Pemindaian presensi dijeda selama ini.
 */
export function CameraAutoCalibrationModal({
    sections,
    scannerVideoRef,
    ratioRef,
    camera,
    luxSetup,
    activeLux,
    activeDistance,
    onLuxCalibrated,
    onDistanceCalibrated,
    onClose,
}: CameraAutoCalibrationModalProps) {
    const steps = sections.filter((s) => s !== 'lux' || luxSetup !== null);
    const [stepIndex, setStepIndex] = useState(0);
    const [voice, setVoice] = useState(true);
    const previewRef = useRef<HTMLVideoElement | null>(null);
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const voiceRef = useRef(voice);
    voiceRef.current = voice;
    const section = steps[stepIndex] ?? null;

    const speak = useCallback((text: string) => {
        if (!voiceRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'id-ID';
            u.rate = 1.05;
            window.speechSynthesis.speak(u);
        } catch {
            // Tanpa suara, petunjuk tetap tertulis di layar.
        }
    }, []);

    const getTrack = useCallback(
        () => ((scannerVideoRef.current?.srcObject as MediaStream | null) ?? null)?.getVideoTracks()[0] ?? null,
        [scannerVideoRef],
    );

    // Pratinjau dari aliran kamera pemindai, agar operator melihat posisinya.
    useEffect(() => {
        const preview = previewRef.current;
        const stream = scannerVideoRef.current?.srcObject as MediaStream | null;
        if (preview && stream) {
            preview.srcObject = stream;
            preview.play().catch(() => {});
        }
        return () => {
            if (preview) preview.srcObject = null;
        };
    }, [scannerVideoRef]);

    useEffect(() => {
        dialogRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        };
    }, [onClose]);

    const handleDistanceCalibrated = useCallback(
        (calibration: ActiveCalibration) => {
            onDistanceCalibrated(calibration);
            // Lanjut ke bagian cahaya setelah pesan berhasil sempat terbaca.
            window.setTimeout(() => setStepIndex((i) => i + 1), 2500);
        },
        [onDistanceCalibrated],
    );

    const handleLuxCalibrated = useCallback(
        (calibration: LuxCalibrationContract) => {
            onLuxCalibrated(calibration);
            setStepIndex((i) => i + 1);
        },
        [onLuxCalibrated],
    );

    useEffect(() => {
        if (section === 'lux') speak('Kalibrasi cahaya. Letakkan luxmeter atau ponsel di posisi wajah, menghadap kamera.');
    }, [section, speak]);

    const finished = section === null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auto-calibration-title"
                className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-outline-variant/60 bg-surface-container-lowest shadow-xl outline-none dark:border-white/10 dark:bg-[#0F1B36]"
            >
                <div className="flex items-start justify-between gap-3 border-b border-outline-variant/50 px-4 py-4 sm:px-6 dark:border-white/10">
                    <div className="min-w-0">
                        <h3 id="auto-calibration-title" className="text-base font-bold text-deep-navy dark:text-white">
                            Kalibrasi otomatis kamera Studio
                        </h3>
                        <ol className="mt-1 flex flex-wrap gap-x-3 text-xs text-on-surface-variant dark:text-slate-400">
                            {steps.map((s, i) => (
                                <li
                                    key={s}
                                    aria-current={i === stepIndex ? 'step' : undefined}
                                    className={i === stepIndex ? 'font-bold text-royal-blue dark:text-sky-300' : ''}
                                >
                                    {i < stepIndex ? '✓ ' : `${i + 1}. `}
                                    {SECTION_TITLE[s]}
                                </li>
                            ))}
                        </ol>
                        <p className="mt-1 text-xs text-on-surface-variant dark:text-slate-400">
                            Pemindaian presensi dijeda sampai jendela ini ditutup.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setVoice((v) => !v)}
                            aria-pressed={voice}
                            aria-label={voice ? 'Matikan panduan suara' : 'Nyalakan panduan suara'}
                            className="min-h-[44px] min-w-[44px] rounded-xl text-on-surface-variant hover:bg-surface-container-low dark:text-slate-300 dark:hover:bg-white/5"
                        >
                            <span className="material-symbols-outlined">{voice ? 'volume_up' : 'volume_off'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Tutup kalibrasi"
                            className="min-h-[44px] min-w-[44px] rounded-xl text-on-surface-variant hover:bg-surface-container-low dark:text-slate-300 dark:hover:bg-white/5"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                <div className="grid flex-1 gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                    <div className="space-y-3 text-sm">
                        <div className="aspect-video overflow-hidden rounded-2xl bg-slate-900">
                            <video ref={previewRef} className="h-full w-full -scale-x-100 object-cover" muted playsInline autoPlay />
                        </div>
                        {section === 'distance' && (
                            <ol className="list-decimal space-y-1 pl-5 text-on-surface-variant dark:text-slate-300">
                                <li>Siapkan meteran. Ukur dari lensa kamera ke ujung hidung.</li>
                                <li>Duduk di jarak yang disebut, tatap kamera, lalu diam. Sistem merekam sendiri saat wajah stabil.</li>
                                <li>Setelah 30, 45, dan 60 cm terekam, kalibrasi jarak disimpan otomatis.</li>
                            </ol>
                        )}
                        {section === 'lux' && (
                            <ol className="list-decimal space-y-1 pl-5 text-on-surface-variant dark:text-slate-300">
                                <li>Letakkan luxmeter (atau ponsel) di posisi wajah, sensor menghadap kamera.</li>
                                <li>Atur lampu sesuai kondisi yang diminta, ketik angka luxmeter, tekan Enter.</li>
                                <li>Eksposur dikunci otomatis; sistem menunggu cahaya stabil lalu merekam.</li>
                                <li>Setelah kondisi redup, normal, dan terang terekam, kalibrasi lux disimpan otomatis.</li>
                            </ol>
                        )}
                        <p className="text-xs text-on-surface-variant dark:text-slate-400">
                            Aktif sekarang: jarak {activeDistance ? `#${activeDistance.id}` : 'belum dikalibrasi'}, lux{' '}
                            {activeLux
                                ? `#${activeLux.id}${activeLux.reference_device ? ` (acuan ${REFERENCE_DEVICE_LABEL[activeLux.reference_device].toLowerCase()})` : ''}`
                                : 'belum dikalibrasi'}
                            . Kalibrasi baru menggantikannya begitu tersimpan.
                        </p>
                    </div>

                    <div>
                        {section === 'distance' && (
                            <div className="space-y-3">
                                <DistanceAutoCalibration
                                    videoRef={scannerVideoRef}
                                    ratioRef={ratioRef}
                                    camera={camera}
                                    speak={speak}
                                    onCalibrated={handleDistanceCalibrated}
                                />
                                {steps.length > stepIndex + 1 && (
                                    <button
                                        type="button"
                                        onClick={() => setStepIndex((i) => i + 1)}
                                        className="text-xs font-bold text-royal-blue hover:underline dark:text-sky-400"
                                    >
                                        Lewati ke kalibrasi cahaya
                                    </button>
                                )}
                            </div>
                        )}
                        {section === 'lux' && luxSetup && (
                            <LuxCalibrationWizard
                                videoRef={scannerVideoRef}
                                getTrack={getTrack}
                                camera={camera}
                                setup={luxSetup}
                                onCalibrated={handleLuxCalibrated}
                                autoCommit
                                speak={speak}
                            />
                        )}
                        {finished && (
                            <div className="space-y-3">
                                <p role="status" className="rounded-xl bg-emerald-500/10 p-3 font-semibold text-emerald-800 dark:text-emerald-300">
                                    Kalibrasi selesai. Nilai {steps.map((st) => SECTION_TITLE[st].toLowerCase()).join(' dan ')} kini
                                    terukur otomatis di setiap presensi.
                                </p>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex min-h-[44px] items-center rounded-xl bg-royal-blue px-4 py-2 text-sm font-bold text-white hover:bg-deep-navy dark:bg-sky-600 dark:hover:bg-sky-500"
                                >
                                    Kembali ke presensi
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
