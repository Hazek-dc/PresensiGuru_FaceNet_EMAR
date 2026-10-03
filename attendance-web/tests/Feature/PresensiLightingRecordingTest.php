<?php

use App\Models\AttendanceRecord;
use App\Models\LightingLog;
use App\Models\LuxCalibration;
use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

/**
 * Pencahayaan pada presensi hanya dicatat (keputusan pemilik): kategori PRD
 * LOW/STANDARD/OPTIMAL/HIGH tidak pernah mengubah ACCEPT/REJECT.
 */
const LIGHTING_VERIFY_OK = ['status' => 'success', 'distance' => 0.31, 'facenet_score' => 0.74, 'emar_score' => 1.0];

// Model mesin sintetis: lux = 10^(3 + 1.5 log10(luma/255)).
function lightingLumaFor(float $lux): float
{
    return 255 * 10 ** ((log10($lux) - 3) / 1.5);
}

function lightingCalibration(array $overrides = []): LuxCalibration
{
    return LuxCalibration::create(array_merge([
        'camera_label' => 'EYESEC USB 1080p', 'resolution_w' => 1920, 'resolution_h' => 1080,
        'exposure_locked' => true, 'exposure_time' => 333,
        'browser_a' => 3.0, 'browser_b' => 1.5, 'browser_max_rel_error' => 0.05,
        'engine_a' => 3.0, 'engine_b' => 1.5, 'engine_max_rel_error' => 0.05,
        'points' => [], 'is_active' => true,
    ], $overrides));
}

function lightingProbe(): array
{
    return [
        UploadedFile::fake()->image('lux_0.jpg', 32, 18),
        UploadedFile::fake()->image('lux_1.jpg', 32, 18),
        UploadedFile::fake()->image('lux_2.jpg', 32, 18),
    ];
}

/** Satu fake saja: Http::fake berikutnya dalam tes yang sama tidak menimpa yang pertama. */
function lightingFakeSequence(array $luxes): void
{
    $seq = Http::sequence();
    foreach ($luxes as $lux) {
        $seq->push(['success' => true, 'luma' => round(lightingLumaFor($lux), 3), 'n_frames' => 3]);
    }
    Http::fake(['*/measure/brightness' => $seq, '*' => Http::response(LIGHTING_VERIFY_OK)]);
}

function lightingSubmit($test, User $user, array $extra = []): array
{
    return $test->actingAs($user)
        ->post(route('api.presensi'), array_merge([
            'video' => UploadedFile::fake()->create('presensi.webm', 16, 'video/webm'),
            'subject_id' => 'S01',
            'sample_type' => 'BONA_FIDE',
            'session_type' => 'TEST',
            'ear_blinks' => 2,
            'mar_mouths' => 1,
            'face_pct' => 95.0,
            'scan_duration_s' => 8.0,
            'camera_label' => 'EYESEC USB 1080p',
        ], $extra))
        ->assertOk()
        ->json();
}

beforeEach(function () {
    Http::preventStrayRequests();
    config(['biometrics.allow_simulated_scores' => false]);
    $this->teacher = User::factory()->create([
        'name' => 'Guru Cahaya', 'role' => 'teacher', 'embedding_id' => 'S01', 'is_active' => true,
    ]);
});

it('lux mesin dari foto pra-cek menjadi lux tercatat bila tidak ada luxmeter', function () {
    $cal = lightingCalibration();
    Http::fake([
        '*/measure/brightness' => Http::response(['success' => true, 'luma' => round(lightingLumaFor(245), 3), 'n_frames' => 3]),
        '*' => Http::response(LIGHTING_VERIFY_OK),
    ]);

    $data = lightingSubmit($this, $this->teacher, [
        'lux_value' => 230, 'lux_source' => 'camera_calibrated', 'lux_calibration_id' => $cal->id,
        'lux_browser_luma' => 90.5, 'lux_exposure_locked' => 1, 'lux_probe_frames' => lightingProbe(),
    ]);

    $eval = $data['evaluation'];
    expect($eval['lux_value'])->toEqualWithDelta(245.0, 0.2)
        ->and($eval['lux_source'])->toBe('engine')
        ->and($eval['lighting_category'])->toBe('OPTIMAL')
        ->and($eval['lighting_status'])->toBe('READY')
        ->and($eval['lux_engine_note'])->toBeNull();

    $log = LightingLog::sole();
    expect($log->lux_source)->toBe('engine')
        ->and($log->browser_lux)->toEqual(230.0)
        ->and($log->engine_lux)->toEqualWithDelta(245.0, 0.2)
        ->and($log->lux_category_naskah)->toBe('normal')
        ->and($log->calibration_id)->toBe($cal->id)
        ->and($log->decision)->toBe('ACCEPT');

    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/measure/brightness')
        && collect($r->data())->where('name', 'files[]')->count() === 3);
});

it('luxmeter fisik didahulukan dari lux mesin', function () {
    lightingCalibration();
    Http::fake([
        '*/measure/brightness' => Http::response(['success' => true, 'luma' => round(lightingLumaFor(245), 3), 'n_frames' => 3]),
        '*' => Http::response(LIGHTING_VERIFY_OK),
    ]);

    $data = lightingSubmit($this, $this->teacher, [
        'lux_value' => 80, 'lux_source' => 'luxmeter',
        'lux_exposure_locked' => 1, 'lux_probe_frames' => lightingProbe(),
    ]);

    expect($data['evaluation']['lux_value'])->toEqual(80)
        ->and($data['evaluation']['lux_source'])->toBe('luxmeter')
        ->and($data['evaluation']['lighting_category'])->toBe('LOW')
        ->and($data['evaluation']['lighting_status'])->toBe('WARNING');
    $log = LightingLog::sole();
    expect($log->luxmeter_lux)->toEqual(80.0)->and($log->engine_lux)->toEqualWithDelta(245.0, 0.2);
});

it('kategori cahaya tidak pernah mengubah keputusan', function () {
    lightingCalibration();
    $decisions = [];
    lightingFakeSequence([40, 150, 250, 900]);
    foreach ([40, 150, 250, 900] as $lux) {
        $data = lightingSubmit($this, $this->teacher, ['lux_exposure_locked' => 1, 'lux_probe_frames' => lightingProbe()]);
        $decisions[$data['evaluation']['lighting_category']] = [
            $data['final_decision'], $data['evaluation']['s1_decision'], $data['evaluation']['s2_decision'], $data['evaluation']['s3_decision'],
        ];
    }

    expect(array_keys($decisions))->toBe(['LOW', 'STANDARD', 'OPTIMAL', 'HIGH']);
    expect(array_unique(array_map('json_encode', $decisions)))->toHaveCount(1);
    expect(reset($decisions)[0])->toBe('ACCEPT');
});

it('lux mesin tidak dipakai bila mode eksposur berbeda dari kalibrasi', function () {
    lightingCalibration();
    Http::fake(['*' => Http::response(LIGHTING_VERIFY_OK)]);

    $data = lightingSubmit($this, $this->teacher, [
        'lux_value' => 210, 'lux_source' => 'camera',
        'lux_exposure_locked' => 0, 'lux_probe_frames' => lightingProbe(),
    ]);

    expect($data['evaluation']['lux_source'])->toBe('camera')
        ->and($data['evaluation']['lux_engine_note'])->toBe('exposure_mode_mismatch');
    Http::assertNotSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/measure/brightness'));
});

it('klaim camera_calibrated tanpa kalibrasi yang sah turun menjadi camera', function () {
    Http::fake(['*' => Http::response(LIGHTING_VERIFY_OK)]);

    $data = lightingSubmit($this, $this->teacher, [
        'lux_value' => 210, 'lux_source' => 'camera_calibrated', 'lux_calibration_id' => 999,
    ]);

    expect($data['evaluation']['lux_source'])->toBe('camera')
        ->and($data['evaluation']['lux_engine_note'])->toBe('no_lux_calibration');
    expect(LightingLog::sole()->calibration_id)->toBeNull();
});

it('baris lighting_logs tetap dibuat walau lux tidak terukur', function () {
    Http::fake(['*' => Http::response(LIGHTING_VERIFY_OK)]);

    $data = lightingSubmit($this, $this->teacher);

    expect($data['evaluation']['lux_value'])->toBeNull()
        ->and($data['evaluation']['lighting_category'])->toBeNull();
    $log = LightingLog::sole();
    expect($log->lux_value)->toBeNull()
        ->and($log->lux_source)->toBe('none')
        ->and($log->attendance_record_id)->toBe(AttendanceRecord::sole()->id);
});

it('dasbor menampilkan statistik pencahayaan hari ini', function () {
    lightingCalibration();
    lightingFakeSequence([250, 280, 50, 150]);
    foreach ([250, 280, 50, 150] as $lux) {
        lightingSubmit($this, $this->teacher, ['lux_exposure_locked' => 1, 'lux_probe_frames' => lightingProbe()]);
    }
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->get('/dashboard')->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('lighting_stats.measured_today', 4)
            ->where('lighting_stats.optimal_pct', 50)
            ->where('lighting_stats.warning_pct', 25)
            ->where('lighting_stats.current_category', 'STANDARD')
            ->where('lighting_stats.calibrated', true)
            ->etc());
});
