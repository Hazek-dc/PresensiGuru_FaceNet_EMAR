<?php

use App\Models\AttendanceRecord;
use App\Models\LightingLog;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

/**
 * Lux otomatis tanpa kalibrasi di Studio: perkiraan kamera (sumber 'camera')
 * dicatat bersama presensi dengan cara perkiraannya, selalu bertanda estimasi,
 * dan tidak dihitung sebagai lux terukur di Dasbor.
 */
const AUTO_LUX_VERIFY_OK = ['status' => 'success', 'distance' => 0.31, 'facenet_score' => 0.74, 'emar_score' => 1.0];

function autoLuxSubmit($test, User $user, array $extra = []): array
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

function autoLuxEstimate(array $overrides = []): string
{
    return json_encode(array_merge([
        'method' => 'human_face_photometry',
        'profile' => 'LAPTOP_DEFAULT',
        'factor' => 1,
        'offset' => 0,
        'glare_compensated' => false,
        'face_targeted' => true,
    ], $overrides));
}

beforeEach(function () {
    Http::preventStrayRequests();
    Http::fake(['*' => Http::response(AUTO_LUX_VERIFY_OK)]);
    config(['biometrics.allow_simulated_scores' => false]);
    $this->teacher = User::factory()->create([
        'name' => 'Guru Otomatis', 'role' => 'teacher', 'embedding_id' => 'S01', 'is_active' => true,
    ]);
});

it('tanpa kalibrasi, perkiraan kamera dicatat sebagai estimasi beserta cara perkiraannya', function () {
    $data = autoLuxSubmit($this, $this->teacher, [
        'lux_value' => 212.4, 'lux_source' => 'camera', 'lux_estimate' => autoLuxEstimate(),
    ]);

    expect($data['evaluation']['lux_value'])->toEqual(212.4)
        ->and($data['evaluation']['lux_source'])->toBe('camera')
        ->and($data['evaluation']['lighting']['source_label'])->toBe('Perkiraan kamera (belum dikalibrasi)')
        ->and($data['evaluation']['lighting']['note'])->toBeNull();

    $meta = AttendanceRecord::sole()->metadata;
    expect($meta['browser_lux'])->toEqual(212.4)
        ->and($meta['browser_lux_source'])->toBe('camera')
        ->and($meta['lux_engine_note'])->toBe('no_lux_calibration')
        // JSON menyimpan 1.0 sebagai 1, jadi dibandingkan nilainya.
        ->and($meta['lux_estimate'])->toEqual([
            'method' => 'human_face_photometry',
            'profile' => 'LAPTOP_DEFAULT',
            'factor' => 1.0,
            'offset' => 0.0,
            'glare_compensated' => false,
            'face_targeted' => true,
        ]);

    $log = LightingLog::sole();
    expect($log->lux_source)->toBe('camera')
        ->and($log->calibration_id)->toBeNull()
        ->and($log->lux_value)->toEqual(212.4);
});

it('rincian perkiraan yang tidak dikenal atau bukan untuk kamera tidak disimpan', function () {
    autoLuxSubmit($this, $this->teacher, [
        'lux_value' => 150, 'lux_source' => 'camera', 'lux_estimate' => autoLuxEstimate(['method' => 'tebakan']),
    ]);
    expect(AttendanceRecord::latest('id')->first()->metadata['lux_estimate'])->toBeNull();

    autoLuxSubmit($this, $this->teacher, [
        'lux_value' => 150, 'lux_source' => 'camera', 'lux_estimate' => '{bukan json',
    ]);
    expect(AttendanceRecord::latest('id')->first()->metadata['lux_estimate'])->toBeNull();

    // Profil dengan karakter asing dibuang, sisanya tetap.
    autoLuxSubmit($this, $this->teacher, [
        'lux_value' => 150, 'lux_source' => 'camera', 'lux_estimate' => autoLuxEstimate(['profile' => '<script>', 'factor' => 'x']),
    ]);
    $estimate = AttendanceRecord::latest('id')->first()->metadata['lux_estimate'];
    expect($estimate['profile'])->toBeNull()->and($estimate['factor'])->toBeNull()->and($estimate['method'])->toBe('human_face_photometry');

    // Bacaan luxmeter adalah hasil ukur; rincian perkiraan kamera tidak menempel padanya.
    autoLuxSubmit($this, $this->teacher, [
        'lux_value' => 150, 'lux_source' => 'luxmeter', 'lux_estimate' => autoLuxEstimate(),
    ]);
    expect(AttendanceRecord::latest('id')->first()->metadata['lux_estimate'])->toBeNull();
});

it('dasbor memisahkan estimasi kamera dari lux terukur', function () {
    autoLuxSubmit($this, $this->teacher, ['lux_value' => 200, 'lux_source' => 'camera']);
    autoLuxSubmit($this, $this->teacher, ['lux_value' => 100, 'lux_source' => 'camera']);
    autoLuxSubmit($this, $this->teacher, ['lux_value' => 250, 'lux_source' => 'luxmeter']);
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->get('/dashboard')->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('lighting_stats.measured_today', 1)
            ->where('lighting_stats.average_today', 250)
            ->where('lighting_stats.estimated_today', 2)
            ->where('lighting_stats.estimated_average_today', 150)
            ->where('lighting_stats.scans_today', 3)
            ->where('lighting_stats.calibrated', false)
            ->etc());
});

it('perkiraan kamera tidak pernah mengubah keputusan presensi', function () {
    // L2 0.31 <= 0.40 dan liveness lulus: setiap kategori lux harus tetap ACCEPT dengan S1-S3 sama.
    $runs = [];
    foreach ([20, 200, 900] as $lux) {
        $runs[$lux] = autoLuxSubmit($this, $this->teacher, ['lux_value' => $lux, 'lux_source' => 'camera'])['evaluation'];
    }

    foreach ($runs as $evaluation) {
        expect($evaluation['final_decision'])->toBe('ACCEPT')
            ->and([$evaluation['s1_decision'], $evaluation['s2_decision'], $evaluation['s3_decision']])
            ->toBe([$runs[200]['s1_decision'], $runs[200]['s2_decision'], $runs[200]['s3_decision']]);
    }
    expect($runs[20]['lighting']['kategori_naskah'])->toBe('redup')
        ->and($runs[200]['lighting']['kategori_naskah'])->toBe('normal')
        ->and($runs[900]['lighting']['kategori_naskah'])->toBe('terang');
});

it('klaim kamera terkalibrasi yang ditolak tetap tercatat asalnya', function () {
    autoLuxSubmit($this, $this->teacher, ['lux_value' => 210, 'lux_source' => 'camera_calibrated', 'lux_calibration_id' => 999]);
    $meta = AttendanceRecord::latest('id')->first()->metadata;
    expect($meta['lux_source'] ?? $meta['browser_lux_source'])->toBe('camera')
        ->and($meta['browser_lux_claimed_source'])->toBe('camera_calibrated');

    autoLuxSubmit($this, $this->teacher, ['lux_value' => 210, 'lux_source' => 'camera']);
    expect(AttendanceRecord::latest('id')->first()->metadata['browser_lux_claimed_source'])->toBeNull();
});

it('CSV subjek dan laporan cetak menandai perkiraan dan tidak mengisi nilai yang kosong', function () {
    autoLuxSubmit($this, $this->teacher, ['lux_value' => 212.4, 'lux_source' => 'camera']);
    $estimated = AttendanceRecord::latest('id')->first();
    autoLuxSubmit($this, $this->teacher);
    $empty = AttendanceRecord::latest('id')->first();
    $admin = User::factory()->create(['role' => 'admin']);

    $csv = $this->actingAs($admin)->get(route('attendance.export.subject', $estimated->id))->assertOk()->streamedContent();
    expect($csv)->toContain('Intensitas_Cahaya_Lux,"~212.4 Lux","Kondisi Pencahayaan Lingkungan Uji (Perkiraan kamera (belum dikalibrasi))"')
        ->and($csv)->toContain('perkiraan bila Sumber_Lux camera');

    $csvEmpty = $this->actingAs($admin)->get(route('attendance.export.subject', $empty->id))->assertOk()->streamedContent();
    expect($csvEmpty)->toContain('Intensitas_Cahaya_Lux,"Tidak terukur"');

    $html = $this->actingAs($admin)->get(route('attendance.export.print'))->assertOk()->getContent();
    expect($html)->toContain('~212 Lux')
        ->and($html)->toContain('~ = estimasi kamera (belum dikalibrasi)')
        ->and($html)->toContain('Lux tidak terukur')
        ->and($html)->not->toContain('300 Lux')
        ->and($html)->not->toContain('30 cm');
});
