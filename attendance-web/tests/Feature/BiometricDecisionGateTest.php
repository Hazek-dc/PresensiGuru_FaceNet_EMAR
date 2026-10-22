<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\ModelSettingController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Validasi 4 Test Cases Skripsi Qalwani Anugerah (NPM. 221220048)
 * Sistem Presensi Biometrik Wajah: FaceNet & EMAR
 * SMK Al-Madani Pontianak
 */
class BiometricDecisionGateTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create([
            'name' => 'Budi Santoso, S.Kom',
            'email' => 'budi.santoso@smkalmadani.sch.id',
            'role' => 'teacher',
            'embedding_id' => 'S01',
            'is_active' => true,
        ]);

        $this->admin = User::factory()->create([
            'name' => 'Admin Qalwani',
            'email' => 'admin@smkalmadani.sch.id',
            'role' => 'admin',
            'is_active' => true,
        ]);
    }

    /**
     * Test Case 1: Bona Fide (Asli)
     * Kondisi: Kedip 2x, Mulut 1x, Euclidean Distance 0.08, Stabilitas 95%
     * Ekspektasi: PAD=BONA_FIDE, ID=MATCH, Final=ACCEPT, status_presensi=AKTIF
     */
    public function test_case_1_bona_fide_accepted(): void
    {
        $response = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), [
                'subject_id' => 'S01',
                'sample_type' => 'BONA_FIDE',
                'session_type' => 'TEST',
                'ear_blinks' => 2,
                'mar_mouths' => 1,
                'face_pct' => 95.0,
                'euclidean_distance' => 0.08,
                'scan_duration_s' => 8.0,
                'distance_cm' => 30,
                'lux_value' => 320,
            ]);

        $response->assertOk();
        $data = $response->json();

        $this->assertTrue($data['success']);
        $this->assertEquals('ACCEPT', $data['final_decision']);
        $this->assertEquals('BONA_FIDE', $data['pad_pred']);
        $this->assertEquals('MATCH', $data['id_pred']);

        // Verifikasi pembaruan status guru secara atomik
        $this->teacher->refresh();
        $this->assertEquals('AKTIF', $this->teacher->status_presensi);
        $this->assertNotNull($this->teacher->last_presensi_at);

        // Verifikasi tabel matriks evaluasi Bab 4
        $this->assertDatabaseHas('evaluation_matrices', [
            'subject_id' => 'S01',
            'pad_prediction' => 'BONA_FIDE',
            'id_prediction' => 'MATCH',
            'final_decision' => 'ACCEPT',
        ]);
    }

    /**
     * Test Case 2: Cut-Out Photo Attack
     * Kondisi: Kedip 1x (pelaku di balik lubang), Mulut 0x, Distance 0.08, Stabilitas 90%
     * Ekspektasi: PAD=ATTACK, ID=MATCH, Final=REJECT
     * Alasan Penolakan: "Gagal Liveness: Gerakan Mulut 0x (Terindikasi Cut-Out/Lubang Foto)"
     */
    public function test_case_2_cut_out_photo_attack_rejected(): void
    {
        $response = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), [
                'subject_id' => 'S01',
                'sample_type' => 'ATTACK',
                'session_type' => 'TEST',
                'ear_blinks' => 1,
                'mar_mouths' => 0, // Cut-out: mulut foto tidak bergerak
                'face_pct' => 90.0,
                'euclidean_distance' => 0.08,
                'scan_duration_s' => 8.0,
                'distance_cm' => 30,
                'lux_value' => 320,
            ]);

        $response->assertOk();
        $data = $response->json();

        $this->assertFalse($data['success']);
        $this->assertEquals('REJECT', $data['final_decision']);
        $this->assertEquals('ATTACK', $data['pad_pred']);
        $this->assertEquals('MATCH', $data['id_pred']);
        $this->assertStringContainsString(
            'Gagal Liveness: Gerakan Mulut 0x (Terindikasi Cut-Out/Lubang Foto)',
            $data['message']
        );

        $this->assertDatabaseHas('evaluation_matrices', [
            'subject_id' => 'S01',
            'pad_prediction' => 'ATTACK',
            'final_decision' => 'REJECT',
        ]);
    }

    /**
     * Test Case 3: Print Photo Attack
     * Kondisi: Kedip 0x, Mulut 0x, Distance 0.08 (Foto Statis Kertas)
     * Ekspektasi: PAD=ATTACK, Final=REJECT
     */
    public function test_case_3_print_photo_attack_rejected(): void
    {
        $response = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), [
                'subject_id' => 'S01',
                'sample_type' => 'ATTACK',
                'session_type' => 'TEST',
                'ear_blinks' => 0,
                'mar_mouths' => 0,
                'face_pct' => 90.0,
                'euclidean_distance' => 0.08,
                'scan_duration_s' => 8.0,
                'distance_cm' => 30,
                'lux_value' => 300,
            ]);

        $response->assertOk();
        $data = $response->json();

        $this->assertFalse($data['success']);
        $this->assertEquals('REJECT', $data['final_decision']);
        $this->assertEquals('ATTACK', $data['pad_pred']);
        $this->assertStringContainsString(
            'Tidak Terdeteksi Kedipan dan Gerakan Mulut',
            $data['message']
        );
    }

    /**
     * Test Case 4: Non-Match (Wajah Bukan Guru Terdaftar)
     * Kondisi: Kedip 2x, Mulut 2x (Manusia Hidup Asli), Jarak Euclidean 0.85 (> 0.40)
     * Ekspektasi: PAD=BONA_FIDE, ID=NON_MATCH, Final=REJECT
     */
    public function test_case_4_non_match_rejected(): void
    {
        $response = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), [
                'subject_id' => 'S01',
                'sample_type' => 'BONA_FIDE',
                'session_type' => 'TEST',
                'ear_blinks' => 2,
                'mar_mouths' => 2,
                'face_pct' => 92.0,
                'euclidean_distance' => 0.85, // Jarak > 0.40 (Non-Match)
                'scan_duration_s' => 8.0,
                'distance_cm' => 30,
                'lux_value' => 350,
            ]);

        $response->assertOk();
        $data = $response->json();

        $this->assertFalse($data['success']);
        $this->assertEquals('REJECT', $data['final_decision']);
        $this->assertEquals('BONA_FIDE', $data['pad_pred']);
        $this->assertEquals('NON_MATCH', $data['id_pred']);
        $this->assertStringContainsString('Gagal Identifikasi: Jarak Euclidean', $data['message']);
    }

    /**
     * Test Model Settings Page & Operations:
     * - Akses route /admin/settings/model oleh Admin
     * - Update threshold kalibrasi
     * - Reset ke default Bab 3 Skripsi
     */
    public function test_model_settings_lifecycle(): void
    {
        // 1. Akses halaman model settings
        $response = $this->actingAs($this->admin)->get(route('admin.settings.model'));
        $response->assertOk();

        // 2. Simpan pembaruan parameter
        $updateResponse = $this->actingAs($this->admin)->post(route('admin.settings.model.update'), [
            'facenet_threshold' => 0.38,
            'liveness_strategy' => 'S2',
            'ear_threshold' => 0.22,
            'mar_threshold' => 0.12,
            'reason' => 'Pengujian kalibrasi laboratorium SMK Al-Madani',
        ]);
        $updateResponse->assertRedirect();

        $activeSettings = ModelSettingController::getActiveSettings();
        $this->assertEquals(0.38, $activeSettings['facenet_threshold']);
        $this->assertEquals('S2', $activeSettings['liveness_strategy']);
        $this->assertEquals(0.22, $activeSettings['ear_threshold']);
        $this->assertEquals(0.12, $activeSettings['mar_threshold']);

        // 3. Reset ke standar Bab 3 Skripsi
        $resetResponse = $this->actingAs($this->admin)->post(route('admin.settings.model.reset'));
        $resetResponse->assertRedirect();

        $resetSettings = ModelSettingController::getActiveSettings();
        $this->assertEquals(0.40, $resetSettings['facenet_threshold']);
        $this->assertEquals('S2', $resetSettings['liveness_strategy']);
        $this->assertEquals(0.20, $resetSettings['ear_threshold']);
        $this->assertEquals(0.10, $resetSettings['mar_threshold']);
    }

    /**
     * Skenario Bab 5 setelah keputusan peneliti D1 (S3 = FusionModule.decide_s3,
     * rumus b) dan D2 (liveness = siklus dlib mesin). Ambang Tabel 5.2: cocok jika
     * d <= 0,40; S2 butuh siklus kedip DAN siklus mulut; S3 = gerbang d <= 0,40 DAN
     * 0,6 * (1 - d/1,20) + 0,4 * P_live >= 0,50.
     */
    public function test_bab5_scenarios_use_thesis_thresholds(): void
    {
        $post = function (array $overrides) {
            return $this->actingAs($this->teacher)
                ->postJson(route('api.presensi'), array_merge([
                    'subject_id' => 'S01',
                    'sample_type' => 'BONA_FIDE',
                    'session_type' => 'TEST',
                    'blink_cycles' => 1,
                    'mouth_cycles' => 1,
                    'face_pct' => 95.0,
                    'euclidean_distance' => 0.20,
                    'scan_duration_s' => 8.0,
                    'distance_cm' => 45,
                    'lux_value' => 200,
                ], $overrides))
                ->assertOk()
                ->json('evaluation');
        };

        $this->assertSame(1, $post(['euclidean_distance' => 0.40])['s1_decision']);
        $this->assertSame(0, $post(['euclidean_distance' => 0.41])['s1_decision']);

        $full = $post([]);
        $this->assertTrue($full['liveness_valid']);
        $this->assertSame(1.0, (float) $full['p_live']);
        $this->assertSame([1, 1, 1], [$full['s1_decision'], $full['s2_decision'], $full['s3_decision']]);
        $this->assertSame('engine_dlib', $full['liveness_source']);

        // Satu siklus saja: S2 menolak, S3 menerima (P_live 0,5; s_final 0,65).
        $mouthOnly = $post(['euclidean_distance' => 0.30, 'blink_cycles' => 0]);
        $this->assertSame(0.5, (float) $mouthOnly['p_live']);
        $this->assertSame(0, $mouthOnly['s2_decision']);
        $this->assertSame(1, $mouthOnly['s3_decision']);
        $this->assertEqualsWithDelta(0.65, $mouthOnly['s_final'], 1e-9);

        // Tanpa liveness: d = 0,20 tepat memberi 0,49999999999999994 (ditolak),
        // d = 0,19 diterima S3 (sifat rumus b yang harus dilaporkan di naskah).
        $this->assertSame(0, $post(['blink_cycles' => 0, 'mouth_cycles' => 0])['s3_decision']);
        $this->assertSame(1, $post(['euclidean_distance' => 0.19, 'blink_cycles' => 0, 'mouth_cycles' => 0])['s3_decision']);

        // Gerbang identitas: liveness penuh tidak meloloskan S3 bila d > 0,40.
        $this->assertSame(0, $post(['euclidean_distance' => 0.41])['s3_decision']);

        // EAR/MAR browser hanya telemetri dan tidak lagi diisi bawaan (D10).
        $browserOnly = $post(['mouth_cycles' => 0, 'ear_val' => 0.10, 'mar_val' => 0.50]);
        $this->assertFalse($browserOnly['liveness_valid']);
        $this->assertSame(0.5, (float) $browserOnly['mar_val']);
        $this->assertNull($post([])['mar_val']);
    }

    /**
     * D2: tantangan browser hanya panduan dan telemetri. PASS_LIVENESS dari browser
     * tidak meloloskan presentasi tanpa siklus dlib.
     */
    public function test_browser_challenge_pass_does_not_override_engine_liveness(): void
    {
        $data = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), [
                'subject_id' => 'S01',
                'sample_type' => 'ATTACK',
                'session_type' => 'TEST',
                'active_challenge' => 'BLINK',
                'challenge_status' => 'PASS_LIVENESS',
                'blink_cycles' => 0,
                'mouth_cycles' => 0,
                'euclidean_distance' => 0.15,
                'scan_duration_s' => 8.0,
            ])
            ->assertOk()
            ->json();

        $this->assertFalse($data['success']);
        $this->assertEquals('REJECT', $data['final_decision']);
        $this->assertEquals('ATTACK', $data['pad_pred']);
        $this->assertEquals('PASS_LIVENESS', $data['challenge_status']);
        $this->assertStringContainsString('Tidak Terdeteksi Kedipan dan Gerakan Mulut', $data['message']);
    }

    /** D2: aksi browser yang salah tidak menolak presentasi yang siklus dlib-nya lengkap. */
    public function test_browser_wrong_action_does_not_reject_engine_live(): void
    {
        $data = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), [
                'subject_id' => 'S01',
                'sample_type' => 'BONA_FIDE',
                'session_type' => 'TEST',
                'active_challenge' => 'BLINK',
                'challenge_status' => 'REJECT_WRONG_ACTION',
                'blink_cycles' => 1,
                'mouth_cycles' => 1,
                'euclidean_distance' => 0.15,
                'scan_duration_s' => 8.0,
            ])
            ->assertOk()
            ->json();

        $this->assertTrue($data['success']);
        $this->assertEquals('ACCEPT', $data['final_decision']);
        $this->assertEquals('BONA_FIDE', $data['pad_pred']);
        $this->assertEquals('REJECT_WRONG_ACTION', $data['challenge_status']);
    }

    /** D2: tanpa landmark dlib, liveness tidak terukur: S2/S3 null dan presentasi ditolak. */
    public function test_engine_without_landmarks_is_liveness_fta(): void
    {
        $data = $this->actingAs($this->teacher)
            ->postJson(route('api.presensi'), [
                'subject_id' => 'S01',
                'sample_type' => 'BONA_FIDE',
                'session_type' => 'TEST',
                'blink_cycles' => 1,
                'mouth_cycles' => 1,
                'landmark_frames' => 0,
                'euclidean_distance' => 0.15,
            ])
            ->assertOk()
            ->json();

        $this->assertEquals('REJECT', $data['final_decision']);
        $this->assertEquals('UNAVAILABLE', $data['pad_pred']);
        $this->assertSame(1, $data['evaluation']['s1_decision']);
        $this->assertNull($data['evaluation']['s2_decision']);
        $this->assertNull($data['evaluation']['s3_decision']);
        $this->assertStringContainsString('Landmark wajah dlib tidak terdeteksi', $data['message']);
    }
}
