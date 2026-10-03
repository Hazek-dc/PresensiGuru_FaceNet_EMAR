import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DistanceAutoCalibration, FaceRatioSample } from '../DistanceAutoCalibration';

const post = vi.fn();
vi.mock('axios', () => ({
    default: { post: (...args: unknown[]) => post(...args), isAxiosError: () => false },
}));

// jsdom tidak punya piksel video; foto untuk engine diganti blob kecil.
vi.mock('../../../Utils/distanceCalibration', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../../Utils/distanceCalibration')>();
    return { ...real, captureVideoJpeg: async () => new Blob(['jpeg'], { type: 'image/jpeg' }) };
});

let container: HTMLDivElement;
let root: Root;
let ticker: ReturnType<typeof setInterval>;
const ratioRef: { current: FaceRatioSample } = { current: { ratio: null, t: 0 } };
const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    post.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    clearInterval(ticker);
    root.unmount();
    container.remove();
    vi.useRealTimers();
});

/** Pemindai mengirim rasio tiap 33 ms; nilai dari fungsi agar bisa diam atau bergerak. */
function feedRatios(value: (t: number) => number | null) {
    ticker = setInterval(() => {
        const t = performance.now();
        ratioRef.current = { ratio: value(t), t };
    }, 33);
}

describe('kalibrasi jarak otomatis di Studio', () => {
    it('wajah diam: ketiga titik direkam sendiri berurutan lalu kalibrasi disimpan', async () => {
        post.mockImplementation(async (url: string, form: FormData) =>
            url.endsWith('/commit')
                ? { data: { calibration: { id: 9, camera_label: 'USB', resolution_w: 1920, resolution_h: 1080, browser: { a: 12.6, b: 0, max_residual_cm: 0.4 }, engine: null, points: [], created_at: null } } }
                : { data: { engine_ratio: 0.3, target_cm: Number(form.get('target_cm')) } },
        );
        feedRatios(() => 0.3);
        const onCalibrated = vi.fn();
        root.render(
            <DistanceAutoCalibration
                videoRef={{ current: video }}
                ratioRef={ratioRef}
                camera={{ label: 'USB', deviceId: 'cam', width: 1920, height: 1080, fps: 30 }}
                speak={() => {}}
                onCalibrated={onCalibrated}
            />,
        );

        // posisi 5 s + diam 2 s + hitung mundur 3 s + rekam 2 s per titik, dengan kelonggaran.
        for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(14_000);
        await vi.advanceTimersByTimeAsync(1_000);

        const targets = post.mock.calls
            .filter(([url]) => String(url).endsWith('/point'))
            .map(([, form]) => (form as FormData).get('target_cm'));
        expect(targets).toEqual(['30', '45', '60']);
        const first = post.mock.calls[0][1] as FormData;
        expect(Number(first.get('browser_ratio'))).toBeCloseTo(0.3, 5);
        expect(first.getAll('frames[]').length).toBe(5);
        expect(post.mock.calls.some(([url]) => String(url).endsWith('/commit'))).toBe(true);
        expect(onCalibrated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
        expect(container.textContent).toContain('Kalibrasi jarak #9 disimpan');
    });

    it('wajah terus bergerak: tidak ada yang direkam', async () => {
        feedRatios((t) => 0.25 + (Math.floor(t / 300) % 2) * 0.03);
        root.render(
            <DistanceAutoCalibration
                videoRef={{ current: video }}
                ratioRef={ratioRef}
                camera={null}
                speak={() => {}}
                onCalibrated={() => {}}
            />,
        );
        await vi.advanceTimersByTimeAsync(20_000);

        expect(post).not.toHaveBeenCalled();
        expect(container.textContent).toContain('menunggu wajah stabil');
    });
});
