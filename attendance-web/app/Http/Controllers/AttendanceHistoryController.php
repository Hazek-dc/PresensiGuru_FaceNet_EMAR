<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\AttendanceRecord;
use App\Models\EvaluationMatrix;
use App\Services\CochranExportService;
use App\Services\SubjectLevelAnalysisService;
use Carbon\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttendanceHistoryController extends Controller
{
    public function index(Request $request)
    {
        $user = auth()->user();
        $tz = config('app.timezone', 'Asia/Jakarta');
        $tab = $request->input('tab', 'presensi');
        $search = $request->input('search', '');
        $date = $request->input('date', '');
        $status = $request->input('status', '');

        $activityEvent = $request->input('activity_event', '');

        // 1. Presensi Records Query
        $presensiQuery = AttendanceRecord::with('user');

        if ($user->role === 'teacher') {
            $presensiQuery->where('user_id', $user->id);
        }

        if (!empty($search)) {
            $presensiQuery->where(function ($q) use ($search) {
                $q->where('decision_reason', 'like', "%{$search}%")
                  ->orWhere('status', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%")
                         ->orWhere('embedding_id', 'like', "%{$search}%");
                  });
            });
        }

        if (!empty($date)) {
            $presensiQuery->whereDate('created_at', clone new Carbon($date));
        }

        if (!empty($status)) {
            if ($status === 'hadir' || $status === 'success') {
                $presensiQuery->whereIn('status', ['success', 'hadir']);
            } elseif ($status === 'izin_sakit') {
                $presensiQuery->whereIn('status', ['izin', 'sakit']);
            } elseif ($status === 'failed') {
                $presensiQuery->whereNotIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit']);
            } else {
                $presensiQuery->where('status', $status);
            }
        }

        $records = $presensiQuery->orderBy('created_at', 'desc')
            ->paginate(15)
            ->withQueryString()
            ->through(function ($item) use ($tz) {
                $created = $item->created_at ? $item->created_at->timezone($tz) : null;
                $meta = $item->metadata ?? [];

                $dist = isset($meta['euclidean_distance']) ? (float)$meta['euclidean_distance'] : null;
                $earBlinks = $meta['ear_blinks'] ?? 0;
                $marMouths = $meta['mar_mouths'] ?? 0;

                // Bab 5 Evaluation Scenarios (S1, S2, S3)
                $bab5 = $meta['evaluation_bab5'] ?? null;
                if (!$bab5 && $dist !== null) {
                    $s1 = ($dist <= (float) config('biometrics.facenet_threshold', 0.40)) ? 1 : 0;
                    $earVal = (float)($meta['ear_val'] ?? ($earBlinks > 0 ? 0.18 : 0.28));
                    $marVal = (float)($meta['mar_val'] ?? ($marMouths > 0 ? 0.40 : 0.05));
                    $livenessValid = ($earVal < (float) config('biometrics.ear_threshold', 0.20))
                        && ($marVal >= (float) config('biometrics.mar_threshold', 0.10));
                    $s2 = ($s1 === 1 && $livenessValid) ? 1 : 0;
                    $pFace = max(0.0, 1.0 - ($dist / 1.5));
                    $pLive = $livenessValid ? 1.0 : 0.0;
                    $sFinal = (0.6 * $pFace) + (0.4 * $pLive);
                    $s3 = ($sFinal >= 0.75) ? 1 : 0;

                    $bab5 = [
                        'euclidean_distance' => round($dist, 3),
                        's1_decision' => $s1,
                        's2_decision' => $s2,
                        's3_decision' => $s3,
                        's_final' => round($sFinal, 3),
                        'p_face' => round($pFace, 3),
                        'p_live' => round($pLive, 3),
                        'ear_val' => round($earVal, 3),
                        'mar_val' => round($marVal, 3),
                        'liveness_valid' => $livenessValid,
                    ];
                }

                return [
                    'id' => $item->id,
                    'status' => $item->status,
                    'decision_reason' => $item->decision_reason ?: 'Presensi biometrik',
                    'time' => $created ? $created->format('H:i') : '-',
                    'date' => $created ? $created->format('d M Y') : '-',
                    'created_at_formatted' => $created ? $created->format('d/m/Y H:i:s') : '-',
                    'user' => $item->user ? [
                        'id' => $item->user->id,
                        'name' => $item->user->name,
                        'email' => $item->user->email,
                        'embedding_id' => $item->user->embedding_id,
                    ] : null,
                    'metadata' => [
                        'facenet_score' => $meta['facenet_score'] ?? null,
                        'emar_score' => $meta['emar_score'] ?? null,
                        'euclidean_distance' => $meta['euclidean_distance'] ?? null,
                        // null = tidak terukur; jangan diganti nilai preset.
                        'distance_cm' => $meta['distance_cm'] ?? null,
                        'distance_source' => $meta['distance_source'] ?? null,
                        'lux' => $meta['lux'] ?? null,
                        'lux_source' => $meta['lux_source'] ?? null,
                        'ear_blinks' => $meta['ear_blinks'] ?? 0,
                        'mar_mouths' => $meta['mar_mouths'] ?? 0,
                        'face_detected_pct' => $meta['face_detected_pct'] ?? 100,
                        'scan_duration_s' => $meta['scan_duration_s'] ?? 8,
                        'pad_pred' => $meta['pad_pred'] ?? 'BONA_FIDE',
                        'id_pred' => $meta['id_pred'] ?? 'MATCH',
                        'final_decision' => $meta['final_decision'] ?? ($item->status === 'success' ? 'ACCEPT' : 'REJECT'),
                        'evaluation_bab5' => $bab5,
                    ],
                ];
            });

        // 2. System Audit / Activity Log Query
        $activitiesQuery = \Spatie\Activitylog\Models\Activity::with('causer');

        if ($user->role === 'teacher') {
            $activitiesQuery->where(function ($q) use ($user) {
                $q->where('causer_id', $user->id)
                  ->orWhere('subject_id', $user->id);
            });
        }

        if (!empty($activityEvent) && $activityEvent !== 'all') {
            if ($activityEvent === 'attendance') {
                $activitiesQuery->where(function ($q) {
                    $q->where('log_name', 'attendance')
                      ->orWhere('event', 'like', '%attendance%')
                      ->orWhere('event', 'like', '%biometric%')
                      ->orWhere('description', 'like', '%presensi%');
                });
            } elseif ($activityEvent === 'enrollment') {
                $activitiesQuery->where(function ($q) {
                    $q->where('event', 'like', '%enroll%')
                      ->orWhere('description', 'like', '%wajah%')
                      ->orWhere('description', 'like', '%enroll%');
                });
            } elseif ($activityEvent === 'auth') {
                $activitiesQuery->where(function ($q) {
                    $q->where('event', 'like', '%login%')
                      ->orWhere('event', 'like', '%logout%')
                      ->orWhere('description', 'like', '%login%')
                      ->orWhere('description', 'like', '%logout%');
                });
            } elseif ($activityEvent === 'system') {
                $activitiesQuery->where(function ($q) {
                    $q->where('event', 'like', '%delete%')
                      ->orWhere('event', 'like', '%clear%')
                      ->orWhere('description', 'like', '%hapus%')
                      ->orWhere('description', 'like', '%membersihkan%');
                });
            } else {
                $activitiesQuery->where('event', $activityEvent);
            }
        }

        if (!empty($search)) {
            $activitiesQuery->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                  ->orWhere('event', 'like', "%{$search}%")
                  ->orWhereHas('causer', function ($cq) use ($search) {
                      $cq->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        $activities = $activitiesQuery->latest()
            ->paginate(15, ['*'], 'activity_page')
            ->withQueryString()
            ->through(function ($act) use ($tz) {
                $created = $act->created_at ? $act->created_at->timezone($tz) : null;
                $props = $act->properties ? $act->properties->toArray() : [];
                return [
                    'id' => $act->id,
                    'description' => $act->description,
                    'event' => $act->event ?? ($props['event'] ?? 'system_event'),
                    'log_name' => $act->log_name ?? 'default',
                    'causer_name' => $act->causer->name ?? 'Sistem',
                    'causer_email' => $act->causer->email ?? '-',
                    'time' => $created ? $created->format('H:i') : '-',
                    'date' => $created ? $created->format('d M Y') : '-',
                    'created_at_formatted' => $created ? $created->format('d/m/Y H:i:s') : '-',
                    'created_at_human' => $act->created_at ? $act->created_at->diffForHumans() : '',
                    'properties' => $props,
                ];
            });

        // 3. Summary Statistics for Attendance
        $statsBase = AttendanceRecord::query();
        if ($user->role === 'teacher') {
            $statsBase->where('user_id', $user->id);
        }
        $totalPresensi = (clone $statsBase)->count();
        $totalHadir = (clone $statsBase)->whereIn('status', ['success', 'hadir'])->count();
        $totalTerlambat = (clone $statsBase)->where('status', 'terlambat')->count();
        $totalPulang = (clone $statsBase)->where('status', 'pulang')->count();
        $totalIzinSakit = (clone $statsBase)->whereIn('status', ['izin', 'sakit'])->count();
        $totalFailed = (clone $statsBase)->whereNotIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit'])->count();
        $successRate = $totalPresensi > 0 ? round((($totalHadir + $totalTerlambat + $totalPulang) / $totalPresensi) * 100, 1) : 0;

        $summaryStats = [
            'total' => $totalPresensi,
            'hadir' => $totalHadir,
            'terlambat' => $totalTerlambat,
            'pulang' => $totalPulang,
            'izin_sakit' => $totalIzinSakit,
            'failed' => $totalFailed,
            'success_rate' => $successRate,
        ];

        return Inertia::render('Attendance/History', [
            'records' => $records,
            'activities' => $activities,
            'summaryStats' => $summaryStats,
            'filters' => [
                'tab' => $tab,
                'search' => $search,
                'date' => $date,
                'status' => $status,
                'activity_event' => $activityEvent,
            ],
            'isAdmin' => in_array($user->role, ['admin', 'researcher']),
            'subjectAnalysis' => in_array($user->role, ['admin', 'researcher'])
                ? SubjectLevelAnalysisService::analyze()
                : null,
        ]);
    }

    public function show(string $id)
    {
        $user = auth()->user();
        $record = AttendanceRecord::with('user')->findOrFail($id);

        if ($user->role === 'teacher' && $record->user_id !== $user->id) {
            abort(403, 'Unauthorized access to this record.');
        }

        $metadata = $record->metadata ?? [];
        if (!isset($metadata['evaluation_bab5'])) {
            $dist = isset($metadata['euclidean_distance']) ? (float)$metadata['euclidean_distance'] : null;
            if ($dist !== null) {
                $earBlinks = $metadata['ear_blinks'] ?? 0;
                $marMouths = $metadata['mar_mouths'] ?? 0;
                $s1 = ($dist <= (float) config('biometrics.facenet_threshold', 0.40)) ? 1 : 0;
                $earVal = (float)($metadata['ear_val'] ?? ($earBlinks > 0 ? 0.18 : 0.28));
                $marVal = (float)($metadata['mar_val'] ?? ($marMouths > 0 ? 0.40 : 0.05));
                $livenessValid = ($earVal < (float) config('biometrics.ear_threshold', 0.20))
                    && ($marVal >= (float) config('biometrics.mar_threshold', 0.10));
                $s2 = ($s1 === 1 && $livenessValid) ? 1 : 0;
                $pFace = max(0.0, 1.0 - ($dist / 1.5));
                $pLive = $livenessValid ? 1.0 : 0.0;
                $sFinal = (0.6 * $pFace) + (0.4 * $pLive);
                $s3 = ($sFinal >= 0.75) ? 1 : 0;

                $metadata['evaluation_bab5'] = [
                    'euclidean_distance' => round($dist, 3),
                    's1_decision' => $s1,
                    's2_decision' => $s2,
                    's3_decision' => $s3,
                    's_final' => round($sFinal, 3),
                    'p_face' => round($pFace, 3),
                    'p_live' => round($pLive, 3),
                    'ear_val' => round($earVal, 3),
                    'mar_val' => round($marVal, 3),
                    'liveness_valid' => $livenessValid,
                ];
            }
        }

        if ($user->role !== 'researcher') {
            unset($metadata['facenet_score']);
            unset($metadata['emar_score']);
        }
        $record->metadata = $metadata;

        return Inertia::render('Attendance/Show', [
            'record' => $record,
            'isResearcher' => $user->role === 'researcher',
        ]);
    }

    /**
     * Download CSV for all system audit & activity logs
     */
    public function exportActivities(Request $request): StreamedResponse
    {
        $user = auth()->user();
        $tz = config('app.timezone', 'Asia/Jakarta');
        $query = \Spatie\Activitylog\Models\Activity::with('causer')->latest();

        if ($user->role === 'teacher') {
            $query->where(function ($q) use ($user) {
                $q->where('causer_id', $user->id)
                  ->orWhere('subject_id', $user->id);
            });
        }

        $activities = $query->get();
        $fileName = 'Log_Aktivitas_Sistem_' . now()->format('Ymd_His') . '.csv';

        return response()->streamDownload(function () use ($activities, $tz) {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                'ID_Log',
                'Waktu_Kejadian',
                'Tanggal',
                'Kategori_Log',
                'Event',
                'Aktor_Pengguna',
                'Email_Aktor',
                'Deskripsi_Aktivitas',
                'Properti_Detail',
            ]);

            foreach ($activities as $act) {
                $created = $act->created_at ? $act->created_at->timezone($tz) : null;
                $causer = $act->causer;
                $props = $act->properties ? json_encode($act->properties->toArray(), JSON_UNESCAPED_UNICODE) : '{}';

                fputcsv($handle, [
                    $act->id,
                    $created ? $created->format('H:i:s') : '-',
                    $created ? $created->format('Y-m-d') : '-',
                    $act->log_name ?: 'system',
                    $act->event ?: ($act->properties['event'] ?? 'event'),
                    $causer->name ?? 'Sistem',
                    $causer->email ?? '-',
                    $act->description ?: '-',
                    $props,
                ]);
            }

            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }

    /**
     * Download CSV for all operational attendance records
     */
    public function exportOperational(Request $request): StreamedResponse
    {
        $user = auth()->user();
        $query = AttendanceRecord::with('user')->orderBy('created_at', 'desc');

        if ($user->role === 'teacher') {
            $query->where('user_id', $user->id);
        }

        $records = $query->get();
        $fileName = 'Riwayat_Presensi_Operasional_' . now()->format('Ymd_His') . '.csv';

        return response()->streamDownload(function () use ($records) {
            $handle = fopen('php://output', 'w');
            // UTF-8 BOM for Excel compatibility
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                'ID_Record',
                'ID_Subjek',
                'Nama_Guru',
                'Email',
                'Status_Presensi',
                'Keputusan_Final',
                'PAD_Prediction',
                'ID_Prediction',
                'Jarak_Euclidean',
                'FaceNet_Score',
                'EMAR_Score',
                'Kedipan_EAR',
                'Mulut_MAR',
                'Wajah_Stabil_Pct',
                'Jarak_cm',
                'Lux',
                'Durasi_Scan_s',
                'Waktu_Presensi',
                'Pesan_Status',
            ]);

            foreach ($records as $r) {
                $meta = $r->metadata ?? [];
                $teacher = $r->user;
                fputcsv($handle, [
                    $r->id,
                    $teacher->embedding_id ?? ($meta['subject_id'] ?? 'S00'),
                    $teacher->name ?? 'Guru',
                    $teacher->email ?? '',
                    $r->status,
                    $meta['final_decision'] ?? ($r->status === 'success' ? 'ACCEPT' : 'REJECT'),
                    $meta['pad_pred'] ?? 'BONA_FIDE',
                    $meta['id_pred'] ?? 'MATCH',
                    isset($meta['euclidean_distance']) ? number_format($meta['euclidean_distance'], 3) : '-',
                    isset($meta['facenet_score']) ? number_format($meta['facenet_score'], 3) : '-',
                    isset($meta['emar_score']) ? number_format($meta['emar_score'], 3) : '-',
                    $meta['ear_blinks'] ?? 0,
                    $meta['mar_mouths'] ?? 0,
                    isset($meta['face_detected_pct']) ? number_format($meta['face_detected_pct'], 1) : 100.0,
                    $meta['distance_cm'] ?? '',
                    $meta['lux'] ?? '',
                    $meta['scan_duration_s'] ?? 8.0,
                    $r->created_at ? $r->created_at->format('Y-m-d H:i:s') : '',
                    $r->decision_reason ?: '',
                ]);
            }

            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }

    /**
     * Download CSV for research evaluation matrix (Bab 4)
     */
    public function exportResearch(Request $request): StreamedResponse|\Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        $csvPath = (string) config('biometrics.research_csv.matriks');
        if (file_exists($csvPath)) {
            return response()->download($csvPath, 'Matriks_Evaluasi_Bab4.csv', [
                'Content-Type' => 'text/csv; charset=UTF-8',
            ]);
        }

        // Fallback: bangun dari EvaluationMatrix, hanya presentasi yang diukur mesin.
        // Baris tanpa penanda sumber berasal dari versi lama dan tetap disertakan.
        $records = EvaluationMatrix::orderBy('created_at', 'desc')->get()
            ->reject(fn ($m) => in_array(
                $m->raw_metadata['biometric_source'] ?? null,
                ['simulated', 'fta', 'unavailable'],
                true
            ));
        $fileName = 'Matriks_Evaluasi_Bab4_' . now()->format('Ymd_His') . '.csv';

        return response()->streamDownload(function () use ($records) {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                'File_Uji',
                'Claimed_ID',
                'Sample_Type',
                'PAI_Species',
                'Lux',
                'Jarak_cm',
                'Session',
                'PAD_Pred',
                'ID_Pred',
                'Jarak',
                'Kedipan',
                'Mulut',
                'Wajah_%',
                'Durasi_s',
                'Final',
                'Error',
            ]);

            foreach ($records as $m) {
                // Sel dikosongkan bila nilainya tidak terekam, tidak diisi tebakan.
                $num = fn ($v, int $dp) => $v === null ? '' : number_format((float) $v, $dp, '.', '');
                fputcsv($handle, [
                    "LIVE_{$m->subject_id}.webm",
                    $m->claimed_subject_id ?: $m->subject_id,
                    $m->sample_type ?? '',
                    $m->sample_type === null ? '' : ($m->sample_type === 'BONA_FIDE' ? 'NONE' : 'ATTACK'),
                    $m->lux_value ?? '',
                    $m->distance_cm ?? '',
                    $m->session_type ?? '',
                    $m->pad_prediction ?? '',
                    $m->id_prediction ?? '',
                    $num($m->euclidean_distance, 3),
                    $m->ear_blink_count ?? '',
                    $m->mar_mouth_count ?? '',
                    $num($m->face_detected_pct, 1),
                    $num($m->scan_duration_sec, 2),
                    $m->final_decision ?? '',
                    '',
                ]);
            }

            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * Unduh presentasi uji berpasangan (S1/S2/S3) yang benar-benar terekam
     * oleh capture_session.py. Nama berkas memuat jumlah baris sebenarnya;
     * rancangan penuh adalah 3.240 presentasi (18 x 9 kondisi x 4 label x 5).
     */
    public function exportCochran(Request $request): StreamedResponse
    {
        return CochranExportService::streamCsvResponse();
    }

    /**
     * Download single subject attendance & evaluation matrix as CSV
     */
    public function exportSubject(Request $request, string $id): StreamedResponse
    {
        $user = auth()->user();
        
        // Find record by primary ID or latest for that subject
        if (is_numeric($id)) {
            $record = AttendanceRecord::with('user')->findOrFail($id);
        } else {
            // Find by embedding_id
            $targetUser = \App\Models\User::where('embedding_id', $id)->first();
            $query = AttendanceRecord::with('user');
            if ($targetUser) {
                $query->where('user_id', $targetUser->id);
            }
            $record = $query->latest()->firstOrFail();
        }

        if ($user->role === 'teacher' && $record->user_id !== $user->id) {
            abort(403, 'Unauthorized access to this record.');
        }

        $meta = $record->metadata ?? [];
        $teacher = $record->user;
        $subjectId = $teacher->embedding_id ?? ($meta['subject_id'] ?? 'S01');
        $fileName = "Presensi_Evaluasi_{$subjectId}_" . ($record->created_at ? $record->created_at->format('Ymd_His') : now()->format('Ymd_His')) . '.csv';

        return response()->streamDownload(function () use ($record, $meta, $teacher, $subjectId) {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                'Parameter',
                'Nilai_Evaluasi',
                'Keterangan',
            ]);

            fputcsv($handle, ['ID_Subjek', $subjectId, 'Identitas Subjek Terdaftar (S01 - S18)']);
            fputcsv($handle, ['Nama_Guru', $teacher->name ?? 'Guru', 'Nama Lengkap Guru / Staf']);
            fputcsv($handle, ['Email_Guru', $teacher->email ?? '-', 'Alamat Surel Terdaftar']);
            fputcsv($handle, ['Waktu_Presensi', $record->created_at ? $record->created_at->format('Y-m-d H:i:s') : '-', 'Timestamp Pelaksanaan Scan Presensi']);
            fputcsv($handle, ['Status_Presensi', strtoupper($record->status), 'Status Kehadiran Sistem (HADIR / GAGAL / TERLAMBAT)']);
            fputcsv($handle, ['Keputusan_Final', $meta['final_decision'] ?? ($record->status === 'success' ? 'ACCEPT' : 'REJECT'), 'Keputusan Fusi Biometrik Bab 3 (ACCEPT / REJECT)']);
            fputcsv($handle, ['PAD_Prediction', $meta['pad_pred'] ?? 'BONA_FIDE', 'Klasifikasi Liveness Anti-Spoofing (BONA_FIDE / ATTACK)']);
            fputcsv($handle, ['ID_Prediction', $meta['id_pred'] ?? 'MATCH', 'Klasifikasi Pengenalan Identitas FaceNet (MATCH / NON_MATCH)']);
            fputcsv($handle, ['Jarak_Euclidean_L2', isset($meta['euclidean_distance']) ? number_format($meta['euclidean_distance'], 3) : '-', 'Jarak Euclidean Vektor Embedding (Threshold <= 0.40)']);
            fputcsv($handle, ['FaceNet_Score', isset($meta['facenet_score']) ? number_format($meta['facenet_score'], 3) : '-', 'Skor Kesamaan Wajah FaceNet (128-D)']);
            fputcsv($handle, ['EMAR_Score', isset($meta['emar_score']) ? number_format($meta['emar_score'], 3) : '-', 'Skor Fusi Liveness EMAR']);
            fputcsv($handle, ['Kedipan_Mata_EAR', $meta['ear_blinks'] ?? 0, 'Jumlah Kedipan Mata Terdeteksi (EAR < 0.20, Min 1x)']);
            fputcsv($handle, ['Gerakan_Mulut_MAR', $meta['mar_mouths'] ?? 0, 'Jumlah Gerakan Mulut Terdeteksi (MAR >= 0.10, Min 1x)']);
            fputcsv($handle, ['Kestabilan_Wajah_Pct', (isset($meta['face_detected_pct']) ? number_format($meta['face_detected_pct'], 1) : '100.0') . '%', 'Persentase Frame Wajah Terlacak Stabil (Min 80.0%)']);
            fputcsv($handle, ['Jarak_Pengujian_cm', isset($meta['distance_cm']) ? $meta['distance_cm'] . ' cm' : 'Tidak terukur', 'Jarak Baku Kamera Smartphone ke Wajah']);
            fputcsv($handle, ['Intensitas_Cahaya_Lux', isset($meta['lux']) ? $meta['lux'] . ' Lux' : 'Tidak terukur', 'Kondisi Pencahayaan Lingkungan Uji']);
            fputcsv($handle, ['Durasi_Scan_Detik', ($meta['scan_duration_s'] ?? 8.0) . ' Detik', 'Jendela Waktu Pemindaian Biometrik']);
            fputcsv($handle, ['Pesan_Evaluasi', $record->decision_reason ?: '-', 'Penjelasan Keputusan Engine Biometrik']);

            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }

    /**
     * Download CSV for the most recent presensi record
     */
    public function exportLatest(Request $request): StreamedResponse
    {
        $user = auth()->user();
        $query = AttendanceRecord::with('user');

        if ($user->role === 'teacher') {
            $query->where('user_id', $user->id);
        }

        $latestRecord = $query->latest()->firstOrFail();

        return $this->exportSubject($request, (string) $latestRecord->id);
    }

    /**
     * Get formatted JSON records for client-side table PDF export (jsPDF + autoTable)
     */
    public function exportPdfData(Request $request)
    {
        $user = auth()->user();
        $tz = config('app.timezone', 'Asia/Jakarta');
        $search = $request->input('search', '');
        $date = $request->input('date', '');
        $status = $request->input('status', '');

        $query = AttendanceRecord::with('user');
        if ($user->role === 'teacher') {
            $query->where('user_id', $user->id);
        }

        if (!empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('decision_reason', 'like', "%{$search}%")
                  ->orWhere('status', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%")
                         ->orWhere('embedding_id', 'like', "%{$search}%");
                  });
            });
        }

        if (!empty($date)) {
            $query->whereDate('created_at', clone new Carbon($date));
        }

        if (!empty($status)) {
            if ($status === 'hadir' || $status === 'success') {
                $query->whereIn('status', ['success', 'hadir']);
            } elseif ($status === 'izin_sakit') {
                $query->whereIn('status', ['izin', 'sakit']);
            } elseif ($status === 'failed') {
                $query->whereNotIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit']);
            } else {
                $query->where('status', $status);
            }
        }

        $records = $query->orderBy('created_at', 'desc')->get()->map(function ($item, $index) use ($tz) {
            $created = $item->created_at ? $item->created_at->timezone($tz) : null;
            $meta = $item->metadata ?? [];
            $teacher = $item->user;
            $statusStr = strtolower($item->status ?? '');

            $statusLabel = 'Hadir';
            if ($statusStr === 'terlambat') $statusLabel = 'Terlambat';
            elseif ($statusStr === 'pulang') $statusLabel = 'Pulang';
            elseif ($statusStr === 'izin') $statusLabel = 'Izin';
            elseif ($statusStr === 'sakit') $statusLabel = 'Sakit';
            elseif ($statusStr === 'failed' || $statusStr === 'rejected') $statusLabel = 'Ditolak';

            return [
                'no' => $index + 1,
                'id' => $item->id,
                'embedding_id' => $teacher->embedding_id ?? ($meta['subject_id'] ?? '-'),
                'teacher_name' => $teacher->name ?? 'Guru',
                'teacher_email' => $teacher->email ?? '-',
                'status' => $item->status,
                'status_label' => $statusLabel,
                'time' => $created ? $created->format('H:i') : '-',
                'date' => $created ? $created->format('d/m/Y') : '-',
                'datetime' => $created ? $created->format('d/m/Y H:i') : '-',
                'euclidean_distance' => isset($meta['euclidean_distance']) ? number_format((float)$meta['euclidean_distance'], 3) : '-',
                'pad_pred' => $meta['pad_pred'] ?? 'BONA_FIDE',
                'ear_blinks' => $meta['ear_blinks'] ?? 0,
                'mar_mouths' => $meta['mar_mouths'] ?? 0,
                'final_decision' => $meta['final_decision'] ?? ($statusStr === 'success' || $statusStr === 'hadir' ? 'ACCEPT' : 'REJECT'),
                'decision_reason' => $item->decision_reason ?: 'Presensi biometrik',
            ];
        });

        $total = $records->count();
        $hadir = $records->whereIn('status', ['success', 'hadir'])->count();
        $terlambat = $records->where('status', 'terlambat')->count();
        $pulang = $records->where('status', 'pulang')->count();
        $izinSakit = $records->whereIn('status', ['izin', 'sakit'])->count();
        $failed = $records->whereNotIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit'])->count();

        return response()->json([
            'status' => 'success',
            'meta' => [
                'school_name' => 'SMK AL-MADANI PONTIANAK',
                'title' => 'REKAPITULASI PRESENSI BIOMETRIK GURU & TENAGA KEPENDIDIKAN',
                'generated_at' => now()->timezone($tz)->format('d F Y, H:i') . ' WIB',
                'filters' => [
                    'search' => $search ?: 'Semua Subjek',
                    'date' => $date ?: 'Semua Tanggal',
                    'status' => $status ?: 'Semua Status',
                ],
                'summary' => [
                    'total' => $total,
                    'hadir' => $hadir,
                    'terlambat' => $terlambat,
                    'pulang' => $pulang,
                    'izin_sakit' => $izinSakit,
                    'failed' => $failed,
                ],
            ],
            'data' => $records,
        ]);
    }

    /**
     * Render printable official table report (A4 print layout)
     */
    public function printReport(Request $request)
    {
        $user = auth()->user();
        $tz = config('app.timezone', 'Asia/Jakarta');
        $search = $request->input('search', '');
        $date = $request->input('date', '');
        $status = $request->input('status', '');

        $query = AttendanceRecord::with('user');
        if ($user->role === 'teacher') {
            $query->where('user_id', $user->id);
        }

        if (!empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('status', 'like', "%{$search}%")
                  ->orWhere('decision_reason', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%")
                         ->orWhere('embedding_id', 'like', "%{$search}%");
                  });
            });
        }

        if (!empty($date)) {
            $query->whereDate('created_at', clone new Carbon($date));
        }

        if (!empty($status)) {
            if ($status === 'hadir' || $status === 'success') {
                $query->whereIn('status', ['success', 'hadir']);
            } elseif ($status === 'izin_sakit') {
                $query->whereIn('status', ['izin', 'sakit']);
            } elseif ($status === 'failed') {
                $query->whereNotIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit']);
            } else {
                $query->where('status', $status);
            }
        }

        $records = $query->orderBy('created_at', 'desc')->get();
        $total = $records->count();
        $hadir = $records->whereIn('status', ['success', 'hadir'])->count();
        $terlambat = $records->where('status', 'terlambat')->count();
        $pulang = $records->where('status', 'pulang')->count();
        $izinSakit = $records->whereIn('status', ['izin', 'sakit'])->count();
        $failed = $records->whereNotIn('status', ['success', 'hadir', 'terlambat', 'pulang', 'izin', 'sakit'])->count();

        return view('attendance.print', [
            'records' => $records,
            'total' => $total,
            'hadir' => $hadir,
            'terlambat' => $terlambat,
            'pulang' => $pulang,
            'izinSakit' => $izinSakit,
            'failed' => $failed,
            'search' => $search,
            'date' => $date,
            'status' => $status,
            'printedAt' => now()->timezone($tz)->format('d F Y, H:i') . ' WIB',
            'printedDate' => now()->timezone($tz)->format('d F Y'),
            'user' => $user,
        ]);
    }

    /**
     * Delete a single attendance record manually.
     */
    public function destroy(Request $request, string $id)
    {
        $user = auth()->user();
        $record = AttendanceRecord::with('user')->findOrFail($id);

        // RBAC Authorization: Teacher can only delete their own attendance record
        if ($user->role === 'teacher' && $record->user_id !== $user->id) {
            if ($request->wantsJson()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Anda tidak memiliki otoritas untuk menghapus catatan presensi guru lain.'
                ], 403);
            }
            abort(403, 'Anda tidak memiliki otoritas untuk menghapus data ini.');
        }

        $subjectName = $record->user->name ?? 'Subjek #' . $record->id;
        $recordId = $record->id;

        // Delete record
        $record->delete();

        // Write immutable audit log
        activity('attendance')
            ->causedBy($user)
            ->withProperties([
                'deleted_record_id' => $recordId,
                'subject_name' => $subjectName,
                'ip' => $request->ip(),
            ])
            ->log("Menghapus satu catatan presensi #{$recordId} ({$subjectName}) secara manual.");

        if ($request->wantsJson()) {
            return response()->json([
                'status' => 'success',
                'message' => "Catatan presensi #{$recordId} ({$subjectName}) berhasil dihapus.",
                'deleted_id' => $recordId,
            ]);
        }

        return redirect()->back()->with('success', "Catatan presensi #{$recordId} berhasil dihapus.");
    }

    /**
     * Delete a single activity log entry manually.
     */
    public function destroyActivity(Request $request, string $id)
    {
        $user = auth()->user();
        $activity = \Spatie\Activitylog\Models\Activity::findOrFail($id);

        // RBAC Authorization: Teacher can only delete activity where they are the causer or subject
        if ($user->role === 'teacher' && $activity->causer_id !== $user->id && $activity->subject_id !== $user->id) {
            if ($request->wantsJson()) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Anda tidak memiliki otoritas untuk menghapus log aktivitas ini.'
                ], 403);
            }
            abort(403, 'Anda tidak memiliki otoritas untuk menghapus log aktivitas ini.');
        }

        $actId = $activity->id;
        $activity->delete();

        if ($request->wantsJson()) {
            return response()->json([
                'status' => 'success',
                'message' => "Log aktivitas #{$actId} berhasil dihapus.",
                'deleted_id' => $actId,
            ]);
        }

        return redirect()->back()->with('success', "Log aktivitas #{$actId} berhasil dihapus.");
    }
}

