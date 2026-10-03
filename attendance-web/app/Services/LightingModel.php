<?php

namespace App\Services;

/**
 * Aturan pencahayaan: klasifikasi lux (PRD Lux Lighting Control bagian 6 dan 8),
 * kategori naskah (redup/normal/terang, sama dengan kategori_lux() di
 * parameter_penelitian.py), dan model kalibrasi kamera terhadap luxmeter.
 * Teks, batas, dan matematika fit harus sama dengan
 * resources/js/Utils/luxCalibration.ts.
 *
 * Semua kategori boleh lanjut ke pemindaian; kategori hanya dicatat dan
 * ditampilkan, tidak pernah ikut keputusan S1/S2/S3.
 */
final class LightingModel
{
    public const LOW = 'LOW';
    public const STANDARD = 'STANDARD';
    public const OPTIMAL = 'OPTIMAL';
    public const HIGH = 'HIGH';

    /** Batas luma yang masih dapat dipakai; di luar ini kamera jenuh atau terlalu gelap. */
    public const LUMA_MIN = 5.0;
    public const LUMA_MAX = 250.0;
    public const MIN_POINTS = 3;
    public const MAX_POINTS = 8;
    /** Titik kalibrasi harus mencakup rentang lux yang cukup lebar (maks/min). */
    public const MIN_LUX_SPAN = 3.0;

    /**
     * PRD bagian 8: urutan pemeriksaan LOW, OPTIMAL (200-300 inklusif), STANDARD
     * (100 sampai < 200), selain itu HIGH. Karena itu 300 lux adalah OPTIMAL,
     * walau tabel uji PRD (LX06) menulis VALID.
     *
     * @return array{lux: float|null, category: string|null, status: string|null, message: string, kategori_naskah: string|null}
     */
    public static function classify(?float $lux): array
    {
        if ($lux === null || !is_finite($lux) || $lux < 0) {
            return [
                'lux' => null,
                'category' => null,
                'status' => null,
                'message' => 'Pencahayaan belum terukur',
                'kategori_naskah' => null,
            ];
        }

        $lux = round($lux, 1);
        [$category, $status, $message] = match (true) {
            $lux < 100 => [self::LOW, 'WARNING', 'Pencahayaan terlalu rendah'],
            $lux >= 200 && $lux <= 300 => [self::OPTIMAL, 'READY', 'Pencahayaan optimal'],
            $lux >= 100 && $lux < 200 => [self::STANDARD, 'VALID', 'Pencahayaan cukup'],
            default => [self::HIGH, 'MONITOR', 'Pencahayaan tinggi, pantau silau'],
        };

        return [
            'lux' => $lux,
            'category' => $category,
            'status' => $status,
            'message' => $message,
            'kategori_naskah' => $lux < 100 ? 'redup' : ($lux <= 300 ? 'normal' : 'terang'),
        ];
    }

    /**
     * Fit log10(lux) = a + b * log10(luma / 255) dengan kuadrat terkecil.
     *
     * @param list<array{lux: float|int|null, luma: float|int|null}> $points
     * @return array{ok: bool, a: float|null, b: float|null, max_rel_error: float|null, errors: array<int, float>, reason: string|null}
     */
    public static function fit(array $points): array
    {
        $fail = fn (string $reason) => [
            'ok' => false, 'a' => null, 'b' => null, 'max_rel_error' => null, 'errors' => [], 'reason' => $reason,
        ];

        $points = array_values($points);
        if (count($points) < self::MIN_POINTS) {
            return $fail(sprintf('Butuh minimal %d kondisi cahaya, baru %d.', self::MIN_POINTS, count($points)));
        }
        foreach ($points as $p) {
            if (!is_numeric($p['lux'] ?? null) || (float) $p['lux'] <= 0) {
                return $fail('Setiap titik harus punya bacaan luxmeter lebih dari 0.');
            }
            if (!is_numeric($p['luma'] ?? null)) {
                return $fail(sprintf('Titik %s lux tidak punya kecerahan kamera.', self::fmt((float) $p['lux'])));
            }
            $luma = (float) $p['luma'];
            if ($luma <= self::LUMA_MIN || $luma >= self::LUMA_MAX) {
                return $fail(sprintf(
                    'Titik %s lux: gambar %s (kecerahan %s dari 255). Ubah cahaya lalu rekam ulang titik ini.',
                    self::fmt((float) $p['lux']), $luma >= self::LUMA_MAX ? 'jenuh' : 'terlalu gelap', self::fmt($luma),
                ));
            }
        }

        usort($points, fn ($x, $y) => (float) $x['lux'] <=> (float) $y['lux']);
        $luxes = array_map(fn ($p) => (float) $p['lux'], $points);
        if (max($luxes) / min($luxes) < self::MIN_LUX_SPAN) {
            return $fail(sprintf(
                'Rentang cahaya terlalu sempit (%s-%s lux). Rekam kondisi redup dan terang juga, minimal %s kali lipat.',
                self::fmt(min($luxes)), self::fmt(max($luxes)), self::fmt(self::MIN_LUX_SPAN),
            ));
        }
        for ($i = 1; $i < count($points); $i++) {
            if ((float) $points[$i]['luma'] <= (float) $points[$i - 1]['luma']) {
                return $fail('Kecerahan kamera tidak naik seiring lux. Kamera kemungkinan masih mengatur eksposur otomatis; kunci eksposur lalu rekam ulang.');
            }
        }

        $xs = array_map(fn ($p) => log10((float) $p['luma'] / 255.0), $points);
        $ys = array_map(fn ($p) => log10((float) $p['lux']), $points);
        $n = count($xs);
        $mx = array_sum($xs) / $n;
        $my = array_sum($ys) / $n;
        $sxx = 0.0;
        $sxy = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $sxx += ($xs[$i] - $mx) ** 2;
            $sxy += ($xs[$i] - $mx) * ($ys[$i] - $my);
        }
        if ($sxx <= 0.0) {
            return $fail('Kecerahan kamera sama di semua titik; model tidak dapat dibuat.');
        }
        $b = $sxy / $sxx;
        $a = $my - $b * $mx;
        if ($b <= 0.0) {
            return $fail('Model tidak sah: lux tidak naik seiring kecerahan kamera.');
        }

        $errors = [];
        foreach ($points as $p) {
            $pred = 10 ** ($a + $b * log10((float) $p['luma'] / 255.0));
            $errors[(int) round((float) $p['lux'])] = round(abs($pred - (float) $p['lux']) / (float) $p['lux'], 4);
        }
        $maxError = max($errors);
        $limit = (float) config('biometrics.lux_calibration_max_rel_error', 0.20);
        if ($maxError > $limit) {
            return array_merge($fail(sprintf(
                'Galat model %s%% melebihi batas %s%%. Ulangi titik yang menyimpang, pastikan luxmeter di posisi wajah.',
                self::fmt($maxError * 100), self::fmt($limit * 100),
            )), ['a' => $a, 'b' => $b, 'max_rel_error' => $maxError, 'errors' => $errors]);
        }

        return ['ok' => true, 'a' => $a, 'b' => $b, 'max_rel_error' => $maxError, 'errors' => $errors, 'reason' => null];
    }

    /**
     * Lux terukur berada pada kategori naskah yang sama dengan target skenario
     * (redup/normal/terang); null bila target atau lux tidak ada.
     */
    public static function targetMet(?float $targetLux, ?float $lux): ?bool
    {
        if ($targetLux === null || $lux === null) {
            return null;
        }

        return self::classify($targetLux)['kategori_naskah'] === self::classify($lux)['kategori_naskah'];
    }

    /** Lux dari luma dengan model kalibrasi, dibulatkan 0,1; null bila tidak dapat dihitung. */
    public static function estimate(?float $luma, ?float $a, ?float $b): ?float
    {
        if ($luma === null || $a === null || $b === null || !is_finite($luma) || $luma <= 0.0) {
            return null;
        }
        $lux = 10 ** ($a + $b * log10($luma / 255.0));

        return is_finite($lux) ? round($lux, 1) : null;
    }

    /** @return list<array{category: string, status: string, label: string}> */
    public static function bandList(): array
    {
        return [
            ['category' => self::LOW, 'status' => 'WARNING', 'label' => '< 100 lux'],
            ['category' => self::STANDARD, 'status' => 'VALID', 'label' => '100 - < 200 lux'],
            ['category' => self::OPTIMAL, 'status' => 'READY', 'label' => '200 - 300 lux'],
            ['category' => self::HIGH, 'status' => 'MONITOR', 'label' => '> 300 lux'],
        ];
    }

    public static function fmt(float $v): string
    {
        return rtrim(rtrim(number_format($v, 1, '.', ''), '0'), '.');
    }
}
