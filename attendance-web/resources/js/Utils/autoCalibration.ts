/**
 * Logika wizard kalibrasi semi-otomatis di Studio. Sistem menunggu kondisi
 * stabil lalu merekam sendiri; acuan dunia nyata (jarak meteran, bacaan
 * luxmeter) tetap dari operator, karena tanpa itu angka hanya tebakan.
 */

/** Deret nilai stabil bila selama windowMs selisih maks-min <= maxRelSpread x median. */
export class StabilityTracker {
    private samples: Array<{ t: number; v: number }> = [];

    constructor(
        private readonly windowMs: number,
        private readonly maxRelSpread: number,
    ) {}

    /** null (wajah hilang, bingkai kosong) memutus kestabilan. */
    push(value: number | null, tMs: number): void {
        if (value === null || !Number.isFinite(value) || value <= 0) {
            this.samples = [];
            return;
        }
        this.samples.push({ t: tMs, v: value });
        const cutoff = tMs - this.windowMs * 2;
        while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    }

    isStable(nowMs: number): boolean {
        const recent = this.samples.filter((s) => s.t >= nowMs - this.windowMs);
        if (recent.length < 3) return false;
        // Sampel harus menutupi hampir seluruh jendela, bukan hanya beberapa bingkai terakhir.
        if (nowMs - this.samples[0].t < this.windowMs * 0.9) return false;
        const values = recent.map((s) => s.v).sort((a, b) => a - b);
        const mid = values[Math.floor(values.length / 2)];
        return (values[values.length - 1] - values[0]) / mid <= this.maxRelSpread;
    }

    reset(): void {
        this.samples = [];
    }
}

/** Wajah dianggap diam bila rasio lebarnya berubah <= 3% selama 2 detik. */
export const FACE_STABLE_MS = 2000;
export const FACE_STABLE_SPREAD = 0.03;
/** Cahaya dianggap stabil bila kecerahan berubah <= 4% selama 1 detik. */
export const LUMA_STABLE_MS = 1000;
export const LUMA_STABLE_SPREAD = 0.04;
/** Waktu mengambil posisi sebelum sistem mulai menunggu wajah diam. */
export const POSITIONING_MS = 5000;
export const COUNTDOWN_S = 3;

export type LuxCondition = 'redup' | 'normal' | 'terang';

export const LUX_CONDITION_TEXT: Record<LuxCondition, string> = {
    redup: 'redup, di bawah 100 lux (matikan sebagian lampu atau tutup tirai)',
    normal: 'normal, 100 sampai 300 lux (lampu ruangan biasa)',
    terang: 'terang, di atas 300 lux (nyalakan semua lampu atau buka tirai)',
};

export function luxCondition(lux: number): LuxCondition {
    return lux < 100 ? 'redup' : lux <= 300 ? 'normal' : 'terang';
}

/**
 * Kondisi cahaya berikutnya yang disarankan: normal lebih dulu (untuk mengunci
 * eksposur), lalu redup dan terang, agar rentang lux >= 3 kali lipat.
 * null bila ketiganya sudah terekam.
 */
export function nextLuxCondition(recordedLux: readonly number[]): LuxCondition | null {
    const have = new Set(recordedLux.map(luxCondition));
    for (const c of ['normal', 'redup', 'terang'] as const) {
        if (!have.has(c)) return c;
    }
    return null;
}

/** Syarat minimum sebelum kalibrasi lux dicoba disimpan (sama dengan LightingModel::fit). */
export function luxPointsReady(recordedLux: readonly number[], minPoints: number, minSpan = 3): boolean {
    if (recordedLux.length < minPoints) return false;
    const lo = Math.min(...recordedLux);
    const hi = Math.max(...recordedLux);
    return lo > 0 && hi / lo >= minSpan;
}
