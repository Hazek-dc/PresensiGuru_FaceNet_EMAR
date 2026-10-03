<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Satu baris per presentasi, termasuk yang jaraknya tidak terukur (distance_cm
 * null, distance_source 'none'). Jarak hanya dicatat, tidak ikut keputusan.
 * Menghapus catatan presensi tidak menghapus baris ini, sama seperti
 * evaluation_matrices.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('distance_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_record_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('camera_device')->nullable();
            $table->string('camera_resolution', 32)->nullable();
            $table->double('distance_cm')->nullable();
            $table->string('distance_category', 16)->nullable();
            $table->string('distance_source', 32)->default('none');
            $table->double('browser_distance_cm')->nullable();
            $table->double('engine_distance_cm')->nullable();
            $table->double('engine_face_width_ratio')->nullable();
            $table->double('distance_mismatch_cm')->nullable();
            $table->foreignId('calibration_id')->nullable()->constrained('distance_calibrations')->nullOnDelete();
            $table->double('facenet_distance')->nullable();
            $table->double('emar_score')->nullable();
            $table->string('decision', 16);
            $table->timestamps();

            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distance_logs');
    }
};
