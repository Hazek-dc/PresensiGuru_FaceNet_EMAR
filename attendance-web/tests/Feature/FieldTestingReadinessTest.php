<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\AttendanceRecord;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class FieldTestingReadinessTest extends TestCase
{
    use RefreshDatabase;
    protected User $admin;
    protected User $teacher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::where('role', 'admin')->first() ?? User::factory()->create(['role' => 'admin', 'embedding_id' => 'ADM01']);
        $this->teacher = User::where('role', 'teacher')->first() ?? User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S01']);
    }

    public function test_dashboard_page_loads_cleanly_for_admin(): void
    {
        $response = $this->actingAs($this->admin)->get('/dashboard');
        $response->assertStatus(200);
    }

    public function test_dashboard_page_loads_cleanly_for_teacher(): void
    {
        $response = $this->actingAs($this->teacher)->get('/dashboard');
        $response->assertStatus(200);
    }

    public function test_presensi_capture_page_loads_cleanly(): void
    {
        $response = $this->actingAs($this->admin)->get('/presensi');
        $response->assertStatus(200);

        $response2 = $this->actingAs($this->teacher)->get('/presensi');
        $response2->assertStatus(200);
    }

    public function test_attendance_history_page_loads_cleanly(): void
    {
        $response = $this->actingAs($this->admin)->get('/attendance/history');
        $response->assertStatus(200);

        $response2 = $this->actingAs($this->teacher)->get('/attendance/history');
        $response2->assertStatus(200);
    }

    public function test_teacher_profile_page_loads_cleanly(): void
    {
        $response = $this->actingAs($this->admin)->get("/admin/teachers/{$this->teacher->id}");
        $response->assertStatus(200);
    }

    public function test_admin_teachers_index_loads_cleanly(): void
    {
        $response = $this->actingAs($this->admin)->get('/admin/teachers');
        $response->assertStatus(200);
    }

    public function test_lux_current_api_returns_ok(): void
    {
        $response = $this->getJson('/api/lux/current');
        $response->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_distance_current_api_returns_ok(): void
    {
        $response = $this->getJson('/api/distance/current');
        $response->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_cochran_export_stream_returns_ok(): void
    {
        $response = $this->actingAs($this->admin)->get('/attendance/export/cochran');
        $response->assertStatus(200);
    }

    public function test_bab5_export_returns_ok(): void
    {
        $response = $this->actingAs($this->admin)->get('/presensi/export-bab5');
        $response->assertStatus(200);
    }

    public function test_presensi_submission_handles_offline_engine_without_crashing(): void
    {
        \Illuminate\Support\Facades\Http::fake([
            '*' => \Illuminate\Support\Facades\Http::response(null, 500),
        ]);

        $file = \Illuminate\Http\UploadedFile::fake()->create('presensi.webm', 500, 'video/webm');

        $response = $this->actingAs($this->teacher)->post('/api/presensi', [
            'video' => $file,
            'subject_id' => $this->teacher->embedding_id,
            'distance_cm' => 30,
            'lux_value' => 200,
            'session_type' => 'TEST',
            'sample_type' => 'BONA_FIDE',
            'ear_blinks' => 1,
            'mar_mouths' => 1,
            'face_pct' => 95.0,
            'scan_duration_s' => 8.0,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', false)
            ->assertJsonPath('status', 'failed');
    }

    public function test_presensi_submission_successful_with_mocked_biometric_engine(): void
    {
        \Illuminate\Support\Facades\Http::fake([
            '*' => \Illuminate\Support\Facades\Http::response([
                'status' => 'success',
                'message' => 'Verifikasi berhasil.',
                'facenet_score' => 0.92,
                'distance' => 0.35,
                'euclidean_distance' => 0.35,
                'is_verified' => true,
                'fta' => false,
                'fta_reason' => null,
                'emar_score' => 1.0,
                'liveness_passed' => true,
                'blink_cycles' => 2,
                'mouth_cycles' => 1,
                'video_seconds' => 8.0,
                'request_id' => 'req-test-123',
            ], 200),
        ]);

        $file = \Illuminate\Http\UploadedFile::fake()->create('presensi.webm', 500, 'video/webm');

        $response = $this->actingAs($this->teacher)->post('/api/presensi', [
            'video' => $file,
            'subject_id' => $this->teacher->embedding_id,
            'distance_cm' => 45,
            'lux_value' => 250,
            'session_type' => 'TEST',
            'sample_type' => 'BONA_FIDE',
            'ear_blinks' => 2,
            'mar_mouths' => 1,
            'face_pct' => 98.0,
            'scan_duration_s' => 8.0,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('evaluation.s1_decision', 1)
            ->assertJsonPath('evaluation.s2_decision', 1)
            ->assertJsonPath('evaluation.s3_decision', 1);

        $this->assertDatabaseHas('attendance_records', [
            'user_id' => $this->teacher->id,
            'biometric_request_id' => 'req-test-123',
        ]);
    }
}
