<?php

namespace App\Services;

/**
 * Keputusan Bab 5 (S1/S2/S3) di sisi web, sama dengan FusionModule.decide_s1/s2/s3
 * di facenet_emar_system.py (keputusan peneliti D1 = rumus (b), D2 = liveness dlib
 * mesin, 21 Oktober 2026).
 *
 * - S1: d <= ambang L2.
 * - S2: S1 DAN P_live >= ambang liveness (siklus kedip DAN siklus mulut dlib).
 * - S3: S1 DAN alpha * s_embed + (1 - alpha) * P_live >= ambang fusi,
 *   dengan s_embed = max(0, 1 - d / D_REF).
 *
 * Tanpa jarak dari mesin tidak ada yang dinilai (semua null). Tanpa landmark dlib
 * atau P_live, S2/S3 null (FTA liveness), sama dengan status FTA di mesin.
 * Urutan operasi aritmetika sengaja sama dengan Python agar hasil batasnya
 * (mis. d = 0,20 tepat) identik.
 */
final class FusionDecision
{
    /** Versi definisi keputusan yang dicatat di metadata tiap presentasi. */
    public const VERSION = 'D1b-D2dlib-2026-10-21';

    /** @return array{alpha: float, d_ref: float, threshold: float, liveness_threshold: float} */
    public static function constants(): array
    {
        $c = config('biometrics.fusion', []);

        return [
            'alpha' => (float) ($c['alpha'] ?? 0.60),
            'd_ref' => (float) ($c['d_ref'] ?? 1.20),
            'threshold' => (float) ($c['threshold'] ?? 0.50),
            'liveness_threshold' => (float) ($c['liveness_threshold'] ?? 1.0),
        ];
    }

    /**
     * P_live dari jumlah siklus dlib: w1 * min(kedip, 1) + w2 * min(mulut, 1),
     * w1 = w2 = 0,5, dibulatkan 6 desimal seperti EMARModule.liveness_from_sequence.
     */
    public static function pLiveFromCycles(?int $blinkCycles, ?int $mouthCycles): ?float
    {
        if ($blinkCycles === null || $mouthCycles === null) {
            return null;
        }
        $blink = min(max($blinkCycles, 0) / 1, 1.0);
        $mouth = min(max($mouthCycles, 0) / 1, 1.0);

        return round(min(0.5 * $blink + 0.5 * $mouth, 1.0), 6);
    }

    /**
     * @return array{evaluated: bool, s1: ?int, s2: ?int, s3: ?int, s_embed: ?float, p_live: ?float, s_final: ?float, liveness_valid: ?bool, liveness_fta: bool}
     */
    public static function evaluate(?float $distance, float $l2Threshold, ?float $pLive, ?int $landmarkFrames): array
    {
        $k = self::constants();
        if ($distance === null) {
            return [
                'evaluated' => false, 's1' => null, 's2' => null, 's3' => null, 's_embed' => null,
                'p_live' => $pLive, 's_final' => null, 'liveness_valid' => null, 'liveness_fta' => false,
            ];
        }

        $verified = $distance <= $l2Threshold;
        $sEmbed = max(0.0, 1.0 - $distance / $k['d_ref']);
        $livenessFta = $pLive === null || $landmarkFrames === 0;
        if ($livenessFta) {
            return [
                'evaluated' => true, 's1' => $verified ? 1 : 0, 's2' => null, 's3' => null, 's_embed' => $sEmbed,
                'p_live' => $pLive, 's_final' => null, 'liveness_valid' => null, 'liveness_fta' => true,
            ];
        }

        $live = $pLive >= $k['liveness_threshold'];
        $sFinal = $k['alpha'] * $sEmbed + (1.0 - $k['alpha']) * $pLive;

        return [
            'evaluated' => true,
            's1' => $verified ? 1 : 0,
            's2' => ($verified && $live) ? 1 : 0,
            's3' => ($verified && $sFinal >= $k['threshold']) ? 1 : 0,
            's_embed' => $sEmbed,
            'p_live' => $pLive,
            's_final' => $sFinal,
            'liveness_valid' => $live,
            'liveness_fta' => false,
        ];
    }
}
