<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * D10: kestabilan wajah, durasi, dan jumlah siklus yang tidak diukur harus
 * tersimpan NULL. Dengan NOT NULL DEFAULT 100/8,0/0, presentasi tanpa pengukuran
 * tercatat sebagai 100 % wajah stabil, 8,0 s, dan 0 kedip.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('evaluation_matrices', function (Blueprint $table) {
            $table->float('scan_duration_sec')->nullable()->default(null)->change();
            $table->float('face_detected_pct')->nullable()->default(null)->change();
            $table->integer('ear_blink_count')->nullable()->default(null)->change();
            $table->integer('mar_mouth_count')->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
        Schema::table('evaluation_matrices', function (Blueprint $table) {
            $table->float('scan_duration_sec')->nullable(false)->default(8.0)->change();
            $table->float('face_detected_pct')->nullable(false)->default(100.0)->change();
            $table->integer('ear_blink_count')->nullable(false)->default(0)->change();
            $table->integer('mar_mouth_count')->nullable(false)->default(0)->change();
        });
    }
};
