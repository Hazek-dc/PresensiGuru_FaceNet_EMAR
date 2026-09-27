<?php

namespace App\Http\Controllers;

use Illuminate\View\View;

class AttendanceCaptureController extends Controller
{
    /**
     * Show the browser-side capture interface.
     *
     * The page deliberately does not mark attendance. A biometric API decision
     * is required before an AttendanceRecord can be created as verified.
     */
    public function create(): View
    {
        return view('attendance.capture');
    }
}
