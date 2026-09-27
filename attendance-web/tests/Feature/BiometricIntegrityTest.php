<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\EvaluationMatrix;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Integritas skor biometrik pada /api/presensi.
 *
 * Dulu, bila mesin biometrik gagal atau tidak ada video, controller mengarang
 * skor dari label kebenaran (bona fide -> jarak 0,28, serangan -> 0,68).
 * Prediksi jadi ditentukan oleh jawabannya sendiri. Tes di sini mengunci
 * perilaku baru: tanpa hasil mesin, skor null dan presentasi ditolak.
 */
class BiometricIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create([
            'name' => 'Guru Uji',
            'email' => 'guru.uji@smkalmadani.sch.id',
            'role' => 'teacher',
            'embedding_id' => 'S01',
            'is_active' => true,
        ]);
    }

    private function payload(array $extra = []): array
    {
        return array_merge([
            'subject_id' => 'S01',
            'sample_type' => 'BONA_FIDE',
            'session_type' => 'TEST',
            'ear_blinks' => 2,
            'mar_mouths' => 1,
            'face_pct' => 95.0,
            'scan_duration_s' => 8.0,
            'distance_cm' => 45,
            'lux_value' => 250,
        ], $extra);
    }

    private function video(): UploadedFile
    {
        return UploadedFile::fake()->create('presensi.webm', 16, 'video/webm');
    }

    private function researchRows(string $key): int
    {
        $path = config("biometrics.research_csv.{$key}");
        return is_file($path) ? count(file($path, FILE_SKIP_EMPTY_LINES)) : 0;
    }

    public function test_tanpa_video_ditolak_tanpa_skor_karangan(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);

        $data = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), $this->payload())
            ->assertOk()
            ->json();

        $this->assertSame('REJECT', $data['final_decision']);
        $this->assertSame('UNAVAILABLE', $data['id_pred']);
        $this->assertNull($data['evaluation']['euclidean_distance']);
        $this->assertNull($data['evaluation']['facenet_score']);
        $this->assertNull($data['evaluation']['emar_score']);
        $this->assertStringContainsString('tidak ada rekaman video', $data['message']);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertSame('unavailable', $meta['biometric_source']);
        $this->assertNull($meta['euclidean_distance']);
        $this->assertFalse($meta['evaluation_bab5']['evaluated']);
        $this->assertNull($meta['evaluation_bab5']['s1_decision']);
    }

    public function test_label_kebenaran_tidak_menentukan_skor_saat_mesin_gagal(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        Http::fake(['*' => Http::response(['error' => 'down'], 500)]);

        $results = [];
        foreach (['BONA_FIDE', 'ATTACK'] as $label) {
            $results[$label] = $this->actingAs($this->teacher)
                ->post(route('api.presensi'), $this->payload([
                    'sample_type' => $label,
                    'video' => $this->video(),
                ]))
                ->assertOk()
                ->json();
        }

        foreach ($results as $label => $data) {
            $this->assertSame('REJECT', $data['final_decision'], $label);
            $this->assertNull($data['evaluation']['euclidean_distance'], $label);
            $this->assertStringContainsString('HTTP 500', $data['message'], $label);
        }
    }

    public function test_mesin_tidak_dapat_dihubungi_ditolak(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('refused'));

        $data = $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk()
            ->json();

        $this->assertSame('REJECT', $data['final_decision']);
        $this->assertNull($data['evaluation']['euclidean_distance']);
        $this->assertStringContainsString('tidak dapat dihubungi', $data['message']);
    }

    public function test_jarak_tidak_ditaksir_dari_skor_kemiripan(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        // Respons lama tanpa "distance": dulu jarak ditaksir 1 - facenet_score.
        Http::fake(['*' => Http::response(['status' => 'success', 'facenet_score' => 0.95, 'emar_score' => 1.0], 200)]);

        $data = $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk()
            ->json();

        $this->assertSame('REJECT', $data['final_decision']);
        $this->assertNull($data['evaluation']['euclidean_distance']);
        $this->assertStringContainsString('tidak memuat jarak Euclidean', $data['message']);
    }

    public function test_skor_dari_klien_diabaikan_di_produksi(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);

        $data = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), $this->payload(['euclidean_distance' => 0.05]))
            ->assertOk()
            ->json();

        $this->assertSame('REJECT', $data['final_decision']);
        $this->assertNull($data['evaluation']['euclidean_distance']);
    }

    public function test_hasil_mesin_dipakai_dan_masuk_dataset_riset(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        Http::fake(['*' => Http::response([
            'status' => 'success',
            'distance' => 0.31,
            'facenet_score' => 0.74,
            'emar_score' => 1.0,
            'request_id' => 'req-mesin-001',
        ], 200)]);

        $data = $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk()
            ->json();

        $this->assertSame('ACCEPT', $data['final_decision']);
        $this->assertSame('MATCH', $data['id_pred']);
        $this->assertEqualsWithDelta(0.31, $data['evaluation']['euclidean_distance'], 1e-9);

        $matrix = EvaluationMatrix::latest('id')->first();
        $this->assertEqualsWithDelta(0.31, $matrix->euclidean_distance, 1e-6);
        $this->assertSame('engine', $matrix->raw_metadata['biometric_source']);

        // Header + satu baris, di folder sementara tes, bukan dataset asli.
        $this->assertSame(2, $this->researchRows('matriks'));
        $this->assertSame(2, $this->researchRows('bab5'));
        $this->assertStringStartsWith(sys_get_temp_dir(), config('biometrics.research_csv.bab5'));
    }

    public function test_jarak_mesin_di_atas_ambang_ditolak(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.41, 'emar_score' => 1.0], 200)]);

        $data = $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk()
            ->json();

        $this->assertSame('REJECT', $data['final_decision']);
        $this->assertSame('NON_MATCH', $data['id_pred']);
    }

    public function test_batas_waktu_mesin_cukup_untuk_video_1080p(): void
    {
        // Video 1080p 8 s butuh ~15-24 s di mesin; batas 30 s membuat presensi
        // gagal UNAVAILABLE (cURL error 28) saat komputer sedang sibuk.
        config(['biometrics.allow_simulated_scores' => false]);
        $timeouts = [];
        Http::fake(function ($request, array $options) use (&$timeouts) {
            $timeouts[] = $options['timeout'] ?? null;
            return Http::response(['status' => 'success', 'distance' => 0.30, 'emar_score' => 1.0], 200);
        });

        $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk();

        $this->assertSame([90], $timeouts);
        $this->assertSame(90, config('biometrics.verify_timeout'));
    }

    public function test_presentasi_simulasi_tidak_pernah_masuk_dataset_riset(): void
    {
        config(['biometrics.allow_simulated_scores' => true]);

        $data = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), $this->payload(['euclidean_distance' => 0.20]))
            ->assertOk()
            ->json();

        $this->assertSame('ACCEPT', $data['final_decision']);
        $this->assertSame(0, $this->researchRows('matriks'));
        $this->assertSame(0, $this->researchRows('bab5'));
        $this->assertSame(
            'simulated',
            AttendanceRecord::latest('id')->first()->metadata['biometric_source']
        );
    }

    public function test_fta_dari_mesin_tidak_dicatat_sebagai_pengukuran(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        Http::fake(['*' => Http::response([
            'status' => 'failed', 'distance' => null, 'euclidean_distance' => null,
            'fta' => true, 'fta_reason' => 'FACE_NOT_DETECTED', 'emar_score' => 0.0,
        ], 200)]);

        $data = $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk()
            ->json();

        $this->assertSame('REJECT', $data['final_decision']);
        $this->assertSame('UNAVAILABLE', $data['id_pred']);
        $this->assertNull($data['evaluation']['euclidean_distance']);
        $this->assertNull($data['evaluation']['p_face']);
        $this->assertStringContainsString('FTA', $data['message']);
        $this->assertSame('fta', AttendanceRecord::latest('id')->first()->metadata['biometric_source']);
        $this->assertSame(0, $this->researchRows('matriks'));
        $this->assertSame(0, $this->researchRows('bab5'));
    }

    public function test_subjek_belum_terdaftar_dari_mesin(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        Http::fake(['*' => Http::response([
            'status' => 'failed', 'distance' => null, 'fta' => true, 'fta_reason' => 'SUBJECT_NOT_ENROLLED',
        ], 200)]);

        $data = $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk()
            ->json();

        $this->assertSame('REJECT', $data['final_decision']);
        $this->assertStringContainsString('belum terdaftar', $data['message']);
    }

    public function test_jarak_tersimpan_di_evaluasi_bab5(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.27, 'emar_score' => 1.0], 200)]);

        $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk();

        $bab5 = AttendanceRecord::latest('id')->first()->metadata['evaluation_bab5'];
        $this->assertTrue($bab5['evaluated']);
        $this->assertEqualsWithDelta(0.27, $bab5['euclidean_distance'], 1e-9);
        $this->assertSame(1, $bab5['s1_decision']);
    }

    public function test_akun_uji_tidak_masuk_dataset_riset(): void
    {
        config(['biometrics.allow_simulated_scores' => false]);
        $this->teacher->forceFill(['is_test_data' => true])->save();
        Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.25, 'emar_score' => 1.0], 200)]);

        $data = $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk()
            ->json();

        $this->assertSame('ACCEPT', $data['final_decision']);
        $this->assertSame(0, $this->researchRows('matriks'));
        $this->assertSame(0, $this->researchRows('bab5'));
    }

    public function test_ekspor_fallback_hanya_memuat_hasil_mesin(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        config(['biometrics.allow_simulated_scores' => false]);

        // Satu presentasi tanpa video (unavailable), satu hasil mesin.
        $this->actingAs($this->teacher)->postJson(route('api.presensi'), $this->payload())->assertOk();
        Http::fake(['*' => Http::response(['status' => 'success', 'distance' => 0.33, 'emar_score' => 1.0], 200)]);
        $this->actingAs($this->teacher)
            ->post(route('api.presensi'), $this->payload(['video' => $this->video()]))
            ->assertOk();

        // Berkas CSV riset (di folder sementara) dihapus agar ekspor memakai fallback basis data.
        @unlink(config('biometrics.research_csv.matriks'));

        $response = $this->actingAs($admin)->get(route('export.research'));
        $response->assertOk();
        $lines = array_values(array_filter(explode("\n", trim($response->streamedContent()))));
        $this->assertCount(2, $lines, 'header + satu baris hasil mesin');
        $this->assertStringContainsString('0.330', $lines[1]);
        $this->assertStringNotContainsString('UNAVAILABLE', $lines[1]);
    }

    public function test_simulasi_default_mati_di_luar_tes(): void
    {
        // Hanya phpunit.xml yang menyalakan simulasi; nilai bawaan harus false.
        // Diperiksa dari sumber berkas agar tes ini tidak mengubah environment
        // proses yang dipakai tes lain.
        $source = file_get_contents(base_path('config/biometrics.php'));
        $this->assertStringContainsString("env('BIOMETRICS_ALLOW_SIMULATED_SCORES', false)", $source);
        $this->assertStringNotContainsString('BIOMETRICS_ALLOW_SIMULATED_SCORES', (string) @file_get_contents(base_path('.env')));
    }
}
