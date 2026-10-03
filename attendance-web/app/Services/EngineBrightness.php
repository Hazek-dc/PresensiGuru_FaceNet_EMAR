<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Kecerahan (luma Rec.601) foto yang diukur mesin biometrik lewat
 * POST /measure/brightness. Mesin tidak mengembalikan lux; konversinya
 * memakai model kalibrasi luxmeter (LightingModel).
 */
final class EngineBrightness
{
    private const TIMEOUT_S = 20;

    /**
     * @param array<int, UploadedFile> $files
     * @return array{luma: float|null, n_frames: int, saturated_fraction: float|null, frame_width: int|null, frame_height: int|null, error: string|null}
     */
    public static function measure(array $files): array
    {
        $out = [
            'luma' => null,
            'n_frames' => 0,
            'saturated_fraction' => null,
            'frame_width' => null,
            'frame_height' => null,
            'error' => null,
        ];
        if (!$files) {
            $out['error'] = 'Tidak ada foto untuk diukur.';

            return $out;
        }

        // Lampiran PendingRequest dikosongkan setelah terkirim, jadi percobaan
        // ulang ke /api harus membangun request baru.
        $build = function () use ($files): PendingRequest {
            $http = Http::timeout(self::TIMEOUT_S)->acceptJson();
            foreach (array_values($files) as $i => $file) {
                $http->attach('files[]', file_get_contents($file->getRealPath()), $file->getClientOriginalName() ?: "lux_{$i}.jpg");
            }

            return $http;
        };

        $base = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');
        try {
            $response = $build()->post($base . '/measure/brightness');
            $body = $response->json();
            if ($response->status() === 404 && !(is_array($body) && array_key_exists('success', $body))) {
                $response = $build()->post($base . '/api/measure/brightness');
                $body = $response->json();
            }
        } catch (\Throwable $e) {
            Log::warning('Pengukuran kecerahan: mesin biometrik tidak dapat dihubungi: ' . $e->getMessage());
            $out['error'] = 'Mesin biometrik tidak dapat dihubungi.';

            return $out;
        }

        if (!$response->successful() || !is_array($body) || ($body['success'] ?? false) !== true) {
            $out['error'] = 'Mesin biometrik tidak dapat mengukur kecerahan (HTTP ' . $response->status() . ').';

            return $out;
        }

        $luma = $body['luma'] ?? null;
        $out['luma'] = is_numeric($luma) && (float) $luma >= 0.0 && (float) $luma <= 255.0 ? (float) $luma : null;
        $out['n_frames'] = (int) ($body['n_frames'] ?? 0);
        $out['saturated_fraction'] = is_numeric($body['saturated_fraction'] ?? null) ? (float) $body['saturated_fraction'] : null;
        $out['frame_width'] = is_numeric($body['frame_width'] ?? null) ? (int) $body['frame_width'] : null;
        $out['frame_height'] = is_numeric($body['frame_height'] ?? null) ? (int) $body['frame_height'] : null;
        if ($out['luma'] === null) {
            $out['error'] = 'Mesin biometrik tidak mengembalikan kecerahan.';
        }

        return $out;
    }
}
