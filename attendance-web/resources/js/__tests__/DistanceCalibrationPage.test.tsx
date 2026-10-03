import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DistanceCalibration from '../Pages/Admin/DistanceCalibration';

// Berkas ini sengaja di luar Pages/: app.tsx memuat semua Pages/**/*.tsx ke bundle.
// Kamera, MediaPipe, dan axios dipalsukan; yang diuji alur rekam titik -> commit.

const A = 12.6;
const B = 0.5;
const ratioFor = (cm: number) => A / (cm - B);

function faceWithRatio(ratio: number) {
    const lms = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    lms[234] = { x: 0.5 - ratio / 2, y: 0.5, z: 0 };
    lms[454] = { x: 0.5 + ratio / 2, y: 0.5, z: 0 };
    return lms;
}

const hook: {
    onResults: ((result: unknown, landmarks: unknown[]) => void) | null;
    faceVisible: boolean;
    landmarks: Array<{ x: number; y: number; z: number }>;
} = { onResults: null, faceVisible: true, landmarks: faceWithRatio(ratioFor(30)) };

// processFrame harus stabil seperti useCallback aslinya.
const stable = {
    processFrame: () => {
        if (hook.faceVisible) hook.onResults?.({}, hook.landmarks);
    },
    resetSmoothing: () => {},
};

vi.mock('../Hooks/useFaceLandmarker', () => ({
    useFaceLandmarker: (options: { onResults?: (result: unknown, landmarks: unknown[]) => void }) => {
        hook.onResults = options.onResults ?? null;
        return {
            isLoaded: true,
            isLoading: false,
            error: null,
            hasFace: hook.faceVisible,
            landmarks: hook.faceVisible ? hook.landmarks : null,
            processFrame: stable.processFrame,
            resetSmoothing: stable.resetSmoothing,
        };
    },
}));

vi.mock('../Layouts/AuthenticatedLayout', () => ({
    default: ({ header, children }: { header?: unknown; children?: unknown }) => (
        <div>
            {header as never}
            {children as never}
        </div>
    ),
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ href, children }: { href: string; children?: unknown }) => <a href={href}>{children as never}</a>,
}));

const axiosPost = vi.fn();
vi.mock('axios', async (importOriginal) => {
    const actual = await importOriginal<typeof import('axios')>();
    return {
        default: {
            post: (...args: unknown[]) => axiosPost(...args),
            isAxiosError: actual.default.isAxiosError,
        },
    };
});

const fakeTrack = {
    label: 'EYESEC USB Camera',
    stop: () => {},
    getSettings: () => ({ deviceId: 'cam-1', width: 1920, height: 1080, frameRate: 30 }),
};
const fakeStream = { getTracks: () => [fakeTrack], getVideoTracks: () => [fakeTrack] };

let container: HTMLDivElement;
let root: Root;

async function flush() {
    for (let i = 0; i < 6; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

async function mount(props: Record<string, unknown> = {}) {
    root.render(<DistanceCalibration {...props} />);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
}

function stepButton(index: number): HTMLButtonElement {
    return container.querySelectorAll('ol li')[index].querySelector('button') as HTMLButtonElement;
}

function commitButton(): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Simpan kalibrasi') as HTMLButtonElement;
}

async function click(button: HTMLButtonElement) {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
}

async function recordStep(index: number, cm: number) {
    hook.landmarks = faceWithRatio(ratioFor(cm));
    await click(stepButton(index));
    await vi.advanceTimersByTimeAsync(2500);
    await flush();
}

function pointResponse(target: number, done: number[]) {
    return {
        data: {
            target_cm: target,
            browser_ratio: Number(ratioFor(target).toFixed(6)),
            engine_ratio: Number((ratioFor(target) * 0.85).toFixed(6)),
            engine_frames: 5,
            engine_error: null,
            points_done: done,
            draft_reset: false,
        },
    };
}

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'],
    });
    hook.faceVisible = true;
    hook.landmarks = faceWithRatio(ratioFor(30));
    axiosPost.mockReset();
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: vi.fn(async () => fakeStream),
            enumerateDevices: vi.fn(async () => []),
        },
    });
    const media = window.HTMLMediaElement.prototype;
    Object.defineProperty(media, 'play', { configurable: true, value: () => Promise.resolve() });
    Object.defineProperty(media, 'readyState', { configurable: true, get: () => 4 });
    const video = window.HTMLVideoElement.prototype as unknown as Record<string, unknown>;
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 1080 });
    Object.defineProperty(video, 'requestVideoFrameCallback', {
        configurable: true,
        value: (cb: (now: number) => void) => setTimeout(() => cb(performance.now()), 33),
    });
    Object.defineProperty(video, 'cancelVideoFrameCallback', {
        configurable: true,
        value: (id: number) => clearTimeout(id),
    });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: () => ({ drawImage: () => {} }),
    });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        value: (cb: (blob: Blob | null) => void) => cb(new Blob(['jpeg'], { type: 'image/jpeg' })),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    root.unmount();
    await flush();
    container.remove();
    vi.useRealTimers();
});

describe('Halaman kalibrasi jarak', () => {
    it('menampilkan info kamera asli, instruksi meteran, dan belum bisa disimpan', async () => {
        await mount();

        expect(container.textContent).toContain('EYESEC USB Camera');
        expect(container.textContent).toContain('1920x1080');
        expect(container.textContent).toContain('30 fps');
        expect(container.textContent).toContain(
            'Duduk di kursi. Ukur jarak dari lensa kamera ke pangkal hidung dengan meteran: 45 cm.',
        );
        expect(container.textContent).toContain('Belum ada kalibrasi');
        expect(commitButton().disabled).toBe(true);
    });

    it('rekam titik mengirim median rasio, jumlah sampel, info kamera, dan 5 frame JPEG', async () => {
        axiosPost.mockResolvedValueOnce(pointResponse(30, [30]));
        await mount();
        await recordStep(0, 30);

        expect(axiosPost).toHaveBeenCalledTimes(1);
        const [url, form] = axiosPost.mock.calls[0] as [string, FormData];
        expect(url).toBe('/api/biometric/calibration/point');
        expect(form.get('target_cm')).toBe('30');
        expect(Number(form.get('browser_ratio'))).toBeCloseTo(ratioFor(30), 9);
        expect(Number(form.get('browser_samples'))).toBeGreaterThanOrEqual(10);
        expect(form.get('camera_label')).toBe('EYESEC USB Camera');
        expect(form.get('resolution_w')).toBe('1920');
        expect(form.get('resolution_h')).toBe('1080');
        expect(form.getAll('frames[]')).toHaveLength(5);

        expect(container.textContent).toContain(ratioFor(30).toFixed(4));
        expect(container.textContent).toContain('tersimpan sementara');
        expect(commitButton().disabled).toBe(true);
    });

    it('wajah tidak terlihat: titik tidak dikirim', async () => {
        await mount();
        hook.faceVisible = false;
        await click(stepButton(0));
        await vi.advanceTimersByTimeAsync(2500);
        await flush();

        expect(axiosPost).not.toHaveBeenCalled();
        expect(container.textContent).toContain('Wajah hanya terdeteksi pada 0 dari');
    });

    it('server atau engine mati: pesan jelas dan titik tidak dianggap tersimpan', async () => {
        axiosPost.mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, data: {} } });
        await mount();
        await recordStep(0, 30);

        expect(container.textContent).toContain('Titik 30 cm belum tersimpan');
        expect(container.textContent).toContain('Engine biometrik tidak dapat dihubungi');
        expect(stepButton(0).textContent).toBe('Rekam titik');
    });

    it('titik tanpa rasio engine: peringatan berisi alasan dari server', async () => {
        axiosPost.mockResolvedValueOnce({
            data: { ...pointResponse(30, [30]).data, engine_ratio: null, engine_frames: 0, engine_error: 'Mesin biometrik tidak menemukan wajah pada foto yang dikirim.' },
        });
        await mount();
        await recordStep(0, 30);

        expect(container.textContent).toContain('tanpa rasio engine');
        expect(container.textContent).toContain('Mesin biometrik tidak menemukan wajah');
    });

    it('tiga titik lalu simpan: commit dikirim dan model tampil', async () => {
        axiosPost
            .mockResolvedValueOnce(pointResponse(30, [30]))
            .mockResolvedValueOnce(pointResponse(45, [30, 45]))
            .mockResolvedValueOnce(pointResponse(60, [30, 45, 60]))
            .mockResolvedValueOnce({
                data: {
                    calibrated: true,
                    calibration: {
                        id: 9,
                        camera_label: 'EYESEC USB Camera',
                        resolution_w: 1920,
                        resolution_h: 1080,
                        browser: { a: A, b: B, max_residual_cm: 0 },
                        engine: { a: A * 0.85, b: B, max_residual_cm: 0.1 },
                        points: [30, 45, 60].map((t) => ({
                            target_cm: t,
                            browser_ratio: ratioFor(t),
                            engine_ratio: ratioFor(t) * 0.85,
                        })),
                        created_at: '2026-09-27T10:00:00+07:00',
                    },
                    warning: null,
                },
            });
        await mount();
        await recordStep(0, 30);
        await recordStep(1, 45);
        await recordStep(2, 60);

        expect(container.textContent).toContain('Pratinjau model browser');
        expect(commitButton().disabled).toBe(false);
        await click(commitButton());
        await flush();

        expect(axiosPost).toHaveBeenLastCalledWith('/api/biometric/calibration/commit', {}, expect.anything());
        expect(container.textContent).toContain('Kalibrasi #9 aktif');
        expect(container.textContent).toContain('Hasil kalibrasi #9');
        expect(container.textContent).toContain('Uji kalibrasi aktif');
    });

    it('commit ditolak 422: alasan server ditampilkan', async () => {
        axiosPost
            .mockResolvedValueOnce(pointResponse(30, [30]))
            .mockResolvedValueOnce(pointResponse(45, [30, 45]))
            .mockResolvedValueOnce(pointResponse(60, [30, 45, 60]))
            .mockRejectedValueOnce({
                isAxiosError: true,
                response: { status: 422, data: { message: 'Kalibrasi browser ditolak. Sisa model 4.1 cm melebihi batas 3 cm.' } },
            });
        await mount();
        await recordStep(0, 30);
        await recordStep(1, 45);
        await recordStep(2, 60);
        await click(commitButton());
        await flush();

        expect(container.textContent).toContain('Kalibrasi tidak disimpan. Kalibrasi browser ditolak.');
    });

    it('titik lama di draf server disebutkan agar direkam ulang', async () => {
        await mount({ draft: { points_done: [60] } });
        expect(container.textContent).toContain('Server masih menyimpan titik 60 cm');
    });
});
