<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu baris per presentasi presensi. Kolom jarak null berarti tidak terukur;
 * distance_source menyebut asal jarak tercatat (engine, sensor, camera,
 * camera_calibrated, none).
 */
class DistanceLog extends Model
{
    protected $guarded = [];

    protected $casts = [
        'distance_cm' => 'float',
        'browser_distance_cm' => 'float',
        'engine_distance_cm' => 'float',
        'engine_face_width_ratio' => 'float',
        'distance_mismatch_cm' => 'float',
        'facenet_distance' => 'float',
        'emar_score' => 'float',
    ];

    public function attendanceRecord(): BelongsTo
    {
        return $this->belongsTo(AttendanceRecord::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function calibration(): BelongsTo
    {
        return $this->belongsTo(DistanceCalibration::class, 'calibration_id');
    }
}
