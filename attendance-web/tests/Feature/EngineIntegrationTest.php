<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Integrasi Laravel -> mesin biometrik Python yang sedang berjalan.
 *
 * Dilewati otomatis bila mesin (BIOMETRIC_API_URL, default 127.0.0.1:5000)
 * tidak menjawab /health. Memakai basis data in-memory dan folder sementara
 * dari TestCase, jadi tidak menyentuh data presensi maupun dataset riset.
 */
class EngineIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private string $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');

        // Mesin Flask menjawab /health; biometric-api (FastAPI) menjawab /.
        $alive = false;
        foreach (['/health', '/'] as $probe) {
            try {
                if (Http::timeout(3)->get($this->engine . $probe)->successful()) {
                    $alive = true;
                    break;
                }
            } catch (\Throwable $e) {
                // coba titik berikutnya
            }
        }
        if (!$alive) {
            $this->markTestSkipped('Mesin biometrik tidak berjalan di ' . $this->engine);
        }
        config(['biometrics.allow_simulated_scores' => false]);
    }

    /**
     * Video 3 detik dari foto enrolment: wajah jelas, tanpa kedip/gerak mulut.
     */
    private function selfieVideo(string $pattern): UploadedFile
    {
        $photo = glob(base_path('../dataset/foto_selfie/' . $pattern))[0] ?? null;
        if ($photo === null) {
            $this->markTestSkipped("Foto enrolment {$pattern} tidak ditemukan");
        }
        $video = $this->researchSandbox . DIRECTORY_SEPARATOR . 'wajah.avi';
        $python = base_path('../.venv/Scripts/python.exe');
        $script = 'import cv2,sys; i=cv2.imread(sys.argv[1]); h,w=i.shape[:2]; s=640/max(h,w); '
            . 'i=cv2.resize(i,(int(w*s),int(h*s))); '
            . 'v=cv2.VideoWriter(sys.argv[2],cv2.VideoWriter_fourcc(*map(chr,(77,74,80,71))),10.0,(i.shape[1],i.shape[0])); '
            . '[v.write(i) for _ in range(30)]; v.release()';
        exec(escapeshellarg($python) . ' -c ' . escapeshellarg($script) . ' '
            . escapeshellarg($photo) . ' ' . escapeshellarg($video), $out, $code);
        if ($code !== 0 || !is_file($video)) {
            $this->markTestSkipped('Tidak dapat membuat video uji');
        }
        return new UploadedFile($video, 'wajah.avi', 'video/x-msvideo', null, true);
    }

    public function test_jalur_penuh_memakai_jarak_dari_mesin(): void
    {
        $teacher = User::factory()->create([
            'role' => 'teacher', 'embedding_id' => 'S07', 'is_active' => true,
        ]);

        $data = $this->actingAs($teacher)
            ->post(route('api.presensi'), [
                'subject_id' => 'S07',
                'sample_type' => 'BONA_FIDE',
                'session_type' => 'TEST',
                'ear_blinks' => 0,
                'mar_mouths' => 0,
                'face_pct' => 95,
                'distance_cm' => 45,
                'lux_value' => 250,
                'video' => $this->selfieVideo('*Reynaldi*'),
            ])
            ->assertOk()
            ->json();

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertSame('engine', $meta['biometric_source']);
        $this->assertNotNull($data['evaluation']['euclidean_distance']);
        $this->assertLessThanOrEqual(0.40, $data['evaluation']['euclidean_distance']);
        $this->assertSame('MATCH', $data['id_pred']);
        // Foto diam tanpa kedip/gerak mulut: liveness gagal, presensi ditolak.
        $this->assertSame('REJECT', $data['final_decision']);
    }

    public function test_klaim_identitas_orang_lain_ditolak_mesin(): void
    {
        $teacher = User::factory()->create([
            'role' => 'teacher', 'embedding_id' => 'S03', 'is_active' => true,
        ]);

        $data = $this->actingAs($teacher)
            ->post(route('api.presensi'), [
                'subject_id' => 'S03',
                'session_type' => 'TEST',
                'ear_blinks' => 1,
                'mar_mouths' => 1,
                'video' => $this->selfieVideo('*Reynaldi*'),
            ])
            ->assertOk()
            ->json();

        $this->assertSame('NON_MATCH', $data['id_pred']);
        $this->assertGreaterThan(0.40, $data['evaluation']['euclidean_distance']);
        $this->assertSame('REJECT', $data['final_decision']);
    }
}
