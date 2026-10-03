<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\User;
use Illuminate\Support\Facades\Http;

class EnrollmentController extends Controller
{
    public function index()
    {
        // Get all users who can be enrolled (you could filter by role if needed)
        $teachers = User::select('id', 'name', 'email')->get();
        return Inertia::render('Admin/Enrollment', [
            'teachers' => $teachers,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'teacher_id' => 'required|exists:users,id',
            'frame' => 'required|image|max:10240', // max 10MB
        ]);

        $teacherId = $request->input('teacher_id');
        $frame = $request->file('frame');

        // Send to FastAPI (or Flask API)
        $baseUrl = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');
        $apiUrl = $baseUrl . '/enroll';
        
        try {
            $user = User::find($teacherId);
            $payload = [
                'subject_id' => $user->embedding_id ?: $teacherId, // For facenet_emar_system.py
                'teacher_id' => $user->embedding_id ?: $teacherId, // For biometric-api
                'name' => $user->name ?? '',
                'dept' => $user->department ?? '',
            ];

            $response = Http::attach(
                'frame', file_get_contents($frame->path()), $frame->getClientOriginalName()
            )->post($apiUrl, $payload);

            if ($response->status() === 404) {
                $apiUrl = $baseUrl . '/api/enroll';
                $response = Http::attach(
                    'frame', file_get_contents($frame->path()), $frame->getClientOriginalName()
                )->post($apiUrl, $payload);
            }

            if ($response->successful()) {
                $data = $response->json();
                
                $embeddingId = $data['embedding_id'] ?? $data['subject_id'] ?? $teacherId;
                if (($data['success'] ?? false) && $embeddingId) {
                    // Mesin membalas alias emb_ (S10 -> emb_S10). ID yang sudah ada
                    // dipertahankan agar satu partisipan riset tidak terpecah menjadi dua ID.
                    $user->embedding_id = $user->embedding_id ?: (string) $embeddingId;
                    $user->save();

                    return redirect()->back()->with('success', 'Wajah berhasil didaftarkan.');
                }
            }

            $errorMsg = 'Biometric API menolak frame ini.';
            if ($response->json() && is_array($response->json())) {
                $errorMsg = $response->json()['error'] ?? $response->json()['message'] ?? $errorMsg;
            }
            return redirect()->back()->withErrors(['frame' => $errorMsg]);
        } catch (\Exception $e) {
            return redirect()->back()->withErrors(['frame' => 'Gagal menghubungi Biometric API: ' . $e->getMessage()]);
        }
    }
}
