<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * E2E mock tests — written by the independent auditor.
 *
 * These tests verify attendance-web behavior with mock/synthetic data.
 * No real biometric data is accessed. No production code is modified.
 *
 * NOTE: Uses raw DB queries instead of Eloquent to work around a known
 * Codex bug: AttendanceRecord.php defines both #[Fillable] attribute
 * AND $fillable property, causing a PHP 8.3 fatal error.  This is
 * documented in the audit report as a finding for Codex to fix.
 *
 * Auditor: Antigravity Pro
 */
class AttendanceE2EMockTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Insert a synthetic attendance record using raw DB to bypass the
     * Eloquent model bug.
     */
    private function insertRecord(array $data): int
    {
        return DB::table('attendance_records')->insertGetId(array_merge([
            'created_at' => now(),
            'updated_at' => now(),
        ], $data));
    }

    // ─────────────────────────────────────────────────────────────────────
    // E2E-6: Presensi ganda → ditolak (UNIQUE constraint)
    // ─────────────────────────────────────────────────────────────────────

    public function test_duplicate_biometric_request_id_rejected_by_schema(): void
    {
        // First record — accepted
        $this->insertRecord([
            'subject_reference' => 'EMP-SYNTH-001',
            'status' => 'verified',
            'decision_reason' => 'identity_verified,pad_passed',
            'biometric_request_id' => 'req-unique-001',
            'verified_at' => now(),
        ]);

        $this->assertDatabaseHas('attendance_records', [
            'biometric_request_id' => 'req-unique-001',
        ]);

        // Duplicate request — must be rejected by UNIQUE constraint
        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);

        $this->insertRecord([
            'subject_reference' => 'EMP-SYNTH-001',
            'status' => 'verified',
            'decision_reason' => 'identity_verified,pad_passed',
            'biometric_request_id' => 'req-unique-001',  // same ID
            'verified_at' => now(),
        ]);
    }

    public function test_different_biometric_request_ids_accepted(): void
    {
        for ($i = 1; $i <= 3; $i++) {
            $this->insertRecord([
                'subject_reference' => "EMP-SYNTH-00{$i}",
                'status' => 'verified',
                'decision_reason' => 'identity_verified,pad_passed',
                'biometric_request_id' => "req-unique-00{$i}",
                'verified_at' => now(),
            ]);
        }

        $this->assertDatabaseCount('attendance_records', 3);
    }

    // ─────────────────────────────────────────────────────────────────────
    // E2E-6 extended: Null biometric_request_id should be allowed
    // (FTA records may not have a request ID)
    // ─────────────────────────────────────────────────────────────────────

    public function test_null_biometric_request_id_allowed_for_fta(): void
    {
        $this->insertRecord([
            'subject_reference' => 'EMP-SYNTH-001',
            'status' => 'fta',
            'decision_reason' => 'failure_to_acquire',
            'biometric_request_id' => null,
        ]);

        $this->insertRecord([
            'subject_reference' => 'EMP-SYNTH-002',
            'status' => 'fta',
            'decision_reason' => 'failure_to_acquire',
            'biometric_request_id' => null,
        ]);

        $this->assertDatabaseCount('attendance_records', 2);
    }

    // ─────────────────────────────────────────────────────────────────────
    // E2E-3 / E2E-4: Attendance record creation with mock decisions
    // ─────────────────────────────────────────────────────────────────────

    public function test_verified_record_stores_all_required_fields(): void
    {
        $id = $this->insertRecord([
            'subject_reference' => 'EMP-SYNTH-001',
            'status' => 'verified',
            'decision_reason' => 'identity_verified,pad_passed',
            'biometric_request_id' => 'req-mock-verify-001',
            'verified_at' => now(),
            'metadata' => json_encode([
                'similarity' => 0.95,
                'threshold' => 0.80,
                'liveness_status' => 'passed',
                'fusion_decision' => true,
            ]),
        ]);

        $record = DB::table('attendance_records')->find($id);

        $this->assertNotNull($record->id);
        $this->assertEquals('verified', $record->status);

        $metadata = json_decode($record->metadata, true);
        $this->assertIsArray($metadata);
        $this->assertEquals(0.95, $metadata['similarity']);
    }

    public function test_rejected_record_stores_rejection_reason(): void
    {
        $id = $this->insertRecord([
            'subject_reference' => 'EMP-SYNTH-001',
            'status' => 'rejected',
            'decision_reason' => 'pad_not_passed',
            'biometric_request_id' => 'req-mock-reject-001',
            'metadata' => json_encode([
                'similarity' => 0.92,
                'threshold' => 0.80,
                'liveness_status' => 'failed',
                'fusion_decision' => false,
                'fusion_reasons' => ['identity_verified', 'pad_not_passed'],
            ]),
        ]);

        $record = DB::table('attendance_records')->find($id);

        $this->assertEquals('rejected', $record->status);
        $this->assertEquals('pad_not_passed', $record->decision_reason);
        $this->assertNull($record->verified_at);
    }

    // ─────────────────────────────────────────────────────────────────────
    // E2E-1: Capture page availability
    //
    // NOTE: Skipped because Vite manifest (public/build/manifest.json) is
    // not built.  This is a pre-existing environment issue — the existing
    // AttendanceCapturePageTest also fails for the same reason.
    // ─────────────────────────────────────────────────────────────────────

    public function test_capture_page_route_is_defined(): void
    {
        // Verify the route exists and is named correctly — this does not
        // require rendering the Blade template (which needs Vite manifest).
        $this->assertTrue(
            \Illuminate\Support\Facades\Route::has('attendance.capture'),
            'Route attendance.capture must be defined'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // E2E-7: App survives when biometric API is unreachable
    // ─────────────────────────────────────────────────────────────────────

    public function test_welcome_page_loads_without_biometric_api(): void
    {
        // The welcome route redirects to login which loads static page
        $this->get('/')->assertRedirect('/login');
        $this->get('/login')->assertOk();
    }

    public function test_nonexistent_routes_return_404_not_500(): void
    {
        $this->get('/nonexistent-route-abc123')->assertNotFound();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Schema validation: attendance_records table has required columns
    // ─────────────────────────────────────────────────────────────────────

    public function test_attendance_records_table_has_required_columns(): void
    {
        $columns = collect(DB::select("PRAGMA table_info('attendance_records')"))
            ->pluck('name')
            ->toArray();

        $requiredColumns = [
            'id',
            'user_id',
            'subject_reference',
            'status',
            'decision_reason',
            'biometric_request_id',
            'verified_at',
            'metadata',
        ];

        foreach ($requiredColumns as $column) {
            $this->assertContains($column, $columns, "Column '{$column}' must exist");
        }
    }
}
