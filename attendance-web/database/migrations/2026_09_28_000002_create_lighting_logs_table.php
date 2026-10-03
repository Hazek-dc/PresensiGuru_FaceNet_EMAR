<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Satu baris per presentasi (PRD Lux Lighting Control bagian 13), termasuk yang
 * lux-nya tidak terukur (lux_value null, lux_source 'none'). Pencahayaan hanya
 * dicatat, tidak ikut keputusan. Menghapus catatan presensi tidak menghapus
 * baris ini.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lighting_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_record_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('camera_device')->nullable();
            $table->double('lux_value')->nullable();
            $table->string('lighting_category', 16)->nullable();
            $table->string('lighting_status', 16)->nullable();
            $table->string('lux_category_naskah', 16)->nullable();
            $table->string('lux_source', 32)->default('none');
            $table->double('luxmeter_lux')->nullable();
            $table->double('browser_lux')->nullable();
            $table->double('engine_lux')->nullable();
            $table->double('engine_luma')->nullable();
            $table->boolean('exposure_locked')->nullable();
            $table->foreignId('calibration_id')->nullable()->constrained('lux_calibrations')->nullOnDelete();
            $table->string('decision', 16);
            $table->timestamps();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lighting_logs');
    }
};
