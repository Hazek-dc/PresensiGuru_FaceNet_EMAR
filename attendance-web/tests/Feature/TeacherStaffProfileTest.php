<?php

use App\Models\User;
use App\Services\StaffProfile;
use Inertia\Testing\AssertableInertia;

/**
 * Jabatan (guru / staff TU) dan bidang studi di halaman Tambah dan Edit & Status
 * guru. Data lama tidak diisi otomatis: yang belum diatur tetap kosong.
 */

beforeEach(function () {
    $this->admin = User::factory()->create(['role' => 'admin', 'embedding_id' => 'ADM01']);
});

function staffTeacher(array $attributes = []): User
{
    return User::factory()->create(array_merge(['role' => 'teacher', 'embedding_id' => null], $attributes));
}

function staffUpdate($test, User $teacher, array $payload)
{
    return $test->actingAs($test->admin)->put(
        route('admin.teachers.update', $teacher->id),
        array_merge(['name' => $teacher->name, 'email' => $teacher->email], $payload),
    );
}

it('menyimpan jabatan guru dengan bidang studi yang dirapikan', function () {
    $teacher = staffTeacher();

    staffUpdate($this, $teacher, [
        'position' => 'guru',
        'subjects' => ['matematika', '  Konsentrasi   Keahlian 1 ', 'Projek Kreatif & Kewirausahaan'],
    ])->assertRedirect(route('admin.teachers.index'))->assertSessionHasNoErrors();

    $teacher->refresh();
    // Ejaan mengikuti daftar sekolah (termasuk ejaan lain PKK) dan diurutkan seperti daftar.
    expect($teacher->position)->toBe('guru')
        ->and($teacher->subjects)->toBe(['Konsentrasi Keahlian 1', 'Matematika', 'Project Kreatif dan Kewirausahaan']);

    // Bidang studi di luar daftar tetap boleh, ditaruh di belakang.
    staffUpdate($this, $teacher, ['position' => 'guru', 'subjects' => ['Fisika Terapan', "qur'an tahfidz"]])->assertSessionHasNoErrors();
    expect($teacher->fresh()->subjects)->toBe(["Qur'an Tahfidz", 'Fisika Terapan']);
});

it('staff TU disimpan tanpa bidang studi', function () {
    $teacher = staffTeacher(['position' => 'guru', 'subjects' => ['Kimia']]);

    staffUpdate($this, $teacher, ['position' => 'staff_tu', 'subjects' => ['Kimia']])->assertSessionHasNoErrors();

    $teacher->refresh();
    expect($teacher->position)->toBe('staff_tu')->and($teacher->subjects)->toBeNull();
});

it('menolak jabatan dan bidang studi yang tidak valid', function () {
    $teacher = staffTeacher();

    staffUpdate($this, $teacher, ['position' => 'kepala_sekolah'])
        ->assertSessionHasErrors(['position' => 'Jabatan harus Guru atau Staff TU.']);

    staffUpdate($this, $teacher, ['position' => 'guru', 'subjects' => ['PJOK', 'PKL', 'BK', 'Sejarah']])
        ->assertSessionHasErrors(['subjects' => 'Guru paling banyak memilih 3 bidang studi.']);
    // Duplikat beda huruf besar tidak bisa dipakai untuk menyelipkan pilihan keempat.
    staffUpdate($this, $teacher, ['position' => 'guru', 'subjects' => ['PJOK', 'pjok', 'BK']])
        ->assertSessionHasErrors('subjects.1');

    staffUpdate($this, $teacher, ['position' => 'guru', 'subjects' => [str_repeat('a', 61)]])
        ->assertSessionHasErrors('subjects.0');

    expect($teacher->fresh()->position)->toBeNull();
});

it('guru boleh memilih 1, 2, atau 3 bidang studi, atau mengosongkannya dulu', function () {
    $teacher = staffTeacher();
    foreach ([['BK'], ['BK', 'PKL'], ['BK', 'PJOK', 'PKL'], []] as $subjects) {
        staffUpdate($this, $teacher, ['position' => 'guru', 'subjects' => $subjects])->assertSessionHasNoErrors();
        expect($teacher->fresh()->subjects)->toBe($subjects ?: null);
    }
});

it('form lama yang tidak mengirim jabatan tidak menghapus jabatan tersimpan', function () {
    $teacher = staffTeacher(['position' => 'guru', 'subjects' => ['Kimia']]);

    staffUpdate($this, $teacher, ['name' => 'Nama Baru'])->assertSessionHasNoErrors();

    $teacher->refresh();
    expect($teacher->name)->toBe('Nama Baru')
        ->and($teacher->position)->toBe('guru')
        ->and($teacher->subjects)->toBe(['Kimia']);
});

it('guru baru bisa langsung diberi jabatan dan bidang studi', function () {
    $this->actingAs($this->admin)->post(route('admin.teachers.store'), [
        'name' => 'Guru Baru',
        'email' => 'guru.baru@sekolah.test',
        'password' => 'rahasia123',
        'password_confirmation' => 'rahasia123',
        'position' => 'guru',
        'subjects' => ['PJOK', 'PAIBK'],
    ])->assertRedirect(route('admin.teachers.index'))->assertSessionHasNoErrors();

    $created = User::where('email', 'guru.baru@sekolah.test')->sole();
    expect($created->role)->toBe('teacher')
        ->and($created->position)->toBe('guru')
        ->and($created->subjects)->toBe(['PAIBK', 'PJOK']);
});

it('daftar bidang studi urut abjad, tanpa duplikat, dan memecah Konsentrasi Keahlian 1,2', function () {
    $options = StaffProfile::SUBJECT_OPTIONS;
    $sorted = $options;
    usort($sorted, 'strcasecmp');

    expect($options)->toBe($sorted)
        ->and(array_unique(array_map('mb_strtolower', $options)))->toHaveCount(count($options))
        ->and($options)->toContain('Konsentrasi Keahlian 1', 'Konsentrasi Keahlian 2', "Qur'an Tahfidz")
        ->and($options)->not->toContain('Konsentrasi Keahlian 1,2', 'Projek Kreatif & Kewirausahaan');
});

it('halaman tambah dan edit menerima daftar bidang studi sekolah', function () {
    $teacher = staffTeacher(['position' => 'staff_tu']);

    $this->actingAs($this->admin)->get(route('admin.teachers.edit', $teacher->id))->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Admin/Teachers/Edit')
            ->where('teacher.position', 'staff_tu')
            ->where('subject_options', StaffProfile::SUBJECT_OPTIONS)
            ->where('max_subjects', StaffProfile::MAX_SUBJECTS));

    $this->actingAs($this->admin)->get(route('admin.teachers.create'))->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Admin/Teachers/Create')
            ->has('subject_options', count(StaffProfile::SUBJECT_OPTIONS)));
});

it('daftar guru bisa dicari menurut bidang studi dan disaring menurut jabatan', function () {
    staffTeacher(['name' => 'Ani Produktif', 'position' => 'guru', 'subjects' => ['Produktif']]);
    staffTeacher(['name' => 'Budi Kimia', 'position' => 'guru', 'subjects' => ['Kimia']]);
    staffTeacher(['name' => 'Citra TU', 'position' => 'staff_tu']);
    staffTeacher(['name' => 'Dedi Kosong']);
    staffTeacher(['name' => 'Eka Nonaktif', 'position' => 'guru'])->delete();

    $names = fn (array $query) => collect(
        $this->actingAs($this->admin)->get(route('admin.teachers.index', $query))->viewData('page')['props']['teachers']['data']
    )->pluck('name')->all();

    expect($names(['search' => 'PRODUKTIF']))->toBe(['Ani Produktif'])
        ->and($names(['status' => 'guru']))->toBe(['Ani Produktif', 'Budi Kimia'])
        ->and($names(['status' => 'staff_tu']))->toBe(['Citra TU'])
        ->and($names(['status' => 'no_position']))->toBe(['Dedi Kosong']);

    $this->actingAs($this->admin)->get(route('admin.teachers.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('counts.guru', 2)
            ->where('counts.staff_tu', 1)
            ->where('counts.no_position', 1)
            ->where('teachers.data.0.subjects', ['Produktif']));
});
