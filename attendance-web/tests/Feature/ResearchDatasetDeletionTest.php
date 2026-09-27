<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class ResearchDatasetDeletionTest extends TestCase
{
    use RefreshDatabase;

    private string $manifestPath;

    protected function setUp(): void
    {
        parent::setUp();
        // Manifest di folder proyek sementara (TestCase), bukan manifest riset asli.
        $this->manifestPath = config('biometrics.project_root') . '/dataset/self_qalwani/manifests/MANIFEST_QALWANI.csv';
        File::ensureDirectoryExists(dirname($this->manifestPath));
    }

    public function test_unauthenticated_user_cannot_delete_sample(): void
    {
        $response = $this->delete('/admin/research-dataset/sample/SE-001');
        $response->assertRedirect('/login');
    }

    public function test_teacher_cannot_delete_sample(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $response = $this->actingAs($teacher)->delete('/admin/research-dataset/sample/SE-001');
        $response->assertStatus(403);
    }

    public function test_admin_can_delete_single_sample_from_manifest(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        // Prepare test manifest
        $header = "frame_id,subject_id,session_split,sample_type,ground_truth,pai_species,lux_level,lux_measured,distance_level,distance_measured_cm,resolution,annot_eye_state,annot_mouth_state,filename,relative_path,sha256,captured_at,operator,device,consent_ref,is_test_data,qc_status,qc_blur_score,mtcnn_detected,notes\n";
        $row1 = "SE-001,TEST-QALWANI-001,SESSION-E,BF,BONA_FIDE,-,NRM,250,D30,30,1280x720,OPEN,CLOSED,file1.jpg,dataset/self_qalwani/raw/enrollment/session_e/file1.jpg,hash1,2026-08-28T12:00:00Z,QA,Webcam,IC-2026-001,true,PASSED,128.4,true,Test row 1\n";
        $row2 = "SE-002,TEST-QALWANI-001,SESSION-E,BF,BONA_FIDE,-,NRM,250,D30,30,1280x720,OPEN,CLOSED,file2.jpg,dataset/self_qalwani/raw/enrollment/session_e/file2.jpg,hash2,2026-08-28T12:05:00Z,QA,Webcam,IC-2026-001,true,PASSED,128.4,true,Test row 2\n";

        File::put($this->manifestPath, $header . $row1 . $row2);
        $media = config('biometrics.project_root') . '/dataset/self_qalwani/raw/enrollment/session_e';
        File::ensureDirectoryExists($media);
        File::put("$media/file1.jpg", 'x');
        File::put("$media/file2.jpg", 'x');

        $response = $this->actingAs($admin)->delete('/admin/research-dataset/sample/SE-001');
        $response->assertRedirect();
        $response->assertSessionHas('message');

        $updatedContent = File::get($this->manifestPath);
        $this->assertStringNotContainsString('SE-001', $updatedContent);
        $this->assertStringContainsString('SE-002', $updatedContent);
        // Berkas fisik dicari relatif ke folder proyek yang dikonfigurasi.
        $this->assertFileDoesNotExist("$media/file1.jpg");
        $this->assertFileExists("$media/file2.jpg");
    }

    public function test_distance_level_accepts_only_thesis_levels(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        // Tanpa media_file validasi selalu gagal, jadi manifest tidak tersentuh.
        foreach (['D30', 'D45', 'D60'] as $level) {
            $this->actingAs($admin)
                ->post('/admin/research-dataset', ['distance_level' => $level])
                ->assertSessionDoesntHaveErrors('distance_level');
        }

        $this->actingAs($admin)
            ->post('/admin/research-dataset', ['distance_level' => 'D100'])
            ->assertSessionHasErrors('distance_level');
    }

    public function test_admin_can_reset_all_samples_in_manifest(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        // Prepare test manifest
        $header = "frame_id,subject_id,session_split,sample_type,ground_truth,pai_species,lux_level,lux_measured,distance_level,distance_measured_cm,resolution,annot_eye_state,annot_mouth_state,filename,relative_path,sha256,captured_at,operator,device,consent_ref,is_test_data,qc_status,qc_blur_score,mtcnn_detected,notes\n";
        $row1 = "SE-001,TEST-QALWANI-001,SESSION-E,BF,BONA_FIDE,-,NRM,250,D30,30,1280x720,OPEN,CLOSED,file1.jpg,dataset/self_qalwani/raw/enrollment/session_e/file1.jpg,hash1,2026-08-28T12:00:00Z,QA,Webcam,IC-2026-001,true,PASSED,128.4,true,Test row 1\n";
        $row2 = "SC-001,TEST-QALWANI-001,SESSION-C,BF,BONA_FIDE,-,NRM,250,D60,60,1280x720,OPEN,CLOSED,file2.jpg,dataset/self_qalwani/raw/calibration/session_c/file2.jpg,hash2,2026-08-28T12:05:00Z,QA,Webcam,IC-2026-001,true,PASSED,128.4,true,Test row 2\n";

        File::put($this->manifestPath, $header . $row1 . $row2);

        $response = $this->actingAs($admin)->delete('/admin/research-dataset/reset');
        $response->assertRedirect();
        $response->assertSessionHas('message');

        $updatedContent = File::get($this->manifestPath);
        $this->assertStringNotContainsString('SE-001', $updatedContent);
        $this->assertStringNotContainsString('SC-001', $updatedContent);
        $this->assertStringContainsString('frame_id', $updatedContent);
    }
}
