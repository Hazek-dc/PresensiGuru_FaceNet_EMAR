<?php

use App\Models\AttendanceRecord;
use App\Models\User;
use App\Services\DistanceModel;
use App\Services\LightingModel;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

/**
 * Parameter uji Studio (target jarak dan lux) harus dibandingkan dengan hasil
 * ukur. Dulu target 30 cm dengan jarak terukur 50,6 cm tercatat tanpa tanda.
 */
it('rentang target jarak mengikuti tingkat naskah', function (float $target, array $band) {
    expect(DistanceModel::targetBand($target))->toBe($band);
})->with([[30, [30.0, 40.0]], [45, [45.0, 55.0]], [60, [60.0, 70.0]], [35, [30.0, 40.0]]]);

it('kesesuaian target jarak', function (?float $target, ?float $cm, ?bool $met) {
    expect(DistanceModel::targetMet($target, $cm))->toBe($met);
})->with([
    'presensi #225: target 30, terukur 50,6' => [30, 50.6, false],
    'target 30, terukur 33,5' => [30, 33.5, true],
    'target 45, terukur 55' => [45, 55, true],
    'target 60, terukur 59,9' => [60, 59.9, false],
    'tanpa target' => [null, 40, null],
    'tidak terukur' => [30, null, null],
]);

it('kesesuaian target lux memakai kategori naskah', function (?float $target, ?float $lux, ?bool $met) {
    expect(LightingModel::targetMet($target, $lux))->toBe($met);
})->with([
    'target 300 (normal), terukur 250' => [300, 250, true],
    'target 300 (normal), terukur 601' => [300, 601, false],
    'target 50 (redup), terukur 80' => [50, 80, true],
    'target 500 (terang), terukur 310' => [500, 310, true],
    'tanpa lux' => [300, null, null],
]);

it('presensi mencatat kesesuaian target tanpa mengubah keputusan', function () {
    Http::preventStrayRequests();
    config(['biometrics.allow_simulated_scores' => false]);
    Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.31, 'facenet_score' => 0.74, 'emar_score' => 1.0])]);
    $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S01', 'is_active' => true]);

    $submit = fn (array $extra) => $this->actingAs($teacher)->post(route('api.presensi'), array_merge([
        'video' => UploadedFile::fake()->create('p.webm', 16, 'video/webm'),
        'subject_id' => 'S01', 'sample_type' => 'BONA_FIDE', 'session_type' => 'TEST',
        'ear_blinks' => 2, 'mar_mouths' => 1, 'face_pct' => 95.0, 'scan_duration_s' => 8.0,
    ], $extra))->assertOk()->json();

    $miss = $submit(['distance_cm' => 50.6, 'distance_source' => 'camera', 'distance_target_cm' => 30,
        'lux_value' => 601, 'lux_source' => 'luxmeter', 'lux_target' => 300]);
    $hit = $submit(['distance_cm' => 33.5, 'distance_source' => 'camera', 'distance_target_cm' => 30,
        'lux_value' => 250, 'lux_source' => 'luxmeter', 'lux_target' => 300]);

    expect($miss['evaluation']['distance_target_met'])->toBeFalse()
        ->and($miss['evaluation']['lux_target_met'])->toBeFalse()
        ->and($hit['evaluation']['distance_target_met'])->toBeTrue()
        ->and($hit['evaluation']['lux_target_met'])->toBeTrue()
        ->and($miss['final_decision'])->toBe($hit['final_decision']);

    $meta = AttendanceRecord::orderBy('id')->first()->metadata;
    expect($meta['distance_target_met'])->toBeFalse()
        ->and($meta['evaluation_bab5']['distance_target_met'])->toBeFalse();
});
