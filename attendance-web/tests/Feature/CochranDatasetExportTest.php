<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CochranExportService;
use App\Services\SubjectLevelAnalysisService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PDO;
use Tests\TestCase;

/**
 * Ekspor presentasi berpasangan dan analisis tingkat subjek.
 *
 * Versi lama CochranExportService membangkitkan 6.480 baris dari hash CRC32,
 * dan tes lama mengunci jumlah baris karangan itu. Tes ini mengunci perilaku
 * baru: ekspor hanya berisi presentasi yang terekam di telemetry.db.
 */
class CochranDatasetExportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private const BASE_HEADER = 'participant_id,label_aktual,kondisi_lux,kondisi_jarak,skor_facenet,skor_ear,skor_mar,keputusan_S1,keputusan_S2,keputusan_S3';

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create([
            'name' => 'Admin Qalwani',
            'email' => 'admin@smkalmadani.sch.id',
            'role' => 'admin',
        ]);
    }

    /**
     * Buat telemetry.db dengan skema yang sama seperti telemetry_logger.py.
     */
    private function telemetry(array $sessions, bool $currentSchema = true): void
    {
        $columns = 'session_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, claimed_id TEXT,
            attack_label TEXT, lux_value REAL, lux_category TEXT, camera_distance INTEGER,
            n_frames INTEGER, decision_s1 TEXT, decision_s2 TEXT, decision_s3 TEXT,
            ear_mean REAL, mar_mean REAL, emar_mean REAL, face_distance_mean REAL,
            started_at TEXT, ended_at TEXT';
        if ($currentSchema) {
            $columns .= ', repetition INTEGER, distance_level INTEGER, aborted INTEGER DEFAULT 0,
                max_blink_cycles INTEGER, max_mouth_cycles INTEGER';
        }

        $pdo = new PDO('sqlite:' . config('biometrics.telemetry_db'));
        $pdo->exec("CREATE TABLE presentation_log ({$columns})");
        foreach ($sessions as $i => $s) {
            $row = array_merge([
                'session_id' => "sesi_{$i}",
                'subject_id' => 'S01',
                'attack_label' => 'bona_fide',
                'lux_value' => 250.0,
                'lux_category' => 'normal',
                'camera_distance' => 46,
                'n_frames' => 90,
                'decision_s1' => 'ACCEPT',
                'decision_s2' => 'ACCEPT',
                'decision_s3' => 'ACCEPT',
                'ear_mean' => 0.2712,
                'mar_mean' => 0.0634,
                'face_distance_mean' => 0.31234,
                'started_at' => "2026-09-25T10:00:0{$i}",
            ], $currentSchema ? [
                'repetition' => 1,
                'distance_level' => 45,
                'aborted' => 0,
                'max_blink_cycles' => 1,
                'max_mouth_cycles' => 1,
            ] : [], $s);
            $keys = array_keys($row);
            $stmt = $pdo->prepare(sprintf(
                'INSERT INTO presentation_log (%s) VALUES (%s)',
                implode(',', $keys),
                implode(',', array_fill(0, count($keys), '?'))
            ));
            $stmt->execute(array_values($row));
        }
        $pdo = null;
    }

    private function exportedRows(): array
    {
        $rows = [];
        CochranExportService::generateRows(function (array $row) use (&$rows) {
            $rows[] = $row;
        });
        return $rows;
    }

    public function test_tanpa_data_terekam_tidak_ada_baris_yang_dibangkitkan(): void
    {
        $this->assertSame([], $this->exportedRows());
        $this->assertSame(0, CochranExportService::countRows());

        $response = $this->actingAs($this->user)->get(route('export.cochran'));
        $response->assertOk();
        $this->assertStringContainsString('text/csv', $response->headers->get('content-type'));
        $this->assertSame('0', $response->headers->get('X-Jumlah-Baris'));

        $lines = array_values(array_filter(explode("\n", trim($response->streamedContent()))));
        $this->assertCount(1, $lines, 'hanya header');
        $this->assertStringContainsString(self::BASE_HEADER, $lines[0]);
    }

    public function test_presentasi_terekam_diekspor_apa_adanya(): void
    {
        $this->telemetry([
            ['subject_id' => 'S01', 'decision_s2' => 'REJECT', 'repetition' => 1],
            ['subject_id' => 'S02', 'attack_label' => 'print_attack', 'lux_category' => 'redup',
             'distance_level' => 30, 'decision_s1' => 'ACCEPT', 'decision_s2' => 'FTA',
             'decision_s3' => 'REJECT', 'repetition' => 2],
            ['subject_id' => 'S03', 'aborted' => 1],
        ]);

        $rows = $this->exportedRows();
        $this->assertCount(2, $rows, 'sesi batal tidak diekspor');

        $this->assertSame(
            ['S01', 'Bona_Fide', 'Standar', '45cm', '0.3123', '0.2712', '0.0634', 'Accept', 'Reject', 'Accept'],
            array_slice($rows[0], 0, 10)
        );
        $this->assertSame('1', (string) $rows[0][10]);
        $this->assertSame('sesi_0', $rows[0][11]);

        $this->assertSame(['S02', 'Print_Attack', 'Redup', '30cm'], array_slice($rows[1], 0, 4));
        $this->assertSame(['Accept', 'FTA', 'Reject'], array_slice($rows[1], 7, 3));

        $participants = array_column($rows, 0);
        $this->assertNotContains('P01', $participants, 'ID sintetis tidak boleh muncul');
    }

    public function test_nama_berkas_dan_header_memuat_jumlah_baris_sebenarnya(): void
    {
        $this->telemetry([[], ['subject_id' => 'S02']]);

        $response = $this->actingAs($this->user)->get(route('export.cochran'));
        $response->assertOk();
        $this->assertSame('2', $response->headers->get('X-Jumlah-Baris'));
        $this->assertStringContainsString(
            'Dataset_Presentasi_Berpasangan_2_',
            $response->headers->get('content-disposition')
        );
        $this->assertStringNotContainsString('6480', $response->headers->get('content-disposition'));
    }

    public function test_basis_data_skema_lama_tetap_terbaca(): void
    {
        $this->telemetry([['lux_category' => 'lux_medium', 'camera_distance' => 45]], currentSchema: false);

        $rows = $this->exportedRows();
        $this->assertCount(1, $rows);
        $this->assertSame(['Standar', '45cm'], [$rows[0][2], $rows[0][3]]);
        $this->assertSame('', (string) $rows[0][10], 'repetisi tidak ada di skema lama');
    }

    public function test_basis_data_rusak_tidak_membuat_error(): void
    {
        file_put_contents(config('biometrics.telemetry_db'), 'bukan sqlite');

        $this->assertSame([], $this->exportedRows());
        $this->actingAs($this->user)->get(route('export.cochran'))->assertOk();
    }

    public function test_analisis_tingkat_subjek_aman_tanpa_data(): void
    {
        $result = SubjectLevelAnalysisService::analyze();

        $this->assertSame([], $result['error_rates']);
        $this->assertSame(0, $result['summary']['total_samples']);
        $this->assertSame(0.0, $result['summary']['m1_mean']);
        $this->assertSame(0.0, $result['summary']['m3_max']);
        $this->assertFalse($result['integrity_check']['passed']);
        $this->assertStringContainsString('Belum ada presentasi terekam', $result['integrity_check']['details']);
        $this->assertNull(SubjectLevelAnalysisService::analyzeSubject('S01'));
    }

    public function test_analisis_menghitung_dari_data_terekam(): void
    {
        $this->telemetry([
            ['subject_id' => 'S01', 'decision_s1' => 'ACCEPT', 'decision_s2' => 'REJECT', 'decision_s3' => 'FTA'],
            ['subject_id' => 'S01', 'attack_label' => 'screen_attack',
             'decision_s1' => 'ACCEPT', 'decision_s2' => 'FTA', 'decision_s3' => 'REJECT'],
        ]);

        $result = SubjectLevelAnalysisService::analyze();

        // Positif = diterima. FTA wajah asli = FN; FTA serangan = tidak lolos (TN).
        $this->assertSame(['TP' => 1, 'FN' => 0, 'TN' => 0, 'FP' => 1], $result['confusion_matrices']['M1']);
        $this->assertSame(['TP' => 0, 'FN' => 1, 'TN' => 1, 'FP' => 0], $result['confusion_matrices']['M2']);
        $this->assertSame(['TP' => 0, 'FN' => 1, 'TN' => 1, 'FP' => 0], $result['confusion_matrices']['M3']);

        $subject = SubjectLevelAnalysisService::analyzeSubject('S01');
        $this->assertSame(2, $subject['total']);
        $this->assertEquals(50.0, $subject['m1_rate']);

        $this->assertFalse($result['integrity_check']['passed']);
        $this->assertStringContainsString('2 dari 3240', $result['integrity_check']['details']);
    }

    public function test_embedding_dipetakan_ke_id_subjek_perekam(): void
    {
        $this->assertSame('S01', SubjectLevelAnalysisService::embeddingToParticipant('S1'));
        $this->assertSame('S07', SubjectLevelAnalysisService::embeddingToParticipant('P07'));
        $this->assertSame('QALWANI001', SubjectLevelAnalysisService::embeddingToParticipant('QALWANI001'));
    }

    public function test_halaman_riwayat_admin_tetap_terbuka_tanpa_data(): void
    {
        $this->actingAs($this->user)->get(route('attendance.history'))->assertOk();
    }
}
