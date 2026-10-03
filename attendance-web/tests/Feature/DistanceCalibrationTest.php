<?php

use App\Models\DistanceCalibration;
use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia;

// Model sintetis: browser d = 12.6 / r, mesin d = 10.5 / r + 1.5.
const CALIBRATION_BROWSER_RATIOS = [30 => 0.42, 45 => 0.28, 60 => 0.21];

function calibrationEngineRatio(int $cm): float
{
    return 10.5 / ($cm - 1.5);
}

function calibrationMeasureResponse(?float $ratio, int $withFace = 3, int $w = 1920, int $h = 1080): array
{
    return [
        'success' => true,
        'face_width_ratio' => $ratio,
        'n_frames' => 3,
        'n_frames_with_face' => $ratio === null ? 0 : $withFace,
        'frame_width' => $w,
        'frame_height' => $h,
    ];
}

function calibrationPoint(int $cm, array $overrides = []): array
{
    return array_merge([
        'target_cm' => $cm,
        'browser_ratio' => CALIBRATION_BROWSER_RATIOS[$cm],
        'browser_samples' => 90,
        'camera_label' => 'EYESEC USB 1080p',
        'resolution_w' => 1920,
        'resolution_h' => 1080,
        'frames' => [
            UploadedFile::fake()->image("f{$cm}_1.jpg", 64, 36),
            UploadedFile::fake()->image("f{$cm}_2.jpg", 64, 36),
            UploadedFile::fake()->image("f{$cm}_3.jpg", 64, 36),
        ],
    ], $overrides);
}

beforeEach(function () {
    Http::preventStrayRequests();
    $this->admin = User::factory()->create(['role' => 'admin']);
    $this->researcher = User::factory()->create(['role' => 'researcher']);
    $this->teacher = User::factory()->create(['role' => 'teacher']);
});

it('meneruskan foto ke mesin dan menyimpan rasio browser serta mesin', function () {
    Http::fake(['*/measure/face-width' => Http::response(calibrationMeasureResponse(calibrationEngineRatio(30)))]);

    $this->actingAs($this->admin)
        ->post('/api/biometric/calibration/point', calibrationPoint(30))
        ->assertOk()
        ->assertJsonPath('target_cm', 30)
        ->assertJsonPath('browser_ratio', 0.42)
        ->assertJsonPath('engine_ratio', round(calibrationEngineRatio(30), 6))
        ->assertJsonPath('engine_frames', 3)
        ->assertJsonPath('engine_error', null)
        ->assertJsonPath('points_done', [30])
        ->assertJsonPath('points.0.target_cm', 30);

    Http::assertSent(function (HttpRequest $request) {
        $files = collect($request->data())->where('name', 'files[]');

        return str_ends_with($request->url(), '/measure/face-width')
            && $request->isMultipart()
            && $files->count() === 3
            && $files->every(fn ($part) => str_starts_with((string) $part['contents'], "\xFF\xD8"));
    });
    Http::assertSentCount(1);
});

it('mengulang ke /api/measure/face-width bila rute tanpa prefiks tidak ada', function () {
    Http::fake([
        '*/api/measure/face-width' => Http::response(calibrationMeasureResponse(calibrationEngineRatio(45))),
        '*/measure/face-width' => Http::response(['detail' => 'Not Found'], 404),
    ]);

    $this->actingAs($this->researcher)
        ->post('/api/biometric/calibration/point', calibrationPoint(45))
        ->assertOk()
        ->assertJsonPath('engine_ratio', round(calibrationEngineRatio(45), 6));

    Http::assertSentCount(2);
});

it('titik tetap tersimpan dengan rasio mesin null bila mesin gagal', function () {
    Http::fake(['*' => Http::response(['detail' => 'boom'], 500)]);

    $this->actingAs($this->admin)
        ->post('/api/biometric/calibration/point', calibrationPoint(60))
        ->assertOk()
        ->assertJsonPath('engine_ratio', null)
        ->assertJsonPath('engine_frames', 0)
        ->assertJsonPath('points_done', [60]);
});

it('rasio mesin tidak dipakai bila aspek foto berbeda dari resolusi kamera', function () {
    Http::fake(['*' => Http::response(calibrationMeasureResponse(0.3, 3, 640, 480))]);

    $response = $this->actingAs($this->admin)
        ->post('/api/biometric/calibration/point', calibrationPoint(30))
        ->assertOk()
        ->assertJsonPath('engine_ratio', null);

    expect($response->json('engine_error'))->toContain('640x480');
});

it('memvalidasi titik kalibrasi', function (array $overrides, string $field) {
    Http::fake();

    $this->actingAs($this->admin)
        ->postJson('/api/biometric/calibration/point', calibrationPoint(30, $overrides))
        ->assertStatus(422)
        ->assertJsonValidationErrors($field);

    Http::assertNothingSent();
})->with([
    'target bukan 30/45/60' => [['target_cm' => 50], 'target_cm'],
    'rasio nol' => [['browser_ratio' => 0], 'browser_ratio'],
    'rasio > 1' => [['browser_ratio' => 1.5], 'browser_ratio'],
    'kurang dari 3 foto' => [['frames' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')]], 'frames'],
    'bukan JPEG' => [['frames' => [
        UploadedFile::fake()->image('a.png'), UploadedFile::fake()->image('b.png'), UploadedFile::fake()->image('c.png'),
    ]], 'frames.0'],
]);

it('commit mem-fit kedua model, menonaktifkan kalibrasi lama, dan mengosongkan draf', function () {
    $old = DistanceCalibration::create([
        'camera_label' => 'Kamera lama', 'resolution_w' => 1280, 'resolution_h' => 720,
        'browser_a' => 10.0, 'browser_b' => 0.0, 'browser_max_residual_cm' => 0.5,
        'points' => [], 'is_active' => true,
    ]);

    Http::fake(['*/measure/face-width' => Http::sequence()
        ->push(calibrationMeasureResponse(calibrationEngineRatio(30)))
        ->push(calibrationMeasureResponse(calibrationEngineRatio(45)))
        ->push(calibrationMeasureResponse(calibrationEngineRatio(60)))]);

    $this->actingAs($this->researcher);
    foreach ([30, 45, 60] as $cm) {
        $this->post('/api/biometric/calibration/point', calibrationPoint($cm))->assertOk();
    }

    $response = $this->postJson('/api/biometric/calibration/commit')
        ->assertCreated()
        ->assertJsonPath('calibrated', true)
        ->assertJsonPath('calibration.camera_label', 'EYESEC USB 1080p')
        ->assertJsonPath('calibration.resolution_w', 1920)
        ->assertJsonPath('calibration.resolution_h', 1080)
        ->assertJsonPath('calibration.points.2.target_cm', 60)
        ->assertJsonPath('warning', null);

    $cal = $response->json('calibration');
    expect($cal['browser']['a'])->toEqualWithDelta(12.6, 1e-3)
        ->and($cal['browser']['b'])->toEqualWithDelta(0.0, 1e-2)
        ->and($cal['engine']['a'])->toEqualWithDelta(10.5, 1e-3)
        ->and($cal['engine']['b'])->toEqualWithDelta(1.5, 1e-2)
        ->and($cal['engine']['max_residual_cm'])->toBeLessThanOrEqual(0.01);

    expect($old->fresh()->is_active)->toBeFalse();
    expect(DistanceCalibration::where('is_active', true)->count())->toBe(1);
    $active = DistanceCalibration::active();
    expect($active->id)->toBe($cal['id'])
        ->and($active->calibrated_by)->toBe($this->researcher->id);

    // Draf sudah dipakai: commit kedua tidak punya titik.
    $this->postJson('/api/biometric/calibration/commit')->assertStatus(422);

    $this->getJson('/api/biometric/calibration/current')
        ->assertOk()
        ->assertJsonPath('calibrated', true)
        ->assertJsonPath('calibration.id', $cal['id'])
        ->assertJsonPath('calibration.points.0.browser_ratio', 0.42);
});

it('menyimpan kalibrasi tanpa model mesin bila mesin tidak mengukur semua titik', function () {
    Http::fake(['*/measure/face-width' => Http::sequence()
        ->push(calibrationMeasureResponse(calibrationEngineRatio(30)))
        ->push(calibrationMeasureResponse(null))
        ->push(calibrationMeasureResponse(calibrationEngineRatio(60)))]);

    $this->actingAs($this->admin);
    foreach ([30, 45, 60] as $cm) {
        $this->post('/api/biometric/calibration/point', calibrationPoint($cm))->assertOk();
    }

    $this->postJson('/api/biometric/calibration/commit')
        ->assertCreated()
        ->assertJsonPath('calibration.engine', null)
        ->assertJsonPath('calibration.points.1.engine_ratio', null);

    expect(DistanceCalibration::active()->hasEngineModel())->toBeFalse();
});

it('menolak commit dengan titik yang belum lengkap atau tidak menurun', function () {
    Http::fake(['*/measure/face-width' => Http::response(calibrationMeasureResponse(0.3))]);
    $this->actingAs($this->admin);

    $this->post('/api/biometric/calibration/point', calibrationPoint(30))->assertOk();
    $this->post('/api/biometric/calibration/point', calibrationPoint(45))->assertOk();
    $this->postJson('/api/biometric/calibration/commit')
        ->assertStatus(422)
        ->assertJsonPath('model', 'browser')
        ->assertJsonPath('reason', 'Titik kalibrasi belum lengkap: 60 cm belum terekam.');

    // Titik 60 cm direkam dengan wajah lebih besar dari 45 cm.
    $this->post('/api/biometric/calibration/point', calibrationPoint(60, ['browser_ratio' => 0.30]))->assertOk();
    $response = $this->postJson('/api/biometric/calibration/commit')
        ->assertStatus(422)
        ->assertJsonPath('model', 'browser');
    expect($response->json('reason'))->toContain('tidak mengecil dari 45 cm ke 60 cm');

    expect(DistanceCalibration::count())->toBe(0);
});

it('menolak commit bila rasio mesin tidak menurun walau browser sah', function () {
    Http::fake(['*/measure/face-width' => Http::sequence()
        ->push(calibrationMeasureResponse(calibrationEngineRatio(30)))
        ->push(calibrationMeasureResponse(calibrationEngineRatio(60)))
        ->push(calibrationMeasureResponse(calibrationEngineRatio(45)))]);

    $this->actingAs($this->admin);
    foreach ([30, 45, 60] as $cm) {
        $this->post('/api/biometric/calibration/point', calibrationPoint($cm))->assertOk();
    }

    $this->postJson('/api/biometric/calibration/commit')
        ->assertStatus(422)
        ->assertJsonPath('model', 'engine');
    expect(DistanceCalibration::count())->toBe(0);
});

it('titik dari kamera lain memulai draf baru', function () {
    Http::fake(['*/measure/face-width' => Http::response(calibrationMeasureResponse(0.3))]);
    $this->actingAs($this->admin);

    $this->post('/api/biometric/calibration/point', calibrationPoint(30))->assertOk()->assertJsonPath('draft_reset', false);
    $this->post('/api/biometric/calibration/point', calibrationPoint(45, ['camera_label' => 'Webcam laptop']))
        ->assertOk()
        ->assertJsonPath('draft_reset', true)
        ->assertJsonPath('points_done', [45]);
});

it('guru tidak dapat mengkalibrasi', function () {
    Http::fake();
    $this->actingAs($this->teacher);

    $this->get('/admin/kalibrasi-jarak')->assertForbidden();
    $this->post('/api/biometric/calibration/point', calibrationPoint(30))->assertForbidden();
    $this->postJson('/api/biometric/calibration/commit')->assertForbidden();

    Http::assertNothingSent();
    expect(DistanceCalibration::count())->toBe(0);
});

it('tamu tidak dapat menulis kalibrasi', function () {
    Http::fake();

    $this->post('/api/biometric/calibration/point', calibrationPoint(30))->assertUnauthorized();
    $this->postJson('/api/biometric/calibration/commit')->assertUnauthorized();
    $this->get('/admin/kalibrasi-jarak')->assertRedirect('/login');

    Http::assertNothingSent();
});

it('halaman kalibrasi terbuka untuk admin dan peneliti', function (string $role) {
    $user = $role === 'admin' ? $this->admin : $this->researcher;

    $this->actingAs($user)
        ->get('/admin/kalibrasi-jarak')
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Admin/DistanceCalibration', false)
            ->where('calibration', null)
            ->where('targets_cm', [30, 45, 60])
            ->has('bands', 3)
            ->where('bands.1.category', 'IDEAL')
            ->where('bands.1.message', 'Posisi sesuai (45-55 cm)')
            ->where('draft.points_done', []));
})->with(['admin', 'researcher']);

it('kalibrasi aktif dapat dibaca tanpa login untuk mode kiosk', function () {
    $this->getJson('/api/biometric/calibration/current')
        ->assertOk()
        ->assertExactJson(['calibrated' => false, 'calibration' => null]);

    DistanceCalibration::create([
        'camera_label' => 'EYESEC USB 1080p', 'resolution_w' => 1920, 'resolution_h' => 1080,
        'browser_a' => 12.6, 'browser_b' => 0.0, 'browser_max_residual_cm' => 0.0,
        'points' => [['target_cm' => 30, 'browser_ratio' => 0.42, 'engine_ratio' => null]],
        'is_active' => true, 'calibrated_by' => $this->admin->id,
    ]);

    $this->getJson('/api/biometric/calibration/current')
        ->assertOk()
        ->assertJsonPath('calibrated', true)
        ->assertJsonPath('calibration.browser.a', 12.6)
        ->assertJsonPath('calibration.engine', null)
        ->assertJsonMissingPath('calibration.calibrated_by');
});

it('menolak commit bila residu model browser melebihi batas', function () {
    Http::fake(['*/measure/face-width' => Http::response(calibrationMeasureResponse(null))]);
    $this->actingAs($this->admin);
    // 0,40 di 45 cm tidak cocok dengan model d = a / r + b dari dua titik lain.
    foreach ([30 => 0.42, 45 => 0.40, 60 => 0.21] as $cm => $ratio) {
        $this->post('/api/biometric/calibration/point', calibrationPoint($cm, ['browser_ratio' => $ratio]))->assertOk();
    }

    $response = $this->postJson('/api/biometric/calibration/commit')
        ->assertStatus(422)
        ->assertJsonPath('model', 'browser');
    expect($response->json('max_residual_cm'))->toBeGreaterThan((float) config('biometrics.calibration_max_residual_cm'));
    expect(DistanceCalibration::count())->toBe(0);
});

it('rasio mesin dari terlalu sedikit foto berwajah tidak dipakai', function () {
    Http::fake(['*/measure/face-width' => Http::response(array_merge(
        calibrationMeasureResponse(0.3), ['n_frames' => 5, 'n_frames_with_face' => 1],
    ))]);

    $response = $this->actingAs($this->admin)
        ->post('/api/biometric/calibration/point', calibrationPoint(30))
        ->assertOk()
        ->assertJsonPath('engine_ratio', null)
        ->assertJsonPath('browser_ratio', 0.42);

    expect($response->json('engine_error'))->toContain('1 dari 5');
});

it('menolak commit bila ada titik yang direkam lebih dari 60 menit lalu', function () {
    Http::fake(['*/measure/face-width' => Http::response(calibrationMeasureResponse(null))]);
    $this->actingAs($this->admin);

    // Tiap titik baru memperpanjang draf, jadi titik 30 cm tetap ada di draf.
    $this->post('/api/biometric/calibration/point', calibrationPoint(30))->assertOk();
    $this->travel(40)->minutes();
    $this->post('/api/biometric/calibration/point', calibrationPoint(45))->assertOk();
    $this->travel(40)->minutes();
    $this->post('/api/biometric/calibration/point', calibrationPoint(60))->assertOk();

    $response = $this->postJson('/api/biometric/calibration/commit')->assertStatus(422);
    expect($response->json('message'))->toContain('30 cm');
    expect(DistanceCalibration::count())->toBe(0);
});

it('sebelum migrasi halaman memberi tahu dan penyimpanan ditolak dengan jelas', function () {
    // DDL SQLite ikut transaksi RefreshDatabase, jadi tabel kembali setelah tes ini.
    Schema::drop('distance_logs');
    Schema::drop('distance_calibrations');
    Http::fake();

    $this->actingAs($this->admin)
        ->get('/admin/kalibrasi-jarak')
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Admin/DistanceCalibration')
            ->where('migration_pending', true)
            ->where('calibration', null));

    $this->post('/api/biometric/calibration/point', calibrationPoint(30))
        ->assertStatus(503)
        ->assertJsonPath('reason', 'migration_pending');
    $this->postJson('/api/biometric/calibration/commit')
        ->assertStatus(503)
        ->assertJsonPath('reason', 'migration_pending');
    Http::assertNothingSent();
});
