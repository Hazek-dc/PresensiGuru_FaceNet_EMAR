<?php

namespace App\Services;

use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\CarbonInterface;
use Generator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Satu CSV berisi seluruh riwayat presensi dan log aktivitas, urut waktu terbaru.
 *
 * Tiap verifikasi biometrik tercatat dua kali: baris attendance_records dan log
 * aktivitas 'attendance' berproperti attendance_id. Keduanya digabung menjadi satu
 * baris Presensi. Log lain (login, pendaftaran wajah, penghapusan, pengaturan) dan
 * log verifikasi yang catatannya sudah dihapus menjadi baris Aktivitas. Sel yang
 * tidak tercatat dibiarkan kosong; tidak ada nilai yang diisi tebakan.
 *
 * Kolom utama (siapa, kapan, hasil, ukuran) di depan dengan label bahasa Indonesia;
 * kode mentah, ID, dan properti log lengkap di belakang untuk penelusuran.
 */
class CombinedHistoryExport
{
    /** Judul kolom CSV => kunci sel internal, dalam urutan tampil. */
    private const COLUMNS = [
        'No' => 'no',
        'Jenis' => 'jenis',
        'Tanggal' => 'tanggal',
        'Jam' => 'jam',
        'ID Subjek' => 'subject_id',
        'Nama' => 'name',
        'Email' => 'email',
        'Kegiatan' => 'activity',
        'Status Presensi' => 'status',
        'Keputusan Final' => 'final_decision',
        'Keterangan' => 'note',
        'Jarak Euclidean (L2)' => 'euclidean_distance',
        'Skor FaceNet' => 'facenet_score',
        'Skor EMAR' => 'emar_score',
        'Prediksi PAD' => 'pad_pred',
        'Prediksi Identitas' => 'id_pred',
        'Kedipan (EAR)' => 'ear_blinks',
        'Gerak Mulut (MAR)' => 'mar_mouths',
        'Wajah Stabil (%)' => 'face_detected_pct',
        'Durasi Pindai (detik)' => 'scan_duration_s',
        'Tantangan' => 'active_challenge',
        'Hasil Tantangan' => 'challenge_status',
        'S1' => 's1',
        'S2' => 's2',
        'S3' => 's3',
        'S Final' => 's_final',
        'Jarak Kamera (cm)' => 'distance_cm',
        'Sumber Jarak' => 'distance_source',
        'Target Jarak Skenario (cm)' => 'distance_target',
        'Lux' => 'lux',
        'Sumber Lux' => 'lux_source',
        'Target Lux Skenario' => 'lux_target',
        'Sumber Biometrik' => 'biometric_source',
        'Akun Uji' => 'is_test_data',
        'Disembunyikan dari Dasbor' => 'hidden_at',
        'Aktor' => 'actor',
        'Email Aktor' => 'actor_email',
        'Kategori Log' => 'log_name',
        'Event Log' => 'event',
        'Deskripsi Log Verifikasi' => 'log_description',
        'ID Record Presensi' => 'record_id',
        'ID Log Aktivitas' => 'log_id',
        'ID Request Biometrik' => 'request_id',
        'IP' => 'ip',
        'Perangkat' => 'user_agent',
        'Properti Log (JSON)' => 'properties',
    ];

    /** Nilai berdesimal panjang, dibulatkan 4 angka di belakang koma. */
    private const DECIMAL_CELLS = ['euclidean_distance', 'facenet_score', 'emar_score', 's_final'];

    /**
     * Event log tiap verifikasi. 'antigravity_scan_session' adalah nama lama
     * (catatan awal September 2026); isinya sama dan juga memuat attendance_id.
     */
    private const VERIFICATION_EVENTS = ['biometric_scan_session', 'antigravity_scan_session'];

    private const STATUS_LABELS = [
        'hadir' => 'Hadir',
        'success' => 'Hadir',
        'terlambat' => 'Terlambat',
        'pulang' => 'Pulang',
        'izin' => 'Izin',
        'sakit' => 'Sakit',
        'ditutup' => 'Ditutup',
        'failed' => 'Gagal',
    ];

    /** Asal catatan presensi (metadata.source), atau verifikasi biometrik. */
    private const ORIGIN_LABELS = [
        'verification' => 'Verifikasi biometrik',
        'admin_teacher_edit' => 'Izin/sakit oleh admin',
        'teacher_profile_request' => 'Pengajuan izin/sakit guru',
    ];

    private const EVENT_LABELS = [
        'biometric_scan_session' => 'Verifikasi biometrik',
        'antigravity_scan_session' => 'Verifikasi biometrik',
        'login_success' => 'Login berhasil',
        'login_failed' => 'Login gagal',
        'logout' => 'Logout',
        'created' => 'Data dibuat',
        'updated' => 'Data diubah',
        'deleted' => 'Data dihapus',
        'created_or_updated' => 'Data dibuat/diubah',
        'biometric_enrollment_manual' => 'Pendaftaran wajah (manual)',
        'teacher_self_enrollment' => 'Pendaftaran wajah (mandiri)',
    ];

    private const DISTANCE_SOURCE_LABELS = [
        'sensor' => 'Sensor jarak',
        'engine' => 'Kamera terkalibrasi (mesin)',
        'camera_calibrated' => 'Kamera terkalibrasi (browser)',
        'camera' => 'Perkiraan kamera (belum dikalibrasi)',
    ];

    /**
     * Asal nilai lux/jarak yang tidak punya kode sumber, lihat provenance().
     * 'none' adalah kode PresensiController untuk "tidak ada pengukuran".
     */
    private const PROVENANCE_LABELS = [
        'none' => 'Tidak terukur',
        'unsourced_legacy' => 'Tanpa sumber pengukuran (catatan versi lama)',
        'unsourced_log' => 'Sumber tidak tercatat di log',
        'unrecorded_log' => 'Tidak tercatat di log',
    ];

    private const BIOMETRIC_SOURCE_LABELS = [
        'engine' => 'Mesin biometrik',
        'fta' => 'FTA (wajah tidak terdeteksi / belum terdaftar)',
        'unavailable' => 'Mesin tidak dapat dihubungi',
        'simulated' => 'Simulasi',
    ];

    public static function headers(): array
    {
        return array_keys(self::COLUMNS);
    }

    public static function response(User $viewer): StreamedResponse
    {
        $fileName = 'Riwayat_Presensi_dan_Log_Aktivitas_'.now()->format('Ymd_His').'.csv';

        return response()->streamDownload(function () use ($viewer) {
            $handle = fopen('php://output', 'w');
            // UTF-8 BOM agar Excel membaca karakter non-ASCII dengan benar.
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));
            fputcsv($handle, self::headers());
            foreach (self::rows($viewer) as $row) {
                fputcsv($handle, $row);
            }
            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }

    /**
     * Baris CSV (tanpa header). Guru hanya melihat catatan dan log miliknya;
     * peran lain melihat semuanya, sama dengan halaman riwayat.
     *
     * @return Generator<int, list<string|int|float>>
     */
    public static function rows(User $viewer): Generator
    {
        $tz = (string) config('app.timezone', 'Asia/Jakarta');
        // Termasuk guru yang sudah dihapus: catatan lamanya tetap bernama.
        $users = User::withTrashed()->get(['id', 'name', 'email', 'embedding_id'])->keyBy('id');

        $records = AttendanceRecord::query()
            ->when($viewer->role === 'teacher', fn (Builder $q) => $q->where('user_id', $viewer->id));
        $recordIds = (clone $records)->pluck('id')->flip();

        // Log verifikasi pertama tiap catatan presensi digabung ke baris Presensi-nya.
        $logByRecord = [];
        foreach (self::activities($viewer)->where('log_name', 'attendance')->orderBy('id')->cursor() as $activity) {
            $recordId = self::verifiedRecordId($activity);
            if ($recordId !== null && isset($recordIds[$recordId]) && ! isset($logByRecord[$recordId])) {
                $logByRecord[$recordId] = $activity;
            }
        }
        $mergedLogIds = array_flip(array_map(fn (Activity $a) => $a->id, $logByRecord));

        $recordRows = (function () use ($records, $logByRecord, $users, $tz) {
            foreach ($records->orderByDesc('created_at')->orderByDesc('id')->cursor() as $record) {
                yield [
                    $record->created_at?->getTimestamp() ?? 0,
                    self::recordCells($record, $logByRecord[$record->id] ?? null, $users, $tz),
                ];
            }
        })();

        $activityRows = (function () use ($viewer, $mergedLogIds, $users, $tz) {
            foreach (self::activities($viewer)->orderByDesc('created_at')->orderByDesc('id')->cursor() as $activity) {
                if (! isset($mergedLogIds[$activity->id])) {
                    yield [$activity->created_at?->getTimestamp() ?? 0, self::activityCells($activity, $users, $tz)];
                }
            }
        })();

        // Kedua sumber sudah urut terbaru lebih dulu; digabung tanpa memuat semuanya.
        $number = 0;
        while ($recordRows->valid() || $activityRows->valid()) {
            $takeRecord = ! $activityRows->valid()
                || ($recordRows->valid() && $recordRows->current()[0] >= $activityRows->current()[0]);
            $source = $takeRecord ? $recordRows : $activityRows;
            yield self::row(['no' => ++$number] + $source->current()[1]);
            $source->next();
        }
    }

    private static function activities(User $viewer): Builder
    {
        $query = Activity::query();
        if ($viewer->role === 'teacher') {
            $morph = $viewer->getMorphClass();
            $query->where(fn (Builder $q) => $q
                ->where(fn (Builder $c) => $c->where('causer_type', $morph)->where('causer_id', $viewer->id))
                ->orWhere(fn (Builder $s) => $s->where('subject_type', $morph)->where('subject_id', $viewer->id)));
        }

        return $query;
    }

    private static function isVerificationLog(array $props): bool
    {
        return in_array($props['event'] ?? null, self::VERIFICATION_EVENTS, true);
    }

    private static function verifiedRecordId(Activity $activity): ?int
    {
        $props = self::properties($activity);
        if (! self::isVerificationLog($props) || ! is_numeric($props['attendance_id'] ?? null)) {
            return null;
        }

        return (int) $props['attendance_id'];
    }

    private static function recordCells(AttendanceRecord $record, ?Activity $log, Collection $users, string $tz): array
    {
        $meta = $record->metadata ?? [];
        $bab5 = is_array($meta['evaluation_bab5'] ?? null) ? $meta['evaluation_bab5'] : [];
        $user = $users->get($record->user_id);
        // Izin/sakit dari admin atau guru menyimpan 'source'. Presensi biometrik tidak, tetapi
        // hanya jalur verifikasi yang mengisi biometric_request_id (catatan lama tanpa
        // biometric_source pun memilikinya).
        $isVerification = array_key_exists('biometric_source', $meta) || $record->biometric_request_id !== null;
        $origin = $meta['source'] ?? ($isVerification ? 'verification' : null);

        return [
            'jenis' => 'Presensi',
            'at' => self::time($record->created_at, $tz),
            'record_id' => $record->id,
            'request_id' => $record->biometric_request_id,
            'subject_id' => $record->subject_reference ?? $user?->embedding_id,
            'name' => $user?->name,
            'email' => $user?->email,
            'is_test_data' => (bool) $record->is_test_data,
            'activity' => $origin === null ? null : (self::ORIGIN_LABELS[$origin] ?? $origin),
            'status' => $record->status,
            'final_decision' => $meta['final_decision'] ?? null,
            'note' => $record->decision_reason,
            'pad_pred' => $meta['pad_pred'] ?? null,
            'id_pred' => $meta['id_pred'] ?? null,
            'biometric_source' => $meta['biometric_source'] ?? null,
            'euclidean_distance' => $meta['euclidean_distance'] ?? null,
            'facenet_score' => $meta['facenet_score'] ?? null,
            'emar_score' => $meta['emar_score'] ?? null,
            'ear_blinks' => $meta['ear_blinks'] ?? null,
            'mar_mouths' => $meta['mar_mouths'] ?? null,
            'face_detected_pct' => $meta['face_detected_pct'] ?? null,
            'scan_duration_s' => $meta['scan_duration_s'] ?? null,
            'active_challenge' => $meta['active_challenge'] ?? null,
            'challenge_status' => $meta['challenge_status'] ?? null,
            's1' => $bab5['s1_decision'] ?? null,
            's2' => $bab5['s2_decision'] ?? null,
            's3' => $bab5['s3_decision'] ?? null,
            's_final' => $bab5['s_final'] ?? null,
            'distance_cm' => $meta['distance_cm'] ?? null,
            'distance_source' => self::provenance($meta, 'distance_cm', 'distance_source', false),
            'distance_target' => $meta['distance_target_cm'] ?? $bab5['distance_target_cm'] ?? null,
            'lux' => $meta['lux'] ?? null,
            'lux_source' => self::provenance($meta, 'lux', 'lux_source', false),
            'lux_target' => $meta['lux_target'] ?? $bab5['lux_target'] ?? null,
            'hidden_at' => self::time($record->hidden_from_dashboard_at, $tz),
            'log_description' => $log?->description,
        ] + self::logCells($log, $users);
    }

    private static function activityCells(Activity $activity, Collection $users, string $tz): array
    {
        $props = self::properties($activity);
        $subject = $activity->subject_type === (new User)->getMorphClass() ? $users->get($activity->subject_id) : null;
        $person = $subject ?? self::causer($activity, $users);
        $event = $activity->event ?? $props['event'] ?? null;
        $cells = [
            'jenis' => 'Aktivitas',
            'at' => self::time($activity->created_at, $tz),
            // Log verifikasi yang catatannya sudah dihapus, atau log penghapusan itu sendiri.
            'record_id' => $props['attendance_id'] ?? $props['deleted_record_id'] ?? null,
            'subject_id' => $props['subject_id'] ?? $subject?->embedding_id,
            'name' => $person?->name ?? $props['teacher_name'] ?? $props['subject_name'] ?? null,
            'email' => $person?->email,
            'activity' => $event === null ? null : (self::EVENT_LABELS[$event] ?? $event),
            'note' => $activity->description,
        ];

        if (self::isVerificationLog($props)) {
            // Nilai yang dicatat log verifikasi itu sendiri; berguna bila catatannya sudah dihapus.
            $cells += [
                'status' => $props['status'] ?? null,
                'final_decision' => $props['final_decision'] ?? null,
                'euclidean_distance' => $props['euclidean_distance'] ?? null,
                'ear_blinks' => $props['ear_blinks'] ?? null,
                'mar_mouths' => $props['mar_mouths'] ?? null,
                'active_challenge' => $props['active_challenge'] ?? null,
                'challenge_status' => $props['challenge_status'] ?? null,
                's1' => $props['s1'] ?? null,
                's2' => $props['s2'] ?? null,
                's3' => $props['s3'] ?? null,
                's_final' => $props['s_final'] ?? null,
                'distance_cm' => $props['distance_cm'] ?? null,
                'distance_source' => self::provenance($props, 'distance_cm', 'distance_source', true),
                'lux' => $props['lux'] ?? null,
                'lux_source' => self::provenance($props, 'lux', 'lux_source', true),
            ];
        }

        return $cells + self::logCells($activity, $users);
    }

    /**
     * Kode sumber nilai lux/jarak. Sumber yang tercatat dipakai apa adanya; nilainya
     * sendiri tidak pernah diubah atau diisi.
     *
     * - Catatan presensi bernilai tanpa sumber berasal dari kode lama (sebelum
     *   27-09-2026) yang mengisi nilai, mis. 300 lux / 30 cm, tanpa pengukuran.
     * - Log verifikasi sebelum 01-10-2026 belum menyimpan kolom sumber, walaupun
     *   catatan aslinya punya; nilai null di log berarti tidak ada pengukuran.
     */
    private static function provenance(array $data, string $valueKey, string $sourceKey, bool $fromLog): ?string
    {
        if (($data[$sourceKey] ?? null) !== null) {
            return $data[$sourceKey];
        }
        if (($data[$valueKey] ?? null) !== null) {
            return $fromLog ? 'unsourced_log' : 'unsourced_legacy';
        }
        if (! $fromLog) {
            return null;
        }

        return array_key_exists($valueKey, $data) ? 'none' : 'unrecorded_log';
    }

    private static function logCells(?Activity $activity, Collection $users): array
    {
        if ($activity === null) {
            return [];
        }
        $props = self::properties($activity);
        $causer = self::causer($activity, $users);

        return [
            'log_id' => $activity->id,
            'log_name' => $activity->log_name,
            'event' => $activity->event ?? $props['event'] ?? null,
            'actor' => $causer?->name ?? ($activity->causer_id === null ? 'Sistem' : null),
            'actor_email' => $causer?->email,
            'ip' => $props['ip'] ?? null,
            'user_agent' => $props['user_agent'] ?? null,
            'properties' => $props === [] ? null : $props,
        ];
    }

    private static function causer(Activity $activity, Collection $users): ?User
    {
        return $activity->causer_type === (new User)->getMorphClass() ? $users->get($activity->causer_id) : null;
    }

    private static function properties(Activity $activity): array
    {
        return $activity->properties?->toArray() ?? [];
    }

    private static function time(?CarbonInterface $at, string $tz): ?CarbonInterface
    {
        return $at?->copy()->timezone($tz);
    }

    /**
     * Sel sesuai urutan COLUMNS: label untuk kode yang dikenal (kode lain apa adanya),
     * desimal panjang dibulatkan 4 angka, null menjadi sel kosong.
     */
    private static function row(array $cells): array
    {
        $at = $cells['at'] ?? null;
        $hiddenAt = $cells['hidden_at'] ?? null;
        $label = fn (array $labels, ?string $code) => $code === null ? null : ($labels[$code] ?? $code);
        $cells = [
            'tanggal' => $at?->format('Y-m-d'),
            'jam' => $at?->format('H:i:s'),
            'hidden_at' => $hiddenAt?->format('Y-m-d H:i:s'),
            'status' => $label(self::STATUS_LABELS, $cells['status'] ?? null),
            'distance_source' => $label(self::DISTANCE_SOURCE_LABELS + self::PROVENANCE_LABELS, $cells['distance_source'] ?? null),
            'lux_source' => $label(LightingSummary::SOURCE_LABELS + self::PROVENANCE_LABELS, $cells['lux_source'] ?? null),
            'biometric_source' => $label(self::BIOMETRIC_SOURCE_LABELS, $cells['biometric_source'] ?? null),
        ] + $cells;

        return array_map(function (string $key) use ($cells) {
            $value = $cells[$key] ?? null;

            return match (true) {
                $value === null || $value === '' => '',
                is_bool($value) => $value ? 'Ya' : 'Tidak',
                is_array($value) => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                in_array($key, self::DECIMAL_CELLS, true) && is_numeric($value) => number_format((float) $value, 4, '.', ''),
                default => $value,
            };
        }, array_values(self::COLUMNS));
    }
}
