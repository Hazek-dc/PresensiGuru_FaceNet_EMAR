/**
 * Kesesuaian hasil ukur dengan parameter uji Studio (target jarak dan lux).
 * Kembaran DistanceModel::targetMet() dan LightingModel::targetMet(). Hanya
 * penanda: presentasi di luar target tetap boleh dipindai dan dicatat.
 */
import { classifyLighting } from './luxCalibration';

const DISTANCE_BANDS: Array<[number, number]> = [
    [30, 40],
    [45, 55],
    [60, 70],
];

/** Rentang yang batas bawahnya paling dekat dengan target (30 -> 30-40, dst.). */
export function targetBand(targetCm: number | null | undefined): [number, number] | null {
    if (targetCm === null || targetCm === undefined || !(targetCm > 0)) return null;
    return DISTANCE_BANDS.reduce((best, band) => (Math.abs(targetCm - band[0]) < Math.abs(targetCm - best[0]) ? band : best));
}

export interface TargetCheck {
    met: boolean | null;
    text: string;
}

export function checkDistanceTarget(targetCm: number | null | undefined, measuredCm: number | null | undefined): TargetCheck | null {
    const band = targetBand(targetCm);
    if (!band) return null;
    if (measuredCm === null || measuredCm === undefined || !Number.isFinite(measuredCm)) {
        return { met: null, text: `Target ${band[0]}-${band[1]} cm, jarak belum terukur` };
    }
    const d = Math.round(measuredCm * 10) / 10;
    const met = d >= band[0] && d <= band[1];
    return {
        met,
        text: met ? `Sesuai target ${band[0]}-${band[1]} cm` : `Di luar target ${band[0]}-${band[1]} cm`,
    };
}

/** estimated: lux berasal dari perkiraan kamera tanpa kalibrasi, jadi kesesuaiannya juga perkiraan. */
export function checkLuxTarget(
    targetLux: number | null | undefined,
    measuredLux: number | null | undefined,
    estimated = false,
): TargetCheck | null {
    const target = classifyLighting(targetLux ?? null).kategoriNaskah;
    if (!target) return null;
    const measured = classifyLighting(measuredLux ?? null).kategoriNaskah;
    if (!measured) return { met: null, text: `Target cahaya ${target}, lux belum terukur` };
    const met = measured === target;
    const suffix = estimated ? ' (perkiraan)' : '';
    return { met, text: (met ? `Sesuai target cahaya ${target}` : `Cahaya ${measured}, target ${target}`) + suffix };
}
