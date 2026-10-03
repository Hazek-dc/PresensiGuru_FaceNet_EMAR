<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Kesiapan template wajah per guru, dibaca dari galeri mesin biometrik
 * (GET /gallery/status). embedding_id di tabel users hanya kode subjek; guru
 * bisa punya kode tanpa template, atau template dari foto ponsel yang tidak
 * cocok dengan webcam presensi.
 */
final class TemplateReadiness
{
    private const TIMEOUT_S = 5;

    /**
     * @param list<string> $ids
     * @return array{available: bool, statuses: array<string, array>}
     */
    public static function forIds(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids)));
        if (!$ids) {
            return ['available' => true, 'statuses' => []];
        }

        $base = rtrim(env('BIOMETRIC_API_URL', 'http://127.0.0.1:5000'), '/');
        try {
            $response = Http::timeout(self::TIMEOUT_S)->acceptJson()
                ->get($base . '/gallery/status', ['ids' => implode(',', $ids)]);
            if ($response->status() === 404) {
                $response = Http::timeout(self::TIMEOUT_S)->acceptJson()
                    ->get($base . '/api/gallery/status', ['ids' => implode(',', $ids)]);
            }
        } catch (\Throwable $e) {
            Log::info('Status template wajah tidak dapat dibaca dari mesin: ' . $e->getMessage());

            return ['available' => false, 'statuses' => []];
        }

        $body = $response->json();
        if (!$response->successful() || !is_array($body['subjects'] ?? null)) {
            return ['available' => false, 'statuses' => []];
        }

        $statuses = [];
        foreach ($body['subjects'] as $s) {
            if (is_array($s) && isset($s['id'])) {
                $statuses[(string) $s['id']] = [
                    'enrolled' => (bool) ($s['enrolled'] ?? false),
                    'source' => $s['source'] ?? null,
                    'n_sessions' => (int) ($s['n_sessions'] ?? 0),
                    'webcam_sessions' => (int) ($s['webcam_sessions'] ?? 0),
                    'enrolled_at' => $s['enrolled_at'] ?? null,
                ];
            }
        }

        return ['available' => true, 'statuses' => $statuses];
    }

    /**
     * Guru aktif dengan kode subjek, berurutan S01, S02, ..., beserta status template.
     *
     * @return array{engine_available: bool, subjects: list<array>}
     */
    public static function teachers(): array
    {
        $teachers = User::query()
            ->where('role', 'teacher')
            ->where('is_active', true)
            ->whereNotNull('embedding_id')
            ->orderBy('embedding_id')
            ->get(['id', 'name', 'email', 'embedding_id']);

        $readiness = self::forIds($teachers->pluck('embedding_id')->all());

        return [
            'engine_available' => $readiness['available'],
            'subjects' => $teachers->map(fn (User $u) => [
                'id' => $u->embedding_id,
                'user_id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'template' => $readiness['statuses'][$u->embedding_id] ?? null,
            ])->values()->all(),
        ];
    }
}
