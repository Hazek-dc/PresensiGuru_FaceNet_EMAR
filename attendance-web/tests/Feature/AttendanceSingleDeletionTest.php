<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class AttendanceSingleDeletionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.timezone' => 'Asia/Jakarta']);
    }

    public function test_admin_can_delete_attendance_record_manually(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_test_data' => true]);
        $teacher = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $teacher->id,
            'status' => 'success',
            'decision_reason' => 'Verifikasi kehadiran',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $response = $this->actingAs($admin)->deleteJson("/attendance/history/{$record->id}");

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'deleted_id' => $record->id,
            ]);

        $this->assertDatabaseMissing('attendance_records', [
            'id' => $record->id,
        ]);

        // Assert audit log was recorded
        $this->assertDatabaseHas('activity_log', [
            'log_name' => 'attendance',
            'causer_id' => $admin->id,
        ]);
    }

    public function test_teacher_can_delete_own_attendance_record(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $teacher->id,
            'status' => 'hadir',
            'decision_reason' => 'Presensi mandiri',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $response = $this->actingAs($teacher)->deleteJson("/attendance/history/{$record->id}");

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'deleted_id' => $record->id,
            ]);

        $this->assertDatabaseMissing('attendance_records', [
            'id' => $record->id,
        ]);
    }

    public function test_teacher_cannot_delete_other_teacher_attendance_record(): void
    {
        $teacher1 = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);
        $teacher2 = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $teacher2->id,
            'status' => 'hadir',
            'decision_reason' => 'Presensi guru 2',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $response = $this->actingAs($teacher1)->deleteJson("/attendance/history/{$record->id}");

        $response->assertStatus(403)
            ->assertJson([
                'status' => 'error',
            ]);

        $this->assertDatabaseHas('attendance_records', [
            'id' => $record->id,
        ]);
    }

    public function test_guest_cannot_delete_attendance_record(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $record = AttendanceRecord::create([
            'user_id' => $teacher->id,
            'status' => 'hadir',
            'is_test_data' => true,
            'created_at' => Carbon::now('Asia/Jakarta'),
        ]);

        $response = $this->delete('/attendance/history/' . $record->id);
        $response->assertRedirect('/login');
    }

    public function test_admin_can_delete_activity_log_manually(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_test_data' => true]);

        $activity = activity()
            ->causedBy($admin)
            ->log('Test activity log');

        $response = $this->actingAs($admin)->deleteJson("/attendance/activities/{$activity->id}");

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'deleted_id' => $activity->id,
            ]);

        $this->assertDatabaseMissing('activity_log', [
            'id' => $activity->id,
        ]);
    }

    public function test_teacher_cannot_delete_other_activity_log(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_test_data' => true]);
        $teacher = User::factory()->create(['role' => 'teacher', 'is_test_data' => true]);

        $activity = activity()
            ->causedBy($admin)
            ->log('Admin secret activity');

        $response = $this->actingAs($teacher)->deleteJson("/attendance/activities/{$activity->id}");

        $response->assertStatus(403)
            ->assertJson([
                'status' => 'error',
            ]);

        $this->assertDatabaseHas('activity_log', [
            'id' => $activity->id,
        ]);
    }
}
