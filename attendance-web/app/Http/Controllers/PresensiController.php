<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Http;
use App\Models\User;
use App\Models\AttendanceRecord;
use App\Models\EvaluationMatrix;
use App\Services\AttendanceScheduleService;
use Illuminate\Support\Str;
use Carbon\Carbon;

class PresensiController extends Controller
{
    /** Sumber yang dihitung sebagai pengukuran langsung (lihat measuredInput()). */
    private const LUX_SOURCES = ['luxmeter', 'camera'];
    private const DISTANCE_SOURCES = ['sensor', 'camera'];

    public function index(Request $request)
    {
        $currentSchedule = AttendanceScheduleService::evaluate();
        $scheduleMatrix = AttendanceScheduleService::getScheduleMatrix();

        return Inertia::render('Presensi/Index', [
            'user' => $request->user(),
            'schedule_session' => $currentSchedule,
            'schedule_matrix' => $scheduleMatrix,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'video' => 'nullable|file',
            'kiosk_id' => 'nullable|string',
            'subject_id' => 'nullable|string',
            'claimed_id' => 'nullable|string',
            'lux' => 'nullable|numeric',
            'lux_value' => 'nullable|numeric',
            'lux_source' => 'nullable|string|max:32',
            'lux_target' => 'nullable|numeric',
            'distance_cm' => 'nullable|numeric',
            'distance_source' => 'nullable|string|max:32',
            'distance_target_cm' => 'nullable|numeric',
            'session_type' => 'nullable|string',
            'sample_type' => 'nullable|string',
            'ear_blinks' => 'nullable|numeric',
            'mar_mouths' => 'nullable|numeric',
            'face_pct' => 'nullable|numeric',
            'face_detected_pct' => 'nullable|numeric',
            'scan_duration_s' => 'nullable|numeric',
            'simulated_time' => 'nullable|string',
            'simulated_day' => 'nullable|string',
        ]);

        $user = $request->user();
        $targetSubjectId = $request->input('subject_id') ?: $request->input('claimed_id');
        
        // If subject_id is specified directly (e.g. from Studio / Pre-flight)
        if ($targetSubjectId) {
            $userBySubject = User::where('embedding_id', $targetSubjectId)
                ->orWhere('email', 'like', "%{$targetSubjectId}%")
                ->first();
            if ($userBySubject) {
                $user = $userBySubject;
            }
        }

        // If not logged in, we must be in Kiosk mode
        if (!$user) {
            if ($request->filled('kiosk_id')) {
                $user = User::where('email', $request->kiosk_id)
                    ->orWhere('embedding_id', $request->kiosk_id)
                    ->first();
            }
            if (!$user && $targetSubjectId) {
                $user = User::where('embedding_id', $targetSubjectId)->first();
            }
            if (!$user) {
                $user = User::where('role', 'admin')->first() ?: User::first();
            }
        }

        $subjectId = $user ? ($user->embedding_id ?: ($targetSubjectId ?: 'S01')) : ($targetSubjectId ?: 'S01');
        // Lux dan jarak dicatat hanya bila klien menyebut sumber pengukuran langsung.
        // Tanpa itu nilainya null: dulu 300 lux / 30 cm diisikan dan tercatat
        // sebagai hasil ukur. Target skenario (dari Studio/preset) disimpan terpisah.
        [$luxValue, $luxSource] = $this->measuredInput($request, ['lux_value', 'lux'], 'lux_source', self::LUX_SOURCES);
        [$distanceCm, $distanceSource] = $this->measuredInput($request, ['distance_cm'], 'distance_source', self::DISTANCE_SOURCES);
        $luxTarget = $request->filled('lux_target') ? round((float) $request->input('lux_target'), 1) : null;
        $distanceTarget = $request->filled('distance_target_cm') ? round((float) $request->input('distance_target_cm'), 1) : null;
        $sessionType = $request->input('session_type') ?: 'TEST';
        $sampleType = $request->input('sample_type') ?: 'BONA_FIDE';
        $earBlinks = (int) ($request->input('ear_blinks') ?: 0);
        $marMouths = (int) ($request->input('mar_mouths') ?: 0);
        // ?? bukan ?: -- dengan ?: nilai terukur "0" (wajah tak pernah terdeteksi)
        // berubah menjadi 100 % dan lolos syarat kestabilan >= 80 %.
        $facePct = (float) ($request->input('face_pct') ?? $request->input('face_detected_pct') ?? 100.0);
        $scanDuration = (float) ($request->input('scan_duration_s') ?: 8.0);
        $activeChallenge = $request->input('active_challenge');
        $challengeStatus = $request->input('challenge_status');

        $videoFile = $request->file('video');

        // Skor hanya boleh berasal dari mesin biometrik, atau dari masukan
        // simulasi bila config('biometrics.allow_simulated_scores') aktif (tes).
        // Tidak ada nilai bawaan: tanpa hasil mesin, skor tetap null dan
        // presentasi ditolak.
        $isSuccess = false;
        $statusStr = 'failed';
        $facenetScore = null;
        $emarScore = null;
        $euclideanDistance = null;
        $padPred = null;
        $idPred = null;
        $finalDecision = 'REJECT';
        $message = '';
        $biometricSource = 'unavailable';   // engine | simulated | fta | unavailable
        $backendError = null;
        $attemptId = Str::uuid()->toString();
        $requestId = $attemptId;

        // 1. Ambang Batas Metodologi Skripsi Bab 3 (Dinamis dari Pengaturan Model)
        $modelSettings = \App\Http\Controllers\Admin\ModelSettingController::getActiveSettings();
        $thresholdDistance = (float) ($modelSettings['facenet_threshold'] ?? 0.40); // L2 Distance <= 0.40
        $minBlink = 1;             // Kedipan EAR >= 1x
        $minMouth = 1;             // Gerakan Mulut MAR >= 1x
        $minStability = (float) ($modelSettings['stability_threshold'] ?? 80.0); // Kestabilan Wajah >= 80.0%

        $allowSimulated = (bool) config('biometrics.allow_simulated_scores', false);

        if ($allowSimulated && $request->filled('euclidean_distance')) {
            $euclideanDistance = (float) $request->input('euclidean_distance');
            $facenetScore = $request->filled('facenet_score')
                ? (float) $request->input('facenet_score')
                : max(0.0, 1.0 - $euclideanDistance);
            $biometricSource = 'simulated';
        } elseif (!$videoFile) {
            $backendError = 'tidak ada rekaman video yang dikirim';
        } else {
            try {
                $baseUrl = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');
                $cleanSubjectId = preg_replace('/^emb_/', '', $subjectId);
                $payload = [
                    'user_id' => $subjectId,
                    'teacher_id' => $subjectId,
                    'subject_id' => $subjectId,
                    'claimed_id' => $cleanSubjectId,
                    'clean_id' => $cleanSubjectId,
                    'attempt_id' => $attemptId,
                    'session' => $sessionType,
                ] + array_filter(['distance_cm' => $distanceCm, 'lux' => $luxValue], fn ($v) => $v !== null);
                $send = fn (string $url) => Http::timeout((int) config('biometrics.verify_timeout', 90))->attach(
                    'video', file_get_contents($videoFile->getRealPath()), $videoFile->getClientOriginalName()
                )->post($url, $payload);

                $response = $send($baseUrl . '/verify');
                if ($response->status() === 404) {
                    $response = $send($baseUrl . '/api/verify');
                }

                $result = $response->json();
                $distance = is_array($result)
                    ? ($result['distance'] ?? $result['euclidean_distance'] ?? null)
                    : null;

                if ($response->successful() && is_numeric($distance)) {
                    $euclideanDistance = (float) $distance;
                    $facenetScore = isset($result['facenet_score']) ? (float) $result['facenet_score']
                        : (isset($result['score']) ? (float) $result['score'] : null);
                    $emarScore = isset($result['emar_score']) ? (float) $result['emar_score'] : null;
                    $requestId = $result['request_id'] ?? $attemptId;
                    $biometricSource = 'engine';
                } elseif ($response->successful() && !empty($result['fta'])) {
                    // Mesin menjawab tetapi tidak ada yang bisa diukur (FTA):
                    // wajah tidak terdeteksi atau subjek belum terdaftar.
                    $backendError = ($result['fta_reason'] ?? null) === 'SUBJECT_NOT_ENROLLED'
                        ? 'subjek belum terdaftar di galeri wajah mesin biometrik'
                        : 'wajah tidak terdeteksi oleh mesin biometrik (FTA)';
                    $requestId = $result['request_id'] ?? $attemptId;
                    $biometricSource = 'fta';
                } elseif ($response->successful()) {
                    $backendError = 'respons mesin biometrik tidak memuat jarak Euclidean';
                } else {
                    $backendError = 'mesin biometrik membalas HTTP ' . $response->status();
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Mesin biometrik tidak dapat dihubungi: ' . $e->getMessage());
                $backendError = 'mesin biometrik tidak dapat dihubungi';
            }
        }

        // 2. Evaluasi Komponen Mandiri Sesuai Metodologi Bab 3
        // Perbandingan eksplisit terhadap null: di PHP, null <= 0.40 bernilai true.
        $isIdMatch = ($euclideanDistance !== null && $euclideanDistance <= $thresholdDistance);
        $isBlinkValid = ($earBlinks >= $minBlink);
        $isMouthValid = ($marMouths >= $minMouth);
        $isStabilityValid = ($facePct >= $minStability);

        // 3. Evaluasi Liveness EMAR (Skenario S2: Rule-Based Gate)
        // Jika mode aktif digunakan, periksa status tantangan acak (PASS_LIVENESS)
        // Fallback: Kedua sinyal biologis aktif untuk menangkal Cut-Out Photo Attack
        if ($activeChallenge || $challengeStatus) {
            $isLivenessValid = ($challengeStatus === 'PASS_LIVENESS');
        } else {
            $isLivenessValid = ($isBlinkValid && $isMouthValid);
        }

        // 4. Klasifikasi PAD & Prediksi Identitas
        $padPred = $isLivenessValid ? 'BONA_FIDE' : 'ATTACK';
        $idPred = $euclideanDistance === null ? 'UNAVAILABLE' : ($isIdMatch ? 'MATCH' : 'NON_MATCH');

        // 5. Evaluasi Jadwal Operasional SMK Al-Madani
        $simulatedTime = $request->input('simulated_time');
        $simulatedDay = $request->input('simulated_day');
        $schedule = AttendanceScheduleService::evaluate(now(), $simulatedTime, $simulatedDay);

        // 6. Keputusan Terminal (ACCEPT / REJECT) & Status Sistem Kehadiran
        if ($isIdMatch && $isLivenessValid && $isStabilityValid) {
            $isSuccess = true;
            $finalDecision = 'ACCEPT';

            if ($schedule['status'] === AttendanceScheduleService::STATUS_HADIR) {
                $statusStr = 'hadir';
                $message = "HADIR (Tepat Waktu) [{$schedule['time_range']}] - Terverifikasi Biometrik FaceNet + EMAR";
            } elseif ($schedule['status'] === AttendanceScheduleService::STATUS_TERLAMBAT) {
                $statusStr = 'terlambat';
                $message = "TERLAMBAT: Batas Toleransi [{$schedule['time_range']}] - Verifikasi Biometrik Diterima";
            } elseif ($schedule['status'] === AttendanceScheduleService::STATUS_PULANG) {
                $statusStr = 'pulang';
                $message = "PULANG: Presensi Pulang Berhasil Dicatat [{$schedule['time_range']}]";
            } elseif ($schedule['status'] === AttendanceScheduleService::STATUS_DITUTUP) {
                // > 08.00 WIB
                if ($sessionType === 'TEST' || $sessionType === 'ENROLLMENT') {
                    $statusStr = 'terlambat';
                    $message = "Mode Uji Riset: Batas Masuk Ditutup (>08.00 WIB) - Status Tercatat DITUTUP / ALPHA";
                } else {
                    $isSuccess = false;
                    $statusStr = 'ditutup';
                    $finalDecision = 'REJECT';
                    $message = "Presensi Masuk Ditutup (> 08.00 WIB). Status Sistem: DITUTUP / ALPHA. Harap lapor manual ke Guru Piket / TU SMK Al-Madani.";
                }
            } else {
                // DILUAR_JADWAL
                $statusStr = 'hadir';
                $message = "Presensi Diterima di Luar Jam Reguler ({$schedule['current_time']} WIB)";
            }
        } else {
            $isSuccess = false;
            $finalDecision = 'REJECT';
            $statusStr = 'failed';

            if (in_array($biometricSource, ['unavailable', 'fta'], true)) {
                $message = 'Presensi tidak dapat diverifikasi: ' . $backendError
                    . '. Tidak ada skor biometrik yang dicatat. Silakan ulangi atau hubungi admin.';
            } elseif (!$isLivenessValid && !$isIdMatch) {
                $message = 'Gagal: Identitas Wajah Tidak Cocok dan Liveness EMAR Tidak Terpenuhi';
            } elseif (!$isLivenessValid) {
                if ($challengeStatus === 'REJECT_WRONG_ACTION') {
                    $actionLabel = ($activeChallenge === 'BLINK') ? 'Kedip Mata' : 'Buka Mulut';
                    $wrongLabel = ($activeChallenge === 'BLINK') ? 'membuka mulut' : 'mengedipkan mata';
                    $message = "Gagal Liveness: Aksi Tidak Sesuai Tantangan Acak ({$activeChallenge}) - Instruksi: {$actionLabel}, namun terdeteksi {$wrongLabel}";
                } elseif ($challengeStatus === 'REJECT_TIMEOUT') {
                    $message = 'Gagal Liveness: Batas Waktu Respons Habis (>4s) - Indikasi Spoofing Foto Statis / Replay';
                } elseif (!$isBlinkValid && !$isMouthValid) {
                    $message = 'Gagal Liveness: Tidak Terdeteksi Kedipan dan Gerakan Mulut (Foto Statis)';
                } elseif (!$isMouthValid) {
                    $message = 'Gagal Liveness: Gerakan Mulut 0x (Terindikasi Cut-Out/Lubang Foto)';
                } else {
                    $message = 'Gagal Liveness: Kedipan Mata 0x';
                }
            } elseif (!$isIdMatch) {
                $message = 'Gagal Identifikasi: Jarak Euclidean (' . number_format($euclideanDistance, 2) . ') Melebihi Batas';
            } else {
                $message = 'Gagal: Posisi Wajah Kurang Stabil (<80%)';
            }
        }

        // 3b. Skenario Evaluasi Serentak Bab 5 (S1, S2, S3)
        // Tanpa jarak dari mesin tidak ada yang bisa dinilai; keputusan null,
        // bukan 0, agar tidak terbaca sebagai penolakan yang terukur.
        $evaluated = ($euclideanDistance !== null);
        // Ambang sama dengan gerbang keputusan di atas, agar S1/S2 dan ACCEPT/REJECT
        // pada satu rekaman tidak saling bertentangan.
        $s1 = ($evaluated && $euclideanDistance <= $thresholdDistance) ? 1 : 0;
        $earVal = (float) ($request->input('ear_val') ?? ($earBlinks > 0 ? 0.18 : 0.28));
        $marVal = (float) ($request->input('mar_val') ?? ($marMouths > 0 ? 0.40 : 0.05));
        if ($activeChallenge || $challengeStatus) {
            $livenessValid = ($challengeStatus === 'PASS_LIVENESS');
        } else {
            // Tabel 5.2: kedip jika EAR < 0,20, mulut terbuka jika MAR >= 0,10
            $livenessValid = ($earVal < (float) ($modelSettings['ear_threshold'] ?? config('biometrics.ear_threshold', 0.20)))
                && ($marVal >= (float) ($modelSettings['mar_threshold'] ?? config('biometrics.mar_threshold', 0.10)));
        }
        $s2 = ($s1 === 1 && $livenessValid) ? 1 : 0;
        $pFace = $evaluated ? max(0.0, 1.0 - ($euclideanDistance / 1.5)) : null;
        $pLive = $livenessValid ? 1.0 : 0.0;
        $sFinal = $evaluated ? (0.6 * $pFace) + (0.4 * $pLive) : null;
        $s3 = ($evaluated && $sFinal >= 0.75) ? 1 : 0;
        if (!$evaluated) {
            $s1 = $s2 = $s3 = null;
        }
        $round3 = fn ($v) => $v === null ? null : round($v, 3);

        $evaluationBab5 = [
            'evaluated' => $evaluated,
            'biometric_source' => $biometricSource,
            'euclidean_distance' => $round3($euclideanDistance),
            's1_decision' => $s1,
            's2_decision' => $s2,
            's3_decision' => $s3,
            's_final' => $round3($sFinal),
            'p_face' => $round3($pFace),
            'p_live' => round($pLive, 3),
            'ear_val' => round($earVal, 3),
            'mar_val' => round($marVal, 3),
            'liveness_valid' => $livenessValid,
            'active_challenge' => $activeChallenge,
            'challenge_status' => $challengeStatus,
            'lux' => $luxValue,
            'lux_source' => $luxSource,
            'lux_target' => $luxTarget,
            'distance_cm' => $distanceCm,
            'distance_source' => $distanceSource,
            'distance_target_cm' => $distanceTarget,
        ];

        // Database Persistence Transaction (Atomik Sesuai PRD)
        $record = null;
        \Illuminate\Support\Facades\DB::transaction(function () use (
            $user, $subjectId, $statusStr, $message, $requestId,
            $facenetScore, $emarScore, $euclideanDistance, $distanceCm, $luxValue,
            $distanceSource, $luxSource, $distanceTarget, $luxTarget,
            $earBlinks, $marMouths, $facePct, $scanDuration, $padPred, $idPred,
            $activeChallenge, $challengeStatus,
            $finalDecision, $schedule, $sampleType, $sessionType, $evaluationBab5, $biometricSource, $round3, &$record
        ) {
            // 1. Save Attendance Record
            $record = AttendanceRecord::create([
                'user_id' => $user->id,
                'subject_reference' => $user->embedding_id ?? $subjectId,
                'status' => $statusStr,
                'decision_reason' => $message,
                'biometric_request_id' => $requestId,
                'verified_at' => now(),
                'is_test_data' => $user->is_test_data ?? false,
                'metadata' => [
                    'facenet_score' => $facenetScore,
                    'emar_score' => $emarScore,
                    'euclidean_distance' => $euclideanDistance,
                    'distance_cm' => $distanceCm,
                    'distance_source' => $distanceSource,
                    'distance_target_cm' => $distanceTarget,
                    'lux' => $luxValue,
                    'lux_source' => $luxSource,
                    'lux_target' => $luxTarget,
                    'ear_blinks' => $earBlinks,
                    'mar_mouths' => $marMouths,
                    'face_detected_pct' => $facePct,
                    'scan_duration_s' => $scanDuration,
                    'active_challenge' => $activeChallenge,
                    'challenge_status' => $challengeStatus,
                    'pad_pred' => $padPred,
                    'id_pred' => $idPred,
                    'final_decision' => $finalDecision,
                    'operational_session' => $schedule,
                    'evaluation_bab5' => $evaluationBab5,
                    'biometric_source' => $biometricSource,
                ]
            ]);

            // 2. Update status presensi pada tabel guru secara langsung saat ACCEPT
            if ($finalDecision === 'ACCEPT') {
                $guru = User::where('id', $user->id)
                    ->orWhere('embedding_id', $subjectId)
                    ->first();

                if ($guru) {
                    $guru->update([
                        'status_presensi'  => 'AKTIF',
                        'last_presensi_at' => now('Asia/Pontianak'),
                    ]);
                }
            }

            // 3. Save Evaluation Matrix Record
            $matrixRow = [
                'subject_id' => $subjectId,
                'claimed_subject_id' => $subjectId,
                'sample_type' => $sampleType,
                'session_type' => $sessionType,
                'scan_duration_sec' => $scanDuration,
                'ear_blink_count' => $earBlinks,
                'mar_mouth_count' => $marMouths,
                'face_detected_pct' => $facePct,
                'euclidean_distance' => $round3($euclideanDistance),
                'facenet_score' => $round3($facenetScore),
                'emar_score' => $round3($emarScore),
                'pad_prediction' => $padPred,
                'id_prediction' => $idPred,
                'final_decision' => $finalDecision,
                'raw_metadata' => [
                    'attendance_id' => $record->id,
                    'user_name' => $user->name,
                    'user_email' => $user->email,
                    'active_challenge' => $activeChallenge,
                    'challenge_status' => $challengeStatus,
                    'evaluation_bab5' => $evaluationBab5,
                    'biometric_source' => $biometricSource,
                ],
            ];
            // Kolom distance_cm/lux_value masih integer NOT NULL (default 30/300) dan
            // menolak null. Nilai tak terukur tidak dikirim, sehingga kolom berisi
            // default skema, bukan hasil ukur, sampai kolomnya dibuat nullable.
            // Nilai sebenarnya (null) dan sumbernya ada di raw_metadata.evaluation_bab5.
            if ($distanceCm !== null) {
                $matrixRow['distance_cm'] = (int) round($distanceCm);
            }
            if ($luxValue !== null) {
                $matrixRow['lux_value'] = (int) round($luxValue);
            }
            EvaluationMatrix::create($matrixRow);
        });

        // Dataset riset hanya menerima presentasi yang diukur mesin biometrik dari
        // akun sungguhan. Presentasi simulasi, FTA, tanpa hasil mesin, atau dari
        // akun uji (is_test_data) tidak pernah ditulis.
        $isTestAccount = (bool) ($user->is_test_data ?? false);
        // Lux/jarak yang tidak terukur ditulis sebagai sel kosong, bukan 0 atau preset.
        $csvNum = fn (?float $v) => $v === null ? '' : rtrim(rtrim(number_format($v, 1, '.', ''), '0'), '.');
        if ($biometricSource === 'engine' && !$isTestAccount) {
            // 3. Auto-Append to Matriks_Evaluasi_Bab4.csv
            try {
                $csvPath = (string) config('biometrics.research_csv.matriks');
                $dir = dirname($csvPath);
                if (!is_dir($dir)) {
                    mkdir($dir, 0755, true);
                }
                if (!file_exists($csvPath)) {
                    file_put_contents($csvPath, "File_Uji,Claimed_ID,Sample_Type,PAI_Species,Lux,Jarak_cm,Session,PAD_Pred,ID_Pred,Jarak,Kedipan,Mulut,Wajah_%,Durasi_s,Final,Error\n");
                }
                $fileNameUji = "LIVE_{$subjectId}_" . now()->format('Ymd_His') . ".webm";
                $paiSpecies = ($sampleType === 'BONA_FIDE') ? 'NONE' : ((!$isMouthValid && $isBlinkValid) ? 'CUT_OUT' : 'PHOTO');
                $errorCol = ($finalDecision === 'REJECT') ? str_replace(',', ';', $message) : '';
                $csvLine = sprintf(
                    "%s,%s,%s,%s,%s,%s,%s,%s,%s,%.3f,%d,%d,%.1f,%.2f,%s,%s\n",
                    $fileNameUji,
                    $subjectId,
                    $sampleType,
                    $paiSpecies,
                    $csvNum($luxValue),
                    $csvNum($distanceCm),
                    $sessionType,
                    $padPred,
                    $idPred,
                    $euclideanDistance,
                    $earBlinks,
                    $marMouths,
                    $facePct,
                    $scanDuration,
                    $finalDecision,
                    $errorCol
                );
                file_put_contents($csvPath, $csvLine, FILE_APPEND);
            } catch (\Exception $csvErr) {
                \Illuminate\Support\Facades\Log::error('CSV Logger error: ' . $csvErr->getMessage());
            }

            // Auto-Append to Dataset_Eksperimen_Bab5.csv
            try {
                $bab5CsvPath = (string) config('biometrics.research_csv.bab5');
                $bab5Exists = file_exists($bab5CsvPath);
                $fp = fopen($bab5CsvPath, 'a');
                if ($fp) {
                    if (!$bab5Exists) {
                        fputcsv($fp, [
                            'participant_id', 'jarak_cm', 'lux', 'label_aktual',
                            'euclidean_dist', 'ear', 'mar', 'keputusan_S1', 'keputusan_S2', 'keputusan_S3'
                        ]);
                    }

                    fputcsv($fp, [
                        $subjectId,
                        $csvNum($distanceCm),
                        $csvNum($luxValue),
                        $sampleType,
                        round($euclideanDistance, 3),
                        round($earVal, 3),
                        round($marVal, 3),
                        $s1,
                        $s2,
                        $s3
                    ]);
                    fclose($fp);
                }
            } catch (\Exception $bab5Err) {
                \Illuminate\Support\Facades\Log::error('Bab 5 CSV Logger error: ' . $bab5Err->getMessage());
            }
        }

        // 4. Record Spatie Activity Log for Admin Feed
        if (function_exists('activity')) {
            activity('attendance')
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties([
                    'event' => 'biometric_scan_session',
                    'status' => $statusStr,
                    'operational_status' => $schedule['status'],
                    'subject_id' => $subjectId,
                    'attendance_id' => $record->id,
                    'teacher_name' => $user->name,
                    'distance_cm' => $distanceCm,
                    'lux' => $luxValue,
                    'final_decision' => $finalDecision,
                    'active_challenge' => $activeChallenge,
                    'challenge_status' => $challengeStatus,
                    'euclidean_distance' => $round3($euclideanDistance),
                    'ear_blinks' => $earBlinks,
                    'mar_mouths' => $marMouths,
                    's1' => $s1,
                    's2' => $s2,
                    's3' => $s3,
                    's_final' => $round3($sFinal),
                    'ear_val' => round($earVal, 3),
                    'mar_val' => round($marVal, 3),
                    'ip' => $request->ip(),
                    'user_agent' => substr($request->userAgent() ?? '', 0, 255),
                ])
                ->log(sprintf(
                    'Presensi %s (%s): %s [%s - S1: %s, S2: %s, S3: %s, S_final: %s, Dist: %s, Sumber: %s]',
                    $user->name, $subjectId, $finalDecision, $schedule['status_label'],
                    $s1 ?? '-', $s2 ?? '-', $s3 ?? '-',
                    $sFinal === null ? '-' : round($sFinal, 2),
                    $euclideanDistance === null ? '-' : round($euclideanDistance, 3),
                    $biometricSource
                ));
        }

        return response()->json([
            'success' => $isSuccess,
            'status' => $isSuccess ? 'success' : 'failed',
            'final_decision' => $finalDecision,
            'pad_pred' => $padPred,
            'id_pred' => $idPred,
            'attendance_status' => $statusStr,
            'message' => $message,
            'request_id' => $requestId,
            'active_challenge' => $activeChallenge,
            'challenge_status' => $challengeStatus,
            'operational_session' => $schedule,
            'evaluation' => [
                'final_decision' => $finalDecision,
                'status_str' => $statusStr,
                'status_label' => $schedule['status_label'],
                'message' => $message,
                'pad_pred' => $padPred,
                'id_pred' => $idPred,
                'euclidean_distance' => $round3($euclideanDistance),
                // Ambang aktif saat keputusan ini dibuat, untuk ditampilkan di kartu hasil.
                'facenet_threshold' => $thresholdDistance,
                'facenet_score' => $round3($facenetScore),
                'emar_score' => $round3($emarScore),
                'ear_blinks' => $earBlinks,
                'mar_mouths' => $marMouths,
                'face_detected_pct' => $facePct,
                'scan_duration_s' => $scanDuration,
                'active_challenge' => $activeChallenge,
                'challenge_status' => $challengeStatus,
                'subject_id' => $subjectId,
                'teacher_name' => $user->name,
                'distance_cm' => $distanceCm,
                'distance_source' => $distanceSource,
                'distance_target_cm' => $distanceTarget,
                'lux_value' => $luxValue,
                'lux_source' => $luxSource,
                'lux_target' => $luxTarget,
                'operational_session' => $schedule,
                's1_decision' => $s1,
                's2_decision' => $s2,
                's3_decision' => $s3,
                'p_face' => $round3($pFace),
                'p_live' => round($pLive, 3),
                's_final' => $round3($sFinal),
                'liveness_valid' => $livenessValid,
                'ear_val' => round($earVal, 3),
                'mar_val' => round($marVal, 3),
            ],
            'metadata' => [
                'facenet_score' => $facenetScore,
                'emar_score' => $emarScore,
                'distance' => $euclideanDistance,
                'operational_session' => $schedule,
            ]
        ], 200);
    }

    /**
     * [nilai, sumber] untuk lux/jarak dari request. Nilai dianggap terukur hanya
     * bila sumbernya pengukuran langsung; selain itu [null, 'none'], sehingga
     * preset atau nilai query string dari klien lama tidak tercatat sebagai ukuran.
     */
    private function measuredInput(Request $request, array $valueKeys, string $sourceKey, array $liveSources): array
    {
        $source = (string) $request->input($sourceKey, '');
        if (!in_array($source, $liveSources, true)) {
            return [null, 'none'];
        }

        foreach ($valueKeys as $key) {
            if ($request->filled($key) && is_numeric($request->input($key))) {
                return [round((float) $request->input($key), 1), $source];
            }
        }

        return [null, 'none'];
    }

    /**
     * Download Bab 5 Cochran's Q & McNemar Evaluation Dataset CSV
     */
    public function exportBab5(): \Symfony\Component\HttpFoundation\BinaryFileResponse|\Illuminate\Http\Response
    {
        $csvPath = (string) config('biometrics.research_csv.bab5');
        if (file_exists($csvPath)) {
            return response()->download($csvPath, 'Dataset_Eksperimen_Bab5.csv', [
                'Content-Type' => 'text/csv; charset=UTF-8',
            ]);
        }

        $headers = [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="Dataset_Eksperimen_Bab5.csv"',
        ];
        $headerRow = "participant_id,jarak_cm,lux,label_aktual,euclidean_dist,ear,mar,keputusan_S1,keputusan_S2,keputusan_S3\n";
        return response($headerRow, 200, $headers);
    }
}
