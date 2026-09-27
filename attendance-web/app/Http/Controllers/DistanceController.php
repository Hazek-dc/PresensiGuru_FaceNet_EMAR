<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Cache;

class DistanceController extends Controller
{
    protected string $storageFile;

    public function __construct()
    {
        $this->storageFile = storage_path('app/distance_reading.json');
    }

    /**
     * Categorize distance according to Cochran's Q & ISO/IEC 30107-3 experimental benchmarks
     * (rentang posisi Subbab 5.2):
     * - 30cm: Dekat (30 - 40 cm)
     * - 45cm: Ideal (45 - 55 cm)
     * - 60cm: Jauh (60 - 70 cm)
     * Posisi 40 - 45 cm dan 55 - 60 cm di luar rentang, dilaporkan sebagai TOO_CLOSE
     * terhadap tingkat terdekat (45 atau 60) karena subjek perlu mundur.
     */
    public static function categorizeDistance(float $distanceCm): array
    {
        if ($distanceCm < 30) {
            return [
                'condition' => 'Terlalu Dekat',
                'code' => 'TOO_CLOSE',
                'description' => 'Jarak terlalu dekat (< 30 cm)',
                'is_ideal' => false,
                'benchmark' => 30,
            ];
        }

        if ($distanceCm <= 40) {
            return [
                'condition' => '30 cm (Dekat)',
                'code' => 'IDEAL_30',
                'description' => 'Skenario jarak pengujian dekat (30 - 40 cm)',
                'is_ideal' => false,
                'benchmark' => 30,
            ];
        }

        if ($distanceCm < 45) {
            return [
                'condition' => 'Terlalu Dekat',
                'code' => 'TOO_CLOSE',
                'description' => 'Di luar rentang posisi, mundur ke 45 - 55 cm',
                'is_ideal' => false,
                'benchmark' => 45,
            ];
        }

        if ($distanceCm <= 55) {
            return [
                'condition' => '45 cm (Ideal)',
                'code' => 'MID_45',
                'description' => 'Jarak pengujian ideal (45 - 55 cm)',
                'is_ideal' => true,
                'benchmark' => 45,
            ];
        }

        if ($distanceCm < 60) {
            return [
                'condition' => 'Terlalu Dekat',
                'code' => 'TOO_CLOSE',
                'description' => 'Di luar rentang posisi, mundur ke 60 - 70 cm',
                'is_ideal' => false,
                'benchmark' => 60,
            ];
        }

        if ($distanceCm <= 70) {
            return [
                'condition' => '60 cm (Jauh)',
                'code' => 'FAR_60',
                'description' => 'Skenario jarak pengujian jauh (60 - 70 cm)',
                'is_ideal' => false,
                'benchmark' => 60,
            ];
        }

        return [
            'condition' => 'Terlalu Jauh',
            'code' => 'TOO_FAR',
            'description' => 'Jarak terlalu jauh (> 70 cm)',
            'is_ideal' => false,
            'benchmark' => 60,
        ];
    }

    /**
     * Bacaan jarak terakhir dari sensor. Tanpa bacaan, nilai null (bukan 30 cm):
     * aturan hasil ukur sama dengan LuxController::readingStatus().
     */
    public function current(Request $request)
    {
        $data = LuxController::storedReading($this->storageFile, 'current_distance_reading', 'distance_cm');
        $status = LuxController::readingStatus($data, 'distance_cm');
        $category = $status['value'] === null ? null : self::categorizeDistance($status['value']);

        return response()->json([
            'success' => true,
            'distance_cm' => $status['value'] === null ? null : round($status['value'], 1),
            'condition' => $category['condition'] ?? null,
            'condition_code' => $category['code'] ?? null,
            'condition_desc' => $category['description'] ?? null,
            'is_ideal' => $category['is_ideal'] ?? null,
            'benchmark' => $category['benchmark'] ?? null,
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
     * Update current distance measurement from external sensor (ToF/Ultrasonic) or optical camera.
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'distance_cm' => 'required|numeric|min:5|max:500',
            'source' => 'nullable|string|max:50',
            'device' => 'nullable|string|max:100',
            'raw_reading' => 'nullable',
        ]);

        $distanceCm = (float) $validated['distance_cm'];
        $category = self::categorizeDistance($distanceCm);
        $source = $validated['source'] ?? 'script';
        $device = $validated['device'] ?? 'distance_sensor';

        $payload = [
            'distance_cm' => round($distanceCm, 1),
            'condition' => $category['condition'],
            'condition_code' => $category['code'],
            'condition_desc' => $category['description'],
            'is_ideal' => $category['is_ideal'],
            'benchmark' => $category['benchmark'],
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

        Cache::put('current_distance_reading', $payload, now()->addMinutes(30));

        return response()->json([
            'success' => true,
            'message' => 'Distance measurement updated successfully',
            'data' => $payload,
        ]);
    }
}
