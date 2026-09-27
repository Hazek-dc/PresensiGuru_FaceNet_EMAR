<?php

namespace Tests\Feature;

use Tests\TestCase;

class AttendanceCapturePageTest extends TestCase
{
    public function test_capture_page_is_available(): void
    {
        $this->get(route('attendance.capture'))
            ->assertOk();
    }
}
