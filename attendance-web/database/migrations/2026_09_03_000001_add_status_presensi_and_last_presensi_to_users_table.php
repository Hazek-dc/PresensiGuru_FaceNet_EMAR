<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'status_presensi')) {
                $table->string('status_presensi')->nullable()->after('is_active');
            }
            if (!Schema::hasColumn('users', 'last_presensi_at')) {
                $table->timestamp('last_presensi_at')->nullable()->after('status_presensi');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'status_presensi')) {
                $table->dropColumn('status_presensi');
            }
            if (Schema::hasColumn('users', 'last_presensi_at')) {
                $table->dropColumn('last_presensi_at');
            }
        });
    }
};
