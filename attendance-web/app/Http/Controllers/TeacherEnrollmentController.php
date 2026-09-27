<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TeacherEnrollmentController extends Controller
{
    /**
     * Tampilkan halaman pendaftaran (enrollment) biometrik wajah guru.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // Cari apakah ada foto enrollment yang tersimpan di storage
        $photoUrl = null;
        if (Storage::disk('public')->exists("enrollments/{$user->id}_face.jpg")) {
            $photoUrl = asset("storage/enrollments/{$user->id}_face.jpg");
        }

        return Inertia::render('Teacher/Enrollment', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'embedding_id' => $user->embedding_id,
                'department' => $user->department ?? 'Guru',
                'is_active' => (bool) $user->is_active,
                'photo_url' => $photoUrl,
            ],
        ]);
    }

    /**
     * Simpan hasil capture foto wajah dan daftarkan embedding ke sistem biometrik.
     */
    public function store(Request $request)
    {
        $request->validate([
            'frame' => 'required|image|max:10240', // max 10MB
        ]);

        $user = $request->user();
        $frame = $request->file('frame');

        // Pastikan folder storage/app/public/enrollments ada
        Storage::disk('public')->makeDirectory('enrollments');
        $storagePath = "enrollments/{$user->id}_face.jpg";
        
        // Simpan salinan foto referensi wajah guru di public storage
        Storage::disk('public')->put($storagePath, file_get_contents($frame->getRealPath()));

        // Sinkronisasi salinan ke dataset/foto_selfie jika folder tersedia
        try {
            $datasetDir = config('biometrics.project_root') . '/dataset/foto_selfie';
            if (is_dir($datasetDir)) {
                $sanitizedName = preg_replace('/[^a-zA-Z0-9\s_-]/', '', $user->name);
                @file_put_contents($datasetDir . DIRECTORY_SEPARATOR . "{$user->id} - {$sanitizedName}.jpg", file_get_contents($frame->getRealPath()));
            }
        } catch (\Exception $e) {
            Log::info('Dataset directory sync note: ' . $e->getMessage());
        }

        // Tentukan ID subjek unik atau petakan nama ke ID dataset jika relevan
        $subjectId = $user->embedding_id;
        if (!$subjectId) {
            $cleanName = strtoupper(preg_replace('/[^a-zA-Z0-9]/', '', $user->name));
            // Cek apakah nama cocok dengan subjek master dataset (misal S13 untuk Shinta)
            if (str_contains($cleanName, 'SHINTA') || str_contains($cleanName, 'YULISMA')) {
                $subjectId = 'S13';
            } elseif (str_contains($cleanName, 'NURHOLIS') || str_contains($cleanName, 'HOLIS')) {
                $subjectId = 'S01';
            } elseif (str_contains($cleanName, 'FIKI') || str_contains($cleanName, 'VIKY')) {
                $subjectId = 'S02';
            } elseif (str_contains($cleanName, 'MAULUDIN')) {
                $subjectId = 'S03';
            } elseif (str_contains($cleanName, 'MERLI')) {
                $subjectId = 'S05';
            } elseif (str_contains($cleanName, 'KARMILA')) {
                $subjectId = 'S06';
            } elseif (str_contains($cleanName, 'REYNALDI')) {
                $subjectId = 'S07';
            } elseif (str_contains($cleanName, 'TAUFIK')) {
                $subjectId = 'S08';
            } elseif (str_contains($cleanName, 'WERY')) {
                $subjectId = 'S09';
            } elseif (str_contains($cleanName, 'SUSI')) {
                $subjectId = 'S11';
            } elseif (str_contains($cleanName, 'PONCO')) {
                $subjectId = 'S12';
            } elseif (str_contains($cleanName, 'QALWANI')) {
                $subjectId = 'emb_1';
            } else {
                $subjectId = 'GURU_' . str_pad($user->id, 3, '0', STR_PAD_LEFT);
            }
        }

        // Kirim frame ke Biometric API (FastAPI / facenet engine)
        $baseUrl = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');
        $apiUrl = $baseUrl . '/enroll';

        $payload = [
            'subject_id' => $subjectId,
            'teacher_id' => $subjectId,
            'user_id' => $subjectId,
            'name' => $user->name,
            'dept' => $user->department ?? 'Guru',
        ];

        try {
            $response = Http::timeout(10)->attach(
                'frame', file_get_contents($frame->getRealPath()), $frame->getClientOriginalName()
            )->post($apiUrl, $payload);

            if ($response->status() === 404) {
                $apiUrl = $baseUrl . '/api/enroll';
                $response = Http::timeout(10)->attach(
                    'frame', file_get_contents($frame->getRealPath()), $frame->getClientOriginalName()
                )->post($apiUrl, $payload);
            }

            $data = $response->json();
            // Mesin membalas HTTP 200 dengan success=false bila wajah tidak terdeteksi.
            // Dulu kasus ini (dan mesin offline) tetap dilaporkan "berhasil", padahal
            // template wajah tidak pernah diperbarui.
            if (!$response->successful() || !is_array($data) || ($data['success'] ?? true) === false) {
                $reason = is_array($data)
                    ? ($data['message'] ?? $data['detail'] ?? $data['error'] ?? null)
                    : null;
                return back()->withErrors([
                    'frame' => 'Pendaftaran wajah gagal: ' . ($reason ?: 'mesin biometrik membalas HTTP ' . $response->status())
                        . '. Pastikan wajah terlihat jelas lalu coba lagi.',
                ]);
            }
            if (isset($data['embedding_id']) || isset($data['subject_id'])) {
                $subjectId = $data['embedding_id'] ?? $data['subject_id'];
            }
        } catch (\Exception $e) {
            Log::warning('Mesin biometrik tidak dapat dihubungi saat enrollment guru: ' . $e->getMessage());
            return back()->withErrors([
                'frame' => 'Mesin biometrik tidak dapat dihubungi, jadi wajah belum terdaftar. Jalankan mesin lalu coba lagi.',
            ]);
        }

        // Simpan embedding_id ke database
        $oldEmbedding = $user->embedding_id;
        $user->embedding_id = $subjectId;
        $user->save();

        if (function_exists('activity')) {
            activity('biometric_enrollment')
                ->performedOn($user)
                ->causedBy($user)
                ->withProperties([
                    'event' => 'teacher_self_enrollment',
                    'old_embedding_id' => $oldEmbedding,
                    'new_embedding_id' => $subjectId,
                    'photo_path' => $storagePath,
                    'teacher_name' => $user->name,
                    'teacher_email' => $user->email,
                ])
                ->log("Guru {$user->name} berhasil mendaftarkan wajah (ID Biometrik: {$subjectId}).");
        }

        return redirect()->back()->with('success', "Wajah Anda berhasil didaftarkan ke sistem biometrik dengan ID: {$subjectId}. Anda sekarang dapat mulai melakukan presensi kehadiran melalui kamera!");
    }

    /**
     * Reset / hapus data biometrik untuk mendaftar ulang.
     */
    public function destroy(Request $request)
    {
        $user = $request->user();
        $oldEmbedding = $user->embedding_id;

        $user->embedding_id = null;
        $user->save();

        if (Storage::disk('public')->exists("enrollments/{$user->id}_face.jpg")) {
            Storage::disk('public')->delete("enrollments/{$user->id}_face.jpg");
        }

        if (function_exists('activity')) {
            activity()
                ->performedOn($user)
                ->causedBy($user)
                ->withProperty('event', 'teacher_revoke_biometric')
                ->withProperty('old_embedding_id', $oldEmbedding)
                ->log("Guru {$user->name} mereset data pendaftaran biometrik.");
        }

        return redirect()->back()->with('success', 'Data biometrik wajah Anda telah direset. Silakan ambil foto ulang untuk pendaftaran baru.');
    }
}