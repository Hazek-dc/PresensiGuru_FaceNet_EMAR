<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Kartu hasil presensi menampilkan "Jarak L2 x · batas ≤ y". Ambang harus
 * berasal dari pengaturan aktif server, bukan angka tetap di frontend.
 */
class EvaluationThresholdResponseTest extends TestCase
{
    use RefreshDatabase;

    private function submit(User $teacher): array
    {
        return $this->actingAs($teacher)
            ->post(route('api.presensi'), [
                'video' => UploadedFile::fake()->create('presensi.webm', 16, 'video/webm'),
                'subject_id' => 'S01',
                'sample_type' => 'BONA_FIDE',
                'session_type' => 'TEST',
                'ear_blinks' => 2,
                'mar_mouths' => 1,
                'face_pct' => 95.0,
                'scan_duration_s' => 8.0,
            ])
            ->assertOk()
            ->json();
    }

    protected function setUp(): void
    {
        parent::setUp();
        config(['biometrics.allow_simulated_scores' => false]);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response([
            'status' => 'success',
            'distance' => 0.37,
            'facenet_score' => 0.66,
            'emar_score' => 1.0,
            'request_id' => 'req-threshold-001',
        ], 200)]);
    }

    public function test_evaluation_memuat_ambang_facenet_bawaan(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S01', 'is_active' => true]);

        $data = $this->submit($teacher);

        $this->assertSame(0.37, $data['evaluation']['euclidean_distance']);
        $this->assertEquals(0.40, $data['evaluation']['facenet_threshold']);
        $this->assertSame('MATCH', $data['evaluation']['id_pred']);
    }

    public function test_evaluation_memuat_ambang_dari_pengaturan_model_aktif(): void
    {
        // storage_path sudah diarahkan TestCase ke folder sementara.
        file_put_contents(storage_path('app/biometrics_settings.json'), json_encode(['facenet_threshold' => 0.35]));
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S01', 'is_active' => true]);

        $data = $this->submit($teacher);

        $this->assertEquals(0.35, $data['evaluation']['facenet_threshold']);
        // 0,37 > 0,35: keputusan tetap mengikuti ambang yang sama yang dilaporkan.
        $this->assertSame('NON_MATCH', $data['evaluation']['id_pred']);
    }
}
