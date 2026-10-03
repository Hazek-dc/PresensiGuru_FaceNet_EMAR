import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import type { ActiveCalibration, CameraInfo } from '../../../Utils/distanceCalibration';
import { FaceScannerContainer, ScanMetrics } from '../FaceScannerContainer';

// Pola sama dengan FaceScannerPause.test.tsx: MediaPipe dan Three.js dipalsukan,
// yang diuji hanya pra-cek jarak sebelum hitung mundur dan perekaman 8 s.
const A = 12.6;
const B = 0.5;
const ratioFor = (cm: number) => A / (cm - B);

function faceWithRatio(ratio: number) {
    const lms = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    lms[234] = { x: 0.5 - ratio / 2, y: 0.5, z: 0 };
    lms[454] = { x: 0.5 + ratio / 2, y: 0.5, z: 0 };
    return lms;
}

// Estimasi antropometri tanpa kalibrasi sekitar 90 cm (di luar semua rentang).
function farUncalibratedFace() {
    const lms = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    lms[33] = { x: 0.45, y: 0.45, z: 0 };
    lms[133] = { x: 0.45, y: 0.45, z: 0 };
    lms[263] = { x: 0.5006, y: 0.45, z: 0 };
    lms[362] = { x: 0.5006, y: 0.45, z: 0 };
    lms[234] = { x: 0.43, y: 0.5, z: 0 };
    lms[454] = { x: 0.57, y: 0.5, z: 0 };
    return lms;
}

const hookState: { landmarks: Array<{ x: number; y: number; z: number }>; qualityScore: number } = {
    landmarks: faceWithRatio(ratioFor(50)),
    qualityScore: 0.9,
};
const stableHook = {
    processFrame: () => {},
    resetSmoothing: () => {},
    landmarksRef: { current: null },
};

vi.mock('../../../Hooks/useFaceLandmarker', () => ({
    useFaceLandmarker: () => ({
        isLoaded: false,
        isLoading: false,
        error: null,
        hasFace: true,
        faceCount: 1,
        landmarks: hookState.landmarks,
        blendshapes: null,
        qualityScore: hookState.qualityScore,
        trackingConfidence: 0.9,
        ear: null,
        mar: null,
        processFrame: stableHook.processFrame,
        resetSmoothing: stableHook.resetSmoothing,
        landmarksRef: stableHook.landmarksRef,
    }),
}));

vi.mock('../../../Hooks/useThreeFaceMesh', () => ({
    useThreeFaceMesh: () => {},
}));

vi.mock('../../../Utils/faceGeometry', () => ({
    evaluateQualityGate: () => ({ isReady: true, state: 'READY', message: 'Siap' }),
}));

class FakeMediaRecorder {
    static instances: FakeMediaRecorder[] = [];
    state: 'inactive' | 'recording' = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;

    constructor() {
        FakeMediaRecorder.instances.push(this);
    }

    start() {
        this.state = 'recording';
    }

    stop() {
        if (this.state !== 'recording') return;
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['x'], { type: 'video/webm' }) });
        this.onstop?.();
    }
}

const fakeTrack = {
    label: 'EYESEC USB Camera',
    stop: () => {},
    getSettings: () => ({ deviceId: 'cam-1', width: 1920, height: 1080, frameRate: 30 }),
};
const fakeStream = {
    getTracks: () => [fakeTrack],
    getVideoTracks: () => [fakeTrack],
};

const calibration: ActiveCalibration = {
    id: 3,
    camera_label: 'EYESEC USB Camera',
    resolution_w: 1920,
    resolution_h: 1080,
    browser: { a: A, b: B, max_residual_cm: 0.2 },
    engine: null,
    points: [],
    created_at: null,
};

let container: HTMLDivElement;
let root: Root;
let onSubmit: Mock<(videoBlob: Blob, metrics: ScanMetrics) => void>;
let onDistance: Mock<(cm: number, ok: boolean, category: string, source: string) => void>;
let onCamera: Mock<(info: CameraInfo | null) => void>;
let currentCalibration: ActiveCalibration | null = null;
let currentLuxOverlay: { lux: number | null; source: string | null; calibrated: boolean; note: string | null } | null = null;

async function flush() {
    for (let i = 0; i < 6; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

async function render() {
    hookState.qualityScore += 0.001;
    root.render(
        <FaceScannerContainer
            onVerificationSubmit={onSubmit}
            isVerifying={false}
            verificationResult={null}
            distanceCalibration={currentCalibration}
            onDistanceUpdate={onDistance}
            onCameraInfoChange={onCamera}
            luxOverlay={currentLuxOverlay}
        />,
    );
    await flush();
}

async function advance(ms: number) {
    vi.advanceTimersByTime(ms);
    await flush();
    await render();
}

async function driveToRecording() {
    await render();
    await render();
    await advance(700);
    await advance(1000);
    await advance(1000);
    await advance(1000);
}

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'],
    });
    FakeMediaRecorder.instances = [];
    currentLuxOverlay = null;
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: vi.fn(async () => fakeStream),
            enumerateDevices: vi.fn(async () => []),
        },
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: () => Promise.resolve(),
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
        configurable: true,
        value: () => {},
    });
    onSubmit = vi.fn<(videoBlob: Blob, metrics: ScanMetrics) => void>();
    onDistance = vi.fn<(cm: number, ok: boolean, category: string, source: string) => void>();
    onCamera = vi.fn<(info: CameraInfo | null) => void>();
    currentCalibration = null;
    hookState.landmarks = faceWithRatio(ratioFor(50));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    root.unmount();
    await flush();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('FaceScannerContainer pra-cek jarak', () => {
    it('terkalibrasi, 42 cm: hitung mundur tidak mulai dan arahan tampil', async () => {
        currentCalibration = calibration;
        hookState.landmarks = faceWithRatio(ratioFor(42));
        await driveToRecording();
        await advance(10000);

        expect(FakeMediaRecorder.instances).toHaveLength(0);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(container.textContent).toContain('Maju ke 30-40 cm');
        expect(container.querySelector('[data-testid="distance-overlay"]')?.textContent).toContain('42.0 cm');
        // Arahan saat diblokir ada di pil status, bukan baris estimasi untuk layar sempit.
        expect(container.querySelector('[role="status"]')?.textContent).toContain('Maju ke 30-40 cm');
        expect(container.querySelector('[data-testid="distance-guidance-mobile"]')).toBeNull();
    });

    it('belum terkalibrasi: arahan tampil sebelum hitung mundur sebagai estimasi', async () => {
        hookState.landmarks = farUncalibratedFace();
        await render();
        await render();

        expect(container.querySelector('[data-testid="distance-overlay"]')?.textContent).toContain('Maju ke 60-70 cm');
        expect(container.querySelector('[data-testid="distance-guidance-mobile"]')?.textContent).toBe(
            'Maju ke 60-70 cm (estimasi)',
        );
    });

    it('wajah tidak terdeteksi: jarak tertulis "Tidak terukur"', async () => {
        currentCalibration = calibration;
        hookState.landmarks = [];
        await render();
        await render();

        expect(container.querySelector('[data-testid="distance-overlay"]')?.textContent).toBe('Tidak terukur');
    });

    it('terkalibrasi, 50 cm: pemindaian 8 s berjalan dan jarak bersumber kamera terkalibrasi', async () => {
        currentCalibration = calibration;
        await driveToRecording();

        expect(FakeMediaRecorder.instances).toHaveLength(1);
        expect(onDistance).toHaveBeenLastCalledWith(50, true, 'Ideal (45-55 cm)', 'camera_calibrated');
        expect(onCamera).toHaveBeenLastCalledWith({
            label: 'EYESEC USB Camera',
            deviceId: 'cam-1',
            width: 1920,
            height: 1080,
            fps: 30,
        });
    });

    it('terkalibrasi, rentang dekat dan jauh juga boleh lanjut', async () => {
        currentCalibration = calibration;
        hookState.landmarks = faceWithRatio(ratioFor(65));
        await driveToRecording();

        expect(FakeMediaRecorder.instances).toHaveLength(1);
    });

    it('subjek keluar rentang saat hitung mundur: perekaman batal', async () => {
        currentCalibration = calibration;
        await render();
        await render();
        await advance(700);
        await advance(1000);
        expect(container.textContent).toContain('Bersiap');

        hookState.landmarks = faceWithRatio(ratioFor(90));
        await render();
        await advance(1000);
        await advance(1000);
        await advance(1000);

        expect(FakeMediaRecorder.instances).toHaveLength(0);
        expect(container.textContent).toContain('Maju ke 60-70 cm');
    });

    it('belum terkalibrasi: jarak di luar rentang tidak memblokir presensi', async () => {
        hookState.landmarks = farUncalibratedFace();
        await driveToRecording();

        expect(FakeMediaRecorder.instances).toHaveLength(1);
        const [cm, ok, , source] = onDistance.mock.calls[onDistance.mock.calls.length - 1];
        expect(cm).toBeGreaterThan(70);
        expect(ok).toBe(false);
        expect(source).toBe('camera');
        expect(container.querySelector('[data-testid="distance-overlay"]')?.textContent).toContain('estimasi');
    });

    it('kalibrasi kamera lain tidak dipakai dan tidak memblokir', async () => {
        currentCalibration = { ...calibration, camera_label: 'Integrated Webcam' };
        hookState.landmarks = faceWithRatio(ratioFor(42));
        await driveToRecording();

        expect(FakeMediaRecorder.instances).toHaveLength(1);
        expect(onDistance.mock.calls.every((call) => call[3] === 'camera')).toBe(true);
    });
});

describe('FaceScannerContainer lux di sebelah jarak', () => {
    const luxText = () => container.querySelector('[data-testid="lux-overlay"]')?.textContent ?? '';

    it('lux kamera terkalibrasi tampil dengan kategori naskah, tanpa tanda estimasi', async () => {
        currentLuxOverlay = { lux: 245.3, source: 'camera_calibrated', calibrated: true, note: null };
        await render();
        expect(luxText()).toContain('245 lux');
        expect(luxText()).toContain('normal');
        expect(luxText()).not.toContain('~');
        expect(luxText()).not.toContain('estimasi');
    });

    it('perkiraan kamera tanpa kalibrasi ditandai ~ dan estimasi', async () => {
        currentLuxOverlay = { lux: 80, source: 'camera', calibrated: false, note: null };
        await render();
        expect(luxText()).toContain('~80 lux');
        expect(luxText()).toContain('redup');
        expect(luxText()).toContain('(estimasi)');
    });

    it('tanpa kalibrasi dan tanpa bacaan: Tidak terukur, menunggu estimasi otomatis', async () => {
        currentLuxOverlay = { lux: null, source: null, calibrated: false, note: null };
        await render();
        expect(luxText()).toBe('Tidak terukur');
        expect(container.querySelector('[data-testid="lux-overlay"]')?.getAttribute('title')).toContain('estimasi otomatis');
    });
});
