/**
 * Tampilan jarak FaceNet L2 apa adanya. Tidak ada nilai pengganti: jarak yang
 * tidak dikirim server tetap tidak ditampilkan.
 */

/** Angka desimal gaya Indonesia (koma), mis. 0.644 -> "0,644". */
export function formatDecimalId(value: number, digits: number): string {
    return value.toFixed(digits).replace('.', ',');
}

/** Number(null) bernilai 0, jadi null/''/undefined harus ditolak lebih dulu. */
export function toFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        return null;
    }
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * "Jarak L2 0,644 · batas ≤ 0,40". Tanpa jarak hasilnya null; tanpa ambang
 * (server lama) hanya jaraknya yang ditampilkan.
 */
export function l2ThresholdCaption(distance: unknown, threshold: unknown): string | null {
    const d = toFiniteNumber(distance);
    if (d === null) return null;
    const caption = `Jarak L2 ${formatDecimalId(d, 3)}`;
    const t = toFiniteNumber(threshold);
    return t === null ? caption : `${caption} · batas ≤ ${formatDecimalId(t, 2)}`;
}
