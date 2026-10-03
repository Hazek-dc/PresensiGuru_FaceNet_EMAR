<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Jabatan di sekolah (guru / staff TU) dan bidang studi yang diajar.
 * Keduanya boleh kosong: data guru yang sudah ada diisi admin, tidak ditebak.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'position')) {
                $table->string('position', 20)->nullable()->after('role');
            }
            if (! Schema::hasColumn('users', 'subjects')) {
                $table->json('subjects')->nullable()->after('position');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'subjects')) {
                $table->dropColumn('subjects');
            }
            if (Schema::hasColumn('users', 'position')) {
                $table->dropColumn('position');
            }
        });
    }
};
