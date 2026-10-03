<?php

use App\Models\AttendanceRecord;
use App\Models\User;
use App\Services\CombinedHistoryExport;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Spatie\Activitylog\Models\Activity;

/**
 * Satu CSV dari dashboard dan halaman riwayat: tiap verifikasi menjadi satu baris
 * Presensi berisi catatan dan log aktivitasnya; log lain menjadi baris Aktivitas.
 * Nilai yang tidak tercatat dibiarkan kosong.
 */
function combinedCsv($test, User $user): array
{
    $response = $test->actingAs($user)->get(route('attendance.export.all'))->assertOk();
    expect($response->headers->get('content-type'))->toContain('text/csv')
        ->and($response->headers->get('content-disposition'))->toContain('Riwayat_Presensi_dan_Log_Aktivitas_');

    $content = $response->streamedContent();
    expect(substr($content, 0, 3))->toBe("\xEF\xBB\xBF");
    $handle = fopen('php://memory', 'r+');
    fwrite($handle, substr($content, 3));
    rewind($handle);
    $header = fgetcsv($handle);
    expect($header)->toBe(CombinedHistoryExport::headers());
    $rows = [];
    while (($row = fgetcsv($handle)) !== false) {
        $rows[] = array_combine($header, $row);
    }
    fclose($handle);

    return $rows;
}

function combinedVerify($test, User $user): array
{
    return $test->actingAs($user)->post(route('api.presensi'), [
        'video' => UploadedFile::fake()->create('presensi.webm', 16, 'video/webm'),
        'subject_id' => $user->embedding_id,
        'sample_type' => 'BONA_FIDE',
        'session_type' => 'TEST',
        'ear_blinks' => 2,
        'mar_mouths' => 1,
        'face_pct' => 95.0,
        'scan_duration_s' => 8.0,
    ])->assertOk()->json();
}

beforeEach(function () {
    Http::preventStrayRequests();
    config(['biometrics.allow_simulated_scores' => false]);
    $this->admin = User::factory()->create(['role' => 'admin', 'embedding_id' => 'ADM01']);
    $this->teacher = User::factory()->create([
        'name' => 'Guru Satu', 'email' => 'guru1@example.test', 'role' => 'teacher', 'embedding_id' => 'S01', 'is_active' => true,
    ]);
    // Model User mencatat pembuatannya sendiri; log persiapan tes tidak ikut dihitung.
    Activity::query()->delete();
});

afterEach(fn () => Carbon::setTestNow());

it('menaruh kolom utama di depan dan kolom teknis di belakang', function () {
    $headers = CombinedHistoryExport::headers();
    expect(array_slice($headers, 0, 11))->toBe([
        'No', 'Jenis', 'Tanggal', 'Jam', 'ID Subjek', 'Nama', 'Email',
        'Kegiatan', 'Status Presensi', 'Keputusan Final', 'Keterangan',
    ])
        ->and(array_slice($headers, -6))->toBe([
            'ID Record Presensi', 'ID Log Aktivitas', 'ID Request Biometrik', 'IP', 'Perangkat', 'Properti Log (JSON)',
        ]);
});

it('menggabungkan catatan verifikasi dan log aktivitasnya menjadi satu baris Presensi', function () {
    Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.31, 'facenet_score' => 0.74, 'emar_score' => 1.0])]);
    combinedVerify($this, $this->teacher);

    $record = AttendanceRecord::sole();
    $log = Activity::where('log_name', 'attendance')->sole();
    expect($log->properties['attendance_id'])->toBe($record->id);

    $rows = combinedCsv($this, $this->admin);
    $presensi = collect($rows)->where('Jenis', 'Presensi');
    expect($presensi)->toHaveCount(1);
    $row = $presensi->first();
    expect($row['ID Record Presensi'])->toBe((string) $record->id)
        ->and($row['ID Log Aktivitas'])->toBe((string) $log->id)
        ->and($row['ID Request Biometrik'])->toBe($record->biometric_request_id)
        ->and($row['Tanggal'])->toBe($record->created_at->timezone(config('app.timezone'))->format('Y-m-d'))
        ->and($row['Jam'])->toBe($record->created_at->timezone(config('app.timezone'))->format('H:i:s'))
        ->and($row['ID Subjek'])->toBe('S01')
        ->and($row['Nama'])->toBe('Guru Satu')
        ->and($row['Kegiatan'])->toBe('Verifikasi biometrik')
        ->and($row['Sumber Biometrik'])->toBe('Mesin biometrik')
        ->and($row['Jarak Euclidean (L2)'])->toBe('0.3100')
        ->and($row['Skor FaceNet'])->toBe('0.7400')
        ->and($row['Kedipan (EAR)'])->toBe('2')
        ->and($row['Keputusan Final'])->toBe($record->metadata['final_decision'])
        ->and($row['Keterangan'])->toBe($record->decision_reason)
        ->and($row['Kategori Log'])->toBe('attendance')
        ->and($row['Event Log'])->toBe('biometric_scan_session')
        ->and($row['Aktor'])->toBe('Guru Satu')
        ->and($row['Deskripsi Log Verifikasi'])->toBe($log->description)
        ->and(json_decode($row['Properti Log (JSON)'], true)['attendance_id'])->toBe($record->id);
    // Log yang sudah digabung tidak muncul lagi sebagai baris terpisah.
    expect(collect($rows)->where('ID Log Aktivitas', (string) $log->id))->toHaveCount(1);
});

it('verifikasi tanpa hasil mesin tetap tercatat, dengan sel biometrik kosong', function () {
    Http::fake(['*' => Http::response([], 503)]);
    combinedVerify($this, $this->teacher);

    $row = collect(combinedCsv($this, $this->admin))->firstWhere('Jenis', 'Presensi');
    expect($row['Status Presensi'])->toBe('Gagal')
        ->and($row['Keputusan Final'])->toBe('REJECT')
        ->and($row['Sumber Biometrik'])->toBe('Mesin tidak dapat dihubungi')
        ->and($row['Jarak Euclidean (L2)'])->toBe('')
        ->and($row['Skor FaceNet'])->toBe('')
        ->and($row['S1'])->toBe('')
        ->and($row['ID Log Aktivitas'])->not->toBe('')
        ->and($row['Deskripsi Log Verifikasi'])->toContain('Sumber: unavailable');
});

it('log verifikasi bernama lama tetap digabung ke catatannya', function () {
    $old = AttendanceRecord::create([
        'user_id' => $this->teacher->id, 'status' => 'success', 'biometric_request_id' => 'c1806635-req',
        'decision_reason' => 'Verifikasi Wajah & Liveness EMAR 8 Detik Berhasil Memenuhi Standar',
        'metadata' => ['euclidean_distance' => 0.21],
    ]);
    $log = activity('attendance')->performedOn($this->teacher)->causedBy($this->teacher)->withProperties([
        'event' => 'antigravity_scan_session', 'attendance_id' => $old->id, 'status' => 'success',
    ])->log('Presensi Guru Satu (S01): ACCEPT');

    $rows = combinedCsv($this, $this->admin);
    expect($rows)->toHaveCount(1);
    expect($rows[0]['ID Record Presensi'])->toBe((string) $old->id)
        ->and($rows[0]['ID Log Aktivitas'])->toBe((string) $log->id)
        ->and($rows[0]['ID Request Biometrik'])->toBe('c1806635-req')
        ->and($rows[0]['Kegiatan'])->toBe('Verifikasi biometrik')
        ->and($rows[0]['Status Presensi'])->toBe('Hadir')
        ->and($rows[0]['Sumber Biometrik'])->toBe('')
        ->and($rows[0]['Jarak Euclidean (L2)'])->toBe('0.2100');
});

it('tidak mengisi nilai yang tidak tercatat', function () {
    AttendanceRecord::create(['user_id' => $this->teacher->id, 'status' => 'hadir', 'metadata' => []]);

    $row = combinedCsv($this, $this->admin)[0];
    foreach (['ID Request Biometrik', 'Kegiatan', 'Keputusan Final', 'Prediksi PAD', 'Prediksi Identitas',
        'Jarak Euclidean (L2)', 'Kedipan (EAR)', 'Gerak Mulut (MAR)', 'Wajah Stabil (%)', 'Durasi Pindai (detik)',
        'Jarak Kamera (cm)', 'Lux', 'Sumber Lux', 'ID Log Aktivitas', 'Properti Log (JSON)'] as $column) {
        expect($row[$column])->toBe('', "kolom {$column}");
    }
    expect($row['No'])->toBe('1')
        ->and($row['ID Subjek'])->toBe('S01')
        ->and($row['Status Presensi'])->toBe('Hadir')
        ->and($row['Akun Uji'])->toBe('Tidak');
});

it('memuat izin dari admin, entri yang disembunyikan dari dasbor, dan log lain, urut terbaru', function () {
    Carbon::setTestNow(Carbon::parse('2026-10-01 08:00:00'));
    activity('attendance')->causedBy($this->admin)
        ->withProperties(['deleted_record_id' => 998, 'subject_name' => 'Guru Lama'])
        ->log('Menghapus satu catatan presensi #998 (Guru Lama) secara manual.');

    Carbon::setTestNow(Carbon::parse('2026-10-01 09:00:00'));
    // Log verifikasi yang catatannya sudah dihapus tetap ikut, dengan nilai dari log itu.
    activity('attendance')->performedOn($this->teacher)->causedBy($this->teacher)->withProperties([
        'event' => 'biometric_scan_session', 'attendance_id' => 999, 'subject_id' => 'S01',
        'status' => 'failed', 'final_decision' => 'REJECT', 'euclidean_distance' => 0.418,
        'lux' => null, 'lux_source' => 'none', 'ip' => '127.0.0.1',
    ])->log('Presensi Guru Satu (S01): REJECT');

    Carbon::setTestNow(Carbon::parse('2026-10-01 10:00:00'));
    $leave = AttendanceRecord::create([
        'user_id' => $this->teacher->id, 'status' => 'izin', 'decision_reason' => 'Izin Dinas Luar / MGMP',
        'hidden_from_dashboard_at' => Carbon::parse('2026-10-01 11:00:00'),
        'metadata' => ['source' => 'admin_teacher_edit', 'category' => 'Izin Dinas Luar / MGMP'],
    ]);

    Carbon::setTestNow(Carbon::parse('2026-10-01 10:05:00'));
    activity()->causedBy($this->teacher)->event('login_success')
        ->withProperties(['ip' => '10.0.0.5', 'user_agent' => 'Chrome'])->log('User logged in successfully.');

    $rows = combinedCsv($this, $this->admin);
    expect(array_column($rows, 'No'))->toBe(['1', '2', '3', '4'])
        ->and(array_column($rows, 'Tanggal'))->toBe(array_fill(0, 4, '2026-10-01'))
        ->and(array_column($rows, 'Jam'))->toBe(['10:05:00', '10:00:00', '09:00:00', '08:00:00']);
    [$login, $izin, $orphan, $deletion] = $rows;

    expect($login['Jenis'])->toBe('Aktivitas')
        ->and($login['Kegiatan'])->toBe('Login berhasil')
        ->and($login['Keterangan'])->toBe('User logged in successfully.')
        ->and($login['Event Log'])->toBe('login_success')
        ->and($login['Nama'])->toBe('Guru Satu')
        ->and($login['IP'])->toBe('10.0.0.5')
        ->and($login['Perangkat'])->toBe('Chrome');

    expect($izin['Jenis'])->toBe('Presensi')
        ->and($izin['ID Record Presensi'])->toBe((string) $leave->id)
        ->and($izin['Status Presensi'])->toBe('Izin')
        ->and($izin['Kegiatan'])->toBe('Izin/sakit oleh admin')
        ->and($izin['Keterangan'])->toBe('Izin Dinas Luar / MGMP')
        ->and($izin['Disembunyikan dari Dasbor'])->toBe('2026-10-01 11:00:00')
        ->and($izin['Jarak Euclidean (L2)'])->toBe('');

    expect($orphan['Jenis'])->toBe('Aktivitas')
        ->and($orphan['ID Record Presensi'])->toBe('999')
        ->and($orphan['Kegiatan'])->toBe('Verifikasi biometrik')
        ->and($orphan['Status Presensi'])->toBe('Gagal')
        ->and($orphan['Keputusan Final'])->toBe('REJECT')
        ->and($orphan['Jarak Euclidean (L2)'])->toBe('0.4180')
        ->and($orphan['Lux'])->toBe('')
        ->and($orphan['Sumber Lux'])->toBe('Tidak terukur');

    expect($deletion['ID Record Presensi'])->toBe('998')
        ->and($deletion['Aktor'])->toBe($this->admin->name)
        ->and($deletion['Keterangan'])->toContain('#998')
        ->and($deletion['Status Presensi'])->toBe('');
});

it('menandai lux dan jarak tanpa sumber tanpa mengubah angkanya', function () {
    // Kode lama mengisi 300 lux / 30 cm tanpa pengukuran dan tanpa sumber.
    AttendanceRecord::create([
        'user_id' => $this->teacher->id, 'status' => 'hadir', 'biometric_request_id' => 'lama-req',
        'metadata' => ['lux' => 300, 'distance_cm' => 30, 'euclidean_distance' => 0.3],
    ]);

    $row = combinedCsv($this, $this->admin)[0];
    expect($row['Lux'])->toBe('300')
        ->and($row['Sumber Lux'])->toBe('Tanpa sumber pengukuran (catatan versi lama)')
        ->and($row['Jarak Kamera (cm)'])->toBe('30')
        ->and($row['Sumber Jarak'])->toBe('Tanpa sumber pengukuran (catatan versi lama)')
        ->and($row['Target Lux Skenario'])->toBe('')
        ->and($row['Target Jarak Skenario (cm)'])->toBe('');
});

it('menampilkan target skenario Studio terpisah dari hasil ukur', function () {
    AttendanceRecord::create([
        'user_id' => $this->teacher->id, 'status' => 'failed', 'biometric_request_id' => 'baru-req',
        'metadata' => [
            'biometric_source' => 'engine', 'lux' => null, 'lux_source' => 'none', 'lux_target' => 300,
            'distance_cm' => 47.5, 'distance_source' => 'camera', 'distance_target_cm' => 45,
        ],
    ]);

    $row = combinedCsv($this, $this->admin)[0];
    expect($row['Lux'])->toBe('')
        ->and($row['Sumber Lux'])->toBe('Tidak terukur')
        ->and($row['Target Lux Skenario'])->toBe('300')
        ->and($row['Jarak Kamera (cm)'])->toBe('47.5')
        ->and($row['Sumber Jarak'])->toBe('Perkiraan kamera (belum dikalibrasi)')
        ->and($row['Target Jarak Skenario (cm)'])->toBe('45');
});

it('log verifikasi yatim tanpa kolom sumber diberi label sesuai isinya', function () {
    Carbon::setTestNow(Carbon::parse('2026-09-30 10:00:00'));
    // Log sebelum 1 Oktober menyimpan nilai tetapi belum menyimpan kolom sumbernya.
    activity('attendance')->performedOn($this->teacher)->causedBy($this->teacher)->withProperties([
        'event' => 'biometric_scan_session', 'attendance_id' => 501, 'lux' => 384, 'distance_cm' => 33.5,
    ])->log('Presensi Guru Satu (S01): ACCEPT');
    Carbon::setTestNow(Carbon::parse('2026-09-30 09:00:00'));
    activity('attendance')->performedOn($this->teacher)->causedBy($this->teacher)->withProperties([
        'event' => 'biometric_scan_session', 'attendance_id' => 500, 'lux' => null,
    ])->log('Presensi Guru Satu (S01): REJECT');

    [$withValues, $withoutValues] = combinedCsv($this, $this->admin);
    expect($withValues['Lux'])->toBe('384')
        ->and($withValues['Sumber Lux'])->toBe('Sumber tidak tercatat di log')
        ->and($withValues['Sumber Jarak'])->toBe('Sumber tidak tercatat di log')
        ->and($withoutValues['Lux'])->toBe('')
        ->and($withoutValues['Sumber Lux'])->toBe('Tidak terukur')
        ->and($withoutValues['Jarak Kamera (cm)'])->toBe('')
        ->and($withoutValues['Sumber Jarak'])->toBe('Tidak tercatat di log');
});

it('baris non-verifikasi tidak diberi label lux atau jarak', function () {
    AttendanceRecord::create([
        'user_id' => $this->teacher->id, 'status' => 'izin',
        'metadata' => ['source' => 'admin_teacher_edit'],
    ]);
    activity()->causedBy($this->teacher)->event('login_success')->log('User logged in successfully.');

    foreach (combinedCsv($this, $this->admin) as $row) {
        expect($row['Sumber Lux'])->toBe('')
            ->and($row['Sumber Jarak'])->toBe('');
    }
});

it('guru hanya mendapat catatan dan log miliknya sendiri', function () {
    $other = User::factory()->create(['name' => 'Guru Dua', 'role' => 'teacher', 'embedding_id' => 'S02']);
    Activity::query()->delete();
    AttendanceRecord::create(['user_id' => $this->teacher->id, 'status' => 'hadir', 'metadata' => []]);
    AttendanceRecord::create(['user_id' => $other->id, 'status' => 'hadir', 'metadata' => []]);
    activity()->causedBy($this->teacher)->log('login guru satu');
    activity()->causedBy($other)->log('login guru dua');
    activity()->performedOn($this->teacher)->causedBy($this->admin)->log('admin_set_status_izin');
    // Subjek model lain yang kebetulan ber-ID sama dengan guru bukan milik guru itu.
    Activity::create([
        'log_name' => 'model_settings', 'description' => 'pengaturan model diubah',
        'subject_type' => 'App\\Models\\ModelSetting', 'subject_id' => $this->teacher->id,
    ]);

    $rows = collect(combinedCsv($this, $this->teacher));
    expect($rows->where('Jenis', 'Presensi')->pluck('ID Subjek')->all())->toBe(['S01'])
        ->and($rows->where('Jenis', 'Aktivitas')->pluck('Keterangan')->sort()->values()->all())
        ->toBe(['admin_set_status_izin', 'login guru satu']);

    $all = collect(combinedCsv($this, $this->admin));
    expect($all->where('Jenis', 'Presensi'))->toHaveCount(2)
        ->and($all->where('Jenis', 'Aktivitas')->pluck('Keterangan')->sort()->values()->all())
        ->toBe(['admin_set_status_izin', 'login guru dua', 'login guru satu', 'pengaturan model diubah']);
});

it('mewajibkan login', function () {
    $this->get(route('attendance.export.all'))->assertRedirect(route('login'));
});
