<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ManualEnrollmentController extends Controller
{
    // Mesin menolak pratinjau bila wajah terdeteksi pada kurang dari 3 gambar
    // (MIN_ENROLL_FRAMES), jadi kurang dari 3 berkas pasti gagal.
    private const MIN_FILES = 3;
    private const MAX_FILES = 5;

    // Sama dengan PREVIEW_TTL_S mesin (900 s): lewat dari itu token mesin sudah hilang.
    private const PREVIEW_TTL_MINUTES = 15;

    // Panggilan pertama dapat memuat model MTCNN + FaceNet lebih dulu.
    private const PREVIEW_TIMEOUT_S = 90;
    private const COMMIT_TIMEOUT_S = 30;

    /**
     * Get list of authorized subjects that the current user can enroll.
     */
    public function subjects(Request $request)
    {
        $user = $request->user();
        // Tabel users tidak punya kolom department; memilihnya membuat daftar
        // subjek selalu gagal (SQLSTATE 42703) sehingga modal pendaftaran kosong.

        if (in_array($user->role, ['admin', 'researcher'])) {
            $subjects = User::select('id', 'name', 'email', 'role', 'embedding_id', 'is_test_data')
                ->orderBy('name')
                ->get();
        } else {
            $subjects = User::where('id', $user->id)
                ->select('id', 'name', 'email', 'role', 'embedding_id', 'is_test_data')
                ->get();
        }

        return response()->json([
            'status' => 'success',
            'subjects' => $subjects,
        ]);
    }

    /**
     * Langkah 1: mesin menghitung template dari foto tanpa menulis galeri.
     * Template ditahan mesin dengan token; tidak ada yang disimpan sampai commit().
     */
    public function preview(Request $request)
    {
        $request->validate([
            'subject_id' => 'required|exists:users,id',
            'files' => 'required|array|min:' . self::MIN_FILES . '|max:' . self::MAX_FILES,
            'files.*' => 'required|image|max:10240',
            'consent_checked' => 'required|accepted',
            'consent_version' => 'required|string',
            // append: sampel di kondisi cahaya/jarak lain ditambahkan ke template, bukan mengganti.
            'mode' => 'nullable|in:replace,append',
        ]);

        $user = $request->user();
        $targetUser = User::findOrFail($request->subject_id);
        $mode = $request->input('mode', 'replace') ?: 'replace';

        if (!in_array($user->role, ['admin', 'researcher']) && (int) $targetUser->id !== (int) $user->id) {
            return response()->json([
                'status' => 'error',
                'message' => 'Anda tidak berwenang mendaftarkan wajah subjek lain.'
            ], 403);
        }

        $engineSubject = (string) ($targetUser->embedding_id ?: $targetUser->id);
        $files = $request->file('files');
        $payload = [
            'subject_id' => $engineSubject,
            'name' => $targetUser->name ?? $engineSubject,
            'dept' => '',
            'session_tag' => 'web_enrollment',
            'mode' => $mode,
        ];

        // Lampiran PendingRequest dikosongkan setelah terkirim, jadi setiap
        // percobaan (termasuk ulang ke /api) harus membangun request baru.
        $build = function () use ($files): PendingRequest {
            $http = Http::timeout(self::PREVIEW_TIMEOUT_S)->acceptJson();
            foreach ($files as $file) {
                $http->attach('files[]', file_get_contents($file->getRealPath()), $file->getClientOriginalName());
            }
            return $http;
        };

        try {
            $response = $this->postToEngine('/enroll/preview', $build, $payload);
        } catch (ConnectionException $e) {
            Log::error('Pratinjau enrollment: mesin biometrik tidak dapat dihubungi: ' . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Mesin biometrik tidak dapat dihubungi atau tidak menjawab tepat waktu. Belum ada yang disimpan.',
            ], 503);
        }

        if ($this->engineRouteMissing($response)) {
            return $this->engineOutdated('/enroll/preview');
        }

        $result = $response->json();
        $nUploaded = is_array($result) && isset($result['n_uploaded']) ? (int) $result['n_uploaded'] : count($files);

        if (!$response->successful() || !is_array($result) || ($result['success'] ?? false) !== true) {
            [$message, $code] = $this->engineError($response, 'Mesin biometrik menolak sampel wajah yang dikirim.');
            return response()->json([
                'status' => 'error',
                'message' => $message,
                'engine_error' => $code,
                'n_frames' => is_array($result) && isset($result['n_frames']) ? (int) $result['n_frames'] : null,
                'n_uploaded' => $nUploaded,
            ], $response->serverError() ? 502 : 422);
        }

        $engineToken = $result['preview_token'] ?? null;
        if (!is_string($engineToken) || $engineToken === '') {
            return response()->json([
                'status' => 'error',
                'message' => 'Respons pratinjau mesin biometrik tidak memuat preview_token. Belum ada yang disimpan.',
            ], 502);
        }

        $embeddingId = is_string($result['embedding_id'] ?? null) && $result['embedding_id'] !== ''
            ? $result['embedding_id']
            : (str_starts_with($engineSubject, 'emb_') ? $engineSubject : 'emb_' . $engineSubject);
        $templateHash = is_string($result['template_hash'] ?? null) ? $result['template_hash'] : null;
        $nFrames = isset($result['n_frames']) ? (int) $result['n_frames'] : null;
        $distance = is_numeric($result['distance_to_current'] ?? null) ? (float) $result['distance_to_current'] : null;

        // Mesin hanya mengukur jarak bila galeri sudah punya template di kunci ini,
        // jadi commit akan menimpanya walau kolom embedding_id masih kosong.
        // Mode tambah tidak mengganti template; sesi lama tetap ikut dirata-rata.
        $replacesExisting = $mode === 'replace' && (!empty($targetUser->embedding_id) || $distance !== null);

        $previewToken = Str::uuid()->toString();
        Cache::put('enroll_preview_' . $previewToken, [
            'subject_id' => $targetUser->id,
            'engine_subject_id' => $engineSubject,
            'engine_preview_token' => $engineToken,
            'embedding_id' => $embeddingId,
            'template_hash' => $templateHash,
            'n_frames' => $nFrames,
            'n_uploaded' => $nUploaded,
            'distance_to_current' => $distance,
            'replaces_existing' => $replacesExisting,
            'mode' => $mode,
            'consent_version' => $request->consent_version,
            'enrolled_by' => $user->id,
            'timestamp' => now()->toIso8601String(),
        ], now()->addMinutes(self::PREVIEW_TTL_MINUTES));

        return response()->json([
            'status' => 'success',
            'message' => 'Template pratinjau siap. Belum ada yang disimpan sampai Anda menekan Simpan.',
            'preview_token' => $previewToken,
            'preview_data' => [
                'subject_id' => $targetUser->id,
                'engine_subject_id' => $engineSubject,
                'name' => $targetUser->name,
                'embedding_id' => $embeddingId,
                'template_hash' => $templateHash,
                'n_frames' => $nFrames,
                'n_uploaded' => $nUploaded,
                'distance_to_current' => $distance,
                // Peringatan penggantian hanya untuk mode ganti; mode tambah tidak mengganti.
                'has_existing_template' => $replacesExisting,
                'mode' => $mode,
                'existing_embedding_id' => $targetUser->embedding_id,
            ],
        ]);
    }

    /**
     * Langkah 2: minta mesin menyimpan template pratinjau (mesin mencadangkan galeri
     * lebih dulu), lalu perbarui users.embedding_id hanya bila mesin berhasil.
     */
    public function commit(Request $request)
    {
        $request->validate([
            'preview_token' => 'required|string',
            'subject_id' => 'required|exists:users,id',
            'consent_checked' => 'required|accepted',
            'consent_version' => 'required|string',
            'replace_confirmed' => 'nullable|boolean',
        ]);

        $user = $request->user();
        $targetUser = User::findOrFail($request->subject_id);

        if (!in_array($user->role, ['admin', 'researcher']) && (int) $targetUser->id !== (int) $user->id) {
            return response()->json([
                'status' => 'error',
                'message' => 'Anda tidak berwenang mendaftarkan wajah subjek lain.'
            ], 403);
        }

        $cacheKey = 'enroll_preview_' . $request->preview_token;
        $previewData = Cache::get($cacheKey);

        if (!is_array($previewData)
            || (int) $previewData['subject_id'] !== (int) $targetUser->id
            || (int) ($previewData['enrolled_by'] ?? 0) !== (int) $user->id
            || empty($previewData['engine_preview_token'])) {
            return response()->json([
                'status' => 'error',
                'message' => 'Sesi preview pendaftaran telah kedaluwarsa atau tidak valid. Silakan ulangi pengambilan sampel.'
            ], 422);
        }

        // Commit selalu menimpa template di galeri bila subjek sudah punya template,
        // termasuk bila kuncinya sama dengan embedding_id lama.
        $replacesExisting = ($previewData['mode'] ?? 'replace') === 'replace'
            && (!empty($targetUser->embedding_id) || !empty($previewData['replaces_existing']));
        if ($replacesExisting && !$request->boolean('replace_confirmed')) {
            $current = $targetUser->embedding_id ?: $previewData['engine_subject_id'];
            return response()->json([
                'status' => 'error',
                'requires_replacement_confirmation' => true,
                'message' => 'Subjek ini sudah memiliki template biometrik aktif (' . $current . '). Konfirmasi penggantian diperlukan.'
            ], 409);
        }

        try {
            $response = $this->postToEngine(
                '/enroll/commit',
                fn (): PendingRequest => Http::timeout(self::COMMIT_TIMEOUT_S)->acceptJson(),
                [
                    'preview_token' => $previewData['engine_preview_token'],
                    'subject_id' => $previewData['engine_subject_id'],
                ],
            );
        } catch (ConnectionException $e) {
            // Mesin mungkin sudah menyimpan sebelum balasannya hilang, jadi hasilnya tidak diketahui.
            Log::error('Commit enrollment: mesin biometrik tidak dapat dihubungi: ' . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Mesin biometrik tidak menjawab tepat waktu; belum pasti template tersimpan. '
                    . 'embedding_id pengguna tidak diubah. Periksa cadangan galeri sebelum mengulang.',
            ], 503);
        }

        if ($this->engineRouteMissing($response)) {
            return $this->engineOutdated('/enroll/commit');
        }

        $result = $response->json();
        if (!$response->successful() || !is_array($result) || ($result['success'] ?? false) !== true) {
            [$engineMessage, $code] = $this->engineError($response, 'Mesin biometrik menolak penyimpanan template.');
            $message = $engineMessage;

            if ($response->status() === 404) {
                // Token mesin hilang (lewat 15 menit atau mesin dimulai ulang); token Laravel ikut mati.
                Cache::forget($cacheKey);
                // Token juga hilang bila sudah terpakai oleh penyimpanan yang balasannya tidak sampai.
                $message = 'Pratinjau tidak ditemukan di mesin biometrik (kedaluwarsa, mesin dimulai ulang, '
                    . 'atau sudah dipakai). Ulangi pengambilan sampel.';
            }

            return response()->json([
                'status' => 'error',
                'message' => $message,
                'engine_message' => $engineMessage,
                'engine_error' => $code,
            ], $response->serverError() ? 502 : 422);
        }

        // ID yang sudah ada dipertahankan: mesin menyimpan template di bawah ID itu
        // beserta alias emb_-nya. Mengganti S07 menjadi emb_S07 memecah satu partisipan
        // riset menjadi dua ID di CSV dan analisis per subjek.
        $engineEmbeddingId = is_string($result['embedding_id'] ?? null) && $result['embedding_id'] !== ''
            ? $result['embedding_id']
            : $previewData['embedding_id'];
        $embeddingId = $targetUser->embedding_id ?: $engineEmbeddingId;
        $templateHash = is_string($result['template_hash'] ?? null) ? $result['template_hash'] : $previewData['template_hash'];
        $backup = is_string($result['backup'] ?? null) ? $result['backup'] : null;
        $nFrames = isset($result['n_frames']) ? (int) $result['n_frames'] : $previewData['n_frames'];
        $nSessions = isset($result['n_sessions']) ? (int) $result['n_sessions'] : null;

        // Token mesin sudah terpakai; entri cache tidak berguna lagi apa pun hasil DB.
        Cache::forget($cacheKey);

        try {
            DB::transaction(function () use ($targetUser, $user, $previewData, $request, $embeddingId, $templateHash, $backup, $nFrames, $nSessions) {
                $oldEmbedding = $targetUser->embedding_id;
                $targetUser->embedding_id = $embeddingId;
                $targetUser->save();

                activity()
                    ->performedOn($targetUser)
                    ->causedBy($user)
                    ->withProperties([
                        'event' => 'biometric_enrollment_manual',
                        'old_embedding_id' => $oldEmbedding,
                        'new_embedding_id' => $embeddingId,
                        'engine_subject_id' => $previewData['engine_subject_id'],
                        'template_hash' => $templateHash,
                        'preview_template_hash' => $previewData['template_hash'],
                        'engine_backup' => $backup,
                        'n_frames' => $nFrames,
                        'mode' => $previewData['mode'] ?? 'replace',
                        'n_sessions' => $nSessions,
                        'n_uploaded' => $previewData['n_uploaded'] ?? null,
                        'distance_to_current' => $previewData['distance_to_current'] ?? null,
                        'consent_version' => $request->consent_version,
                    ])
                    ->log('Face enrollment manual committed with active consent.');
            });
        } catch (\Throwable $e) {
            Log::error('Commit enrollment: galeri mesin sudah diperbarui tetapi DB gagal: ' . $e->getMessage(), [
                'user_id' => $targetUser->id,
                'embedding_id' => $embeddingId,
                'template_hash' => $templateHash,
                'engine_backup' => $backup,
            ]);
            return response()->json([
                'status' => 'error',
                'message' => 'Template sudah tersimpan di galeri mesin' . ($backup ? " (cadangan galeri lama: {$backup})" : '')
                    . ', tetapi embedding_id pengguna gagal diperbarui: ' . $e->getMessage(),
                'embedding_id' => $embeddingId,
                'template_hash' => $templateHash,
                'backup' => $backup,
            ], 500);
        }

        return response()->json([
            'status' => 'success',
            'message' => ($previewData['mode'] ?? 'replace') === 'append'
                ? 'Sampel ditambahkan ke template wajah (' . ($nSessions ?? '?') . ' sesi).'
                : 'Wajah berhasil didaftarkan ke sistem biometrik.',
            'embedding_id' => $embeddingId,
            'template_hash' => $templateHash,
            'backup' => $backup,
            'n_frames' => $nFrames,
            'n_sessions' => $nSessions,
            'mode' => $previewData['mode'] ?? 'replace',
        ]);
    }

    /**
     * Kirim ke mesin; bila rutenya tidak ada, ulangi sekali ke /api dengan request baru.
     *
     * @param  callable(): PendingRequest  $build
     */
    private function postToEngine(string $path, callable $build, array $body): Response
    {
        $baseUrl = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');

        $response = $build()->post($baseUrl . $path, $body);
        if ($this->engineRouteMissing($response)) {
            // main.py memasang router yang sama di / dan /api; proxy lama hanya meneruskan /api.
            $response = $build()->post($baseUrl . '/api' . $path, $body);
        }

        return $response;
    }

    /**
     * FastAPI menjawab {"detail": "Not Found"} untuk rute yang tidak ada, sedangkan
     * rute enrollment selalu memuat kunci success (termasuk 404 PREVIEW_NOT_FOUND).
     */
    private function engineRouteMissing(Response $response): bool
    {
        $body = $response->json();

        return $response->status() === 404 && !(is_array($body) && array_key_exists('success', $body));
    }

    private function engineOutdated(string $path): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'engine_error' => 'ENGINE_OUTDATED',
            'message' => "Mesin biometrik belum mendukung {$path}. Perbarui biometric-api lalu mulai ulang mesin. Tidak ada yang disimpan.",
        ], 502);
    }

    /**
     * Pesan dan kode galat dari jawaban mesin. Rute baru memberi message + error (kode),
     * /enroll lama memberi error atau msg, HTTPException FastAPI memberi detail.
     *
     * @return array{0: string, 1: string|null}
     */
    private function engineError(Response $response, string $fallback): array
    {
        $body = $response->json();
        if (!is_array($body)) {
            return [$fallback . ' (HTTP ' . $response->status() . ')', null];
        }

        $code = is_string($body['error'] ?? null) && $body['error'] !== '' ? $body['error'] : null;

        foreach (['message', 'msg', 'detail', 'error'] as $key) {
            $value = $body[$key] ?? null;
            if (is_string($value) && trim($value) !== '') {
                return [$value, $code];
            }
            // Galat validasi FastAPI: detail berupa daftar {loc, msg, type}.
            if ($key === 'detail' && is_array($value)) {
                $messages = array_filter(array_map(
                    fn ($item) => is_array($item) ? ($item['msg'] ?? null) : (is_string($item) ? $item : null),
                    $value
                ));
                if ($messages) {
                    return [implode('; ', $messages), $code];
                }
            }
        }

        return [$fallback . ' (HTTP ' . $response->status() . ')', $code];
    }
}
