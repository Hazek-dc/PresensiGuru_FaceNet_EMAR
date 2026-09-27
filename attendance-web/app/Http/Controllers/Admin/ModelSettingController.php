<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Inertia\Inertia;

class ModelSettingController extends Controller
{
    private static string $configPath;

    public function __construct()
    {
        self::$configPath = storage_path('app/biometrics_settings.json');
    }

    /**
     * Dapatkan konfigurasi biometrik aktif (merge file kustom dengan config/biometrics.php).
     */
    public static function getActiveSettings(): array
    {
        $defaults = config('biometrics') ?? [
            'facenet_threshold' => 0.40,
            'liveness_strategy' => 'S2',
            'ear_threshold' => 0.20,
            'mar_threshold' => 0.10,
            'stability_threshold' => 80.0,
            'scan_duration_sec' => 8,
            'distance_cm' => 30,
        ];

        $path = storage_path('app/biometrics_settings.json');
        if (File::exists($path)) {
            $custom = json_decode(File::get($path), true);
            if (is_array($custom)) {
                return array_merge($defaults, $custom);
            }
        }

        return $defaults;
    }

    /**
     * Tampilkan halaman pengaturan model biometrik.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['admin', 'researcher'])) {
            abort(403, 'Akses ditolak. Pengaturan model hanya dapat diakses oleh Admin atau Peneliti.');
        }

        $settings = self::getActiveSettings();

        if ($request->has('blade') || $request->wantsJson() === false && !$request->header('X-Inertia')) {
            if (view()->exists('admin.settings.model')) {
                return view('admin.settings.model', compact('settings'));
            }
        }

        return Inertia::render('Admin/ModelSettings', [
            'settings' => $settings,
        ]);
    }

    /**
     * Perbarui konfigurasi parameter model.
     */
    public function update(Request $request)
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['admin', 'researcher'])) {
            abort(403, 'Akses ditolak.');
        }

        $validated = $request->validate([
            'facenet_threshold' => 'required|numeric|min:0.20|max:0.60',
            'liveness_strategy' => 'required|string|in:S1,S2,S3',
            'ear_threshold' => 'required|numeric|min:0.15|max:0.25',
            'mar_threshold' => 'required|numeric|min:0.06|max:0.20',
            'reason' => 'nullable|string|max:500',
        ]);

        $settings = [
            'facenet_threshold' => (float) $validated['facenet_threshold'],
            'liveness_strategy' => $validated['liveness_strategy'],
            'ear_threshold' => (float) $validated['ear_threshold'],
            'mar_threshold' => (float) $validated['mar_threshold'],
            'stability_threshold' => 80.0,
            'scan_duration_sec' => 8,
            'distance_cm' => 30,
        ];

        $dir = dirname(self::$configPath);
        if (!File::isDirectory($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        File::put(self::$configPath, json_encode($settings, JSON_PRETTY_PRINT));

        if (function_exists('activity')) {
            activity('model_settings')
                ->causedBy($user)
                ->withProperties([
                    'settings' => $settings,
                    'reason' => $validated['reason'] ?? 'Penyesuaian parameter riset',
                ])
                ->log("Pembaruan parameter model biometrik: L2={$settings['facenet_threshold']}, Strategi={$settings['liveness_strategy']}, EAR={$settings['ear_threshold']}, MAR={$settings['mar_threshold']}");
        }

        return redirect()->back()->with('success', 'Konfigurasi model biometrik FaceNet & EMAR berhasil diperbarui.');
    }

    /**
     * Reset parameter ke standar default Bab 3 Skripsi.
     */
    public function reset(Request $request)
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['admin', 'researcher'])) {
            abort(403, 'Akses ditolak.');
        }

        $defaultSettings = [
            'facenet_threshold' => 0.40,
            'liveness_strategy' => 'S2',
            'ear_threshold' => 0.20,
            'mar_threshold' => 0.10,
            'stability_threshold' => 80.0,
            'scan_duration_sec' => 8,
            'distance_cm' => 30,
        ];

        $dir = dirname(self::$configPath);
        if (!File::isDirectory($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        File::put(self::$configPath, json_encode($defaultSettings, JSON_PRETTY_PRINT));

        if (function_exists('activity')) {
            activity('model_settings')
                ->causedBy($user)
                ->withProperties(['reset_to_default' => true])
                ->log('Reset parameter model biometrik ke nilai default Bab 3 Skripsi (L2=0.40, S2, EAR=0.20, MAR=0.10)');
        }

        return redirect()->back()->with('success', 'Konfigurasi berhasil dikembalikan ke standar default Bab 3 Skripsi (L2: 0.40, S2, EAR: 0.20, MAR: 0.10).');
    }
}
