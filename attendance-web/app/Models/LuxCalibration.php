<?php

namespace App\Models;

use App\Services\LightingModel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/**
 * Kalibrasi lux satu kamera: model luma -> lux untuk kecerahan yang diukur
 * browser dan yang diukur mesin (masing-masing koefisien sendiri), direkam
 * bersama bacaan luxmeter pada beberapa kondisi cahaya.
 */
class LuxCalibration extends Model
{
    protected $guarded = [];

    protected $casts = [
        'resolution_w' => 'integer',
        'resolution_h' => 'integer',
        'exposure_locked' => 'boolean',
        'exposure_time' => 'float',
        'browser_a' => 'float',
        'browser_b' => 'float',
        'browser_max_rel_error' => 'float',
        'engine_a' => 'float',
        'engine_b' => 'float',
        'engine_max_rel_error' => 'float',
        'points' => 'array',
        'is_active' => 'boolean',
    ];

    public static function active(): ?self
    {
        return static::query()->where('is_active', true)->latest('id')->first();
    }

    /** Sebelum migrasi dijalankan, presensi tetap berjalan tanpa data lux kamera. */
    public static function tablesReady(): bool
    {
        try {
            return Schema::hasTable('lux_calibrations') && Schema::hasTable('lighting_logs');
        } catch (\Throwable) {
            return false;
        }
    }

    public function hasEngineModel(): bool
    {
        return $this->engine_a !== null && $this->engine_b !== null;
    }

    public function engineLux(?float $luma): ?float
    {
        return LightingModel::estimate($luma, $this->engine_a, $this->engine_b);
    }

    public function browserLux(?float $luma): ?float
    {
        return LightingModel::estimate($luma, $this->browser_a, $this->browser_b);
    }

    /** Alat acuan (luxmeter / luxmeter_app) bila seragam di semua titik; null bila tidak dicatat. */
    public function referenceDevice(): ?string
    {
        $devices = collect($this->points ?? [])->pluck('reference_device')->unique()->values();

        return $devices->count() === 1 ? $devices->first() : null;
    }

    public function toContract(): array
    {
        return [
            'id' => $this->id,
            'camera_label' => $this->camera_label,
            'resolution_w' => $this->resolution_w,
            'resolution_h' => $this->resolution_h,
            'exposure_locked' => $this->exposure_locked,
            'exposure_time' => $this->exposure_time,
            'browser' => [
                'a' => $this->browser_a,
                'b' => $this->browser_b,
                'max_rel_error' => $this->browser_max_rel_error,
            ],
            'engine' => $this->hasEngineModel() ? [
                'a' => $this->engine_a,
                'b' => $this->engine_b,
                'max_rel_error' => $this->engine_max_rel_error,
            ] : null,
            'points' => collect($this->points ?? [])->map(fn (array $p) => [
                'lux' => (float) $p['lux'],
                'browser_luma' => isset($p['browser_luma']) ? (float) $p['browser_luma'] : null,
                'engine_luma' => isset($p['engine_luma']) ? (float) $p['engine_luma'] : null,
            ])->sortBy('lux')->values()->all(),
            'reference_device' => $this->referenceDevice(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
