import { RefObject, useEffect, useRef } from 'react';
import {
    isUsablePhotometry,
    loadLuxCalibration,
    luxEstimateDetail,
    LuxSensorSmoother,
    NormalizedFaceROI,
    sampleCameraPhotometry,
} from '../Utils/luxMeasurement';
import { LuxSource, SensorReading } from '../Utils/sensorReading';

export const AUTO_LUX_INTERVAL_MS = 1000;

interface AutoCameraLuxOptions {
    videoRef: RefObject<HTMLVideoElement | null>;
    faceROI: NormalizedFaceROI | null;
    /** Mati saat widget luxometer (tab Riset) yang mengukur. */
    enabled: boolean;
    onReading: (reading: SensorReading<LuxSource> | null) => void;
}

/**
 * Perkiraan lux dari kamera pemindai, jalan sendiri tiap detik tanpa kalibrasi.
 * Sumbernya 'camera', jadi di layar, riwayat, dan ekspor tetap bertanda estimasi.
 * Bila ada sampel kamera terkalibrasi yang segar, luxReadingForSubmit memakai sampel itu.
 */
export function useAutoCameraLux({ videoRef, faceROI, enabled, onReading }: AutoCameraLuxOptions): void {
    const roiRef = useRef(faceROI);
    roiRef.current = faceROI;
    const onReadingRef = useRef(onReading);
    onReadingRef.current = onReading;

    useEffect(() => {
        if (!enabled) return;
        const canvas = document.createElement('canvas');
        const smoother = new LuxSensorSmoother(0.3, 0.75);
        const profile = loadLuxCalibration();
        let lastFrameTime: number | null = null;

        const tick = () => {
            try {
                const video = videoRef.current;
                if (!video || video.paused || video.ended) return;
                // Video yang membeku (currentTime tidak maju) tidak boleh memperbarui
                // waktu ukur; biarkan bacaan lama kedaluwarsa lewat freshReading.
                const frameTime = video.currentTime;
                if (lastFrameTime !== null && frameTime === lastFrameTime) return;
                lastFrameTime = frameTime;

                const analysis = sampleCameraPhotometry(video, canvas, roiRef.current, profile);
                if (!analysis || !Number.isFinite(analysis.calibratedLux) || !isUsablePhotometry(analysis)) return;
                onReadingRef.current({
                    value: smoother.update(analysis.calibratedLux),
                    source: 'camera',
                    measuredAt: Date.now(),
                    estimate: luxEstimateDetail(analysis, profile),
                });
            } catch {
                // Frame belum bisa dibaca (kamera baru menyala); coba lagi di detik berikutnya.
            }
        };
        tick();
        const timer = window.setInterval(tick, AUTO_LUX_INTERVAL_MS);
        return () => {
            window.clearInterval(timer);
            // Perkiraan yang sudah berhenti tidak boleh ikut terkirim sebagai bacaan segar.
            onReadingRef.current(null);
        };
    }, [enabled, videoRef]);
}
