<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EvaluationMatrix extends Model
{
    use HasFactory;

    protected $table = 'evaluation_matrices';

    protected $fillable = [
        'subject_id',
        'claimed_subject_id',
        'sample_type',
        'session_type',
        'distance_cm',
        'lux_value',
        'scan_duration_sec',
        'ear_blink_count',
        'mar_mouth_count',
        'face_detected_pct',
        'euclidean_distance',
        'facenet_score',
        'emar_score',
        'pad_prediction',
        'id_prediction',
        'final_decision',
        'raw_metadata',
    ];

    protected $casts = [
        'raw_metadata' => 'array',
        'distance_cm' => 'integer',
        'lux_value' => 'integer',
        'scan_duration_sec' => 'float',
        'ear_blink_count' => 'integer',
        'mar_mouth_count' => 'integer',
        'face_detected_pct' => 'float',
        'euclidean_distance' => 'float',
        'facenet_score' => 'float',
        'emar_score' => 'float',
    ];
}
