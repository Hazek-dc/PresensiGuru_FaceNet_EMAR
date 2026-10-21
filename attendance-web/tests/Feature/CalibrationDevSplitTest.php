<?php

use App\Models\AttendanceRecord;
use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;

/**
 * Studio mode solo: peneliti merekam dirinya sendiri (P_DEV_01) untuk tabel
 * kalibrasi ambang. Barisnya wajib bertarget skenario dan berlabel, hanya
 * dibandingkan dengan templat P_DEV_01, dan tidak masuk dataset TEST.
 */
beforeEach(function () {
    Http::preventStrayRequests();
    config(['biometrics.allow_simulated_scores' => false]);
    $this->researcher = User::factory()->create(['role' => 'researcher', 'embedding_id' => 'S01', 'is_active' => true]);
    $this->dev = User::factory()->create(['name' => 'P_DEV_01', 'role' => 'teacher', 'embedding_id' => 'P_DEV_01', 'is_active' => true]);
});

function calibrationPayload(array $extra = []): array
{
    return array_merge([
        'video' => UploadedFile::fake()->create('p.webm', 16, 'video/webm'),
        'subject_id' => 'P_DEV_01',
        'participant_id' => 'P_DEV_01',
        'dataset_split' => 'calibration_dev',
        'session_type' => 'CALIBRATION',
        'sample_type' => 'BONA_FIDE',
        'lux_target' => 300,
        'distance_target_cm' => 60,
        'ear_blinks' => 1,
        'mar_mouths' => 1,
        'face_pct' => 97.0,
        'scan_duration_s' => 8.0,
        'active_challenge' => 'BLINK',
        'challenge_status' => 'PASS_LIVENESS',
    ], $extra);
}

/** Unggahan video tidak bisa lewat postJson; Accept JSON agar galat validasi berupa 422. */
function submitCalibration($test, User $actor, array $payload)
{
    return $test->actingAs($actor)->withHeader('Accept', 'application/json')->post(route('api.presensi'), $payload);
}

function partValue(HttpRequest $request, string $name): ?string
{
    foreach ($request->data() as $part) {
        if (($part['name'] ?? null) === $name) {
            return (string) $part['contents'];
        }
    }

    return null;
}

it('menolak baris kalibrasi tanpa target skenario', function (string $missing) {
    Http::fake(['*' => Http::response(['distance' => 0.31])]);

    submitCalibration($this, $this->researcher, Arr::except(calibrationPayload(), [$missing]))
        ->assertStatus(422)
        ->assertJsonValidationErrors([$missing]);

    expect(AttendanceRecord::count())->toBe(0);
    Http::assertNothingSent();
})->with(['lux_target', 'distance_target_cm', 'participant_id']);

it('hanya Admin/Peneliti yang login yang boleh merekam calibration_dev', function () {
    Http::fake(['*' => Http::response(['distance' => 0.31])]);
    $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S05', 'is_active' => true]);

    $this->withHeader('Accept', 'application/json')
        ->post(route('presensi.verify'), calibrationPayload())
        ->assertStatus(403);
    submitCalibration($this, $teacher, calibrationPayload())->assertStatus(403);

    expect(AttendanceRecord::count())->toBe(0)
        ->and(file_exists(config('biometrics.research_csv.raw_frames_dev')))->toBeFalse();
    Http::assertNothingSent();
});

it('mewajibkan spesies untuk serangan dan menolaknya untuk bona fide', function () {
    Http::fake(['*' => Http::response(['distance' => 0.31])]);

    foreach ([
        ['sample_type' => 'ATTACK'],
        ['pai_species' => 'print_attack'],
        ['sample_type' => 'ATTACK', 'pai_species' => 'mask'],
    ] as $extra) {
        submitCalibration($this, $this->researcher, calibrationPayload($extra))
            ->assertStatus(422)->assertJsonValidationErrors(['pai_species']);
    }

    expect(AttendanceRecord::count())->toBe(0);
});

it('tidak mengalihkan partisipan tanpa akun ke akun yang sedang login', function () {
    Http::fake(['*' => Http::response(['distance' => 0.31])]);

    submitCalibration($this, $this->researcher, calibrationPayload(['participant_id' => 'P_DEV_02', 'subject_id' => 'P_DEV_02']))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['participant_id']);

    expect(AttendanceRecord::count())->toBe(0);
    Http::assertNothingSent();
});

it('memverifikasi terhadap templat partisipan dan mencatat label tanpa menyentuh dataset TEST', function () {
    Http::fake(['*' => Http::response([
        'status' => 'success', 'distance' => 0.52, 'euclidean_distance' => 0.52, 'facenet_score' => 0.86, 'emar_score' => 1.0,
    ])]);

    $series = json_encode([[0, 0.31, 0.04], [33.4, 0.12, 0.05], [66.7, 0.29, 0.22]]);
    $data = $this->actingAs($this->researcher)
        ->post(route('api.presensi'), calibrationPayload([
            // subject_id dari klien diabaikan: identitas berasal dari participant_id.
            'subject_id' => 'S01',
            'sample_type' => 'ATTACK',
            'pai_species' => 'screen_attack',
            'frame_series' => $series,
        ]))
        ->assertOk()
        ->json();

    Http::assertSent(fn (HttpRequest $r) => partValue($r, 'user_id') === 'P_DEV_01' && partValue($r, 'claimed_id') === 'P_DEV_01');

    $record = AttendanceRecord::sole();
    expect($record->user_id)->toBe($this->dev->id)
        ->and($record->metadata['participant_id'])->toBe('P_DEV_01')
        ->and($record->metadata['dataset_split'])->toBe('calibration_dev')
        ->and($record->metadata['sample_type'])->toBe('ATTACK')
        ->and($record->metadata['pai_species'])->toBe('screen_attack')
        ->and($record->metadata['lux_target'])->toEqual(300)
        ->and($record->metadata['distance_target_cm'])->toEqual(60)
        ->and($data['evaluation']['dataset_split'])->toBe('calibration_dev');

    // Keputusan dan S1/S2/S3 tidak berubah karena split: rumus yang sama dengan jalur TEST.
    expect($data['id_pred'])->toBe('NON_MATCH')
        ->and($data['final_decision'])->toBe('REJECT')
        ->and($data['evaluation']['s1_decision'])->toBe(0);

    expect(file_exists(config('biometrics.research_csv.bab5')))->toBeFalse()
        ->and(file_exists(config('biometrics.research_csv.matriks')))->toBeFalse();

    $rows = array_map('str_getcsv', file(config('biometrics.research_csv.raw_frames_dev'), FILE_IGNORE_NEW_LINES));
    $header = array_shift($rows);
    $frames = array_map(fn ($row) => array_combine($header, $row), $rows);
    expect($frames)->toHaveCount(3)
        ->and(array_column($frames, 'frame_idx'))->toBe(['0', '1', '2'])
        ->and($frames[1]['raw_ear'])->toBe('0.12')
        ->and($frames[2]['raw_mar'])->toBe('0.22')
        ->and($frames[0]['attendance_id'])->toBe((string) $record->id)
        ->and($frames[0]['pai_species'])->toBe('screen_attack')
        ->and($frames[0]['distance_target_cm'])->toBe('60')
        ->and($frames[0]['trial_l2_dist'])->toBe('0.52')
        ->and($frames[0]['landmark_source'])->toBe('browser_mediapipe');
});

it('sesi kalibrasi di luar jam masuk tidak ditolak oleh jadwal', function () {
    Http::fake(['*' => Http::response(['distance' => 0.30, 'facenet_score' => 0.96, 'emar_score' => 1.0])]);

    $data = submitCalibration($this, $this->researcher, calibrationPayload(['simulated_time' => '08:15', 'simulated_day' => 'Monday']))
        ->assertOk()->json();

    // Sama dengan sesi TEST: keputusan biometrik tetap, status tercatat terlambat.
    expect($data['final_decision'])->toBe('ACCEPT')
        ->and($data['attendance_status'])->toBe('terlambat');
});

it('split calibration_dev hanya menerima sesi CALIBRATION', function () {
    Http::fake(['*' => Http::response(['distance' => 0.30])]);

    submitCalibration($this, $this->researcher, calibrationPayload(['session_type' => 'TEST']))
        ->assertStatus(422)->assertJsonValidationErrors(['session_type']);
});

it('frame yang tidak berformat [t_ms, ear, mar] tidak dicatat', function () {
    Http::fake(['*' => Http::response(['distance' => 0.31, 'facenet_score' => 0.95])]);

    $this->actingAs($this->researcher)
        ->post(route('api.presensi'), calibrationPayload([
            'frame_series' => json_encode([[0, 0.3, 0.05], ['x', 0.2, 0.1], [10, 0.2]]),
        ]))
        ->assertOk();

    $lines = file(config('biometrics.research_csv.raw_frames_dev'), FILE_IGNORE_NEW_LINES);
    expect($lines)->toHaveCount(2);
});

it('jalur TEST tetap menulis dataset riset dan kini menyimpan label sampel', function () {
    Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.31, 'facenet_score' => 0.95, 'emar_score' => 1.0])]);
    $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S07', 'is_active' => true]);

    $this->actingAs($teacher)->post(route('api.presensi'), [
        'video' => UploadedFile::fake()->create('p.webm', 16, 'video/webm'),
        'subject_id' => 'S07', 'sample_type' => 'BONA_FIDE', 'session_type' => 'TEST',
        'ear_blinks' => 2, 'mar_mouths' => 1, 'face_pct' => 95.0, 'scan_duration_s' => 8.0,
        'frame_series' => json_encode([[0, 0.3, 0.05]]),
    ])->assertOk();

    $meta = AttendanceRecord::sole()->metadata;
    expect($meta['sample_type'])->toBe('BONA_FIDE')
        ->and($meta['session_type'])->toBe('TEST')
        ->and($meta['dataset_split'])->toBeNull()
        ->and($meta['participant_id'])->toBeNull()
        ->and(file_exists(config('biometrics.research_csv.bab5')))->toBeTrue()
        ->and(file_exists(config('biometrics.research_csv.raw_frames_dev')))->toBeFalse();
});

it('label sampel yang tidak dikirim klien tidak diisi tebakan', function () {
    Http::fake(['*' => Http::response(['distance' => 0.31, 'facenet_score' => 0.95])]);
    $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S08', 'is_active' => true]);

    $this->actingAs($teacher)->post(route('api.presensi'), [
        'video' => UploadedFile::fake()->create('p.webm', 16, 'video/webm'),
        'subject_id' => 'S08', 'ear_blinks' => 2, 'mar_mouths' => 1, 'face_pct' => 95.0,
    ])->assertOk();

    $meta = AttendanceRecord::sole()->metadata;
    expect($meta['sample_type'])->toBeNull()
        ->and($meta['session_type'])->toBeNull();
});

it('ekspor riwayat memuat label sampel, spesies, partisipan, dan split', function () {
    Http::fake(['*' => Http::response(['distance' => 0.28, 'facenet_score' => 0.96, 'emar_score' => 1.0])]);
    $this->actingAs($this->researcher)
        ->post(route('api.presensi'), calibrationPayload(['sample_type' => 'ATTACK', 'pai_species' => 'replay_video']))
        ->assertOk();

    $content = $this->actingAs($this->researcher)->get(route('attendance.export.all'))->assertOk()->streamedContent();
    $handle = fopen('php://memory', 'r+');
    fwrite($handle, substr($content, 3));
    rewind($handle);
    $header = fgetcsv($handle);
    $rows = [];
    while (($line = fgetcsv($handle)) !== false) {
        $rows[] = array_combine($header, $line);
    }
    fclose($handle);
    $row = collect($rows)->firstWhere('Jenis', 'Presensi');

    expect($row['Label Sampel'])->toBe('ATTACK')
        ->and($row['Spesies PAI'])->toBe('replay_video')
        ->and($row['ID Partisipan'])->toBe('P_DEV_01')
        ->and($row['Split Dataset'])->toBe('calibration_dev')
        ->and($row['Target Lux Skenario'])->toBe('300')
        ->and($row['Target Jarak Skenario (cm)'])->toBe('60');
});
