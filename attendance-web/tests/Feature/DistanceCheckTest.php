<?php

use App\Models\User;
use App\Services\DistanceModel;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    Http::preventStrayRequests();
});

// PRD bagian 17, T01-T07: ketiga rentang boleh lanjut di semua mode.
it('mengklasifikasi jarak dalam rentang dan mengizinkan verifikasi', function (float $cm, string $category, string $message) {
    $this->postJson('/api/biometric/distance-check', ['distance_cm' => $cm, 'face_detected' => true])
        ->assertOk()
        ->assertExactJson([
            'distance_cm' => $cm,
            'category' => $category,
            'allow_verification' => true,
            'message' => $message,
        ]);
})->with([
    'T01 30 cm' => [30.0, 'DEKAT', 'Posisi dekat (30-40 cm)'],
    'T02 35 cm' => [35.0, 'DEKAT', 'Posisi dekat (30-40 cm)'],
    'T03 45 cm' => [45.0, 'IDEAL', 'Posisi sesuai (45-55 cm)'],
    'T04 50 cm' => [50.0, 'IDEAL', 'Posisi sesuai (45-55 cm)'],
    'T05 55 cm' => [55.0, 'IDEAL', 'Posisi sesuai (45-55 cm)'],
    'T06 60 cm' => [60.0, 'JAUH', 'Posisi jauh (60-70 cm)'],
    'T07 70 cm' => [70.0, 'JAUH', 'Posisi jauh (60-70 cm)'],
    'batas atas dekat 40 cm' => [40.0, 'DEKAT', 'Posisi dekat (30-40 cm)'],
]);

it('menolak posisi di luar rentang dengan arahan ke tepi rentang terdekat', function (float $cm, string $message) {
    $this->postJson('/api/biometric/distance-check', ['distance_cm' => $cm, 'face_detected' => true])
        ->assertOk()
        ->assertExactJson([
            'distance_cm' => $cm,
            'category' => 'INVALID',
            'allow_verification' => false,
            'message' => $message,
        ]);
})->with([
    '29.9 cm' => [29.9, 'Mundur ke 30-40 cm'],
    '40.1 cm' => [40.1, 'Maju ke 30-40 cm'],
    // Tepat di tengah celah: mundur ke rentang yang lebih jauh.
    '42.5 cm' => [42.5, 'Mundur ke 45-55 cm'],
    '44 cm' => [44.0, 'Mundur ke 45-55 cm'],
    '56 cm' => [56.0, 'Maju ke 45-55 cm'],
    '57.5 cm' => [57.5, 'Mundur ke 60-70 cm'],
    '70.1 cm' => [70.1, 'Maju ke 60-70 cm'],
    '90 cm' => [90.0, 'Maju ke 60-70 cm'],
    '10 cm' => [10.0, 'Mundur ke 30-40 cm'],
]);

it('tidak mengizinkan verifikasi bila wajah belum terdeteksi', function () {
    $this->postJson('/api/biometric/distance-check', ['distance_cm' => 45, 'face_detected' => false])
        ->assertOk()
        ->assertExactJson([
            'distance_cm' => null,
            'category' => 'INVALID',
            'allow_verification' => false,
            'message' => 'Wajah belum terdeteksi',
        ]);
});

it('menerima face_detected dari FormData dan menolak nilai yang bukan boolean', function () {
    $this->post('/api/biometric/distance-check', ['distance_cm' => '50', 'face_detected' => 'true'])
        ->assertOk()
        ->assertJsonPath('category', 'IDEAL')
        ->assertJsonPath('allow_verification', true);

    $this->post('/api/biometric/distance-check', ['distance_cm' => '50', 'face_detected' => 'false'])
        ->assertOk()
        ->assertJsonPath('message', 'Wajah belum terdeteksi');

    $this->postJson('/api/biometric/distance-check', ['distance_cm' => 50, 'face_detected' => 'mungkin'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('face_detected');

    $this->postJson('/api/biometric/distance-check', ['distance_cm' => 50])
        ->assertStatus(422)
        ->assertJsonValidationErrors('face_detected');
});

it('jarak null dengan wajah terdeteksi tidak diizinkan', function () {
    $this->postJson('/api/biometric/distance-check', ['face_detected' => true])
        ->assertOk()
        ->assertJsonPath('category', 'INVALID')
        ->assertJsonPath('allow_verification', false)
        ->assertJsonPath('message', 'Jarak belum terukur');
});

it('dapat dipakai mode personal maupun kiosk tanpa login', function () {
    $teacher = User::factory()->create(['role' => 'teacher']);

    $this->actingAs($teacher)
        ->postJson('/api/biometric/distance-check', ['distance_cm' => 62, 'face_detected' => true])
        ->assertOk()
        ->assertJsonPath('category', 'JAUH')
        ->assertJsonPath('allow_verification', true);
});

it('rentang di config sama dengan DISTANCE_BANDS parameter_penelitian.py', function () {
    expect(DistanceModel::bands())->toBe([
        'DEKAT' => [30.0, 40.0],
        'IDEAL' => [45.0, 55.0],
        'JAUH' => [60.0, 70.0],
    ]);
    expect(DistanceModel::category(null))->toBeNull();
    expect(DistanceModel::category(42.0))->toBe('INVALID');
});

it('fit kuadrat terkecil memulihkan a dan b dari titik sintetis', function () {
    [$a, $b] = [12.6, 0.5];
    $fit = DistanceModel::fit([
        30 => $a / (30 - $b),
        45 => $a / (45 - $b),
        60 => $a / (60 - $b),
    ]);

    expect($fit['ok'])->toBeTrue()
        ->and($fit['a'])->toEqualWithDelta($a, 1e-9)
        ->and($fit['b'])->toEqualWithDelta($b, 1e-9)
        ->and($fit['max_residual_cm'])->toEqualWithDelta(0.0, 1e-9);

    expect(DistanceModel::estimate($a / (47.3 - $b), $fit['a'], $fit['b']))->toBe(47.3);
});

it('menolak titik kalibrasi yang tidak lengkap, tidak menurun, atau meleset', function () {
    $missing = DistanceModel::fit([30 => 0.42, 45 => 0.28]);
    expect($missing['ok'])->toBeFalse()
        ->and($missing['reason'])->toContain('60 cm');

    $nonMonotonic = DistanceModel::fit([30 => 0.28, 45 => 0.42, 60 => 0.21]);
    expect($nonMonotonic['ok'])->toBeFalse()
        ->and($nonMonotonic['reason'])->toContain('tidak mengecil dari 30 cm ke 45 cm');

    $equal = DistanceModel::fit([30 => 0.42, 45 => 0.28, 60 => 0.28]);
    expect($equal['ok'])->toBeFalse();

    // Monoton tetapi 1/r tidak linear terhadap jarak: sisa model > 3 cm.
    $offModel = DistanceModel::fit([30 => 0.42, 45 => 0.40, 60 => 0.21]);
    expect($offModel['ok'])->toBeFalse()
        ->and($offModel['max_residual_cm'])->toBeGreaterThan(3.0)
        ->and($offModel['reason'])->toContain('melebihi batas 3 cm');
});

it('estimasi null bila rasio atau model tidak ada', function () {
    expect(DistanceModel::estimate(null, 12.6, 0.0))->toBeNull()
        ->and(DistanceModel::estimate(0.0, 12.6, 0.0))->toBeNull()
        ->and(DistanceModel::estimate(-0.2, 12.6, 0.0))->toBeNull()
        ->and(DistanceModel::estimate(0.28, null, null))->toBeNull()
        ->and(DistanceModel::estimate(0.28, 12.6, 0.0))->toBe(45.0);
});
