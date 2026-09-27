<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Tes tidak boleh menyentuh data kiosk dan dataset riset yang sedang dipakai.
 * Dulu setiap run tes meninggalkan 750 lux dan 95 cm di storage/app, menulis
 * foto hitam ke dataset/foto_selfie, dan menimpa MANIFEST_QALWANI.csv sementara.
 */
class StorageSandboxTest extends TestCase
{
    use RefreshDatabase;

    private function realFingerprints(): array
    {
        $root = dirname(base_path());
        $files = [
            base_path('storage/app/lux_reading.json'),
            base_path('storage/app/distance_reading.json'),
            base_path('storage/app/biometrics_settings.json'),
            $root . '/dataset/self_qalwani/manifests/MANIFEST_QALWANI.csv',
        ];
        $prints = array_map(
            fn (string $p) => is_file($p) ? md5_file($p) . '@' . filemtime($p) : null,
            $files
        );
        $selfies = glob($root . '/dataset/foto_selfie/*') ?: [];
        $prints[] = md5(implode('|', array_map(fn ($p) => $p . '@' . filemtime($p), $selfies)));
        return $prints;
    }

    public function test_tes_tidak_menyentuh_storage_dan_dataset_asli(): void
    {
        $before = $this->realFingerprints();

        $this->assertStringStartsWith(sys_get_temp_dir(), storage_path('app'));
        $this->assertStringStartsWith(sys_get_temp_dir(), config('biometrics.project_root'));

        $this->postJson('/api/lux/update', ['lux' => 750, 'source' => 'script', 'device' => 'luxometer'])
            ->assertOk();
        $this->postJson('/api/distance/update', ['distance_cm' => 95, 'source' => 'script', 'device' => 'distance_sensor'])
            ->assertOk();

        $admin = User::factory()->create(['name' => 'Qalwani Anugerah', 'role' => 'admin']);
        Storage::fake('public');
        Http::fake(['*' => Http::response(['success' => true, 'embedding_id' => 'emb_UJI'], 200)]);
        $this->actingAs($admin)->post(route('teacher.enrollment.store'), [
            'frame' => UploadedFile::fake()->image('wajah.jpg', 640, 480),
        ]);
        $this->actingAs($admin)->delete('/admin/research-dataset/reset');

        $this->assertFileExists(storage_path('app/lux_reading.json'));
        $this->assertSame($before, $this->realFingerprints());
    }
}
