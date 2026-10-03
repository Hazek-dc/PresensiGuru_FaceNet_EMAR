<?php

use App\Models\AttendanceRecord;
use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;

/**
 * Studio presensi memakai daftar guru dari tabel users dan status template
 * wajah dari galeri mesin, bukan daftar tetap yang menandai semua guru siap.
 */
beforeEach(function () {
    Http::preventStrayRequests();
    $this->nurHolis = User::factory()->create(['role' => 'teacher', 'name' => 'Nur Holis, S.Pd', 'embedding_id' => 'S01', 'is_active' => true]);
    $this->kuswari = User::factory()->create(['role' => 'teacher', 'name' => 'Kuswari', 'embedding_id' => 'S04', 'is_active' => true]);
    $this->nonaktif = User::factory()->create(['role' => 'teacher', 'name' => 'Nonaktif', 'embedding_id' => 'S15', 'is_active' => false]);
});

function galleryStatus(array $subjects): array
{
    return ['success' => true, 'subjects' => $subjects];
}

it('daftar guru studio dari database beserta status template', function () {
    Http::fake(['*/gallery/status*' => Http::response(galleryStatus([
        ['id' => 'S01', 'enrolled' => true, 'source' => 'photo', 'n_sessions' => 1, 'webcam_sessions' => 0, 'enrolled_at' => '2026-09-25'],
        ['id' => 'S04', 'enrolled' => false, 'source' => null, 'n_sessions' => 0, 'webcam_sessions' => 0, 'enrolled_at' => null],
    ]))]);

    $this->get('/presensi')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->where('template_status_available', true)
        ->has('subjects', 2)
        ->where('subjects.0.id', 'S01')
        ->where('subjects.0.name', 'Nur Holis, S.Pd')
        ->where('subjects.0.template.source', 'photo')
        ->where('subjects.1.id', 'S04')
        ->where('subjects.1.name', 'Kuswari')
        ->where('subjects.1.template.enrolled', false));

    Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), '/gallery/status')
        && str_contains(urldecode($r->url()), 'ids=S01,S04'));
});

it('kalibrasi jarak dan lux ikut dalam props halaman Studio', function () {
    Http::fake(['*/gallery/status*' => Http::response(galleryStatus([]))]);

    $this->get('/presensi')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->where('distance_calibration', null)
        ->where('lux_calibration', null));

    \App\Models\DistanceCalibration::create([
        'camera_label' => 'EYESEC USB 1080p', 'resolution_w' => 1920, 'resolution_h' => 1080,
        'browser_a' => 12.6, 'browser_b' => 0.0, 'browser_max_residual_cm' => 0.2,
        'points' => [], 'is_active' => true,
    ]);
    \App\Models\LuxCalibration::create([
        'camera_label' => 'EYESEC USB 1080p', 'resolution_w' => 1920, 'resolution_h' => 1080,
        'exposure_locked' => true, 'exposure_time' => 333,
        'browser_a' => 3.0, 'browser_b' => 1.5, 'browser_max_rel_error' => 0.05,
        'points' => [], 'is_active' => true,
    ]);

    // Isinya sama dengan endpoint /current yang dulu diminta terpisah oleh halaman.
    $distance = $this->getJson('/api/biometric/calibration/current')->json('calibration');
    $lux = $this->getJson('/api/biometric/lux-calibration/current')->json('calibration');
    $this->get('/presensi')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->where('distance_calibration', $distance)
        ->where('lux_calibration', $lux)
        ->where('distance_calibration.browser.a', 12.6));
});

it('mesin mati: status template tidak diketahui, halaman tetap terbuka', function () {
    Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('refused'));

    $this->get('/presensi')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
        ->where('template_status_available', false)
        ->has('subjects', 2)
        ->where('subjects.0.template', null));
});

it('dasbor tidak mengklaim status template dan tidak bertanya ke mesin', function () {
    // Dasbor tidak menampilkan status template, jadi tidak ada klaim "sudah terdaftar"
    // yang bisa salah; status template tetap dibaca mesin di halaman Studio (/presensi).
    Http::fake();
    User::factory()->create(['role' => 'teacher', 'name' => 'Tanpa Kode', 'embedding_id' => null]);
    $admin = User::factory()->create(['role' => 'admin']);

    $list = collect($this->actingAs($admin)->get('/dashboard')->assertOk()->viewData('page')['props']['subjects_list']);
    // Guru tanpa kode tidak lagi dipetakan ke S01 (template guru lain).
    expect($list->firstWhere('name', 'Tanpa Kode')['embedding_id'])->toBeNull()
        ->and($list->firstWhere('embedding_id', 'S01'))->not->toHaveKey('has_embedding')
        ->and($list->firstWhere('embedding_id', 'S04'))->not->toHaveKey('template');
    Http::assertNothingSent();
});

it('presensi studio untuk S04 tercatat atas nama Kuswari dan diverifikasi terhadap S04', function () {
    config(['biometrics.allow_simulated_scores' => false]);
    Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.31, 'facenet_score' => 0.74, 'emar_score' => 1.0])]);
    $admin = User::factory()->create(['role' => 'admin', 'embedding_id' => 'emb_ADMIN']);

    $data = $this->actingAs($admin)->post(route('api.presensi'), [
        'video' => UploadedFile::fake()->create('presensi.webm', 16, 'video/webm'),
        'subject_id' => 'S04',
        'mode' => 'kiosk',
        'sample_type' => 'BONA_FIDE',
        'session_type' => 'TEST',
        'ear_blinks' => 2,
        'mar_mouths' => 1,
        'face_pct' => 95.0,
        'scan_duration_s' => 8.0,
    ])->assertOk()->json();

    expect($data['final_decision'])->toBe('ACCEPT');
    expect(AttendanceRecord::sole()->user_id)->toBe($this->kuswari->id);
    Http::assertSent(function (HttpRequest $r) {
        foreach ($r->data() as $part) {
            if (($part['name'] ?? null) === 'teacher_id') {
                return $part['contents'] === 'S04';
            }
        }
        return false;
    });
});
