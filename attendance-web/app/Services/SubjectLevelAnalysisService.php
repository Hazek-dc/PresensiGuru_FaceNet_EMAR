<?php

namespace App\Services;

/**
 * SubjectLevelAnalysisService
 *
 * Analisis tingkat subjek atas presentasi berpasangan yang benar-benar
 * terekam (CochranExportService membaca logs/telemetry.db). Menghasilkan:
 * - tingkat galat per subjek per metode (M1, M2, M3)
 * - matriks konfusi per metode
 * - ringkasan statistik deskriptif
 * - pemeriksaan kelengkapan data terhadap rancangan penelitian
 *
 * Positif = presentasi diterima. FTA dihitung sebagai tidak diterima: bagi
 * wajah asli itu kegagalan (FN), bagi serangan itu penolakan (TN).
 */
class SubjectLevelAnalysisService
{
    /**
     * Jalankan analisis lengkap dan kembalikan array terstruktur untuk Inertia props.
     * Aman dipanggil saat belum ada data: seluruh angka bernilai 0.
     */
    public static function analyze(): array
    {
        $rows = [];
        CochranExportService::generateRows(function (array $row) use (&$rows) {
            $rows[] = $row;
        });

        $cm = [
            'M1' => ['TP' => 0, 'FN' => 0, 'TN' => 0, 'FP' => 0],
            'M2' => ['TP' => 0, 'FN' => 0, 'TN' => 0, 'FP' => 0],
            'M3' => ['TP' => 0, 'FN' => 0, 'TN' => 0, 'FP' => 0],
        ];
        $subjectData = [];

        foreach ($rows as $row) {
            // 0=participant_id, 1=label_aktual, 7..9=keputusan_S1..S3
            $pid = $row[0];
            $isBonafide = ($row[1] === 'Bona_Fide');

            if (!isset($subjectData[$pid])) {
                $subjectData[$pid] = ['total' => 0, 'm1_errors' => 0, 'm2_errors' => 0, 'm3_errors' => 0];
            }
            $subjectData[$pid]['total']++;

            foreach (['M1' => 7, 'M2' => 8, 'M3' => 9] as $method => $col) {
                $accepted = ($row[$col] === 'Accept');
                if ($isBonafide) {
                    $cm[$method][$accepted ? 'TP' : 'FN']++;
                    $isError = !$accepted;
                } else {
                    $cm[$method][$accepted ? 'FP' : 'TN']++;
                    $isError = $accepted;
                }
                if ($isError) {
                    $subjectData[$pid][strtolower($method) . '_errors']++;
                }
            }
        }

        $errorRates = [];
        $rates = ['m1' => [], 'm2' => [], 'm3' => []];

        ksort($subjectData);
        foreach ($subjectData as $pid => $data) {
            $entry = [
                'participant_id' => $pid,
                'total' => $data['total'],
                'm1_errors' => $data['m1_errors'],
                'm2_errors' => $data['m2_errors'],
                'm3_errors' => $data['m3_errors'],
            ];
            foreach (['m1', 'm2', 'm3'] as $m) {
                $rate = $data['total'] > 0 ? round(($data["{$m}_errors"] / $data['total']) * 100, 2) : 0.0;
                $entry["{$m}_rate"] = $rate;
                $rates[$m][] = $rate;
            }
            $errorRates[] = $entry;
        }

        $summary = [];
        foreach (['m1', 'm2', 'm3'] as $m) {
            $values = $rates[$m];
            $summary["{$m}_mean"] = $values ? round(array_sum($values) / count($values), 2) : 0.0;
            $summary["{$m}_median"] = self::median($values);
            $summary["{$m}_min"] = $values ? min($values) : 0.0;
            $summary["{$m}_max"] = $values ? max($values) : 0.0;
        }
        $summary['total_samples'] = count($rows);
        $summary['total_subjects'] = count($subjectData);

        return [
            'error_rates' => $errorRates,
            'confusion_matrices' => $cm,
            'summary' => $summary,
            'integrity_check' => self::completeness($subjectData, count($rows)),
        ];
    }

    /**
     * Ambil analisis untuk satu subjek berdasarkan ID subjek (mis. S01).
     */
    public static function analyzeSubject(string $participantId): ?array
    {
        $full = self::analyze();
        foreach ($full['error_rates'] as $entry) {
            if ($entry['participant_id'] === $participantId) {
                return $entry;
            }
        }
        return null;
    }

    /**
     * Normalisasi embedding_id ke ID subjek perekam (S1 -> S01).
     *
     * Dahulu dipetakan ke P01 karena data sintetis memakai awalan P;
     * capture_session.py mencatat subjek dengan ID galeri (S01..S18).
     */
    public static function embeddingToParticipant(string $embeddingId): string
    {
        if (preg_match('/^[SP](\d+)$/i', $embeddingId, $m)) {
            return 'S' . str_pad($m[1], 2, '0', STR_PAD_LEFT);
        }
        return $embeddingId;
    }

    /**
     * Bandingkan jumlah presentasi terekam dengan rancangan penelitian.
     */
    private static function completeness(array $subjectData, int $total): array
    {
        $design = config('biometrics.design');
        $expectedTotal = (int) $design['total_presentations'];
        $expectedSubjects = (int) $design['subjects'];
        $perSubject = (int) $design['per_subject'];

        if ($total === 0) {
            return [
                'passed' => false,
                'details' => "Belum ada presentasi terekam. Rancangan: {$expectedTotal} presentasi "
                    . "({$expectedSubjects} subjek x {$perSubject}).",
            ];
        }

        $incomplete = array_keys(array_filter(
            $subjectData,
            fn (array $d) => $d['total'] !== $perSubject
        ));
        $passed = $total === $expectedTotal
            && count($subjectData) === $expectedSubjects
            && $incomplete === [];

        if ($passed) {
            return ['passed' => true, 'details' => "Data lengkap: {$total} presentasi sesuai rancangan."];
        }

        $details = "Data belum lengkap: {$total} dari {$expectedTotal} presentasi, "
            . count($subjectData) . " dari {$expectedSubjects} subjek.";
        if ($incomplete !== []) {
            $details .= " Subjek dengan jumlah selain {$perSubject}: " . implode(', ', $incomplete) . '.';
        }

        return ['passed' => false, 'details' => $details];
    }

    private static function median(array $values): float
    {
        sort($values);
        $count = count($values);
        if ($count === 0) {
            return 0.0;
        }
        $mid = intdiv($count, 2);
        if ($count % 2 === 0) {
            return round(($values[$mid - 1] + $values[$mid]) / 2, 2);
        }
        return round((float) $values[$mid], 2);
    }
}
