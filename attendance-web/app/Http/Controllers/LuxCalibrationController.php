<?php

namespace App\Http\Controllers;

use App\Models\LuxCalibration;
use App\Services\EngineBrightness;
use App\Services\LightingModel;
use App\Services\LuxCalibrationDraft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/**
 * Kalibrasi lux kamera terhadap luxmeter. Operator meletakkan luxmeter di posisi
 * wajah, mengubah pencahayaan (redup, normal, terang), dan pada tiap kondisi
 * merekam bacaan luxmeter bersama kecerahan kamera (browser dan mesin). Commit
 * mem-fit log10(lux) = a + b * log10(luma / 255) untuk keduanya.
 */
class LuxCalibrationController extends Controller
{
    private const MIGRATION_PENDING = 'Tabel kalibrasi lux belum dibuat. Jalankan: php artisan migrate';

    public function index(Request $request)
    {
        $this->authorizeCalibrator($request);

        return Inertia::render('Admin/LuxCalibration', [
            'calibration' => LuxCalibration::tablesReady() ? LuxCalibration::active()?->toContract() : null,
        ] + LuxCalibrationDraft::setupProps($request));
    }

    public function current(): JsonResponse
    {
        $active = LuxCalibration::tablesReady() ? LuxCalibration::active() : null;

        return response()->json([
            'calibrated' => $active !== null,
            'calibration' => $active?->toContract(),
        ]);
    }

    public function storePoint(Request $request): JsonResponse
    {
        $this->authorizeCalibrator($request);
        if (!LuxCalibration::tablesReady()) {
            return response()->json(['message' => self::MIGRATION_PENDING, 'reason' => 'migration_pending'], 503);
        }

        $data = $request->validate([
            'luxmeter_lux' => 'required|numeric|gt:0|lte:200000',
            'browser_luma' => 'required|numeric|gte:0|lte:255',
            'browser_samples' => 'nullable|integer|min:1|max:100000',
            'exposure_locked' => 'required|boolean',
            'exposure_time' => 'nullable|numeric|gt:0',
            'camera_label' => 'nullable|string|max:191',
            'resolution_w' => 'required|integer|min:16|max:10000',
            'resolution_h' => 'required|integer|min:16|max:10000',
            'frames' => 'required|array|min:3|max:10',
            'frames.*' => 'required|file|mimes:jpg,jpeg|max:10240',
            'reference_device' => ['nullable', Rule::in(LuxCalibrationDraft::REFERENCE_DEVICES)],
        ]);

        $setup = [
            'camera_label' => trim((string) ($data['camera_label'] ?? '')) ?: null,
            'resolution_w' => (int) $data['resolution_w'],
            'resolution_h' => (int) $data['resolution_h'],
            'exposure_locked' => (bool) $data['exposure_locked'],
            'exposure_time' => isset($data['exposure_time']) ? (float) $data['exposure_time'] : null,
            // Luxmeter fisik dan aplikasi ponsel berbeda skala; tidak boleh dicampur.
            'reference_device' => $data['reference_device'] ?? null,
        ];

        $engine = EngineBrightness::measure($request->file('frames'));

        // Titik dari kamera, resolusi, pengaturan eksposur, atau alat acuan lain
        // tidak boleh digabung dalam satu model.
        $draft = LuxCalibrationDraft::get($request);
        $draftReset = false;
        if ($draft && array_intersect_key($draft, $setup) != $setup) {
            $draft = null;
            $draftReset = true;
        }
        $draft ??= $setup + ['points' => []];

        if (count($draft['points']) >= LightingModel::MAX_POINTS) {
            return response()->json([
                'message' => sprintf('Maksimal %d kondisi cahaya; simpan atau mulai ulang.', LightingModel::MAX_POINTS),
                'reason' => 'too_many_points',
            ], 422);
        }

        $draft['points'][] = [
            'lux' => round((float) $data['luxmeter_lux'], 1),
            'browser_luma' => round((float) $data['browser_luma'], 3),
            'browser_samples' => isset($data['browser_samples']) ? (int) $data['browser_samples'] : null,
            'engine_luma' => $engine['luma'],
            'engine_frames' => $engine['n_frames'],
            'engine_error' => $engine['error'],
            'reference_device' => $setup['reference_device'],
            'recorded_at' => now()->toIso8601String(),
        ];
        LuxCalibrationDraft::put($request, $draft);

        return response()->json([
            'lux' => round((float) $data['luxmeter_lux'], 1),
            'browser_luma' => round((float) $data['browser_luma'], 3),
            'engine_luma' => $engine['luma'],
            'engine_error' => $engine['error'],
            'draft_reset' => $draftReset,
            'draft' => LuxCalibrationDraft::summary($draft),
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $this->authorizeCalibrator($request);
        LuxCalibrationDraft::forget($request);

        return response()->json(['draft' => LuxCalibrationDraft::summary(null)]);
    }

    public function commit(Request $request): JsonResponse
    {
        $this->authorizeCalibrator($request);
        if (!LuxCalibration::tablesReady()) {
            return response()->json(['message' => self::MIGRATION_PENDING, 'reason' => 'migration_pending'], 503);
        }

        $draft = LuxCalibrationDraft::get($request);
        if (!$draft || empty($draft['points'])) {
            return $this->reject('Belum ada kondisi cahaya yang direkam, atau rekaman sudah lewat 60 menit.', null);
        }

        // Cache diperbarui tiap titik baru, jadi umur tiap titik diperiksa sendiri.
        $stale = collect($draft['points'])
            ->filter(fn (array $p) => empty($p['recorded_at'])
                || now()->diffInMinutes(Carbon::parse($p['recorded_at']), true) > LuxCalibrationDraft::TTL_MINUTES)
            ->pluck('lux')->all();
        if ($stale) {
            return $this->reject(sprintf(
                'Titik %s lux direkam lebih dari %d menit lalu. Mulai ulang kalibrasi.',
                implode(', ', array_map(fn ($l) => LightingModel::fmt((float) $l), $stale)), LuxCalibrationDraft::TTL_MINUTES,
            ), null);
        }

        $pointsFor = fn (string $key) => array_map(
            fn (array $p) => ['lux' => $p['lux'], 'luma' => $p[$key]],
            $draft['points'],
        );

        $browser = LightingModel::fit($pointsFor('browser_luma'));
        if (!$browser['ok']) {
            return $this->reject('Kalibrasi kamera (browser) ditolak. ' . $browser['reason'], 'browser', $browser);
        }

        // Model mesin hanya dibuat bila mesin mengukur semua titik. Bila mesin
        // mengukur tetapi hasilnya tidak konsisten, kalibrasi ditolak agar lux
        // mesin yang keliru tidak tercatat sebagai hasil ukur.
        $engine = null;
        if (!in_array(null, array_column($draft['points'], 'engine_luma'), true)) {
            $engine = LightingModel::fit($pointsFor('engine_luma'));
            if (!$engine['ok']) {
                return $this->reject('Kalibrasi mesin biometrik ditolak. ' . $engine['reason'], 'engine', $engine);
            }
        }

        $calibration = DB::transaction(function () use ($draft, $browser, $engine, $request) {
            LuxCalibration::query()->where('is_active', true)->update(['is_active' => false]);

            return LuxCalibration::create([
                'camera_label' => $draft['camera_label'],
                'resolution_w' => $draft['resolution_w'],
                'resolution_h' => $draft['resolution_h'],
                'exposure_locked' => $draft['exposure_locked'],
                'exposure_time' => $draft['exposure_time'],
                'browser_a' => $browser['a'],
                'browser_b' => $browser['b'],
                'browser_max_rel_error' => $browser['max_rel_error'],
                'engine_a' => $engine['a'] ?? null,
                'engine_b' => $engine['b'] ?? null,
                'engine_max_rel_error' => $engine['max_rel_error'] ?? null,
                'points' => $draft['points'],
                'is_active' => true,
                'calibrated_by' => $request->user()->id,
            ]);
        });

        LuxCalibrationDraft::forget($request);

        if (function_exists('activity')) {
            activity('lux_calibration')
                ->causedBy($request->user())
                ->withProperties([
                    'calibration_id' => $calibration->id,
                    'points' => count($draft['points']),
                    'reference_device' => $draft['reference_device'] ?? null,
                ])
                ->log('Kalibrasi lux kamera disimpan.');
        }

        return response()->json([
            'calibrated' => true,
            'calibration' => $calibration->toContract(),
            'warning' => $engine === null
                ? 'Mesin biometrik tidak mengukur semua titik; lux presensi hanya dari browser sampai kalibrasi diulang.'
                : null,
        ], 201);
    }

    private function authorizeCalibrator(Request $request): void
    {
        if (!in_array($request->user()?->role, ['admin', 'researcher'], true)) {
            abort(403, 'Kalibrasi lux hanya dapat dilakukan Admin atau Peneliti.');
        }
    }

    private function reject(string $message, ?string $model, ?array $fit = null): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'reason' => $fit['reason'] ?? $message,
            'model' => $model,
            'max_rel_error' => $fit['max_rel_error'] ?? null,
            'errors' => $fit['errors'] ?? null,
        ], 422);
    }
}
