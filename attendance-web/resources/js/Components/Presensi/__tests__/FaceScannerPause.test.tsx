import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { FaceScannerContainer, ScanMetrics } from '../FaceScannerContainer';

// Model MediaPipe dan Three.js tidak dimuat di jsdom; wajah dianggap selalu siap
// agar yang diuji hanya alur hitung mundur -> rekam 8 s -> kirim.
const landmarkState = { qualityScore: 0.9 };
// Fungsi hook harus stabil seperti aslinya (useCallback); fungsi baru tiap render
// membuat startCamera berganti identitas dan kamera dimulai ulang terus.
const stableHook = {
    landmarks: [{ x: 0.5, y: 0.5, z: 0 }],
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
        landmarks: stableHook.landmarks,
        blendshapes: null,
        qualityScore: landmarkState.qualityScore,
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

const fakeStream = {
    getTracks: () => [{ stop: () => {} }],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'cam-1', width: 1280, height: 720 }) }],
};

let container: HTMLDivElement;
let root: Root;
let onSubmit: Mock<(videoBlob: Blob, metrics: ScanMetrics) => void>;
let currentPaused = false;

// Scheduler React di Node memakai setImmediate, yang sengaja tidak dipalsukan:
// menunggu beberapa putaran cukup untuk menjalankan render, efek, dan promise kamera.
async function flush() {
    for (let i = 0; i < 6; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

async function render(paused: boolean) {
    currentPaused = paused;
    // qualityScore berubah tiap render supaya state machine scanner dievaluasi ulang,
    // seperti saat landmark baru datang tiap frame.
    landmarkState.qualityScore += 0.001;
    root.render(
        <FaceScannerContainer
            onVerificationSubmit={onSubmit}
            isVerifying={false}
            verificationResult={null}
            paused={paused}
        />,
    );
    await flush();
}

async function advance(ms: number) {
    vi.advanceTimersByTime(ms);
    await flush();
    await render(currentPaused);
}

/** Tunggu kamera, lewati tahan kualitas 600 ms, lalu hitung mundur 3 s. */
async function driveToRecording(paused: boolean) {
    await render(paused);
    await render(paused);
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

describe('FaceScannerContainer paused', () => {
    it('tanpa jeda: wajah siap memicu rekaman 8 s lalu dikirim (kontrol)', async () => {
        await driveToRecording(false);
        expect(FakeMediaRecorder.instances).toHaveLength(1);
        expect(FakeMediaRecorder.instances[0].state).toBe('recording');

        await advance(8000);
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('saat dijeda tidak memulai hitung mundur maupun rekaman', async () => {
        await driveToRecording(true);
        await advance(10000);

        expect(FakeMediaRecorder.instances).toHaveLength(0);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(container.textContent).toContain('dijeda selama pendaftaran wajah');
    });

    it('jeda di tengah rekaman membuang video tanpa mengirim presensi', async () => {
        await driveToRecording(false);
        const recorder = FakeMediaRecorder.instances[0];
        expect(recorder.state).toBe('recording');

        await render(true);
        expect(recorder.state).toBe('inactive');

        await advance(10000);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(FakeMediaRecorder.instances).toHaveLength(1);
    });

    it('jeda saat hitung mundur membatalkan rekaman yang akan dimulai', async () => {
        await render(false);
        await render(false);
        await advance(700);
        await advance(1000);
        expect(container.textContent).toContain('Bersiap');

        await render(true);
        await advance(5000);

        expect(FakeMediaRecorder.instances).toHaveLength(0);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('setelah jeda dilepas, pemindaian otomatis berjalan lagi', async () => {
        await driveToRecording(true);
        expect(FakeMediaRecorder.instances).toHaveLength(0);

        await render(false);
        await advance(700);
        await advance(1000);
        await advance(1000);
        await advance(1000);

        expect(FakeMediaRecorder.instances).toHaveLength(1);
    });
});
