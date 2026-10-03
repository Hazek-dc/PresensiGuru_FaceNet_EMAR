<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\AttendanceRecord;
use App\Models\EvaluationMatrix;
use App\Models\LightingLog;
use App\Models\LuxCalibration;
use App\Models\User;
use App\Services\AttendanceScheduleService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use Spatie\Activitylog\Models\Activity;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = auth()->user();
        $tz = config('app.timezone', 'Asia/Jakarta');
        $today = Carbon::today($tz);
        $todayRange = [$today->copy()->startOfDay(), $today->copy()->endOfDay()];

        // Hanya status dan guru yang dihitung; metadata presensi (JSON besar) tidak dimuat.
        $records = AttendanceRecord::query()
            ->whereBetween('created_at', $todayRange)
            ->when($user->role === 'teacher', fn ($q) => $q->where('user_id', $user->id))
            ->toBase()
            ->get(['status', 'user_id']);

        $teacherCounts = User::where('role', 'teacher')->toBase()
            ->selectRaw('count(*) as total, count(embedding_id) as enrolled')
            ->first();
        $totalTeachers = (int) $teacherCounts->total;
        $enrolledTeachers = (int) $teacherCounts->enrolled;

        $presentCount = $records->whereIn('status', ['success', 'hadir'])->count();
        $lateCount = $records->where('status', 'terlambat')->count();
        $pulangCount = $records->where('status', 'pulang')->count();
        $izinCount = $records->where('status', 'izin')->count();
        $sakitCount = $records->where('status', 'sakit')->count();
        $closedCount = $records->whereIn('status', ['ditutup', 'alpha'])->count();
        $failedCount = $records->whereIn('status', ['failed', 'invalid', 'gagal'])->count();

        if ($user->role === 'teacher') {
            $absentCount = ($presentCount > 0 || $lateCount > 0 || $pulangCount > 0 || $izinCount > 0 || $sakitCount > 0) ? 0 : 1;
        } else {
            $attendedUserIds = $records->whereIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit'])->pluck('user_id')->unique()->count();
            $absentCount = max(0, $totalTeachers - $attendedUserIds);
        }

        $stats = [
            'present' => $presentCount,
            'late' => $lateCount,
            'pulang' => $pulangCount,
            'izin' => $izinCount,
            'sakit' => $sakitCount,
            'closed' => $closedCount,
            'absent' => $absentCount,
            'failed' => $failedCount,
            'total_teachers' => $totalTeachers,
            'enrolled_teachers' => $enrolledTeachers,
        ];

        // Fetch visible recent attendance history for Dashboard feed
        $visibleQuery = AttendanceRecord::visibleOnDashboard()
            ->with('user:id,name,email,embedding_id');

        if ($user->role === 'teacher') {
            $visibleQuery->where('user_id', $user->id);
        }

        $recentHistory = $visibleQuery->orderBy('created_at', 'desc')->take(15)->get()->map(function ($item) use ($tz) {
            $created = $item->created_at ? $item->created_at->timezone($tz) : null;
            $isToday = $created ? $created->isToday() : false;
            $dateBadge = $isToday ? 'Hari ini' : ($created ? $created->format('d M') : '');

            return [
                'id' => $item->id,
                'status' => $item->status,
                'description' => $item->decision_reason ?: 'Melakukan presensi biometrik',
                'time' => $created ? $created->format('H:i') : '-',
                'date_badge' => $dateBadge,
                'created_at_local' => $created ? $created->format('Y-m-d H:i:s') : '',
                'teacher' => [
                    'name' => $item->user->name ?? 'Guru Tidak Dikenal',
                    'email' => $item->user->email ?? '',
                    'embedding_id' => $item->user->embedding_id ?? null,
                ],
                'is_test_data' => (bool) $item->is_test_data,
            ];
        });

        // Fetch recent teacher activities & system events (Enrollment, logins, biometric updates)
        $activitiesQuery = Activity::with('causer');
        if ($user->role === 'teacher') {
            $activitiesQuery->where(function ($q) use ($user) {
                $q->where('causer_id', $user->id)
                  ->orWhere('subject_id', $user->id);
            });
        }

        // properties dibaca untuk 'event' cadangan saja; isinya tidak dikirim ke halaman.
        $recentActivities = $activitiesQuery->latest()->take(10)->get()->map(function ($act) use ($tz) {
            $created = $act->created_at ? $act->created_at->timezone($tz) : null;
            return [
                'id' => $act->id,
                'description' => $act->description,
                'event' => $act->event ?? ($act->properties['event'] ?? 'system_event'),
                'causer_name' => $act->causer->name ?? 'Sistem',
                'time' => $created ? $created->format('H:i') : '-',
                'date' => $created ? ($created->isToday() ? 'Hari ini' : $created->format('d M')) : '',
                'created_at_human' => $act->created_at ? $act->created_at->diffForHumans() : '',
            ];
        });

        // Daftar guru untuk pilihan subjek Studio. Hanya nama dan kode yang dipakai
        // halaman ini, jadi status template tidak ditanyakan ke mesin biometrik
        // (panggilan HTTP itu bisa menahan Dashboard sampai 5 detik saat mesin sibuk).
        $subjectsList = User::where('role', 'teacher')
            ->get(['id', 'name', 'embedding_id'])
            ->sortBy(function ($u) {
                if (preg_match('/(\d+)/', $u->embedding_id ?? '', $matches)) {
                    return (int) $matches[1];
                }
                return 999;
            })
            ->values()
            ->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'embedding_id' => $u->embedding_id,
            ]);

        // Multi-distance testing telemetry for 30cm, 45cm, and 60cm benchmarks (rentang Subbab 5.2),
        // dihitung dalam satu kueri.
        $bands = [
            'd30' => [30, 40, '30 cm (Dekat)'],
            'd45' => [45, 55, '45 cm (Ideal)'],
            'd60' => [60, 70, '60 cm (Jauh)'],
        ];
        $columns = [];
        $bindings = [];
        foreach ($bands as $key => [$low, $high]) {
            $columns[] = "sum(case when distance_cm between ? and ? then 1 else 0 end) as {$key}_total";
            $columns[] = "sum(case when distance_cm between ? and ? and final_decision = ? then 1 else 0 end) as {$key}_accept";
            array_push($bindings, $low, $high, $low, $high, 'ACCEPT');
        }
        $distanceRow = EvaluationMatrix::query()->toBase()->selectRaw(implode(', ', $columns), $bindings)->first();
        $distanceStats = [];
        foreach ($bands as $key => [$low, , $label]) {
            $distanceStats[$key] = [
                'target_cm' => $low,
                'label' => $label,
                'total' => (int) ($distanceRow->{"{$key}_total"} ?? 0),
                'accept' => (int) ($distanceRow->{"{$key}_accept"} ?? 0),
            ];
        }

        // Statistik pencahayaan (PRD Lux bagian 15). Persentase dihitung dari
        // pemindaian yang lux-nya terukur, bukan dari semua pemindaian. Perkiraan
        // kamera tanpa kalibrasi (lux_source 'camera') dihitung terpisah, bukan
        // sebagai lux terukur.
        $lightingStats = null;
        if (LuxCalibration::tablesReady()) {
            $scope = fn () => LightingLog::query()
                ->when($user->role === 'teacher', fn ($q) => $q->where('user_id', $user->id));
            // Semua angka hari ini dalam satu kueri; lux_source NULL tidak terhitung terukur
            // (sama seperti where lux_source <> 'camera').
            $luxToday = $scope()->toBase()->whereBetween('created_at', $todayRange)->selectRaw(
                'count(*) as scans,'
                . ' sum(case when lux_value is not null and lux_source <> ? then 1 else 0 end) as measured,'
                . ' sum(case when lux_value is not null and lux_source = ? then 1 else 0 end) as estimated,'
                . ' avg(case when lux_value is not null and lux_source <> ? then lux_value end) as measured_avg,'
                . ' avg(case when lux_value is not null and lux_source = ? then lux_value end) as estimated_avg,'
                . ' sum(case when lux_value is not null and lux_source <> ? and lighting_status = ? then 1 else 0 end) as ready,'
                . ' sum(case when lux_value is not null and lux_source <> ? and lighting_status = ? then 1 else 0 end) as warning',
                ['camera', 'camera', 'camera', 'camera', 'camera', 'READY', 'camera', 'WARNING']
            )->first();
            $measuredCount = (int) ($luxToday->measured ?? 0);
            $estimatedCount = (int) ($luxToday->estimated ?? 0);
            $latest = $scope()->whereNotNull('lux_value')->latest('id')->first();
            $pct = fn ($count) => $measuredCount > 0 ? round((int) $count * 100 / $measuredCount, 1) : null;

            $activeCalibration = LuxCalibration::active();
            $currentLux = $latest?->lux_value !== null ? (float) $latest->lux_value : null;
            $lightingStats = [
                'current_lux' => $latest?->lux_value,
                'current_category' => $latest?->lighting_category,
                'current_status' => $latest?->lighting_status,
                'current_source' => $latest?->lux_source,
                'current_source_label' => $latest?->lux_source
                    ? (\App\Services\LightingSummary::SOURCE_LABELS[$latest->lux_source] ?? $latest->lux_source) : null,
                'current_kategori_naskah' => \App\Services\LightingModel::classify($currentLux)['kategori_naskah'],
                'current_at' => $latest?->created_at?->toIso8601String(),
                'calibration' => $activeCalibration ? [
                    'id' => $activeCalibration->id,
                    'reference_label' => ($device = $activeCalibration->referenceDevice())
                        ? (\App\Services\LightingSummary::REFERENCE_LABELS[$device] ?? $device) : null,
                    'points' => count($activeCalibration->points ?? []),
                    'created_at' => $activeCalibration->created_at?->toIso8601String(),
                ] : null,
                'can_calibrate' => in_array($user->role, ['admin', 'researcher'], true),
                'average_today' => $measuredCount > 0 ? round((float) $luxToday->measured_avg, 1) : null,
                'scans_today' => (int) ($luxToday->scans ?? 0),
                'measured_today' => $measuredCount,
                'estimated_today' => $estimatedCount,
                'estimated_average_today' => $estimatedCount > 0 ? round((float) $luxToday->estimated_avg, 1) : null,
                'optimal_pct' => $pct($luxToday->ready ?? 0),
                'warning_pct' => $pct($luxToday->warning ?? 0),
                'calibrated' => $activeCalibration !== null,
            ];
        }

        $currentSchedule = AttendanceScheduleService::evaluate();
        $scheduleMatrix = AttendanceScheduleService::getScheduleMatrix();

        return Inertia::render('Dashboard', [
            'stats' => $stats,
            'recent_history' => $recentHistory,
            'recent_activities' => $recentActivities,
            'subjects_list' => $subjectsList,
            // Jumlah yang benar-benar akan dihapus "Hapus Semua Aktivitas"; hanya
            // dihitung saat dialognya dibuka (router.reload only: clear_all_summary).
            'clear_all_summary' => Inertia::optional(fn () => $this->clearAllSummary($user)),
            'distance_stats' => $distanceStats,
            'lighting_stats' => $lightingStats,
            'timezone' => $tz,
            'today_date' => $today->format('Y-m-d'),
            'schedule_session' => $currentSchedule,
            'schedule_matrix' => $scheduleMatrix,
        ]);
    }

    /**
     * Kueri data yang dihapus "Hapus Semua Aktivitas". Guru hanya presensinya
     * sendiri; matriks evaluasi dan log aktivitas presensi hanya oleh admin.
     *
     * @return array{attendance: \Illuminate\Database\Eloquent\Builder, evaluations: ?\Illuminate\Database\Eloquent\Builder, activities: ?\Illuminate\Database\Eloquent\Builder}
     */
    private function clearAllQueries(User $user): array
    {
        $attendance = AttendanceRecord::query();
        if ($user->role === 'teacher') {
            $attendance->where('user_id', $user->id);
        }
        $isAdmin = $user->role === 'admin';

        return [
            'attendance' => $attendance,
            'evaluations' => $isAdmin ? EvaluationMatrix::query() : null,
            'activities' => $isAdmin ? Activity::where(function ($q) {
                $q->where('log_name', 'dashboard_activity_feed')
                  ->orWhere('log_name', 'attendance')
                  ->orWhere('event', 'like', '%attendance%')
                  ->orWhere('event', 'like', '%presensi%')
                  ->orWhere('description', 'like', '%presensi%')
                  ->orWhere('description', 'like', '%verifikasi wajah%');
            }) : null,
        ];
    }

    /** @return array{attendance: int, evaluations: int, activities: int} */
    private function clearAllSummary(User $user): array
    {
        $queries = $this->clearAllQueries($user);

        return [
            'attendance' => $queries['attendance']->count(),
            'evaluations' => $queries['evaluations']?->count() ?? 0,
            'activities' => $queries['activities']?->count() ?? 0,
        ];
    }

    public function previewHideToday(Request $request)
    {
        $user = auth()->user();
        $tz = config('app.timezone', 'Asia/Jakarta');
        $today = Carbon::today($tz);

        $query = AttendanceRecord::visibleOnDashboard()
            ->with('user')
            ->whereDate('created_at', $today);

        if ($user->role === 'teacher') {
            $query->where('user_id', $user->id);
        }

        $records = $query->orderBy('created_at', 'desc')->get();

        $exactIds = $records->pluck('id')->toArray();
        $count = count($exactIds);

        $payloadToSign = [
            'user_id' => $user->id,
            'exact_ids' => $exactIds,
            'count' => $count,
            'date' => $today->format('Y-m-d'),
            'expires_at' => now()->addMinutes(10)->timestamp,
        ];

        $previewToken = Crypt::encrypt($payloadToSign);

        $itemsSummary = $records->map(function ($r) use ($tz) {
            return [
                'id' => $r->id,
                'status' => $r->status,
                'time' => $r->created_at ? $r->created_at->timezone($tz)->format('H:i:s') : '-',
                'user_name' => $r->user->name ?? 'Unknown',
                'is_test_data' => (bool) $r->is_test_data,
            ];
        })->values()->toArray();

        return response()->json([
            'status' => 'success',
            'preview_token' => $previewToken,
            'exact_ids' => $exactIds,
            'count' => $count,
            'timezone' => $tz,
            'date_str' => $today->locale('id')->translatedFormat('l, d F Y'),
            'can_undo' => false,
            'items_summary' => $itemsSummary,
        ]);
    }

    public function commitHideToday(Request $request)
    {
        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'preview_token' => 'required|string',
            'target_ids' => 'required|array',
            'target_ids.*' => 'integer',
            'reason' => 'required|string|min:5|max:255',
            'confirmation_checked' => 'required|accepted',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors(),
            ], 422);
        }

        $validated = $validator->validated();

        $user = auth()->user();

        // 1. Decrypt & Verify Preview Token
        try {
            $payload = Crypt::decrypt($validated['preview_token']);
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Token preview tidak valid atau sudah kadaluwarsa.'
            ], 422);
        }

        if (($payload['user_id'] ?? null) !== $user->id) {
            return response()->json([
                'status' => 'error',
                'message' => 'Otorisasi token preview tidak sesuai.'
            ], 403);
        }

        if (($payload['expires_at'] ?? 0) < now()->timestamp) {
            return response()->json([
                'status' => 'error',
                'message' => 'Sesi preview telah kadaluwarsa. Silakan muat ulang preview.'
            ], 409);
        }

        $expectedIds = $payload['exact_ids'] ?? [];
        sort($expectedIds);
        $requestIds = $validated['target_ids'];
        sort($requestIds);

        if ($expectedIds !== $requestIds) {
            return response()->json([
                'status' => 'error',
                'message' => 'Daftar ID aktivitas berubah. Silakan lakukan preview ulang.'
            ], 409);
        }

        // 2. Transactional Lock & Validation
        try {
            DB::beginTransaction();

            $tz = config('app.timezone', 'Asia/Jakarta');
            $today = Carbon::today($tz);

            $recordsQuery = AttendanceRecord::whereIn('id', $expectedIds)
                ->whereNull('hidden_from_dashboard_at')
                ->whereDate('created_at', $today)
                ->lockForUpdate();

            if ($user->role === 'teacher') {
                $recordsQuery->where('user_id', $user->id);
            }

            $eligibleRecords = $recordsQuery->get();

            if ($eligibleRecords->count() !== count($expectedIds)) {
                DB::rollBack();
                return response()->json([
                    'status' => 'error',
                    'message' => 'Sebagian data aktivitas tidak lagi valid atau sudah disembunyikan. Operasi dibatalkan.'
                ], 409);
            }

            // 3. Perform Soft-Hide Mutation
            $now = now();
            AttendanceRecord::whereIn('id', $expectedIds)->update([
                'hidden_from_dashboard_at' => $now,
                'hidden_by' => $user->id,
                'hidden_reason' => $validated['reason'],
            ]);

            // 4. Log Immutable Audit Log
            activity('dashboard_activity_feed')
                ->causedBy($user)
                ->withProperties([
                    'hidden_target_ids' => $expectedIds,
                    'hidden_count' => count($expectedIds),
                    'reason' => $validated['reason'],
                    'timezone' => $tz,
                    'date' => $today->format('Y-m-d'),
                    'ip' => $request->ip(),
                ])
                ->log("Disembunyikan " . count($expectedIds) . " aktivitas verifikasi wajah dari feed dashboard hari ini.");

            DB::commit();

            return response()->json([
                'status' => 'success',
                'message' => 'Aktivitas verifikasi wajah hari ini berhasil disembunyikan dari Dashboard.',
                'hidden_count' => count($expectedIds),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal memproses penyembunyian aktivitas: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Clear all attendance activities, records, and evaluation logs permanently.
     */
    public function clearAllAttendanceActivities(Request $request)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json([
                'status' => 'error',
                'message' => 'Sesi login tidak valid.'
            ], 401);
        }

        try {
            DB::beginTransaction();

            // Kueri yang sama dengan ringkasan di dialog konfirmasi (clearAllSummary).
            $queries = $this->clearAllQueries($user);

            $deletedAttendance = $queries['attendance']->count();
            $deletedEvaluations = $queries['evaluations']?->count() ?? 0;

            // Delete attendance records
            $queries['attendance']->delete();

            // Delete evaluation matrices and attendance activity logs (admin only)
            $queries['evaluations']?->delete();
            $queries['activities']?->delete();

            // Log the cleanup event
            activity('dashboard_activity_feed')
                ->causedBy($user)
                ->withProperties([
                    'deleted_attendance_count' => $deletedAttendance,
                    'deleted_evaluations_count' => $deletedEvaluations,
                    'cleared_by_role' => $user->role,
                    'ip' => $request->ip(),
                ])
                ->log("Semua data aktivitas presensi ({$deletedAttendance} entri) dan evaluasi ({$deletedEvaluations} entri) berhasil dihapus.");

            DB::commit();

            return response()->json([
                'status' => 'success',
                'message' => 'Semua aktivitas presensi berhasil dihapus secara permanen.',
                'deleted_attendance' => $deletedAttendance,
                'deleted_evaluations' => $deletedEvaluations,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal menghapus data aktivitas: ' . $e->getMessage()
            ], 500);
        }
    }
}
