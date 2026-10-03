import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoCameraLux } from '../useAutoCameraLux';

// jsdom tidak punya piksel video: hasil fotometri disediakan per tes.
const sample = vi.fn();
vi.mock('../../Utils/luxMeasurement', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../Utils/luxMeasurement')>();
    return { ...real, sampleCameraPhotometry: (...args: unknown[]) => sample(...args) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let frameTime = 0;
let frozen = false;
const video = {
    readyState: 4,
    paused: false,
    ended: false,
    get currentTime() {
        if (!frozen) frameTime += 1;
        return frameTime;
    },
} as unknown as HTMLVideoElement;

const analysis = (lux: number, mean = 120) => ({
    rawLux: lux,
    calibratedLux: lux,
    meanFaceY: mean,
    meanCenterY: mean,
    meanAmbientY: mean,
    shadowClipRatio: 0,
    highlightClipRatio: 0,
    contrastRatio: 1,
    isFaceTargeted: true,
    isGlareCompensated: false,
    method: 'human_face_photometry' as const,
});

function Probe({ enabled, onReading }: { enabled: boolean; onReading: (r: unknown) => void }) {
    useAutoCameraLux({ videoRef: { current: video }, faceROI: null, enabled, onReading });
    return null;
}

beforeEach(() => {
    vi.useFakeTimers();
    sample.mockReset();
    frozen = false;
    container = document.createElement('div');
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
});

describe('lux otomatis dari kamera Studio', () => {
    it('mengukur tiap detik tanpa kalibrasi, bertanda estimasi kamera beserta caranya', () => {
        sample.mockReturnValue(analysis(240));
        const onReading = vi.fn();
        act(() => root.render(<Probe enabled onReading={onReading} />));
        act(() => vi.advanceTimersByTime(2000));

        expect(onReading).toHaveBeenCalledTimes(3);
        expect(onReading).toHaveBeenLastCalledWith(
            expect.objectContaining({
                value: 240,
                source: 'camera',
                estimate: expect.objectContaining({ method: 'human_face_photometry', face_targeted: true }),
            }),
        );
    });

    it('frame hitam tidak menjadi bacaan (bukan batas bawah 5 lux)', () => {
        sample.mockReturnValue(analysis(5, 0));
        const onReading = vi.fn();
        act(() => root.render(<Probe enabled onReading={onReading} />));
        act(() => vi.advanceTimersByTime(3000));
        expect(onReading).not.toHaveBeenCalled();
    });

    it('video beku tidak memperbarui waktu ukur', () => {
        sample.mockReturnValue(analysis(240));
        const onReading = vi.fn();
        act(() => root.render(<Probe enabled onReading={onReading} />));
        expect(onReading).toHaveBeenCalledTimes(1);

        frozen = true;
        act(() => vi.advanceTimersByTime(5000));
        expect(onReading).toHaveBeenCalledTimes(1);
    });

    it('saat dimatikan menarik bacaannya dan berhenti mengukur', () => {
        sample.mockReturnValue(analysis(240));
        const onReading = vi.fn();
        act(() => root.render(<Probe enabled onReading={onReading} />));
        onReading.mockClear();

        act(() => root.render(<Probe enabled={false} onReading={onReading} />));
        expect(onReading).toHaveBeenCalledWith(null);
        onReading.mockClear();
        act(() => vi.advanceTimersByTime(3000));
        expect(onReading).not.toHaveBeenCalled();
    });
});
