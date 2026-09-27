<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

class LuxController extends Controller
{
    protected string $storageFile;

    public function __construct()
    {
        $this->storageFile = storage_path('app/lux_reading.json');
    }

    /**
     * Categorize lux value according to Cochran's Q & ISO/IEC 30107-3 experimental design.
     * Rentang Subbab 5.2: redup < 100, standar 100 - 300, terang > 300.
     */
    public static function categorizeLux(float $lux): array
    {
        if ($lux < 100) {
            return [
                'condition' => 'Redup',
                'code' => 'LOW',
                'description' => 'Pencahayaan rendah (< 100 Lux)',
                'is_optimal' => false,
            ];
        }

        if ($lux <= 300) {
            return [
                'condition' => 'Standar',
                'code' => 'NORMAL',
                'description' => 'Pencahayaan standar operasional (100 - 300 Lux)',
                'is_optimal' => true,
            ];
        }

        return [
            'condition' => 'Terang',
            'code' => 'HIGH',
            'description' => 'Pencahayaan tinggi (> 300 Lux)',
            'is_optimal' => false,
        ];
    }

    /**
     * Bacaan lux terakhir dari luxmeter. Tanpa bacaan, nilai null (bukan preset):
     * halaman presensi tidak boleh mengirim angka yang tidak pernah diukur.
     */
    public function current(Request $request)
    {
        $data = self::storedReading($this->storageFile, 'current_lux_reading', 'lux');
        $status = self::readingStatus($data, 'lux');
        $category = $status['value'] === null ? null : self::categorizeLux($status['value']);

        return response()->json([
            'success' => true,
            'lux' => $status['value'] === null ? null : round($status['value'], 1),
            'condition' => $category['condition'] ?? null,
            'condition_code' => $category['code'] ?? null,
            'condition_desc' => $category['description'] ?? null,
            'is_optimal' => $category['is_optimal'] ?? null,
            'source' => $status['source'],
            'device' => $status['device'],
            'updated_at' => $status['updated_at'],
            'seconds_ago' => $status['seconds_ago'],
            'is_stale' => $status['is_stale'],
            'is_measured' => $status['is_measured'],
            'not_measured_reason' => $status['not_measured_reason'],
            'max_age_s' => $status['max_age_s'],
        ]);
    }

    /**
     * Bacaan tersimpan dari sidecar JSON (ditulis skrip pengukur atau update()),
     * atau dari cache bila berkas tidak ada. Null bila tidak ada bacaan sama sekali.
     */
    public static function storedReading(string $file, string $cacheKey, string $valueKey): ?array
    {
        if (File::exists($file)) {
            try {
                $decoded = json_decode(File::get($file), true);
                if (is_array($decoded) && isset($decoded[$valueKey])) {
                    return $decoded;
                }
            } catch (\Throwable $e) {
                // Berkas rusak/sedang ditulis: coba cache.
            }
        }

        $cached = Cache::get($cacheKey);
        return is_array($cached) && isset($cached[$valueKey]) ? $cached : null;
    }

    /**
     * Apakah bacaan sensor layak disebut hasil ukur. Aturannya sama dengan
     * read_sidecar() di capture_session.py: preset, penyetelan manual (tune),
     * nilai bawaan, bacaan gagal (raw_reading "NO_...") dan bacaan yang lebih
     * tua dari biometrics.sensor_max_age_s bukan pengukuran. Dipakai juga oleh
     * DistanceController.
     */
    public static function readingStatus(?array $data, string $valueKey): array
    {
        $maxAge = (float) config('biometrics.sensor_max_age_s', 10);

        if ($data === null || !is_numeric($data[$valueKey] ?? null)) {
            return [
                'value' => null,
                'source' => 'none',
                'device' => null,
                'updated_at' => null,
                'seconds_ago' => null,
                'is_stale' => null,
                'is_measured' => false,
                'not_measured_reason' => 'no_reading',
                'max_age_s' => $maxAge,
            ];
        }

        $source = (string) ($data['source'] ?? 'unknown');
        $updatedAt = is_string($data['updated_at'] ?? null) && $data['updated_at'] !== ''
            ? $data['updated_at']
            : null;

        $secondsAgo = null;
        if ($updatedAt !== null) {
            try {
                $secondsAgo = round(Carbon::parse($updatedAt)->diffInSeconds(now(), false), 1);
            } catch (\Throwable $e) {
                $secondsAgo = null;
            }
        }

        // Umur yang tidak diketahui atau cap waktu jauh di masa depan (jam tidak
        // sinkron) tidak bisa dibuktikan segar, jadi diperlakukan basi.
        $isStale = $secondsAgo === null || $secondsAgo > $maxAge || $secondsAgo < -$maxAge;
        $isPreset = (bool) preg_match('/preset|tune|default|fallback/i', $source);
        $raw = $data['raw_reading'] ?? null;
        $sensorFailed = is_string($raw) && str_starts_with(strtoupper(trim($raw)), 'NO_');

        $reason = match (true) {
            $isPreset => 'not_a_measurement',
            $sensorFailed => 'sensor_no_data',
            $isStale => 'stale',
            default => null,
        };

        return [
            'value' => (float) $data[$valueKey],
            'source' => $source,
            'device' => $data['device'] ?? null,
            'updated_at' => $updatedAt,
            'seconds_ago' => $secondsAgo,
            'is_stale' => $isStale,
            'is_measured' => $reason === null,
            'not_measured_reason' => $reason,
            'max_age_s' => $maxAge,
        ];
    }

    /**
     * Update current lux measurement from external luxometer script, serial device, or optical camera.
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'lux' => 'required|numeric|min:0|max:100000',
            'source' => 'nullable|string|max:50',
            'device' => 'nullable|string|max:100',
            'raw_reading' => 'nullable',
        ]);

        $luxValue = (float) $validated['lux'];
        $category = self::categorizeLux($luxValue);
        $source = $validated['source'] ?? 'script';
        $device = $validated['device'] ?? 'luxometer';

        $payload = [
            'lux' => round($luxValue, 1),
            'condition' => $category['condition'],
            'condition_code' => $category['code'],
            'condition_desc' => $category['description'],
            'is_optimal' => $category['is_optimal'],
            'source' => $source,
            'device' => $device,
            'raw_reading' => $validated['raw_reading'] ?? null,
            'updated_at' => now()->toIso8601String(),
        ];

        try {
            $dir = dirname($this->storageFile);
            if (!File::isDirectory($dir)) {
                File::makeDirectory($dir, 0755, true, true);
            }
            File::put($this->storageFile, json_encode($payload, JSON_PRETTY_PRINT));
        } catch (\Throwable $e) {
            // Fallback to cache if storage write fails
        }

        Cache::put('current_lux_reading', $payload, now()->addMinutes(30));

        return response()->json([
            'success' => true,
            'message' => 'Lux measurement updated successfully',
            'data' => $payload,
        ]);
    }
}
