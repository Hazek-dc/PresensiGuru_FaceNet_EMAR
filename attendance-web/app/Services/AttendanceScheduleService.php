<?php

namespace App\Services;

use Carbon\Carbon;

class AttendanceScheduleService
{
    public const SCHOOL_NAME = 'SMK Al-Madani';
    public const TIMEZONE = 'Asia/Jakarta';

    // Status Constants
    public const STATUS_HADIR = 'HADIR';
    public const STATUS_TERLAMBAT = 'TERLAMBAT';
    public const STATUS_DITUTUP = 'DITUTUP';
    public const STATUS_PULANG = 'PULANG';
    public const STATUS_DILUAR_JADWAL = 'DILUAR_JADWAL';

    /**
     * Evaluate the operational session and status according to SMK Al-Madani SOP.
     */
    public static function evaluate(?Carbon $time = null, ?string $simulatedTime = null, ?string $simulatedDay = null): array
    {
        $tz = self::TIMEZONE;
        $now = $time ? $time->copy()->timezone($tz) : Carbon::now($tz);

        if ($simulatedDay) {
            $now = $now->copy()->next($simulatedDay);
        }

        if ($simulatedTime && preg_match('/^(\d{1,2}):(\d{2})$/', $simulatedTime, $m)) {
            $now->setTime((int)$m[1], (int)$m[2], 0);
        }

        $hour = (int)$now->format('H');
        $minute = (int)$now->format('i');
        $timeInMinutes = $hour * 60 + $minute;
        $dayOfWeek = (int)$now->dayOfWeekIso; // 1 = Monday, 5 = Friday, 6 = Saturday, 7 = Sunday
        $dayNameId = [
            1 => 'Senin',
            2 => 'Selasa',
            3 => 'Rabu',
            4 => 'Kamis',
            5 => 'Jumat',
            6 => 'Sabtu',
            7 => 'Minggu',
        ][$dayOfWeek] ?? 'Hari Ini';

        $isFriday = ($dayOfWeek === 5);
        $isWeekend = ($dayOfWeek === 6 || $dayOfWeek === 7);

        // Schedule bounds in minutes from 00:00
        $t0630 = 6 * 60 + 30;  // 390 min (06:30)
        $t0715 = 7 * 60 + 15;  // 435 min (07:15)
        $t0716 = 7 * 60 + 16;  // 436 min (07:16)
        $t0800 = 8 * 60;       // 480 min (08:00)

        // Pulang schedule
        $tPulangStart = $isFriday ? (11 * 60 + 30) : (14 * 60 + 30); // 11:30 on Friday, 14:30 Mon-Thu
        $tPulangEnd = $isFriday ? (14 * 60) : (17 * 60);             // 14:00 on Friday, 17:00 Mon-Thu

        $timeString = $now->format('H:i');

        // Weekend logic
        if ($isWeekend) {
            return [
                'school_name' => self::SCHOOL_NAME,
                'current_time' => $timeString,
                'timezone' => 'WIB',
                'day_name' => $dayNameId,
                'is_friday' => false,
                'is_weekend' => true,
                'session_key' => 'WEEKEND',
                'session_title' => 'Akhir Pekan (Hari Libur)',
                'status' => self::STATUS_DILUAR_JADWAL,
                'status_db' => 'diluar_jadwal',
                'status_label' => 'Libur Akhir Pekan',
                'time_range' => 'Tidak Ada KBM',
                'is_open' => false,
                'is_late' => false,
                'is_closed' => true,
                'scanner_action' => 'ALLOW_TEST_ONLY',
                'operational_desc' => 'Tidak ada jam KBM operasional pada hari Sabtu dan Minggu.',
                'color' => 'slate',
            ];
        }

        // 1. Presensi Masuk (Tepat Waktu): 06.30 – 07.15 WIB
        if ($timeInMinutes >= $t0630 && $timeInMinutes <= $t0715) {
            return [
                'school_name' => self::SCHOOL_NAME,
                'current_time' => $timeString,
                'timezone' => 'WIB',
                'day_name' => $dayNameId,
                'is_friday' => $isFriday,
                'is_weekend' => false,
                'session_key' => 'MASUK_TEPAT_WAKTU',
                'session_title' => 'Presensi Masuk (Tepat Waktu)',
                'status' => self::STATUS_HADIR,
                'status_db' => 'hadir',
                'status_label' => 'HADIR (Tepat Waktu)',
                'time_range' => '06.30 – 07.15 WIB',
                'is_open' => true,
                'is_late' => false,
                'is_closed' => false,
                'scanner_action' => 'ACCEPT',
                'operational_desc' => 'Guru hadir sebelum bel masuk / KBM dimulai.',
                'color' => 'emerald',
            ];
        }

        // 2. Batas Toleransi (Terlambat): 07.16 – 08.00 WIB
        if ($timeInMinutes > $t0715 && $timeInMinutes <= $t0800) {
            return [
                'school_name' => self::SCHOOL_NAME,
                'current_time' => $timeString,
                'timezone' => 'WIB',
                'day_name' => $dayNameId,
                'is_friday' => $isFriday,
                'is_weekend' => false,
                'session_key' => 'BATAS_TOLERANSI',
                'session_title' => 'Batas Toleransi (Terlambat)',
                'status' => self::STATUS_TERLAMBAT,
                'status_db' => 'terlambat',
                'status_label' => 'TERLAMBAT',
                'time_range' => '07.16 – 08.00 WIB',
                'is_open' => true,
                'is_late' => true,
                'is_closed' => false,
                'scanner_action' => 'ACCEPT_LATE',
                'operational_desc' => 'Verifikasi biometrik tetap ACCEPT, namun status tercatat terlambat.',
                'color' => 'amber',
            ];
        }

        // 3. Presensi Pulang
        if ($timeInMinutes >= $tPulangStart && $timeInMinutes <= $tPulangEnd) {
            $pulangRange = $isFriday ? '11.30 – 14.00 WIB' : '14.30 – 17.00 WIB';
            $pulangDesc = $isFriday 
                ? 'Presensi Pulang Jumat (Penyesuaian waktu ibadah sholat Jumat).'
                : 'Presensi Pulang dibuka setelah jam KBM terakhir selesai.';

            return [
                'school_name' => self::SCHOOL_NAME,
                'current_time' => $timeString,
                'timezone' => 'WIB',
                'day_name' => $dayNameId,
                'is_friday' => $isFriday,
                'is_weekend' => false,
                'session_key' => 'PRESENSI_PULANG',
                'session_title' => 'Presensi Pulang ' . ($isFriday ? '(Jumat)' : '(Senin – Kamis)'),
                'status' => self::STATUS_PULANG,
                'status_db' => 'pulang',
                'status_label' => 'PULANG',
                'time_range' => $pulangRange,
                'is_open' => true,
                'is_late' => false,
                'is_closed' => false,
                'scanner_action' => 'ACCEPT_PULANG',
                'operational_desc' => $pulangDesc,
                'color' => 'sky',
            ];
        }

        // 4. Batas Akhir Masuk (Ditutup): > 08.00 WIB dan belum jam pulang
        if ($timeInMinutes > $t0800 && $timeInMinutes < $tPulangStart) {
            return [
                'school_name' => self::SCHOOL_NAME,
                'current_time' => $timeString,
                'timezone' => 'WIB',
                'day_name' => $dayNameId,
                'is_friday' => $isFriday,
                'is_weekend' => false,
                'session_key' => 'BATAS_AKHIR_DITUTUP',
                'session_title' => 'Batas Akhir Masuk (Ditutup)',
                'status' => self::STATUS_DITUTUP,
                'status_db' => 'ditutup',
                'status_label' => 'DITUTUP / ALPHA',
                'time_range' => '> 08.00 WIB',
                'is_open' => false,
                'is_late' => true,
                'is_closed' => true,
                'scanner_action' => 'REJECT_CLOSED',
                'operational_desc' => 'Scanner menolak presensi masuk (harus lapor manual ke piket/TU).',
                'color' => 'rose',
            ];
        }

        // 5. Belum Buka (< 06.30 WIB)
        if ($timeInMinutes < $t0630) {
            return [
                'school_name' => self::SCHOOL_NAME,
                'current_time' => $timeString,
                'timezone' => 'WIB',
                'day_name' => $dayNameId,
                'is_friday' => $isFriday,
                'is_weekend' => false,
                'session_key' => 'BELUM_DIBUKA',
                'session_title' => 'Sesi Belum Dibuka',
                'status' => self::STATUS_DILUAR_JADWAL,
                'status_db' => 'diluar_jadwal',
                'status_label' => 'BELUM DIBUKA',
                'time_range' => 'Buka Pukul 06.30 WIB',
                'is_open' => false,
                'is_late' => false,
                'is_closed' => true,
                'scanner_action' => 'WAITING_OPEN',
                'operational_desc' => 'Presensi masuk dibuka pukul 06.30 WIB.',
                'color' => 'slate',
            ];
        }

        // 6. Selesai Operasional (> Jam Pulang)
        return [
            'school_name' => self::SCHOOL_NAME,
            'current_time' => $timeString,
            'timezone' => 'WIB',
            'day_name' => $dayNameId,
            'is_friday' => $isFriday,
            'is_weekend' => false,
            'session_key' => 'SELESAI_OPERASIONAL',
            'session_title' => 'Operasional Selesai',
            'status' => self::STATUS_DILUAR_JADWAL,
            'status_db' => 'diluar_jadwal',
            'status_label' => 'OPERASIONAL TUTUP',
            'time_range' => 'Tutup Setelah ' . ($isFriday ? '14.00' : '17.00') . ' WIB',
            'is_open' => false,
            'is_late' => false,
            'is_closed' => true,
            'scanner_action' => 'CLOSED_FOR_DAY',
            'operational_desc' => 'Jam operasional presensi hari ini telah berakhir.',
            'color' => 'slate',
        ];
    }

    /**
     * Get all SOP schedule reference rows for UI documentation and table displays.
     */
    public static function getScheduleMatrix(): array
    {
        return [
            [
                'session_name' => 'Presensi Masuk (Tepat Waktu)',
                'time_range' => '06.30 – 07.15 WIB',
                'status' => 'HADIR',
                'description' => 'Guru hadir sebelum bel masuk / KBM dimulai.',
                'badge_color' => 'emerald',
            ],
            [
                'session_name' => 'Batas Toleransi (Terlambat)',
                'time_range' => '07.16 – 08.00 WIB',
                'status' => 'TERLAMBAT',
                'description' => 'Verifikasi biometrik tetap ACCEPT, namun status tercatat terlambat.',
                'badge_color' => 'amber',
            ],
            [
                'session_name' => 'Batas Akhir Masuk (Ditutup)',
                'time_range' => '> 08.00 WIB',
                'status' => 'DITUTUP / ALPHA',
                'description' => 'Scanner menolak presensi masuk (harus lapor manual ke piket/TU).',
                'badge_color' => 'rose',
            ],
            [
                'session_name' => 'Presensi Pulang (Senin – Kamis)',
                'time_range' => '14.30 – 17.00 WIB',
                'status' => 'PULANG',
                'description' => 'Dibuka setelah jam KBM terakhir selesai.',
                'badge_color' => 'sky',
            ],
            [
                'session_name' => 'Presensi Pulang (Jumat)',
                'time_range' => '11.30 – 14.00 WIB',
                'status' => 'PULANG',
                'description' => 'Penyesuaian waktu ibadah sholat Jumat.',
                'badge_color' => 'indigo',
            ],
        ];
    }
}