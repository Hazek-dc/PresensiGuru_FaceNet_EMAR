<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\AttendanceRecord;
use App\Services\AttendanceScheduleService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = auth()->user();
        $tz = config('app.timezone', 'Asia/Jakarta');
        $today = Carbon::today($tz);

        // Fetch all today's records for stats
        $allRecords = AttendanceRecord::whereBetween('created_at', [
            $today->copy()->startOfDay(),
            $today->copy()->endOfDay(),
        ]);

        if ($user->role === 'teacher') {
            $allRecords->where('user_id', $user->id);
        }
        $records = $allRecords->get();

        $totalTeachers = \App\Models\User::where('role', 'teacher')->count();
        $enrolledTeachers = \App\Models\User::where('role', 'teacher')->whereNotNull('embedding_id')->count();

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
            ->with('user');

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
        $activitiesQuery = \Spatie\Activitylog\Models\Activity::with('causer');
        if ($user->role === 'teacher') {
            $activitiesQuery->where(function ($q) use ($user) {
                $q->where('causer_id', $user->id)
                  ->orWhere('subject_id', $user->id);
            });
        }

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
                'properties' => $act->properties ?? [],
            ];
        });

        // Fetch all 18 registered subjects for Pre-Flight Session Preset
        $subjectsList = \App\Models\User::where('role', 'teacher')
            ->get()
            ->sortBy(function ($u) {
                if (preg_match('/(\d+)/', $u->embedding_id ?? '', $matches)) {
                    return (int) $matches[1];
                }
                return 999;
            })
            ->values()
            ->map(function ($u) {
                return [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'embedding_id' => $u->embedding_id ?: 'S01',
                    'has_embedding' => !empty($u->embedding_id),
                ];
            });

        // Fetch latest evaluation matrix logs
        $latestEvaluations = \App\Models\EvaluationMatrix::latest()->take(10)->get();

        // Multi-distance testing telemetry for 30cm, 45cm, and 60cm benchmarks (rentang Subbab 5.2)
        $distanceStats = [
            'd30' => [
                'target_cm' => 30,
                'label' => '30 cm (Dekat)',
                'total' => \App\Models\EvaluationMatrix::whereBetween('distance_cm', [30, 40])->count(),
                'accept' => \App\Models\EvaluationMatrix::whereBetween('distance_cm', [30, 40])->where('final_decision', 'ACCEPT')->count(),
            ],
            'd45' => [
                'target_cm' => 45,
                'label' => '45 cm (Ideal)',
                'total' => \App\Models\EvaluationMatrix::whereBetween('distance_cm', [45, 55])->count(),
                'accept' => \App\Models\EvaluationMatrix::whereBetween('distance_cm', [45, 55])->where('final_decision', 'ACCEPT')->count(),
            ],
            'd60' => [
                'target_cm' => 60,
                'label' => '60 cm (Jauh)',
                'total' => \App\Models\EvaluationMatrix::whereBetween('distance_cm', [60, 70])->count(),
                'accept' => \App\Models\EvaluationMatrix::whereBetween('distance_cm', [60, 70])->where('final_decision', 'ACCEPT')->count(),
            ],
        ];

        $currentSchedule = AttendanceScheduleService::evaluate();
        $scheduleMatrix = AttendanceScheduleService::getScheduleMatrix();

        return Inertia::render('Dashboard', [
            'stats' => $stats,
            'recent_history' => $recentHistory,
            'recent_activities' => $recentActivities,
            'subjects_list' => $subjectsList,
            'latest_evaluations' => $latestEvaluations,
            'distance_stats' => $distanceStats,
            'timezone' => $tz,
            'today_date' => $today->format('Y-m-d'),
            'schedule_session' => $currentSchedule,
            'schedule_matrix' => $scheduleMatrix,
        ]);
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

            $attendanceQuery = AttendanceRecord::query();
            $evalQuery = \App\Models\EvaluationMatrix::query();

            // If teacher, only clear their own attendance records
            if ($user->role === 'teacher') {
                $attendanceQuery->where('user_id', $user->id);
                $evalQuery->where(function ($q) use ($user) {
                    $q->where('subject_id', $user->embedding_id ?? '---')
                      ->orWhere('claimed_subject_id', $user->embedding_id ?? '---');
                });
            }

            $deletedAttendance = $attendanceQuery->count();
            $deletedEvaluations = $user->role === 'admin' ? $evalQuery->count() : 0;

            // Delete attendance records
            $attendanceQuery->delete();

            // Delete evaluation matrices if admin
            if ($user->role === 'admin') {
                $evalQuery->delete();

                // Clean up attendance and verification activity logs
                \Spatie\Activitylog\Models\Activity::where(function ($q) {
                    $q->where('log_name', 'dashboard_activity_feed')
                      ->orWhere('log_name', 'attendance')
                      ->orWhere('event', 'like', '%attendance%')
                      ->orWhere('event', 'like', '%presensi%')
                      ->orWhere('description', 'like', '%presensi%')
                      ->orWhere('description', 'like', '%verifikasi wajah%');
                })->delete();
            }

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
