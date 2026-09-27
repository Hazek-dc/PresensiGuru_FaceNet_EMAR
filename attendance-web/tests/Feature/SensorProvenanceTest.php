<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\EvaluationMatrix;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Lux dan jarak presensi hanya boleh berasal dari pengukuran langsung.
 *
 * Dulu controller mengisi 300 lux / 30 cm bila klien tidak mengirim angka, dan
 * halaman presensi selalu mengirim preset atau nilai query string. Angka itu
 * masuk ke metadata, evaluation_bab5, dan CSV riset seolah hasil ukur.
 */
class SensorProvenanceTest extends TestCase
{
    use RefreshDatabase;

    private const MATRIKS_HEADER = 'File_Uji,Claimed_ID,Sample_Type,PAI_Species,Lux,Jarak_cm,Session,PAD_Pred,ID_Pred,Jarak,Kedipan,Mulut,Wajah_%,Durasi_s,Final,Error';
    private const BAB5_HEADER = 'participant_id,jarak_cm,lux,label_aktual,euclidean_dist,ear,mar,keputusan_S1,keputusan_S2,keputusan_S3';

    private User $teacher;

    protected function setUp(): void
    {
        parent::setUp();

        config(['biometrics.allow_simulated_scores' => false]);
        $this->teacher = User::factory()->create([
            'name' => 'Guru Sensor',
            'email' => 'guru.sensor@smkalmadani.sch.id',
            'role' => 'teacher',
            'embedding_id' => 'S01',
            'is_active' => true,
        ]);
        Http::fake(['*' => Http::response([
            'status' => 'success',
            'distance' => 0.31,
            'facenet_score' => 0.74,
            'emar_score' => 1.0,
            'request_id' => 'req-sensor-001',
        ], 200)]);
    }

    private function submit(array $sensorFields): array
    {
        return $this->actingAs($this->teacher)
            ->post(route('api.presensi'), array_merge([
                'video' => UploadedFile::fake()->create('presensi.webm', 16, 'video/webm'),
                'subject_id' => 'S01',
                'sample_type' => 'BONA_FIDE',
                'session_type' => 'TEST',
                'ear_blinks' => 2,
                'mar_mouths' => 1,
                'face_pct' => 95.0,
                'scan_duration_s' => 8.0,
            ], $sensorFields))
            ->assertOk()
            ->json();
    }

    /** @return array{0: string, 1: array<int, string>} header dan sel baris data pertama */
    private function csvRow(string $key): array
    {
        $lines = file(config("biometrics.research_csv.{$key}"), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $this->assertCount(2, $lines, "{$key}: header + satu baris");

        return [$lines[0], str_getcsv($lines[1])];
    }

    public function test_tanpa_lux_dan_jarak_tersimpan_null_dan_sel_csv_kosong(): void
    {
        $data = $this->submit([]);

        $this->assertSame('ACCEPT', $data['final_decision']);
        $this->assertNull($data['evaluation']['lux_value']);
        $this->assertNull($data['evaluation']['distance_cm']);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertNull($meta['lux']);
        $this->assertNull($meta['distance_cm']);
        $this->assertSame('none', $meta['lux_source']);
        $this->assertSame('none', $meta['distance_source']);

        $bab5 = $meta['evaluation_bab5'];
        $this->assertNull($bab5['lux']);
        $this->assertNull($bab5['distance_cm']);
        $this->assertSame('none', $bab5['lux_source']);
        $this->assertSame('none', $bab5['distance_source']);

        $matrix = EvaluationMatrix::latest('id')->first();
        $matrixBab5 = $matrix->raw_metadata['evaluation_bab5'];
        $this->assertNull($matrixBab5['lux']);
        $this->assertNull($matrixBab5['distance_cm']);
        // Kolom tabel juga NULL, bukan DEFAULT 30/300 yang dulu ikut terhitung di dasbor.
        $this->assertNull($matrix->lux_value);
        $this->assertNull($matrix->distance_cm);

        [$header, $row] = $this->csvRow('matriks');
        $this->assertSame(self::MATRIKS_HEADER, $header);
        $this->assertCount(16, $row);
        $this->assertSame('', $row[4], 'Lux');
        $this->assertSame('', $row[5], 'Jarak_cm');
        $this->assertSame('0.310', $row[9]);

        [$header, $row] = $this->csvRow('bab5');
        $this->assertSame(self::BAB5_HEADER, $header);
        $this->assertCount(10, $row);
        $this->assertSame('', $row[1], 'jarak_cm');
        $this->assertSame('', $row[2], 'lux');
        $this->assertSame('0.31', $row[4]);
    }

    public function test_kestabilan_wajah_nol_persen_tidak_menjadi_seratus(): void
    {
        $data = $this->submit(['face_pct' => 0]);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertEquals(0.0, $meta['face_detected_pct']);
        $this->assertSame('REJECT', $data['final_decision']);
    }

    public function test_riwayat_menampilkan_null_bukan_30_cm_300_lux(): void
    {
        $this->submit([]);
        $admin = User::factory()->create(['role' => 'admin']);

        $csv = $this->actingAs($admin)->get('/attendance/export/operational')->streamedContent();
        $lines = array_values(array_filter(explode("\n", trim($csv))));
        $header = str_getcsv($lines[0]);
        $row = str_getcsv(end($lines));
        $lux = array_search('Lux', $header, true);
        $jarak = array_search('Jarak_cm', $header, true);
        $this->assertNotFalse($lux, 'kolom Lux ada di ekspor operasional');
        $this->assertSame('', $row[$lux]);
        $this->assertSame('', $row[$jarak]);
    }

    public function test_nilai_terukur_tersimpan_dengan_sumbernya(): void
    {
        $data = $this->submit([
            'lux_value' => 212.46,
            'lux_source' => 'luxmeter',
            'distance_cm' => 47.34,
            'distance_source' => 'camera',
        ]);

        $this->assertEqualsWithDelta(212.5, $data['evaluation']['lux_value'], 1e-9);
        $this->assertEqualsWithDelta(47.3, $data['evaluation']['distance_cm'], 1e-9);
        $this->assertSame('luxmeter', $data['evaluation']['lux_source']);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertEqualsWithDelta(212.5, $meta['lux'], 1e-9);
        $this->assertEqualsWithDelta(47.3, $meta['distance_cm'], 1e-9);
        $this->assertSame('luxmeter', $meta['lux_source']);
        $this->assertSame('camera', $meta['distance_source']);
        $this->assertSame('luxmeter', $meta['evaluation_bab5']['lux_source']);
        $this->assertEqualsWithDelta(47.3, $meta['evaluation_bab5']['distance_cm'], 1e-9);

        $matrix = EvaluationMatrix::latest('id')->first();
        $this->assertSame(213, $matrix->lux_value);
        $this->assertSame(47, $matrix->distance_cm);

        [, $row] = $this->csvRow('matriks');
        $this->assertSame('212.5', $row[4]);
        $this->assertSame('47.3', $row[5]);

        [, $row] = $this->csvRow('bab5');
        $this->assertSame('47.3', $row[1]);
        $this->assertSame('212.5', $row[2]);
    }

    public function test_nilai_bulat_ditulis_tanpa_desimal(): void
    {
        $this->submit([
            'lux_value' => 300, 'lux_source' => 'camera',
            'distance_cm' => 30, 'distance_source' => 'sensor',
        ]);

        [, $row] = $this->csvRow('matriks');
        $this->assertSame(['300', '30'], [$row[4], $row[5]]);
    }

    public function test_nilai_tanpa_sumber_pengukuran_tidak_dicatat(): void
    {
        // Klien lama (build sebelum perubahan ini) selalu mengirim preset 300/30
        // tanpa sumber; sumber yang tidak dikenal juga bukan pengukuran.
        $this->submit([
            'lux_value' => 300,
            'distance_cm' => 30,
            'lux_source' => 'manual_preset',
        ]);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertNull($meta['lux']);
        $this->assertNull($meta['distance_cm']);
        $this->assertSame('none', $meta['lux_source']);
        $this->assertSame('none', $meta['distance_source']);

        [, $row] = $this->csvRow('matriks');
        $this->assertSame(['', ''], [$row[4], $row[5]]);
        [, $row] = $this->csvRow('bab5');
        $this->assertSame(['', ''], [$row[1], $row[2]]);
    }

    public function test_kolom_lux_lama_tetap_diterima_bila_bersumber(): void
    {
        $this->submit(['lux' => 88, 'lux_source' => 'luxmeter']);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertEqualsWithDelta(88.0, $meta['lux'], 1e-9);
        $this->assertSame('luxmeter', $meta['lux_source']);
    }

    public function test_nol_lux_adalah_hasil_ukur_bukan_nilai_kosong(): void
    {
        $this->submit(['lux_value' => 0, 'lux_source' => 'luxmeter']);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertSame(0.0, (float) $meta['lux']);
        $this->assertSame('luxmeter', $meta['lux_source']);

        [, $row] = $this->csvRow('matriks');
        $this->assertSame('0', $row[4]);
    }

    public function test_target_skenario_disimpan_terpisah_dari_hasil_ukur(): void
    {
        $this->submit(['lux_target' => 75, 'distance_target_cm' => 60]);

        $meta = AttendanceRecord::latest('id')->first()->metadata;
        $this->assertNull($meta['lux']);
        $this->assertNull($meta['distance_cm']);
        $this->assertEqualsWithDelta(75.0, $meta['lux_target'], 1e-9);
        $this->assertEqualsWithDelta(60.0, $meta['distance_target_cm'], 1e-9);
        $this->assertEqualsWithDelta(75.0, $meta['evaluation_bab5']['lux_target'], 1e-9);

        // Target tidak pernah masuk kolom Lux/Jarak_cm CSV riset.
        [, $row] = $this->csvRow('matriks');
        $this->assertSame(['', ''], [$row[4], $row[5]]);
    }

    public function test_lux_dan_jarak_tak_terukur_tidak_dikirim_ke_mesin(): void
    {
        $this->submit([]);

        Http::assertSent(function (HttpRequest $request) {
            $names = array_column($request->data(), 'name');
            return in_array('attempt_id', $names, true)
                && !in_array('lux', $names, true)
                && !in_array('distance_cm', $names, true);
        });
    }

    public function test_jarak_current_tanpa_bacaan_bukan_preset_30_cm(): void
    {
        $this->getJson('/api/distance/current')
            ->assertOk()
            ->assertJson([
                'success' => true,
                'distance_cm' => null,
                'condition' => null,
                'condition_code' => null,
                'is_ideal' => null,
                'benchmark' => null,
                'source' => 'none',
                'updated_at' => null,
                'seconds_ago' => null,
                'is_measured' => false,
                'not_measured_reason' => 'no_reading',
            ]);
    }

    public function test_jarak_current_segar_lalu_basi(): void
    {
        $this->postJson('/api/distance/update', ['distance_cm' => 47.0, 'source' => 'hardware_tof'])->assertOk();

        $this->getJson('/api/distance/current')
            ->assertJsonPath('condition_code', 'MID_45')
            ->assertJsonPath('is_stale', false)
            ->assertJsonPath('is_measured', true);

        $this->travel(15)->seconds();
        $this->getJson('/api/distance/current')
            ->assertJsonPath('distance_cm', fn ($v) => (float) $v === 47.0)
            ->assertJsonPath('is_stale', true)
            ->assertJsonPath('is_measured', false)
            ->assertJsonPath('not_measured_reason', 'stale');
    }

    public function test_preset_jarak_dari_web_bukan_hasil_ukur(): void
    {
        $this->postJson('/api/distance/update', ['distance_cm' => 30, 'source' => 'manual_preset'])->assertOk();

        $this->getJson('/api/distance/current')
            ->assertJsonPath('is_measured', false)
            ->assertJsonPath('not_measured_reason', 'not_a_measurement');
    }
}
