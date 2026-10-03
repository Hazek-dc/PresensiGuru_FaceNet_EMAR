<?php

use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Mesin /enroll selalu membalas alias berawalan emb_ (S13 -> emb_S13).
 * Pendaftaran ulang lewat /admin/enroll mengganti ID Maulidia dari S10 menjadi
 * emb_S10 (activity #481, 29 Sep 12:12), sehingga presensinya terpecah di dua
 * ID dan analisis per subjek membacanya sebagai dua partisipan. ID yang sudah
 * ada harus dipertahankan, sama seperti ManualEnrollmentController.
 */
beforeEach(function () {
    Storage::fake('public');
    Http::preventStrayRequests();
});

function engineEnrollOk(string $embeddingId): void
{
    Http::fake(['*/enroll' => Http::response([
        'success' => true, 'message' => 'ok', 'embedding_id' => $embeddingId, 'subject_id' => $embeddingId,
    ])]);
}

it('pendaftaran admin mempertahankan ID dataset S13', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $sinta = User::factory()->create(['role' => 'teacher', 'name' => 'Sinta Yulisma, S.Pd', 'embedding_id' => 'S13']);
    engineEnrollOk('emb_S13');

    $this->actingAs($admin)->from(route('admin.enroll'))->post(route('admin.enroll.store'), [
        'teacher_id' => $sinta->id,
        'frame' => UploadedFile::fake()->image('wajah.jpg', 640, 480),
    ])->assertSessionHasNoErrors()->assertSessionHas('success');

    expect($sinta->fresh()->embedding_id)->toBe('S13');
    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/enroll')
        && collect($r->data())->contains(fn ($part) => ($part['name'] ?? null) === 'subject_id' && ($part['contents'] ?? null) === 'S13'));
});

it('pendaftaran admin untuk guru baru tetap memakai ID dari mesin', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $baru = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
    engineEnrollOk('emb_' . $baru->id);

    $this->actingAs($admin)->from(route('admin.enroll'))->post(route('admin.enroll.store'), [
        'teacher_id' => $baru->id,
        'frame' => UploadedFile::fake()->image('wajah.jpg', 640, 480),
    ])->assertSessionHasNoErrors();

    expect($baru->fresh()->embedding_id)->toBe('emb_' . $baru->id);
});

it('pendaftaran mandiri guru mempertahankan ID dataset S13', function () {
    $sinta = User::factory()->create(['role' => 'teacher', 'name' => 'Sinta Yulisma, S.Pd', 'embedding_id' => 'S13']);
    engineEnrollOk('emb_S13');

    $this->actingAs($sinta)->from(route('teacher.enrollment'))->post(route('teacher.enrollment.store'), [
        'frame' => UploadedFile::fake()->image('wajah.jpg', 640, 480),
    ])->assertSessionHasNoErrors()->assertSessionHas('success');

    expect($sinta->fresh()->embedding_id)->toBe('S13');
});
