<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Pendaftaran wajah mandiri hanya boleh dilaporkan berhasil bila mesin
 * biometrik benar-benar menyimpan template. Dulu mesin mati atau wajah tak
 * terdeteksi tetap dilaporkan berhasil, sehingga pengguna mengira sudah
 * mendaftar ulang padahal template lama yang dipakai.
 */
class TeacherEnrollmentIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->user = User::factory()->create([
            'name' => 'Qalwani Anugerah',
            'role' => 'admin',
            'embedding_id' => 'emb_TEST-QALWANI-001',
        ]);
    }

    private function enroll()
    {
        return $this->actingAs($this->user)
            ->from(route('teacher.enrollment'))
            ->post(route('teacher.enrollment.store'), [
                'frame' => UploadedFile::fake()->image('wajah.jpg', 640, 480),
            ]);
    }

    public function test_wajah_tidak_terdeteksi_dilaporkan_gagal(): void
    {
        Http::fake(['*' => Http::response([
            'success' => false, 'message' => 'Embedding tidak cukup (0/5)',
        ], 200)]);

        $this->enroll()->assertRedirect()->assertSessionHasErrors('frame');
        $this->assertSame('emb_TEST-QALWANI-001', $this->user->fresh()->embedding_id);
    }

    public function test_mesin_mati_dilaporkan_gagal(): void
    {
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('refused'));

        $this->enroll()->assertRedirect()->assertSessionHasErrors('frame');
    }

    public function test_mesin_error_dilaporkan_gagal(): void
    {
        Http::fake(['*' => Http::response(['detail' => 'Gagal memproses enrollment'], 500)]);

        $this->enroll()->assertRedirect()->assertSessionHasErrors('frame');
    }

    public function test_berhasil_bila_mesin_menyimpan_template(): void
    {
        Http::fake(['*' => Http::response([
            'success' => true, 'message' => 'ok',
            'embedding_id' => 'emb_TEST-QALWANI-001', 'subject_id' => 'emb_TEST-QALWANI-001',
        ], 200)]);

        $this->enroll()->assertRedirect()->assertSessionHasNoErrors()->assertSessionHas('success');
        $this->assertSame('emb_TEST-QALWANI-001', $this->user->fresh()->embedding_id);
    }

    public function test_foto_enrollment_tes_tidak_masuk_dataset_asli(): void
    {
        // Dulu tes ini menulis foto hitam "1 - Qalwani Anugerah.jpg" ke dataset/foto_selfie asli.
        $selfies = config('biometrics.project_root') . '/dataset/foto_selfie';
        mkdir($selfies, 0777, true);
        Http::fake(['*' => Http::response(['success' => true, 'embedding_id' => 'emb_TEST-QALWANI-001'], 200)]);

        $this->enroll()->assertSessionHasNoErrors();

        $this->assertStringStartsWith(sys_get_temp_dir(), $selfies);
        $this->assertFileExists($selfies . DIRECTORY_SEPARATOR . $this->user->id . ' - Qalwani Anugerah.jpg');
    }
}
