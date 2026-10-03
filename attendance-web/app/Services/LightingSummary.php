<?php

namespace App\Services;

use App\Models\LuxCalibration;

/**
 * Ringkasan pencahayaan satu presensi dari metadatanya: lux terukur, sumber,
 * kategori naskah, target skenario dan kesesuaiannya, kalibrasi dan alat
 * acuannya. Dipakai Riwayat, Detail, Studio, Dashboard, dan ekspor CSV agar
 * isinya sama di semua tempat. Yang tidak tercatat tetap null, tidak diisi.
 */
final class LightingSummary
{
    public const SOURCE_LABELS = [
        'luxmeter' => 'Luxmeter',
        'engine' => 'Kamera terkalibrasi (mesin)',
        'camera_calibrated' => 'Kamera terkalibrasi (browser)',
        'camera' => 'Perkiraan kamera (belum dikalibrasi)',
    ];

    public const REFERENCE_LABELS = [
        'luxmeter' => 'Luxmeter fisik',
        'luxmeter_app' => 'Aplikasi luxmeter HP',
    ];

    /** Alasan lux tidak terukur (lux_engine_note) dalam bahasa operator. */
    public const NOTE_LABELS = [
        'no_lux_calibration' => 'Belum ada kalibrasi luxmeter dan perkiraan kamera tidak terkirim (kamera belum siap atau gambar terlalu gelap/terang).',
        'lux_table_missing' => 'Tabel kalibrasi lux belum dibuat (php artisan migrate).',
        'lux_calibration_without_engine_model' => 'Kalibrasi tanpa model mesin dan tidak ada sampel browser.',
        'no_lux_probe' => 'Sampel cahaya tidak terkirim bersama presensi.',
        'exposure_mode_mismatch' => 'Eksposur kamera tidak sama dengan saat kalibrasi.',
        'camera_label_mismatch' => 'Kamera berbeda dari kamera yang dikalibrasi.',
        'engine_brightness_unavailable' => 'Mesin tidak dapat mengukur kecerahan sampel.',
    ];

    /**
     * @param array<int, string|null> $referenceDevices alat acuan per id kalibrasi,
     *        untuk presensi lama yang belum menyimpan alat acuannya sendiri
     */
    public static function fromMetadata(array $meta, array $referenceDevices = []): array
    {
        $lux = is_numeric($meta['lux'] ?? null) ? (float) $meta['lux'] : null;
        $target = is_numeric($meta['lux_target'] ?? null) ? (float) $meta['lux_target'] : null;
        $measured = LightingModel::classify($lux);
        $source = $measured['lux'] !== null && is_string($meta['lux_source'] ?? null) ? $meta['lux_source'] : null;
        $calibrationId = is_numeric($meta['lux_calibration_id'] ?? null) ? (int) $meta['lux_calibration_id'] : null;
        $reference = $meta['lux_reference_device']
            ?? ($calibrationId !== null ? ($referenceDevices[$calibrationId] ?? null) : null);
        $note = $measured['lux'] === null && is_string($meta['lux_engine_note'] ?? null) ? $meta['lux_engine_note'] : null;

        return [
            'lux' => $measured['lux'],
            'source' => $source,
            'source_label' => $source === null ? null : (self::SOURCE_LABELS[$source] ?? $source),
            'kategori_naskah' => $measured['kategori_naskah'],
            'category' => $measured['category'],
            'status' => $measured['status'],
            'target' => $target,
            'target_kategori' => LightingModel::classify($target)['kategori_naskah'],
            'target_met' => LightingModel::targetMet($target, $measured['lux']),
            'calibration_id' => $calibrationId,
            'reference_device' => $reference,
            'reference_label' => $reference === null ? null : (self::REFERENCE_LABELS[$reference] ?? $reference),
            'note' => $note,
            'note_label' => $note === null ? null : (self::NOTE_LABELS[$note] ?? $note),
        ];
    }

    /**
     * Alat acuan per id kalibrasi yang dirujuk sekumpulan metadata.
     *
     * @param iterable<array> $metadataList
     * @return array<int, string|null>
     */
    public static function referenceDevices(iterable $metadataList): array
    {
        $ids = collect($metadataList)
            ->map(fn ($meta) => is_array($meta) ? ($meta['lux_calibration_id'] ?? null) : null)
            ->filter(fn ($id) => is_numeric($id))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        if ($ids->isEmpty() || !LuxCalibration::tablesReady()) {
            return [];
        }

        return LuxCalibration::query()->whereIn('id', $ids)->get()
            ->mapWithKeys(fn (LuxCalibration $c) => [$c->id => $c->referenceDevice()])
            ->all();
    }

    /** Baris CSV (urutan sama dengan CSV_HEADERS); sel kosong bila tidak tercatat. */
    public static function csvCells(array $summary): array
    {
        $num = fn ($v) => $v === null ? '' : LightingModel::fmt((float) $v);

        return [
            $summary['source'] ?? '',
            $summary['kategori_naskah'] ?? '',
            $num($summary['target']),
            $summary['target_met'] === null ? '' : ($summary['target_met'] ? '1' : '0'),
            $summary['calibration_id'] ?? '',
            $summary['reference_device'] ?? '',
        ];
    }

    public const CSV_HEADERS = [
        'Sumber_Lux',
        'Kategori_Naskah_Lux',
        'Target_Lux',
        'Sesuai_Target_Lux',
        'ID_Kalibrasi_Lux',
        'Alat_Acuan_Lux',
    ];
}
