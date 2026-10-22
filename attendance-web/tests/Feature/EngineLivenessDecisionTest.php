<?php

use App\Models\AttendanceRecord;
use App\Models\EvaluationMatrix;
use App\Models\User;
use App\Services\FusionDecision;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

/**
 * Keputusan peneliti 21 Oktober 2026: D2 (liveness = siklus dlib mesin), D1 (S3 =
 * FusionModule.decide_s3, rumus b), D10 (nilai tak terukur tetap null), dan
 * telemetri latensi/deret dlib dari /verify.
 */
beforeEach(function () {
    Http::preventStrayRequests();
    config(['biometrics.allow_simulated_scores' => false]);
    $this->teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S07', 'is_active' => true]);
});

function engineReply(array $over = []): array
{
    return array_merge([
        'status' => 'success', 'distance' => 0.30, 'euclidean_distance' => 0.30, 'facenet_score' => 0.75,
        'is_verified' => true, 'emar_score' => 1.0, 'liveness_passed' => true,
        'blink_cycles' => 1, 'mouth_cycles' => 2, 'frames_total' => 240, 'landmark_frames' => 236,
        'emar_series' => [[0.0, 0.31, 0.04], [33.3, 0.17, 0.05], [66.7, 0.29, 0.21]],
        'latency_ms' => ['emar_pass' => 9100.5, 'facenet_total' => 820.0, 'mtcnn' => 610.2, 'facenet_embedding' => 180.4, 'total' => 10200.9, 'lock_wait' => 0.2],
    ], $over);
}

function presentTest($test, User $user, array $extra = [])
{
    return $test->actingAs($user)->post(route('api.presensi'), array_merge([
        'video' => UploadedFile::fake()->create('p.webm', 16, 'video/webm'),
        'subject_id' => $user->embedding_id, 'sample_type' => 'BONA_FIDE', 'session_type' => 'TEST',
        'face_pct' => 96.0, 'scan_duration_s' => 8.04,
    ], $extra))->assertOk()->json();
}

it('liveness dan S2/S3 diambil dari dlib mesin, bukan dari browser', function () {
    Http::fake(['*' => Http::response(engineReply(['emar_score' => 0.5, 'liveness_passed' => false, 'blink_cycles' => 0]))]);

    // Browser mengaku lolos tantangan dan menghitung 2 kedip; mesin tidak melihat kedip.
    $data = presentTest($this, $this->teacher, [
        'challenge_status' => 'PASS_LIVENESS', 'active_challenge' => 'BLINK', 'ear_blinks' => 2, 'mar_mouths' => 1,
    ]);

    expect($data['final_decision'])->toBe('REJECT')
        ->and($data['pad_pred'])->toBe('ATTACK')
        ->and($data['message'])->toContain('Kedipan Mata 0x')
        ->and($data['evaluation']['s1_decision'])->toBe(1)
        ->and($data['evaluation']['s2_decision'])->toBe(0)
        // s_final = 0,6 * (1 - 0,30/1,20) + 0,4 * 0,5 = 0,65 >= 0,50 dan d <= 0,40.
        ->and($data['evaluation']['s3_decision'])->toBe(1)
        ->and($data['evaluation']['p_face'])->toEqual(0.75)
        ->and($data['evaluation']['decision_version'])->toBe(FusionDecision::VERSION);
});

it('siklus dlib lengkap diterima meski tantangan browser gagal', function () {
    Http::fake(['*' => Http::response(engineReply())]);

    $data = presentTest($this, $this->teacher, ['challenge_status' => 'REJECT_TIMEOUT', 'active_challenge' => 'OPEN_MOUTH']);

    expect($data['final_decision'])->toBe('ACCEPT')
        ->and($data['pad_pred'])->toBe('BONA_FIDE')
        ->and($data['challenge_status'])->toBe('REJECT_TIMEOUT');
});

it('landmark dlib nol adalah FTA liveness: S2/S3 null, ditolak', function () {
    Http::fake(['*' => Http::response(engineReply(['emar_score' => 0.0, 'liveness_passed' => false, 'blink_cycles' => 0, 'mouth_cycles' => 0, 'landmark_frames' => 0, 'emar_series' => []]))]);

    $data = presentTest($this, $this->teacher);

    expect($data['final_decision'])->toBe('REJECT')
        ->and($data['pad_pred'])->toBe('UNAVAILABLE')
        ->and($data['evaluation']['s2_decision'])->toBeNull()
        ->and($data['evaluation']['s3_decision'])->toBeNull();
});

it('telemetri mesin tercatat dan dataset riset memakai EAR/MAR serta siklus dlib', function () {
    Http::fake(['*' => Http::response(engineReply())]);

    presentTest($this, $this->teacher, ['ear_val' => 0.11, 'mar_val' => 0.55, 'ear_blinks' => 5, 'mar_mouths' => 5]);

    $meta = AttendanceRecord::sole()->metadata;
    expect($meta['blink_cycles'])->toBe(1)
        ->and($meta['mouth_cycles'])->toBe(2)
        ->and($meta['landmark_frames'])->toBe(236)
        ->and($meta['latency_ms']['mtcnn'])->toEqual(610.2)
        ->and($meta['evaluation_bab5']['engine_ear_min'])->toEqual(0.17)
        ->and($meta['evaluation_bab5']['engine_mar_max'])->toEqual(0.21)
        // EAR/MAR browser tetap tercatat sebagai telemetri terpisah.
        ->and($meta['evaluation_bab5']['ear_val'])->toEqual(0.11)
        ->and($meta['scan_duration_s'])->toEqual(8.04);

    $bab5 = array_map('str_getcsv', file(config('biometrics.research_csv.bab5'), FILE_IGNORE_NEW_LINES));
    $row = array_combine($bab5[0], $bab5[1]);
    expect($row['ear'])->toBe('0.17')
        ->and($row['mar'])->toBe('0.21')
        ->and([$row['keputusan_S1'], $row['keputusan_S2'], $row['keputusan_S3']])->toBe(['1', '1', '1']);

    $matrix = array_map('str_getcsv', file(config('biometrics.research_csv.matriks'), FILE_IGNORE_NEW_LINES));
    $mrow = array_combine($matrix[0], $matrix[1]);
    expect([$mrow['Kedipan'], $mrow['Mulut'], $mrow['Durasi_s']])->toBe(['1', '2', '8.04']);

    $em = EvaluationMatrix::sole();
    expect($em->ear_blink_count)->toBe(1)->and($em->mar_mouth_count)->toBe(2);
});

it('D10: kestabilan, durasi, dan EAR/MAR yang tidak dikirim tetap null', function () {
    Http::fake(['*' => Http::response(engineReply())]);

    $data = $this->actingAs($this->teacher)->post(route('api.presensi'), [
        'video' => UploadedFile::fake()->create('p.webm', 16, 'video/webm'),
        'subject_id' => 'S07', 'sample_type' => 'BONA_FIDE', 'session_type' => 'TEST',
    ])->assertOk()->json();

    $meta = AttendanceRecord::sole()->metadata;
    expect($meta['face_detected_pct'])->toBeNull()
        ->and($meta['scan_duration_s'])->toBeNull()
        ->and($meta['evaluation_bab5']['ear_val'])->toBeNull()
        ->and($meta['evaluation_bab5']['mar_val'])->toBeNull()
        // Kestabilan yang tidak diukur tidak menolak presentasi yang lolos mesin.
        ->and($data['final_decision'])->toBe('ACCEPT');

    $em = EvaluationMatrix::sole();
    expect($em->face_detected_pct)->toBeNull()->and($em->scan_duration_sec)->toBeNull();

    $matrix = array_map('str_getcsv', file(config('biometrics.research_csv.matriks'), FILE_IGNORE_NEW_LINES));
    $mrow = array_combine($matrix[0], $matrix[1]);
    expect([$mrow['Wajah_%'], $mrow['Durasi_s']])->toBe(['', '']);
});

it('kestabilan terukur di bawah ambang tetap menolak', function () {
    Http::fake(['*' => Http::response(engineReply())]);

    $data = presentTest($this, $this->teacher, ['face_pct' => 62.5]);

    expect($data['final_decision'])->toBe('REJECT')
        ->and($data['message'])->toContain('Kurang Stabil');
});

it('calibration_dev menulis deret dlib mesin di samping deret browser', function () {
    Http::fake(['*' => Http::response(engineReply())]);
    $researcher = User::factory()->create(['role' => 'researcher', 'is_active' => true]);
    User::factory()->create(['role' => 'teacher', 'embedding_id' => 'P_DEV_01', 'is_active' => true]);

    $this->actingAs($researcher)->post(route('api.presensi'), [
        'video' => UploadedFile::fake()->create('p.webm', 16, 'video/webm'),
        'participant_id' => 'P_DEV_01', 'dataset_split' => 'calibration_dev', 'session_type' => 'CALIBRATION',
        'sample_type' => 'BONA_FIDE', 'lux_target' => 300, 'distance_target_cm' => 45,
        'frame_series' => json_encode([[0, 0.3, 0.05], [33.4, 0.18, 0.06]]),
    ])->assertOk();

    $rows = array_map('str_getcsv', file(config('biometrics.research_csv.raw_frames_dev'), FILE_IGNORE_NEW_LINES));
    $header = array_shift($rows);
    $frames = array_map(fn ($r) => array_combine($header, $r), $rows);
    $bySource = collect($frames)->groupBy('landmark_source');
    expect($bySource->keys()->all())->toBe(['browser_mediapipe', 'engine_dlib'])
        ->and($bySource['browser_mediapipe'])->toHaveCount(2)
        ->and($bySource['engine_dlib'])->toHaveCount(3)
        ->and($bySource['engine_dlib'][1]['raw_ear'])->toBe('0.17')
        ->and($bySource['engine_dlib'][1]['frame_idx'])->toBe('1');
});

it('rekaman lama tanpa evaluation_bab5 dihitung ulang tanpa EAR/MAR karangan', function () {
    $researcher = User::factory()->create(['role' => 'researcher', 'is_active' => true]);
    $old = AttendanceRecord::create([
        'user_id' => $this->teacher->id, 'subject_reference' => 'S07', 'status' => 'failed', 'verified_at' => now(),
        'metadata' => ['euclidean_distance' => 0.30, 'ear_blinks' => 2, 'mar_mouths' => 1],
    ]);

    $bab5 = $this->actingAs($researcher)->get(route('attendance.show', $old->id))
        ->assertOk()
        ->viewData('page')['props']['record']['metadata']['evaluation_bab5'];

    expect($bab5['recomputed'])->toBeTrue()
        ->and($bab5['s1_decision'])->toBe(1)
        // Tanpa emar_score mesin, liveness tidak terukur: tidak diisi 0,18/0,40.
        ->and($bab5['s2_decision'])->toBeNull()
        ->and($bab5['s3_decision'])->toBeNull()
        ->and($bab5['ear_val'])->toBeNull();
});
