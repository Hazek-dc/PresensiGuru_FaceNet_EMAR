<?php

namespace App\Services;

use App\Models\LuxCalibration;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Draf kalibrasi lux per pengguna (titik yang sudah direkam, belum disimpan),
 * dipakai halaman Kalibrasi Lux dan jendela kalibrasi di Studio presensi.
 */
final class LuxCalibrationDraft
{
    public const TTL_MINUTES = 60;

    /** Alat acuan pembacaan lux: luxmeter fisik atau aplikasi luxmeter di ponsel. */
    public const REFERENCE_DEVICES = ['luxmeter', 'luxmeter_app'];

    public static function get(Request $request): ?array
    {
        $draft = Cache::get(self::key($request));

        return is_array($draft) ? $draft : null;
    }

    public static function put(Request $request, array $draft): void
    {
        Cache::put(self::key($request), $draft, now()->addMinutes(self::TTL_MINUTES));
    }

    public static function forget(Request $request): void
    {
        Cache::forget(self::key($request));
    }

    public static function summary(?array $draft): array
    {
        return [
            'camera_label' => $draft['camera_label'] ?? null,
            'resolution_w' => $draft['resolution_w'] ?? null,
            'resolution_h' => $draft['resolution_h'] ?? null,
            'exposure_locked' => $draft['exposure_locked'] ?? null,
            'exposure_time' => $draft['exposure_time'] ?? null,
            'reference_device' => $draft['reference_device'] ?? null,
            'points' => collect($draft['points'] ?? [])->map(fn (array $p) => [
                'lux' => (float) $p['lux'],
                'browser_luma' => $p['browser_luma'],
                'engine_luma' => $p['engine_luma'],
                'engine_error' => $p['engine_error'] ?? null,
            ])->sortBy('lux')->values()->all(),
        ];
    }

    /** Batas dan draf yang dibutuhkan antarmuka kalibrasi. */
    public static function setupProps(Request $request): array
    {
        $ready = LuxCalibration::tablesReady();

        return [
            'migration_pending' => !$ready,
            'bands' => LightingModel::bandList(),
            'max_rel_error' => (float) config('biometrics.lux_calibration_max_rel_error', 0.20),
            'min_points' => LightingModel::MIN_POINTS,
            'max_points' => LightingModel::MAX_POINTS,
            'draft' => self::summary($ready ? self::get($request) : null),
        ];
    }

    private static function key(Request $request): string
    {
        return 'lux_calibration_draft:' . $request->user()->id;
    }
}
