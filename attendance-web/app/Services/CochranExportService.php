<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use PDO;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Ekspor presentasi uji berpasangan (keputusan S1, S2, S3) yang benar-benar terekam.
 *
 * Sumber data: tabel presentation_log di logs/telemetry.db, yang ditulis
 * capture_session.py untuk setiap presentasi 8 detik. Satu baris = satu
 * presentasi, dengan ketiga keputusan dinilai dari bukti yang sama.
 *
 * Versi sebelumnya membangkitkan 6.480 baris dari hash CRC32 tanpa satu pun
 * pengukuran. Kelas ini tidak membangkitkan nilai apa pun: bila belum ada
 * presentasi terekam, CSV hanya berisi header. Sesi yang dibatalkan operator
 * (aborted = 1) tidak diekspor.
 *
 * Nama kelas dan sepuluh kolom pertama dipertahankan agar rute ekspor dan
 * skrip analisis yang sudah ada tetap bekerja.
 */
class CochranExportService
{
    public const HEADERS = [
        'participant_id',
        'label_aktual',
        'kondisi_lux',
        'kondisi_jarak',
        'skor_facenet',
        'skor_ear',
        'skor_mar',
        'keputusan_S1',
        'keputusan_S2',
        'keputusan_S3',
        'repetisi',
        'session_id',
        'jumlah_frame',
        'siklus_kedip',
        'siklus_mulut',
    ];

    private const LABELS = [
        'bona_fide' => 'Bona_Fide',
        'print_attack' => 'Print_Attack',
        'screen_attack' => 'Screen_Attack',
        'replay_video' => 'Replay_Video',
    ];

    // Logger versi pertama menyimpan nama folder PRD (lux_low, ...) sebagai kategori.
    private const LUX = [
        'redup' => 'Redup',
        'normal' => 'Standar',
        'terang' => 'Terang',
        'lux_low' => 'Redup',
        'lux_medium' => 'Standar',
        'lux_high' => 'Terang',
    ];

    private const DECISIONS = ['ACCEPT' => 'Accept', 'REJECT' => 'Reject', 'FTA' => 'FTA'];

    private const OPTIONAL_COLUMNS = [
        'distance_level',
        'repetition',
        'n_frames',
        'max_blink_cycles',
        'max_mouth_cycles',
    ];

    public static function databasePath(): string
    {
        return (string) config('biometrics.telemetry_db', '');
    }

    /**
     * Alirkan CSV presentasi terekam ke respons HTTP.
     */
    public static function streamCsvResponse(?string $customFilename = null): StreamedResponse
    {
        $rows = self::fetch();
        $filename = $customFilename
            ?: 'Dataset_Presentasi_Berpasangan_' . count($rows) . '_' . date('Ymd_His') . '.csv';

        return response()->streamDownload(function () use ($rows) {
            $handle = fopen('php://output', 'w');
            // BOM UTF-8 agar Excel / SPSS membaca karakter dengan benar
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));
            fputcsv($handle, self::HEADERS);
            foreach ($rows as $row) {
                fputcsv($handle, self::toRow($row));
            }
            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'X-Sumber-Data' => 'telemetry',
            'X-Jumlah-Baris' => (string) count($rows),
        ]);
    }

    public static function generateCsvString(): string
    {
        $fp = fopen('php://temp', 'r+');
        fprintf($fp, chr(0xEF) . chr(0xBB) . chr(0xBF));
        fputcsv($fp, self::HEADERS);
        self::generateRows(function (array $row) use ($fp) {
            fputcsv($fp, $row);
        });

        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        return $csv;
    }

    /**
     * Tulis CSV ke disk. Mengembalikan jumlah baris data (tanpa header).
     */
    public static function exportToFile(string $absolutePath): int
    {
        $dir = dirname($absolutePath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $fp = fopen($absolutePath, 'w');
        fprintf($fp, chr(0xEF) . chr(0xBB) . chr(0xBF));
        fputcsv($fp, self::HEADERS);

        $rowCount = 0;
        self::generateRows(function (array $row) use ($fp, &$rowCount) {
            fputcsv($fp, $row);
            $rowCount++;
        });

        fclose($fp);
        return $rowCount;
    }

    /**
     * Panggil $rowEmitter untuk setiap presentasi terekam, berurutan menurut
     * subjek, label, kondisi, dan repetisi. Tidak memanggil apa pun bila kosong.
     */
    public static function generateRows(callable $rowEmitter): void
    {
        foreach (self::fetch() as $row) {
            $rowEmitter(self::toRow($row));
        }
    }

    public static function countRows(): int
    {
        return count(self::fetch());
    }

    /**
     * Baca presentation_log secara read-only. Basis data yang belum ada,
     * rusak, atau berskema lama tidak boleh membuat halaman error, jadi
     * semua kegagalan dicatat ke log dan menghasilkan daftar kosong.
     */
    private static function fetch(): array
    {
        $path = self::databasePath();
        if ($path === '' || !is_file($path)) {
            return [];
        }

        try {
            $pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY,
            ]);

            $columns = array_column(
                $pdo->query('PRAGMA table_info(presentation_log)')->fetchAll(PDO::FETCH_ASSOC),
                'name'
            );
            if ($columns === []) {
                return [];
            }

            $optional = array_map(
                fn (string $c) => in_array($c, $columns, true) ? $c : "NULL AS {$c}",
                self::OPTIONAL_COLUMNS
            );
            $where = in_array('aborted', $columns, true) ? 'WHERE COALESCE(aborted, 0) = 0' : '';
            $orderLevel = in_array('distance_level', $columns, true)
                ? 'COALESCE(distance_level, camera_distance)'
                : 'camera_distance';
            $orderRep = in_array('repetition', $columns, true) ? 'repetition,' : '';

            $sql = 'SELECT session_id, subject_id, attack_label, lux_category, camera_distance,
                           face_distance_mean, ear_mean, mar_mean,
                           decision_s1, decision_s2, decision_s3, '
                . implode(', ', $optional)
                . " FROM presentation_log {$where}
                    ORDER BY subject_id, attack_label, lux_category, {$orderLevel}, {$orderRep} started_at";

            return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            Log::warning('Telemetry presentation_log tidak dapat dibaca: ' . $e->getMessage());
            return [];
        }
    }

    private static function toRow(array $r): array
    {
        $level = $r['distance_level'] ?? $r['camera_distance'];

        return [
            $r['subject_id'],
            self::LABELS[$r['attack_label']] ?? $r['attack_label'],
            self::LUX[$r['lux_category']] ?? $r['lux_category'],
            $level !== null ? ((int) $level) . 'cm' : '',
            self::number($r['face_distance_mean']),
            self::number($r['ear_mean']),
            self::number($r['mar_mean']),
            self::DECISIONS[$r['decision_s1']] ?? $r['decision_s1'],
            self::DECISIONS[$r['decision_s2']] ?? $r['decision_s2'],
            self::DECISIONS[$r['decision_s3']] ?? $r['decision_s3'],
            $r['repetition'] ?? '',
            $r['session_id'],
            $r['n_frames'] ?? '',
            $r['max_blink_cycles'] ?? '',
            $r['max_mouth_cycles'] ?? '',
        ];
    }

    private static function number($value): string
    {
        return $value === null ? '' : (string) round((float) $value, 4);
    }
}
