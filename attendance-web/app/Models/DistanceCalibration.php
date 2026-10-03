<?php

namespace App\Models;

use App\Services\DistanceModel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

/**
 * Kalibrasi jarak satu kamera: model d = a / r + b untuk rasio lebar wajah
 * browser (MediaPipe, pipi 234-454) dan mesin (dlib, rahang 0-16). Keduanya
 * ukuran yang berbeda sehingga masing-masing punya koefisien sendiri.
 */
class DistanceCalibration extends Model
{
    protected $guarded = [];

    protected $casts = [
        'resolution_w' => 'integer',
        'resolution_h' => 'integer',
        'browser_a' => 'float',
        'browser_b' => 'float',
        'browser_max_residual_cm' => 'float',
        'engine_a' => 'float',
        'engine_b' => 'float',
        'engine_max_residual_cm' => 'float',
        'points' => 'array',
        'is_active' => 'boolean',
    ];

    public static function active(): ?self
    {
        return static::query()->where('is_active', true)->latest('id')->first();
    }

    /**
     * Sebelum migrasi distance_calibrations/distance_logs dijalankan, presensi dan
     * pembacaan kalibrasi harus tetap berjalan (tanpa data jarak), bukan gagal 500.
     */
    public static function tablesReady(): bool
    {
        try {
            return Schema::hasTable('distance_calibrations') && Schema::hasTable('distance_logs');
        } catch (\Throwable) {
            return false;
        }
    }

    public function calibrator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'calibrated_by');
    }

    public function hasEngineModel(): bool
    {
        return $this->engine_a !== null && $this->engine_b !== null;
    }

    public function engineDistance(?float $ratio): ?float
    {
        return DistanceModel::estimate($ratio, $this->engine_a, $this->engine_b);
    }

    public function browserDistance(?float $ratio): ?float
    {
        return DistanceModel::estimate($ratio, $this->browser_a, $this->browser_b);
    }

    /** Ukuran bingkai yang tidak diketahui tidak dianggap berbeda aspek. */
    public function matchesAspect(?int $width, ?int $height): bool
    {
        if (!$width || !$height) {
            return true;
        }

        return DistanceModel::sameAspect($width, $height, (int) $this->resolution_w, (int) $this->resolution_h);
    }

    public function toContract(): array
    {
        $points = collect($this->points ?? [])
            ->map(fn (array $p) => [
                'target_cm' => (int) $p['target_cm'],
                'browser_ratio' => isset($p['browser_ratio']) ? (float) $p['browser_ratio'] : null,
                'engine_ratio' => isset($p['engine_ratio']) ? (float) $p['engine_ratio'] : null,
                'browser_samples' => $p['browser_samples'] ?? null,
                'engine_frames' => $p['engine_frames'] ?? null,
            ])
            ->sortBy('target_cm')
            ->values()
            ->all();

        return [
            'id' => $this->id,
            'camera_label' => $this->camera_label,
            'resolution_w' => $this->resolution_w,
            'resolution_h' => $this->resolution_h,
            'browser' => [
                'a' => $this->browser_a,
                'b' => $this->browser_b,
                'max_residual_cm' => $this->browser_max_residual_cm,
            ],
            'engine' => $this->hasEngineModel() ? [
                'a' => $this->engine_a,
                'b' => $this->engine_b,
                'max_residual_cm' => $this->engine_max_residual_cm,
            ] : null,
            'points' => $points,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
