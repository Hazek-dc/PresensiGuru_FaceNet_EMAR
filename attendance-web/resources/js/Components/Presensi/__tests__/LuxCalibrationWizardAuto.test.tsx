import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LuxCalibrationWizard } from '../LuxCalibrationWizard';

const post = vi.fn();
vi.mock('axios', () => ({
    default: { post: (...args: unknown[]) => post(...args), isAxiosError: () => false },
}));

// jsdom tidak punya piksel video: kecerahan dan foto disediakan tetap.
vi.mock('../../../Utils/luxCalibration', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../../Utils/luxCalibration')>();
    return {
        ...real,
        sampleVideoLuma: () => ({ mean: 120, saturated: 0, dark: 0 }),
        canvasJpeg: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
        supportsExposureLock: () => false,
    };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    post.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

const setup = {
    migration_pending: false,
    bands: [],
    max_rel_error: 0.2,
    min_points: 3,
    max_points: 8,
    draft: { camera_label: null, exposure_locked: null, reference_device: null, points: [] },
};

async function record(lux: string) {
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
        setValue.call(input, lux);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
        (container.querySelector('form') as HTMLFormElement).requestSubmit();
        // tunggu stabil (~1 s) + 15 sampel x 40 ms, dalam waktu nyata
        await new Promise((r) => setTimeout(r, 2200));
    });
}

describe('kalibrasi lux otomatis (Studio)', () => {
    it('menyarankan kondisi berikutnya dan menyimpan sendiri setelah redup, normal, terang', async () => {
        const points: Array<{ lux: number; browser_luma: number; engine_luma: number | null; engine_error: null }> = [];
        post.mockImplementation(async (url: string, form?: FormData) => {
            if (url.endsWith('/commit')) {
                return { data: { calibration: { id: 4, points, reference_device: 'luxmeter_app' }, warning: null } };
            }
            points.push({ lux: Number(form!.get('luxmeter_lux')), browser_luma: 120, engine_luma: null, engine_error: null });
            return { data: { draft: { ...setup.draft, points: [...points] }, engine_error: null, draft_reset: false } };
        });
        const onCalibrated = vi.fn();
        const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;
        await act(async () => {
            root.render(
                <LuxCalibrationWizard
                    videoRef={{ current: video }}
                    getTrack={() => null}
                    camera={{ label: 'USB', deviceId: 'cam', width: 1920, height: 1080, fps: 30 }}
                    setup={setup}
                    onCalibrated={onCalibrated}
                    autoCommit
                />,
            );
        });

        expect(container.textContent).toContain('Kondisi 1: atur cahaya normal');
        await record('220');
        expect(container.textContent).toContain('Kondisi 2: atur cahaya redup');
        await record('60');
        expect(post.mock.calls.some(([url]) => String(url).endsWith('/commit'))).toBe(false);
        await record('650');

        expect(post.mock.calls.filter(([url]) => String(url).endsWith('/point'))).toHaveLength(3);
        expect(post.mock.calls.some(([url]) => String(url).endsWith('/commit'))).toBe(true);
        expect(onCalibrated).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
    }, 20_000);
});
