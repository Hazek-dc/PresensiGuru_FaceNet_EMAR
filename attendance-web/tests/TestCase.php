<?php

namespace Tests;

use Illuminate\Filesystem\Filesystem;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /** Folder sementara per tes untuk berkas riset dan telemetry. */
    protected string $researchSandbox;

    protected function setUp(): void
    {
        parent::setUp();

        // Tes tidak boleh menyentuh dataset riset asli di luar folder aplikasi:
        // dulu setiap run tes menambah baris ke Matriks_Evaluasi_Bab4.csv dan
        // Dataset_Eksperimen_Bab5.csv.
        $this->researchSandbox = sys_get_temp_dir() . DIRECTORY_SEPARATOR
            . 'presensi_tes_' . bin2hex(random_bytes(6));
        mkdir($this->researchSandbox, 0777, true);

        config([
            'biometrics.research_csv.matriks' => $this->researchSandbox . DIRECTORY_SEPARATOR . 'Matriks_Evaluasi_Bab4.csv',
            'biometrics.research_csv.bab5' => $this->researchSandbox . DIRECTORY_SEPARATOR . 'Dataset_Eksperimen_Bab5.csv',
            'biometrics.telemetry_db' => $this->researchSandbox . DIRECTORY_SEPARATOR . 'telemetry.db',
        ]);

        // Controller lux, jarak, dan pengaturan model menulis ke storage_path('app/...').
        // Tanpa ini, tes menimpa bacaan sensor (mis. 750 lux) dan ambang kiosk yang
        // sedang dipakai, lalu halaman presensi mengirimnya sebagai pengukuran.
        $storage = $this->researchSandbox . DIRECTORY_SEPARATOR . 'storage';
        mkdir($storage . DIRECTORY_SEPARATOR . 'app', 0777, true);
        $this->app->useStoragePath($storage);

        // Enrollment guru menyalin foto ke dataset/foto_selfie dan admin dataset
        // menulis/menghapus di dataset/self_qalwani. Dulu tes meninggalkan foto
        // hitam "1 - Qalwani Anugerah.jpg" dan menimpa manifest riset sementara.
        $project = $this->researchSandbox . DIRECTORY_SEPARATOR . 'project';
        mkdir($project, 0777, true);
        config(['biometrics.project_root' => $project]);
    }

    protected function tearDown(): void
    {
        if (isset($this->researchSandbox) && is_dir($this->researchSandbox)) {
            (new Filesystem)->deleteDirectory($this->researchSandbox);
        }

        parent::tearDown();
    }
}
