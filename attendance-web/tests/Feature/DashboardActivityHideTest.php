<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class DashboardActivityHideTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.timezone' => 'Asia/Jakarta']);
    }

    public function test_user_can_preview_today_activities(): void
    {
        $user = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $user->id,
            'status' => 'success',
            'decision_reason' => 'Test verification',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $response = $this->actingAs($user)->postJson('/dashboard/activities/preview');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'preview_token',
                'exact_ids',
                'count',
                'timezone',
                'date_str',
                'items_summary',
            ])
            ->assertJson([
                'status' => 'success',
                'count' => 1,
                'exact_ids' => [$record->id],
            ]);
    }

    public function test_user_can_commit_hide_today_activities_with_valid_reason(): void
    {
        $user = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $user->id,
            'status' => 'success',
            'decision_reason' => 'Test verification',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $previewRes = $this->actingAs($user)->postJson('/dashboard/activities/preview');
        $token = $previewRes->json('preview_token');

        $response = $this->actingAs($user)->postJson('/dashboard/activities/hide', [
            'preview_token' => $token,
            'target_ids' => [$record->id],
            'reason' => 'Pembersihan aktivitas uji coba hari ini',
            'confirmation_checked' => true,
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'hidden_count' => 1,
            ]);

        // Verify record is hidden from dashboard
        $record->refresh();
        $this->assertNotNull($record->hidden_from_dashboard_at);
        $this->assertEquals($user->id, $record->hidden_by);
        $this->assertEquals('Pembersihan aktivitas uji coba hari ini', $record->hidden_reason);

        // Verify record STILL exists in database for official history
        $this->assertDatabaseHas('attendance_records', [
            'id' => $record->id,
            'user_id' => $user->id,
            'status' => 'success',
        ]);
    }

    public function test_hide_commit_fails_without_valid_reason(): void
    {
        $user = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $user->id,
            'status' => 'success',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $previewRes = $this->actingAs($user)->postJson('/dashboard/activities/preview');
        $token = $previewRes->json('preview_token');

        $response = $this->actingAs($user)->postJson('/dashboard/activities/hide', [
            'preview_token' => $token,
            'target_ids' => [$record->id],
            'reason' => '3ch', // Too short (< 5 chars)
            'confirmation_checked' => true,
        ]);

        $response->assertStatus(422);
    }

    public function test_hide_commit_fails_on_id_mismatch(): void
    {
        $user = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $user->id,
            'status' => 'success',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $previewRes = $this->actingAs($user)->postJson('/dashboard/activities/preview');
        $token = $previewRes->json('preview_token');

        // Mismatched ID 9999
        $response = $this->actingAs($user)->postJson('/dashboard/activities/hide', [
            'preview_token' => $token,
            'target_ids' => [9999],
            'reason' => 'Alasan yang cukup panjang untuk dites',
            'confirmation_checked' => true,
        ]);

        $response->assertStatus(409);
    }
}
