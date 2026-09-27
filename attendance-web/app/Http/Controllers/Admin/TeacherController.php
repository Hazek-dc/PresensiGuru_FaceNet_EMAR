<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\User;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Inertia\Inertia;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;
use App\Services\SubjectLevelAnalysisService;

class TeacherController extends Controller
{
    /**
     * Display a listing of the teachers.
     */
    public function index(Request $request)
    {
        $today = Carbon::today('Asia/Pontianak');

        $query = User::where('role', 'teacher')->withTrashed();

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('embedding_id', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $status = $request->input('status');
            if ($status === 'disabled') {
                $query->onlyTrashed();
            } elseif ($status === 'active') {
                $query->whereNull('deleted_at');
            } elseif ($status === 'enrolled') {
                $query->whereNotNull('embedding_id')->whereNull('deleted_at');
            } elseif ($status === 'not_enrolled') {
                $query->whereNull('embedding_id')->whereNull('deleted_at');
            } elseif ($status === 'hadir' || $status === 'present') {
                $presentIds = AttendanceRecord::whereDate('created_at', $today)
                    ->whereIn('status', ['hadir', 'terlambat', 'pulang', 'success'])
                    ->pluck('user_id');
                $query->whereIn('id', $presentIds)->whereNull('deleted_at');
            } elseif ($status === 'izin') {
                $izinIds = AttendanceRecord::whereDate('created_at', $today)
                    ->where('status', 'izin')
                    ->pluck('user_id');
                $query->whereIn('id', $izinIds)->whereNull('deleted_at');
            } elseif ($status === 'sakit') {
                $sakitIds = AttendanceRecord::whereDate('created_at', $today)
                    ->where('status', 'sakit')
                    ->pluck('user_id');
                $query->whereIn('id', $sakitIds)->whereNull('deleted_at');
            }
        }

        $perPage = $request->input('per_page', 9);
        $teachers = $query->paginate($perPage)->withQueryString();

        $teachers->getCollection()->transform(function ($teacher) use ($today) {
            $todayRec = AttendanceRecord::where('user_id', $teacher->id)
                ->whereDate('created_at', $today)
                ->latest()
                ->first();
            $teacher->today_status = $todayRec ? $todayRec->status : null;
            $teacher->today_time = $todayRec ? Carbon::parse($todayRec->created_at)->timezone('Asia/Pontianak')->format('H:i') : null;
            $teacher->today_category = $todayRec ? ($todayRec->metadata['category'] ?? $todayRec->decision_reason) : null;
            return $teacher;
        });

        $totalTeachers = User::where('role', 'teacher')->whereNull('deleted_at')->count();
        $enrolledCount = User::where('role', 'teacher')->whereNull('deleted_at')->whereNotNull('embedding_id')->count();
        $notEnrolledCount = max(0, $totalTeachers - $enrolledCount);

        $presentIdsAll = AttendanceRecord::whereDate('created_at', $today)
            ->whereIn('status', ['hadir', 'terlambat', 'pulang', 'success'])
            ->pluck('user_id')
            ->unique();
        $presentTodayCount = User::where('role', 'teacher')->whereIn('id', $presentIdsAll)->count();

        $leaveIdsAll = AttendanceRecord::whereDate('created_at', $today)
            ->whereIn('status', ['izin', 'sakit'])
            ->pluck('user_id')
            ->unique();
        $leaveTodayCount = User::where('role', 'teacher')->whereIn('id', $leaveIdsAll)->count();

        $stats = [
            'total' => $totalTeachers,
            'enrolled' => $enrolledCount,
            'not_enrolled' => $notEnrolledCount,
            'present_today' => $presentTodayCount,
            'leave_today' => $leaveTodayCount,
            'enrolled_pct' => $totalTeachers > 0 ? round(($enrolledCount / $totalTeachers) * 100) : 0,
        ];

        return Inertia::render('Admin/Teachers/Index', [
            'teachers' => $teachers,
            'stats' => $stats,
            'filters' => $request->only(['search', 'status']),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return Inertia::render('Admin/Teachers/Create');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $validated['role'] = 'teacher';
        $validated['password'] = bcrypt($validated['password']);

        User::create($validated);

        return redirect()->route('admin.teachers.index')->with('success', 'Guru berhasil ditambahkan.');
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        $teacher = User::withTrashed()->findOrFail($id);
        $tz = 'Asia/Pontianak';

        // 20 record presensi terakhir
        $historyRecords = AttendanceRecord::where('user_id', $teacher->id)
            ->orderBy('created_at', 'desc')
            ->take(20)
            ->get()
            ->map(function ($item) use ($tz) {
                $created = $item->created_at ? $item->created_at->timezone($tz) : null;
                $meta = $item->metadata ?? [];
                return [
                    'id' => $item->id,
                    'status' => $item->status,
                    'decision_reason' => $item->decision_reason ?: 'Presensi biometrik',
                    'time' => $created ? $created->format('H:i') : '-',
                    'date' => $created ? $created->format('d M Y') : '-',
                    'euclidean_distance' => $meta['euclidean_distance'] ?? null,
                    'pad_pred' => $meta['pad_pred'] ?? '-',
                    'id_pred' => $meta['id_pred'] ?? '-',
                    'final_decision' => $meta['final_decision'] ?? '-',
                    'ear_blinks' => $meta['ear_blinks'] ?? 0,
                    'mar_mouths' => $meta['mar_mouths'] ?? 0,
                ];
            });

        // Statistik agregat presensi operasional
        $allRecords = AttendanceRecord::where('user_id', $teacher->id);
        $totalPresensi = (clone $allRecords)->count();
        $totalHadir = (clone $allRecords)->whereIn('status', ['success', 'hadir'])->count();
        $totalTerlambat = (clone $allRecords)->where('status', 'terlambat')->count();
        $totalGagal = (clone $allRecords)->whereNotIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit'])->count();

        // Rata-rata telemetri biometrik dari metadata JSON
        $metaRecords = AttendanceRecord::where('user_id', $teacher->id)
            ->whereNotNull('metadata')
            ->get();

        $avgEuclidean = null;
        $avgEarBlinks = null;
        $avgMarMouths = null;

        if ($metaRecords->isNotEmpty()) {
            $distances = $metaRecords->map(fn($r) => $r->metadata['euclidean_distance'] ?? null)->filter()->values();
            $ears = $metaRecords->map(fn($r) => $r->metadata['ear_blinks'] ?? null)->filter()->values();
            $mars = $metaRecords->map(fn($r) => $r->metadata['mar_mouths'] ?? null)->filter()->values();

            $avgEuclidean = $distances->isNotEmpty() ? round($distances->avg(), 3) : null;
            $avgEarBlinks = $ears->isNotEmpty() ? round($ears->avg(), 1) : null;
            $avgMarMouths = $mars->isNotEmpty() ? round($mars->avg(), 1) : null;
        }

        $biometricStats = [
            'total_presensi' => $totalPresensi,
            'total_hadir' => $totalHadir,
            'total_terlambat' => $totalTerlambat,
            'total_gagal' => $totalGagal,
            'avg_euclidean' => $avgEuclidean,
            'avg_ear_blinks' => $avgEarBlinks,
            'avg_mar_mouths' => $avgMarMouths,
        ];

        // Evaluasi riset per subjek (peta S01 → P01)
        $subjectEvaluation = null;
        if ($teacher->embedding_id) {
            $participantId = SubjectLevelAnalysisService::embeddingToParticipant($teacher->embedding_id);
            $subjectEvaluation = SubjectLevelAnalysisService::analyzeSubject($participantId);
        }

        return Inertia::render('Admin/Teachers/Show', [
            'teacher' => $teacher,
            'history' => $historyRecords,
            'biometricStats' => $biometricStats,
            'subjectEvaluation' => $subjectEvaluation,
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(string $id)
    {
        $teacher = User::withTrashed()->findOrFail($id);
        $today = Carbon::today('Asia/Pontianak');

        // Cari log presensi sukses hari ini berdasarkan subject_id (S01, dsb) atau user_id / email
        $todayAttendance = AttendanceRecord::where(function ($query) use ($teacher) {
                                $query->where('user_id', $teacher->id);
                                if (!empty($teacher->embedding_id)) {
                                    $query->orWhere('subject_reference', $teacher->embedding_id);
                                }
                            })
                            ->whereDate('created_at', $today)
                            ->where(function ($q) {
                                $q->where('metadata->final_decision', 'ACCEPT')
                                  ->orWhere('status', 'success')
                                  ->orWhere('status', 'hadir')
                                  ->orWhere('status', 'terlambat')
                                  ->orWhere('status', 'pulang');
                            })
                            ->latest()
                            ->first();

        // Cek jika guru memiliki status izin / sakit hari ini
        $todayDispensation = $teacher->dispensations()
                                    ->whereDate('created_at', $today)
                                    ->latest()
                                    ->first();

        $recentLeaves = AttendanceRecord::where('user_id', $teacher->id)
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
                    'date' => Carbon::parse($rec->created_at)->timezone('Asia/Pontianak')->translatedFormat('d M Y'),
                ];
            });

        // Format data untuk view
        $attendanceFormatted = $todayAttendance ? [
            'is_present' => true,
            'status' => $todayAttendance->status,
            'final_decision' => $todayAttendance->metadata['final_decision'] ?? 'ACCEPT',
            'time' => Carbon::parse($todayAttendance->created_at)->timezone('Asia/Pontianak')->format('H:i'),
            'subject_id' => $todayAttendance->subject_reference ?? $teacher->subject_id ?? $teacher->embedding_id,
            'created_at' => $todayAttendance->created_at,
            'decision_reason' => $todayAttendance->decision_reason,
        ] : null;

        $dispensationFormatted = $todayDispensation ? [
            'type' => strtoupper($todayDispensation->status),
            'status' => $todayDispensation->status,
            'reason' => $todayDispensation->metadata['category'] ?? $todayDispensation->decision_reason ?? ucfirst($todayDispensation->status),
            'document_reference' => $todayDispensation->metadata['document_reference'] ?? null,
            'date' => Carbon::parse($todayDispensation->created_at)->timezone('Asia/Pontianak')->translatedFormat('d M Y'),
        ] : null;

        if (request()->has('blade')) {
            return view('admin.teachers.edit', compact('teacher', 'todayAttendance', 'todayDispensation'));
        }

        return Inertia::render('Admin/Teachers/Edit', [
            'teacher' => $teacher,
            'today_attendance' => $attendanceFormatted,
            'today_dispensation' => $dispensationFormatted,
            'todayAttendance' => $attendanceFormatted,
            'todayDispensation' => $dispensationFormatted,
            'recent_leaves' => $recentLeaves,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        $teacher = User::withTrashed()->findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', Rule::unique('users')->ignore($teacher->id)],
            'attendance_status' => 'nullable|in:izin,sakit,reset,',
            'attendance_category' => 'nullable|string|max:255',
            'attendance_reason' => 'nullable|string|max:500',
            'attendance_doc' => 'nullable|string|max:255',
            'reason' => 'nullable|string',
        ]);

        $teacher->update([
            'name' => $validated['name'],
            'email' => $validated['email']
        ]);

        // Manage teacher attendance status (hanya izin dan sakit)
        $status = $validated['attendance_status'] ?? null;
        $date = Carbon::today('Asia/Jakarta');

        if ($status === 'reset' || (isset($validated['attendance_status']) && $status === '')) {
            AttendanceRecord::where('user_id', $teacher->id)
                ->whereDate('created_at', $date)
                ->whereIn('status', ['izin', 'sakit'])
                ->delete();

            activity()
                ->performedOn($teacher)
                ->causedBy(auth()->user())
                ->withProperties(['reason' => 'Admin menghapus status dispensasi guru'])
                ->log('admin_reset_leave_status');
        } elseif (in_array($status, ['izin', 'sakit'])) {
            $reason = $validated['attendance_reason'] ?? ($status === 'sakit' ? 'Sakit (Surat Dokter)' : 'Izin Dinas Luar / MGMP');
            $category = $validated['attendance_category'] ?? ($status === 'sakit' ? 'Sakit (Surat Dokter)' : 'Izin Dinas Luar / MGMP');

            $existingRecord = AttendanceRecord::where('user_id', $teacher->id)
                ->whereDate('created_at', $date)
                ->first();

            if ($existingRecord) {
                $existingRecord->update([
                    'status' => $status,
                    'decision_reason' => $reason,
                    'verified_at' => Carbon::now('Asia/Jakarta'),
                    'metadata' => array_merge($existingRecord->metadata ?? [], [
                        'source' => 'admin_teacher_edit',
                        'category' => $category,
                        'document_reference' => $validated['attendance_doc'] ?? null,
                        'status_sop' => strtoupper($status),
                        'managed_by' => auth()->user()?->name ?? 'Admin',
                    ]),
                ]);
            } else {
                AttendanceRecord::create([
                    'user_id' => $teacher->id,
                    'subject_reference' => $teacher->embedding_id ?? $teacher->name,
                    'status' => $status,
                    'decision_reason' => $reason,
                    'verified_at' => Carbon::now('Asia/Jakarta'),
                    'created_at' => $date->copy()->setTime(7, 0, 0),
                    'metadata' => [
                        'source' => 'admin_teacher_edit',
                        'category' => $category,
                        'document_reference' => $validated['attendance_doc'] ?? null,
                        'status_sop' => strtoupper($status),
                        'managed_by' => auth()->user()?->name ?? 'Admin',
                    ],
                ]);
            }

            activity()
                ->performedOn($teacher)
                ->causedBy(auth()->user())
                ->withProperties([
                    'status' => $status,
                    'reason' => $reason,
                    'category' => $category,
                    'doc' => $validated['attendance_doc'] ?? null,
                ])
                ->log('admin_set_status_' . $status);
        } else {
            // We use spatie activitylog properties to save the reason
            activity()
                ->performedOn($teacher)
                ->causedBy(auth()->user())
                ->withProperties(['reason' => $validated['reason'] ?? 'Diperbarui oleh admin'])
                ->log('updated_teacher');
        }

        return redirect()->route('admin.teachers.index')->with('success', 'Data guru dan status dispensasi berhasil diperbarui.');
    }

    /**
     * Remove the specified resource from storage (Soft Delete) and revoke template.
     */
    public function destroy(Request $request, string $id)
    {
        $request->validate([
            'reason' => 'nullable|string',
        ]);

        $teacher = User::findOrFail($id);

        // Revoke template if exists
        if ($teacher->embedding_id) {
            // Ideally call FastAPI to remove vector here
            $teacher->embedding_id = null;
            $teacher->save();
        }

        activity()
            ->performedOn($teacher)
            ->causedBy(auth()->user())
            ->withProperties(['reason' => $request->reason ?? 'Dinonaktifkan oleh admin'])
            ->log('disabled_teacher');

        $teacher->delete(); // Soft delete

        return redirect()->route('admin.teachers.index')->with('success', 'Guru berhasil dinonaktifkan dan template dicabut.');
    }

    /**
     * Restore a soft-deleted teacher.
     */
    public function restore(Request $request, string $id)
    {
        $request->validate([
            'reason' => 'nullable|string',
        ]);

        $teacher = User::onlyTrashed()->findOrFail($id);

        activity()
            ->performedOn($teacher)
            ->causedBy(auth()->user())
            ->withProperties(['reason' => $request->reason ?? 'Diaktifkan kembali oleh admin'])
            ->log('restored_teacher');

        $teacher->restore();

        return redirect()->route('admin.teachers.index')->with('success', 'Guru berhasil diaktifkan kembali. (Perlu re-enrollment)');
    }
}
