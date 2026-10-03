<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kalibrasi jarak kamera (d = a / r + b) dari titik 30/45/60 cm yang diukur
 * meteran. Kolom engine_* null bila mesin biometrik tidak dapat mengukur
 * ketiga titik; jarak presensi lalu tidak diambil dari mesin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('distance_calibrations', function (Blueprint $table) {
            $table->id();
            $table->string('camera_label')->nullable();
            $table->unsignedInteger('resolution_w');
            $table->unsignedInteger('resolution_h');
            $table->double('browser_a');
            $table->double('browser_b');
            $table->double('browser_max_residual_cm');
            $table->double('engine_a')->nullable();
            $table->double('engine_b')->nullable();
            $table->double('engine_max_residual_cm')->nullable();
            $table->json('points');
            $table->boolean('is_active')->default(false)->index();
            $table->foreignId('calibrated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distance_calibrations');
    }
};
