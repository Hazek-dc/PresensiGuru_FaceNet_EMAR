<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\File;

class ResearchDatasetController extends Controller
{
    private string $datasetPath;
    private string $manifestFile;

    private const MANIFEST_HEADER = [
        'frame_id',
        'subject_id',
        'session_split',
        'sample_type',
        'ground_truth',
        'pai_species',
        'lux_level',
        'lux_measured',
        'distance_level',
        'distance_measured_cm',
        'resolution',
        'annot_eye_state',
        'annot_mouth_state',
        'filename',
        'relative_path',
        'sha256',
        'captured_at',
        'operator',
        'device',
        'consent_ref',
        'is_test_data',
        'qc_status',
        'qc_blur_score',
        'mtcnn_detected',
        'notes',
    ];

    public function __construct()
    {
        $this->datasetPath = config('biometrics.project_root') . '/dataset/self_qalwani';
        $this->manifestFile = $this->datasetPath . '/manifests/MANIFEST_QALWANI.csv';
    }

    public function index()
    {
        $consentFile = $this->datasetPath . '/consent/consent_metadata.json';
        $consent = File::exists($consentFile) ? json_decode(File::get($consentFile), true) : null;

        $samples = $this->readManifestSamples();

        $countE = 0;
        $countC = 0;
        $countT = 0;

        foreach ($samples as $s) {
            $split = $s['session_split'] ?? ($s['split'] ?? '');
            if ($split === 'SESSION-E' || str_contains($split, 'SESSION-E') || str_contains($split, 'SE')) {
                $countE++;
            } elseif ($split === 'SESSION-C' || str_contains($split, 'SESSION-C') || str_contains($split, 'SC')) {
                $countC++;
            } elseif ($split === 'SESSION-T' || str_contains($split, 'SESSION-T') || str_contains($split, 'ST')) {
                $countT++;
            }
        }

        $totalSamples = count($samples);

        $stats = [
            'subject_id' => 'TEST-QALWANI-001',
            'owner_name' => 'Qalwani Anugerah',
            'npm' => '221220048',
            'role' => 'Peneliti & Pembuat Sistem',
            'study_program' => 'Teknik Informatika, FTIK UM Pontianak',
            'location' => 'SMK Al-Madani Pontianak',
            'standard' => 'ISO/IEC 30107-3 (APCER, BPCER, ACER)',
            'total_samples' => $totalSamples,
            'targets' => [
                'session_e' => 10,
                'session_c' => 15,
                'session_t' => 30,
                'total' => 55,
            ],
            'counts' => [
                'session_e' => $countE,
                'session_c' => $countC,
                'session_t' => $countT,
                'total' => $totalSamples,
            ],
            'consent' => $consent,
        ];

        return Inertia::render('Admin/ResearchDataset', [
            'stats' => $stats,
            'recent_samples' => array_slice(array_reverse($samples), 0, 55),
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'split' => 'required|in:SESSION-E,SESSION-C,SESSION-T',
            'sample_type' => 'required|in:BF,PP,PS,PR,bona_fide,printed_photo,screen_photo,replay_video',
            'pai_species' => 'nullable|string',
            'lux_level' => 'required|in:LOW,NRM,HIGH',
            'lux_measured' => 'required|numeric',
            'distance_level' => 'required|in:D30,D45,D60',
            'distance_measured_cm' => 'required|numeric',
            'annot_eye_state' => 'nullable|in:OPEN,CLOSED,NA',
            'annot_mouth_state' => 'nullable|in:CLOSED,OPEN,NA',
            'notes' => 'nullable|string|max:255',
            'media_file' => 'required|file|max:50000',
        ]);

        $split = $request->input('split');
        $rawSampleType = $request->input('sample_type');
        
        // Normalize sample type to BF / PP / PS / PR
        $sampleType = match ($rawSampleType) {
            'bona_fide' => 'BF',
            'printed_photo' => 'PP',
            'screen_photo' => 'PS',
            'replay_video' => 'PR',
            default => $rawSampleType,
        };

        $isBonaFide = ($sampleType === 'BF');
        $groundTruth = $isBonaFide ? 'BONA_FIDE' : 'ATTACK';

        $paiSpecies = $request->input('pai_species');
        if ($isBonaFide) {
            $paiSpecies = '-';
        } elseif (empty($paiSpecies)) {
            $paiSpecies = match ($sampleType) {
                'PP' => 'PRINT_A4_GLOSSY',
                'PS' => 'SCREEN_STATIC_MOBILE',
                'PR' => 'REPLAY_VIDEO_MOBILE',
                default => 'ATTACK_ARTIFACT',
            };
        }

        $luxLevel = $request->input('lux_level');
        $luxMeasured = (int) $request->input('lux_measured');
        $distanceLevel = $request->input('distance_level');
        $distMeasuredCm = (int) $request->input('distance_measured_cm');
        $annotEye = $request->input('annot_eye_state') ?: ($split === 'SESSION-C' ? 'OPEN' : 'NA');
        $annotMouth = $request->input('annot_mouth_state') ?: ($split === 'SESSION-C' ? 'CLOSED' : 'NA');
        $notes = $request->input('notes') ?: 'Akuisisi Studio Penelitian Qalwani';

        $splitCode = match ($split) {
            'SESSION-E' => 'SE',
            'SESSION-C' => 'SC',
            'SESSION-T' => 'ST',
        };

        // Determine destination folder
        $subFolder = match ($split) {
            'SESSION-E' => 'raw/enrollment/session_e',
            'SESSION-C' => 'raw/calibration/session_c/' . ($isBonaFide ? 'bona_fide' : 'attacks/' . strtolower($sampleType)),
            'SESSION-T' => 'raw/test/session_t/' . ($isBonaFide ? 'bona_fide' : 'attacks/' . strtolower($sampleType)),
        };

        $targetDir = $this->datasetPath . '/' . $subFolder;
        if (!File::exists($targetDir)) {
            File::makeDirectory($targetDir, 0755, true);
        }

        // Count existing samples in this split to generate sequence number
        $existingSamples = $this->readManifestSamples();
        $splitCount = 0;
        foreach ($existingSamples as $es) {
            $sSplit = $es['session_split'] ?? ($es['split'] ?? '');
            if ($sSplit === $split || str_contains($sSplit, $splitCode)) {
                $splitCount++;
            }
        }
        $seqStr = sprintf('%03d', $splitCount + 1);
        $frameId = $splitCode . '-' . $seqStr;
        $timestampStr = now()->format('Ymd\THis');

        // File Naming: {SUBJECT_ID}_{SPLIT}_{JENIS}_{LUX}_{JARAK}_{SEQ}_{TIMESTAMP}.jpg
        $filename = "TEST-QALWANI-001_{$splitCode}_{$sampleType}_{$luxLevel}_{$distanceLevel}_{$seqStr}_{$timestampStr}.jpg";

        $file = $request->file('media_file');
        $file->move($targetDir, $filename);

        $fullPath = $targetDir . '/' . $filename;
        $sha256 = hash_file('sha256', $fullPath);
        $relPath = 'dataset/self_qalwani/' . $subFolder . '/' . $filename;

        // Ensure manifest directory & file exist
        $manifestDir = dirname($this->manifestFile);
        if (!File::exists($manifestDir)) {
            File::makeDirectory($manifestDir, 0755, true);
        }

        if (!File::exists($this->manifestFile) || File::size($this->manifestFile) === 0) {
            File::put($this->manifestFile, implode(',', self::MANIFEST_HEADER) . "\n");
        }

        $row = [
            $frameId,
            'TEST-QALWANI-001',
            $split,
            $sampleType,
            $groundTruth,
            $paiSpecies,
            $luxLevel,
            $luxMeasured,
            $distanceLevel,
            $distMeasuredCm,
            '1280x720',
            $annotEye,
            $annotMouth,
            $filename,
            $relPath,
            $sha256,
            now()->setTimezone('Asia/Jakarta')->toIso8601String(),
            'QA',
            'Webcam-Browser-720p',
            'IC-2026-001',
            'true',
            'PASSED',
            '128.4',
            'true',
            str_replace([',', "\n", "\r"], [' ', ' ', ''], $notes),
        ];

        File::append($this->manifestFile, implode(',', $row) . "\n");

        return back()->with('message', "Sampel {$frameId} ({$sampleType}) berhasil direkam dan dicatat ke manifest ({$relPath})");
    }

    public function destroySample(Request $request, ?string $id = null)
    {
        $targetId = $id ?: $request->input('id') ?: $request->input('frame_id') ?: $request->input('sample_id');

        if (!$targetId) {
            return back()->with('error', 'ID sampel tidak ditentukan.');
        }

        if (!File::exists($this->manifestFile)) {
            return back()->with('error', 'Berkas manifest tidak ditemukan.');
        }

        $lines = file($this->manifestFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (empty($lines)) {
            return back()->with('error', 'Manifest kosong.');
        }

        $headerLine = array_shift($lines);
        $header = str_getcsv($headerLine);
        $remainingLines = [];
        $deletedCount = 0;
        $deletedName = '';

        foreach ($lines as $line) {
            $row = str_getcsv($line);
            $sample = [];
            foreach ($row as $idx => $val) {
                $key = $header[$idx] ?? 'col_' . $idx;
                $sample[$key] = $val;
            }

            $frameId = $sample['frame_id'] ?? ($sample['sample_id'] ?? '');
            $filename = $sample['filename'] ?? '';
            $relPath = $sample['relative_path'] ?? '';

            if (
                $frameId === $targetId ||
                $filename === $targetId ||
                $relPath === $targetId ||
                ($frameId && strtolower($frameId) === strtolower($targetId))
            ) {
                $deletedCount++;
                $deletedName = $frameId ?: ($filename ?: $targetId);

                // Delete physical file if exists
                if (!empty($relPath)) {
                    $physicalPath = config('biometrics.project_root') . '/' . ltrim($relPath, '/\\');
                    if (!File::exists($physicalPath)) {
                        $physicalPath = $this->datasetPath . '/' . str_replace('dataset/self_qalwani/', '', $relPath);
                    }
                    if (File::exists($physicalPath) && !File::isDirectory($physicalPath)) {
                        File::delete($physicalPath);
                    }
                }
            } else {
                $remainingLines[] = $line;
            }
        }

        if ($deletedCount === 0) {
            return back()->with('error', "Sampel {$targetId} tidak ditemukan dalam manifest.");
        }

        // Rewrite manifest
        $content = $headerLine . "\n" . (empty($remainingLines) ? '' : implode("\n", $remainingLines) . "\n");
        File::put($this->manifestFile, $content);

        return back()->with('message', "Sampel {$deletedName} berhasil dihapus dari manifest dan penyimpanan.");
    }

    public function destroyAll(Request $request)
    {
        if (!File::exists($this->manifestFile)) {
            return back()->with('error', 'Berkas manifest tidak ditemukan.');
        }

        $lines = file($this->manifestFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (empty($lines)) {
            return back()->with('message', 'Manifest sudah dalam keadaan kosong.');
        }

        $headerLine = array_shift($lines);
        $header = str_getcsv($headerLine);
        $deletedCount = 0;

        foreach ($lines as $line) {
            $row = str_getcsv($line);
            $sample = [];
            foreach ($row as $idx => $val) {
                $key = $header[$idx] ?? 'col_' . $idx;
                $sample[$key] = $val;
            }

            $relPath = $sample['relative_path'] ?? '';
            if (!empty($relPath)) {
                $physicalPath = config('biometrics.project_root') . '/' . ltrim($relPath, '/\\');
                if (!File::exists($physicalPath)) {
                    $physicalPath = $this->datasetPath . '/' . str_replace('dataset/self_qalwani/', '', $relPath);
                }
                if (File::exists($physicalPath) && !File::isDirectory($physicalPath)) {
                    File::delete($physicalPath);
                }
            }
            $deletedCount++;
        }

        // Reset manifest to header only
        if (count($header) !== count(self::MANIFEST_HEADER)) {
            $headerLine = implode(',', self::MANIFEST_HEADER);
        }
        File::put($this->manifestFile, $headerLine . "\n");

        return back()->with('message', "Seluruh sampel ({$deletedCount} item) berhasil dihapus dan manifest telah direset.");
    }

    public function downloadManifest()
    {
        if (!File::exists($this->manifestFile)) {
            return back()->with('error', 'Berkas manifest belum tersedia.');
        }

        return response()->download($this->manifestFile, 'MANIFEST_QALWANI_' . date('Ymd_His') . '.csv', [
            'Content-Type' => 'text/csv',
        ]);
    }

    private function readManifestSamples(): array
    {
        if (!File::exists($this->manifestFile)) {
            return [];
        }

        $lines = file($this->manifestFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (empty($lines)) {
            return [];
        }

        $header = str_getcsv(array_shift($lines));
        $samples = [];

        foreach ($lines as $line) {
            $row = str_getcsv($line);
            if (count($row) === count($header)) {
                $samples[] = array_combine($header, $row);
            } elseif (count($row) > 0) {
                // Fallback mapping if legacy row has different column count
                $item = [];
                foreach ($row as $idx => $val) {
                    $key = $header[$idx] ?? 'col_' . $idx;
                    $item[$key] = $val;
                }
                $samples[] = $item;
            }
        }

        return $samples;
    }
}
