<?php

use App\Models\LuxCalibration;
use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia;

// Model sintetis: browser lux = 10^(3 + 1.5 log10(luma/255)), mesin sama dengan luma +2.
function luxBrowserLuma(float $lux): float
{
    return 255 * 10 ** ((log10($lux) - 3) / 1.5);
}

function luxPoint(float $lux, array $overrides = []): array
{
    return array_merge([
        'luxmeter_lux' => $lux,
        'browser_luma' => round(luxBrowserLuma($lux), 3),
        'browser_samples' => 15,
        'exposure_locked' => 1,
        'exposure_time' => 333,
        'camera_label' => 'EYESEC USB 1080p',
        'resolution_w' => 1920,
        'resolution_h' => 1080,
        'frames' => [
            UploadedFile::fake()->image('a.jpg', 32, 18),
            UploadedFile::fake()->image('b.jpg', 32, 18),
            UploadedFile::fake()->image('c.jpg', 32, 18),
        ],
    ], $overrides);
}

function luxEngineResponse(?float $luma): array
{
    return ['success' => true, 'luma' => $luma, 'n_frames' => 3, 'saturated_fraction' => 0.0,
        'frame_width' => 320, 'frame_height' => 180];
}

beforeEach(function () {
    Http::preventStrayRequests();
    $this->admin = User::factory()->create(['role' => 'admin']);
    $this->researcher = User::factory()->create(['role' => 'researcher']);
    $this->teacher = User::factory()->create(['role' => 'teacher']);
});

it('meneruskan foto ke mesin dan menyimpan luma browser serta mesin', function () {
    Http::fake(['*/measure/brightness' => Http::response(luxEngineResponse(120.5))]);

    $this->actingAs($this->researcher)
        ->post('/api/biometric/lux-calibration/point', luxPoint(200))
        ->assertOk()
        ->assertJsonPath('lux', 200)
        ->assertJsonPath('engine_luma', 120.5)
        ->assertJsonPath('draft.points.0.lux', 200);

    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/measure/brightness')
        && collect($r->data())->where('name', 'files[]')->count() === 3);
});

it('commit mem-fit kedua model dan menonaktifkan kalibrasi lama', function () {
    $old = LuxCalibration::create([
        'camera_label' => 'lama', 'resolution_w' => 1280, 'resolution_h' => 720, 'exposure_locked' => false,
        'browser_a' => 1, 'browser_b' => 1, 'browser_max_rel_error' => 0.1, 'points' => [], 'is_active' => true,
    ]);
    $seq = Http::sequence();
    foreach ([50, 200, 600] as $lux) {
        $seq->push(luxEngineResponse(round(luxBrowserLuma($lux) + 2, 3)));
    }
    Http::fake(['*/measure/brightness' => $seq]);

    $this->actingAs($this->admin);
    foreach ([50, 200, 600] as $lux) {
        $this->post('/api/biometric/lux-calibration/point', luxPoint($lux))->assertOk();
    }
    $cal = $this->postJson('/api/biometric/lux-calibration/commit')
        ->assertCreated()
        ->assertJsonPath('calibration.exposure_locked', true)
        ->assertJsonPath('warning', null)
        ->json('calibration');

    expect($cal['browser']['a'])->toEqualWithDelta(3.0, 1e-3)
        ->and($cal['browser']['b'])->toEqualWithDelta(1.5, 1e-3)
        ->and($cal['engine'])->not->toBeNull();
    expect($old->fresh()->is_active)->toBeFalse();
    expect(LuxCalibration::active()->id)->toBe($cal['id']);

    $this->getJson('/api/biometric/lux-calibration/current')
        ->assertOk()->assertJsonPath('calibrated', true)->assertJsonPath('calibration.id', $cal['id']);
});

it('kalibrasi tanpa model mesin bila mesin gagal mengukur satu titik', function () {
    Http::fake(['*/measure/brightness' => Http::sequence()
        ->push(luxEngineResponse(luxBrowserLuma(50)))
        ->push(['detail' => 'boom'], 500)
        ->push(luxEngineResponse(luxBrowserLuma(600)))]);

    $this->actingAs($this->admin);
    foreach ([50, 200, 600] as $lux) {
        $this->post('/api/biometric/lux-calibration/point', luxPoint($lux))->assertOk();
    }
    $this->postJson('/api/biometric/lux-calibration/commit')
        ->assertCreated()
        ->assertJsonPath('calibration.engine', null);
});

it('menolak commit bila kecerahan tidak naik (eksposur otomatis)', function () {
    Http::fake(['*/measure/brightness' => Http::response(luxEngineResponse(null))]);
    $this->actingAs($this->admin);
    foreach ([50 => 120, 200 => 119, 600 => 121] as $lux => $luma) {
        $this->post('/api/biometric/lux-calibration/point', luxPoint($lux, ['browser_luma' => $luma]))->assertOk();
    }
    $response = $this->postJson('/api/biometric/lux-calibration/commit')
        ->assertStatus(422)->assertJsonPath('model', 'browser');
    expect($response->json('message'))->toContain('eksposur');
    expect(LuxCalibration::count())->toBe(0);
});

it('pengaturan eksposur yang berubah memulai draf baru', function () {
    Http::fake(['*/measure/brightness' => Http::response(luxEngineResponse(100))]);
    $this->actingAs($this->admin);
    $this->post('/api/biometric/lux-calibration/point', luxPoint(50))->assertOk();
    $this->post('/api/biometric/lux-calibration/point', luxPoint(200, ['exposure_locked' => 0, 'exposure_time' => null]))
        ->assertOk()
        ->assertJsonPath('draft_reset', true)
        ->assertJsonCount(1, 'draft.points');
});

it('menolak titik yang lebih tua dari 60 menit saat commit', function () {
    Http::fake(['*/measure/brightness' => Http::response(luxEngineResponse(null))]);
    $this->actingAs($this->admin);
    $this->post('/api/biometric/lux-calibration/point', luxPoint(50))->assertOk();
    $this->travel(40)->minutes();
    $this->post('/api/biometric/lux-calibration/point', luxPoint(200))->assertOk();
    $this->travel(40)->minutes();
    $this->post('/api/biometric/lux-calibration/point', luxPoint(600))->assertOk();

    expect($this->postJson('/api/biometric/lux-calibration/commit')->assertStatus(422)->json('message'))
        ->toContain('50 lux');
});

it('reset mengosongkan draf', function () {
    Http::fake(['*/measure/brightness' => Http::response(luxEngineResponse(100))]);
    $this->actingAs($this->admin);
    $this->post('/api/biometric/lux-calibration/point', luxPoint(50))->assertOk();
    $this->postJson('/api/biometric/lux-calibration/reset')->assertOk()->assertJsonCount(0, 'draft.points');
    $this->postJson('/api/biometric/lux-calibration/commit')->assertStatus(422);
});

it('guru tidak dapat mengkalibrasi lux', function () {
    Http::fake();
    $this->actingAs($this->teacher);
    $this->get('/admin/kalibrasi-lux')->assertForbidden();
    $this->post('/api/biometric/lux-calibration/point', luxPoint(50))->assertForbidden();
    $this->postJson('/api/biometric/lux-calibration/commit')->assertForbidden();
    Http::assertNothingSent();
});

it('halaman kalibrasi lux terbuka untuk admin', function () {
    $this->actingAs($this->admin)->get('/admin/kalibrasi-lux')
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Admin/LuxCalibration')
            ->where('migration_pending', false)
            ->where('calibration', null));
});

it('sebelum migrasi halaman memberi tahu dan penyimpanan ditolak', function () {
    Schema::drop('lighting_logs');
    Schema::drop('lux_calibrations');
    Http::fake();
    $this->actingAs($this->admin);

    $this->get('/admin/kalibrasi-lux')->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page->where('migration_pending', true));
    $this->post('/api/biometric/lux-calibration/point', luxPoint(50))->assertStatus(503);
    $this->postJson('/api/biometric/lux-calibration/commit')->assertStatus(503);
    $this->getJson('/api/biometric/lux-calibration/current')->assertExactJson(['calibrated' => false, 'calibration' => null]);
    Http::assertNothingSent();
});

it('mencatat alat acuan kalibrasi (aplikasi luxmeter HP)', function () {
    $seq = Http::sequence();
    foreach ([50, 200, 600] as $lux) {
        $seq->push(luxEngineResponse(round(luxBrowserLuma($lux) + 2, 3)));
    }
    Http::fake(['*/measure/brightness' => $seq]);

    $this->actingAs($this->admin);
    foreach ([50, 200, 600] as $lux) {
        $this->post('/api/biometric/lux-calibration/point', luxPoint($lux, ['reference_device' => 'luxmeter_app']))
            ->assertOk()
            ->assertJsonPath('draft.reference_device', 'luxmeter_app');
    }
    $this->postJson('/api/biometric/lux-calibration/commit')
        ->assertCreated()
        ->assertJsonPath('calibration.reference_device', 'luxmeter_app');

    expect(LuxCalibration::active()->toContract()['reference_device'])->toBe('luxmeter_app');
});

it('ganti alat acuan memulai draf baru, tidak mencampur skala', function () {
    Http::fake(['*/measure/brightness' => Http::response(luxEngineResponse(100.0))]);
    $this->actingAs($this->admin);

    $this->post('/api/biometric/lux-calibration/point', luxPoint(50, ['reference_device' => 'luxmeter']))->assertOk();
    $this->post('/api/biometric/lux-calibration/point', luxPoint(200, ['reference_device' => 'luxmeter_app']))
        ->assertOk()
        ->assertJsonPath('draft_reset', true)
        ->assertJsonCount(1, 'draft.points');
});

it('alat acuan yang tidak dikenal ditolak', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/biometric/lux-calibration/point', luxPoint(200, ['reference_device' => 'tebakan']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reference_device');
});

it('halaman Studio membawa pengaturan kalibrasi untuk admin dan peneliti saja', function () {
    Http::fake(['*/gallery/status*' => Http::response(['success' => true, 'subjects' => []])]);

    $this->actingAs($this->admin)->get('/presensi')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->where('lux_calibration_setup.min_points', 3)
        ->where('lux_calibration_setup.migration_pending', false)
        ->where('lux_calibration_setup.draft.points', []));

    $this->actingAs($this->teacher)->get('/presensi')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->where('lux_calibration_setup', null));
});
