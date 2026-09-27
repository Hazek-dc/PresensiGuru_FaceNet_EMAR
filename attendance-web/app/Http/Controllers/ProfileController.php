<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): Response
    {
        $user = $request->user();

        $todayAttendance = null;
        $recentLeaves = [];

        if ($user) {
            $todayAttendance = AttendanceRecord::where('user_id', $user->id)
                ->whereDate('created_at', Carbon::today('Asia/Jakarta'))
                ->latest()
                ->first();

            $recentLeaves = AttendanceRecord::where('user_id', $user->id)
                ->whereIn('status', ['izin', 'sakit'])
                ->latest()
                ->take(5)
                ->get()
                ->map(function ($rec) {
                    return [
                        'id' => $rec->id,
                        'status' => $rec->status,
                        'category' => $rec->metadata['category'] ?? ucfirst($rec->status),
                        'decision_reason' => $rec->decision_reason,
                        'date' => Carbon::parse($rec->created_at)->timezone('Asia/Jakarta')->translatedFormat('d M Y'),
                    ];
                });
        }

        return Inertia::render('Profile/Edit', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => session('status'),
            'today_attendance' => $todayAttendance ? [
                'status' => $todayAttendance->status,
                'category' => $todayAttendance->metadata['category'] ?? ucfirst($todayAttendance->status),
                'decision_reason' => $todayAttendance->decision_reason,
                'document_reference' => $todayAttendance->metadata['document_reference'] ?? null,
                'date_raw' => Carbon::parse($todayAttendance->created_at)->timezone('Asia/Jakarta')->toDateString(),
            ] : null,
            'recent_leaves' => $recentLeaves,
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        return Redirect::route('profile.edit');
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validate([
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }

    /**
     * Revoke biometric consent.
     */
    public function revokeBiometric(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->embedding_id) {
            // Revoke template if exists
            $user->embedding_id = null;
            $user->save();

            activity()
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties(['reason' => 'User revoked consent'])
                ->log('revoked_biometric_consent');
        }

        return Redirect::route('profile.edit')->with('status', 'biometric-revoked');
    }

    /**
     * Submit or cancel teacher leave/sick status (Hanya Izin & Sakit).
     */
    public function updateLeaveStatus(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'attendance_status' => 'required|in:izin,sakit,reset',
            'attendance_date' => 'nullable|date',
            'attendance_category' => 'nullable|string|max:255',
            'attendance_reason' => 'nullable|string|max:500',
            'attendance_doc' => 'nullable|string|max:255',
        ]);

        $user = $request->user();
        $date = !empty($validated['attendance_date'])
            ? Carbon::parse($validated['attendance_date'], 'Asia/Jakarta')
            : Carbon::today('Asia/Jakarta');

        if ($validated['attendance_status'] === 'reset') {
            AttendanceRecord::where('user_id', $user->id)
                ->whereDate('created_at', $date)
                ->whereIn('status', ['izin', 'sakit'])
                ->delete();

            activity()
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties(['date' => $date->toDateString()])
                ->log('dispensasi_presensi_dibatalkan');

            return Redirect::back()->with('success', 'Status dispensasi izin/sakit berhasil dibatalkan.');
        }

        // Status is strictly 'izin' or 'sakit'
        $status = $validated['attendance_status'];
        $reason = $validated['attendance_reason'] ?? ($status === 'sakit' ? 'Sakit (Surat Keterangan Dokter)' : 'Izin Dinas Luar / MGMP');
        $category = $validated['attendance_category'] ?? ($status === 'sakit' ? 'Sakit (Surat Dokter)' : 'Izin Dinas Luar / MGMP');

        // Check if record exists for this date
        $existingRecord = AttendanceRecord::where('user_id', $user->id)
            ->whereDate('created_at', $date)
            ->first();

        if ($existingRecord) {
            $existingRecord->update([
                'status' => $status,
                'decision_reason' => $reason,
                'verified_at' => Carbon::now('Asia/Jakarta'),
                'metadata' => array_merge($existingRecord->metadata ?? [], [
                    'source' => 'teacher_profile_request',
                    'category' => $category,
                    'document_reference' => $validated['attendance_doc'] ?? null,
                    'status_sop' => strtoupper($status),
                ]),
            ]);
        } else {
            AttendanceRecord::create([
                'user_id' => $user->id,
                'subject_reference' => $user->embedding_id ?? $user->name,
                'status' => $status,
                'decision_reason' => $reason,
                'verified_at' => Carbon::now('Asia/Jakarta'),
                'created_at' => $date->copy()->setTime(7, 0, 0),
                'metadata' => [
                    'source' => 'teacher_profile_request',
                    'category' => $category,
                    'document_reference' => $validated['attendance_doc'] ?? null,
                    'status_sop' => strtoupper($status),
                ],
            ]);
        }

        activity()
            ->performedOn($user)
            ->causedBy($user)
            ->withProperties([
                'status' => $status,
                'reason' => $reason,
                'category' => $category,
                'doc' => $validated['attendance_doc'] ?? null,
            ])
            ->log('pengajuan_dispensasi_' . $status);

        return Redirect::back()->with('success', 'Status ' . strtoupper($status) . ' guru berhasil diajukan dan dicatat di sistem.');
    }
}
