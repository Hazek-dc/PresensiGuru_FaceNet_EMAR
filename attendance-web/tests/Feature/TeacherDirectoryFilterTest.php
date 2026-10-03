<?php

use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia;

/**
 * Pencarian dan filter di /admin/teachers: pencarian langsung tidak peka huruf
 * besar, jumlah di chip mengikuti kata pencarian, dan parameter yang tidak
 * dikenal jatuh ke nilai bawaan.
 */

beforeEach(function () {
    $this->admin = User::factory()->create(['role' => 'admin', 'embedding_id' => 'ADM01']);
});

function directoryTeacher(string $name, array $attributes = []): User
{
    return User::factory()->create(array_merge(['role' => 'teacher', 'name' => $name, 'embedding_id' => null], $attributes));
}

function directoryRecord(User $teacher, string $status, string $time): AttendanceRecord
{
    return AttendanceRecord::create([
        'user_id' => $teacher->id,
        'status' => $status,
        'decision_reason' => 'Uji direktori guru',
        'is_test_data' => true,
        'created_at' => Carbon::today('Asia/Pontianak')->setTimeFromTimeString($time),
    ]);
}

function directoryNames($response): array
{
    return collect($response->viewData('page')['props']['teachers']['data'])->pluck('name')->all();
}

it('mencari nama, email, dan ID wajah tanpa peka huruf besar', function () {
    directoryTeacher('Sinta Yulisma', ['email' => 'sy@sekolah.test', 'embedding_id' => 'S13']);
    directoryTeacher('Maulidia', ['email' => 'maulidia@sekolah.test', 'embedding_id' => 'S10']);

    $get = fn (string $q) => $this->actingAs($this->admin)->get(route('admin.teachers.index', ['search' => $q]))->assertOk();

    expect(directoryNames($get('sINTA')))->toBe(['Sinta Yulisma'])
        ->and(directoryNames($get('MAULIDIA@')))->toBe(['Maulidia'])
        ->and(directoryNames($get('s13')))->toBe(['Sinta Yulisma'])
        ->and(directoryNames($get('  sinta  ')))->toBe(['Sinta Yulisma']);

    // % dan _ dicari sebagai huruf, bukan wildcard SQL.
    expect(directoryNames($get('%')))->toBe([])
        ->and(directoryNames($get('_')))->toBe([]);

    $get('sinta')->assertInertia(fn (AssertableInertia $page) => $page
        ->component('Admin/Teachers/Index')
        ->where('filters.search', 'sinta')
        ->where('counts.all', 1));
});

it('memfilter status hari ini, biometrik, dan akun dengan jumlah per chip', function () {
    $hadir = directoryTeacher('Andi Hadir', ['embedding_id' => 'S01']);
    $izin = directoryTeacher('Bela Izin');
    $sakit = directoryTeacher('Citra Sakit', ['embedding_id' => 'S03']);
    directoryTeacher('Dodi Kosong', ['embedding_id' => 'S04']);
    directoryTeacher('Eka Nonaktif', ['embedding_id' => null])->delete();

    directoryRecord($hadir, 'hadir', '07:10');
    directoryRecord($hadir, 'pulang', '15:00');
    directoryRecord($izin, 'izin', '07:30');
    directoryRecord($sakit, 'sakit', '07:45');

    $this->actingAs($this->admin)->get(route('admin.teachers.index'))->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('counts', [
                'all' => 5, 'hadir' => 1, 'izin' => 1, 'sakit' => 1,
                'enrolled' => 3, 'not_enrolled' => 1,
                'guru' => 0, 'staff_tu' => 0, 'no_position' => 4, 'disabled' => 1,
            ])
            ->where('teachers.total', 5));

    $response = $this->actingAs($this->admin)->get(route('admin.teachers.index', ['status' => 'hadir']))->assertOk();
    expect(directoryNames($response))->toBe(['Andi Hadir']);
    $response->assertInertia(fn (AssertableInertia $page) => $page
        ->where('teachers.data.0.today_status', 'pulang')
        ->where('teachers.data.0.today_time', '15:00'));

    // Alias lama 'present' tetap berlaku dan dinormalkan.
    $this->actingAs($this->admin)->get(route('admin.teachers.index', ['status' => 'present']))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('filters.status', 'hadir')->where('teachers.total', 1));

    foreach (['izin' => ['Bela Izin'], 'sakit' => ['Citra Sakit'], 'not_enrolled' => ['Bela Izin'], 'disabled' => ['Eka Nonaktif']] as $status => $names) {
        expect(directoryNames($this->actingAs($this->admin)->get(route('admin.teachers.index', ['status' => $status]))))->toBe($names);
    }

    $this->actingAs($this->admin)->get(route('admin.teachers.index', ['status' => 'tidak-ada']))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('filters.status', '')->where('teachers.total', 5));

    // Jumlah chip ikut pencarian: dengan "andi" hanya Andi yang terhitung.
    $this->actingAs($this->admin)->get(route('admin.teachers.index', ['search' => 'andi']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('counts.all', 1)->where('counts.hadir', 1)->where('counts.izin', 0)->where('counts.disabled', 0));
});

it('mengurutkan tanpa peka huruf besar dan membatasi jumlah per halaman', function () {
    directoryTeacher('budi', ['created_at' => now()->subDays(3)]);
    directoryTeacher('Ani', ['created_at' => now()->subDays(1)]);
    directoryTeacher('Citra', ['created_at' => now()->subDays(2)]);

    $names = fn (array $query) => directoryNames($this->actingAs($this->admin)->get(route('admin.teachers.index', $query)));

    expect($names([]))->toBe(['Ani', 'budi', 'Citra'])
        ->and($names(['sort' => 'name_desc']))->toBe(['Citra', 'budi', 'Ani'])
        ->and($names(['sort' => 'newest']))->toBe(['Ani', 'Citra', 'budi'])
        ->and($names(['sort' => 'oldest']))->toBe(['budi', 'Citra', 'Ani'])
        ->and($names(['sort' => 'acak']))->toBe(['Ani', 'budi', 'Citra']);

    $this->actingAs($this->admin)->get(route('admin.teachers.index', ['per_page' => 1000]))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('filters.per_page', 9)->where('teachers.per_page', 9));
    $this->actingAs($this->admin)->get(route('admin.teachers.index', ['per_page' => 18]))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('filters.per_page', 18)->where('filters.sort', 'name'));
});

it('muat ulang parsial dari pencarian langsung tidak mengirim ulang statistik', function () {
    directoryTeacher('Sinta Yulisma', ['embedding_id' => 'S13']);
    $version = $this->actingAs($this->admin)->get(route('admin.teachers.index'))->viewData('page')['version'];

    $this->actingAs($this->admin)
        ->withHeaders([
            'X-Inertia' => 'true',
            'X-Inertia-Version' => (string) $version,
            'X-Inertia-Partial-Component' => 'Admin/Teachers/Index',
            'X-Inertia-Partial-Data' => 'teachers,counts,filters',
        ])
        ->get(route('admin.teachers.index', ['search' => 'sin']))
        ->assertOk()
        ->assertJsonPath('props.filters.search', 'sin')
        ->assertJsonPath('props.counts.all', 1)
        ->assertJsonMissingPath('props.stats');
});
