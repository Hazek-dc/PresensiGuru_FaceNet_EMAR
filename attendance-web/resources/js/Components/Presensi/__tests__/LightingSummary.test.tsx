import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightingCsvRows, LightingSummary, LightingSummaryView } from '../LightingSummaryView';
import { LuxometerWidget } from '../LuxometerWidget';

let container: HTMLDivElement;
let root: Root;

async function flush() {
    for (let i = 0; i < 6; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
});

const measured: LightingSummary = {
    lux: 245.3, source: 'engine', source_label: 'Kamera terkalibrasi (mesin)',
    kategori_naskah: 'normal', category: 'OPTIMAL', status: 'READY',
    target: 300, target_kategori: 'normal', target_met: true,
    calibration_id: 7, reference_device: 'luxmeter_app', reference_label: 'Aplikasi luxmeter HP',
    note: null, note_label: null,
};

describe('widget Luxometer tab Riset', () => {
    const noVideo = { current: null };

    it('dengan kalibrasi: menampilkan sampel terkalibrasi, bukan perkiraan', async () => {
        const onLuxChange = vi.fn();
        root.render(
            <LuxometerWidget
                currentLux={300}
                onLuxChange={onLuxChange}
                videoRef={noVideo}
                luxCalibration={{ id: 7, referenceLabel: 'Aplikasi luxmeter HP' }}
                calibratedReading={{ lux: 245, measuredAt: Date.now(), note: null }}
            />,
        );
        await flush();

        expect(container.textContent).toContain('Kamera terkalibrasi #7');
        expect(container.textContent).toContain('245');
        expect(container.textContent).not.toContain('Perkiraan (belum dikalibrasi)');
        // Perkiraan fotometri tidak pernah dikirim sebagai bacaan.
        expect(onLuxChange.mock.calls.every(([reading]) => reading === null)).toBe(true);
    });

    it('tanpa kalibrasi: perkiraan diberi label belum dikalibrasi', async () => {
        root.render(<LuxometerWidget currentLux={null} onLuxChange={() => {}} videoRef={noVideo} />);
        await flush();

        expect(container.textContent).toContain('Perkiraan (belum dikalibrasi)');
    });
});

describe('ringkasan pencahayaan', () => {
    it('ringkas: lux, kategori, sumber, dan kesesuaian target', async () => {
        root.render(<LightingSummaryView summary={measured} variant="compact" />);
        await flush();

        expect(container.textContent).toContain('245.3 lux');
        expect(container.textContent).toContain('normal');
        expect(container.textContent).toContain('Kamera terkalibrasi (mesin)');
        expect(container.textContent).toContain('Sesuai target normal (300 lux)');
    });

    it('lengkap: alasan ditampilkan bila lux tidak terukur, target tetap target', async () => {
        root.render(
            <LightingSummaryView
                summary={{
                    ...measured, lux: null, source: null, source_label: null, kategori_naskah: null, category: null,
                    status: null, target_met: null, calibration_id: null, reference_device: null, reference_label: null,
                    note: 'no_lux_calibration', note_label: 'Belum ada kalibrasi luxmeter dan perkiraan kamera tidak terkirim (kamera belum siap atau gambar terlalu gelap/terang).',
                }}
            />,
        );
        await flush();

        expect(container.textContent).toContain('Belum terukur');
        expect(container.textContent).toContain('Target normal (300 lux), belum terukur');
        expect(container.textContent).toContain('Belum ada kalibrasi luxmeter dan perkiraan kamera tidak terkirim (kamera belum siap atau gambar terlalu gelap/terang).');
    });

    it('baris CSV Studio memakai nama parameter yang sama dengan ekspor server', () => {
        const names = lightingCsvRows(measured).map((row) => row.split(',')[0]);
        expect(names).toEqual([
            'Sumber_Lux', 'Kategori_Naskah_Lux', 'Target_Lux', 'Sesuai_Target_Lux', 'ID_Kalibrasi_Lux', 'Alat_Acuan_Lux',
        ]);
        expect(lightingCsvRows(measured)[3]).toContain('Sesuai_Target_Lux,1,');
        expect(lightingCsvRows(null)).toEqual([]);
    });
});
