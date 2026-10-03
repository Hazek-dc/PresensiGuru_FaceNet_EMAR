<?php

use App\Models\AttendanceRecord;
use App\Models\LuxCalibration;
use App\Models\User;
use App\Services\LightingSummary;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;

/**
 * Pencahayaan satu presensi (lux, sumber, kategori naskah, target dan
 * kesesuaiannya, kalibrasi dan alat acuannya) tampil sama di Studio, Riwayat,
 * Detail, Dashboard, dan ekspor CSV. Target yang diatur operator bukan hasil ukur.
 */

// Model sintetis: lux = 10^(3 + 1.5 log10(luma/255)).
function summaryLuma(float $lux): float
{
    return 255 * 10 ** ((log10($lux) - 3) / 1.5);
}

function summaryCalibration(string $device = 'luxmeter_app'): LuxCalibration
{
    return LuxCalibration::create([
        'camera_label' => 'USB 2.0 Camera', 'resolution_w' => 1920, 'resolution_h' => 1080,
        'exposure_locked' => true, 'exposure_time' => 333,
        'browser_a' => 3.0, 'browser_b' => 1.5, 'browser_max_rel_error' => 0.05,
        'engine_a' => 3.0, 'engine_b' => 1.5, 'engine_max_rel_error' => 0.05,
        'points' => array_map(fn ($lux) => ['lux' => $lux, 'browser_luma' => 50.0, 'engine_luma' => 52.0,
            'reference_device' => $device], [50, 200, 600]),
        'is_active' => true,
    ]);
}

function summarySubmit($test, User $user, array $extra = []): array
{
    return $test->actingAs($user)->post(route('api.presensi'), array_merge([
        'video' => UploadedFile::fake()->create('presensi.webm', 16, 'video/webm'),
        'subject_id' => 'S13', 'sample_type' => 'BONA_FIDE', 'session_type' => 'TEST',
        'ear_blinks' => 2, 'mar_mouths' => 1, 'face_pct' => 95.0, 'scan_duration_s' => 8.0,
        'camera_label' => 'USB 2.0 Camera',
    ], $extra))->assertOk()->json();
}

beforeEach(function () {
    Http::preventStrayRequests();
    config(['biometrics.allow_simulated_scores' => false]);
    $this->admin = User::factory()->create(['role' => 'admin']);
    $this->sinta = User::factory()->create([
        'name' => 'Sinta Yulisma, S.Pd', 'role' => 'teacher', 'embedding_id' => 'S13', 'is_active' => true,
    ]);
});

/** Satu presensi terukur mesin 245 lux dengan target 300 (normal). */
function summaryMeasuredRecord($test): array
{
    $cal = summaryCalibration();
    Http::fake([
        '*/measure/brightness' => Http::response(['success' => true, 'luma' => round(summaryLuma(245), 3), 'n_frames' => 3]),
        '*/gallery/status*' => Http::response(['success' => true, 'subjects' => []]),
        '*' => Http::response(['status' => 'success', 'distance' => 0.30, 'facenet_score' => 0.75, 'emar_score' => 1.0]),
    ]);
    $data = summarySubmit($test, $test->sinta, [
        'lux_target' => 300,
        'lux_browser_luma' => 90.5, 'lux_exposure_locked' => 1,
        'lux_probe_frames' => [
            UploadedFile::fake()->image('lux_0.jpg', 32, 18),
            UploadedFile::fake()->image('lux_1.jpg', 32, 18),
            UploadedFile::fake()->image('lux_2.jpg', 32, 18),
        ],
    ]);

    return [$cal, $data];
}

it('Studio menerima ringkasan pencahayaan lengkap dan alat acuannya tersimpan', function () {
    [$cal, $data] = summaryMeasuredRecord($this);

    $lighting = $data['evaluation']['lighting'];
    expect($lighting['lux'])->toEqualWithDelta(245.0, 0.2)
        ->and($lighting['source'])->toBe('engine')
        ->and($lighting['source_label'])->toBe('Kamera terkalibrasi (mesin)')
        ->and($lighting['kategori_naskah'])->toBe('normal')
        ->and($lighting['target'])->toEqual(300.0)
        ->and($lighting['target_met'])->toBeTrue()
        ->and($lighting['calibration_id'])->toBe($cal->id)
        ->and($lighting['reference_label'])->toBe('Aplikasi luxmeter HP')
        ->and($lighting['note'])->toBeNull();

    expect(AttendanceRecord::sole()->metadata['lux_reference_device'])->toBe('luxmeter_app');
});

it('lux tidak terukur: target tetap target, alasannya dijelaskan', function () {
    $summary = LightingSummary::fromMetadata([
        'lux' => null, 'lux_source' => 'none', 'lux_target' => 300, 'lux_engine_note' => 'no_lux_calibration',
    ]);

    expect($summary['lux'])->toBeNull()
        ->and($summary['source'])->toBeNull()
        ->and($summary['target'])->toEqual(300.0)
        ->and($summary['target_kategori'])->toBe('normal')
        ->and($summary['target_met'])->toBeNull()
        ->and($summary['note_label'])->toBe('Belum ada kalibrasi luxmeter dan perkiraan kamera tidak terkirim (kamera belum siap atau gambar terlalu gelap/terang).');
});

it('presensi lama tanpa alat acuan memakai alat acuan dari kalibrasinya', function () {
    $cal = summaryCalibration('luxmeter');
    $meta = ['lux' => 150, 'lux_source' => 'engine', 'lux_calibration_id' => $cal->id];

    $summary = LightingSummary::fromMetadata($meta, LightingSummary::referenceDevices([$meta]));

    expect($summary['reference_device'])->toBe('luxmeter')
        ->and($summary['reference_label'])->toBe('Luxmeter fisik');
});

it('Riwayat dan Detail menampilkan ringkasan pencahayaan', function () {
    [$cal] = summaryMeasuredRecord($this);
    $record = AttendanceRecord::sole();

    $this->actingAs($this->admin)->get(route('attendance.history'))->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('records.data.0.metadata.lighting.kategori_naskah', 'normal')
            ->where('records.data.0.metadata.lighting.target_met', true)
            ->where('records.data.0.metadata.lighting.calibration_id', $cal->id));

    $this->actingAs($this->admin)->get(route('attendance.show', $record->id))->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('lighting.source', 'engine')
            ->where('lighting.reference_device', 'luxmeter_app'));
});

it('ekspor CSV menambah kolom pencahayaan di akhir tanpa menggeser kolom lama', function () {
    [$cal] = summaryMeasuredRecord($this);

    $csv = $this->actingAs($this->admin)->get(route('export.operational'))->assertOk()->streamedContent();
    $rows = array_map('str_getcsv', array_filter(explode("\n", ltrim($csv, "\xEF\xBB\xBF"))));

    expect(array_slice($rows[0], 0, 3))->toBe(['ID_Record', 'ID_Subjek', 'Nama_Guru'])
        ->and(array_slice($rows[0], 15, 1))->toBe(['Lux'])
        ->and(array_slice($rows[0], -6))->toBe(LightingSummary::CSV_HEADERS)
        ->and(array_slice($rows[1], -6))->toBe(['engine', 'normal', '300', '1', (string) $cal->id, 'luxmeter_app']);

    $subject = $this->actingAs($this->admin)
        ->get(route('attendance.export.subject', AttendanceRecord::sole()->id))->assertOk()->streamedContent();
    expect($subject)->toContain('Sumber_Lux,engine')
        ->and($subject)->toContain('Sesuai_Target_Lux,1')
        ->and($subject)->toContain('Alat_Acuan_Lux,luxmeter_app');
});

it('Dashboard membedakan target dari hasil ukur dan menampilkan kalibrasi aktif', function () {
    [$cal] = summaryMeasuredRecord($this);

    $this->actingAs($this->admin)->get(route('dashboard'))->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('lighting_stats.calibration.id', $cal->id)
            ->where('lighting_stats.calibration.reference_label', 'Aplikasi luxmeter HP')
            ->where('lighting_stats.current_kategori_naskah', 'normal')
            ->where('lighting_stats.current_source_label', 'Kamera terkalibrasi (mesin)')
            ->where('lighting_stats.can_calibrate', true));
});
