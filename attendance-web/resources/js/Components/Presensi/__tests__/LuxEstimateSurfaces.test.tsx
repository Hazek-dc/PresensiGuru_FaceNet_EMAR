import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingMonitorPanel } from '../LightingMonitorPanel';
import { LightingStats, LightingStatsCard, LuxMeasurementStatus } from '../LightingStatsCard';
import { LightingSummary, LightingSummaryView } from '../LightingSummaryView';

vi.mock('@inertiajs/react', () => ({
    Link: ({ href, children }: { href: string; children?: unknown }) => <a href={href}>{children as never}</a>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

const render = (node: React.ReactNode) => act(() => root.render(<>{node}</>));

describe('panel Pencahayaan Studio', () => {
    const calibration = { id: 3, reference_device: null } as never;

    it('tanpa kalibrasi menampilkan perkiraan kamera bertanda ~ dan estimasi, bukan "Tidak terukur"', () => {
        render(
            <LightingMonitorPanel
                calibration={null}
                calibrationLoad="done"
                probe={null}
                recorded={{ lux: 212, source: 'camera' }}
                canCalibrate={false}
            />,
        );
        expect(container.textContent).toContain('~212 lux');
        expect(container.textContent).toContain('Estimasi kamera');
        expect(container.textContent).toContain('dicatat bersama presensi sebagai estimasi');
        expect(container.textContent).not.toContain('Tidak terukur');
    });

    it('tanpa kalibrasi dan tanpa gambar kamera menunggu, tanpa menyuruh kalibrasi', () => {
        render(<LightingMonitorPanel calibration={null} calibrationLoad="done" probe={null} recorded={{ lux: null, source: null }} canCalibrate={false} />);
        expect(container.textContent).toContain('Tidak terukur');
        expect(container.textContent).toContain('Menunggu gambar kamera');
        expect(container.textContent).not.toMatch(/kalibrasi/i);
    });

    it('sampel terkalibrasi yang dicatat tampil tanpa tanda estimasi', () => {
        const probe = { lux: 250, luma: 90, calibrationId: 3, exposureLocked: true, frames: [], measuredAt: Date.now(), note: null };
        render(
            <LightingMonitorPanel
                calibration={calibration}
                calibrationLoad="done"
                probe={probe}
                recorded={{ lux: 250, source: 'camera_calibrated' }}
                canCalibrate={false}
            />,
        );
        expect(container.textContent).toContain('250 lux');
        expect(container.textContent).toContain('dengan kalibrasi #3');
        expect(container.textContent).not.toContain('~');
        expect(container.textContent).not.toContain('Estimasi kamera');
    });

    it('sampel terkalibrasi yang basi tidak ditampilkan; yang dicatat perkiraan kamera', () => {
        const stale = { lux: 250, luma: 90, calibrationId: 3, exposureLocked: true, frames: [], measuredAt: 0, note: null };
        render(
            <LightingMonitorPanel
                calibration={calibration}
                calibrationLoad="done"
                probe={stale}
                recorded={{ lux: 180, source: 'camera' }}
                canCalibrate={false}
            />,
        );
        expect(container.textContent).toContain('~180 lux');
        expect(container.textContent).not.toContain('250 lux');
        expect(container.textContent).toContain('sementara dicatat estimasi kamera');
    });

    it('di tab Riset bacaan luxmeter tampil sebagai hasil ukur', () => {
        render(
            <LightingMonitorPanel
                calibration={null}
                calibrationLoad="done"
                probe={null}
                recorded={{ lux: 240, source: 'luxmeter' }}
                autoEstimate={false}
                canCalibrate={false}
            />,
        );
        expect(container.textContent).toContain('240 lux');
        expect(container.textContent).toContain('Luxmeter');
        expect(container.textContent).not.toContain('Tidak terukur');
        expect(container.textContent).not.toContain('Menunggu gambar kamera');
    });

    it('di tab Riset tanpa bacaan menunjuk ke widget, bukan ke perkiraan otomatis', () => {
        render(
            <LightingMonitorPanel
                calibration={null}
                calibrationLoad="done"
                probe={null}
                recorded={{ lux: null, source: null }}
                autoEstimate={false}
                canCalibrate={false}
            />,
        );
        expect(container.textContent).toContain('widget Luxometer');
        expect(container.textContent).not.toContain('Menunggu gambar kamera');
    });
});

describe('Dasbor pencahayaan', () => {
    const stats: LightingStats = {
        current_lux: 180,
        current_category: 'STANDARD',
        current_status: 'VALID',
        current_source: 'camera',
        current_source_label: 'Perkiraan kamera (belum dikalibrasi)',
        current_kategori_naskah: 'normal',
        current_at: null,
        average_today: null,
        scans_today: 2,
        measured_today: 0,
        estimated_today: 2,
        estimated_average_today: 175,
        optimal_pct: null,
        warning_pct: null,
        calibrated: false,
        calibration: null,
        can_calibrate: true,
    };

    it('estimasi kamera ditampilkan terpisah dari lux terukur', () => {
        render(<LightingStatsCard stats={stats} />);
        expect(container.textContent).toContain('~180 lux · STANDARD (estimasi)');
        expect(container.textContent).toContain('Lux terukur hari ini0 dari 2 pemindaian');
        expect(container.textContent).toContain('Estimasi kamera hari ini2 pemindaian · rata-rata ~175 lux');
    });

    it('tanpa kalibrasi, kalibrasi ditawarkan sebagai opsional', () => {
        render(<LuxMeasurementStatus stats={stats} />);
        expect(container.textContent).toContain('memperkirakan lux dari kamera secara otomatis');
        expect(container.textContent).toContain('~180 lux');
        expect(container.textContent).toContain('Kalibrasi lux (opsional, untuk nilai terukur)');
    });
});

describe('ringkasan pencahayaan riwayat', () => {
    const estimated: LightingSummary = {
        lux: 212.4, source: 'camera', source_label: 'Perkiraan kamera (belum dikalibrasi)',
        kategori_naskah: 'normal', category: 'OPTIMAL', status: 'READY',
        target: 300, target_kategori: 'normal', target_met: true,
        calibration_id: null, reference_device: null, reference_label: null,
        note: null, note_label: null,
    };

    it('perkiraan kamera diberi ~ dan kesesuaian target ditandai perkiraan', () => {
        render(<LightingSummaryView summary={estimated} variant="compact" />);
        expect(container.textContent).toContain('~212.4 lux');
        expect(container.textContent).toContain('Sesuai target normal (300 lux) (perkiraan)');
    });
});
