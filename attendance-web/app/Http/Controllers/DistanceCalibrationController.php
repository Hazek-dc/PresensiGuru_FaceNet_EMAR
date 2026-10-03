<?php

namespace App\Http\Controllers;

use App\Models\DistanceCalibration;
use App\Services\DistanceModel;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/**
 * Kalibrasi jarak kamera. Operator duduk pada 30, 45, dan 60 cm (diukur meteran
 * dari lensa ke wajah); tiap titik menyimpan rasio lebar wajah median dari browser
 * dan dari mesin biometrik. Commit mem-fit d = a / r + b untuk keduanya.
 */
class DistanceCalibrationController extends Controller
{
    private const DRAFT_TTL_MINUTES = 60;
    private const MEASURE_TIMEOUT_S = 60;
    // Rasio mesin dari satu-dua foto bisa berasal dari deteksi keliru (wajah lain di latar).
    private const MIN_ENGINE_FACE_FRAMES = 3;
    private const MIN_ENGINE_FACE_SHARE = 0.6;
    private const MIGRATION_PENDING = 'Tabel kalibrasi belum dibuat. Jalankan: php artisan migrate';

    public function index(Request $request)
    {
        $this->authorizeCalibrator($request);

        $ready = DistanceCalibration::tablesReady();

        return Inertia::render('Admin/DistanceCalibration', [
            'calibration' => $ready ? DistanceCalibration::active()?->toContract() : null,
            'migration_pending' => !$ready,
            'bands' => DistanceModel::bandList(),
            'targets_cm' => DistanceModel::CALIBRATION_TARGETS_CM,
            'max_residual_cm' => (float) config('biometrics.calibration_max_residual_cm', 3.0),
            'draft' => $this->draftSummary($this->draft($request)),
        ]);
    }

    public function current(): JsonResponse
    {
        $active = DistanceCalibration::tablesReady() ? DistanceCalibration::active() : null;

        return response()->json([
            'calibrated' => $active !== null,
            'calibration' => $active?->toContract(),
        ]);
    }

    public function storePoint(Request $request): JsonResponse
    {
        $this->authorizeCalibrator($request);
        if (!DistanceCalibration::tablesReady()) {
            return response()->json(['message' => self::MIGRATION_PENDING, 'reason' => 'migration_pending'], 503);
        }

        $data = $request->validate([
            'target_cm' => ['required', 'integer', Rule::in(DistanceModel::CALIBRATION_TARGETS_CM)],
            'browser_ratio' => 'required|numeric|gt:0|lte:1',
            'browser_samples' => 'nullable|integer|min:1|max:100000',
            'camera_label' => 'nullable|string|max:191',
            'resolution_w' => 'required|integer|min:16|max:10000',
            'resolution_h' => 'required|integer|min:16|max:10000',
            'frames' => 'required|array|min:3|max:10',
            'frames.*' => 'required|file|mimes:jpg,jpeg|max:10240',
        ]);

        $target = (int) $data['target_cm'];
        $cameraLabel = trim((string) ($data['camera_label'] ?? '')) ?: null;
        $width = (int) $data['resolution_w'];
        $height = (int) $data['resolution_h'];

        $engine = $this->measureOnEngine($request->file('frames'), $width, $height);

        // Titik dari kamera atau resolusi lain tidak boleh digabung dalam satu model.
        $draft = $this->draft($request);
        $draftReset = false;
        if ($draft && ($draft['camera_label'] !== $cameraLabel
            || $draft['resolution_w'] !== $width || $draft['resolution_h'] !== $height)) {
            $draft = null;
            $draftReset = true;
        }
        $draft ??= [
            'camera_label' => $cameraLabel,
            'resolution_w' => $width,
            'resolution_h' => $height,
            'points' => [],
        ];

        $draft['points'][$target] = [
            'target_cm' => $target,
            'browser_ratio' => round((float) $data['browser_ratio'], 6),
            'browser_samples' => isset($data['browser_samples']) ? (int) $data['browser_samples'] : null,
            'engine_ratio' => $engine['ratio'],
            'engine_frames' => $engine['frames_with_face'],
            'engine_frames_sent' => $engine['frames_sent'],
            'engine_frame_width' => $engine['frame_width'],
            'engine_frame_height' => $engine['frame_height'],
            'engine_error' => $engine['error'],
            'recorded_at' => now()->toIso8601String(),
        ];
        ksort($draft['points']);
        Cache::put($this->draftKey($request), $draft, now()->addMinutes(self::DRAFT_TTL_MINUTES));

        $summary = $this->draftSummary($draft);

        return response()->json([
            'target_cm' => $target,
            'browser_ratio' => $draft['points'][$target]['browser_ratio'],
            'engine_ratio' => $engine['ratio'],
            'engine_frames' => $engine['frames_with_face'],
            'engine_error' => $engine['error'],
            'points_done' => $summary['points_done'],
            'points' => $summary['points'],
            'draft_reset' => $draftReset,
        ]);
    }

    public function commit(Request $request): JsonResponse
    {
        $this->authorizeCalibrator($request);
        if (!DistanceCalibration::tablesReady()) {
            return response()->json(['message' => self::MIGRATION_PENDING, 'reason' => 'migration_pending'], 503);
        }

        $draft = $this->draft($request);
        if (!$draft || empty($draft['points'])) {
            return $this->reject('Belum ada titik kalibrasi yang direkam, atau rekaman sudah lewat 60 menit. Rekam ulang titik 30, 45, dan 60 cm.', null);
        }

        // Cache diperbarui setiap titik baru, jadi umur tiap titik diperiksa sendiri:
        // kursi, kamera, atau cahaya bisa sudah berubah sejak titik lama direkam.
        $stale = collect($draft['points'])
            ->filter(fn (array $p) => empty($p['recorded_at'])
                || now()->diffInMinutes(\Illuminate\Support\Carbon::parse($p['recorded_at']), true) > self::DRAFT_TTL_MINUTES)
            ->keys()->all();
        if ($stale) {
            return $this->reject(sprintf(
                'Titik %s cm direkam lebih dari %d menit lalu. Rekam ulang titik tersebut.',
                implode(', ', $stale), self::DRAFT_TTL_MINUTES,
            ), null);
        }

        $points = $draft['points'];
        $ratiosOf = fn (string $key) => collect(DistanceModel::CALIBRATION_TARGETS_CM)
            ->mapWithKeys(fn (int $t) => [$t => $points[$t][$key] ?? null])
            ->all();

        $browser = DistanceModel::fit($ratiosOf('browser_ratio'));
        if (!$browser['ok']) {
            return $this->reject('Kalibrasi browser ditolak. ' . $browser['reason'], 'browser', $browser);
        }

        // Model mesin hanya dibuat bila mesin mengukur ketiga titik. Bila mesin
        // mengukur tetapi hasilnya tidak konsisten, kalibrasi ditolak agar jarak
        // mesin yang keliru tidak tercatat sebagai hasil ukur.
        $engineRatios = $ratiosOf('engine_ratio');
        $engine = null;
        if (!in_array(null, $engineRatios, true)) {
            $engine = DistanceModel::fit($engineRatios);
            if (!$engine['ok']) {
                return $this->reject('Kalibrasi mesin biometrik ditolak. ' . $engine['reason'], 'engine', $engine);
            }
        }

        $storedPoints = collect($points)->map(fn (array $p) => array_merge($p, [
            'browser_residual_cm' => $browser['residuals'][$p['target_cm']] ?? null,
            'engine_residual_cm' => $engine['residuals'][$p['target_cm']] ?? null,
        ]))->values()->all();

        $calibration = DB::transaction(function () use ($draft, $browser, $engine, $storedPoints, $request) {
            DistanceCalibration::query()->where('is_active', true)->update(['is_active' => false]);

            return DistanceCalibration::create([
                'camera_label' => $draft['camera_label'],
                'resolution_w' => $draft['resolution_w'],
                'resolution_h' => $draft['resolution_h'],
                'browser_a' => $browser['a'],
                'browser_b' => $browser['b'],
                'browser_max_residual_cm' => $browser['max_residual_cm'],
                'engine_a' => $engine['a'] ?? null,
                'engine_b' => $engine['b'] ?? null,
                'engine_max_residual_cm' => $engine['max_residual_cm'] ?? null,
                'points' => $storedPoints,
                'is_active' => true,
                'calibrated_by' => $request->user()->id,
            ]);
        });

        Cache::forget($this->draftKey($request));

        if (function_exists('activity')) {
            activity('distance_calibration')
                ->causedBy($request->user())
                ->withProperties(['calibration' => $calibration->toContract()])
                ->log(sprintf(
                    'Kalibrasi jarak kamera #%d (%s, %dx%d) disimpan; model mesin %s.',
                    $calibration->id,
                    $calibration->camera_label ?? 'kamera tanpa label',
                    $calibration->resolution_w,
                    $calibration->resolution_h,
                    $engine ? 'tersedia' : 'tidak tersedia'
                ));
        }

        return response()->json([
            'calibrated' => true,
            'calibration' => $calibration->toContract(),
            'warning' => $engine ? null
                : 'Mesin biometrik tidak mengukur ketiga titik, jadi jarak presensi memakai estimasi browser.',
        ], 201);
    }

    private function authorizeCalibrator(Request $request): void
    {
        if (!in_array($request->user()?->role, ['admin', 'researcher'], true)) {
            abort(403, 'Kalibrasi jarak hanya dapat dilakukan Admin atau Peneliti.');
        }
    }

    /**
     * Rasio lebar wajah median dari foto yang sama yang diukur browser. Mesin yang
     * gagal atau tidak menemukan wajah menghasilkan rasio null, bukan nilai pengganti.
     *
     * @param array<int, \Illuminate\Http\UploadedFile> $files
     * @return array{ratio: float|null, frames_with_face: int, frames_sent: int, frame_width: int|null, frame_height: int|null, error: string|null}
     */
    private function measureOnEngine(array $files, int $width, int $height): array
    {
        $out = [
            'ratio' => null,
            'frames_with_face' => 0,
            'frames_sent' => count($files),
            'frame_width' => null,
            'frame_height' => null,
            'error' => null,
        ];

        // Lampiran PendingRequest dikosongkan setelah terkirim, jadi percobaan
        // ulang ke /api harus membangun request baru.
        $build = function () use ($files): PendingRequest {
            $http = Http::timeout(self::MEASURE_TIMEOUT_S)->acceptJson();
            foreach (array_values($files) as $i => $file) {
                $http->attach('files[]', file_get_contents($file->getRealPath()), $file->getClientOriginalName() ?: "frame_{$i}.jpg");
            }

            return $http;
        };

        try {
            $response = $this->postToEngine('/measure/face-width', $build);
        } catch (\Throwable $e) {
            Log::warning('Kalibrasi jarak: mesin biometrik tidak dapat dihubungi: ' . $e->getMessage());
            $out['error'] = 'Mesin biometrik tidak dapat dihubungi; titik ini hanya punya rasio browser.';

            return $out;
        }

        $body = $response->json();
        if (!$response->successful() || !is_array($body) || ($body['success'] ?? false) !== true) {
            $out['error'] = 'Mesin biometrik tidak dapat mengukur foto ini (HTTP ' . $response->status() . ').';

            return $out;
        }

        $out['frames_with_face'] = (int) ($body['n_frames_with_face'] ?? 0);
        $out['frames_sent'] = (int) ($body['n_frames'] ?? count($files));
        $out['frame_width'] = is_numeric($body['frame_width'] ?? null) ? (int) $body['frame_width'] : null;
        $out['frame_height'] = is_numeric($body['frame_height'] ?? null) ? (int) $body['frame_height'] : null;

        $ratio = $body['face_width_ratio'] ?? null;
        if (!is_numeric($ratio) || (float) $ratio <= 0.0 || (float) $ratio > 1.0) {
            $out['error'] = 'Mesin biometrik tidak menemukan wajah pada foto yang dikirim.';

            return $out;
        }

        $sent = max(1, $out['frames_sent']);
        if ($out['frames_with_face'] < self::MIN_ENGINE_FACE_FRAMES
            || $out['frames_with_face'] < self::MIN_ENGINE_FACE_SHARE * $sent) {
            $out['error'] = sprintf(
                'Mesin biometrik hanya menemukan wajah pada %d dari %d foto; rasio mesin tidak dipakai. Rekam ulang titik ini.',
                $out['frames_with_face'], $sent,
            );

            return $out;
        }

        // Foto yang dipotong ke aspek lain mengubah bidang pandang, sehingga rasio
        // mesin tidak sebanding dengan video presensi pada resolusi kamera.
        if ($out['frame_width'] && $out['frame_height']) {
            if (!DistanceModel::sameAspect($out['frame_width'], $out['frame_height'], $width, $height)) {
                $out['error'] = sprintf(
                    'Foto berukuran %dx%d tidak sama aspeknya dengan resolusi kamera %dx%d; rasio mesin tidak dipakai.',
                    $out['frame_width'], $out['frame_height'], $width, $height
                );

                return $out;
            }
        }

        $out['ratio'] = round((float) $ratio, 6);

        return $out;
    }

    private function postToEngine(string $path, callable $build): Response
    {
        $baseUrl = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');

        $response = $build()->post($baseUrl . $path);
        $body = $response->json();
        if ($response->status() === 404 && !(is_array($body) && array_key_exists('success', $body))) {
            // main.py memasang router yang sama di / dan /api; proxy lama hanya meneruskan /api.
            $response = $build()->post($baseUrl . '/api' . $path);
        }

        return $response;
    }

    private function draftKey(Request $request): string
    {
        return 'distance_calibration_draft:' . $request->user()->id;
    }

    private function draft(Request $request): ?array
    {
        $draft = Cache::get($this->draftKey($request));

        return is_array($draft) ? $draft : null;
    }

    /** @return array{camera_label: string|null, resolution_w: int|null, resolution_h: int|null, points_done: list<int>, points: list<array>} */
    private function draftSummary(?array $draft): array
    {
        $points = collect($draft['points'] ?? [])->sortKeys()->values();

        return [
            'camera_label' => $draft['camera_label'] ?? null,
            'resolution_w' => $draft['resolution_w'] ?? null,
            'resolution_h' => $draft['resolution_h'] ?? null,
            'points_done' => $points->pluck('target_cm')->map(fn ($t) => (int) $t)->all(),
            'points' => $points->map(fn (array $p) => [
                'target_cm' => (int) $p['target_cm'],
                'browser_ratio' => $p['browser_ratio'],
                'engine_ratio' => $p['engine_ratio'],
                'browser_samples' => $p['browser_samples'],
                'engine_frames' => $p['engine_frames'],
                'engine_error' => $p['engine_error'],
            ])->all(),
        ];
    }

    private function reject(string $message, ?string $model, ?array $fit = null): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'reason' => $fit['reason'] ?? $message,
            'model' => $model,
            'max_residual_cm' => $fit['max_residual_cm'] ?? null,
            'residuals' => $fit['residuals'] ?? null,
        ], 422);
    }
}
