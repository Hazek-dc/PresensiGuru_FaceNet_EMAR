<?php

use App\Models\AttendanceRecord;
use App\Models\EvaluationMatrix;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Spatie\Activitylog\Models\Activity;

/**
 * Dashboard dimuat tanpa memanggil mesin biometrik dan tanpa data yang tidak
 * ditampilkan; angka-angkanya tetap sama dengan perhitungan sebelumnya.
 */

beforeEach(function () {
    Http::preventStrayRequests();
    $this->admin = User::factory()->create(['role' => 'admin', 'embedding_id' => 'ADM01']);
});

function dashboardRecord(User $teacher, string $status, ?Carbon $at = null): AttendanceRecord
{
    return AttendanceRecord::create([
        'user_id' => $teacher->id,
        'status' => $status,
        'decision_reason' => 'Uji dasbor',
        'is_test_data' => true,
        'created_at' => $at ?? Carbon::now(config('app.timezone')),
    ]);
}

function dashboardMatrix(?int $distance, string $decision = 'ACCEPT'): EvaluationMatrix
{
    return EvaluationMatrix::create([
        'subject_id' => 'S01',
        'claimed_subject_id' => 'S01',
        'distance_cm' => $distance,
        'final_decision' => $decision,
    ]);
}

function dashboardPartial($test, User $user, string $props)
{
    $version = $test->actingAs($user)->get('/dashboard')->viewData('page')['version'];

    return $test->actingAs($user)->withHeaders([
        'X-Inertia' => 'true',
        'X-Inertia-Version' => (string) $version,
        'X-Inertia-Partial-Component' => 'Dashboard',
        'X-Inertia-Partial-Data' => $props,
    ])->get('/dashboard')->assertOk();
}

it('memuat dasbor tanpa memanggil mesin dan tanpa data yang tidak ditampilkan', function () {
    Http::fake();
    $teacher = User::factory()->create(['role' => 'teacher', 'name' => 'Guru Satu', 'embedding_id' => 'S01']);
    activity('attendance')->withProperties(['event' => 'attendance', 'besar' => str_repeat('x', 500)])->log('Presensi wajah diterima');

    $this->actingAs($this->admin)->get('/dashboard')->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Dashboard')
            ->missing('latest_evaluations')
            ->missing('clear_all_summary')
            ->where('subjects_list.0', ['id' => $teacher->id, 'name' => 'Guru Satu', 'embedding_id' => 'S01'])
            ->where('recent_activities', function ($activities) {
                $activities = collect($activities);
                // Event tetap dibaca dari properties di server, tetapi properties tidak dikirim.
                return $activities->firstWhere('description', 'Presensi wajah diterima')['event'] === 'attendance'
                    && $activities->every(fn ($a) => ! array_key_exists('properties', $a));
            }));

    Http::assertNothingSent();
});

it('statistik hari ini dan benchmark jarak sama dengan perhitungan per status', function () {
    $teachers = User::factory()->count(5)->create(['role' => 'teacher']);
    dashboardRecord($teachers[0], 'hadir');
    dashboardRecord($teachers[1], 'success');
    dashboardRecord($teachers[2], 'terlambat');
    dashboardRecord($teachers[3], 'izin');
    dashboardRecord($teachers[3], 'failed');
    dashboardRecord($teachers[4], 'hadir', Carbon::now(config('app.timezone'))->subDays(2));

    foreach ([30, 35, 40] as $cm) {
        dashboardMatrix($cm);
    }
    dashboardMatrix(38, 'REJECT');
    dashboardMatrix(45);
    dashboardMatrix(55, 'REJECT');
    dashboardMatrix(70);
    dashboardMatrix(42);
    dashboardMatrix(null);

    $this->actingAs($this->admin)->get('/dashboard')->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('stats.present', 2)
            ->where('stats.late', 1)
            ->where('stats.izin', 1)
            ->where('stats.failed', 1)
            ->where('stats.total_teachers', 5)
            // Hadir/terlambat/izin hari ini: guru 0-3; guru 4 hanya hadir dua hari lalu.
            ->where('stats.absent', 1)
            ->where('distance_stats.d30', ['target_cm' => 30, 'label' => '30 cm (Dekat)', 'total' => 4, 'accept' => 3])
            ->where('distance_stats.d45', ['target_cm' => 45, 'label' => '45 cm (Ideal)', 'total' => 2, 'accept' => 1])
            ->where('distance_stats.d60', ['target_cm' => 60, 'label' => '60 cm (Jauh)', 'total' => 1, 'accept' => 1]));
});

it('ringkasan Hapus Semua sama dengan yang benar-benar dihapus (admin)', function () {
    $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S01']);
    dashboardRecord($teacher, 'hadir');
    dashboardRecord($teacher, 'terlambat', Carbon::now(config('app.timezone'))->subDays(5));
    dashboardRecord($this->admin, 'hadir');
    dashboardMatrix(30);
    dashboardMatrix(45);
    activity('attendance')->log('Presensi wajah diterima');
    activity()->log('Admin mengubah pengaturan model');

    $summary = dashboardPartial($this, $this->admin, 'clear_all_summary')->json('props.clear_all_summary');
    $activitiesBefore = Activity::count();
    expect($summary)->toBe(['attendance' => 3, 'evaluations' => 2, 'activities' => 1]);

    $result = $this->actingAs($this->admin)->deleteJson('/dashboard/activities/clear-all')->assertOk()->json();
    expect($result['deleted_attendance'])->toBe($summary['attendance'])
        ->and($result['deleted_evaluations'])->toBe($summary['evaluations'])
        ->and(AttendanceRecord::count())->toBe(0)
        ->and(EvaluationMatrix::count())->toBe(0)
        // Satu log presensi terhapus, lalu satu log pembersihan ditambahkan.
        ->and(Activity::count())->toBe($activitiesBefore - $summary['activities'] + 1);
});

it('ringkasan Hapus Semua untuk guru hanya presensinya sendiri', function () {
    $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S01']);
    $other = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S02']);
    dashboardRecord($teacher, 'hadir');
    dashboardRecord($other, 'hadir');
    dashboardMatrix(30);
    activity('attendance')->log('Presensi wajah diterima');

    $summary = dashboardPartial($this, $teacher, 'clear_all_summary')->json('props.clear_all_summary');
    expect($summary)->toBe(['attendance' => 1, 'evaluations' => 0, 'activities' => 0]);

    $result = $this->actingAs($teacher)->deleteJson('/dashboard/activities/clear-all')->assertOk()->json();
    expect($result['deleted_attendance'])->toBe(1)
        ->and(AttendanceRecord::where('user_id', $other->id)->count())->toBe(1)
        ->and(EvaluationMatrix::count())->toBe(1);
});
