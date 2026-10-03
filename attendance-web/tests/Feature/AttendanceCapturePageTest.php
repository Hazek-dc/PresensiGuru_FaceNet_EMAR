<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceCapturePageTest extends TestCase
{
    // Halaman presensi membaca daftar guru Studio dari tabel users.
    use RefreshDatabase;

    public function test_capture_page_is_available(): void
    {
        $this->get(route('attendance.capture'))
            ->assertOk();
    }
}
