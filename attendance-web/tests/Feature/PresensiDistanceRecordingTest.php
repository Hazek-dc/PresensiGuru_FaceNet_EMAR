<?php

use App\Models\AttendanceRecord;
use App\Models\DistanceCalibration;
use App\Models\DistanceLog;
use App\Models\EvaluationMatrix;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia;

// Model mesin sintetis d = 9 / r + 1: rasio 0.2 -> 46.0 cm (IDEAL).
const PRESENSI_ENGINE_RATIO = 0.2;
const PRESENSI_ENGINE_CM = 46.0;

function presensiEngineResult(array $faceWidth = []): array
{
    return array_merge([
        'status' => 'success',
        'distance' => 0.31,
        'facenet_score' => 0.74,
        'emar_score' => 1.0,
    ], $faceWidth);
}

function presensiFaceWidth(float $ratio = PRESENSI_ENGINE_RATIO, int $w = 1920, int $h = 1080): array
{
    return ['face_width_ratio' => $ratio, 'face_width_frames' => 211, 'frame_width' => $w, 'frame_height' => $h];
}

function presensiCalibration(array $overrides = []): DistanceCalibration
{
    return DistanceCalibration::create(array_merge([
        'camera_label' => 'EYESEC USB 1080p',
        'resolution_w' => 1920,
        'resolution_h' => 1080,
        'browser_a' => 12.6,
        'browser_b' => 0.0,
        'browser_max_residual_cm' => 0.2,
        'engine_a' => 9.0,
        'engine_b' => 1.0,
        'engine_max_residual_cm' => 0.3,
        'points' => [],
        'is_active' => true,
    ], $overrides));
}

/** Presentasi yang diterima mesin; $extra menambah/menimpa field formulir. */
function submitPresensi($test, User $user, array $extra = []): array
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
        ], $extra))
        ->assertOk()
        ->json();
}

/** @return array<int, string> sel baris data terakhir */
function presensiCsvRow(string $key): array
{
    $lines = file(config("biometrics.research_csv.{$key}"), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    return str_getcsv(end($lines));
}

const PRESENSI_BROWSER_FIELDS = [
    'distance_cm' => 50.3,
    'distance_source' => 'camera_calibrated',
    'camera_label' => 'EYESEC USB 1080p',
    'camera_resolution' => '1920x1080',
    'camera_fps' => 30,
];

beforeEach(function () {
    Http::preventStrayRequests();
    config(['biometrics.allow_simulated_scores' => false]);
    $this->freezeTime();
    $this->teacher = User::factory()->create([
        'name' => 'Guru Jarak',
        'role' => 'teacher',
        'embedding_id' => 'S01',
        'is_active' => true,
    ]);
});

it('mencatat jarak mesin terkalibrasi sebagai jarak tercatat di semua keluaran', function () {
    $cal = presensiCalibration();
    Http::fake(['*' => Http::response(presensiEngineResult(presensiFaceWidth()))]);

    $data = submitPresensi($this, $this->teacher, PRESENSI_BROWSER_FIELDS + ['calibration_id' => $cal->id]);

    expect($data['final_decision'])->toBe('ACCEPT');
    $eval = $data['evaluation'];
    // JSON menulis 46.0 sebagai 46, jadi nilai dari respons dibandingkan dengan toEqual.
    expect($eval['distance_cm'])->toEqual(PRESENSI_ENGINE_CM)
        ->and($eval['distance_source'])->toBe('engine')
        ->and($eval['distance_category'])->toBe('IDEAL')
        ->and($eval['engine_distance_cm'])->toEqual(PRESENSI_ENGINE_CM)
        ->and($eval['browser_distance_cm'])->toBe(50.3)
        ->and($eval['browser_distance_source'])->toBe('camera_calibrated')
        ->and($eval['distance_mismatch_cm'])->toBe(4.3)
        ->and($eval['engine_face_width_ratio'])->toBe(PRESENSI_ENGINE_RATIO)
        ->and($eval['calibration_id'])->toBe($cal->id)
        ->and($eval['camera_label'])->toBe('EYESEC USB 1080p');

    $meta = AttendanceRecord::sole()->metadata;
    expect($meta['distance_cm'])->toEqual(PRESENSI_ENGINE_CM)
        ->and($meta['distance_source'])->toBe('engine')
        ->and($meta['distance_category'])->toBe('IDEAL')
        ->and($meta['browser_distance_cm'])->toEqual(50.3)
        ->and($meta['engine_distance_cm'])->toEqual(PRESENSI_ENGINE_CM)
        ->and($meta['engine_face_width_ratio'])->toEqual(PRESENSI_ENGINE_RATIO)
        ->and($meta['engine_face_width_frames'])->toBe(211)
        ->and($meta['distance_mismatch_cm'])->toEqual(4.3)
        ->and($meta['calibration_id'])->toBe($cal->id)
        ->and($meta['camera_resolution'])->toBe('1920x1080')
        ->and($meta['camera_fps'])->toEqual(30.0)
        ->and($meta['engine_distance_note'])->toBeNull()
        ->and($meta['evaluation_bab5']['distance_cm'])->toEqual(PRESENSI_ENGINE_CM)
        ->and($meta['evaluation_bab5']['distance_source'])->toBe('engine');

    $log = DistanceLog::sole();
    expect($log->attendance_record_id)->toBe(AttendanceRecord::sole()->id)
        ->and($log->user_id)->toBe($this->teacher->id)
        ->and($log->camera_device)->toBe('EYESEC USB 1080p')
        ->and($log->camera_resolution)->toBe('1920x1080')
        ->and($log->distance_cm)->toBe(PRESENSI_ENGINE_CM)
        ->and($log->distance_category)->toBe('IDEAL')
        ->and($log->distance_source)->toBe('engine')
        ->and($log->browser_distance_cm)->toBe(50.3)
        ->and($log->engine_distance_cm)->toBe(PRESENSI_ENGINE_CM)
        ->and($log->engine_face_width_ratio)->toBe(PRESENSI_ENGINE_RATIO)
        ->and($log->distance_mismatch_cm)->toBe(4.3)
        ->and($log->calibration_id)->toBe($cal->id)
        ->and($log->facenet_distance)->toBe(0.31)
        ->and($log->emar_score)->toBe(1.0)
        ->and($log->decision)->toBe('ACCEPT');

    expect(EvaluationMatrix::sole()->distance_cm)->toBe(46);
    expect(presensiCsvRow('matriks')[5])->toBe('46');
    expect(presensiCsvRow('bab5')[1])->toBe('46');
});

it('tanpa kalibrasi memakai jarak browser beserta sumbernya', function () {
    Http::fake(['*' => Http::response(presensiEngineResult(presensiFaceWidth()))]);

    $data = submitPresensi($this, $this->teacher, PRESENSI_BROWSER_FIELDS + ['calibration_id' => 999]);

    // Klaim camera_calibrated dengan id kalibrasi yang tidak ada turun menjadi 'camera'.
    expect($data['evaluation']['distance_cm'])->toBe(50.3)
        ->and($data['evaluation']['distance_source'])->toBe('camera')
        ->and($data['evaluation']['distance_category'])->toBe('IDEAL')
        ->and($data['evaluation']['engine_distance_cm'])->toBeNull()
        ->and($data['evaluation']['engine_face_width_ratio'])->toBe(PRESENSI_ENGINE_RATIO)
        ->and($data['evaluation']['distance_mismatch_cm'])->toBeNull()
        ->and($data['evaluation']['engine_distance_note'])->toBe('no_calibration')
        // Id kalibrasi yang tidak ada tidak dicatat.
        ->and($data['evaluation']['calibration_id'])->toBeNull();

    $log = DistanceLog::sole();
    expect($log->distance_cm)->toBe(50.3)
        ->and($log->distance_source)->toBe('camera')
        ->and($log->engine_distance_cm)->toBeNull()
        ->and($log->calibration_id)->toBeNull();

    expect(presensiCsvRow('matriks')[5])->toBe('50.3');
    expect(presensiCsvRow('bab5')[1])->toBe('50.3');
});

it('kalibrasi browser tanpa model mesin: jarak browser dan id kalibrasinya', function () {
    $cal = presensiCalibration(['engine_a' => null, 'engine_b' => null, 'engine_max_residual_cm' => null]);
    Http::fake(['*' => Http::response(presensiEngineResult(presensiFaceWidth()))]);

    $data = submitPresensi($this, $this->teacher, PRESENSI_BROWSER_FIELDS + ['calibration_id' => $cal->id]);

    expect($data['evaluation']['distance_source'])->toBe('camera_calibrated')
        ->and($data['evaluation']['engine_distance_note'])->toBe('calibration_without_engine_model')
        ->and($data['evaluation']['calibration_id'])->toBe($cal->id);
    expect(DistanceLog::sole()->calibration_id)->toBe($cal->id);
});

it('tidak memakai kalibrasi mesin untuk kamera atau aspek bingkai lain', function (array $face, array $fields, string $note) {
    $cal = presensiCalibration();
    Http::fake(['*' => Http::response(presensiEngineResult($face))]);

    $data = submitPresensi($this, $this->teacher, array_merge(PRESENSI_BROWSER_FIELDS, ['calibration_id' => $cal->id], $fields));

    expect($data['evaluation']['engine_distance_cm'])->toBeNull()
        ->and($data['evaluation']['engine_distance_note'])->toBe($note)
        ->and($data['evaluation']['distance_source'])->toBe('camera_calibrated')
        ->and($data['evaluation']['distance_cm'])->toBe(50.3);
})->with([
    'kamera lain' => [presensiFaceWidth(), ['camera_label' => 'Integrated Webcam'], 'camera_label_mismatch'],
    'bingkai 4:3' => [presensiFaceWidth(PRESENSI_ENGINE_RATIO, 640, 480), [], 'aspect_mismatch'],
]);

it('jarak mesin kategori INVALID tetap dicatat dan tidak menolak presentasi', function () {
    presensiCalibration();
    // 9 / 0.21 + 1 = 43.9 cm, di celah antara 40 dan 45 cm.
    Http::fake(['*' => Http::response(presensiEngineResult(presensiFaceWidth(0.21)))]);

    $data = submitPresensi($this, $this->teacher);

    expect($data['final_decision'])->toBe('ACCEPT')
        ->and($data['evaluation']['distance_cm'])->toBe(43.9)
        ->and($data['evaluation']['distance_source'])->toBe('engine')
        ->and($data['evaluation']['distance_category'])->toBe('INVALID')
        ->and($data['evaluation']['browser_distance_cm'])->toBeNull()
        ->and($data['evaluation']['distance_mismatch_cm'])->toBeNull();
});

it('keputusan identik dengan dan tanpa data jarak', function () {
    $decisionKeys = fn (array $d) => [
        'success' => $d['success'],
        'final_decision' => $d['final_decision'],
        'pad_pred' => $d['pad_pred'],
        'id_pred' => $d['id_pred'],
        'attendance_status' => $d['attendance_status'],
        'message' => $d['message'],
        'evaluation' => array_intersect_key($d['evaluation'], array_flip([
            'euclidean_distance', 'facenet_score', 'emar_score', 's1_decision', 's2_decision',
            's3_decision', 'p_face', 'p_live', 's_final', 'liveness_valid', 'ear_val', 'mar_val',
            'facenet_threshold', 'face_detected_pct',
        ])),
    ];

    // Satu fake saja: stub Http::fake berikutnya tidak menimpa yang pertama.
    $faceWidth = [];
    Http::fake(function () use (&$faceWidth) {
        return Http::response(presensiEngineResult($faceWidth));
    });

    foreach ([['ear_blinks' => 2, 'mar_mouths' => 1], ['ear_blinks' => 0, 'mar_mouths' => 1]] as $liveness) {
        $faceWidth = [];
        $without = submitPresensi($this, $this->teacher, $liveness);

        $cal = presensiCalibration();
        $faceWidth = presensiFaceWidth(0.14);
        $with = submitPresensi($this, $this->teacher, $liveness + PRESENSI_BROWSER_FIELDS + ['calibration_id' => $cal->id]);
        $cal->delete();

        expect($with['evaluation']['distance_source'])->toBe('engine')
            ->and($with['evaluation']['distance_category'])->toBe('JAUH')
            ->and($without['evaluation']['distance_cm'])->toBeNull();
        expect($decisionKeys($with))->toBe($decisionKeys($without));
    }

    $logs = DistanceLog::orderBy('id')->get();
    expect($logs)->toHaveCount(4)
        ->and($logs->pluck('decision')->all())->toBe(['ACCEPT', 'ACCEPT', 'REJECT', 'REJECT']);
});

it('baris distance_logs tetap dibuat walau jarak tidak terukur', function () {
    Http::fake(['*' => Http::response(presensiEngineResult())]);

    $data = submitPresensi($this, $this->teacher);

    expect($data['evaluation']['distance_cm'])->toBeNull()
        ->and($data['evaluation']['distance_category'])->toBeNull()
        ->and($data['evaluation']['engine_distance_note'])->toBe('engine_no_face_width');

    $log = DistanceLog::sole();
    expect($log->distance_cm)->toBeNull()
        ->and($log->distance_category)->toBeNull()
        ->and($log->distance_source)->toBe('none')
        ->and($log->engine_face_width_ratio)->toBeNull()
        ->and($log->camera_device)->toBeNull()
        ->and($log->decision)->toBe('ACCEPT');

    expect(presensiCsvRow('matriks')[5])->toBe('');
});

it('baris distance_logs dibuat juga saat mesin tidak dapat dihubungi', function () {
    $cal = presensiCalibration();
    Http::fake(['*' => Http::response(['detail' => 'boom'], 503)]);

    $data = submitPresensi($this, $this->teacher, PRESENSI_BROWSER_FIELDS + ['calibration_id' => $cal->id]);

    expect($data['final_decision'])->toBe('REJECT');
    $log = DistanceLog::sole();
    expect($log->decision)->toBe('REJECT')
        ->and($log->facenet_distance)->toBeNull()
        ->and($log->distance_cm)->toBe(50.3)
        ->and($log->distance_source)->toBe('camera_calibrated');
});

it('menghapus catatan presensi tidak menghapus distance_logs', function () {
    Http::fake(['*' => Http::response(presensiEngineResult())]);
    submitPresensi($this, $this->teacher);

    AttendanceRecord::sole()->delete();

    expect(DistanceLog::sole()->attendance_record_id)->toBeNull();
});

it('riwayat memuat kategori jarak, sumber, dan label kamera', function () {
    presensiCalibration();
    Http::fake(['*' => Http::response(presensiEngineResult(presensiFaceWidth()))]);
    submitPresensi($this, $this->teacher, PRESENSI_BROWSER_FIELDS);
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)
        ->get('/attendance/history')
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Attendance/History')
            ->where('records.data.0.metadata.distance_cm', fn ($cm) => (float) $cm === PRESENSI_ENGINE_CM)
            ->where('records.data.0.metadata.distance_category', 'IDEAL')
            ->where('records.data.0.metadata.distance_source', 'engine')
            ->where('records.data.0.metadata.camera_label', 'EYESEC USB 1080p'));
});

it('riwayat catatan lama tanpa kategori menurunkannya dari jarak tercatat', function () {
    AttendanceRecord::create([
        'user_id' => $this->teacher->id,
        'status' => 'hadir',
        'metadata' => ['distance_cm' => 62.0, 'distance_source' => 'sensor', 'final_decision' => 'ACCEPT'],
    ]);

    $this->actingAs($this->teacher)
        ->get('/attendance/history')
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('records.data.0.metadata.distance_category', 'JAUH')
            ->where('records.data.0.metadata.camera_label', null));
});

it('presensi tetap tercatat sebelum migrasi tabel jarak dijalankan', function () {
    // DDL SQLite ikut transaksi RefreshDatabase, jadi tabel kembali setelah tes ini.
    Schema::drop('distance_logs');
    Schema::drop('distance_calibrations');
    Http::fake(['*' => Http::response(presensiEngineResult(presensiFaceWidth()))]);

    $data = submitPresensi($this, $this->teacher, PRESENSI_BROWSER_FIELDS + ['calibration_id' => 1]);

    expect($data['final_decision'])->toBe('ACCEPT')
        ->and($data['evaluation']['distance_cm'])->toEqual(50.3)
        ->and($data['evaluation']['distance_source'])->toBe('camera')
        ->and($data['evaluation']['engine_distance_note'])->toBe('calibration_table_missing')
        ->and($data['evaluation']['calibration_id'])->toBeNull();
    expect(AttendanceRecord::count())->toBe(1);

    $this->getJson('/api/biometric/calibration/current')
        ->assertOk()
        ->assertExactJson(['calibrated' => false, 'calibration' => null]);
});

it('metadata kamera yang tidak terbaca disimpan null tanpa menggagalkan presensi', function () {
    Http::fake(['*' => Http::response(presensiEngineResult())]);

    $data = submitPresensi($this, $this->teacher, [
        'camera_label' => '   ',
        'camera_resolution' => 'undefined',
        'camera_fps' => 'NaN',
        'calibration_id' => 'null',
    ]);

    expect($data['final_decision'])->toBe('ACCEPT')
        ->and($data['evaluation']['camera_label'])->toBeNull()
        ->and($data['evaluation']['camera_resolution'])->toBeNull()
        ->and($data['evaluation']['camera_fps'])->toBeNull()
        ->and($data['evaluation']['calibration_id'])->toBeNull();
    expect(DistanceLog::sole()->camera_device)->toBeNull();
});

it('id kalibrasi hanya dicatat untuk jarak browser berkalibrasi', function () {
    $cal = presensiCalibration(['engine_a' => null, 'engine_b' => null, 'engine_max_residual_cm' => null]);
    Http::fake(['*' => Http::response(presensiEngineResult(presensiFaceWidth()))]);

    // Bacaan sensor tidak memakai model kalibrasi kamera walau klien mengirim id-nya.
    $data = submitPresensi($this, $this->teacher, [
        'distance_cm' => 47.0,
        'distance_source' => 'sensor',
        'calibration_id' => $cal->id,
    ]);

    expect($data['evaluation']['distance_source'])->toBe('sensor')
        ->and($data['evaluation']['calibration_id'])->toBeNull();
    expect(DistanceLog::sole()->calibration_id)->toBeNull();
    $meta = AttendanceRecord::latest('id')->first()->metadata;
    expect($meta['browser_calibration_id'] ?? null)->toBeNull();
});
