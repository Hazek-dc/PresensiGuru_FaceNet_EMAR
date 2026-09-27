<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\File;

class SettingsController extends Controller
{
    private $configPath;

    public function __construct()
    {
        // Simple file-based config for research parameters
        $this->configPath = storage_path('app/research_settings.json');
    }

    public function index(Request $request)
    {
        if ($request->user()->role !== 'researcher') {
            abort(403, 'Akses ditolak. Pengaturan ini hanya untuk peneliti.');
        }

        $settings = $this->getSettings();

        return Inertia::render('Admin/Settings', [
            'settings' => $settings,
        ]);
    }

    public function update(Request $request)
    {
        if ($request->user()->role !== 'researcher') {
            abort(403, 'Akses ditolak.');
        }

        $validated = $request->validate([
            'facenet_threshold' => 'required|numeric|min:0|max:2',
            'emar_threshold' => 'required|numeric|min:0|max:1',
            'reason' => 'required|string|min:10',
        ]);

        $this->saveSettings([
            'facenet_threshold' => (float) $validated['facenet_threshold'],
            'emar_threshold' => (float) $validated['emar_threshold'],
        ]);

        activity()
            ->causedBy($request->user())
            ->withProperties([
                'reason' => $validated['reason'],
                'new_facenet' => $validated['facenet_threshold'],
                'new_emar' => $validated['emar_threshold']
            ])
            ->log('updated_research_settings');

        return redirect()->back()->with('success', 'Pengaturan penelitian berhasil diperbarui.');
    }

    private function getSettings()
    {
        if (!File::exists($this->configPath)) {
            return [
                'facenet_threshold' => (float) config('biometrics.facenet_threshold', 0.40),
                'emar_threshold' => 0.5,
            ];
        }

        return json_decode(File::get($this->configPath), true);
    }

    private function saveSettings(array $settings)
    {
        File::put($this->configPath, json_encode($settings, JSON_PRETTY_PRINT));
    }
}
