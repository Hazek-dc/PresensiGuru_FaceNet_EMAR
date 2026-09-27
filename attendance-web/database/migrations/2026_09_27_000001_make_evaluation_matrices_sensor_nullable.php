<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Jarak dan lux yang tidak diukur harus tersimpan NULL. Dengan NOT NULL
 * DEFAULT 30/300, presentasi tanpa pengukuran tercatat sebagai 30 cm / 300 lux
 * dan ikut terhitung di dasbor serta ekspor riset.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('evaluation_matrices', function (Blueprint $table) {
            $table->integer('distance_cm')->nullable()->default(null)->change();
            $table->integer('lux_value')->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
        Schema::table('evaluation_matrices', function (Blueprint $table) {
            $table->integer('distance_cm')->nullable(false)->default(30)->change();
            $table->integer('lux_value')->nullable(false)->default(300)->change();
        });
    }
};
