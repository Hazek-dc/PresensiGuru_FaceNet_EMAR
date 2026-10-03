<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia;

/**
 * Foto profil guru dari halaman Edit: disimpan di disk privat, disajikan lewat
 * rute admin, dan tidak menyentuh galeri wajah verifikasi.
 */

beforeEach(function () {
    Storage::fake('local');
    $this->admin = User::factory()->create(['role' => 'admin', 'embedding_id' => 'ADM01']);
    $this->teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S13']);
});

function avatarUpload($test, UploadedFile $file)
{
    return $test->actingAs($test->admin)
        ->from(route('admin.teachers.edit', $test->teacher->id))
        ->post(route('admin.teachers.avatar.store', $test->teacher->id), ['avatar' => $file]);
}

it('mengunggah, mengganti, dan menghapus foto profil', function () {
    avatarUpload($this, UploadedFile::fake()->image('foto.jpg', 300, 300))
        ->assertRedirect(route('admin.teachers.edit', $this->teacher->id))
        ->assertSessionHasNoErrors();

    $first = $this->teacher->fresh()->avatar_path;
    expect($first)->toStartWith('avatars/');
    Storage::disk('local')->assertExists($first);

    avatarUpload($this, UploadedFile::fake()->image('baru.png', 200, 200))->assertSessionHasNoErrors();
    $second = $this->teacher->fresh()->avatar_path;
    expect($second)->not->toBe($first);
    Storage::disk('local')->assertMissing($first);
    Storage::disk('local')->assertExists($second);

    $this->actingAs($this->admin)->delete(route('admin.teachers.avatar.destroy', $this->teacher->id))->assertSessionHasNoErrors();
    expect($this->teacher->fresh()->avatar_path)->toBeNull();
    Storage::disk('local')->assertMissing($second);

    // Embedding wajah tidak berubah oleh foto profil.
    expect($this->teacher->fresh()->embedding_id)->toBe('S13');
});

it('menolak berkas yang bukan foto, terlalu besar, atau terlalu kecil', function () {
    avatarUpload($this, UploadedFile::fake()->create('dokumen.pdf', 100, 'application/pdf'))
        ->assertSessionHasErrors('avatar');
    avatarUpload($this, UploadedFile::fake()->image('besar.jpg', 400, 400)->size(3000))
        ->assertSessionHasErrors(['avatar' => 'Ukuran foto paling besar 2 MB.']);
    avatarUpload($this, UploadedFile::fake()->image('kecil.jpg', 40, 40))
        ->assertSessionHasErrors(['avatar' => 'Foto minimal 96 × 96 piksel.']);

    expect($this->teacher->fresh()->avatar_path)->toBeNull();
});

it('guru nonaktif tidak bisa diberi foto baru', function () {
    $this->teacher->delete();
    avatarUpload($this, UploadedFile::fake()->image('foto.jpg', 300, 300))->assertSessionHasErrors('avatar');
    expect(User::withTrashed()->find($this->teacher->id)->avatar_path)->toBeNull();
});

it('foto hanya disajikan untuk admin dan alamatnya dikirim ke halaman', function () {
    avatarUpload($this, UploadedFile::fake()->image('foto.jpg', 300, 300));
    $url = $this->teacher->fresh()->avatar_url;
    expect($url)->toContain('/admin/teachers/'.$this->teacher->id.'/avatar');

    $this->actingAs($this->admin)->get($url)->assertOk();
    $this->actingAs($this->teacher)->get($url)->assertForbidden();
    auth()->logout();
    $this->get($url)->assertRedirect();

    $this->actingAs($this->admin)->get(route('admin.teachers.edit', $this->teacher->id))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('teacher.avatar_url', $url)
            ->missing('teacher.avatar_path'));
});

it('guru tanpa foto tidak punya alamat foto', function () {
    expect($this->teacher->avatar_url)->toBeNull();
    $this->actingAs($this->admin)->get(route('admin.teachers.avatar', $this->teacher->id))->assertNotFound();
});
