<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LightingLog extends Model
{
    protected $guarded = [];

    protected $casts = [
        'lux_value' => 'float',
        'luxmeter_lux' => 'float',
        'browser_lux' => 'float',
        'engine_lux' => 'float',
        'engine_luma' => 'float',
        'exposure_locked' => 'boolean',
    ];
}
