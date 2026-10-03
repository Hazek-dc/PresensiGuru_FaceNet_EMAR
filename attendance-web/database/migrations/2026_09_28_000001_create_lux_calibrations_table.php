<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kalibrasi kamera terhadap luxmeter: log10(lux) = a + b * log10(luma / 255).
 * Kolom engine_* null bila mesin biometrik tidak mengukur semua titik; lux
 * presensi lalu tidak diambil dari mesin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lux_calibrations', function (Blueprint $table) {
            $table->id();
            $table->string('camera_label')->nullable();
            $table->unsignedInteger('resolution_w');
            $table->unsignedInteger('resolution_h');
            $table->boolean('exposure_locked')->default(false);
            $table->double('exposure_time')->nullable();
            $table->double('browser_a');
            $table->double('browser_b');
            $table->double('browser_max_rel_error');
            $table->double('engine_a')->nullable();
            $table->double('engine_b')->nullable();
            $table->double('engine_max_rel_error')->nullable();
            $table->json('points');
            $table->boolean('is_active')->default(false)->index();
            $table->foreignId('calibrated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lux_calibrations');
    }
};
