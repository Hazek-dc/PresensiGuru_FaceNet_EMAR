<?php

namespace App\Services;

/**
 * Aturan jarak kamera-wajah di sisi PHP: klasifikasi rentang posisi, fit model
 * kalibrasi d = a / r + b, dan estimasi jarak dari rasio lebar wajah.
 * Teks pesan, batas, dan matematika fit harus sama dengan
 * resources/js/Utils/distanceCalibration.ts.
 */
final class DistanceModel
{
    public const INVALID = 'INVALID';

    /** Jarak kalibrasi (cm), diukur meteran dari lensa kamera ke wajah. */
    public const CALIBRATION_TARGETS_CM = [30, 45, 60];

    public const NO_FACE_MESSAGE = 'Wajah belum terdeteksi';
    public const NO_DISTANCE_MESSAGE = 'Jarak belum terukur';

    private const DEFAULT_BANDS = [
        'DEKAT' => [30.0, 40.0],
        'IDEAL' => [45.0, 55.0],
        'JAUH' => [60.0, 70.0],
    ];

    private const BAND_WORDS = ['DEKAT' => 'dekat', 'IDEAL' => 'sesuai', 'JAUH' => 'jauh'];

    /** @return array<string, array{0: float, 1: float}> rentang inklusif, urut dari yang terdekat */
    public static function bands(): array
    {
        $bands = config('biometrics.distance_bands') ?: self::DEFAULT_BANDS;
        $bands = array_map(fn ($band) => [(float) $band[0], (float) $band[1]], $bands);
        uasort($bands, fn ($x, $y) => $x[0] <=> $y[0]);

        return $bands;
    }

    /** @return list<array{category: string, min_cm: float, max_cm: float, target_cm: int, message: string}> */
    public static function bandList(): array
    {
        $list = [];
        foreach (self::bands() as $category => [$lo, $hi]) {
            $list[] = [
                'category' => $category,
                'min_cm' => $lo,
                'max_cm' => $hi,
                'target_cm' => (int) $lo,
                'message' => self::bandMessage($category),
            ];
        }

        return $list;
    }

    /**
     * Rentang untuk target skenario Studio: rentang yang batas bawahnya paling
     * dekat dengan target (30 -> 30-40, 45 -> 45-55, 60 -> 60-70).
     *
     * @return array{0: float, 1: float}|null
     */
    public static function targetBand(?float $targetCm): ?array
    {
        if ($targetCm === null || $targetCm <= 0) {
            return null;
        }
        $best = null;
        foreach (self::bands() as [$lo, $hi]) {
            if ($best === null || abs($targetCm - $lo) < abs($targetCm - $best[0])) {
                $best = [$lo, $hi];
            }
        }

        return $best;
    }

    /** Jarak terukur berada di rentang target skenario; null bila salah satunya tidak ada. */
    public static function targetMet(?float $targetCm, ?float $distanceCm): ?bool
    {
        $band = self::targetBand($targetCm);
        if ($band === null || $distanceCm === null) {
            return null;
        }
        $d = round($distanceCm, 1);

        return $d >= $band[0] && $d <= $band[1];
    }

    /** Kategori jarak tercatat; null bila jarak tidak terukur (bukan INVALID). */
    public static function category(?float $distanceCm): ?string
    {
        if ($distanceCm === null) {
            return null;
        }

        $d = round($distanceCm, 1);
        foreach (self::bands() as $category => [$lo, $hi]) {
            if ($d >= $lo && $d <= $hi) {
                return $category;
            }
        }

        return self::INVALID;
    }

    /**
     * Pra-cek sebelum pemindaian 8 s. Ketiga rentang boleh lanjut di semua mode;
     * hasil ini tidak pernah dipakai untuk keputusan S1/S2/S3.
     *
     * @return array{distance_cm: float|null, category: string, allow_verification: bool, message: string}
     */
    public static function classify(?float $distanceCm, bool $faceDetected = true): array
    {
        if (!$faceDetected) {
            return self::result(null, self::INVALID, self::NO_FACE_MESSAGE);
        }
        if ($distanceCm === null) {
            return self::result(null, self::INVALID, self::NO_DISTANCE_MESSAGE);
        }

        $d = round($distanceCm, 1);
        $category = self::category($d);
        if ($category !== self::INVALID) {
            return self::result($d, $category, self::bandMessage($category));
        }

        return self::result($d, self::INVALID, self::guidance($d));
    }

    /**
     * Fit kuadrat terkecil d = a / r + b atas titik 30/45/60 cm.
     *
     * @param array<int|string, float|int|string|null> $ratios target_cm => rasio lebar wajah median
     * @return array{ok: bool, reason: string|null, a: float|null, b: float|null, max_residual_cm: float|null, residuals: array<int, float>}
     */
    public static function fit(array $ratios): array
    {
        $fail = fn (string $reason) => [
            'ok' => false, 'reason' => $reason, 'a' => null, 'b' => null,
            'max_residual_cm' => null, 'residuals' => [],
        ];

        $points = [];
        $missing = [];
        foreach (self::CALIBRATION_TARGETS_CM as $target) {
            $r = $ratios[$target] ?? $ratios[(string) $target] ?? null;
            if (!is_numeric($r) || (float) $r <= 0.0 || (float) $r > 1.0) {
                $missing[] = $target . ' cm';
                continue;
            }
            $points[$target] = (float) $r;
        }
        if ($missing) {
            return $fail('Titik kalibrasi belum lengkap: ' . implode(', ', $missing) . ' belum terekam.');
        }

        // Wajah makin kecil saat makin jauh. Bila tidak, ada titik yang direkam
        // pada jarak yang salah dan fit akan tetap "berhasil" dengan model keliru.
        $targets = self::CALIBRATION_TARGETS_CM;
        for ($i = 1; $i < count($targets); $i++) {
            if (!($points[$targets[$i - 1]] > $points[$targets[$i]])) {
                return $fail(sprintf(
                    'Rasio lebar wajah tidak mengecil dari %d cm ke %d cm (%.4f lalu %.4f). Ulangi perekaman dengan jarak yang diukur meteran.',
                    $targets[$i - 1], $targets[$i], $points[$targets[$i - 1]], $points[$targets[$i]]
                ));
            }
        }

        $n = count($points);
        $xs = array_map(fn (float $r) => 1.0 / $r, $points);
        $meanX = array_sum($xs) / $n;
        $meanD = array_sum(array_keys($points)) / $n;
        $sxx = 0.0;
        $sxd = 0.0;
        foreach ($xs as $target => $x) {
            $sxx += ($x - $meanX) ** 2;
            $sxd += ($x - $meanX) * ($target - $meanD);
        }
        $a = $sxd / $sxx;
        $b = $meanD - $a * $meanX;

        if (!($a > 0)) {
            return $fail('Model jarak tidak sah: koefisien a tidak positif. Ulangi perekaman ketiga titik.');
        }

        $residuals = [];
        foreach ($xs as $target => $x) {
            $residuals[$target] = round($target - ($a * $x + $b), 2);
        }
        $maxResidual = max(array_map('abs', $residuals));
        $limit = (float) config('biometrics.calibration_max_residual_cm', 3.0);
        if ($maxResidual > $limit) {
            return [
                'ok' => false,
                'reason' => sprintf(
                    'Sisa model %s cm melebihi batas %s cm. Ulangi perekaman titik yang meleset.',
                    self::fmt($maxResidual, 2), self::fmt($limit, 2)
                ),
                'a' => $a, 'b' => $b, 'max_residual_cm' => $maxResidual, 'residuals' => $residuals,
            ];
        }

        return [
            'ok' => true, 'reason' => null, 'a' => $a, 'b' => $b,
            'max_residual_cm' => $maxResidual, 'residuals' => $residuals,
        ];
    }

    /** Jarak (cm, 0,1) dari rasio lebar wajah; null bila rasio atau model tidak ada. */
    public static function estimate(?float $ratio, ?float $a, ?float $b): ?float
    {
        if ($ratio === null || $ratio <= 0.0 || $a === null || $b === null || !($a > 0)) {
            return null;
        }

        return round($a / $ratio + $b, 1);
    }

    /**
     * Rasio lebar wajah dibagi lebar bingkai, jadi tidak bergantung resolusi selama
     * aspeknya sama. Bingkai beraspek lain (mis. 4:3 dari kamera 16:9) memotong
     * bidang pandang, sehingga model kalibrasi tidak berlaku untuknya.
     */
    public static function sameAspect(int $w1, int $h1, int $w2, int $h2): bool
    {
        if ($w1 <= 0 || $h1 <= 0 || $w2 <= 0 || $h2 <= 0) {
            return false;
        }
        $expected = $w2 / $h2;

        return abs(($w1 / $h1) - $expected) / $expected <= 0.02;
    }

    public static function bandMessage(string $category): string
    {
        return sprintf('Posisi %s (%s)', self::BAND_WORDS[$category] ?? strtolower($category), self::bandRange($category));
    }

    private static function bandRange(string $category): string
    {
        [$lo, $hi] = self::bands()[$category];

        return self::fmt($lo) . '-' . self::fmt($hi) . ' cm';
    }

    /**
     * Arahkan ke tepi rentang terdekat. Tepat di tengah celah (42,5 atau 57,5 cm)
     * arahnya mundur ke rentang yang lebih jauh. Berbeda dengan
     * tingkat_jarak_terdekat() di parameter_penelitian.py, yang memilih pusat
     * tingkat terdekat (keduanya berbeda arah di 40,1-42,4 dan 55,1-57,4 cm).
     */
    private static function guidance(float $d): string
    {
        $nearest = null;
        $nearestGap = INF;
        foreach (self::bands() as $category => [$lo, $hi]) {
            $gap = round($d < $lo ? $lo - $d : $d - $hi, 2);
            if ($gap <= $nearestGap) {
                $nearest = $category;
                $nearestGap = $gap;
            }
        }

        [$lo] = self::bands()[$nearest];

        return ($d < $lo ? 'Mundur' : 'Maju') . ' ke ' . self::bandRange($nearest);
    }

    private static function result(?float $distanceCm, string $category, string $message): array
    {
        return [
            'distance_cm' => $distanceCm,
            'category' => $category,
            'allow_verification' => $category !== self::INVALID,
            'message' => $message,
        ];
    }

    private static function fmt(float $value, int $decimals = 1): string
    {
        return rtrim(rtrim(number_format($value, $decimals, '.', ''), '0'), '.');
    }
}
