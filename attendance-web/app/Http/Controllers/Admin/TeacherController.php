<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use App\Models\User;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Inertia\Inertia;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;
use App\Services\StaffProfile;
use App\Services\SubjectLevelAnalysisService;

class TeacherController extends Controller
{
    /** Status presensi yang dihitung "hadir hari ini" di filter dan statistik. */
    private const PRESENT_STATUSES = ['hadir', 'terlambat', 'pulang', 'success'];

    private const STATUS_FILTERS = ['active', 'enrolled', 'not_enrolled', 'hadir', 'izin', 'sakit', 'guru', 'staff_tu', 'no_position', 'disabled'];

    /** Filter yang jumlahnya tampil di chip halaman daftar guru. */
    private const COUNTED_FILTERS = ['hadir', 'izin', 'sakit', 'enrolled', 'not_enrolled', 'guru', 'staff_tu', 'no_position', 'disabled'];

    private const SORTS = ['name', 'name_desc', 'newest', 'oldest'];

    private const PER_PAGE_OPTIONS = [9, 18, 36];

    /**
     * Display a listing of the teachers.
     */
    public function index(Request $request)
    {
        $today = Carbon::today('Asia/Pontianak');

        $search = mb_substr(trim((string) $request->input('search', '')), 0, 100);
        $status = (string) $request->input('status', '');
        if ($status === 'present') {
            $status = 'hadir';
        }
        if (! in_array($status, self::STATUS_FILTERS, true)) {
            $status = '';
        }
        $sort = in_array($request->input('sort'), self::SORTS, true) ? $request->input('sort') : 'name';
        $perPage = (int) $request->input('per_page', 9);
        if (! in_array($perPage, self::PER_PAGE_OPTIONS, true)) {
            $perPage = 9;
        }

        $todayIds = $this->todayAttendanceIds($today);

        $query = $this->applyStatusFilter($this->teacherSearch($search), $status, $todayIds);
        $this->applySort($query, $sort);
        $teachers = $query->paginate($perPage)->withQueryString();

        // Satu kueri untuk presensi hari ini semua guru di halaman ini; yang terbaru per guru dipakai.
        $todayRecords = AttendanceRecord::whereIn('user_id', $teachers->getCollection()->pluck('id'))
            ->whereDate('created_at', $today)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->groupBy('user_id')
            ->map(fn ($records) => $records->first());

        $teachers->getCollection()->transform(function ($teacher) use ($todayRecords) {
            $todayRec = $todayRecords->get($teacher->id);
            $teacher->today_status = $todayRec ? $todayRec->status : null;
            $teacher->today_time = $todayRec ? Carbon::parse($todayRec->created_at)->timezone('Asia/Pontianak')->format('H:i') : null;
            $teacher->today_category = $todayRec ? ($todayRec->metadata['category'] ?? $todayRec->decision_reason) : null;
            return $teacher;
        });

        // Jumlah di tiap chip ikut kata pencarian: angkanya sama dengan hasil bila chip diklik.
        $counts = ['all' => $this->teacherSearch($search)->count()];
        foreach (self::COUNTED_FILTERS as $filter) {
            $counts[$filter] = $this->applyStatusFilter($this->teacherSearch($search), $filter, $todayIds)->count();
        }

        return Inertia::render('Admin/Teachers/Index', [
            'teachers' => $teachers,
            // Kartu statistik tidak bergantung pada filter; dilewati saat muat ulang parsial.
            'stats' => fn () => $this->teacherStats($todayIds),
            'counts' => $counts,
            'filters' => [
                'search' => $search,
                'status' => $status,
                'sort' => $sort,
                'per_page' => $perPage,
            ],
        ]);
    }

    /**
     * ID guru yang punya catatan presensi hari ini, per kelompok status.
     *
     * @return array{hadir: array<int>, izin: array<int>, sakit: array<int>}
     */
    private function todayAttendanceIds(Carbon $today): array
    {
        $rows = AttendanceRecord::whereDate('created_at', $today)
            ->whereIn('status', [...self::PRESENT_STATUSES, 'izin', 'sakit'])
            ->get(['user_id', 'status']);

        $idsWith = fn (array $statuses) => $rows->whereIn('status', $statuses)->pluck('user_id')->unique()->values()->all();

        return [
            'hadir' => $idsWith(self::PRESENT_STATUSES),
            'izin' => $idsWith(['izin']),
            'sakit' => $idsWith(['sakit']),
        ];
    }

    /** Semua guru (termasuk nonaktif) yang nama, email, ID wajah, atau bidang studinya memuat kata pencarian. */
    private function teacherSearch(string $search): Builder
    {
        $query = User::where('role', 'teacher')->withTrashed();
        if ($search === '') {
            return $query;
        }

        // LOWER agar tidak peka huruf besar di PostgreSQL maupun SQLite; % dan _ dicari sebagai huruf biasa.
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($search)).'%';

        return $query->where(function (Builder $q) use ($pattern) {
            foreach (['name', 'email', 'embedding_id'] as $column) {
                $q->orWhereRaw("LOWER({$column}) LIKE ? ESCAPE '!'", [$pattern]);
            }
            // subjects berisi JSON; CAST agar LOWER bisa dipakai di PostgreSQL.
            $q->orWhereRaw("LOWER(CAST(subjects AS TEXT)) LIKE ? ESCAPE '!'", [$pattern]);
        });
    }

    /** @param array{hadir: array<int>, izin: array<int>, sakit: array<int>} $todayIds */
    private function applyStatusFilter(Builder $query, string $status, array $todayIds): Builder
    {
        return match ($status) {
            'disabled' => $query->onlyTrashed(),
            'active' => $query->whereNull('deleted_at'),
            'enrolled' => $query->whereNotNull('embedding_id')->whereNull('deleted_at'),
            'not_enrolled' => $query->whereNull('embedding_id')->whereNull('deleted_at'),
            'hadir', 'izin', 'sakit' => $query->whereIn('id', $todayIds[$status])->whereNull('deleted_at'),
            'guru', 'staff_tu' => $query->where('position', $status)->whereNull('deleted_at'),
            'no_position' => $query->whereNull('position')->whereNull('deleted_at'),
            default => $query,
        };
    }

    /** Urutan selalu diakhiri ID agar halaman berikutnya tidak mengulang atau melewatkan guru. */
    private function applySort(Builder $query, string $sort): void
    {
        match ($sort) {
            'name_desc' => $query->orderByRaw('LOWER(name) desc')->orderByDesc('id'),
            'newest' => $query->orderByDesc('created_at')->orderByDesc('id'),
            'oldest' => $query->orderBy('created_at')->orderBy('id'),
            default => $query->orderByRaw('LOWER(name) asc')->orderBy('id'),
        };
    }

    /** @param array{hadir: array<int>, izin: array<int>, sakit: array<int>} $todayIds */
    private function teacherStats(array $todayIds): array
    {
        $totalTeachers = User::where('role', 'teacher')->whereNull('deleted_at')->count();
        $enrolledCount = User::where('role', 'teacher')->whereNull('deleted_at')->whereNotNull('embedding_id')->count();
        $leaveIds = array_values(array_unique([...$todayIds['izin'], ...$todayIds['sakit']]));

        return [
            'total' => $totalTeachers,
            'enrolled' => $enrolledCount,
            'not_enrolled' => max(0, $totalTeachers - $enrolledCount),
            'present_today' => User::where('role', 'teacher')->whereIn('id', $todayIds['hadir'])->count(),
            'leave_today' => User::where('role', 'teacher')->whereIn('id', $leaveIds)->count(),
            'enrolled_pct' => $totalTeachers > 0 ? round(($enrolledCount / $totalTeachers) * 100) : 0,
        ];
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return Inertia::render('Admin/Teachers/Create', StaffProfile::formProps());
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
            ...StaffProfile::rules(),
        ], StaffProfile::messages());

        User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => bcrypt($validated['password']),
            'role' => 'teacher',
            ...StaffProfile::attributes($validated),
        ]);

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
            ...StaffProfile::formProps(),
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
            ...StaffProfile::rules(),
        ], StaffProfile::messages());

        $teacher->update([
            'name' => $validated['name'],
            'email' => $validated['email'],
            // Form lama (tampilan blade) tidak mengirim jabatan; jangan hapus yang sudah tersimpan.
            ...($request->has('position') ? StaffProfile::attributes($validated) : []),
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
